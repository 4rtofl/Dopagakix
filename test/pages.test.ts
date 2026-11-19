import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { normalizeConversationScript } from "../src/conversation/normalize.js";
import { ConversationFileSchema } from "../src/conversation/schema.js";
import { conversationSceneLines } from "../src/script/readings.js";
import { normalizeScript } from "../src/script/normalize.js";
import { ScriptFileSchema, VideoScriptSchema } from "../src/script/schema.js";
import { SilentSynthesizer } from "../src/tts/silent.js";
import { buildConversationHtml } from "../src/video/conversation.js";
import { buildHtml } from "../src/video/template.js";
import { buildSceneTimeline, buildTimeline } from "../src/video/timeline.js";

/*
 * 作業報告と会話の要約のページ(HTML)が、自由形式を足す前と同じであることを確かめる(Issue #25)。
 * test/fixtures/pages/ の HTML は、自由形式を足す前のコード(424b69f)で作ったもの。
 * 見た目を意図して変えたときだけ、DOPAGAKIX_UPDATE_PAGES=1 npx vitest run test/pages.test.ts で作り直す。
 */

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pagesDir = path.join(root, "test", "fixtures", "pages");
const update = process.env.DOPAGAKIX_UPDATE_PAGES === "1";
const timelineOptions = { maxSeconds: 600, speed: 1, maxSpeed: 1 };

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(root, file), "utf8"));
}

async function reportPages(): Promise<Record<string, string>> {
  const example = ScriptFileSchema.parse(await readJson("examples/script.example.json"));
  // test/fixtures/script.json は台本だけなので、数値は例のものを使う
  const fixture = { ...example, script: VideoScriptSchema.parse(await readJson("test/fixtures/script.json")) };
  const pages: Record<string, string> = {};
  const build = async (name: string, file: typeof example, extra: Partial<Parameters<typeof buildHtml>[0]>) => {
    const script = normalizeScript(file.script);
    const timeline = await buildTimeline(script, new SilentSynthesizer(), timelineOptions);
    pages[name] = buildHtml({ script, facts: file.facts!, scenes: timeline.scenes, author: file.author, ...extra });
  };
  await build("report-example", example, {
    credit: "VOICEVOX:ずんだもん",
    bgmCredit: "BGM: テスト",
    sfxCredit: "効果音: テスト",
    timeZone: "Asia/Tokyo",
  });
  await build("report-fixture-silent", fixture, { silent: true, author: "agent", timeZone: "UTC" });
  // 流れ図(flow)と、件数の上限を超えた台本
  const flow = structuredClone(fixture);
  flow.script.figure = {
    type: "flow",
    title: "ログインの流れ",
    steps: [{ label: "入力" }, { label: "形式の確認", note: "@ の有無", changed: true }, { label: "送信" }],
    narration: ["入力を受けて、形式を確かめます。", "そのあと送信します。"],
  };
  flow.script.status = "blocked";
  flow.script.work.items = ["一", "二", "三", "四", "五", "六"];
  flow.script.decisions.items = [];
  flow.script.next_steps.items = [];
  await build("report-flow", flow, { credit: "VOICEVOX:ずんだもん", timeZone: "Asia/Tokyo" });
  return pages;
}

async function conversationPages(): Promise<Record<string, string>> {
  const file = ConversationFileSchema.parse(await readJson("examples/conversation.example.json"));
  const pages: Record<string, string> = {};
  const build = async (name: string, extra: Partial<Parameters<typeof buildConversationHtml>[0]>) => {
    const timeline = await buildSceneTimeline(conversationSceneLines(file.script), new SilentSynthesizer(), timelineOptions);
    pages[name] = buildConversationHtml({
      script: normalizeConversationScript(file.script),
      facts: file.facts,
      scenes: timeline.scenes,
      ...extra,
    });
  };
  await build("conversation-example", { credit: "VOICEVOX:ずんだもん", timeZone: "Asia/Tokyo" });
  await build("conversation-silent", { silent: true, timeZone: "UTC" });
  return pages;
}

describe("作業報告と会話の要約のページ", () => {
  it("同じ入力から、自由形式を足す前と同じ HTML が出る", async () => {
    const pages = { ...(await reportPages()), ...(await conversationPages()) };
    if (update) await mkdir(pagesDir, { recursive: true });
    for (const [name, html] of Object.entries(pages)) {
      const file = path.join(pagesDir, `${name}.html`);
      if (update) await writeFile(file, html);
      expect(html, `${name}.html`).toBe(await readFile(file, "utf8"));
    }
  });
});
