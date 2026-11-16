export declare function ffmpegPath(): string;
/**
 * ffmpeg を実行し、標準エラーを返す(測定の結果は標準エラーに出る)。
 * 失敗したときは、標準エラーの末尾を付けて例外にする。
 */
export declare function runFfmpeg(args: string[]): Promise<string>;
