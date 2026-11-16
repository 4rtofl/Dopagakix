export declare function claudeConfigDir(): string;
/** Claude Code は、プロジェクトの絶対パスの英数字以外を "-" に置き換えた名前のディレクトリにログを置く。 */
export declare function encodeProjectDir(dir: string): string;
export interface TranscriptInfo {
    file: string;
    sessionId: string;
    modified: Date;
    size: number;
}
/** プロジェクトのセッションログを新しい順に返す。 */
export declare function listTranscripts(projectDir: string): Promise<TranscriptInfo[]>;
export interface LocateOptions {
    /** ログファイルのパス(指定があれば最優先) */
    transcript?: string;
    /** セッション ID(前方一致可) */
    session?: string;
    /** 最新のログを探すプロジェクトのディレクトリ */
    projectDir: string;
}
/**
 * Claude Code が Bash ツールで実行するコマンドに渡す、実行中のセッションの ID
 * (https://code.claude.com/docs/en/env-vars)。Claude Code の外で実行した場合は無いので、最新のログを使う。
 */
export declare const CURRENT_SESSION_ENV = "CLAUDE_CODE_SESSION_ID";
export interface LocatedTranscript {
    file: string;
    /** どの方法で見つけたか(表示用) */
    how: "path" | "session" | "current" | "latest";
}
export declare function locateTranscript(options: LocateOptions): Promise<LocatedTranscript>;
