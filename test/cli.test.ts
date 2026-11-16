import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
