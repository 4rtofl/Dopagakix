import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inspectReadings, loadReport, saveCheckedReadings, verifyReadings } from "../src/pipeline.js";
import {
  applyReadings,
  BUILTIN_READINGS,
  CHECKED_READINGS_FILE,
  compareReadings,
  loadProjectReadings,
  mergeReadings,
  readingOf,
  resolveReadings,
  reviewReasons,
  speechUnits,
  spelledWords,
} from "../src/script/readings.js";
import { type VideoScript, VideoScriptSchema } from "../src/script/schema.js";
import { VoicevoxClient, VoicevoxSynthesizer } from "../src/tts/voicevox.js";
import { encodeWav, silence } from "../src/tts/wav.js";
import { buildTimeline } from "../src/video/timeline.js";
import { voicevoxAvailable, voicevoxUrl } from "./support.js";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const loadScript = async (): Promise<VideoScript> =>
  VideoScriptSchema.parse(JSON.parse(await readFile(path.join(fixtures, "script.json"), "utf8")));

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "dopagakix-readings-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("applyReadings", () => {
  it("長い表記から順に置き換え、置き換えた読みはもう一度置き換えない", () => {
    const readings = { 行: "くだり", 重複した行: "重複したぎょう", ぎょう: "まちがい" };
    expect(applyReadings("重複した行と次の行を消した。", readings)).toBe("重複したぎょうと次のくだりを消した。");
  });

  it("英数字の表記は、語の一部には当てはめない", () => {
    const readings = { npm: "エヌピーエム", JSON: "ジェイソン" };
    expect(applyReadings("npmとpnpmで入れ、JSONとJSONLを読む。", readings)).toBe("エヌピーエムとpnpmで入れ、ジェイソンとJSONLを読む。");
    expect(applyReadings("変更なし", {})).toBe("変更なし");
  });

  it("組み込みの一覧で、調査で誤読を確かめた語を直す", () => {
    expect(applyReadings("READMEとSKILLの説明を更新したのだ。", BUILTIN_READINGS)).toBe("リードミーとスキルの説明を更新したのだ。");
    expect(applyReadings("行頭と行末の空白を消したのだ。", BUILTIN_READINGS)).toBe("ぎょうとうとぎょうまつの空白を消したのだ。");
    expect(applyReadings("ffmpegとChromiumで描画したのだ。", BUILTIN_READINGS)).toBe("エフエフエムペグとChromiumで描画したのだ。");
  });
});

describe("resolveReadings", () => {
  async function project(readings: unknown): Promise<string> {
    const root = await mkdtemp(path.join(dir, "project-"));
    execFileSync("git", ["init", "-q"], { cwd: root });
    await mkdir(path.join(root, ".dopagakix"));
    await writeFile(path.join(root, ".dopagakix", "readings.json"), JSON.stringify(readings));
    return root;
  }

  it("組み込みの一覧・プロジェクトの辞書・台本の readings の順に、後のものを優先する", async () => {
    const root = await project({ 話速: "はなしそく", 型検査: "かたけんさ", 仕様: "しよう" });
    const script = { ...(await loadScript()), readings: { 仕様: "しよお" } };
    const resolved = await resolveReadings(script, undefined, { cwd: path.join(root), env: {} });
    expect(resolved.readings).toMatchObject({ README: "リードミー", 話速: "はなしそく", 型検査: "かたけんさ", 仕様: "しよお" });
    expect(resolved.projectFile).toBe(path.join(await realRoot(root), ".dopagakix", "readings.json"));
    expect(resolved.recorded).toBe(false);
  });

  it("script.json に記録した指定があれば、それだけを使う(描画し直しても同じ読みにする)", async () => {
    const root = await project({ 話速: "はなしそく" });
    const resolved = await resolveReadings(await loadScript(), { 話速: "わそく" }, { cwd: root, env: {} });
    expect(resolved.readings).toEqual({ 話速: "わそく" });
    expect(resolved.recorded).toBe(true);
  });

  it("1 文字の表記を、どこで指定したかとともに挙げる", async () => {
    const root = await project({ 他: "ほか" });
    const script = { ...(await loadScript()), readings: { 行: "ぎょう", 重複した行: "重複したぎょう" } };
    const resolved = await resolveReadings(script, undefined, { cwd: root, env: {} });
    expect(resolved.singleChars.map((c) => c.key)).toEqual(["他", "行"]);
    expect(resolved.singleChars[1]!.source).toBe("台本の readings");
  });

  it("環境変数で辞書を変えられ、形式の誤りや指定したファイルがないことを伝える", async () => {
    const file = path.join(dir, "team-readings.json");
    await writeFile(file, JSON.stringify({ 冪等: "べきとう" }));
    expect((await loadProjectReadings(dir, { DOPAGAKIX_READINGS: file })).readings).toEqual({ 冪等: "べきとう" });
    await expect(loadProjectReadings(dir, { DOPAGAKIX_READINGS: path.join(dir, "none.json") })).rejects.toThrow(/DOPAGAKIX_READINGS に指定した読みの辞書がありません/);
    await writeFile(file, JSON.stringify({ 冪等: 1 }));
    await expect(loadProjectReadings(dir, { DOPAGAKIX_READINGS: file })).rejects.toThrow(/形式が正しくありません/);
    // git のリポジトリの外で、環境変数もなければ辞書はない
    expect(await loadProjectReadings(os.tmpdir(), {})).toMatchObject({ readings: {} });
  });

  it("台本の readings の空の表記や読みは、形式の誤りにする", async () => {
    const script = { ...(await loadScript()), readings: { 話速: "" } };
    expect(VideoScriptSchema.safeParse(script).success).toBe(false);
    expect(mergeReadings({ a: "1" }, undefined, { a: "2", b: "3" })).toEqual({ a: "2", b: "3" });
  });
});

/** macOS などで一時ディレクトリが別名(シンボリックリンク)のとき、git が返すパスに合わせる */
async function realRoot(dirPath: string): Promise<string> {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: dirPath, encoding: "utf8" }).trim();
}

describe("読みの判定", () => {
  it("AquesTalk 風記法から、アクセント記号を除いた読みを作る", () => {
    expect(readingOf("ハナシソ'クオ/アゲテ/ビョ'オガ/シタ'ノダ")).toBe("ハナシソクオ アゲテ ビョオガ シタノダ");
    expect(readingOf("テ_スト'ワ、ゼ'ンブ")).toBe("テストワ ゼンブ");
  });

  it("4 文字以上の英字の語を、アルファベットの名前の連なりで読んだものを見つける", () => {
    expect(spelledWords("READMEとSKILLの説明を更新したのだ。", "アアルイイエエディイエ'ムイイト/エスケエアイエ'ルエルノ/セツメエオ")).toEqual([
      "README",
      "SKILL",
    ]);
    expect(spelledWords("JSONの形式を確かめたのだ。", "ジェエエスオオエ'ヌノ/ケ'エシキオ")).toEqual(["JSON"]);
    // カタカナ語として読んだもの、3 文字以下の語は挙げない
    expect(spelledWords("GitHubとChromiumとnpmを使ったのだ。", "ギッ'トハブト/クロ'ミウムト/ンプオ")).toEqual([]);
    expect(spelledWords("CLIを使ったのだ。", "シイエ'ルアイオ")).toEqual([]);
  });

  it("英字の 1 文字ずつの読みと「行」を含む文を、要確認にする", () => {
    expect(reviewReasons("READMEを直した。", "アアルイイエエディイエムイイオ/ナオシタ")).toEqual(["「README」を英字 1 文字ずつ読んでいます"]);
    expect(reviewReasons("重複した行を削除した。", "チョオフクシタ/クダリオ")).toEqual(["「行」は文脈で読みが変わります"]);
    // 読みの指定で置き換えた後の文で判定する
    expect(reviewReasons("重複したぎょうを削除した。", "チョオフクシタ/ギョオオ")).toEqual([]);
  });
});

describe("speechUnits", () => {
  it("描画と同じく、表示用に整えた文を字幕 1 枚ごとに分け、元の文の位置を付ける", async () => {
    const script = await loadScript();
    script.work.narration = ["  前半の文です。 ", "", `${"あ".repeat(30)}、${"い".repeat(30)}。`];
    const units = speechUnits(script).filter((unit) => unit.at.startsWith("work"));
    expect(units).toEqual([
      { at: "work.narration[0]", text: "前半の文です。" },
      { at: "work.narration[2]", text: `${"あ".repeat(30)}、` },
      { at: "work.narration[2]", text: `${"い".repeat(30)}。` },
    ]);
  });

  it("図解シーンの読み上げ文も、描画と同じ順(実施した作業の次)で含める", async () => {
    const script = await loadScript();
    script.figure = { type: "flow", title: "流れ", steps: [{ label: "受付" }, { label: "確認", changed: true }], narration: ["図の文です。"] };
    const order = [...new Set(speechUnits(script).map((unit) => unit.at.split(".")[0]))];
    expect(order).toEqual(["opening", "request", "work", "figure", "verification", "decisions", "next_steps"]);
    expect(speechUnits(script)).toContainEqual({ at: "figure.narration[0]", text: "図の文です。" });
  });
});

/** 送られた文をそのまま読み(kana)として返す、偽の VOICEVOX エンジン */
function fakeEngine(kanaOf: (text: string) => string = (text) => text) {
  const queries: string[] = [];
  const syntheses: Array<Record<string, unknown>> = [];
  const fetchImpl = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input));
    switch (url.pathname) {
      case "/speakers":
        return Response.json([{ name: "ずんだもん", speaker_uuid: "z", styles: [{ name: "ノーマル", id: 3 }] }]);
      case "/initialize_speaker":
        return new Response(null, { status: 204 });
      case "/version":
        return Response.json("0.25.2");
      case "/audio_query": {
        const text = url.searchParams.get("text")!;
        queries.push(text);
        return Response.json({ kana: kanaOf(text), speedScale: 1, accent_phrases: [] });
      }
      case "/synthesis":
        syntheses.push(JSON.parse(String(init?.body)));
        return new Response(new Uint8Array(encodeWav(silence(0.3, 24_000))));
      default:
        return new Response("not found", { status: 404 });
    }
  }) as typeof fetch;
  return { fetchImpl, queries, syntheses };
}

describe("確認結果の照合", () => {
  const sentence = (sent: string, reading: string) => ({ at: "work.narration[0]", text: sent, sent, reading });
  const checked = {
    version: 1 as const,
    checkedAt: "2026-11-16T00:00:00.000Z",
    engine: { version: "0.25.2", speaker: 3, name: "ずんだもん" },
    sentences: [sentence("わそくを上げた。", "ワソクオ アゲタ")],
  };

  it("読みが一致すれば問題なし、違えば changed、確認していなければ unchecked にする", () => {
    expect(compareReadings([sentence("わそくを上げた。", "ワソクオ アゲタ")], checked)).toEqual([]);
    expect(compareReadings([sentence("わそくを上げた。", "ワソクオ アゲタノダ")], checked)).toEqual([
      expect.objectContaining({ kind: "changed", expected: "ワソクオ アゲタ", actual: "ワソクオ アゲタノダ" }),
    ]);
    expect(compareReadings([sentence("話速を上げた。", "ハナシソクオ アゲタ")], checked)).toEqual([expect.objectContaining({ kind: "unchecked" })]);
    expect(compareReadings([sentence("わそくを上げた。", "ワソクオ アゲタ")], undefined)).toEqual([expect.objectContaining({ kind: "unchecked" })]);
  });

  it("check の後に読み上げ文を直すと、描画の前にエラーにする。確認済みなら、確かめたクエリで音声を作る", async () => {
    const work = await mkdtemp(path.join(dir, "verify-"));
    const report = path.join(work, "report.json");
    const script = await loadScript();
    script.work.narration = ["話速を上げて描画したのです。"];
    await writeFile(report, JSON.stringify(script));
    const engine = fakeEngine();
    const create = () => VoicevoxSynthesizer.create({ speaker: 3, readings: BUILTIN_READINGS, fetch: engine.fetchImpl });

    // 確認していなければ止める
    await expect(verifyReadings(report, script, await create())).rejects.toThrow(/読みを確かめた記録[\s\S]*がありません[\s\S]*dopagakix check/);

    // check に当たる処理: 全文の読みを調べて保存する
    const inspected = await inspectReadings(script, await create());
    expect(inspected.find((s) => s.at === "work.narration[0]")).toMatchObject({
      text: "話速を上げて描画したのです。",
      sent: "わそくを上げて描画したのです。",
    });
    expect(path.basename(await saveCheckedReadings(report, inspected, { version: "0.25.2", speaker: 3, name: "ずんだもん" }))).toBe(
      CHECKED_READINGS_FILE,
    );

    // 確認済みなら通り、照らし合わせたクエリで音声を作る(字幕は元の表記のまま)
    const synth = await create();
    expect(await verifyReadings(report, script, synth)).toBe(inspected.length);
    const before = engine.queries.length;
    const timeline = await buildTimeline((await loadReport(report)).script, synth, { maxSeconds: 999, speed: 1.25, maxSpeed: 1.45 });
    expect(engine.queries.length).toBe(before);
    expect(engine.syntheses.map((q) => q.kana)).toContain("わそくを上げて描画したのです。");
    expect(timeline.scenes.find((s) => s.kind === "work")!.cues.map((c) => c.text)).toEqual(["話速を上げて描画したのです。"]);

    // 台本を直したら、確認を求める
    script.work.narration = ["話速を上げて描画したのでした。"];
    await expect(verifyReadings(report, script, await create())).rejects.toThrow(
      /一致しない読み上げ文が 1 文[\s\S]*work\.narration\[0\]「話速を上げて描画したのでした。」: 確認していない文です/,
    );

    // エンジンが変わって読みが変わった場合も止める
    const updated = fakeEngine((text) => `${text}!`);
    script.work.narration = ["話速を上げて描画したのです。"];
    const other = await VoicevoxSynthesizer.create({ speaker: 3, readings: BUILTIN_READINGS, fetch: updated.fetchImpl });
    await expect(verifyReadings(report, script, other)).rejects.toThrow(/確認したときは「.*」、今は「.*!」/);
  });
});

/** 調査で誤読を確かめた文(VOICEVOX ENGINE 0.25.2、ずんだもん) */
const MISREAD: Array<{ text: string; wrong: RegExp; right: RegExp }> = [
  { text: "話速を上げて描画したのだ。", wrong: /ハナシソク/, right: /ワソク/ },
  { text: "重複した行を削除したのだ。", wrong: /クダリ/, right: /ギョ[ウオ]/ },
  { text: "行頭と行末の空白を消したのだ。", wrong: /ユクスエ/, right: /ギョ[ウオ]マツ/ },
  { text: "他の画面は直していないのだ。", wrong: /^タノ/, right: /^ホカノ/ },
  { text: "npmで導入できるのだ。", wrong: /^ンプ/, right: /^エヌピ[イー]エム/ },
  { text: "READMEとSKILLの説明を更新したのだ。", wrong: /アアルイイ.*エスケエ/, right: /^リ[イー]ドミ[イー]トスキル/ },
  { text: "JSONの形式を確かめたのだ。", wrong: /ジェエエスオオエヌ/, right: /^ジェ[イエー]ソン/ },
  { text: "ffmpegとChromiumで描画したのだ。", wrong: /^ファンペグ/, right: /^エフエフエムペグ/ },
];

// 実エンジンが動いている環境でだけ実行する(CI の「VOICEVOX との結合」)
describe.runIf(voicevoxAvailable)("読みの確認(実エンジン)", () => {
  const readings = { ...BUILTIN_READINGS, 重複した行: "重複したぎょう" };

  it("readings がなければ誤読し、あれば正しい読みになる。エンジンのユーザー辞書は変えない", async () => {
    const client = new VoicevoxClient(voicevoxUrl);
    const dictBefore = await client.userDict();
    const plain = await VoicevoxSynthesizer.create({ baseUrl: voicevoxUrl, speaker: 3 });
    const fixed = await VoicevoxSynthesizer.create({ baseUrl: voicevoxUrl, speaker: 3, readings });
    for (const { text, wrong, right } of MISREAD) {
      const before = (await plain.inspect(text)).reading.replace(/\s/g, "");
      const after = (await fixed.inspect(text)).reading.replace(/\s/g, "");
      expect(before, text).toMatch(wrong);
      expect(after, text).toMatch(right);
    }
    expect(await client.userDict()).toEqual(dictBefore);
  });

  it("英字の 1 文字ずつの読み(README・SKILL・JSON)と「行」を含む文を要確認にする", async () => {
    const plain = await VoicevoxSynthesizer.create({ baseUrl: voicevoxUrl, speaker: 3 });
    const reasons = async (text: string) => {
      const spoken = await plain.inspect(text);
      return reviewReasons(spoken.sent, spoken.kana).join(" ");
    };
    expect(await reasons("READMEとSKILLの説明を更新したのだ。")).toMatch(/README[\s\S]*SKILL/);
    expect(await reasons("JSONの形式を確かめたのだ。")).toMatch(/JSON/);
    expect(await reasons("重複した行を削除したのだ。")).toMatch(/「行」/);
    expect(await reasons("GitHubとChromiumで確かめたのだ。")).toBe("");
  });
});
