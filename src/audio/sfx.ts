import { existsSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import type { VideoScript } from "../script/schema.js";
import { resolveUserPath } from "../util/path.js";
import { endMarkDelay, RESULT_ROW_DELAY } from "../video/template.js";
import type { TimedScene } from "../video/timeline.js";
import { parseDuration, parseVolume } from "./bgm.js";
import { runFfmpeg } from "./ffmpeg.js";
import type { AudioLayer } from "./finish.js";
import { SAMPLE_RATE } from "./finish.js";

/*
 * 効果音。音源は同梱も自動ダウンロードもせず、利用者が効果音ラボなどから手でダウンロードしたファイルを
 * ディレクトリに置いて指定する(効果音ラボの規約では、アプリへの同梱は再配布にあたり、直リンクも禁止のため)。
 */

/**
 * 鳴らす場面。ディレクトリには場面ごとの名前でファイルを置く(拡張子は ffmpeg が読めるもの)。
 * page=ページの切り替え(2 シーン目以降の開始) / result=表紙の「結果」の行 / end=最終ページの「以上」
 */
export const SFX_KINDS = ["page", "result", "end"] as const;
export type SfxKind = (typeof SFX_KINDS)[number];

const KIND_LABELS: Record<SfxKind, string> = { page: "ページの切り替え", result: "結論の表示", end: "締め" };

/**
 * 効果音の最大音量をこの値(dBFS)にそろえてから、--sfx-volume を足す。
 * 1 秒未満の短い音はラウドネス(測定の単位が 0.4 秒)では測れないため、ピークでそろえる。
 */
export const SFX_PEAK = -12;
/** 読み上げの開始で効果音を切るときのフェードアウト(秒) */
export const SFX_CUT_FADE = 0.05;

/** 効果音の設定(script.json に記録する) */
export interface SfxSetting {
  /** 効果音のファイルを置いたディレクトリの絶対パス */
  dir: string;
  /** 最終ページにそのまま表示するクレジット */
  credit?: string;
  /** 基準の音量(ピーク -12 dBFS)からの増減(dB) */
  volume: number;
}

/** 場面ごとの効果音のファイルを測った結果 */
export interface SfxSound {
  kind: SfxKind;
  file: string;
  /** 最大音量(dBFS) */
  peak: number;
  /** 長さ(秒)。分からなければ undefined */
  duration?: number;
}

export interface SfxSet extends SfxSetting {
  /** 見つかった効果音(ファイルがない場面は含まない) */
  sounds: SfxSound[];
}

export interface SfxFlags {
  /** --no-sfx なら false */
  sfx?: boolean;
  sfxDir?: string;
  sfxCredit?: string;
  sfxVolume?: number;
}

/**
 * 効果音の設定を決める。優先順位は オプション > 環境変数 > script.json の記録。
 * クレジットと音量は、ディレクトリを script.json の記録から使うときだけ記録を引き継ぐ。--no-sfx なら効果音なし。
 */
export function resolveSfx(flags: SfxFlags, env: NodeJS.ProcessEnv = process.env, recorded?: SfxSetting): SfxSetting | undefined {
  if (flags.sfx === false) return undefined;
  const given = flags.sfxDir || env.DOPAGAKIX_SFX_DIR || undefined;
  const inherited = given ? undefined : recorded;
  const dir = given ? resolveUserPath(given) : recorded?.dir;
  if (!dir) return undefined;
  const credit = flags.sfxCredit || env.DOPAGAKIX_SFX_CREDIT || inherited?.credit || undefined;
  const volume =
    flags.sfxVolume ??
    (env.DOPAGAKIX_SFX_VOLUME ? parseVolume(env.DOPAGAKIX_SFX_VOLUME, "環境変数 DOPAGAKIX_SFX_VOLUME") : undefined) ??
    inherited?.volume ??
    0;
  return { dir, ...(credit ? { credit } : {}), volume };
}

const HOW_TO_FIX = "--sfx-dir(環境変数 DOPAGAKIX_SFX_DIR)を確かめるか、--no-sfx で効果音なしにしてください。";

/**
 * ディレクトリの中から、場面ごとのファイル(page.* / result.* / end.*)を探す。
 * 名前の大文字・小文字は区別しない。同じ場面に複数のファイルがある場合は、どれを使うか決められないのでエラーにする。
 */
export function matchSfxFiles(dir: string, names: string[]): Partial<Record<SfxKind, string>> {
  const found: Partial<Record<SfxKind, string[]>> = {};
  for (const name of names) {
    const stem = path.parse(name).name.toLowerCase();
    const kind = SFX_KINDS.find((k) => k === stem);
    if (!kind || name.startsWith(".") || !path.extname(name)) continue;
    (found[kind] ??= []).push(name);
  }
  const files: Partial<Record<SfxKind, string>> = {};
  for (const kind of SFX_KINDS) {
    const candidates = found[kind]?.sort();
    if (!candidates) continue;
    if (candidates.length > 1) {
      throw new Error(`効果音の「${KIND_LABELS[kind]}」(${kind}.*)のファイルが複数あります: ${candidates.join("、")}(${dir})。1 つにしてください。`);
    }
    files[kind] = path.join(dir, candidates[0]!);
  }
  return files;
}

/** volumedetect の最大音量(dBFS)を読む。読めなければ undefined、無音なら -Infinity */
export function parseMaxVolume(stderr: string): number | undefined {
  const value = [...stderr.matchAll(/max_volume:\s*(-?[\d.]+|-inf) dB/g)].at(-1)?.[1];
  if (value === undefined) return undefined;
  return value === "-inf" ? -Infinity : Number(value);
}

async function probeSound(kind: SfxKind, file: string): Promise<SfxSound> {
  let stderr: string;
  try {
    stderr = await runFfmpeg(["-nostats", "-i", file, "-map", "0:a:0", "-vn", "-af", "volumedetect", "-f", "null", "-"]);
  } catch (error) {
    const reason = (error as Error).message.split("\n").filter(Boolean).slice(-3).join("\n");
    throw new Error(`効果音のファイルを音声として読めません: ${file}\n${reason}\n${HOW_TO_FIX}`);
  }
  const peak = parseMaxVolume(stderr);
  if (peak === undefined) throw new Error(`効果音のファイルの音量を測れません: ${file}\n${HOW_TO_FIX}`);
  if (!Number.isFinite(peak)) throw new Error(`効果音のファイルが無音です: ${file}\n${HOW_TO_FIX}`);
  return { kind, file, peak, duration: parseDuration(stderr) };
}

/**
 * 効果音のディレクトリを確かめ、場面ごとのファイルの最大音量と長さを測る。
 * ディレクトリやファイルが無い・読めない場合は、描画を始める前に止めるためのエラーにする。
 */
export async function probeSfx(setting: SfxSetting): Promise<SfxSet> {
  if (!existsSync(setting.dir)) throw new Error(`効果音のディレクトリが見つかりません: ${setting.dir}\n${HOW_TO_FIX}`);
  if (!statSync(setting.dir).isDirectory()) throw new Error(`効果音のディレクトリではありません: ${setting.dir}\n${HOW_TO_FIX}`);
  const files = matchSfxFiles(setting.dir, await readdir(setting.dir));
  const kinds = SFX_KINDS.filter((kind) => files[kind]);
  if (kinds.length === 0) {
    throw new Error(
      `効果音のディレクトリに、場面ごとのファイル(page.* / result.* / end.*)がありません: ${setting.dir}\n${HOW_TO_FIX}`,
    );
  }
  const sounds = await Promise.all(kinds.map((kind) => probeSound(kind, files[kind]!)));
  return { ...setting, sounds };
}

/** 効果音を鳴らす時刻 */
export interface SfxCue {
  kind: SfxKind;
  /** 鳴らし始める時刻(秒) */
  at: number;
  /** この時刻までに鳴り終える(読み上げの開始。読み上げのないシーンはシーンの終わり) */
  until: number;
}

const round = (seconds: number) => Math.round(seconds * 1000) / 1000;

/**
 * 効果音を鳴らす時刻を決める。どれもシーンの開始から読み上げの開始までの間に鳴らし、
 * 読み上げと重ならないよう、読み上げが始まる時刻までに切る。
 * - page: 2 シーン目以降の開始
 * - result: 表紙で「結果」の行が現れる時刻
 * - end: 最終ページで「以上」が現れる時刻
 */
export function sfxCues(scenes: TimedScene[], script: VideoScript): SfxCue[] {
  const speechStart = (scene: TimedScene) => scene.cues[0]?.start ?? scene.end;
  const cues: SfxCue[] = [];
  scenes.forEach((scene, i) => {
    if (i > 0) cues.push({ kind: "page", at: scene.start, until: speechStart(scene) });
    if (scene.kind === "opening") cues.push({ kind: "result", at: round(scene.start + RESULT_ROW_DELAY), until: speechStart(scene) });
    if (scene.kind === "closing") {
      cues.push({ kind: "end", at: round(scene.start + endMarkDelay(script.next_steps.items.length)), until: speechStart(scene) });
    }
  });
  return cues.filter((cue) => cue.until > cue.at);
}

const num = (n: number) => String(Math.round(n * 1000) / 1000);

/** 最大音量を -12 dBFS にそろえるゲインに --sfx-volume を足したもの(dB) */
export function sfxGain(sound: Pick<SfxSound, "peak">, volume: number): number {
  return SFX_PEAK - sound.peak + volume;
}

/**
 * 1 つの効果音のフィルタ。音量をそろえ、鳴らす回数だけ分けて、それぞれ時刻に置く(adelay)。
 * 読み上げの開始までに短いフェードアウトで切る。
 */
export function sfxFilter(
  sound: Pick<SfxSound, "peak">,
  volume: number,
  cues: Array<Pick<SfxCue, "at" | "until">>,
  labels: { input: string; output: string },
): string {
  const head = `[${labels.input}]aresample=${SAMPLE_RATE},aformat=channel_layouts=stereo,volume=${num(sfxGain(sound, volume))}dB`;
  const place = (cue: Pick<SfxCue, "at" | "until">) => {
    const length = cue.until - cue.at;
    const fade = Math.min(SFX_CUT_FADE, length);
    return (
      `atrim=end=${num(length)},afade=t=out:st=${num(length - fade)}:d=${num(fade)},` +
      `adelay=delays=${Math.round(cue.at * 1000)}:all=1`
    );
  };
  if (cues.length === 1) return `${head},${place(cues[0]!)}[${labels.output}]`;
  const split = cues.map((_, i) => `[${labels.output}s${i}]`);
  const placed = cues.map((_, i) => `[${labels.output}c${i}]`);
  return [
    `${head},asplit=${cues.length}${split.join("")}`,
    ...cues.map((cue, i) => `${split[i]}${place(cue)}${placed[i]}`),
    `${placed.join("")}amix=inputs=${cues.length}:duration=longest:normalize=0[${labels.output}]`,
  ].join(";");
}

/** 効果音を音声の仕上げ(finishAudio)に渡す形にする。ファイルごとに 1 つの入力にする */
export function sfxLayers(set: SfxSet, cues: SfxCue[]): AudioLayer[] {
  return set.sounds.flatMap((sound) => {
    const own = cues.filter((cue) => cue.kind === sound.kind);
    if (own.length === 0) return [];
    return [{ inputArgs: ["-i", sound.file], filter: ({ input, output }) => sfxFilter(sound, set.volume, own, { input, output }) }];
  });
}

/** prepare の「環境」に出す効果音の状態 */
export function describeSfx(set: SfxSet): string {
  const sounds = SFX_KINDS.map((kind) => {
    const sound = set.sounds.find((s) => s.kind === kind);
    if (!sound) return `${KIND_LABELS[kind]}なし`;
    const length = sound.duration === undefined ? "長さ不明" : `${sound.duration.toFixed(2)} 秒`;
    return `${KIND_LABELS[kind]} ${path.basename(sound.file)}(${length})`;
  });
  const volume = set.volume === 0 ? "" : `、音量 ${set.volume > 0 ? "+" : ""}${set.volume} dB`;
  const credit = set.credit ? `クレジット「${set.credit}」` : "クレジットなし";
  return `${set.dir}: ${sounds.join("、")}${volume}。${credit}`;
}
