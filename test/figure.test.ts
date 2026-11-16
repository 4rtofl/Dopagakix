import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { FileChange, SessionFacts } from "../src/facts.js";
import { ZUNDAMON } from "../src/persona.js";
import { checkScript } from "../src/script/check.js";
import { normalizeScript } from "../src/script/normalize.js";
import { type Figure, FIGURE_LIMITS, type VideoScript, VideoScriptSchema } from "../src/script/schema.js";
import { SilentSynthesizer } from "../src/tts/silent.js";
import type { Synthesizer } from "../src/tts/types.js";
import { silence } from "../src/tts/wav.js";
import { buildHtml, fileBars, figureTiming } from "../src/video/template.js";
import { buildTimeline, type TimedScene } from "../src/video/timeline.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(root, "fixtures");
const loadScript = async (): Promise<VideoScript> =>
  VideoScriptSchema.parse(JSON.parse(await readFile(path.join(fixtures, "script.json"), "utf8")));

const beforeAfter: Figure = {
  type: "before_after",
  title: "入力チェックの変化",
  before: ["@ が無くても送信できた"],
  after: ["@ が無い入力は拒否", "理由を画面に表示"],
  narration: ["前は、アットマークが無くても送信できていました。", "今は送信の前に止めて、理由を出します。"],
};

const flow: Figure = {
  type: "flow",
  title: "ログインの処理",
  steps: [{ label: "入力を受け取る" }, { label: "形式を確かめる", note: "メールの @ を確認", changed: true }, { label: "認証する" }],
  narration: ["入力のあと、認証の前に形式を確かめる段を足しました。"],
};

const facts: SessionFacts = {
  userPrompts: 2,
  toolCalls: 10,
  toolCounts: { Edit: 4 },
  commandsRun: 3,
  commandsFailed: 0,
  files: [],
  models: [],
};

/** 1 文字 0.1 秒の無音を返す合成器 */
const fakeSynth: Synthesizer = {
  credit: undefined,
  synthesize: async (text) => silence(text.length * 0.1, 1000),
};

const at = (script: VideoScript) => checkScript(script, { seconds: 60 }).issues.map((issue) => issue.at);

describe("台本の figure", () => {
  it("figure は任意で、2 種類だけを受け付ける", async () => {
    const script = await loadScript();
    expect(VideoScriptSchema.parse(script).figure).toBeUndefined();
    expect(VideoScriptSchema.parse({ ...script, figure: beforeAfter }).figure).toEqual(beforeAfter);
    expect(VideoScriptSchema.parse({ ...script, figure: flow }).figure).toEqual(flow);
    expect(VideoScriptSchema.safeParse({ ...script, figure: { ...flow, type: "chart" } }).success).toBe(false);
    expect(VideoScriptSchema.safeParse({ ...script, figure: { type: "flow", title: "流れ", narration: [] } }).success).toBe(false);
    // 数値の欄は無い(書いても捨てる)
    const parsed = VideoScriptSchema.parse({ ...script, figure: { ...beforeAfter, value: 42 } });
    expect(parsed.figure).not.toHaveProperty("value");
  });

  it("上限は Issue の決定どおり", () => {
    expect(FIGURE_LIMITS).toMatchObject({ sideLines: 3, sideText: 16, minSteps: 2, maxSteps: 5, stepLabel: 12, stepNote: 16, narration: 2 });
  });

  it("表示用には上限で切り、片側が空の before_after や段のない flow は出さない", async () => {
    const script = await loadScript();
    const many = normalizeScript({
      ...script,
      figure: { ...flow, steps: Array.from({ length: 7 }, (_, i) => ({ label: ` 段${"あいうえおかき"[i]} `, note: " " })) },
    });
    expect(many.figure?.type === "flow" && many.figure.steps).toEqual(
      ["段あ", "段い", "段う", "段え", "段お"].map((label) => ({ label })),
    );
    expect(normalizeScript({ ...script, figure: { ...beforeAfter, after: [" "] } }).figure).toBeUndefined();
    expect(normalizeScript({ ...script, figure: { ...flow, steps: [] } }).figure).toBeUndefined();
    expect(normalizeScript(script)).not.toHaveProperty("figure");
  });
});

describe("checkScript(図)", () => {
  it("例どおりの図では警告を出さず、図の読み上げも口調と長さを確かめる", async () => {
    const script = await loadScript();
    expect(at({ ...script, figure: beforeAfter })).toEqual([]);
    expect(at({ ...script, figure: flow })).toEqual([]);

    const zundamon = checkScript({ ...script, figure: flow }, { seconds: 60, persona: ZUNDAMON });
    expect(zundamon.issues.map((issue) => issue.at)).toContain("figure.narration[0]");
    expect(zundamon.sentences).toBe(8);
  });

  it("件数と文字数の上限超えを挙げる", async () => {
    const script = await loadScript();
    const over: Figure = {
      ...beforeAfter,
      title: "あ".repeat(21),
      before: ["変更前の動作", "変更前の動作", "変更前の動作", "変更前の動作"],
      after: ["い".repeat(17)],
      narration: ["一文目です。", "二文目です。", "三文目です。"],
    };
    const issues = checkScript({ ...script, figure: over }, { seconds: 60 }).issues;
    const messages = Object.fromEntries(issues.map((issue) => [issue.at, issue.message]));
    expect(messages["figure.title"]).toMatch(/21 文字.*上限 20 文字/);
    expect(messages["figure.before"]).toMatch(/4 行あります。表示されるのは先頭の 3 行だけ/);
    expect(messages["figure.after[0]"]).toMatch(/17 文字.*上限 16 文字/);
    expect(messages["figure.narration"]).toMatch(/3 文あります。図解シーンは 1〜2 文/);
    // ちょうど上限なら警告しない
    expect(at({ ...script, figure: { ...beforeAfter, title: "あ".repeat(20), after: ["い".repeat(16)] } })).toEqual([]);

    const long: Figure = {
      ...flow,
      steps: [
        { label: "う".repeat(13), changed: true },
        { label: "段", note: "え".repeat(17) },
        ...Array.from({ length: 4 }, () => ({ label: "段" })),
      ],
    };
    expect(at({ ...script, figure: long })).toEqual(["figure.steps", "figure.steps[0].label", "figure.steps[1].note"]);
    expect(at({ ...script, figure: { ...flow, steps: [{ label: "一段だけ", changed: true }] } })).toEqual(["figure.steps"]);
    expect(at({ ...script, figure: { ...beforeAfter, before: [] } })).toEqual(["figure.before"]);
  });

  it("flow に変更した段がなければ挙げる", async () => {
    const script = await loadScript();
    const steps = [{ label: "入力を受け取る" }, { label: "認証する" }];
    const issues = checkScript({ ...script, figure: { ...flow, steps } }, { seconds: 60 }).issues;
    expect(issues).toEqual([{ at: "figure.steps", message: expect.stringContaining("changed: true") }]);
  });

  it("図の文字の算用数字(半角・全角)を挙げ、漢数字は許す", async () => {
    const script = await loadScript();
    const figure: Figure = {
      ...flow,
      title: "処理を3倍速く",
      steps: [{ label: "一覧を取得" }, { label: "２回目は省く", note: "キャッシュを使う", changed: true }, { label: "応答", note: "平均 120ms" }],
    };
    const issues = checkScript({ ...script, figure }, { seconds: 60 }).issues;
    expect(issues.map((issue) => issue.at)).toEqual(["figure.title", "figure.steps[1].label", "figure.steps[2].note"]);
    expect(issues[0]!.message).toMatch(/図に数字があります/);
  });
});

describe("buildTimeline(図)", () => {
  it("figure があれば「実施した作業」の次に図解シーンを入れる", async () => {
    const script = await loadScript();
    const kinds = async (s: VideoScript) => (await buildTimeline(s, new SilentSynthesizer(), { maxSeconds: 120, speed: 1, maxSpeed: 1.3 })).scenes.map((x) => x.kind);
    expect(await kinds(script)).toEqual(["opening", "work", "verification", "decisions", "closing"]);
    expect(await kinds({ ...script, figure: flow })).toEqual(["opening", "work", "figure", "verification", "decisions", "closing"]);
  });
});

describe("figureTiming", () => {
  const sceneOf = async (figure: Figure): Promise<TimedScene> => {
    const script = { ...(await loadScript()), figure };
    const timeline = await buildTimeline(script, fakeSynth, { maxSeconds: 600, speed: 1, maxSpeed: 1 });
    return timeline.scenes.find((scene) => scene.kind === "figure")!;
  };

  it("before_after は変更前を最初に、変更後を 2 文目の字幕と同時に出す", async () => {
    const scene = await sceneOf(beforeAfter);
    const timing = figureTiming(beforeAfter, scene);
    const second = scene.cues[1]!.start - scene.start;
    expect(timing.before).toBe(0.2);
    expect(timing.after).toBeCloseTo(second - 0.1, 3);
    expect(timing.arrow).toBeCloseTo(timing.after! - 0.3, 3);
  });

  it("1 文目が字幕 2 枚に分かれても、2 文目の先頭に合わせる", async () => {
    const figure: Figure = { ...beforeAfter, narration: [`${"あ".repeat(25)}、${"い".repeat(25)}。`, "今は理由を出します。"] };
    const scene = await sceneOf(figure);
    expect(scene.cues).toHaveLength(3);
    expect(figureTiming(figure, scene).after).toBeCloseTo(scene.cues[2]!.start - scene.start - 0.1, 3);
  });

  it("読み上げが 1 文だけなら、変更後はその文の中ほどで出す", async () => {
    const figure: Figure = { ...beforeAfter, narration: ["前は送信できたが、今は止めて理由を出します。"] };
    const scene = await sceneOf(figure);
    const cue = scene.cues[0]!;
    expect(figureTiming(figure, scene).after).toBeCloseTo((cue.start + cue.end) / 2 - scene.start, 3);
  });

  it("flow は段を上から順に出し、読み上げの中ほどまでに出そろえる", async () => {
    const figure: Figure = { ...flow, steps: [...Array.from({ length: 4 }, (_, i) => ({ label: `段${"あいうえ"[i]}` })), { label: "段お", changed: true }] };
    const scene = await sceneOf(figure);
    const { steps, arrows } = figureTiming(figure, scene);
    expect(steps).toHaveLength(5);
    expect(steps![0]).toBe(0.2);
    for (let i = 1; i < steps!.length; i++) {
      expect(steps![i]).toBeGreaterThan(steps![i - 1]!);
      expect(arrows![i - 1]).toBeCloseTo(steps![i]! - 0.3, 3);
    }
    const speech = { start: scene.cues[0]!.start - scene.start, end: scene.cues.at(-1)!.end - scene.start };
    expect(steps!.at(-1)).toBeLessThanOrEqual((speech.start + speech.end) / 2 + 0.001);
  });

  it("同じ台本からは同じ HTML(要素の遅延)になる", async () => {
    const script = { ...(await loadScript()), figure: flow };
    const build = async () => {
      const timeline = await buildTimeline(script, fakeSynth, { maxSeconds: 600, speed: 1, maxSpeed: 1 });
      return buildHtml({ script, facts, scenes: timeline.scenes, author: "agent", timeZone: "UTC" });
    };
    const html = await build();
    expect(await build()).toBe(html);
    expect(html).toContain('<section class="scene" data-kind="figure">');
    expect(html).toMatch(/<li class="enter step changed" style="animation-delay:[\d.]+s"><div class="step-label"><span class="marker">形式を確かめる<\/span>/);
    // 矢印は 2 本(段の間)。それぞれ軸と矢じりを引く
    expect(html.match(/class="flow-arrow"/g)).toHaveLength(2);
    expect(html.match(/<path class="stroke"/g)).toHaveLength(4);
  });

  it("判断事項の題目と、流れ図の変更した段の名前に、蛍光ペンの下線を引く", async () => {
    const script = { ...(await loadScript()), figure: flow };
    const timeline = await buildTimeline(script, fakeSynth, { maxSeconds: 600, speed: 1, maxSpeed: 1 });
    const html = buildHtml({ script, facts, scenes: timeline.scenes, author: "agent" });
    expect(html).toContain('<div class="d-title"><span class="marker">');
    expect(html).toContain('<span class="marker">形式を確かめる</span>');
    // <style> を「セレクター { 宣言 }」の組に分け、.marker に当たる宣言を集める
    const css = /<style>([\s\S]*?)<\/style>/.exec(html)![1]!.replace(/\/\*[\s\S]*?\*\//g, "");
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
      selectors: selector!.split(",").map((s) => s.trim()),
      body: body!,
    }));
    const declarationsFor = (selector: string) =>
      rules.filter((rule) => rule.selectors.includes(selector)).map((rule) => rule.body).join(";");
    for (const selector of [".d-title .marker", ".step .marker"]) {
      expect(declarationsFor(selector)).toMatch(/background:\s*linear-gradient\([^;]*var\(--marker\)/);
      // 矢印の大きさなど、文字を押し込む指定が当たっていない
      expect(declarationsFor(selector)).not.toMatch(/(^|[;\s])(width|height|display)\s*:/);
    }
  });

  it("before_after の HTML に変更前と変更後を出し、figure がなければ図解シーンを作らない", async () => {
    const script = { ...(await loadScript()), figure: beforeAfter };
    const timeline = await buildTimeline(script, fakeSynth, { maxSeconds: 600, speed: 1, maxSpeed: 1 });
    const html = buildHtml({ script, facts, scenes: timeline.scenes, author: "agent" });
    expect(html).toContain('<div class="ba-label">変更前</div><ul class="ba-lines"><li>@ が無くても送信できた</li></ul>');
    expect(html).toContain("<li>@ が無い入力は拒否</li><li>理由を画面に表示</li>");
    const plain = await loadScript();
    const none = await buildTimeline(plain, fakeSynth, { maxSeconds: 600, speed: 1, maxSpeed: 1 });
    expect(buildHtml({ script: plain, facts, scenes: none.scenes, author: "agent" })).not.toContain('data-kind="figure"');
  });
});

describe("fileBars", () => {
  const file = (added: number, removed: number): FileChange => ({ path: "a.ts", added, removed, edits: 1, created: false });

  it("最大のファイルを全幅にし、追加と削除の行数に比例させる", () => {
    expect(fileBars([file(30, 10), file(10, 0), file(0, 20)])).toEqual([
      { added: 75, removed: 25 },
      { added: 25, removed: 0 },
      { added: 0, removed: 50 },
    ]);
  });

  it("1 ファイルだけなら全幅、0 行なら棒を出さない", () => {
    expect(fileBars([file(3, 0)])).toEqual([{ added: 100, removed: 0 }]);
    expect(fileBars([file(0, 0)])).toEqual([{ added: 0, removed: 0 }]);
    expect(fileBars([file(5, 5), file(0, 0)])[1]).toEqual({ added: 0, removed: 0 });
    expect(fileBars([])).toEqual([]);
  });

  it("極端な差があっても、0 行でなければ見える長さにする", () => {
    expect(fileBars([file(10_000, 0), file(1, 1)])).toEqual([
      { added: 100, removed: 0 },
      { added: 1, removed: 1 },
    ]);
  });

  it("変更ファイルの行に棒を付け、0 行の行には付けない", async () => {
    const script = await loadScript();
    const timeline = await buildTimeline(script, new SilentSynthesizer(), { maxSeconds: 120, speed: 1, maxSpeed: 1.3 });
    const files = [file(8, 2), { ...file(0, 0), path: "b.ts" }];
    const html = buildHtml({ script, facts: { ...facts, files }, scenes: timeline.scenes, author: "agent" });
    expect(html).toContain('<div class="bar rule-in" style="--i:8"><span class="bar-add" style="width:80%"></span><span class="bar-del" style="width:20%"></span></div>');
    expect(html).not.toContain('style="--i:9"');
    // 数字の表示は残す
    expect(html).toContain('<span class="plus">+8</span> <span class="minus">−2</span>');
  });
});
