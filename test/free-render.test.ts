import { execFile, execFileSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadFree, mediaFiles, probeImages } from "../src/free/files.js";
import { freeSceneLines } from "../src/script/readings.js";
import { SilentSynthesizer } from "../src/tts/silent.js";
import { buildFreeHtml } from "../src/video/free.js";
import { openPage } from "../src/video/render.js";
import { buildSceneTimeline } from "../src/video/timeline.js";
import { canRender, hasChromium } from "./support.js";

/*
 * 自由形式のページを Chromium で開いて確かめる(ffmpeg は要らない)。描画のときに外部と通信しないこと、
 * 形式のフォルダーの外を読ませないこと、形式の書体を読み込んでから撮ること、収まらないシーンを知らせることを確かめる。
 */

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pagesDir = path.join(root, "test", "fixtures", "pages");
const example = path.join(root, "examples", "free.example.json");

async function openFree(file: string, format?: string) {
  const loaded = await loadFree(file, format);
  const { images } = await probeImages(loaded);
  const timeline = await buildSceneTimeline(freeSceneLines(loaded.raw.script, loaded.format.limits, loaded.facts), new SilentSynthesizer(), {
    maxSeconds: 600,
    speed: 1,
    maxSpeed: 1,
    pause: loaded.format.motion.pause,
  });
  const html = buildFreeHtml({ script: loaded.script, facts: loaded.facts, format: loaded.format, scenes: timeline.scenes, images });
  return openPage(html, { size: loaded.format.size, formatDir: loaded.formatDir, files: mediaFiles(images) });
}

describe.runIf(hasChromium)("ページを開く(Chromium)", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "dopagakix-free-page-"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("作業報告と会話の要約のページは、架空のオリジン以外を読まない(止めるリクエストがないので、映像は変わらない)", async () => {
    for (const name of ["report-example", "report-flow", "conversation-example"]) {
      const opened = await openPage(await readFile(path.join(pagesDir, `${name}.html`), "utf8"));
      try {
        // 書体の読み込みを含め、ページが読んだものはすべて架空のオリジンから出している
        const resources = (await opened.page.evaluate(() => performance.getEntriesByType("resource").map((entry) => entry.name))) as string[];
        expect(resources.length, name).toBeGreaterThan(0);
        expect(resources.every((url) => url.startsWith("http://dopagakix.invalid/")), name).toBe(true);
        expect(opened.blocked, name).toEqual([]);
        expect(opened.overflows.every((overflow) => !overflow), name).toBe(true);
      } finally {
        await opened.close();
      }
    }
  });

  it("自由形式の例は、既定の形式でも形式の例でも、縮めずに本文の枠に収まり、外部を読まない", async () => {
    for (const format of [undefined, path.join(root, "examples", "formats", "intro", "format.json")]) {
      const opened = await openFree(example, format);
      try {
        expect(opened.fitScales.every((scale) => scale === 1), String(format)).toBe(true);
        expect(opened.overflows.every((overflow) => !overflow)).toBe(true);
        expect(opened.blocked).toEqual([]);
        // 画像のシーンの画像と、形式の CSS が読む形式のフォルダーの画像を読み込めている
        const images = (await opened.page.evaluate(() => [...document.images].map((img) => [img.getAttribute("src"), img.naturalWidth]))) as Array<[string, number]>;
        expect(images).toEqual([["/media/0.png", 1840]]);
      } finally {
        await opened.close();
      }
    }
  });

  it("形式の CSS から外部の URL は読めず(止めて記録する)、形式のフォルダーの外のファイルも読めない", async () => {
    const formatDir = path.join(dir, "outside", "format");
    await mkdir(formatDir, { recursive: true });
    await writeFile(path.join(dir, "outside", "secret.css"), "body { color: red; }");
    await writeFile(path.join(formatDir, "inside.css"), ".mast-title { color: #123456; }");
    await writeFile(
      path.join(formatDir, "style.css"),
      '@import "inside.css"; .where { background: url("https://example.com/track.png"); } .page { background: url("../secret.css"); }',
    );
    await writeFile(path.join(formatDir, "format.json"), JSON.stringify({ kind: "format", version: 1, page: { mast: "外部" }, style: "style.css" }));
    const file = path.join(dir, "outside", "video.json");
    const json = JSON.parse(await readFile(example, "utf8"));
    json.script.scenes = json.script.scenes.filter((scene: { type: string }) => scene.type !== "image");
    await writeFile(file, JSON.stringify({ ...json, format: "format/format.json" }));
    const opened = await openFree(file);
    try {
      expect(await opened.page.evaluate(() => getComputedStyle(document.querySelector(".mast-title")!).color)).toBe("rgb(18, 52, 86)");
      await opened.page.evaluate(() => getComputedStyle(document.querySelector(".where")!).backgroundImage);
      await opened.page.waitForTimeout(200);
      expect(opened.blocked).toContain("https://example.com/track.png");
      const status = async (url: string) => (await opened.page.evaluate(async (u) => (await fetch(u)).status, url)) as number;
      expect(await status("/format/inside.css")).toBe(200);
      expect(await status("/format/%2e%2e/secret.css")).toBe(404);
      expect(await status("/format/..%2fsecret.css")).toBe(404);
      expect(await status("/secret.css")).toBe(404);
      await expect(opened.page.evaluate(async () => (await fetch("https://example.com/")).status)).rejects.toThrow();
    } finally {
      await opened.close();
    }
  });

  it("形式の書体は形式のフォルダーから読み込み、撮る前に読み込み終えている", async () => {
    const formatDir = path.join(dir, "font");
    await mkdir(path.join(formatDir, "fonts"), { recursive: true });
    const source = path.join(root, "node_modules", "@fontsource", "zen-kaku-gothic-new", "files", "zen-kaku-gothic-new-japanese-700-normal.woff2");
    await copyFile(source, path.join(formatDir, "fonts", "test gothic.woff2"));
    await writeFile(
      path.join(formatDir, "format.json"),
      JSON.stringify({
        kind: "format",
        version: 1,
        fonts: { heading: { family: "Dopagakix Test Gothic", files: [{ path: "fonts/test gothic.woff2", weight: [100, 900] }] } },
      }),
    );
    const file = path.join(dir, "font", "video.json");
    const json = JSON.parse(await readFile(example, "utf8"));
    json.script.scenes = json.script.scenes.filter((scene: { type: string }) => scene.type !== "image");
    await writeFile(file, JSON.stringify({ ...json, format: "format.json" }));
    const opened = await openFree(file);
    try {
      const state = await opened.page.evaluate(() => {
        const face = [...document.fonts].find((f) => f.family.replace(/"/g, "") === "Dopagakix Test Gothic");
        return { status: face?.status, family: getComputedStyle(document.querySelector(".title")!).fontFamily };
      });
      expect(state).toEqual({ status: "loaded", family: '"Dopagakix Test Gothic", "Noto Serif JP Variable", serif' });
      expect(opened.blocked).toEqual([]);
    } finally {
      await opened.close();
    }
  });

  it("最小まで縮めても収まらないシーンを知らせる", async () => {
    const file = path.join(dir, "overflow.json");
    const json = JSON.parse(await readFile(example, "utf8"));
    json.format = { kind: "format", version: 1, limits: { items: { list: 40 }, minScale: 0.8 } };
    json.script.scenes = [{ type: "list", label: "多すぎる行", items: Array.from({ length: 40 }, (_, i) => `行 ${i + 1}`), narration: ["行が多いのだ。"] }];
    await writeFile(file, JSON.stringify(json));
    const opened = await openFree(file);
    try {
      expect(opened.fitScales[1]).toBe(0.8);
      expect(opened.overflows).toEqual([false, true, false]);
    } finally {
      await opened.close();
    }
  });
});

/** ソースの CLI を実行する(読み上げなし) */
async function run(args: string[]) {
  try {
    const { stdout, stderr } = await promisify(execFile)(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], { cwd: root });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failed = error as { code: number; stdout: string; stderr: string };
    return { code: failed.code, stdout: failed.stdout, stderr: failed.stderr };
  }
}

describe.runIf(canRender)("自由形式の動画を作る", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "dopagakix-free-render-"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("形式の例で動画を作り、script.json に形式の定義のパスと相対パスの基準を残し、そこから描画し直せる", { timeout: 300_000 }, async () => {
    const work = path.join(dir, "work");
    const out = path.join(dir, "out", "free.mp4");
    const format = path.join(root, "examples", "formats", "intro", "format.json");
    const result = await run(["render", example, "--no-voice", "--fps", "2", "--format", format, "-o", out, "--work-dir", work]);
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe(out);
    expect(result.stderr).not.toMatch(/外部への読み込みを止めました|収まりません/);
    const streams = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,width,height", "-of", "csv=p=0", out], { encoding: "utf8" });
    expect(streams).toMatch(/^h264,1080,1920/m);
    const record = JSON.parse(await readFile(path.join(work, "script.json"), "utf8"));
    expect(record).toMatchObject({ kind: "free", version: 1, format, baseDir: path.join(root, "examples"), voice: { enabled: false } });
    const again = await run(["check", path.join(work, "script.json"), "--no-voice", "--json"]);
    expect(again.code, again.stderr).toBe(0);
    expect(JSON.parse(again.stdout)).toMatchObject({ kind: "free", issues: [] });
  });
});
