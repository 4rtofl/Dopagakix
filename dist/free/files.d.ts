import type { ScriptIssue } from "../script/check.js";
import { type FreeImage } from "../video/free.js";
import { type FormatDefinition, type ResolvedFormat } from "./format.js";
import { type FreeFacts, type FreeFile, type FreeScript } from "./schema.js";
export interface LoadedFormat {
    definition: FormatDefinition;
    /** 定義のファイルの絶対パス */
    file: string;
    /** 定義の中の相対パス(CSS、書体)の基準のフォルダー */
    dir: string;
}
/** 形式の定義のファイルを読む */
export declare function loadFormatFile(file: string): Promise<LoadedFormat>;
export interface LoadedFree {
    /** 書かれたままのファイル(確認に使う) */
    raw: FreeFile;
    /** 表示用に整えた台本 */
    script: FreeScript;
    facts: FreeFacts;
    format: ResolvedFormat;
    /** 形式の定義のファイル(定義そのものがファイルに書いてあるとき、既定の形式のときは undefined) */
    formatFile?: string;
    /** 形式の定義の中の相対パスの基準のフォルダー */
    formatDir: string;
    /** 画像の相対パスの基準のフォルダー(動画ごとのファイルのあるフォルダー) */
    baseDir: string;
}
/**
 * 自由形式の動画ごとのファイル(render が残した script.json も同じ形式)を読む。
 * formatOverride(--format)を渡すと、ファイルに書いた format より優先する。
 */
export declare function loadFree(file: string, formatOverride?: string): Promise<LoadedFree>;
/** 形式の CSS が読もうとするもののうち、描画で読めないもの(外部の URL と、形式のフォルダーの外のファイル) */
export declare function unreadableCssUrls(css: string): string[];
/**
 * 形式の定義が使うファイル(形式の CSS、書体)を確かめる。prefix は警告の at の頭に付ける位置。
 * 戻り値の missing は、描画できない(ファイルがない)もの。
 */
export declare function checkFormatFiles(format: ResolvedFormat, dir: string, prefix?: string): Promise<{
    issues: ScriptIssue[];
    missing: ScriptIssue[];
}>;
export interface ProbedImage extends FreeImage {
    /** 画像のファイルの絶対パス */
    file: string;
}
/**
 * 画像のシーンの画像を確かめ、ページから読み込む URL を割り当てる。ファイルがない・形式が違うものは missing に入れ、
 * 本文の枠より小さく、拡大されてぼやけるものは issues で警告する。at は動画ごとのファイルの中の位置。
 */
export declare function probeImages(loaded: Pick<LoadedFree, "raw" | "format" | "baseDir">): Promise<{
    images: Record<string, ProbedImage>;
    issues: ScriptIssue[];
    missing: ScriptIssue[];
}>;
/** 描画に使うファイル(URL のパス → ファイル)。画像だけ。形式のフォルダーは /format/ の下にまとめて出す */
export declare function mediaFiles(images: Record<string, ProbedImage>): Record<string, string>;
