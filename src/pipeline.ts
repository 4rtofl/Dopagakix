import { existsSync } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { type BgmSetting, type BgmTrack, bgmGain, bgmLayer } from "./audio/bgm.js";
import { finishAudio } from "./audio/finish.js";
import { normalizeConversationScript } from "./conversation/normalize.js";
import {
  CONVERSATION_VERSION,
  type ConversationFacts,
  type ConversationFile,
  ConversationFileSchema,
  type ConversationScript,
  isConversationFile,
} from "./conversation/schema.js";
import { type SfxSet, type SfxSetting, sfxCues, sfxGain, sfxLayers } from "./audio/sfx.js";
import type { SessionFacts } from "./facts.js";
import { isOutputPath } from "./output.js";
import { redactSecrets } from "./redact.js";
import { normalizeScript } from "./script/normalize.js";
import {
  type CheckedReadings,
  checkedReadingsFile,
  compareReadings,
  conversationSceneLines,
  loadCheckedReadings,
  mismatchMessage,
  type Readings,
  reviewReasons,
  type SpeechUnit,
  speechUnits,
} from "./script/readings.js";
import { type Author, type ScriptFile, ScriptFileSchema, type VideoScript, VideoScriptSchema } from "./script/schema.js";
import { SilentSynthesizer } from "./tts/silent.js";
import { withVoicevoxStart } from "./tts/start.js";
import type { Synthesizer } from "./tts/types.js";
import { type SpokenText, VoicevoxSynthesizer } from "./tts/voicevox.js";
import { encodeWav, peakDbfs } from "./tts/wav.js";
import { buildDigest, collectFacts } from "./transcript/digest.js";
import { type LocatedTranscript, type LocateOptions, locateTranscript } from "./transcript/locate.js";
import { readTranscript } from "./transcript/parse.js";
import type { ParsedSession } from "./transcript/types.js";
import { resolveUserPath } from "./util/path.js";
import { type RenderStats, renderVideo } from "./video/render.js";
import { buildHtml } from "./video/template.js";
import { buildConversationHtml } from "./video/conversation.js";
import { buildSceneTimeline, type SceneLines, sceneLines, type Timeline } from "./video/timeline.js";

export { DEFAULT_OUT_DIR } from "./output.js";

/**
 * 報告のために書いたファイル(台本など)を、作業の成果として数えないよう集計から除く。
 * 既定の出力先(dopagakix-out)の中と、指定したディレクトリの中にあるファイルが対象。
 */
export function excludeOutputs(facts: SessionFacts, dirs: string[] = []): SessionFacts {
  const base = facts.cwd ?? process.cwd();
  const files = facts.files.filter((file) => !isOutputPath(file.path, base, dirs));
  return files.length === facts.files.length ? facts : { ...facts, files };
}

export interface LoadedSession extends LocatedTranscript {
  session: ParsedSession;
  facts: SessionFacts;
  /** セッション ID(ログに記録がなければファイル名) */
  sessionId: string;
}

/**
 * セッションログを探して読み、画面に出す数値を集計する。動画レポートを作っていた区間は集計から除く。
 * outputDirs には、報告の台本などを置くディレクトリを渡す(変更ファイルの集計から除き、
 * そこのファイルの編集を動画の作成とみなす)。
 */
export async function loadSession(options: LocateOptions, outputDirs: string[] = []): Promise<LoadedSession> {
  const located = await locateTranscript(options);
  const session = await readTranscript(located.file);
  const sessionId = session.sessionId ?? path.basename(located.file, ".jsonl");
  return { ...located, session, facts: excludeOutputs(collectFacts(session, { outputDirs }), outputDirs), sessionId };
}

export interface DigestResult {
  file: string;
  facts: SessionFacts;
  /** 秘匿情報をマスク済みのダイジェスト */
  digest: string;
  level: number;
  omittedLines: number;
  redactions: number;
}

/** セッションログを、振り返り用のダイジェスト(時系列の要約)にする。 */
export async function digestSession(
  options: LocateOptions & { maxDigestChars: number; timeZone?: string },
): Promise<DigestResult> {
  const { file, session, facts } = await loadSession(options);
  const digest = buildDigest(session, facts, { maxChars: options.maxDigestChars, timeZone: options.timeZone });
  const redacted = redactSecrets(digest.text);
  return {
    file,
    facts,
    digest: redacted.text,
    level: digest.level,
    omittedLines: digest.omittedLines,
    redactions: redacted.count,
  };
}

export interface LoadedReport {
  /** 書かれたままの台本(確認に使う) */
  raw: VideoScript;
  /** 表示用に整えた台本 */
  script: VideoScript;
  author: Author;
  /** script.json(描画したときの記録)から読んだ場合の事実情報 */
  facts?: SessionFacts;
  persona?: { id: string; name: string };
  /** script.json に記録された、描画に使った読みの指定 */
  readings?: Readings;
  /** script.json に記録された BGM の設定 */
  bgm?: BgmSetting;
  /** script.json に記録された効果音の設定 */
  sfx?: SfxSetting;
}

function formatError(file: string, error: z.ZodError): Error {
  return new Error(`${file} の形式が正しくありません:\n${z.prettifyError(error)}`);
}

/**
 * 台本を読む。エージェントが書いた台本(report.json)と、描画したときに残す script.json の
 * どちらも受け付ける。後者には事実情報が入っているので、同じ内容で描画し直せる。
 */
export async function loadReport(file: string): Promise<LoadedReport> {
  let json: unknown;
  try {
    json = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    throw new Error(`${file} を JSON として読めません: ${(error as Error).message}`);
  }
  if (json !== null && typeof json === "object" && "version" in json) {
    const parsed = ScriptFileSchema.safeParse(json);
    if (!parsed.success) throw formatError(file, parsed.error);
    const { script, author, facts, persona, readings, bgm, sfx } = parsed.data;
    return { raw: script, script: normalizeScript(script), author, facts, persona, readings, bgm, sfx };
  }
  const parsed = VideoScriptSchema.safeParse(json);
  if (!parsed.success) throw formatError(file, parsed.error);
  return { raw: parsed.data, script: normalizeScript(parsed.data), author: "agent" };
}

/**
 * 環境変数 DOPAGAKIX_REQUIRE_VOICE=1 のときは、字幕のみ(--no-voice)を許さない。
 * 指示者が設定しておけば、エージェントが読み上げを省いた動画で済ませることを防げる。
 */
export function assertVoiceAllowed(voice: boolean | undefined, env: NodeJS.ProcessEnv = process.env): void {
  if (voice === false && env.DOPAGAKIX_REQUIRE_VOICE === "1") {
    throw new Error("DOPAGAKIX_REQUIRE_VOICE=1 が設定されているため、--no-voice(字幕のみ)では作れません。読み上げ付きで作ってください。");
  }
}

export interface SynthesizerOptions {
  voice: boolean;
  speaker: number;
  voicevoxUrl: string;
  /** クレジット表記の指定(省略時は話者から決める) */
  credit?: string;
  /** 読みの指定(VOICEVOX に送る文だけを置き換える) */
  readings?: Readings;
  /** 接続できないときに実行するエンジンの起動コマンド(環境変数 DOPAGAKIX_VOICEVOX_START) */
  startCommand?: string;
  /** 起動コマンドを実行する直前に呼ぶ(応答を待つ間の表示用) */
  onStart?: (command: string) => void;
  fetch?: typeof fetch;
}

/**
 * 読み上げに使う合成器を作る。読み上げありで VOICEVOX に接続できなければ、起動コマンドが設定されていれば
 * エンジンを起動してから続け、なければエラーにする(字幕のみには切り替えない)。
 */
export async function createSynthesizer(options: SynthesizerOptions): Promise<Synthesizer> {
  if (!options.voice) return new SilentSynthesizer();
  return withVoicevoxStart(
    () =>
      VoicevoxSynthesizer.create({
        baseUrl: options.voicevoxUrl,
        speaker: options.speaker,
        credit: options.credit,
        readings: options.readings,
        fetch: options.fetch,
      }),
    { command: options.startCommand, baseUrl: options.voicevoxUrl, onStart: options.onStart, fetch: options.fetch },
  );
}

/** 読み上げ文 1 文分の読みの確認結果 */
export interface InspectedSentence extends SpeechUnit, SpokenText {
  /** 読みを確かめてほしい理由(誤読の候補)。なければ空 */
  reasons: string[];
}

/** 台本の全ての読み上げ文を、描画と同じ単位で VOICEVOX に通し、読みを調べる */
export async function inspectReadings(script: VideoScript, synth: VoicevoxSynthesizer): Promise<InspectedSentence[]> {
  return inspectUnits(speechUnits(script), synth);
}

/** 読み上げる単位(speechUnits・conversationSpeechUnits)ごとに VOICEVOX に通し、読みを調べる */
export async function inspectUnits(units: SpeechUnit[], synth: VoicevoxSynthesizer): Promise<InspectedSentence[]> {
  const inspected: InspectedSentence[] = [];
  for (const unit of units) {
    const spoken = await synth.inspect(unit.text);
    inspected.push({ ...unit, ...spoken, reasons: reviewReasons(spoken.sent, spoken.kana) });
  }
  return inspected;
}

/** check が確かめた読みを、台本と同じ場所の checked-readings.json に保存する */
export async function saveCheckedReadings(
  report: string,
  inspected: InspectedSentence[],
  engine: CheckedReadings["engine"],
): Promise<string> {
  const record: CheckedReadings = {
    version: 1,
    checkedAt: new Date().toISOString(),
    engine,
    sentences: inspected.map(({ at, text, sent, reading }) => ({ at, text, sent, reading })),
  };
  const file = checkedReadingsFile(report);
  await writeFile(file, `${JSON.stringify(record, null, 2)}\n`);
  return file;
}

/**
 * 描画の前に、全ての読み上げ文の読みが check で確かめた読みと一致するかを照らし合わせる。
 * 確認していない文や読みが違う文があればエラーにする。照らし合わせたクエリで音声を作るので、
 * 動画の読みは check で表示した読みと必ず一致する。
 */
export async function verifyReadings(report: string, script: VideoScript, synth: VoicevoxSynthesizer): Promise<number> {
  return verifyUnits(report, speechUnits(script), synth);
}

/** verifyReadings と同じ照らし合わせを、読み上げる単位を渡して行う */
export async function verifyUnits(report: string, units: SpeechUnit[], synth: VoicevoxSynthesizer): Promise<number> {
  const file = checkedReadingsFile(report);
  const checked = await loadCheckedReadings(file);
  if (!checked) throw new Error(mismatchMessage([], file, false));
  const inspected = await inspectUnits(units, synth);
  const mismatches = compareReadings(inspected, checked);
  if (mismatches.length > 0) throw new Error(mismatchMessage(mismatches, file, true));
  return inspected.length;
}

/** 出力先を作り、中身を git の管理対象から外す(pytest のキャッシュと同じく、.gitignore に * を書く)。 */
export async function prepareOutputRoot(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  const ignore = path.join(dir, ".gitignore");
  if (!existsSync(ignore)) await writeFile(ignore, "# dopagakix が作成。動画と作業ファイルを git の管理対象から外す\n*\n");
}

/** 保存先に置く動画の名前に使うタイトルの文字数。ファイル名の上限(多くのファイルシステムで 255 バイト)に収める */
const TITLE_CHARS_IN_FILE_NAME = 40;

export interface RenderPathOptions {
  /** 台本のパス */
  report: string;
  /** 台本のタイトル(保存先に置く動画の名前に使う) */
  title: string;
  /** 動画の出力先(-o)。作業ファイルも同じ場所に置く */
  out?: string;
  /** 完成した動画だけを置くフォルダ */
  videoDir?: string;
  /** 作業ファイルを置くフォルダ(-o や保存先の指定より優先する) */
  workDir?: string;
}

/**
 * 動画と作業ファイル(narration.wav・timeline.json・script.json)の置き場所を決める。
 * -o を最優先し、保存先の指定があれば動画だけを「台本のフォルダ名-タイトル.mp4」としてそこに置く。
 * 作業フォルダーの指定(--work-dir)があれば、作業ファイルはそこに置く(動画の名前のフォルダ名は作業フォルダーの名前)。
 */
export function resolveRenderPaths(options: RenderPathOptions): { outFile: string; workDir: string } {
  const explicitWorkDir = options.workDir ? resolveUserPath(options.workDir) : undefined;
  if (options.out) {
    const outFile = path.resolve(options.out);
    return { outFile, workDir: explicitWorkDir ?? path.dirname(outFile) };
  }
  const workDir = explicitWorkDir ?? path.dirname(path.resolve(options.report));
  if (!options.videoDir) return { outFile: path.join(workDir, "summary.mp4"), workDir };

  const videoDir = resolveUserPath(options.videoDir);
  const title = Array.from(options.title.replace(/[\\/:*?"<>|\p{Cc}]/gu, "_"))
    .slice(0, TITLE_CHARS_IN_FILE_NAME)
    .join("")
    .trim();
  const name = [path.basename(workDir), title].filter(Boolean).join("-");
  return { outFile: path.join(videoDir, `${name}.mp4`), workDir };
}

export interface RenderInput {
  script: VideoScript;
  facts: SessionFacts;
  author: Author;
  persona?: { id: string; name: string };
  /** 描画に使う読みの指定(script.json に記録し、描画し直しても同じ読みにする) */
  readings?: Readings;
  /** BGM(probeBgm で確かめたもの)。なければ BGM なし */
  bgm?: BgmTrack;
  /** 効果音(probeSfx で確かめたもの)。なければ効果音なし */
  sfx?: SfxSet;
}

export interface RenderPipelineOptions {
  outFile: string;
  /** narration.wav・timeline.json・script.json を置く場所 */
  workDir: string;
  synth: Synthesizer;
  speed: number;
  maxSpeed: number;
  maxSeconds: number;
  fps: number;
  /** 1 で 1080x1920。テストでは小さくして時間を短縮する */
  scale?: number;
  chromiumPath?: string;
  timeZone?: string;
  onSpeechProgress?: (done: number, total: number) => void;
  onFrameProgress?: (done: number, total: number) => void;
}

export interface RenderResult {
  outFile: string;
  /** 描画に使った台本と事実情報の記録 */
  scriptFile: string;
  /** 仕上げた音声(BGM と効果音を混ぜ、音量をそろえたもの) */
  audioFile: string;
  duration: number;
  speed: number;
  credit: string | undefined;
  stats: RenderStats;
}

/** 読み上げありで、最大音量がこれを下回ったら無音とみなす(CI の確認と同じ基準) */
export const SILENT_DBFS = -40;

/** script.json と timeline.json に記録する BGM の設定 */
function bgmRecord(bgm: BgmTrack): BgmSetting {
  return { file: bgm.file, ...(bgm.credit ? { credit: bgm.credit } : {}), volume: bgm.volume };
}

/** script.json と timeline.json に記録する効果音の設定 */
function sfxRecord(sfx: SfxSet): SfxSetting {
  return { dir: sfx.dir, ...(sfx.credit ? { credit: sfx.credit } : {}), volume: sfx.volume };
}

/** 読み上げ音声を合成してシーンと字幕の時刻を決め、作業フォルダーに narration.wav を書く。音声がほぼ無音ならエラーにする */
async function narrate(scenes: SceneLines[], options: RenderPipelineOptions): Promise<{ timeline: Timeline; narrationFile: string }> {
  const { voice } = options.synth;
  const timeline = await buildSceneTimeline(scenes, options.synth, {
    maxSeconds: options.maxSeconds,
    speed: options.speed,
    maxSpeed: options.maxSpeed,
    onProgress: options.onSpeechProgress,
  });
  if (voice) {
    const peak = peakDbfs(timeline.audio);
    if (peak < SILENT_DBFS) {
      const level = Number.isFinite(peak) ? `最大音量 ${peak.toFixed(1)} dBFS` : "完全な無音";
      throw new Error(
        `読み上げの音声がほぼ無音です(${level}。${SILENT_DBFS} dBFS 未満)。VOICEVOX エンジン(${voice.name}、スタイル ID ${voice.speaker})の状態を確かめてください。`,
      );
    }
  }
  const narrationFile = path.join(options.workDir, "narration.wav");
  await writeFile(narrationFile, encodeWav(timeline.audio));
  return { timeline, narrationFile };
}

/** 台本から音声と映像を作り、mp4 に書き出す。 */
export async function renderReport(input: RenderInput, options: RenderPipelineOptions): Promise<RenderResult> {
  const { voice } = options.synth;
  const record: ScriptFile = {
    version: 1,
    generatedAt: new Date().toISOString(),
    author: input.author,
    ...(input.persona ? { persona: input.persona } : {}),
    voice: voice ? { enabled: true, ...voice } : { enabled: false },
    ...(input.readings ? { readings: input.readings } : {}),
    ...(input.bgm ? { bgm: bgmRecord(input.bgm) } : {}),
    ...(input.sfx ? { sfx: sfxRecord(input.sfx) } : {}),
    facts: input.facts,
    script: input.script,
  };
  const scriptFile = path.join(options.workDir, "script.json");
  await writeFile(scriptFile, `${JSON.stringify(record, null, 2)}\n`);

  const { timeline, narrationFile } = await narrate(sceneLines(input.script), options);
  // 音声の仕上げ: BGM と効果音を混ぜ、動画ごとの音量をそろえる(どちらもなくても同じ処理をかける)
  const cues = input.sfx ? sfxCues(timeline.scenes, input.script) : [];
  const audio = await finishAudio({
    narrationFile,
    layers: [...(input.bgm ? [bgmLayer(input.bgm, timeline.duration)] : []), ...(input.sfx ? sfxLayers(input.sfx, cues) : [])],
    outFile: path.join(options.workDir, "audio.wav"),
  });
  const bgm = input.bgm
    ? { ...bgmRecord(input.bgm), loudness: input.bgm.loudness, gain: Math.round(bgmGain(input.bgm) * 100) / 100 }
    : null;
  const sfx = input.sfx
    ? {
        ...sfxRecord(input.sfx),
        sounds: input.sfx.sounds.map((sound) => ({
          ...sound,
          gain: Math.round(sfxGain(sound, input.sfx!.volume) * 100) / 100,
        })),
        cues,
      }
    : null;
  const loudness = {
    input: audio.inputLoudness,
    output: audio.outputLoudness ?? null,
    truePeak: audio.outputTruePeak ?? null,
    normalization: audio.normalization,
  };
  await writeFile(
    path.join(options.workDir, "timeline.json"),
    `${JSON.stringify(
      { duration: timeline.duration, speed: timeline.speed, credit: timeline.credit, bgm, sfx, loudness, scenes: timeline.scenes },
      (_key, value: unknown) => (typeof value === "number" && !Number.isFinite(value) ? null : value),
      2,
    )}\n`,
  );

  const html = buildHtml({
    script: input.script,
    facts: input.facts,
    scenes: timeline.scenes,
    credit: timeline.credit,
    bgmCredit: input.bgm?.credit,
    sfxCredit: input.sfx?.credit,
    silent: !voice,
    author: input.author,
    timeZone: options.timeZone,
  });
  const stats = await renderVideo(html, {
    outFile: options.outFile,
    audioFile: audio.outFile,
    duration: timeline.duration,
    fps: options.fps,
    scale: options.scale,
    chromiumPath: options.chromiumPath,
    onProgress: options.onFrameProgress,
  });
  return {
    outFile: options.outFile,
    scriptFile,
    audioFile: audio.outFile,
    duration: timeline.duration,
    speed: timeline.speed,
    credit: timeline.credit,
    stats,
  };
}

export interface LoadedConversation {
  /** 書かれたままの台本(確認に使う) */
  raw: ConversationScript;
  /** 表示用に整えた台本 */
  script: ConversationScript;
  facts: ConversationFacts;
  persona?: { id: string; name: string };
  /** script.json に記録された、描画に使った読みの指定 */
  readings?: Readings;
}

async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    throw new Error(`${file} を JSON として読めません: ${(error as Error).message}`);
  }
}

/** 台本のファイルが、会話の要約(kind: "conversation")か */
export async function isConversationInput(file: string): Promise<boolean> {
  return isConversationFile(await readJson(file));
}

/** 会話の要約のファイル(台本と数値。render が残した script.json も同じ形式)を読む */
export async function loadConversation(file: string): Promise<LoadedConversation> {
  const parsed = ConversationFileSchema.safeParse(await readJson(file));
  if (!parsed.success) throw formatError(file, parsed.error);
  const { script, facts, persona, readings } = parsed.data;
  return { raw: script, script: normalizeConversationScript(script), facts, persona, readings };
}

/** 会話の要約の動画の大きさの上限。Discord に添付できる大きさ(10MB) */
export const MAX_CONVERSATION_VIDEO_BYTES = 10 * 1024 * 1024;

/** 大きさの上限を超えた動画を移す先のファイル名(作業フォルダーに置く) */
export const OVERSIZE_VIDEO_FILE = "oversize.mp4";

/**
 * 動画が大きさの上限を超えていれば、出力先から作業フォルダーの oversize.mp4 に移し、エラーにする。
 * 出力先に動画を残さないのは、出力先のファイルをそのまま送る使い方(サンドボックス)で、送れない動画を取り出させないため。
 */
export async function assertVideoSize(outFile: string, workDir: string, maxBytes: number = MAX_CONVERSATION_VIDEO_BYTES): Promise<number> {
  const { size } = await stat(outFile);
  if (size <= maxBytes) return size;
  const moved = path.join(workDir, OVERSIZE_VIDEO_FILE);
  await rename(outFile, moved);
  const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
  throw new Error(`動画の大きさが ${mb(size)}MB あり、上限の ${mb(maxBytes)}MB を超えています。動画は出力先に置かず、${moved} に移しました。`);
}

export interface ConversationRenderInput {
  /** 書かれたままの台本(表示用に整えて描画する。読み上げの単位は check と同じ) */
  raw: ConversationScript;
  facts: ConversationFacts;
  persona?: { id: string; name: string };
  readings?: Readings;
}

/** 会話の要約の台本から音声と映像を作り、mp4 に書き出す。BGM と効果音は使わない */
export async function renderConversation(input: ConversationRenderInput, options: RenderPipelineOptions): Promise<RenderResult> {
  const { voice } = options.synth;
  const script = normalizeConversationScript(input.raw);
  const record: ConversationFile = {
    kind: "conversation",
    version: CONVERSATION_VERSION,
    generatedAt: new Date().toISOString(),
    ...(input.persona ? { persona: input.persona } : {}),
    voice: voice ? { enabled: true, ...voice } : { enabled: false },
    ...(input.readings ? { readings: input.readings } : {}),
    facts: input.facts,
    script: input.raw,
  };
  const scriptFile = path.join(options.workDir, "script.json");
  await writeFile(scriptFile, `${JSON.stringify(record, null, 2)}\n`);

  const { timeline, narrationFile } = await narrate(conversationSceneLines(input.raw), options);
  const audio = await finishAudio({ narrationFile, layers: [], outFile: path.join(options.workDir, "audio.wav") });
  const loudness = {
    input: audio.inputLoudness,
    output: audio.outputLoudness ?? null,
    truePeak: audio.outputTruePeak ?? null,
    normalization: audio.normalization,
  };
  await writeFile(
    path.join(options.workDir, "timeline.json"),
    `${JSON.stringify(
      { duration: timeline.duration, speed: timeline.speed, credit: timeline.credit, loudness, scenes: timeline.scenes },
      (_key, value: unknown) => (typeof value === "number" && !Number.isFinite(value) ? null : value),
      2,
    )}\n`,
  );

  const html = buildConversationHtml({
    script,
    facts: input.facts,
    scenes: timeline.scenes,
    credit: timeline.credit,
    silent: !voice,
    timeZone: options.timeZone,
  });
  const stats = await renderVideo(html, {
    outFile: options.outFile,
    audioFile: audio.outFile,
    duration: timeline.duration,
    fps: options.fps,
    scale: options.scale,
    chromiumPath: options.chromiumPath,
    onProgress: options.onFrameProgress,
  });
  await assertVideoSize(options.outFile, options.workDir);
  return {
    outFile: options.outFile,
    scriptFile,
    audioFile: audio.outFile,
    duration: timeline.duration,
    speed: timeline.speed,
    credit: timeline.credit,
    stats,
  };
}
