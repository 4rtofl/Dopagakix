import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { once } from "node:events";
import { createRequire } from "node:module";
import path from "node:path";
import type { Writable } from "node:stream";
import { chromium, type Page } from "playwright-core";
import { resolveChromium } from "./browser.js";
import { VIDEO_HEIGHT, VIDEO_WIDTH } from "./template.js";

/** ページを配信する架空のオリジン。実際の通信は page.route で横取りする。 */
const ORIGIN = "http://dopagakix.invalid";

declare global {
  interface Window {
    __prepare(): Promise<number[]>;
    __seek(t: number): string;
  }
}

function fontDirectories(): Record<string, string> {
  const require = createRequire(import.meta.url);
  return {
    serif: path.dirname(require.resolve("@fontsource-variable/noto-serif-jp/package.json")),
    gothic: path.dirname(require.resolve("@fontsource/zen-kaku-gothic-new/package.json")),
    mono: path.dirname(require.resolve("@fontsource-variable/jetbrains-mono/package.json")),
  };
}

export interface RenderOptions {
  outFile: string;
  /** 読み上げ音声(WAV) */
  audioFile: string;
  duration: number;
  fps?: number;
  /** 1 で 1080x1920。テストでは小さくして時間を短縮する */
  scale?: number;
  crf?: number;
  chromiumPath?: string;
  onProgress?: (frame: number, total: number) => void;
  /** ページの大きさ(CSS の px)。省略すると 1080×1920 */
  size?: { width: number; height: number };
  /** 形式のフォルダー。ページの /format/ 以下に、このフォルダーの中のファイルだけを出す(自由形式) */
  formatDir?: string;
  /** ページの URL のパス(/media/0.png など)ごとに出すファイル(自由形式の画像) */
  files?: Record<string, string>;
}

export interface RenderStats {
  frames: number;
  /** 実際にスクリーンショットを撮った枚数(残りは直前の画像を再利用) */
  captured: number;
  width: number;
  height: number;
  /** 文字を縮めて収めたシーンの倍率 */
  fitScales: number[];
  /** 最小まで縮めても、本文の枠に収まらなかったシーン(シーンの順に true / false) */
  overflows: boolean[];
  /** 止めたリクエスト(架空のオリジン以外への読み込み)の URL */
  blocked: string[];
}

function even(n: number): number {
  return Math.max(2, Math.round(n / 2) * 2);
}

/** 各シーンが、縮めた状態でなお本文の枠からあふれているか。調べたあとは最初のシーンを表示した状態に戻す */
const OVERFLOW_PROBE = `(() => {
  const main = document.querySelector("main");
  const scenes = [...document.querySelectorAll(".scene")];
  const result = scenes.map((scene, i) => {
    scenes.forEach((el, j) => el.classList.toggle("active", i === j));
    return scene.querySelector(".content").offsetHeight > main.clientHeight;
  });
  scenes.forEach((el, j) => el.classList.toggle("active", j === 0));
  return result;
})()`;

/** ファイルが、フォルダーの中にあるか */
function inside(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function startFfmpeg(args: string[]): { stdin: Writable; done: Promise<void> } {
  const ffmpeg = spawn(process.env.FFMPEG_PATH ?? "ffmpeg", args, { stdio: ["pipe", "ignore", "pipe"] });
  let stderr = "";
  ffmpeg.stderr.on("data", (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-8000);
  });
  // ffmpeg が先に落ちた場合の EPIPE は done 側で報告する
  ffmpeg.stdin.on("error", () => {});
  const done = new Promise<void>((resolve, reject) => {
    ffmpeg.on("error", (error) => reject(new Error(`ffmpeg を起動できません(${error.message})。ffmpeg をインストールしてください。`)));
    ffmpeg.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg が失敗しました(終了コード ${code})\n${stderr}`))));
  });
  // 撮影側の失敗で done を待たずに抜けた場合でも、未処理の reject にしない
  done.catch(() => {});
  return { stdin: ffmpeg.stdin, done };
}

async function write(stream: Writable, chunk: Buffer, done: Promise<void>): Promise<void> {
  if (stream.write(chunk)) return;
  await Promise.race([once(stream, "drain"), done]);
}

/** ページを開くときの設定(renderVideo と openPage で共通) */
export type PageOptions = Pick<RenderOptions, "chromiumPath" | "size" | "formatDir" | "files">;

/** 開いたページと、描画の準備(書体の読み込みと、あふれたシーンの縮小)の結果 */
export interface OpenedPage {
  page: Page;
  viewport: { width: number; height: number };
  fitScales: number[];
  overflows: boolean[];
  /** 止めたリクエストの URL(ページを開いている間、増えていく) */
  blocked: string[];
  close(): Promise<void>;
}

/**
 * HTML を Chromium で開き、書体を読み込んで、あふれたシーンを縮める。ページのファイルは架空のオリジンから出し、
 * それ以外の宛先へのリクエストはすべて止める。描画(renderVideo)と、テストでの撮影に使う。
 */
export async function openPage(html: string, options: PageOptions = {}): Promise<OpenedPage> {
  const viewport = options.size ?? { width: VIDEO_WIDTH, height: VIDEO_HEIGHT };
  const fonts = fontDirectories();
  const browser = await chromium.launch({
    executablePath: resolveChromium(options.chromiumPath),
    args: ["--force-color-profile=srgb", "--font-render-hinting=none", "--hide-scrollbars"],
  });
  try {
    const page = await browser.newPage({ viewport });
    const blocked: string[] = [];
    // 同じ入力からは、いつ、どのマシンで描画しても同じ映像にするため、架空のオリジン以外へのリクエストはすべて止める
    // (形式の CSS から外部の URL を読ませない)。作業報告と会話の要約のページは外部を読まないので、映像は変わらない
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== ORIGIN) {
        blocked.push(url.href);
        return route.abort("blockedbyclient");
      }
      if (url.pathname === "/index.html") {
        return route.fulfill({ body: html, contentType: "text/html; charset=utf-8" });
      }
      const match = /^\/fonts\/(serif|gothic|mono)\/(.+)$/.exec(url.pathname);
      const root = match ? fonts[match[1]!] : undefined;
      if (match && root) {
        const file = path.resolve(root, decodeURIComponent(match[2]!));
        if (file.startsWith(root + path.sep)) return route.fulfill({ path: file });
      }
      const listed = options.files?.[url.pathname];
      if (listed) return route.fulfill({ path: listed });
      if (options.formatDir && url.pathname.startsWith("/format/")) {
        const file = path.resolve(options.formatDir, ...url.pathname.slice("/format/".length).split("/").map(decodeURIComponent));
        if (inside(options.formatDir, file) && existsSync(file)) return route.fulfill({ path: file });
      }
      return route.fulfill({ status: 404, body: "not found" });
    });
    await page.goto(`${ORIGIN}/index.html`);
    const fitScales = await page.evaluate(() => window.__prepare());
    // 縮めた状態で、なお本文の枠からあふれるシーンを調べる(ページのスクリプトは変えず、調べたあとは最初のシーンに戻す)
    // (変換器が関数に名前を付ける処理を足してもページで動くよう、文字列で渡す)
    const overflows = (await page.evaluate(OVERFLOW_PROBE)) as boolean[];
    return { page, viewport, fitScales, overflows, blocked, close: () => browser.close() };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

/**
 * HTML を Chromium で 1 フレームずつ描き、ffmpeg で H.264/AAC の mp4 にする。
 * アニメーションはページ側の __seek(t) で時刻を指定して止めた状態を撮るため、
 * 描画速度に左右されず毎回同じ結果になる。
 */
export async function renderVideo(html: string, options: RenderOptions): Promise<RenderStats> {
  const fps = options.fps ?? 30;
  const scale = options.scale ?? 1;
  const opened = await openPage(html, options);
  const { page, viewport, fitScales, overflows, blocked } = opened;
  const width = even(viewport.width * scale);
  const height = even(viewport.height * scale);
  try {
    // page.screenshot より CDP の高速モードの方が 3 倍ほど速い(圧縮率は下がるが、パイプで渡すだけなので問題ない)
    const cdp = await page.context().newCDPSession(page);
    // 縮小出力は撮影時に縮める(deviceScaleFactor < 1 は撮影サイズに反映されない)
    const clip = { x: 0, y: 0, width: viewport.width, height: viewport.height, scale: width / viewport.width };
    const capture = async () => {
      const { data } = await cdp.send("Page.captureScreenshot", { format: "png", optimizeForSpeed: true, clip });
      return Buffer.from(data, "base64");
    };

    const total = Math.ceil(options.duration * fps);
    const ffmpeg = startFfmpeg([
      ...["-y", "-hide_banner", "-loglevel", "error"],
      ...["-f", "image2pipe", "-c:v", "png", "-framerate", String(fps), "-i", "pipe:0"],
      ...["-i", options.audioFile],
      ...["-map", "0:v:0", "-map", "1:a:0"],
      // RGB → YUV の変換を BT.709 で行い、そのことをメタデータにも書く(スマホでの色ずれ防止)
      ...["-vf", `scale=${width}:${height}:flags=lanczos:out_color_matrix=bt709:out_range=tv,format=yuv420p`],
      ...["-c:v", "libx264", "-preset", "medium", "-crf", String(options.crf ?? 20), "-profile:v", "high"],
      ...["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"],
      ...["-r", String(fps)],
      ...["-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2"],
      ...["-movflags", "+faststart", "-shortest", options.outFile],
    ]);

    let frame: Buffer | undefined;
    let lastKey = "";
    let captured = 0;
    try {
      for (let i = 0; i < total; i++) {
        const key = await page.evaluate((t) => window.__seek(t), i / fps);
        if (!frame || key !== lastKey) {
          frame = await capture();
          lastKey = key;
          captured++;
        }
        await write(ffmpeg.stdin, frame, ffmpeg.done);
        options.onProgress?.(i + 1, total);
      }
    } finally {
      ffmpeg.stdin.end();
    }
    await ffmpeg.done;
    return { frames: total, captured, width, height, fitScales, overflows, blocked };
  } finally {
    await opened.close();
  }
}
