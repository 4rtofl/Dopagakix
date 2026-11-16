import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
      expect(checked.stdout).toMatch(/読み\(VOICEVOX ENGINE [\d.]+、ずんだもん\): 7 文/);
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
      expect(rendered.stderr).toMatch(/読み: check で確かめた読みと一致\(7 文\)/);
      expect(existsSync(out)).toBe(true);
      const record = JSON.parse(await readFile(path.join(work, "script.json"), "utf8"));
      expect(record.readings).toMatchObject({ README: "リードミー" });

      expect(await client.userDict()).toEqual(dictBefore);
    },
  );
});
