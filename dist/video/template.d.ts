import type { FileChange, SessionFacts } from "../facts.js";
import { type Author, type Figure, type VideoScript } from "../script/schema.js";
import { type TimedScene } from "./timeline.js";
export declare const VIDEO_WIDTH = 1080;
export declare const VIDEO_HEIGHT = 1920;
export interface TemplateInput {
    script: VideoScript;
    facts: SessionFacts;
    scenes: TimedScene[];
    credit?: string;
    /** BGM のクレジット。最終ページにそのまま表示する(下部の柱は幅が足りないため出さない) */
    bgmCredit?: string;
    /** 効果音のクレジット。最終ページにそのまま表示する */
    sfxCredit?: string;
    /** 読み上げなし(字幕のみ)。柱に「音声なし」と出し、無音が意図したものだと分かるようにする */
    silent?: boolean;
    /** 台本の書き手。agent なら作業をした AI エージェント自身 */
    author: Author;
    timeZone?: string;
}
export declare function escapeHtml(text: string): string;
/** 長いパスは先頭側のディレクトリを省いて末尾を残す。 */
export declare function shortenPath(file: string, max?: number): string;
export declare const number: (n: number) => string;
/**
 * タイトルの文字の大きさ。日本語は文節の途中で改行しないようにしている(word-break: auto-phrase)が、
 * 1 行に収まらない長い文節は途中で折り返されるため、2 行以上になるタイトルは小さめにする。
 */
export declare function titleClass(title: string): string;
/** 表紙で「結果」の行が現れる時刻(シーン開始からの秒数。効果音を鳴らす時刻) */
export declare const RESULT_ROW_DELAY: number;
/** 最終ページで「以上」が現れる時刻(シーン開始からの秒数。次のステップの件数で変わる) */
export declare const endMarkDelay: (nextSteps: number) => number;
/** 要素の登場順(アニメーションの遅延)を付ける */
export declare const enter: (cls: string, i: number) => string;
/** 新聞の欄見出しのように、罫線の下に見出しを置く */
export declare function sectionHead(text: string, attention?: boolean): string;
/**
 * 変更ファイルの各行に付ける棒の長さ(行の幅に対する %)。追加と削除の行数に比例させ、
 * 渡したファイルのうち変更行数が最大のものを全幅にする。0 行の側は 0(棒を出さない)。
 */
export declare function fileBars(files: FileChange[]): Array<{
    added: number;
    removed: number;
}>;
/** 図の要素の登場時刻(シーンの開始からの秒) */
export interface FigureTiming {
    /** before_after: 変更前・矢印・変更後 */
    before?: number;
    arrow?: number;
    after?: number;
    /** flow: 各段と、その段の上の矢印(先頭の段は矢印なし) */
    steps?: number[];
    arrows?: number[];
}
/**
 * 図の要素を読み上げに合わせて出す時刻を決める。字幕の時刻は描画の前に決まっているので、
 * 同じ台本からは毎回同じ時刻になる。
 * - before_after: 変更前を最初に、変更後を 2 文目の読み上げ開始に合わせて出す(1 文だけなら、その文の中ほど)。
 * - flow: 段を上から順に出し、最後の段が読み上げの中ほどで出そろうよう間隔をとる。
 */
export declare function figureTiming(figure: Figure, scene: TimedScene): FigureTiming;
export interface PageInput {
    /** 題字(例: 作業報告) */
    mastTitle: string;
    /** 題字の右に出す日付 */
    date: string;
    /** シーンごとの本文。scenes と同じ順 */
    bodies: string[];
    scenes: TimedScene[];
    /** 柱の左に出す場所(プロジェクト名やチャンネル名) */
    where: string;
    /** 柱の右に出す表示(AI 作成、クレジット、音声なしなど) */
    labels: string[];
    /** 種類に固有のスタイル */
    extraStyle?: string;
}
/** 動画 1 本分のページの枠(題字・本文・字幕・柱)を組む。フォントは /fonts/ 以下から読み込む前提。 */
export declare function pageHtml(input: PageInput): string;
/** 作業報告の動画 1 本分のページを作る。フォントは /fonts/ 以下から読み込む前提。 */
export declare function buildHtml(input: TemplateInput): string;
