import { spawn } from "node:child_process";
export function ffmpegPath() {
    return process.env.FFMPEG_PATH ?? "ffmpeg";
}
/**
 * ffmpeg を実行し、標準エラーを返す(測定の結果は標準エラーに出る)。
 * 失敗したときは、標準エラーの末尾を付けて例外にする。
 */
export function runFfmpeg(args) {
    return new Promise((resolve, reject) => {
        const ffmpeg = spawn(ffmpegPath(), ["-hide_banner", "-nostdin", ...args], { stdio: ["ignore", "ignore", "pipe"] });
        let stderr = "";
        ffmpeg.stderr.on("data", (chunk) => {
            stderr = (stderr + chunk.toString()).slice(-64_000);
        });
        ffmpeg.on("error", (error) => reject(new Error(`ffmpeg を起動できません(${error.message})。ffmpeg をインストールしてください。`)));
        ffmpeg.on("close", (code) => code === 0 ? resolve(stderr) : reject(new Error(`ffmpeg が失敗しました(終了コード ${code})\n${stderr.slice(-4000)}`)));
    });
}
