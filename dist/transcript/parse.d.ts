import type { ParsedSession } from "./types.js";
type Json = Record<string, unknown>;
export declare function isRecord(value: unknown): value is Json;
export declare function str(value: unknown): string | undefined;
/**
 * ユーザー発言からシステム由来の部分を取り除く。
 * スラッシュコマンドは `/name args`、`!` 実行は `! command` の形に直す。
 * 人間の発言でないと判断した場合は空文字を返す。
 */
export declare function cleanUserText(raw: string): string;
/**
 * Claude Code のセッションログ(1 行 1 JSON)を解析する。
 * ログ形式は公開仕様ではないため、未知の行や欠けた項目は読み飛ばす。
 */
export declare function parseTranscript(jsonl: string, file?: string): ParsedSession;
export declare function readTranscript(file: string): Promise<ParsedSession>;
export {};
