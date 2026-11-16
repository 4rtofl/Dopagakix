import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SessionFacts } from "../src/facts.js";
import { checkScript } from "../src/script/check.js";
import { type Figure, VideoScriptSchema } from "../src/script/schema.js";
import { SilentSynthesizer } from "../src/tts/silent.js";
import { encodeWav, silence } from "../src/tts/wav.js";
import { renderVideo } from "../src/video/render.js";
import { buildHtml, escapeHtml, shortenPath } from "../src/video/template.js";
import { buildTimeline } from "../src/video/timeline.js";
import { canRender } from "./support.js";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

const facts: SessionFacts = {
  sessionId: "11111111-2222-3333-4444-555555555555",
  title: "テスト",
  project: "repo",
  branch: "main",
  startTime: "2026-10-01T01:00:00.000Z",
  endTime: "2026-10-01T01:42:00.000Z",
  elapsedMinutes: 42,
  userPrompts: 3,
  toolCalls: 40,
  toolCounts: { Bash: 20 },
  commandsRun: 20,
  commandsFailed: 1,
  files: Array.from({ length: 8 }, (_, i) => ({
    path: `src/very/deep/directory/structure/module-${i}/implementation-file.ts`,
    added: 120 * (i + 1),
    removed: i,
    edits: 1,
    created: i === 0,
  })),
  models: ["claude-opus-5-5"],
};

describe("buildHtml", () => {
  it("台本の書き手に応じてクレジットとラベルを出し分ける", async () => {
    const script = VideoScriptSchema.parse(JSON.parse(await readFile(path.join(fixtures, "script.json"), "utf8")));
    const timeline = await buildTimeline(script, new SilentSynthesizer(), { maxSeconds: 120, speed: 1, maxSpeed: 1.3 });
    const agent = buildHtml({ script, facts, scenes: timeline.scenes, author: "agent" });
    expect(agent).toContain("報告: 作業をした AI エージェント(claude-opus-5-5)による自己報告。数値はセッションログから自動集計");
    expect(agent).toContain("<span>AI 作成</span>");
    const manual = buildHtml({ script, facts, scenes: timeline.scenes, author: "manual" });
    expect(manual).toContain("報告: 手動で作成。数値はセッションログから自動集計");
    expect(manual).not.toContain("AI 作成");
  });

  it("字幕のみの動画は、柱に「音声なし」と出す", async () => {
    const script = VideoScriptSchema.parse(JSON.parse(await readFile(path.join(fixtures, "script.json"), "utf8")));
    const timeline = await buildTimeline(script, new SilentSynthesizer(), { maxSeconds: 120, speed: 1, maxSpeed: 1.3 });
    const silent = buildHtml({ script, facts, scenes: timeline.scenes, silent: true, author: "agent" });
    expect(silent).toContain("<span>AI 作成</span><span>音声なし</span>");
    const voiced = buildHtml({ script, facts, scenes: timeline.scenes, credit: "VOICEVOX:テスト", author: "agent" });
    expect(voiced).toContain("<span>AI 作成</span><span>VOICEVOX:テスト</span>");
    expect(voiced).not.toContain("音声なし");
  });

  it("作業時間の推定があればそれを出し、日をまたぐ期間は月日も表示する", async () => {
    const script = VideoScriptSchema.parse(JSON.parse(await readFile(path.join(fixtures, "script.json"), "utf8")));
    const timeline = await buildTimeline(script, new SilentSynthesizer(), { maxSeconds: 120, speed: 1, maxSpeed: 1.3 });
    const multiDay = { ...facts, endTime: "2026-10-08T03:30:00.000Z", elapsedMinutes: 2 * 24 * 60 + 150, activeMinutes: 95 };
    const html = buildHtml({ script, facts: multiDay, scenes: timeline.scenes, author: "agent", timeZone: "UTC" });
    expect(html).toContain("2026/10/01 01:00 – 10/08 03:30");
    expect(html).toContain('<div class="fact-label">作業時間</div><div class="num">1.6<small>時間</small>');
    const sameDay = buildHtml({ script, facts, scenes: timeline.scenes, author: "agent", timeZone: "UTC" });
    expect(sameDay).toContain("2026/10/01 01:00 – 01:42");
    expect(sameDay).toContain('<div class="fact-label">経過</div>');
  });

  it("タイトルは長さに応じて小さくし、文節の途中での改行を減らす", async () => {
    const script = VideoScriptSchema.parse(JSON.parse(await readFile(path.join(fixtures, "script.json"), "utf8")));
    const timeline = await buildTimeline(script, new SilentSynthesizer(), { maxSeconds: 120, speed: 1, maxSpeed: 1.3 });
    const titleOf = (title: string) =>
      /<h1 class="enter ([^"]+)"/.exec(buildHtml({ script: { ...script, title }, facts, scenes: timeline.scenes, author: "agent" }))?.[1];
    expect(titleOf("認証の修正")).toBe("title");
    // 半角英数は幅を小さく数える
    expect(titleOf("README と CI の修正")).toBe("title mid");
    expect(titleOf("作業報告動画ツールのスキル化")).toBe("title mid");
    expect(titleOf("ログイン画面のバリデーションとエラー表示の修正")).toBe("title long");
  });

  it("シーンは結論・実施した作業・検証の結果・判断・次のステップの順で、ご依頼の内容は出さない", async () => {
    // 以前の台本(request あり)も読み込めるが、表示はしない
    const script = VideoScriptSchema.parse({
      ...JSON.parse(await readFile(path.join(fixtures, "script.json"), "utf8")),
      request: { summary: "入力チェックを修正する依頼", narration: ["ご依頼は入力チェックの修正でした。"] },
    });
    const timeline = await buildTimeline(script, new SilentSynthesizer(), { maxSeconds: 120, speed: 1, maxSpeed: 1.3 });
    const html = buildHtml({ script, facts, scenes: timeline.scenes, author: "agent" });
    expect([...html.matchAll(/<section class="scene" data-kind="(\w+)">/g)].map((m) => m[1])).toEqual([
      "opening",
      "work",
      "verification",
      "decisions",
      "closing",
    ]);
    expect(html).not.toContain("ご依頼の内容");
    expect(html).not.toContain("入力チェックを修正する依頼");
    expect(html).not.toContain("ご依頼は入力チェックの修正でした");
    // 指示とツール実行の回数は画面に出さない
    expect(html).not.toMatch(/指示 \d+ 回/);
  });

  it("台本中の HTML やスクリプト終了タグを無害化する", async () => {
    const script = VideoScriptSchema.parse(JSON.parse(await readFile(path.join(fixtures, "script.json"), "utf8")));
    script.title = "<img src=x onerror=alert(1)>";
    script.opening.narration = ["</script><script>alert(1)</script>"];
    const timeline = await buildTimeline(script, new SilentSynthesizer(), { maxSeconds: 120, speed: 1, maxSpeed: 1.3 });
    const html = buildHtml({ script, facts, scenes: timeline.scenes, author: "agent" });
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("</script><script>alert(1)");
  });
});

describe("template helpers", () => {
  it("HTML を無害化し、長いパスの先頭を省く", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
    expect(shortenPath("src/a.ts")).toBe("src/a.ts");
    expect(shortenPath("src/very/deep/directory/structure/file.ts", 24)).toBe("…/structure/file.ts");
    expect(shortenPath("x".repeat(50), 20)).toHaveLength(20);
  });
});

describe.runIf(canRender)("renderVideo(結合テスト)", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "dopagakix-test-"));
  });
  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("縦長の mp4 を出力し、あふれる内容は縮小して収める", async () => {
    const script = VideoScriptSchema.parse(JSON.parse(await readFile(path.join(fixtures, "script.json"), "utf8")));
    script.work.items = Array.from({ length: 5 }, (_, i) => `長い作業項目その${i + 1}。説明が二行に折り返される程度の長さがある`);

    const timeline = await buildTimeline(script, new SilentSynthesizer(), { maxSeconds: 120, speed: 1, maxSpeed: 1.3 });
    const audioFile = path.join(dir, "narration.wav");
    await writeFile(audioFile, encodeWav(timeline.audio));
    const outFile = path.join(dir, "out.mp4");
    const html = buildHtml({ script, facts, scenes: timeline.scenes, credit: "VOICEVOX:テスト", author: "agent", timeZone: "UTC" });

    const stats = await renderVideo(html, { outFile, audioFile, duration: timeline.duration, fps: 8, scale: 0.25 });

    expect(stats.width).toBe(270);
    expect(stats.height).toBe(480);
    expect(stats.captured).toBeLessThan(stats.frames);
    // 結論の次が作業シーン。5 項目 + 8 ファイルは収まらないので縮小される
    expect(stats.fitScales).toHaveLength(5);
    expect(stats.fitScales[1]).toBeLessThan(1);

    const probe = JSON.parse(
      execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", outFile], { encoding: "utf8" }),
    ) as { streams: Array<Record<string, unknown>>; format: { duration: string } };
    const video = probe.streams.find((s) => s.codec_type === "video")!;
    expect(video).toMatchObject({ codec_name: "h264", width: 270, height: 480, pix_fmt: "yuv420p" });
    expect(probe.streams.some((s) => s.codec_type === "audio" && s.codec_name === "aac")).toBe(true);
    expect(Number(probe.format.duration)).toBeCloseTo(timeline.duration, 0);
  });

  /** 上限いっぱいの図。全角の文字で上限の文字数まで埋める */
  const fullFigures: Figure[] = [
    {
      type: "before_after",
      title: "設定ファイルの読み込み順序と既定値の変化",
      before: ["環境変数よりも設定ファイルを優先", "設定ファイルが無ければ起動を中止", "既定値はコードの中だけに書いてた"],
      after: ["設定ファイルよりも環境変数を優先", "設定ファイルが無いと既定値で起動", "既定値を説明書と設定の例にも記載"],
      narration: ["前は、設定ファイルが無いと起動できなかったのだ。", "今は環境変数を優先し、無くても既定値で動くのだ。"],
    },
    {
      type: "flow",
      title: "注文を受けてから発送するまでの処理の流れ",
      steps: [
        { label: "注文の内容を受け付ける段", note: "画面と外部連携の両方から受け付け" },
        { label: "在庫の引き当てを確かめる", note: "倉庫ごとの在庫を合算して確かめる", changed: true },
        { label: "支払いの手続きを済ませる", note: "失敗したら在庫の引き当てを取消す" },
        { label: "発送の指示を倉庫に伝える", note: "倉庫の仕組みへ発送の指示書を送信" },
        { label: "注文した人に完了を伝える", note: "メールと画面の通知で知らせている" },
      ],
      narration: ["在庫を確かめる段で、倉庫ごとの在庫を合算するようにしたのだ。", "ほかの段は変えていないのだ。"],
    },
  ];

  it.each(fullFigures)("$type の図は、上限いっぱいの内容でも縮小なしで収まり、毎回同じ映像になる", async (figure) => {
    // 上限ちょうどの内容であることを確かめておく(check の警告が出ない)
    const script = { ...VideoScriptSchema.parse(JSON.parse(await readFile(path.join(fixtures, "script.json"), "utf8"))), figure };
    expect(checkScript(script, { seconds: 120 }).issues.filter((issue) => issue.at.startsWith("figure"))).toEqual([]);

    const timeline = await buildTimeline(script, new SilentSynthesizer(), { maxSeconds: 120, speed: 1, maxSpeed: 1.3 });
    const index = timeline.scenes.findIndex((scene) => scene.kind === "figure");
    expect(index).toBe(2);
    const audioFile = path.join(dir, `${figure.type}.wav`);
    await writeFile(audioFile, encodeWav(timeline.audio));
    const html = buildHtml({ script, facts, scenes: timeline.scenes, author: "agent", timeZone: "UTC" });
    const stats = await renderVideo(html, {
      outFile: path.join(dir, `${figure.type}.mp4`),
      audioFile,
      duration: timeline.duration,
      fps: 2,
      scale: 0.25,
    });
    expect(stats.fitScales[index]).toBe(1);

    // 図解シーンだけの動画を 2 回作り、全フレームが同じ映像になることを確かめる。
    // Chromium の描画は、文字の縁などがビット単位では一致しないことがあるため(図のないシーンでも起きる)、
    // フレームごとの PSNR の最小値で比べる。要素の有無や位置がずれれば大きく下がる
    const scene = timeline.scenes[index]!;
    const length = scene.end - scene.start;
    const only = [{ ...scene, start: 0, end: length, cues: scene.cues.map((c) => ({ ...c, start: c.start - scene.start, end: c.end - scene.start })) }];
    const sceneAudio = path.join(dir, `${figure.type}-scene.wav`);
    await writeFile(sceneAudio, encodeWav(silence(length, 24_000)));
    const sceneHtml = buildHtml({ script, facts, scenes: only, author: "agent", timeZone: "UTC" });
    const render = async (name: string) => {
      const outFile = path.join(dir, name);
      await renderVideo(sceneHtml, { outFile, audioFile: sceneAudio, duration: length, fps: 8, scale: 0.25 });
      return outFile;
    };
    const [first, second] = [await render(`${figure.type}-scene-1.mp4`), await render(`${figure.type}-scene-2.mp4`)];
    const { stderr } = spawnSync("ffmpeg", ["-hide_banner", "-i", first, "-i", second, "-lavfi", "[0:v][1:v]psnr", "-f", "null", "-"], {
      encoding: "utf8",
    });
    const min = /PSNR .*min:(\S+)/.exec(stderr)?.[1];
    console.log(`${figure.type}: フレームごとの PSNR の最小値 ${min} dB`);
    expect(min === "inf" || Number(min) >= 40, `PSNR の最小値 ${min} dB`).toBe(true);
  });
});
