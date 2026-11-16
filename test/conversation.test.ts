import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkConversationScript } from "../src/conversation/check.js";
import { parseConversationFile, parseConversationScript } from "../src/conversation/index.js";
import { conversationNarrations, normalizeConversationScript } from "../src/conversation/normalize.js";
import { type ConversationFile, type ConversationScript, ConversationFileSchema } from "../src/conversation/schema.js";
import { ZUNDAMON } from "../src/personas.js";
import { assertVideoSize, loadConversation, MAX_CONVERSATION_VIDEO_BYTES, resolveRenderPaths } from "../src/pipeline.js";
import { conversationSceneLines, conversationSpeechUnits } from "../src/script/readings.js";
import { SilentSynthesizer } from "../src/tts/silent.js";
import { buildConversationHtml, formatSpan } from "../src/video/conversation.js";
import { buildSceneTimeline } from "../src/video/timeline.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const example = path.join(root, "examples", "conversation.example.json");

async function loadExample(): Promise<ConversationFile> {
  return ConversationFileSchema.parse(JSON.parse(await readFile(example, "utf8")));
}

/** 最小の台本(シーン 3 つ、丁寧語) */
function minimal(): ConversationScript {
  return {
    title: "週末の集まり",
    headline: "土曜の午後に駅前で集まることにした",
    opening: { narration: ["週末の集まりについての会話です。"] },
    scenes: [
      { type: "topic", heading: "週末に集まるか", lines: ["土曜か日曜かを相談"], narration: ["話題は週末の集まりです。"] },
      { type: "flow", items: ["日程の案が出る", "場所の案が出る"], narration: ["日程と場所の案が出ました。"] },
      { type: "outcome", decided: ["土曜の午後に集まる"], open: [], narration: ["土曜の午後に決まりました。"] },
    ],
    closing: { narration: ["以上です。"] },
  };
}

const atOf = (script: ConversationScript, options = {}) => checkConversationScript(script, options).issues.map((issue) => issue.at);

describe("会話の要約の台本の型", () => {
  it("同梱の例を読み込める", async () => {
    const parsed = parseConversationFile(JSON.parse(await readFile(example, "utf8")));
    expect(parsed.success).toBe(true);
  });

  it("シーンの種類が違えば、どこが違うかを文で返す", () => {
    const script = { ...minimal(), scenes: [{ type: "summary", narration: [] }] };
    const parsed = parseConversationScript(script);
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error).toMatch(/scenes\[0\]\.type|scenes\.0\.type/);
  });

  it("数値は台本とは別の欄(facts)で受け取り、どれかが欠けていれば読み込まない", async () => {
    const file = await loadExample();
    const { participants: _, ...facts } = file.facts;
    expect(parseConversationFile({ ...file, facts }).success).toBe(false);
    // 台本に数値の欄を足しても受け付けない欄なので無視され、表示には使わない
    expect(ConversationFileSchema.parse({ ...file, script: { ...file.script, participants: 99 } }).script).not.toHaveProperty("participants");
  });

  it("日時はタイムゾーン付きの ISO 8601 だけを受け付ける", async () => {
    const file = await loadExample();
    expect(parseConversationFile({ ...file, facts: { ...file.facts, firstMessageAt: "2026/11/12 10:02" } }).success).toBe(false);
    expect(parseConversationFile({ ...file, facts: { ...file.facts, firstMessageAt: "2026-11-12T01:02:00Z" } }).success).toBe(true);
  });

  it("版の番号が違うファイルは読み込まない(今の版は 1)", async () => {
    const file = await loadExample();
    expect(parseConversationFile({ ...file, version: 2 }).success).toBe(false);
  });

  it("引用の名前は省略できる", () => {
    const script = minimal();
    script.scenes.push({ type: "quote", text: "それでいきましょう", narration: ["決め手の一言です。"] });
    expect(parseConversationScript(script).success).toBe(true);
  });
});

describe("checkConversationScript", () => {
  it("同梱の例には警告がない(ずんだもんの口調でも)", async () => {
    const { script } = await loadExample();
    expect(checkConversationScript(script, { persona: ZUNDAMON }).issues).toEqual([]);
  });

  it("冒頭と締めの間のシーンが 3 つに満たなければ警告する", () => {
    const script = { ...minimal(), scenes: minimal().scenes.slice(0, 2) };
    expect(checkConversationScript(script).issues).toContainEqual({
      at: "scenes",
      message: expect.stringMatching(/2 つです。冒頭と締めの間に 3〜6 シーン/),
    });
  });

  it("6 つを超えたシーンは出ないと警告する", () => {
    const base = minimal();
    const script = { ...base, scenes: [...base.scenes, ...base.scenes, base.scenes[0]!] };
    expect(atOf(script)).toContain("scenes[6]");
    expect(normalizeConversationScript(script).scenes).toHaveLength(6);
  });

  it("中身のないシーンは出ないと警告し、表示からも落とす", () => {
    const script = minimal();
    script.scenes.splice(1, 0, { type: "outcome", decided: [" "], open: [], narration: ["なし。"] });
    expect(checkConversationScript(script).issues).toContainEqual({ at: "scenes[1]", message: expect.stringMatching(/このシーンは出ません/) });
    expect(normalizeConversationScript(script).scenes.map((scene) => scene.type)).toEqual(["topic", "flow", "outcome"]);
  });

  it("件数の上限を超えた項目を警告し、表示では切り捨てる", () => {
    const script = minimal();
    script.scenes[1] = { type: "flow", items: ["1", "2", "3", "4", "5", "6"].map((n) => `出来事${n}`), narration: ["流れです。"] };
    expect(atOf(script)).toContain("scenes[1].items");
    const flow = normalizeConversationScript(script).scenes[1]!;
    expect(flow.type === "flow" && flow.items).toHaveLength(5);
  });

  it("長い引用は、切り詰めずに別の発言を選ぶよう求める", () => {
    const script = minimal();
    const text = "あ".repeat(61);
    script.scenes.push({ type: "quote", text, by: "さくら", narration: ["引用です。"] });
    expect(checkConversationScript(script).issues).toContainEqual({
      at: "scenes[3].text",
      message: expect.stringMatching(/61 文字あります\(上限 60 文字\)。引用は元の発言のまま/),
    });
    // 表示では切り詰めない
    const quote = normalizeConversationScript(script).scenes[3]!;
    expect(quote.type === "quote" && quote.text).toBe(text);
  });

  it("引用は元の発言のままなので、口調の文末でも警告しない", () => {
    const script = minimal();
    script.scenes.push({ type: "quote", text: "それでいいのだ", narration: ["引用なのだ。"] });
    const issues = checkConversationScript(script, { persona: ZUNDAMON }).issues;
    expect(issues.filter((issue) => issue.at.startsWith("scenes[3].text"))).toEqual([]);
    // 読み上げ文のほうは、丁寧語の文がずんだもんの口調でないと警告される
    expect(issues.map((issue) => issue.at)).toContain("opening.narration[0]");
  });

  it("画面の文字に口調を付けたら警告する", () => {
    const script = minimal();
    script.headline = "土曜に集まることにしたのだ";
    expect(atOf(script, { persona: ZUNDAMON })).toContain("headline");
  });

  it("読み上げにくい表記と、動画の作成依頼への言及を警告する", () => {
    const script = minimal();
    script.opening.narration = ["https://example.com を見た会話です。", "動画で要約します。"];
    const messages = checkConversationScript(script).issues.map((issue) => `${issue.at}: ${issue.message}`);
    expect(messages).toContainEqual(expect.stringMatching(/^opening\.narration\[0\]: 読み上げにくい表記\(URL\)/));
    expect(messages).toContainEqual(expect.stringMatching(/^opening\.narration\[1\]: 動画の作成依頼に触れています/));
  });

  it("読み上げ文の合計が目安を大きく超えたら警告する(既定は 60 秒)", () => {
    const script = minimal();
    script.scenes[0]!.narration = Array.from({ length: 3 }, () => "あ".repeat(44));
    script.scenes[1]!.narration = Array.from({ length: 3 }, () => "い".repeat(44));
    script.scenes[2]!.narration = Array.from({ length: 3 }, () => "う".repeat(44));
    const result = checkConversationScript(script);
    expect(result.budget).toBe(312);
    expect(result.issues.map((issue) => issue.at)).toContain("narration");
    expect(checkConversationScript(script, { seconds: 120 }).issues.map((issue) => issue.at)).not.toContain("narration");
  });

  it("論点に意見がなければ知らせる", () => {
    const script = minimal();
    script.scenes.push({ type: "points", point: "どこで集まるか", opinions: [], narration: ["論点です。"] });
    expect(atOf(script)).toContain("scenes[3].opinions");
  });
});

describe("会話の要約の読み上げの単位", () => {
  it("台本の中の位置は、落としたシーンや空の文があってもずらさない", () => {
    const script = minimal();
    script.scenes.splice(0, 0, { type: "flow", items: [], narration: ["出ないシーンです。"] });
    script.scenes[2]!.narration = ["", "日程の案が出ました。"];
    const units = conversationSpeechUnits(script);
    expect(units.map((unit) => unit.at)).toEqual([
      "opening.narration[0]",
      "scenes[1].narration[0]",
      "scenes[2].narration[1]",
      "scenes[3].narration[0]",
      "closing.narration[0]",
    ]);
    expect(conversationNarrations(script).map((n) => n.kind)).toEqual(["opening", "topic", "flow", "outcome", "closing"]);
  });

  it("描画のシーンは、冒頭・台本のシーン・締めの順に並ぶ", async () => {
    const { script } = await loadExample();
    const timeline = await buildSceneTimeline(conversationSceneLines(script), new SilentSynthesizer(), { maxSeconds: 120, speed: 1, maxSpeed: 1.3 });
    expect(timeline.scenes.map((scene) => scene.kind)).toEqual(["opening", "topic", "flow", "points", "quote", "outcome", "closing"]);
    // 読み上げの単位(check が確かめる文)と、描画の字幕は同じ
    expect(timeline.scenes.flatMap((scene) => scene.cues.map((cue) => cue.text))).toEqual(conversationSpeechUnits(script).map((unit) => unit.text));
  });
});

describe("buildConversationHtml", () => {
  async function html(edit?: (file: ConversationFile) => void, options: { silent?: boolean; credit?: string } = {}) {
    const file = await loadExample();
    edit?.(file);
    const script = normalizeConversationScript(file.script);
    const timeline = await buildSceneTimeline(conversationSceneLines(file.script), new SilentSynthesizer(), { maxSeconds: 120, speed: 1, maxSpeed: 1.3 });
    return buildConversationHtml({ script, facts: file.facts, scenes: timeline.scenes, timeZone: "Asia/Tokyo", ...options });
  }

  it("題字は「会話の要約」で、AI による要約であることを柱と最終ページに出す", async () => {
    const page = await html(undefined, { credit: "VOICEVOX:ずんだもん" });
    expect(page).toContain('<div class="mast-title">会話の要約</div>');
    expect(page).toMatch(/<span class="right"><span>AI による要約<\/span><span>VOICEVOX:ずんだもん<\/span>/);
    expect(page).toContain("要約: AI による要約。");
    expect(page).toContain('<span class="where">#開発</span>');
  });

  it("数値は facts から出す(参加者・発言・期間)", async () => {
    const page = await html();
    expect(page).toMatch(/参加者<\/div><div class="num">4<small>人<\/small>/);
    expect(page).toMatch(/発言<\/div><div class="num">38<small>件<\/small>/);
    expect(page).toMatch(/期間<\/div><div class="num">1\.6<small>時間<\/small>/);
    expect(page).toContain("2026/11/12 10:02 – 11:41");
  });

  it("引用は名前があれば出し、なければ出さない。文字はエスケープする", async () => {
    expect(await html()).toMatch(/<blockquote class="quote-text">毎朝検索を使う人がいるので[^<]*<\/blockquote>\s*<figcaption class="quote-by">さくら<\/figcaption>/);
    const anonymous = await html((file) => {
      const quote = file.script.scenes.find((scene) => scene.type === "quote")!;
      if (quote.type === "quote") {
        delete quote.by;
        quote.text = "<b>そのまま</b>";
      }
    });
    expect(anonymous).not.toContain("<figcaption");
    expect(anonymous).toContain("&lt;b&gt;そのまま&lt;/b&gt;");
  });

  it("読み上げなしなら、柱に「音声なし」と出す", async () => {
    expect(await html(undefined, { silent: true })).toContain("<span>音声なし</span>");
  });
});

describe("会話の要約のファイル", () => {
  it("loadConversation は書かれたままの台本と、表示用に整えた台本を返す", async () => {
    const loaded = await loadConversation(example);
    expect(loaded.raw.scenes).toHaveLength(5);
    expect(loaded.script.title).toBe("リリース日の見直し");
    expect(loaded.facts.participants).toBe(4);
  });

  it("期間は 1 時間未満なら分、48 時間未満なら時間、それより長ければ日で出す", () => {
    expect(formatSpan("2026-11-12T10:00:00Z", "2026-11-12T10:42:00Z")).toEqual({ value: "42", unit: "分" });
    expect(formatSpan("2026-11-12T10:00:00Z", "2026-11-13T22:00:00Z")).toEqual({ value: "36", unit: "時間" });
    expect(formatSpan("2026-11-12T10:00:00Z", "2026-11-16T10:00:00Z")).toEqual({ value: "4", unit: "日" });
  });

  it("--work-dir を指定すると、作業ファイルは動画と別の場所に置く", () => {
    expect(resolveRenderPaths({ report: "/w/in.json", title: "t", out: "/out/summary.mp4", workDir: "/tmp/work" })).toEqual({
      outFile: "/out/summary.mp4",
      workDir: "/tmp/work",
    });
    expect(resolveRenderPaths({ report: "/w/in.json", title: "t", out: "/out/summary.mp4" }).workDir).toBe("/out");
  });
});

describe("会話の要約の動画の大きさ", () => {
  it("上限は 10MB(Discord に添付できる大きさ)", () => {
    expect(MAX_CONVERSATION_VIDEO_BYTES).toBe(10 * 1024 * 1024);
  });

  it("上限を超えたら、出力先から作業フォルダーの oversize.mp4 に移してエラーにする", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "dopagakix-size-"));
    try {
      const outputs = path.join(dir, "outputs");
      const work = path.join(dir, "work");
      await Promise.all([mkdir(outputs), mkdir(work)]);
      const out = path.join(outputs, "summary.mp4");

      await writeFile(out, Buffer.alloc(100));
      await expect(assertVideoSize(out, work, 100)).resolves.toBe(100);
      expect(await readdir(outputs)).toEqual(["summary.mp4"]);

      await writeFile(out, Buffer.alloc(101));
      await expect(assertVideoSize(out, work, 100)).rejects.toThrow(/動画の大きさが 0\.0MB あり、上限の 0\.0MB を超えています。動画は出力先に置かず、.*oversize\.mp4 に移しました/);
      expect(await readdir(outputs)).toEqual([]);
      expect(await readdir(work)).toEqual(["oversize.mp4"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
