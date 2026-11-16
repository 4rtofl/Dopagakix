import { existsSync, statSync } from "node:fs";
import { resolveUserPath } from "../util/path.js";
import { runFfmpeg } from "./ffmpeg.js";
import { SAMPLE_RATE } from "./finish.js";
/*
 * BGM。曲は同梱も自動ダウンロードもせず、利用者がダウンロードした曲ファイルを指定する
 * (主な配布元はいずれも、音源ファイルそのものの再配布を禁止しているため)。
 */
/** 曲全体のラウドネスをこの値にそろえてから、--bgm-volume を足す(配布元ごとの音量差を吸収する) */
export const BGM_LOUDNESS = -30;
export const FADE_IN = 1;
export const FADE_OUT = 2;
/**
 * 読み上げ中だけ BGM を下げる設定。60 Hz の合成音を BGM にした試作の実測で、読み上げ中に約 11 dB 下がり、
 * シーンの間(約 1.1 秒)では戻り、文と文の間(0.15 秒)では下がったまま保たれた値(Issue #4)。
 */
export const DUCKING = "threshold=0.01:ratio=20:attack=5:release=400";
export function parseVolume(value, name = "--bgm-volume") {
    const n = Number(value);
    if (value.trim() === "" || !Number.isFinite(n))
        throw new Error(`${name} には dB の数値を指定してください(例: -6): ${value}`);
    return n;
}
/**
 * BGM の設定を決める。優先順位は オプション > 環境変数 > script.json の記録。
 * クレジットと音量は、曲を script.json の記録から使うときだけ記録を引き継ぐ
 * (別の曲を指定したのに前の曲のクレジットが出ないようにする)。--no-bgm なら BGM なし。
 */
export function resolveBgm(flags, env = process.env, recorded) {
    if (flags.bgm === false)
        return undefined;
    const given = flags.bgm || env.DOPAGAKIX_BGM || undefined;
    const inherited = given ? undefined : recorded;
    const file = given ? resolveUserPath(given) : recorded?.file;
    if (!file)
        return undefined;
    const credit = flags.bgmCredit || env.DOPAGAKIX_BGM_CREDIT || inherited?.credit || undefined;
    const volume = flags.bgmVolume ??
        (env.DOPAGAKIX_BGM_VOLUME ? parseVolume(env.DOPAGAKIX_BGM_VOLUME, "環境変数 DOPAGAKIX_BGM_VOLUME") : undefined) ??
        inherited?.volume ??
        0;
    return { file, ...(credit ? { credit } : {}), volume };
}
/** ebur128 の出力(Summary)から積分ラウドネスを読む。読めなければ undefined、無音なら -Infinity */
export function parseIntegratedLoudness(stderr) {
    const matches = [...stderr.matchAll(/Integrated loudness:\s*I:\s*(-?[\d.]+|-inf)\s*LUFS/g)];
    const value = matches.at(-1)?.[1];
    if (value === undefined)
        return undefined;
    return value === "-inf" ? -Infinity : Number(value);
}
/** ffmpeg の入力情報(Duration: 00:01:23.45)から長さを読む */
export function parseDuration(stderr) {
    const match = /Duration: (\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(stderr);
    if (!match)
        return undefined;
    return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}
const HOW_TO_FIX = "--bgm(環境変数 DOPAGAKIX_BGM)を確かめるか、--no-bgm で BGM なしにしてください。";
/**
 * 曲ファイルを確かめ、曲全体のラウドネス(ebur128)と長さを測る。
 * ファイルが無い・読めない・無音の場合は、描画を始める前に止めるためのエラーにする。
 */
export async function probeBgm(setting) {
    if (!existsSync(setting.file))
        throw new Error(`BGM の曲ファイルが見つかりません: ${setting.file}\n${HOW_TO_FIX}`);
    if (!statSync(setting.file).isFile())
        throw new Error(`BGM の曲ファイルではありません(フォルダです): ${setting.file}\n${HOW_TO_FIX}`);
    let stderr;
    try {
        stderr = await runFfmpeg([
            ...["-nostats", "-i", setting.file, "-map", "0:a:0", "-vn"],
            ...["-af", "ebur128=framelog=quiet", "-f", "null", "-"],
        ]);
    }
    catch (error) {
        const reason = error.message.split("\n").filter(Boolean).slice(-3).join("\n");
        throw new Error(`BGM の曲ファイルを音声として読めません: ${setting.file}\n${reason}\n${HOW_TO_FIX}`);
    }
    const loudness = parseIntegratedLoudness(stderr);
    if (loudness === undefined)
        throw new Error(`BGM の曲ファイルの音量を測れません: ${setting.file}\n${HOW_TO_FIX}`);
    if (!(loudness > -70))
        throw new Error(`BGM の曲ファイルが無音です: ${setting.file}\n${HOW_TO_FIX}`);
    return { ...setting, loudness, duration: parseDuration(stderr) };
}
/** -30 LUFS にそろえるゲインに --bgm-volume を足したもの(dB) */
export function bgmGain(track) {
    return BGM_LOUDNESS - track.loudness + track.volume;
}
const num = (n) => String(Math.round(n * 1000) / 1000);
/**
 * BGM のフィルタ。動画の長さまでループした曲を切り、音量をそろえ、冒頭と末尾をフェードし、
 * 読み上げ(key)を sidechain にして読み上げ中だけ下げる。
 */
export function bgmFilter(track, duration, labels) {
    const fadeIn = Math.min(FADE_IN, duration / 2);
    const fadeOut = Math.min(FADE_OUT, duration / 2);
    return (`[${labels.input}]aresample=${SAMPLE_RATE},aformat=channel_layouts=stereo,atrim=0:${num(duration)},asetpts=PTS-STARTPTS,` +
        `volume=${num(bgmGain(track))}dB,afade=t=in:d=${num(fadeIn)},afade=t=out:st=${num(duration - fadeOut)}:d=${num(fadeOut)}[bgm];` +
        `[bgm][${labels.key}]sidechaincompress=${DUCKING}[${labels.output}]`);
}
/** BGM を音声の仕上げ(finishAudio)に渡す形にする。曲は -stream_loop -1 でループさせる */
export function bgmLayer(track, duration) {
    return {
        inputArgs: ["-stream_loop", "-1", "-i", track.file],
        needsKey: true,
        filter: ({ input, key, output }) => bgmFilter(track, duration, { input, key: key, output }),
    };
}
/** prepare の「環境」に出す BGM の状態 */
export function describeBgm(track) {
    const length = track.duration === undefined ? "長さ不明" : `${track.duration.toFixed(1)} 秒`;
    const volume = track.volume === 0 ? "" : `、音量 ${track.volume > 0 ? "+" : ""}${track.volume} dB`;
    const credit = track.credit ? `クレジット「${track.credit}」` : "クレジットなし(配布元の規約で必要なら --bgm-credit で指定)";
    return `${track.file}(${length}${volume})。${credit}`;
}
