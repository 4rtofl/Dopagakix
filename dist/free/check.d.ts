import { type Persona } from "../personas.js";
import { type ScriptCheck, type ScriptIssue } from "../script/check.js";
import { type ResolvedFormat } from "./format.js";
import type { FreeFile } from "./schema.js";
/** 動画の長さの目安(秒)の既定値 */
export declare const DEFAULT_FREE_SECONDS = 60;
export interface FreeCheckOptions {
    /**
     * 形式の定義(既定の値を足したもの)。省略すると、ファイルに定義そのものが書いてあればそれを、
     * なければ既定の形式を使う(ファイルに定義のパスが書いてあるときは、読み込んで渡す)。
     */
    format?: ResolvedFormat;
    /** 読み上げ文の口調(指定すると文末を確かめる) */
    persona?: Persona;
    /** 動画の長さの目安(秒)。既定は 60 */
    seconds?: number;
}
/**
 * 形式の定義を確かめる(ファイルを読まずに分かるもの)。prefix は警告の at の頭に付ける位置(動画ごとのファイルの中なら "format.")。
 * ファイル(書体、CSS、画像)があるかは、dopagakix check が確かめる。
 */
export declare function checkFormatDefinition(format: ResolvedFormat, prefix?: string): ScriptIssue[];
/**
 * 自由形式の動画ごとのファイルを確かめる。描画はできるが見づらくなる点や、決まりに合わない点を警告として返す
 * (形式の誤りと、facts にない数値の参照は FreeFileSchema での読み込みで検出する)。読みの確認(VOICEVOX が要る)と、
 * ファイル(書体、CSS、画像)の確認は含まない。警告の at は、動画ごとのファイルの中の位置(例: script.scenes[1].label)。
 * 形式の定義の警告は format.〜(定義のファイルの中の位置)。
 */
export declare function checkFreeFile(file: FreeFile, options?: FreeCheckOptions): ScriptCheck;
