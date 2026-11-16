import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { VoicevoxClient } from "../src/tts/voicevox.js";
import { canRender, voicevoxAvailable, voicevoxUrl } from "./support.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const example = path.join(root, "examples", "script.example.json");
const transcript = path.join(root, "test", "fixtures", "session.jsonl");
const conversationExample = path.join(root, "examples", "conversation.example.json");

/** ソースの CLI を実行する。接続できない VOICEVOX を指定し、起動コマンドと必須化の設定は外す */
async function run(args: string[], env: Record<string, string> = {}) {
  const base: NodeJS.ProcessEnv = { ...process.env, VOICEVOX_URL: "http://127.0.0.1:59999", ...env };
  delete base.DOPAGAKIX_VOICEVOX_START;
  if (!("DOPAGAKIX_REQUIRE_VOICE" in env)) delete base.DOPAGAKIX_REQUIRE_VOICE;
  try {
    const { stdout, stderr } = await promisify(execFile)(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
      cwd: root,
      env: base,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failed = error as { code: number; stdout: string; stderr: string };
    return { code: failed.code, stdout: failed.stdout, stderr: failed.stderr };
  }
}

describe("CLI: 読み上げを必須にする", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "dopagakix-cli-"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("render は VOICEVOX に接続できなければ、字幕のみに切り替えずに止まり、mp4 を作らない", async () => {
    const out = path.join(dir, "render", "summary.mp4");
    const result = await run(["render", example, "-o", out]);
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/エラー: VOICEVOX エンジン\(http:\/\/127\.0\.0\.1:59999\)に接続できません/);
    expect(result.stdout).toBe("");
    expect(existsSync(out)).toBe(false);
  });

  it("prepare は VOICEVOX に接続できなければ、不足として知らせて終了コード 1 にする", async () => {
    const result = await run(["prepare", "--transcript", transcript, "--out-dir", path.join(dir, "out")]);
    expect(result.code).toBe(1);
    expect(result.stdout).toMatch(/\*\*描画に必要なものが不足しています\(読み上げ[、)]/);
    expect(result.stdout).toMatch(/- 読み上げ: \[不足\] VOICEVOX エンジン\(http:\/\/127\.0\.0\.1:59999\)に接続できません/);
  });

  it("DOPAGAKIX_REQUIRE_VOICE=1 のとき、--no-voice はエラーにする", async () => {
    const out = path.join(dir, "required", "summary.mp4");
    const result = await run(["render", example, "--no-voice", "-o", out], { DOPAGAKIX_REQUIRE_VOICE: "1" });
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/エラー: DOPAGAKIX_REQUIRE_VOICE=1 が設定されているため、--no-voice/);
    expect(existsSync(out)).toBe(false);
    // check も同じ
    expect((await run(["check", example, "--no-voice"], { DOPAGAKIX_REQUIRE_VOICE: "1" })).code).toBe(1);
  });
});

describe("CLI: 読みの確認", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "dopagakix-cli-readings-"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("check は VOICEVOX に接続できなければ、ほかの確認結果を示したうえで、読みを確かめられなかったとエラーにする", async () => {
    const result = await run(["check", example]);
    expect(result.code).toBe(1);
    expect(result.stdout).toMatch(/^形式: 正しい/);
    expect(result.stdout).toMatch(/読み: 確かめられませんでした\(VOICEVOX エンジン\(http:\/\/127\.0\.0\.1:59999\)に接続できません/);
    expect(result.stderr).toMatch(/エラー: 読み上げ文の読みを確かめられませんでした/);
  });

  it("読み上げなし(--no-voice)では、読みの確認を省く", async () => {
    const result = await run(["check", example, "--no-voice"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("読み: 省略(読み上げなし)");
  });

  it("1 文字の表記の読みの指定を警告する", async () => {
    const script = JSON.parse(await readFile(example, "utf8"));
    script.script.readings = { 件: "けん" };
    const file = path.join(dir, "single", "script.json");
    await rm(path.dirname(file), { recursive: true, force: true });
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(script));
    const result = await run(["check", file, "--no-voice"]);
    expect(result.stdout).toMatch(/- readings\["件"\]: 1 文字の表記の読みの指定\(台本の readings\)/);
  });

  // 実エンジンと描画の道具がそろった環境でだけ実行する(CI の「VOICEVOX との結合」)
  it.runIf(voicevoxAvailable && canRender)(
    "check で確かめた後に読み上げ文を直すと render はエラーになり、確かめ直せば描画できる。エンジンのユーザー辞書は変えない",
    { timeout: 300_000 },
    async () => {
      const env = { VOICEVOX_URL: voicevoxUrl };
      const client = new VoicevoxClient(voicevoxUrl);
      const dictBefore = await client.userDict();
      const work = path.join(dir, "flow");
      await mkdir(work, { recursive: true });
      const report = path.join(work, "script.json");
      await copyFile(example, report);
      const out = path.join(work, "summary.mp4");

      // 確認していなければ描画しない
      const unchecked = await run(["render", report, "--fps", "2", "-o", out], env);
      expect(unchecked.code).toBe(1);
      expect(unchecked.stderr).toMatch(/読みを確かめた記録[\s\S]*がありません/);

      const checked = await run(["check", report], env);
      expect(checked.code).toBe(0);
      expect(checked.stdout).toMatch(/読み\(VOICEVOX ENGINE [\d.]+、ずんだもん\): 9 文/);
      expect(checked.stdout).toMatch(/- opening\.narration\[0\]「ログイン画面のバリデーション修正が完了しました。」\n {2}→ ログイン/);
      expect(existsSync(path.join(work, "checked-readings.json"))).toBe(true);

      // check の後に読み上げ文を直すと、確認を求める
      const script = JSON.parse(await readFile(report, "utf8"));
      script.script.work.narration[1] = "あわせてREADMEも更新しています。";
      await writeFile(report, JSON.stringify(script));
      const changed = await run(["render", report, "--fps", "2", "-o", out], env);
      expect(changed.code).toBe(1);
      expect(changed.stderr).toMatch(/一致しない読み上げ文が 1 文[\s\S]*work\.narration\[1\][\s\S]*dopagakix check/);
      expect(existsSync(out)).toBe(false);

      // 確かめ直せば、読みの指定を script.json に記録して描画する
      const again = await run(["check", report], env);
      expect(again.stdout).toContain("(VOICEVOX に送る文: あわせてリードミーも更新しています。)");
      const rendered = await run(["render", report, "--fps", "2", "-o", out], env);
      expect(rendered.code, rendered.stderr).toBe(0);
      expect(rendered.stderr).toMatch(/読み: check で確かめた読みと一致\(9 文\)/);
      expect(existsSync(out)).toBe(true);
      const record = JSON.parse(await readFile(path.join(work, "script.json"), "utf8"));
      expect(record.readings).toMatchObject({ README: "リードミー" });

      expect(await client.userDict()).toEqual(dictBefore);
    },
  );
});

describe("CLI: BGM", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "dopagakix-cli-bgm-"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("曲ファイルが無ければ、音声合成と描画を始める前に分かりやすいエラーにする", async () => {
    const out = path.join(dir, "missing", "summary.mp4");
    const missing = path.join(dir, "none.mp3");
    const result = await run(["render", example, "--no-voice", "--bgm", missing, "-o", out]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`エラー: BGM の曲ファイルが見つかりません: ${missing}`);
    expect(result.stderr).toMatch(/--no-bgm で BGM なしにしてください/);
    expect(result.stderr).not.toMatch(/字幕の時間割り当て|描画/);
    expect(existsSync(path.dirname(out))).toBe(false);
    // 環境変数で指定しても同じ。--no-bgm を付ければ BGM なしで進む(ここでは VOICEVOX がないので読み上げで止まる)
    expect((await run(["render", example, "-o", out], { DOPAGAKIX_BGM: missing })).stderr).toContain("BGM の曲ファイルが見つかりません");
    const without = await run(["render", example, "--no-bgm", "-o", out], { DOPAGAKIX_BGM: missing });
    expect(without.stderr).not.toContain("BGM の曲ファイル");
    expect(without.stderr).toMatch(/VOICEVOX エンジン.*に接続できません/);
  });

  it("prepare は、曲ファイルが無ければ環境の不足として知らせる", async () => {
    const missing = path.join(dir, "none.mp3");
    const result = await run(["prepare", "--no-voice", "--transcript", transcript, "--out-dir", path.join(dir, "out"), "--bgm", missing]);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain(`- BGM: [不足] BGM の曲ファイルが見つかりません: ${missing}`);
    // 案内する render のコマンドに引き継ぐ
    expect(result.stdout).toMatch(new RegExp(`3\\. 描画する: dopagakix render .* --bgm ${missing.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  });

  it("--bgm-volume は dB の数値だけを受け付ける", async () => {
    const bad = await run(["render", example, "--no-voice", "--bgm-volume", "大きめ"]);
    expect(bad.code).not.toBe(0);
    expect(bad.stderr).toMatch(/dB の数値を指定してください/);
  });
});

describe("CLI: 効果音", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "dopagakix-cli-sfx-"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("render は効果音のディレクトリが無ければ、音声合成と描画の前に分かりやすいエラーで止まる", async () => {
    const out = path.join(dir, "render", "summary.mp4");
    const missing = path.join(dir, "no-such-sfx");
    const result = await run(["render", example, "--sfx-dir", missing, "-o", out]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`エラー: 効果音のディレクトリが見つかりません: ${missing}`);
    // VOICEVOX への接続より前に止まる
    expect(result.stderr).not.toContain("VOICEVOX");
    expect(existsSync(out)).toBe(false);
    // 環境変数で指定しても同じ。--no-sfx なら効果音なしで進む(この環境では VOICEVOX で止まる)
    expect((await run(["render", example, "-o", out], { DOPAGAKIX_SFX_DIR: missing })).stderr).toContain("効果音のディレクトリが見つかりません");
    expect((await run(["render", example, "--no-sfx", "-o", out], { DOPAGAKIX_SFX_DIR: missing })).stderr).toMatch(/VOICEVOX エンジン.*に接続できません/);
  });

  it("prepare は効果音の状態を「環境」に出し、指定を render のコマンドに引き継ぐ", async () => {
    const missing = path.join(dir, "no-such-sfx");
    const result = await run([
      "prepare",
      "--transcript",
      transcript,
      "--out-dir",
      path.join(dir, "out"),
      "--sfx-dir",
      missing,
      "--sfx-volume",
      "-6",
      "--sfx-credit",
      "効果音：効果音ラボ",
    ]);
    expect(result.stdout).toContain(`- 効果音: [不足] 効果音のディレクトリが見つかりません: ${missing}`);
    expect(result.stdout).toMatch(/3\. 描画する: dopagakix render .* --sfx-dir \S+no-such-sfx --sfx-credit '効果音：効果音ラボ' --sfx-volume=-6/);
  });
});

describe("CLI: 会話の要約", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "dopagakix-cli-conversation-"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("check は kind: conversation のファイルを会話の要約として確かめる(セッションログは探さない)", async () => {
    const result = await run(["check", conversationExample, "--no-voice", "--persona", "zundamon"]);
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/^形式: 正しい\(「リリース日の見直し」、会話の要約\)/);
    expect(result.stdout).toContain("口調: ずんだもん(文末を確認)");
    expect(result.stdout).toContain("警告: なし");
    expect(result.stdout).not.toContain("数値:");
  });

  it("check --json は結果を JSON で出し、読みを確かめられなければ status: failed にして終了コード 1 にする", async () => {
    const skipped = await run(["check", conversationExample, "--no-voice", "--json"]);
    expect(skipped.code).toBe(0);
    expect(JSON.parse(skipped.stdout)).toMatchObject({
      kind: "conversation",
      title: "リリース日の見直し",
      narration: { sentences: 11, seconds: 60 },
      persona: null,
      issues: [],
      readings: { status: "skipped", reason: "読み上げなし" },
    });

    const failed = await run(["check", conversationExample, "--json"]);
    expect(failed.code).toBe(1);
    expect(JSON.parse(failed.stdout)).toMatchObject({
      readings: { status: "failed", error: expect.stringMatching(/VOICEVOX エンジン\(http:\/\/127\.0\.0\.1:59999\)に接続できません/) },
    });
  });

  it("check --json の警告の at は、ファイルの script の中の位置を指す", async () => {
    const file = JSON.parse(await readFile(conversationExample, "utf8"));
    file.script.scenes[1].items.push("五つ目", "六つ目");
    const target = path.join(dir, "over", "conversation.json");
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, JSON.stringify(file));
    const result = await run(["check", target, "--no-voice", "--json"]);
    expect(JSON.parse(result.stdout).issues).toEqual([{ at: "scenes[1].items", message: "6 件あります。表示されるのは先頭の 5 件だけです。" }]);
  });

  it("形式が正しくなければ、どこが違うかを示してエラーにする", async () => {
    const file = JSON.parse(await readFile(conversationExample, "utf8"));
    delete file.facts.messages;
    const target = path.join(dir, "bad", "conversation.json");
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, JSON.stringify(file));
    const result = await run(["check", target, "--no-voice"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/の形式が正しくありません:[\s\S]*facts\.messages/);
  });

  it("render は VOICEVOX に接続できなければ止まる(字幕のみに切り替えない)", async () => {
    const out = path.join(dir, "voice", "summary.mp4");
    const result = await run(["render", conversationExample, "-o", out]);
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/VOICEVOX エンジン.*に接続できません/);
    expect(existsSync(out)).toBe(false);
  });

  it.runIf(canRender)("render --work-dir は、出力先に動画だけを置く(読み上げなし)", { timeout: 300_000 }, async () => {
    const work = path.join(dir, "work");
    const outputs = path.join(dir, "outputs");
    await mkdir(work, { recursive: true });
    const input = path.join(work, "conversation.json");
    await copyFile(conversationExample, input);
    const result = await run(["render", input, "--no-voice", "--fps", "2", "-o", path.join(outputs, "summary.mp4"), "--work-dir", work]);
    expect(result.code, result.stderr).toBe(0);
    expect(await readdir(outputs)).toEqual(["summary.mp4"]);
    expect((await readdir(work)).sort()).toEqual(["audio.wav", "conversation.json", "narration.wav", "script.json", "timeline.json"]);
    const record = JSON.parse(await readFile(path.join(work, "script.json"), "utf8"));
    expect(record).toMatchObject({ kind: "conversation", version: 1, voice: { enabled: false }, facts: { participants: 4 } });
    // 残した script.json から、同じ形式で描画し直せる
    const again = await run(["check", path.join(work, "script.json"), "--no-voice"]);
    expect(again.code, again.stderr).toBe(0);
  });

  // 実エンジンと描画の道具がそろった環境でだけ実行する(CI の「VOICEVOX との結合」)
  it.runIf(voicevoxAvailable && canRender)("check で読みを確かめてから、読み上げ付きで描画できる", { timeout: 300_000 }, async () => {
    const env = { VOICEVOX_URL: voicevoxUrl };
    const work = path.join(dir, "voiced");
    await mkdir(work, { recursive: true });
    const input = path.join(work, "conversation.json");
    await copyFile(conversationExample, input);
    const checked = await run(["check", input, "--json"], env);
    expect(checked.code, checked.stderr).toBe(0);
    const output = JSON.parse(checked.stdout);
    expect(output).toMatchObject({ kind: "conversation", persona: "ずんだもん", readings: { status: "checked", speaker: { name: "ずんだもん" } } });
    expect(output.readings.sentences[0]).toMatchObject({ at: "opening.narration[0]", text: "来週のリリースを予定どおり出すかについての会話なのだ。" });
    const out = path.join(dir, "voiced-out", "summary.mp4");
    const rendered = await run(["render", input, "--fps", "2", "-o", out, "--work-dir", work], env);
    expect(rendered.code, rendered.stderr).toBe(0);
    expect(rendered.stderr).toMatch(/読み: check で確かめた読みと一致\(\d+ 文\)/);
    expect(await readdir(path.dirname(out))).toEqual(["summary.mp4"]);
  });
});
