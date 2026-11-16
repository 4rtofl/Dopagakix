import { execFileSync, spawnSync } from "node:child_process";

/*
 * 音声の結合テストで使う道具。BGM は 60 Hz の合成音にし、90 Hz の低域通過フィルタで BGM だけを取り出して
 * 音量を測る(Issue #4 の試作と同じ方法)。読み上げの同じ帯域は、BGM に対して十分小さい。
 */

const ffmpeg = process.env.FFMPEG_PATH ?? "ffmpeg";

/** ライセンス上の問題がない合成音(正弦波)の曲ファイルを作る */
export function makeSine(file: string, options: { frequency: number; seconds: number }): void {
  execFileSync(ffmpeg, [
    ...["-hide_banner", "-loglevel", "error", "-y"],
    ...["-f", "lavfi", "-i", `sine=frequency=${options.frequency}:duration=${options.seconds}`],
    file,
  ]);
}

function stderrOf(args: string[]): string {
  const result = spawnSync(ffmpeg, ["-hide_banner", "-nostats", ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`ffmpeg が失敗しました\n${result.stderr}`);
  return result.stderr;
}

/** 全体の積分ラウドネス(LUFS)とトゥルーピーク(dBTP)を ebur128 で測る */
export function loudnessOf(file: string): { integrated: number; truePeak: number } {
  const stderr = stderrOf(["-i", file, "-map", "0:a:0", "-af", "ebur128=peak=true:framelog=quiet", "-f", "null", "-"]);
  const integrated = /Integrated loudness:\s*I:\s*(-?[\d.]+|-inf) LUFS/.exec(stderr)?.[1];
  const truePeak = /True peak:\s*Peak:\s*(-?[\d.]+|-inf) dBFS/.exec(stderr)?.[1];
  if (integrated === undefined || truePeak === undefined) throw new Error(`ebur128 の結果を読めません\n${stderr.slice(-2000)}`);
  return { integrated: Number(integrated), truePeak: Number(truePeak) };
}

/** 長さ(秒) */
export function durationOfFile(file: string): number {
  const match = /Duration: (\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(stderrOf(["-i", file, "-f", "null", "-"]));
  if (!match) throw new Error("長さを読めません");
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

const BAND_RATE = 8000;

/** 90 Hz の低域通過フィルタで BGM(60 Hz)の帯域だけを取り出した、モノラルの標本 */
export function bgmBand(file: string): Float32Array {
  const raw = execFileSync(
    ffmpeg,
    [
      ...["-hide_banner", "-loglevel", "error", "-i", file, "-map", "0:a:0"],
      ...["-af", "lowpass=f=90,lowpass=f=90", "-ac", "1", "-ar", String(BAND_RATE), "-f", "f32le", "-"],
    ],
    { maxBuffer: 256 * 1024 * 1024 },
  );
  return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
}

/** start〜end 秒の RMS(dB) */
export function levelDb(samples: Float32Array, start: number, end: number): number {
  const from = Math.max(0, Math.round(start * BAND_RATE));
  const to = Math.min(samples.length, Math.round(end * BAND_RATE));
  let sum = 0;
  for (let i = from; i < to; i++) sum += samples[i]! ** 2;
  return 10 * Math.log10(sum / Math.max(1, to - from) + 1e-20);
}

/** 区間ごとの音量(dB)の平均 */
export function meanLevel(samples: Float32Array, ranges: Array<[number, number]>): number {
  return ranges.reduce((sum, [start, end]) => sum + levelDb(samples, start, end), 0) / ranges.length;
}
