import type { SessionFacts } from "../facts.js";
import type { ParsedSession } from "./types.js";
import { type VideoSpanOptions } from "./video.js";
/** エージェントが読み返す前提の文字数(Claude Code の Bash ツールの出力上限 3 万文字に合わせる) */
export declare const DEFAULT_MAX_DIGEST_CHARS = 30000;
export declare function clip(text: string, max: number): string;
export declare function oneLine(text: string): string;
export declare function displayPath(file: string, cwd?: string): string;
/**
 * ログから数値や変更ファイルを機械的に集計する。動画レポートを作っていた区間(findVideoSpans)は、
 * 指示・ツール実行・コマンドの回数、期間、作業時間に含めない。
 */
export declare function collectFacts(session: ParsedSession, options?: VideoSpanOptions): SessionFacts;
export interface DigestOptions extends VideoSpanOptions {
    maxChars?: number;
    timeZone?: string;
}
export interface Digest {
    text: string;
    /** 0 が最も詳細。LEVELS.length は行の間引きまで行ったことを示す。 */
    level: number;
    omittedLines: number;
}
/**
 * セッションのダイジェスト(振り返り用の時系列の要約)を作る。文字数予算を超える場合は、ツール出力から順に削り、
 * 最後は古い側の重要度の低い行を間引く(指示者の発言・回答・最終発言は残す)。
 * 動画レポートを作っていた区間は、報告の対象外として 1 行にまとめる。
 */
export declare function buildDigest(session: ParsedSession, facts: SessionFacts, options?: DigestOptions): Digest;
