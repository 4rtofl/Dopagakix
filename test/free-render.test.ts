import { execFile, execFileSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadFree, mediaFiles, probeImages } from "../src/free/files.js";
import { DEFAULT_FREE_LIMITS } from "../src/free/format.js";
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

  it("形式の CSS の動きは、シーンの外(題字など)に書いても、動画の時刻を入れて止める", async () => {
    const formatDir = path.join(dir, "motion");
    await mkdir(formatDir, { recursive: true });
    await writeFile(path.join(formatDir, "style.css"), "@keyframes fade { from { opacity: 0; } to { opacity: 1; } } .mast-title { animation: fade 10s linear both; }");
    await writeFile(path.join(formatDir, "format.json"), JSON.stringify({ kind: "format", version: 1, page: { mast: "動き" }, style: "style.css" }));
    const file = path.join(formatDir, "video.json");
    const json = JSON.parse(await readFile(example, "utf8"));
    json.script.scenes = json.script.scenes.filter((scene: { type: string }) => scene.type !== "image");
    await writeFile(file, JSON.stringify({ ...json, format: "format.json" }));
    const opened = await openFree(file);
    try {
      const opacityAt = (t: number) =>
        opened.page.evaluate((time) => {
          window.__seek(time);
          return Number(getComputedStyle(document.querySelector(".mast-title")!).opacity);
        }, t);
      expect(await opacityAt(5)).toBeCloseTo(0.5, 2);
      await opened.page.waitForTimeout(300);
      expect(await opacityAt(5)).toBeCloseTo(0.5, 2);
      expect(await opacityAt(2.5)).toBeCloseTo(0.25, 2);
    } finally {
      await opened.close();
    }
  });

  it("既定の上限いっぱいに書いても、どのシーンも縮めずに本文の枠に収まり、数値が横にはみ出さない", async () => {
    const L = DEFAULT_FREE_LIMITS;
    // 全角の文字を、上限の文字数だけ並べる(折り返しが多くなるよう、文節のある文にする)
    const text = (n: number) => "漢字仮名交じりの文章を書いてみると長さがよく分かるはずですそれでも続けます".repeat(3).slice(0, n);
    const lines = (count: number, n: number = L.item) => Array.from({ length: count }, () => text(n));
    const figure = (value: number | string) => ({ label: text(L.figures.label), value, unit: text(L.figures.unit) });
    const names = ["a", "b", "c"].slice(0, L.figures.count);
    const file = {
      kind: "free",
      version: 1,
      facts: {
        where: text(L.where),
        date: "2026-11-18",
        figures: { a: figure(12_345_678), b: figure(text(L.figures.value).replace(/./g, "8")), c: figure(99_999_999) },
        source: text(L.source),
      },
      script: {
        title: text(L.title),
        headline: text(L.headline),
        opening: { label: text(L.headlineLabel), figures: names, note: text(L.note), narration: ["冒頭です。"] },
        scenes: [
          { type: "text", heading: text(L.heading), lines: lines(L.items.text), narration: ["一です。"] },
          { type: "list", label: text(L.label), mark: "number", items: lines(L.items.list), narration: ["二です。"] },
          { type: "point", label: text(L.label), point: text(L.point), items: lines(L.items.point), narration: ["三です。"] },
          {
            type: "groups",
            label: text(L.label),
            groups: Array.from({ length: L.items.groups }, (_, i) => ({ label: text(L.label), mark: i ? "triangle" : "circle", items: lines(L.items.groupItems) })),
            narration: ["四です。"],
          },
          { type: "quote", label: text(L.label), text: text(L.quote), by: text(L.by), narration: ["五です。"] },
          {
            type: "figure",
            figure: { type: "flow", title: text(L.figure.title), steps: Array.from({ length: L.figure.maxSteps }, () => ({ label: text(L.figure.stepLabel), note: text(L.figure.stepNote) })) },
            narration: ["六です。"],
          },
          {
            type: "figure",
            figure: { type: "before_after", title: text(L.figure.title), before: lines(L.figure.sideLines, L.figure.sideText), after: lines(L.figure.sideLines, L.figure.sideText) },
            narration: ["七です。", "後です。"],
          },
          { type: "numbers", label: text(L.label), figures: names, narration: ["八です。"] },
        ],
        closing: { notes: lines(L.closingNotes.count, L.closingNotes.chars), narration: ["以上です。"] },
      },
    };
    const target = path.join(dir, "max.json");
    await writeFile(target, JSON.stringify(file));
    const opened = await openFree(target);
    try {
      expect(opened.fitScales).toEqual(opened.fitScales.map(() => 1));
      const wide = (await opened.page.evaluate(`(() => {
        const scenes = [...document.querySelectorAll(".scene")];
        const found = [];
        scenes.forEach((scene, i) => {
          scenes.forEach((el, j) => el.classList.toggle("active", i === j));
          for (const num of scene.querySelectorAll(".figure .num")) {
            const box = num.closest(".figure").getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(num);
            const text = range.getBoundingClientRect();
            if (text.right > box.right + 1 || text.left < box.left - 1) found.push(i + ":" + num.textContent);
          }
        });
        scenes.forEach((el, j) => el.classList.toggle("active", j === 0));
        return found;
      })()`)) as string[];
      expect(wide).toEqual([]);
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
