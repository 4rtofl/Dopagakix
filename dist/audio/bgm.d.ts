import type { AudioLayer } from "./finish.js";
/** 曲全体のラウドネスをこの値にそろえてから、--bgm-volume を足す(配布元ごとの音量差を吸収する) */
export declare const BGM_LOUDNESS = -30;
export declare const FADE_IN = 1;
export declare const FADE_OUT = 2;
/**
 * 読み上げ中だけ BGM を下げる設定。60 Hz の合成音を BGM にした試作の実測で、読み上げ中に約 11 dB 下がり、
 * シーンの間(約 1.1 秒)では戻り、文と文の間(0.15 秒)では下がったまま保たれた値(Issue #4)。
 */
export declare const DUCKING = "threshold=0.01:ratio=20:attack=5:release=400";
/** BGM の設定(script.json に記録する) */
export interface BgmSetting {
    /** 曲ファイルの絶対パス */
    file: string;
    /** 最終ページにそのまま表示するクレジット */
    credit?: string;
    /** 基準の音量(-30 LUFS)からの増減(dB) */
    volume: number;
}
/** 曲ファイルを測った結果 */
export interface BgmTrack extends BgmSetting {
    /** 曲全体の積分ラウドネス(LUFS) */
    loudness: number;
    /** 曲の長さ(秒)。分からなければ undefined */
    duration?: number;
}
export interface BgmFlags {
    /** --bgm <file>。--no-bgm なら false */
    bgm?: string | false;
    bgmCredit?: string;
    bgmVolume?: number;
}
export declare function parseVolume(value: string, name?: string): number;
/**
 * BGM の設定を決める。優先順位は オプション > 環境変数 > script.json の記録。
 * クレジットと音量は、曲を script.json の記録から使うときだけ記録を引き継ぐ
 * (別の曲を指定したのに前の曲のクレジットが出ないようにする)。--no-bgm なら BGM なし。
 */
export declare function resolveBgm(flags: BgmFlags, env?: NodeJS.ProcessEnv, recorded?: BgmSetting): BgmSetting | undefined;
/** ebur128 の出力(Summary)から積分ラウドネスを読む。読めなければ undefined、無音なら -Infinity */
export declare function parseIntegratedLoudness(stderr: string): number | undefined;
/** ffmpeg の入力情報(Duration: 00:01:23.45)から長さを読む */
export declare function parseDuration(stderr: string): number | undefined;
/**
 * 曲ファイルを確かめ、曲全体のラウドネス(ebur128)と長さを測る。
 * ファイルが無い・読めない・無音の場合は、描画を始める前に止めるためのエラーにする。
 */
export declare function probeBgm(setting: BgmSetting): Promise<BgmTrack>;
/** -30 LUFS にそろえるゲインに --bgm-volume を足したもの(dB) */
export declare function bgmGain(track: Pick<BgmTrack, "loudness" | "volume">): number;
/**
 * BGM のフィルタ。動画の長さまでループした曲を切り、音量をそろえ、冒頭と末尾をフェードし、
 * 読み上げ(key)を sidechain にして読み上げ中だけ下げる。
 */
export declare function bgmFilter(track: Pick<BgmTrack, "loudness" | "volume">, duration: number, labels: {
    input: string;
    key: string;
    output: string;
}): string;
/** BGM を音声の仕上げ(finishAudio)に渡す形にする。曲は -stream_loop -1 でループさせる */
export declare function bgmLayer(track: BgmTrack, duration: number): AudioLayer;
/** prepare の「環境」に出す BGM の状態 */
export declare function describeBgm(track: BgmTrack): string;
