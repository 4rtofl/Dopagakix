import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
/** 音源のファイル(効果音・BGM は利用者が用意し、リポジトリにも npm パッケージにも入れない) */
const AUDIO = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|wma|aiff?)$/i;

describe("音源を同梱しない", () => {
  it("リポジトリに音源のファイルがない", () => {
    const files = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n");
    expect(files.filter((file) => AUDIO.test(file))).toEqual([]);
  });

  it("npm パッケージに音源のファイルがない", () => {
    const [pack] = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: root, encoding: "utf8" })) as Array<{
      files: Array<{ path: string }>;
    }>;
    expect(pack!.files.length).toBeGreaterThan(0);
    expect(pack!.files.map((file) => file.path).filter((file) => AUDIO.test(file))).toEqual([]);
  });
});
