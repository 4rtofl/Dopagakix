import type { ParsedSession } from "./types.js";
/** 動画レポートのスキルの名前 */
export declare const VIDEO_SKILL = "video-report";
/** 動画の作成の区間。session.events の start 番目から end 番目の直前まで */
export interface VideoSpan {
    start: number;
    end: number;
    /** 区間に含まれる指示者の発言の数 */
    userPrompts: number;
    /** 区間に含まれるツール実行の数 */
    toolCalls: number;
}
export interface VideoSpans {
    spans: VideoSpan[];
    /** 区間に含まれるイベントの位置 */
    excluded: Set<number>;
}
export interface VideoSpanOptions {
    /** 報告の台本などを置くディレクトリ。ここのファイルの編集も動画の作成とみなす */
    outputDirs?: string[];
}
/**
 * 動画レポートを作っていた区間を見つける。報告の対象(作業)ではないので、集計とダイジェストから除く。
 *
 * 1 つのターン(指示者の発言から次の発言の直前まで)の中で、最初の目印からターンの終わりまでを区間とする。
 * 目印は、video-report スキルの呼び出し、`/video-report` の指示、`dopagakix` コマンドの実行、
 * 出力先のファイルの編集。ターンの最初のツール実行が目印なら、そのターンの指示者の発言も区間に含める
 * (「動画で報告して」「読み方を直して作り直して」など)。先に作業のツール実行があれば、
 * 発言は作業の指示として数える(「X を直して、終わったら動画で報告して」など)。
 */
export declare function findVideoSpans(session: ParsedSession, options?: VideoSpanOptions): VideoSpans;
