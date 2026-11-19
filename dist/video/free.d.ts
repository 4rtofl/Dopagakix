import { type ResolvedFormat } from "../free/format.js";
import type { FreeFacts, FreeScript } from "../free/schema.js";
import { type PageTheme } from "./template.js";
import type { TimedScene } from "./timeline.js";
/** 形式のフォルダーの中のファイルを配信する URL の頭。描画では、これ以外の場所のファイルを読ませない(render.ts) */
export declare const FORMAT_URL = "/format/";
/** 画像のシーンの画像を配信する URL の頭 */
export declare const MEDIA_URL = "/media/";
/** 形式のフォルダーの中のファイルの URL */
export declare function formatUrl(file: string): string;
/** 画像のシーンの画像(描画の前に、ファイルがあることと大きさを確かめたもの) */
export interface FreeImage {
    /** ページから読み込む URL(MEDIA_URL の下) */
    url: string;
    width: number;
    height: number;
}
export interface FreeTemplateInput {
    /** 表示用に整えた台本(normalizeFreeScript) */
    script: FreeScript;
    facts: FreeFacts;
    format: ResolvedFormat;
    scenes: TimedScene[];
    /** 台本の src ごとの画像 */
    images?: Record<string, FreeImage>;
    credit?: string;
    bgmCredit?: string;
    sfxCredit?: string;
    /** 読み上げなし(字幕のみ)。柱に「音声なし」と出す */
    silent?: boolean;
}
/** 自由形式のシーンの、同梱のスタイル(base: paper のときだけ読み込む)。色と書体はトークンだけを使う */
export declare const FREE_STYLE: string;
/** 形式の書体の @font-face。ファイルは形式のフォルダーから読む */
export declare function fontFaces(format: ResolvedFormat): string;
/** 形式の定義から、ページの見た目の設定を作る */
export declare function freeTheme(format: ResolvedFormat): PageTheme;
/**
 * 同梱のスタイル(dopagakix format init が style.css に写すもの)。:root のトークンは形式の定義に書くので含めない。
 * 大きさと動きの長さは format.json の size と motion で決めるので、それを書いた規則も含めない
 * (写した CSS は後から読み込むので、含めると format.json を変えても効かなくなる)。
 */
export declare function bundledFreeStyle(format: ResolvedFormat): string;
/** 自由形式の動画 1 本分のページを作る */
export declare function buildFreeHtml(input: FreeTemplateInput): string;
