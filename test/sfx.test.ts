import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { finishAudio } from "../src/audio/finish.js";
import {
  describeSfx,
  matchSfxFiles,
  parseMaxVolume,
  probeSfx,
  resolveSfx,
  SFX_PEAK,
  type SfxCue,
  sfxCues,
  sfxFilter,
  sfxGain,
  sfxLayers,
} from "../src/audio/sfx.js";
import type { SessionFacts } from "../src/facts.js";
import { loadReport, renderReport } from "../src/pipeline.js";
import { VideoScriptSchema, type VideoScript } from "../src/script/schema.js";
import type { Synthesizer } from "../src/tts/types.js";
import { VoicevoxSynthesizer } from "../src/tts/voicevox.js";
import { encodeWav, type Pcm } from "../src/tts/wav.js";
import { buildHtml, endMarkDelay, RESULT_ROW_DELAY } from "../src/video/template.js";
import { buildTimeline, type TimedScene } from "../src/video/timeline.js";
import { loudnessOf, makeSine } from "./audio.js";
import { canRender, hasFfmpeg, voicevoxAvailable, voicevoxUrl } from "./support.js";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const loadScript = async () => VideoScriptSchema.parse(JSON.parse(await readFile(path.join(fixtures, "script.json"), "utf8")));

/** 読み上げの代わりに、文の長さに比例した 300 Hz の音を返す(効果音の帯域と重ならない) */
class ToneSynthesizer implements Synthesizer {
  readonly credit = "VOICEVOX:テスト";
  async synthesize(text: string): Promise<Pcm> {
    const sampleRate = 24_000;
    const frames = Math.round((0.6 + text.length * 0.04) * sampleRate);
    const samples = new Int16Array(frames);
    // 端で音が急に変わると広い帯域に雑音が出るため、10 ミリ秒でフェードする
    const fade = sampleRate / 100;
    for (let i = 0; i < frames; i++) {
      const envelope = Math.min(1, i / fade, (frames - 1 - i) / fade);
      samples[i] = Math.round(Math.sin((2 * Math.PI * 300 * i) / sampleRate) * 12_000 * envelope);
    }
    return { sampleRate, channels: 1, samples };
  }
}

const ffmpeg = process.env.FFMPEG_PATH ?? "ffmpeg";
const BAND_RATE = 16_000;

/** モノラルの標本。filter を渡せば、その帯域だけを取り出す */
function samplesOf(file: string, filter?: string): Float32Array {
  const raw = execFileSync(
    ffmpeg,
    [
      ...["-hide_banner", "-loglevel", "error", "-i", file, "-map", "0:a:0"],
      ...(filter ? ["-af", filter] : []),
      ...["-ac", "1", "-ar", String(BAND_RATE), "-f", "f32le", "-"],
    ],
    { maxBuffer: 256 * 1024 * 1024 },
  );
  return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
}

/** 効果音(2 kHz の合成音)の帯域だけを取り出したモノラルの標本 */
const sfxBand = (file: string) => samplesOf(file, "bandpass=f=2000:width_type=q:w=8,bandpass=f=2000:width_type=q:w=8");

/** start〜end 秒の RMS(dB) */
function rmsDb(samples: Float32Array, start: number, end: number): number {
  const from = Math.max(0, Math.round(start * BAND_RATE));
  const to = Math.min(samples.length, Math.round(end * BAND_RATE));
  let sum = 0;
  for (let i = from; i < to; i++) sum += samples[i]! ** 2;
  return 10 * Math.log10(sum / Math.max(1, to - from) + 1e-20);
}

/** start〜end 秒の最大振幅(dB) */
function peakDb(samples: Float32Array, start: number, end: number): number {
  let peak = 0;
  for (let i = Math.max(0, Math.round(start * BAND_RATE)); i < Math.min(samples.length, Math.round(end * BAND_RATE)); i++) {
    peak = Math.max(peak, Math.abs(samples[i]!));
  }
  return 20 * Math.log10(peak + 1e-10);
}

/** 効果音の帯域で、音が出始めた時刻(しきい値を超えた最初の時刻) */
function onsetAfter(samples: Float32Array, from: number, thresholdDb: number): number | undefined {
  const threshold = 10 ** (thresholdDb / 20);
  for (let i = Math.round(from * BAND_RATE); i < samples.length; i++) {
    if (Math.abs(samples[i]!) > threshold) return i / BAND_RATE;
  }
  return undefined;
}

/** 読み上げの区間(字幕の時刻) */
const speechRanges = (scenes: TimedScene[]): Array<[number, number]> => scenes.flatMap((s) => s.cues.map((c) => [c.start, c.end]));

describe("効果音の設定", () => {
  const recorded = { dir: "/sfx/recorded", credit: "効果音：記録", volume: -3 };

  it("オプション > 環境変数 > script.json の順に使う", () => {
    const env = { DOPAGAKIX_SFX_DIR: "/sfx/env", DOPAGAKIX_SFX_CREDIT: "効果音：環境", DOPAGAKIX_SFX_VOLUME: "-6" };
    expect(resolveSfx({ sfxDir: "/sfx/option", sfxCredit: "効果音：オプション", sfxVolume: 2 }, env, recorded)).toEqual({
      dir: "/sfx/option",
      credit: "効果音：オプション",
      volume: 2,
    });
    expect(resolveSfx({}, env, recorded)).toEqual({ dir: "/sfx/env", credit: "効果音：環境", volume: -6 });
    expect(resolveSfx({}, {}, recorded)).toEqual(recorded);
    expect(resolveSfx({}, {})).toBeUndefined();
  });

  it("別のディレクトリを指定したときは、記録のクレジットと音量を引き継がない", () => {
    expect(resolveSfx({ sfxDir: "/sfx/other" }, {}, recorded)).toEqual({ dir: "/sfx/other", volume: 0 });
  });

  it("--no-sfx なら、環境変数や記録があっても効果音なし", () => {
    expect(resolveSfx({ sfx: false }, { DOPAGAKIX_SFX_DIR: "/sfx/env" }, recorded)).toBeUndefined();
  });

  it("相対パスと ~ を絶対パスにし、音量の環境変数が数値でなければエラーにする", () => {
    expect(resolveSfx({ sfxDir: "~/sfx" }, {})?.dir).toBe(path.join(os.homedir(), "sfx"));
    expect(resolveSfx({ sfxDir: "sfx" }, {})?.dir).toBe(path.resolve("sfx"));
    expect(() => resolveSfx({}, { DOPAGAKIX_SFX_DIR: "/sfx", DOPAGAKIX_SFX_VOLUME: "大きめ" })).toThrow(/DOPAGAKIX_SFX_VOLUME/);
  });
});

describe("効果音のファイルの解決", () => {
  it("場面ごとの名前(page / result / end)のファイルを、拡張子と大文字・小文字によらず探す", () => {
    expect(matchSfxFiles("/sfx", ["page.mp3", "END.wav", "readme.txt", "result", ".page.mp3", "pages.mp3"])).toEqual({
      page: "/sfx/page.mp3",
      end: "/sfx/END.wav",
    });
  });

  it("同じ場面のファイルが複数あればエラーにする", () => {
    expect(() => matchSfxFiles("/sfx", ["page.mp3", "page.wav"])).toThrow(/「ページの切り替え」\(page\.\*\)のファイルが複数あります: page\.mp3、page\.wav/);
  });

  describe("ディレクトリの確認", () => {
    let dir: string;
    beforeAll(async () => {
      dir = await mkdtemp(path.join(os.tmpdir(), "dopagakix-sfx-"));
    });
    afterAll(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    it("ディレクトリが無い・ファイルである・場面のファイルが無いときは、直し方を添えてエラーにする", async () => {
      await expect(probeSfx({ dir: path.join(dir, "none"), volume: 0 })).rejects.toThrow(/効果音のディレクトリが見つかりません.*\n.*--no-sfx/);
      await writeFile(path.join(dir, "file.txt"), "x");
      await expect(probeSfx({ dir: path.join(dir, "file.txt"), volume: 0 })).rejects.toThrow(/効果音のディレクトリではありません/);
      await mkdir(path.join(dir, "empty"));
      await expect(probeSfx({ dir: path.join(dir, "empty"), volume: 0 })).rejects.toThrow(/page\.\* \/ result\.\* \/ end\.\*\)がありません/);
    });

    it.runIf(hasFfmpeg)("音声として読めないファイルはエラーにし、読めるものは最大音量と長さを測る", async () => {
      const broken = path.join(dir, "broken");
      await mkdir(broken);
      await writeFile(path.join(broken, "page.mp3"), "これは音声ではない");
      await expect(probeSfx({ dir: broken, volume: 0 })).rejects.toThrow(/効果音のファイルを音声として読めません: .*page\.mp3/);

      const good = path.join(dir, "good");
      await mkdir(good);
      makeSine(path.join(good, "result.wav"), { frequency: 2000, seconds: 0.2 });
      const set = await probeSfx({ dir: good, volume: 0 });
      expect(set.sounds).toHaveLength(1);
      expect(set.sounds[0]).toMatchObject({ kind: "result", file: path.join(good, "result.wav") });
      // ffmpeg の sine の振幅は 1/8(-18.1 dBFS)
      expect(set.sounds[0]!.peak).toBeCloseTo(-18.1, 0);
      expect(set.sounds[0]!.duration).toBeCloseTo(0.2, 2);
    });
  });

  it("volumedetect の最大音量を読む", () => {
    expect(parseMaxVolume("[Parsed_volumedetect_0 @ 0x1] mean_volume: -21.1 dB\n[Parsed_volumedetect_0 @ 0x1] max_volume: -18.1 dB")).toBe(-18.1);
    expect(parseMaxVolume("max_volume: -inf dB")).toBe(-Infinity);
    expect(parseMaxVolume("")).toBeUndefined();
  });

  it("環境の表示に、場面ごとのファイルと長さ、音量、クレジットを出す", () => {
    const text = describeSfx({
      dir: "/sfx",
      credit: "効果音：効果音ラボ",
      volume: -3,
      sounds: [
        { kind: "page", file: "/sfx/page.mp3", peak: -1, duration: 0.84 },
        { kind: "end", file: "/sfx/end.mp3", peak: -2 },
      ],
    });
    expect(text).toBe(
      "/sfx: ページの切り替え page.mp3(0.84 秒)、結論の表示なし、締め end.mp3(長さ不明)、音量 -3 dB。クレジット「効果音：効果音ラボ」",
    );
  });
});

describe("鳴らす時刻", () => {
  it("2 シーン目以降の開始、表紙の「結果」の行、最終ページの「以上」で鳴らし、読み上げの開始までに切る", async () => {
    const script = await loadScript();
    const timeline = await buildTimeline(script, new ToneSynthesizer(), { maxSeconds: 120, speed: 1, maxSpeed: 1.3 });
    const cues = sfxCues(timeline.scenes, script);
    const scenes = timeline.scenes;
    const speech = (scene: TimedScene) => scene.cues[0]!.start;

    expect(cues.filter((c) => c.kind === "page")).toEqual(scenes.slice(1).map((s) => ({ kind: "page", at: s.start, until: speech(s) })));
    expect(cues.find((c) => c.kind === "result")).toEqual({ kind: "result", at: RESULT_ROW_DELAY, until: speech(scenes[0]!) });
    const closing = scenes.at(-1)!;
    expect(cues.find((c) => c.kind === "end")).toEqual({
      kind: "end",
      at: Math.round((closing.start + endMarkDelay(script.next_steps.items.length)) * 1000) / 1000,
      until: speech(closing),
    });
    // どれも読み上げより前に鳴り始める
    for (const cue of cues) expect(cue.at).toBeLessThan(cue.until);
  });

  it("表紙の「結果」の行は約 0.2 秒後、「以上」は次のステップが最大 3 件でも 0.5 秒以内に現れる", () => {
    expect(RESULT_ROW_DELAY).toBeCloseTo(0.2, 5);
    expect(endMarkDelay(0)).toBeCloseTo(0.13, 5);
    expect(endMarkDelay(3)).toBeCloseTo(0.34, 5);
    expect(endMarkDelay(3)).toBeLessThan(0.5);
  });

  it("「結果」の行と「以上」の登場順は、ページの描き方(アニメーションの遅延)と一致する", async () => {
    const script = await loadScript();
    const timeline = await buildTimeline(script, new ToneSynthesizer(), { maxSeconds: 120, speed: 1, maxSpeed: 1.3 });
    const html = buildHtml({ script, facts, scenes: timeline.scenes, author: "agent" });
    expect(html).toContain("calc(var(--i, 0) * 0.07s + 0.06s)");
    expect(html).toMatch(/class="enter fact-row result" style="--i:2/);
    expect(html).toContain(`class="enter end-mark" style="--i:${script.next_steps.items.length + 1}"`);
  });
});

describe("フィルタグラフ", () => {
  it("最大音量を -12 dBFS にそろえて音量を足し、時刻に置き、読み上げの開始までにフェードアウトして切る", () => {
    expect(sfxGain({ peak: -3 }, 0)).toBe(SFX_PEAK + 3);
    expect(sfxGain({ peak: -3 }, -4)).toBe(-13);
    expect(sfxFilter({ peak: -3 }, 2, [{ at: 0.2, until: 0.5 }], { input: "1:a", output: "layer0" })).toBe(
      "[1:a]aresample=48000,aformat=channel_layouts=stereo,volume=-7dB," +
        "atrim=end=0.3,afade=t=out:st=0.25:d=0.05,adelay=delays=200:all=1[layer0]",
    );
  });

  it("同じ音を複数回鳴らすときは、分けてそれぞれの時刻に置き、正規化せずに混ぜる", () => {
    const filter = sfxFilter({ peak: -12 }, 0, [
      { at: 3.2, until: 3.7 },
      { at: 8.45, until: 8.95 },
    ], { input: "2:a", output: "layer1" });
    expect(filter).toBe(
      [
        "[2:a]aresample=48000,aformat=channel_layouts=stereo,volume=0dB,asplit=2[layer1s0][layer1s1]",
        "[layer1s0]atrim=end=0.5,afade=t=out:st=0.45:d=0.05,adelay=delays=3200:all=1[layer1c0]",
        "[layer1s1]atrim=end=0.5,afade=t=out:st=0.45:d=0.05,adelay=delays=8450:all=1[layer1c1]",
        "[layer1c0][layer1c1]amix=inputs=2:duration=longest:normalize=0[layer1]",
      ].join(";"),
    );
  });

  it("ファイルのある場面だけを、ファイルごとに 1 つの入力にする(読み上げは使わない)", () => {
    const cues: SfxCue[] = [
      { kind: "result", at: 0.2, until: 0.5 },
      { kind: "page", at: 3, until: 3.5 },
      { kind: "page", at: 6, until: 6.5 },
      { kind: "end", at: 9.2, until: 9.5 },
    ];
    const layers = sfxLayers({ dir: "/sfx", volume: 0, sounds: [{ kind: "page", file: "/sfx/page.mp3", peak: -6 }] }, cues);
    expect(layers).toHaveLength(1);
    expect(layers[0]!.inputArgs).toEqual(["-i", "/sfx/page.mp3"]);
    expect(layers[0]!.needsKey).toBeUndefined();
    expect(layers[0]!.filter({ input: "1:a", output: "layer0" })).toContain("asplit=2");
  });
});

const facts: SessionFacts = {
  sessionId: "11111111-2222-3333-4444-555555555555",
  project: "repo",
  startTime: "2026-10-01T01:00:00.000Z",
  endTime: "2026-10-01T01:42:00.000Z",
  elapsedMinutes: 42,
  userPrompts: 3,
  toolCalls: 40,
  toolCounts: {},
  commandsRun: 20,
  commandsFailed: 0,
  files: [],
  models: [],
};

describe("効果音のクレジット", () => {
  it("最終ページのクレジットにそのまま出し、下部の柱には出さない", async () => {
    const script = await loadScript();
    const timeline = await buildTimeline(script, new ToneSynthesizer(), { maxSeconds: 120, speed: 1, maxSpeed: 1.3 });
    const html = buildHtml({ script, facts, scenes: timeline.scenes, credit: "VOICEVOX:テスト", sfxCredit: "効果音：効果音ラボ", author: "agent" });
    expect(html).toContain("<div>音声: VOICEVOX:テスト</div><div>効果音：効果音ラボ</div>");
    expect(html.match(/効果音ラボ/g)).toHaveLength(1);
    expect(buildHtml({ script, facts, scenes: timeline.scenes, author: "agent" })).not.toContain("効果音");
  });
});

/** 効果音のファイルを置いたディレクトリを作る(2 kHz の合成音。効果音ラボの音源は使わない) */
function makeSfxDir(dir: string, files: Partial<Record<"page" | "result" | "end", number>>): void {
  for (const [kind, seconds] of Object.entries(files)) makeSine(path.join(dir, `${kind}.wav`), { frequency: 2000, seconds });
}

/**
 * 鳴り始めを調べる区間の始まり。同じシーンで先に鳴った音(ページの切り替えと「以上」など)と重なる区間は、
 * その音を含むので除く。at 以上を返したら、鳴り始めは調べられない
 */
function quietBefore(cues: SfxCue[], at: number): number {
  return Math.max(at - 0.05, ...cues.filter((c) => c.at < at && c.until > at - 0.05).map((c) => c.until));
}

/** 効果音の帯域で、各時刻に鳴っていること、鳴らない場面では鳴っていないこと、読み上げ中に鳴っていないことを確かめる */
function expectSfx(file: string, scenes: TimedScene[], expected: SfxCue[], absent: SfxCue[]): void {
  const band = sfxBand(file);
  const quietFrom = (at: number) => quietBefore(expected, at);
  const nextStart = (cue: SfxCue) => Math.min(cue.until, ...expected.filter((c) => c.at > cue.at).map((c) => c.at));
  for (const cue of expected) {
    const label = `${cue.kind} @ ${cue.at}`;
    expect(peakDb(band, cue.at, cue.until), label).toBeGreaterThan(-30);
    const from = quietFrom(cue.at);
    if (from >= cue.at) continue;
    expect(peakDb(band, from, cue.at - 0.005), label).toBeLessThan(-50);
    expect(Math.abs(onsetAfter(band, from, -40)! - cue.at), label).toBeLessThan(0.03);
  }
  for (const cue of absent) {
    expect(peakDb(band, Math.max(cue.at, quietFrom(cue.at)), nextStart(cue)), `${cue.kind} @ ${cue.at}`).toBeLessThan(-50);
  }
  // 帯域通過フィルタは直前の音(読み上げの開始で消えた効果音)に数ミリ秒反応が残るため、最初の 10 ミリ秒は除く
  for (const [start, end] of speechRanges(scenes)) expect(peakDb(band, start + 0.01, end), `読み上げ ${start}〜${end}`).toBeLessThan(-50);
}

describe.runIf(hasFfmpeg)("効果音の合成(結合テスト)", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "dopagakix-sfx-mix-"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function mix(script: VideoScript, sfxDir: string, name: string) {
    const timeline = await buildTimeline(script, new ToneSynthesizer(), { maxSeconds: 120, speed: 1, maxSpeed: 1.3 });
    const narrationFile = path.join(dir, `${name}-narration.wav`);
    await writeFile(narrationFile, encodeWav(timeline.audio));
    const sfx = await probeSfx({ dir: sfxDir, volume: 0 });
    const cues = sfxCues(timeline.scenes, script);
    const outFile = path.join(dir, `${name}.wav`);
    await finishAudio({ narrationFile, layers: sfxLayers(sfx, cues), outFile });
    return { timeline, cues, outFile };
  }

  it("3 つの場面で鳴り、読み上げと重ならない。長い音は読み上げの開始までに切る", async () => {
    const script = await loadScript();
    script.next_steps.items = ["一", "二", "三"];
    const sfxDir = path.join(dir, "all");
    await mkdir(sfxDir);
    // ページの切り替えは 2 秒の長い音にして、読み上げの開始で切れることを確かめる
    makeSfxDir(sfxDir, { page: 2, result: 0.2, end: 0.2 });
    const { timeline, cues, outFile } = await mix(script, sfxDir, "all");
    expect(cues.map((c) => c.kind)).toEqual(["result", "page", "page", "page", "page", "page", "end"]);
    expectSfx(outFile, timeline.scenes, cues, []);
    expect(loudnessOf(outFile).integrated).toBeCloseTo(-16, 0);
  });

  it("一部の場面のファイルだけを置いた場合、その場面だけ鳴る", async () => {
    const script = await loadScript();
    const sfxDir = path.join(dir, "end-only");
    await mkdir(sfxDir);
    makeSfxDir(sfxDir, { end: 0.2 });
    const { timeline, cues, outFile } = await mix(script, sfxDir, "end-only");
    expectSfx(
      outFile,
      timeline.scenes,
      cues.filter((c) => c.kind === "end"),
      cues.filter((c) => c.kind !== "end"),
    );
  });
});

describe.runIf(voicevoxAvailable && canRender)("効果音付きの動画(VOICEVOX との結合テスト)", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "dopagakix-sfx-render-"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("3 つの場面で鳴って読み上げと重ならず、script.json から描画し直しても同じ効果音・クレジットになる", async () => {
    const script = await loadScript();
    const sfxDir = path.join(dir, "sfx");
    await mkdir(sfxDir);
    makeSfxDir(sfxDir, { page: 0.2, result: 0.2, end: 0.2 });
    const sfx = await probeSfx({ dir: sfxDir, credit: "効果音：合成音", volume: 0 });
    const synth = await VoicevoxSynthesizer.create({ baseUrl: voicevoxUrl, speaker: 3 });
    const options = { synth, speed: 1.25, maxSpeed: 1.45, maxSeconds: 120, fps: 2, scale: 0.25 };

    const work = path.join(dir, "work");
    await mkdir(work);
    const result = await renderReport({ script, facts, author: "agent", sfx }, { ...options, outFile: path.join(work, "out.mp4"), workDir: work });
    const timeline = JSON.parse(await readFile(path.join(work, "timeline.json"), "utf8")) as {
      scenes: TimedScene[];
      sfx: { cues: SfxCue[] };
    };
    const cues = timeline.sfx.cues;
    expect(cues.map((c) => c.kind)).toEqual(["result", ...timeline.scenes.slice(1).map(() => "page"), "end"]);

    // 読み上げには効果音の帯域の音も含まれるため、同じ読み上げを効果音なしで仕上げたものと比べる
    const plain = path.join(work, "plain.wav");
    await finishAudio({ narrationFile: path.join(work, "narration.wav"), outFile: plain });
    const withSfx = sfxBand(result.audioFile);
    const without = sfxBand(plain);
    const withSfxAll = samplesOf(result.audioFile);
    const withoutAll = samplesOf(plain);
    for (const cue of cues) {
      expect(peakDb(withSfx, cue.at, cue.until) - peakDb(without, cue.at, cue.until), `${cue.kind} @ ${cue.at}`).toBeGreaterThan(20);
      const from = quietBefore(cues, cue.at);
      if (from < cue.at) expect(Math.abs(onsetAfter(withSfx, from, -40)! - cue.at), `${cue.kind} @ ${cue.at}`).toBeLessThan(0.03);
    }
    // 声はピークが高く、loudnorm が時間とともに音量を変える(dynamic)ことがあるため、区間ごとに
    // 「効果音の帯域の音量 − 全体の音量」を比べる(音量の上げ下げは両方に同じだけかかるので打ち消し合う)
    const share = (band: Float32Array, all: Float32Array, start: number, end: number) => rmsDb(band, start, end) - rmsDb(all, start, end);
    for (const [start, end] of speechRanges(timeline.scenes)) {
      const difference = share(withSfx, withSfxAll, start, end) - share(without, withoutAll, start, end);
      expect(Math.abs(difference), `読み上げ ${start}〜${end}`).toBeLessThan(1);
    }
    expect(loudnessOf(path.join(work, "out.mp4")).integrated).toBeCloseTo(-16, 0);
    expect(await readFile(path.join(work, "script.json"), "utf8")).toContain('"credit": "効果音：合成音"');

    // script.json から描画し直すときも、同じ効果音とクレジットを使う
    const report = await loadReport(path.join(work, "script.json"));
    expect(report.sfx).toEqual({ dir: sfxDir, credit: "効果音：合成音", volume: 0 });
    expect(await probeSfx(resolveSfx({}, {}, report.sfx)!)).toEqual(sfx);
  });
});
