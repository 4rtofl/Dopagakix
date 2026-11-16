import type { VideoScript } from "../script/schema.js";
import type { TimedScene } from "../video/timeline.js";
import type { AudioLayer } from "./finish.js";
/**
 * 鳴らす場面。ディレクトリには場面ごとの名前でファイルを置く(拡張子は ffmpeg が読めるもの)。
 * page=ページの切り替え(2 シーン目以降の開始) / result=表紙の「結果」の行 / end=最終ページの「以上」
 */
export declare const SFX_KINDS: readonly ["page", "result", "end"];
export type SfxKind = (typeof SFX_KINDS)[number];
/**
 * 効果音の最大音量をこの値(dBFS)にそろえてから、--sfx-volume を足す。
 * 1 秒未満の短い音はラウドネス(測定の単位が 0.4 秒)では測れないため、ピークでそろえる。
 */
export declare const SFX_PEAK = -12;
/** 読み上げの開始で効果音を切るときのフェードアウト(秒) */
export declare const SFX_CUT_FADE = 0.05;
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
export declare function resolveSfx(flags: SfxFlags, env?: NodeJS.ProcessEnv, recorded?: SfxSetting): SfxSetting | undefined;
/**
 * ディレクトリの中から、場面ごとのファイル(page.* / result.* / end.*)を探す。
 * 名前の大文字・小文字は区別しない。同じ場面に複数のファイルがある場合は、どれを使うか決められないのでエラーにする。
 */
export declare function matchSfxFiles(dir: string, names: string[]): Partial<Record<SfxKind, string>>;
/** volumedetect の最大音量(dBFS)を読む。読めなければ undefined、無音なら -Infinity */
export declare function parseMaxVolume(stderr: string): number | undefined;
/**
 * 効果音のディレクトリを確かめ、場面ごとのファイルの最大音量と長さを測る。
 * ディレクトリやファイルが無い・読めない場合は、描画を始める前に止めるためのエラーにする。
 */
export declare function probeSfx(setting: SfxSetting): Promise<SfxSet>;
/** 効果音を鳴らす時刻 */
export interface SfxCue {
    kind: SfxKind;
    /** 鳴らし始める時刻(秒) */
    at: number;
    /** この時刻までに鳴り終える(読み上げの開始。読み上げのないシーンはシーンの終わり) */
    until: number;
}
/**
 * 効果音を鳴らす時刻を決める。どれもシーンの開始から読み上げの開始までの間に鳴らし、
 * 読み上げと重ならないよう、読み上げが始まる時刻までに切る。
 * - page: 2 シーン目以降の開始
 * - result: 表紙で「結果」の行が現れる時刻
 * - end: 最終ページで「以上」が現れる時刻
 */
export declare function sfxCues(scenes: TimedScene[], script: VideoScript): SfxCue[];
/** 最大音量を -12 dBFS にそろえるゲインに --sfx-volume を足したもの(dB) */
export declare function sfxGain(sound: Pick<SfxSound, "peak">, volume: number): number;
/**
 * 1 つの効果音のフィルタ。音量をそろえ、鳴らす回数だけ分けて、それぞれ時刻に置く(adelay)。
 * 読み上げの開始までに短いフェードアウトで切る。
 */
export declare function sfxFilter(sound: Pick<SfxSound, "peak">, volume: number, cues: Array<Pick<SfxCue, "at" | "until">>, labels: {
    input: string;
    output: string;
}): string;
/** 効果音を音声の仕上げ(finishAudio)に渡す形にする。ファイルごとに 1 つの入力にする */
export declare function sfxLayers(set: SfxSet, cues: SfxCue[]): AudioLayer[];
/** prepare の「環境」に出す効果音の状態 */
export declare function describeSfx(set: SfxSet): string;
