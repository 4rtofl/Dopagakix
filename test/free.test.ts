import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { freeSfxCues } from "../src/audio/sfx.js";
import { checkFormatDefinition, checkFreeFile } from "../src/free/check.js";
import { checkFormatFiles, loadFormatFile, loadFree, probeImages, unreadableCssUrls } from "../src/free/files.js";
import {
  checkFormat,
  contrastRatio,
  DEFAULT_FREE_LIMITS,
  defaultFormatDefinition,
  type FormatDefinition,
  FormatSchema,
  relativeSegments,
  resolveFormat,
} from "../src/free/format.js";
import { freeScriptJsonSchema, parseFreeFile } from "../src/free/index.js";
import { normalizeFreeScript } from "../src/free/normalize.js";
import { type FreeFile, FreeFileSchema } from "../src/free/schema.js";
import { CONVERSATION_LIMITS } from "../src/conversation/schema.js";
import { ZUNDAMON } from "../src/personas.js";
import { SENTENCE_LIMIT } from "../src/script/check.js";
import { FIGURE_LIMITS } from "../src/script/schema.js";
import { freeSceneLines, freeSpeechUnits } from "../src/script/readings.js";
import { SilentSynthesizer } from "../src/tts/silent.js";
import { bundledFreeStyle, buildFreeHtml, freeTheme } from "../src/video/free.js";
import { DEFAULT_MOTION, enterDelay } from "../src/video/motion.js";
import { DEFAULT_THEME, paperStyle, rootStyle } from "../src/video/template.js";
import { buildSceneTimeline } from "../src/video/timeline.js";
import { imageInfo } from "../src/util/image.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const example = path.join(root, "examples", "free.example.json");
const introFormat = path.join(root, "examples", "formats", "intro", "format.json");

async function loadExample(): Promise<FreeFile> {
  return FreeFileSchema.parse(JSON.parse(await readFile(example, "utf8")));
}

/** 最小のファイル(シーン 1 つ、丁寧語) */
function minimal(): FreeFile {
  return {
    kind: "free",
    version: 1,
    facts: { figures: { n: { label: "件数", value: 1200, unit: "件" } }, source: "テストの数値" },
    script: {
      title: "テスト",
      headline: "自由形式のテストです",
      opening: { figures: ["n"], narration: ["自由形式のテストです。"] },
      scenes: [{ type: "list", label: "行", items: ["一つ目", "二つ目"], narration: ["行を並べます。"] }],
      closing: { narration: ["以上です。"] },
    },
  };
}

const atOf = (file: FreeFile, options = {}) => checkFreeFile(file, options).issues.map((issue) => issue.at);

async function pageFor(file: FreeFile, format = resolveFormat(typeof file.format === "object" ? file.format : undefined), extra = {}) {
  const facts = file.facts ?? {};
  const timeline = await buildSceneTimeline(freeSceneLines(file.script, format.limits, facts), new SilentSynthesizer(), {
    maxSeconds: 600,
    speed: 1,
    maxSpeed: 1,
    pause: format.motion.pause,
  });
  const html = buildFreeHtml({ script: normalizeFreeScript(file.script, format.limits, facts), facts, format, scenes: timeline.scenes, ...extra });
  return { html, timeline };
}

describe("形式の定義", () => {
  it("書かなければ既定の形式(作業報告と会話の要約の見た目と上限)になる", () => {
    const format = resolveFormat();
    expect(format.size).toEqual({ width: 1080, height: 1920 });
    expect(format.base).toBe("paper");
    expect(format.motion).toEqual(DEFAULT_MOTION);
    expect(format.page).toEqual({ labels: [] });
    expect(format.colors).toEqual(DEFAULT_THEME.colors);
    // 既定の上限は、いまの上限にそろえる
    expect(format.limits.title).toBe(CONVERSATION_LIMITS.title);
    expect(format.limits.headline).toBe(CONVERSATION_LIMITS.headline);
    expect(format.limits.item).toBe(CONVERSATION_LIMITS.item);
    expect(format.limits.quote).toBe(CONVERSATION_LIMITS.quote);
    expect(format.limits.narration).toEqual({ sentences: CONVERSATION_LIMITS.sentences, chars: SENTENCE_LIMIT });
    expect(format.limits.figure).toMatchObject({
      title: FIGURE_LIMITS.title,
      sideLines: FIGURE_LIMITS.sideLines,
      sideText: FIGURE_LIMITS.sideText,
      maxSteps: FIGURE_LIMITS.maxSteps,
    });
    expect(format.limits.minScale).toBe(0.6);
    expect(format.limits.scenes).toEqual({ min: 1, max: 8 });
  });

  it("書いた欄だけを上書きし、入れ子の欄も残りは既定のまま", () => {
    const format = resolveFormat({
      kind: "format",
      version: 1,
      colors: { paper: "#101216", ink: "#f4f3ee" },
      motion: { enter: { seconds: 0.3, distance: 24 } },
      limits: { title: 16, scenes: { max: 6 }, items: { list: 4 } },
    });
    expect(format.colors.paper).toBe("#101216");
    expect(format.colors.marker).toBe(DEFAULT_THEME.colors.marker);
    // 墨の色を変えたら、罫線も墨の 18% にする
    expect(format.colors.rule).toBe("rgba(244, 243, 238, 0.18)");
    expect(format.motion.enter).toEqual({ seconds: 0.3, distance: 24, step: 0.07, offset: 0.06 });
    expect(format.motion.pause).toEqual(DEFAULT_MOTION.pause);
    expect(format.limits).toMatchObject({ title: 16, scenes: { min: 1, max: 6 }, items: { list: 4, point: 3 }, item: 28 });
  });

  it("色、大きさ、パス、書体の書き方が違えば読み込まない", () => {
    const base = { kind: "format", version: 1 } as const;
    expect(FormatSchema.safeParse({ ...base, colors: { ink: "black" } }).success).toBe(false);
    expect(FormatSchema.safeParse({ ...base, colors: { ink: "#17171b80" } }).success).toBe(true);
    expect(FormatSchema.safeParse({ ...base, size: { width: 1081, height: 1920 } }).success).toBe(false);
    expect(FormatSchema.safeParse({ ...base, style: "https://example.com/a.css" }).success).toBe(false);
    expect(FormatSchema.safeParse({ ...base, style: "../outside.css" }).success).toBe(false);
    expect(FormatSchema.safeParse({ ...base, style: "/abs/style.css" }).success).toBe(false);
    expect(FormatSchema.safeParse({ ...base, style: "css/a/../style.css" }).success).toBe(true);
    const font = (file: string, family = "Test") => ({ ...base, fonts: { heading: { family, files: [{ path: file, weight: 800 }] } } });
    expect(FormatSchema.safeParse(font("fonts/a.woff2")).success).toBe(true);
    expect(FormatSchema.safeParse(font("fonts/a.eot")).success).toBe(false);
    expect(FormatSchema.safeParse(font("fonts/a.woff2", 'Bad"; }')).success).toBe(false);
    expect(FormatSchema.safeParse({ ...base, fonts: { body: { family: "Var", files: [{ path: "v.ttf", weight: [100, 900] }] } } }).success).toBe(true);
    // マシンの書体を名前だけで指定することは受け付けない
    expect(FormatSchema.safeParse({ ...base, fonts: { body: { family: "Hiragino Sans", files: [] } } }).success).toBe(false);
  });

  it("相対パスの区切りをたどり、フォルダーの外と URL は undefined にする", () => {
    expect(relativeSegments("images/a.png")).toEqual(["images", "a.png"]);
    expect(relativeSegments("./a/../b.png")).toEqual(["b.png"]);
    expect(relativeSegments("../b.png")).toBeUndefined();
    expect(relativeSegments("data:image/png;base64,AA")).toBeUndefined();
    expect(relativeSegments("//cdn.example.com/x.png")).toBeUndefined();
  });

  it("既定の色はどれもコントラスト比 4.5:1 以上で、警告しない", () => {
    expect(checkFormat(resolveFormat())).toEqual([]);
    expect(contrastRatio("#17171b", "#f5f5f1")).toBeCloseTo(16.4, 0);
    expect(contrastRatio("#000000", "#ffffff")).toBe(21);
  });

  it("文字と紙、字幕、蛍光ペンの上の文字のコントラスト比が 4.5:1 を下回れば警告する", () => {
    const issues = checkFormat(resolveFormat({ kind: "format", version: 1, colors: { ink3: "#b0b0b0", marker: "#30302a" } }));
    expect(issues.map((issue) => issue.at)).toEqual(["colors.ink3", "colors.marker"]);
    // 字幕は紙の色の文字と墨の色の帯
    const caption = checkFormat(resolveFormat({ kind: "format", version: 1, colors: { paper: "#f5f5f1", ink: "#9a9a9a" } })).map((i) => i.at);
    expect(caption).toContain("colors.paper");
  });

  it("同梱のスタイルのまま大きさを変えたら警告し、シーンの数の最小が最大より大きければ警告する", () => {
    expect(checkFormat(resolveFormat({ kind: "format", version: 1, size: { width: 1080, height: 1080 } })).map((i) => i.at)).toEqual(["size"]);
    expect(checkFormat(resolveFormat({ kind: "format", version: 1, size: { width: 1080, height: 1080 }, base: "none" }))).toEqual([]);
    expect(checkFormat(resolveFormat({ kind: "format", version: 1, limits: { scenes: { min: 5, max: 3 } } })).map((i) => i.at)).toEqual(["limits.scenes"]);
  });

  it("題字と柱の表示を、形式の上限で確かめる", () => {
    const format = resolveFormat({ kind: "format", version: 1, page: { mast: "とても長い題字の例です", labels: ["一", "二", "三"] } });
    expect(checkFormatDefinition(format).map((i) => i.at)).toEqual(["page.mast", "page.labels"]);
  });

  it("format init の定義は既定の値をすべて書き、読み込むと既定の形式と同じになる", () => {
    const definition = defaultFormatDefinition("テスト", "style.css");
    expect(FormatSchema.parse(definition)).toEqual(definition);
    const resolved = resolveFormat(definition);
    const defaults = resolveFormat();
    expect({ ...resolved, name: undefined, style: undefined, page: defaults.page }).toEqual({ ...defaults, name: undefined, style: undefined });
  });
});

describe("自由形式のファイルの型", () => {
  it("同梱の例を読み込める", async () => {
    expect(parseFreeFile(JSON.parse(await readFile(example, "utf8"))).success).toBe(true);
  });

  it("台本が facts.figures にない数値を参照していたら、読み込みでエラーにする", () => {
    const file = minimal();
    file.script.scenes.push({ type: "numbers", label: "数", figures: ["n", "missing"], narration: ["数です。"] });
    const parsed = parseFreeFile(file);
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error).toMatch(/facts\.figures にない数値の名前です: "missing"[\s\S]*script\.scenes\[1\]\.figures\[1\]|script\.scenes\.1\.figures\.1/);
    const opening = minimal();
    opening.script.opening.figures = ["x"];
    expect(parseFreeFile(opening).success).toBe(false);
  });

  it("形式は、定義のファイルのパスか、定義そのものを書ける", () => {
    expect(parseFreeFile({ ...minimal(), format: "formats/intro/format.json" }).success).toBe(true);
    expect(parseFreeFile({ ...minimal(), format: { kind: "format", version: 1, colors: { paper: "#ffffff" } } }).success).toBe(true);
    expect(parseFreeFile({ ...minimal(), format: { kind: "format", version: 2 } }).success).toBe(false);
  });

  it("画像は相対パスの PNG、JPEG、WebP だけを受け付ける", () => {
    const withImage = (src: string) => {
      const file = minimal();
      file.script.scenes.push({ type: "image", label: "画面", src, narration: ["画面です。"] });
      return parseFreeFile(file).success;
    };
    expect(withImage("images/a.png")).toBe(true);
    expect(withImage("a.JPG")).toBe(true);
    expect(withImage("../shots/a.webp")).toBe(true);
    expect(withImage("https://example.com/a.png")).toBe(false);
    expect(withImage("/abs/a.png")).toBe(false);
    expect(withImage("a.gif")).toBe(false);
    expect(withImage("a.svg")).toBe(false);
  });

  it("日付は ISO 8601 の日付だけを受け付け、版の番号が違うファイルは読み込まない", () => {
    const facts = minimal().facts!;
    expect(parseFreeFile({ ...minimal(), facts: { ...facts, date: "2026-11-18" } }).success).toBe(true);
    expect(parseFreeFile({ ...minimal(), facts: { ...facts, date: "2026/11/18" } }).success).toBe(false);
    expect(parseFreeFile({ ...minimal(), version: 2 }).success).toBe(false);
  });

  it("台本の JSON Schema の説明文に、形式の上限を書く", () => {
    const describe = (schema: Record<string, unknown>) => JSON.stringify(schema);
    expect(describe(freeScriptJsonSchema())).toContain("全角20文字以内");
    const custom = describe(freeScriptJsonSchema({ kind: "format", version: 1, limits: { title: 16, scenes: { min: 3, max: 6 } } }));
    expect(custom).toContain("動画のタイトル(全角16文字以内)");
    expect(custom).toContain("3〜6シーン");
  });
});

describe("checkFreeFile", () => {
  it("同梱の例には警告がない(ずんだもんの口調でも。形式の例を使っても)", async () => {
    const file = await loadExample();
    expect(checkFreeFile(file, { persona: ZUNDAMON }).issues).toEqual([]);
    const intro = resolveFormat(FormatSchema.parse(JSON.parse(await readFile(introFormat, "utf8"))));
    expect(checkFreeFile(file, { persona: ZUNDAMON, format: intro }).issues).toEqual([]);
  });

  it("文字数と件数は、形式の定義の上限で確かめる", () => {
    const file = minimal();
    file.script.title = "とても長いタイトルの例です";
    expect(atOf(file)).toEqual([]);
    const format = resolveFormat({ kind: "format", version: 1, limits: { title: 8, items: { list: 1 } } });
    expect(atOf(file, { format })).toEqual(["script.title", "script.scenes[0].items"]);
    // 表示で切り捨てる件数も、同じ上限を使う
    expect(normalizeFreeScript(file.script, format.limits).scenes[0]).toMatchObject({ items: ["一つ目"] });
  });

  it("シーンの数の上限を超えたシーンと、中身のないシーンは出ないと警告し、表示からも落とす", () => {
    const file = minimal();
    file.script.scenes.push({ type: "text", heading: "", lines: [" "], narration: ["空です。"] });
    file.script.scenes.push({ type: "list", label: "二", items: ["行"], narration: ["二つ目です。"] });
    const format = resolveFormat({ kind: "format", version: 1, limits: { scenes: { min: 1, max: 1 } } });
    const issues = checkFreeFile(file, { format }).issues;
    expect(issues.find((i) => i.at === "script.scenes[1]")?.message).toMatch(/見出しも説明もありません/);
    expect(issues.find((i) => i.at === "script.scenes[2]")?.message).toMatch(/シーンが 1 を超えています/);
    expect(normalizeFreeScript(file.script, format.limits).scenes).toHaveLength(1);
    expect(freeSpeechUnits(file.script, format.limits).map((u) => u.at)).toEqual([
      "script.opening.narration[0]",
      "script.scenes[0].narration[0]",
      "script.closing.narration[0]",
    ]);
  });

  it("シーンが最小に満たなければ警告する", () => {
    const file = minimal();
    const format = resolveFormat({ kind: "format", version: 1, limits: { scenes: { min: 3 } } });
    expect(checkFreeFile(file, { format }).issues.find((i) => i.at === "script.scenes")?.message).toMatch(/画面に出るシーンが 1 つです。.*3〜8/);
  });

  it("数値を出しているのに出どころがなければ警告し、数値の文字の長さも確かめる", () => {
    const file = minimal();
    delete file.facts!.source;
    file.facts!.figures!.v = { label: "とても長い見出し", value: "v1.2.3-beta.10", unit: "リリース版" };
    expect(atOf(file)).toEqual(["facts.figures.v.label", "facts.figures.v.value", "facts.figures.v.unit", "facts.source"]);
    // 数値を出していなければ、出どころは要らない
    file.script.opening.figures = [];
    expect(atOf(file)).not.toContain("facts.source");
  });

  it("画面の文字に口調を付けたら警告し、引用は元の文のままなので警告しない", () => {
    const file = minimal();
    file.script.scenes[0] = { type: "list", label: "行", items: ["行を並べるのだ"], narration: ["行を並べるのだ。"] };
    file.script.scenes.push({ type: "quote", label: "引用", text: "これでいくのだ", by: "ずんだもん", narration: ["名言なのだ。"] });
    file.script.opening.narration = ["自由形式のテストなのだ。"];
    file.script.closing.narration = ["以上なのだ。"];
    expect(atOf(file, { persona: ZUNDAMON })).toEqual(["script.scenes[0].items[0]"]);
  });

  it("読み上げ文の数と長さは形式の上限で確かめ、読み上げにくい表記を警告する。動画の作成への言及は警告しない", () => {
    const file = minimal();
    file.script.scenes[0]!.narration = ["一。", "二。", "三。", "四。"];
    file.script.opening.narration = ["詳しくは https://example.com を見てください。"];
    file.script.closing.narration = ["この動画で紹介しました。"];
    expect(atOf(file)).toEqual(["script.opening.narration[0]", "script.scenes[0].narration"]);
    const format = resolveFormat({ kind: "format", version: 1, limits: { narration: { sentences: 4, chars: 5 } } });
    // 1 文の文字数の目安(5 文字)より 10 文字多い文を警告する
    expect(atOf(file, { format })).toEqual(["script.opening.narration[0]", "script.opening.narration[0]"]);
  });

  it("形式の定義の警告は format. を付けた位置で返す", () => {
    const file = { ...minimal(), format: { kind: "format", version: 1, colors: { ink3: "#c0c0c0" } } } as FreeFile;
    expect(atOf(file)).toEqual(["format.colors.ink3"]);
  });
});

describe("自由形式のページ", () => {
  it("既定の形式の色、書体、動きは、作業報告と会話の要約と同じ CSS になる(一部完了の色のトークンを足すだけ)", () => {
    const theme = freeTheme(resolveFormat());
    expect(paperStyle(theme)).toBe(paperStyle(DEFAULT_THEME));
    expect(rootStyle(theme)).toBe(rootStyle(DEFAULT_THEME).replace("  --attention:", "  --partial: #9a6200;\n  --attention:"));
  });

  it("題字、日付、柱の表示は形式と facts から出し、題字と日付がなければ題字の欄を出さない", async () => {
    const file = minimal();
    file.facts!.where = "4rtofl/Bobert";
    file.facts!.date = "2026-11-18";
    const format = resolveFormat({ kind: "format", version: 1, page: { mast: "紹介", labels: ["AI が書いた紹介"] } });
    const { html } = await pageFor(file, format, { credit: "VOICEVOX:ずんだもん", silent: false });
    expect(html).toContain('<div class="mast-title">紹介</div>');
    expect(html).toContain('<div class="mast-meta">2026.11.18</div>');
    expect(html).toContain('<span class="where">4rtofl/Bobert</span>');
    expect(html).toContain("<span>AI が書いた紹介</span><span>VOICEVOX:ずんだもん</span>");
    const bare = (await pageFor(minimal(), resolveFormat(), { silent: true })).html;
    expect(bare).not.toContain('<header class="masthead">');
    expect(bare).toContain("<span>音声なし</span>");
    // 書かなければ「AI」の表示は出さない(柱の表示は形式に任せる)
    expect(bare).not.toContain("AI");
  });

  it("各シーンに種類を data-kind で付け、数値は 3 桁ごとに区切る", async () => {
    const file = await loadExample();
    const { html, timeline } = await pageFor(file);
    expect(timeline.scenes.map((scene) => scene.kind)).toEqual([
      "opening",
      "text",
      "list",
      "figure",
      "point",
      "groups",
      "quote",
      "numbers",
      "image",
      "closing",
    ]);
    for (const kind of ["text", "list", "point", "groups", "quote", "figure", "numbers", "image"]) {
      expect(html).toContain(`<section class="scene" data-kind="${kind}">`);
    }
    expect(html).toContain('<div class="num" style="--fit:76">6,399<small>行</small></div>');
    expect(html).toContain('<div class="num" style="--fit:104">v0.1.0</div>');
    expect(html).toContain('<ol class="rows list" data-mark="number">');
    expect(html).toContain('<div class="group circle" data-mark="circle">');
    expect(html).toContain('<div class="group bar" data-mark="bar">');
    expect(html).toContain('<div class="enter figures stack"');
  });

  it("最終ページは「以上」と、notes、数値の出どころ、音声・BGM・効果音のクレジットの順に出す", async () => {
    const file = minimal();
    file.script.closing.notes = ["github.com/4rtofl/Bobert"];
    const { html } = await pageFor(file, resolveFormat(), { credit: "VOICEVOX:ずんだもん", bgmCredit: "BGM: テスト", sfxCredit: "効果音: テスト" });
    expect(html).toContain(
      "<div>github.com/4rtofl/Bobert</div><div>数値: テストの数値</div><div>音声: VOICEVOX:ずんだもん</div><div>BGM: テスト</div><div>効果音: テスト</div>",
    );
    expect(html).toMatch(/<div class="enter end-mark" style="--i:1">以上<\/div>/);
  });

  it("画像は枠に収まる大きさで置き、文字はエスケープする", async () => {
    const file = minimal();
    file.script.scenes.push({ type: "image", label: "<画面>", src: "a.png", caption: "説明", narration: ["画面です。"] });
    const { html } = await pageFor(file, resolveFormat(), { images: { "a.png": { url: "/media/0.png", width: 1840, height: 1040 } } });
    expect(html).toContain('<img class="image-img" src="/media/0.png" alt="" width="1840" height="1040" style="width: calc(920 * var(--u)); height: calc(520 * var(--u))">');
    expect(html).toContain("&lt;画面&gt;");
  });

  it("形式の色、動き、書体、CSS をページに入れ、base: none なら同梱の紙面のスタイルを読み込まない", async () => {
    const format = resolveFormat({
      kind: "format",
      version: 1,
      colors: { paper: "#101216" },
      motion: { enter: { seconds: 0.3, distance: 24 }, caption: { lead: 0.2 }, scene: { fadeIn: 0.5 } },
      fonts: { heading: { family: "Shippori Mincho", files: [{ path: "fonts/Shippori Mincho.woff2", weight: 800 }] } },
      style: "style.css",
      limits: { minScale: 0.5 },
    });
    const { html } = await pageFor(minimal(), format);
    expect(html).toContain("--paper: #101216;");
    expect(html).toContain("--partial: #9a6200;");
    expect(html).toContain('--serif: "Shippori Mincho", "Noto Serif JP Variable", serif;');
    expect(html).toContain('@font-face { font-family: "Shippori Mincho"; src: url("/format/fonts/Shippori%20Mincho.woff2") format("woff2"); font-weight: 800;');
    expect(html).toContain('<link rel="stylesheet" href="/format/style.css">');
    expect(html).toContain(".enter { animation: rise 0.3s");
    expect(html).toContain("translateY(24px)");
    expect(html).toContain("const CAPTION_LEAD = 0.2;");
    expect(html).toContain("Math.min(local / 0.5, (scene.end - t) / 0.18)");
    expect(html).toContain("scale > 0.5");
    // ページの要素が使う書体をすべて読み込む
    expect(html).toContain("getComputedStyle(el, pseudo)");
    expect(html).toContain("white-space: nowrap; overflow: hidden; text-overflow: ellipsis;");

    const none = (await pageFor(minimal(), resolveFormat({ kind: "format", version: 1, base: "none", size: { width: 1080, height: 1080 } }))).html;
    expect(none).not.toContain(".mast-title {");
    expect(none).not.toContain(".text-heading");
    expect(none).toContain("html, body { width: 1080px; height: 1080px;");
    expect(none).toContain(".scene.active { display: flex; }");
  });

  it("format init が写すスタイルは、大きさと動きの長さを書いた規則を含めない", () => {
    const css = bundledFreeStyle(resolveFormat());
    expect(css).toContain(".mast-title {");
    expect(css).toContain(".text-heading {");
    expect(css).not.toContain(":root");
    expect(css).not.toMatch(/1080px|0\.38s|translateY\(14px\)|987654/);
  });
});

describe("自由形式の時刻", () => {
  it("読み上げの前後の間は、形式の motion を使う", async () => {
    const file = minimal();
    const lines = freeSceneLines(file.script, resolveFormat().limits, file.facts);
    const synth = new SilentSynthesizer();
    const base = await buildSceneTimeline(lines, synth, { maxSeconds: 600, speed: 1, maxSpeed: 1 });
    expect(base.scenes[0]!.cues[0]!.start).toBe(DEFAULT_MOTION.pause.leadIn);
    const slow = await buildSceneTimeline(lines, synth, { maxSeconds: 600, speed: 1, maxSpeed: 1, pause: { ...DEFAULT_MOTION.pause, leadIn: 1.2 } });
    expect(slow.scenes[0]!.cues[0]!.start).toBe(1.2);
  });

  it("効果音はページの切り替えと「以上」で鳴らし、「以上」の時刻は形式の motion から決める", async () => {
    const file = minimal();
    const { timeline } = await pageFor(file);
    const cues = freeSfxCues(timeline.scenes);
    expect(cues.map((cue) => cue.kind)).toEqual(["page", "page", "end"]);
    const closing = timeline.scenes.at(-1)!;
    expect(cues.at(-1)!.at).toBe(Math.round((closing.start + enterDelay(1)) * 1000) / 1000);
    const motion = { ...DEFAULT_MOTION, enter: { ...DEFAULT_MOTION.enter, step: 0.2, offset: 0.1 } };
    expect(freeSfxCues(timeline.scenes, motion).at(-1)!.at).toBe(Math.round((closing.start + 0.3) * 1000) / 1000);
  });
});

describe("画像の形式と大きさ", () => {
  const png = (width: number, height: number, chunks: string[] = []) => {
    const bytes = new Uint8Array(64);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    new DataView(bytes.buffer).setUint32(16, width);
    new DataView(bytes.buffer).setUint32(20, height);
    // IHDR の後ろ(8 + 25 = 33)に、長さ 0 のチャンクを並べる
    let at = 33;
    for (const type of chunks) {
      bytes.set([0, 0, 0, 0, ...[...type].map((c) => c.charCodeAt(0)), 0, 0, 0, 0], at);
      at += 12;
    }
    return bytes;
  };

  it("PNG、JPEG、WebP の大きさを読む", () => {
    expect(imageInfo(png(1840, 1040, ["IDAT"]))).toEqual({ ok: true, type: "png", width: 1840, height: 1040 });
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0x01, 0xe0, 0x02, 0x80, 3, 0, 0, 0]);
    expect(imageInfo(jpeg)).toEqual({ ok: true, type: "jpeg", width: 640, height: 480 });
    const webp = new Uint8Array(30);
    webp.set([..."RIFF"].map((c) => c.charCodeAt(0)), 0);
    webp.set([..."WEBPVP8X"].map((c) => c.charCodeAt(0)), 8);
    webp.set([0x7f, 0x07, 0x00, 0x37, 0x04, 0x00], 24);
    expect(imageInfo(webp)).toEqual({ ok: true, type: "webp", width: 1920, height: 1080 });
  });

  it("動く画像、GIF、SVG は断る", () => {
    expect(imageInfo(png(10, 10, ["acTL", "IDAT"]))).toMatchObject({ ok: false, reason: expect.stringContaining("APNG") });
    const animated = new Uint8Array(30);
    animated.set([..."RIFF"].map((c) => c.charCodeAt(0)), 0);
    animated.set([..."WEBPVP8X"].map((c) => c.charCodeAt(0)), 8);
    animated[20] = 0x02;
    expect(imageInfo(animated)).toMatchObject({ ok: false, reason: expect.stringContaining("動く WebP") });
    expect(imageInfo(new TextEncoder().encode("GIF89a......"))).toMatchObject({ ok: false });
    expect(imageInfo(new TextEncoder().encode('<?xml version="1.0"?><svg xmlns="">'))).toMatchObject({ ok: false, reason: expect.stringContaining("SVG") });
  });
});

describe("自由形式のファイルの読み込み", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "dopagakix-free-"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("形式の定義のパスは、ファイルのあるフォルダーからの相対パスで、--format があればそちらを使う", async () => {
    await mkdir(path.join(dir, "formats", "a"), { recursive: true });
    await writeFile(path.join(dir, "formats", "a", "format.json"), JSON.stringify({ kind: "format", version: 1, name: "A", limits: { title: 4 } }));
    await writeFile(path.join(dir, "b.json"), JSON.stringify({ kind: "format", version: 1, name: "B" }));
    const file = path.join(dir, "video.json");
    await writeFile(file, JSON.stringify({ ...minimal(), format: "formats/a/format.json" }));
    const loaded = await loadFree(file);
    expect(loaded.format.name).toBe("A");
    expect(loaded.formatFile).toBe(path.join(dir, "formats", "a", "format.json"));
    expect(loaded.formatDir).toBe(path.join(dir, "formats", "a"));
    expect(loaded.baseDir).toBe(dir);
    const override = await loadFree(file, path.join(dir, "b.json"));
    expect(override.format.name).toBe("B");
    expect(override.format.limits.title).toBe(20);
    await expect(loadFree(file, path.join(dir, "none.json"))).rejects.toThrow(/形式の定義のファイルが見つかりません/);
  });

  it("形式の CSS と書体のファイルがなければ知らせ、CSS が外部や形式のフォルダーの外を読もうとしたら警告する", async () => {
    const formatDir = path.join(dir, "css");
    await mkdir(formatDir, { recursive: true });
    await writeFile(
      path.join(formatDir, "style.css"),
      '/* url(https://ignored.example) */ .a { background: url("images/ok.png"); } .b { background: url(https://example.com/x.png); } @import "../up.css"; .c { background: url(data:image/png;base64,AA); }',
    );
    const format = resolveFormat({
      kind: "format",
      version: 1,
      style: "style.css",
      fonts: { body: { family: "T", files: [{ path: "fonts/none.woff2", weight: 400 }] } },
    });
    const result = await checkFormatFiles(format, formatDir, "format.");
    expect(result.missing.map((i) => i.at)).toEqual(["format.fonts.body.files[0].path"]);
    expect(result.issues.filter((i) => i.at === "format.style").map((i) => i.message)).toEqual([
      expect.stringContaining("https://example.com/x.png"),
      expect.stringContaining("../up.css"),
    ]);
    expect(unreadableCssUrls("a { b: url('fonts/a.woff2') }")).toEqual([]);
    const noStyle = await checkFormatFiles(resolveFormat({ kind: "format", version: 1, style: "missing.css" }), formatDir);
    expect(noStyle.missing.map((i) => i.at)).toEqual(["style"]);
  });

  it("画像がない・形式が違うものを知らせ、本文の枠より小さい画像は拡大されると警告する", async () => {
    await copyFile(path.join(root, "examples", "images", "free-check.png"), path.join(dir, "big.png"));
    await copyFile(path.join(root, "examples", "formats", "intro", "images", "mark.png"), path.join(dir, "small.png"));
    await writeFile(path.join(dir, "fake.png"), "GIF89a-not-a-png");
    const file = minimal();
    for (const src of ["big.png", "small.png", "fake.png", "none.png", "big.png"]) {
      file.script.scenes.push({ type: "image", label: "画像", src, narration: ["画像です。"] });
    }
    const result = await probeImages({ raw: file, format: resolveFormat(), baseDir: dir });
    expect(Object.keys(result.images)).toEqual(["big.png", "small.png"]);
    expect(result.images["big.png"]).toMatchObject({ url: "/media/0.png", width: 1840, height: 1040 });
    expect(result.missing.map((i) => i.at)).toEqual(["script.scenes[3].src", "script.scenes[4].src"]);
    expect(result.issues.find((i) => i.at === "script.scenes[2].src")?.message).toMatch(/拡大されてぼやけます/);
  });

  it("同梱の形式の例は、定義だけでも確かめられ、警告がない", async () => {
    const loaded = await loadFormatFile(introFormat);
    const format = resolveFormat(loaded.definition as FormatDefinition);
    expect(checkFormatDefinition(format)).toEqual([]);
    expect((await checkFormatFiles(format, loaded.dir)).issues).toEqual([]);
    expect(DEFAULT_FREE_LIMITS.scenes.max).toBe(8);
  });
});
