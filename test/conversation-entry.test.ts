import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as {
  exports: Record<string, { types: string; default: string }>;
};
const entry = path.join(root, pkg.exports["./conversation"]!.default);

/** import / export … from の読み込み先(動的な import も含む) */
function specifiers(code: string): string[] {
  const found = new Set<string>();
  for (const pattern of [/\bfrom\s*["']([^"']+)["']/g, /\bimport\s*["']([^"']+)["']/g, /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g]) {
    for (const match of code.matchAll(pattern)) found.add(match[1]!);
  }
  return [...found];
}

/** 入口から相対パスでたどれるファイルを、すべて集める */
async function graph(file: string, seen = new Map<string, string>()): Promise<Map<string, string>> {
  if (seen.has(file)) return seen;
  const code = await readFile(file, "utf8");
  seen.set(file, code);
  for (const spec of specifiers(code)) {
    if (spec.startsWith(".")) await graph(path.resolve(path.dirname(file), spec), seen);
  }
  return seen;
}

/*
 * Bobert(Cloudflare Workers)が `dopagakix/conversation` を読み込むため、その入口からたどれるファイルが
 * Node.js にしかない機能に頼らないことを確かめる。dist/ はソースからビルドした結果と一致することを
 * dist.test.ts で確かめているので、ここでは dist/ を調べる。
 */
describe("dopagakix/conversation の入口", () => {
  it("package.json の exports で、型と一緒に出している", async () => {
    const types = path.join(root, pkg.exports["./conversation"]!.types);
    await expect(readFile(types, "utf8")).resolves.toContain("ConversationScriptSchema");
  });

  it("読み込む外部のパッケージは zod だけで、Node.js の組み込みモジュールを読み込まない", async () => {
    const files = await graph(entry);
    const external = [...files.values()].flatMap(specifiers).filter((spec) => !spec.startsWith("."));
    expect(new Set(external)).toEqual(new Set(["zod"]));
    expect(files.size).toBeGreaterThan(3);
  });

  it("Node.js にしかないグローバル(process・Buffer・require など)を使わない", async () => {
    const files = await graph(entry);
    for (const [file, code] of files) {
      // コメントの中は除く
      const body = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
      expect(body, path.relative(root, file)).not.toMatch(/\b(?:process|Buffer|require|__dirname|__filename)\b/);
    }
  });

  it("ビルドした入口から、同梱の例の台本を確かめられる", async () => {
    const mod = (await import(pathToFileURL(entry).href)) as typeof import("../src/conversation/index.js");
    const json = JSON.parse(await readFile(path.join(root, "examples", "conversation.example.json"), "utf8")) as { script: unknown };
    const parsed = mod.parseConversationScript(json.script);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(mod.checkConversationScript(parsed.data, { persona: mod.ZUNDAMON }).issues).toEqual([]);
    expect(mod.parseConversationFile(json).success).toBe(true);
    // AI に台本の形を伝えるための JSON Schema
    const schema = mod.conversationScriptJsonSchema() as { properties: Record<string, unknown>; required: string[] };
    expect(Object.keys(schema.properties)).toEqual(expect.arrayContaining(["title", "headline", "opening", "scenes", "closing"]));
    expect(schema.required).not.toContain("readings");
  });
});
