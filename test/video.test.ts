import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildBrief } from "../src/brief.js";
import { excludeOutputs } from "../src/pipeline.js";
import { buildDigest, collectFacts } from "../src/transcript/digest.js";
import { parseTranscript } from "../src/transcript/parse.js";
import type { ParsedSession, SessionEvent } from "../src/transcript/types.js";
import { findVideoSpans } from "../src/transcript/video.js";

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "session.jsonl");
const SESSION = "11111111-2222-3333-4444-555555555555";

/** セッションログの 1 行を作る */
function line(type: "user" | "assistant", time: string, content: unknown, extra: Record<string, unknown> = {}): string {
  const message =
    type === "assistant" ? { id: `msg_${time}`, role: "assistant", model: "claude-opus-5-5", content } : { role: "user", content };
  return JSON.stringify({
    type,
    message,
    isSidechain: false,
    uuid: `${type}-${time}`,
    timestamp: `2026-10-01T${time}.000Z`,
    cwd: "/repo",
    sessionId: SESSION,
    gitBranch: "fix/login-validation",
    ...(type === "user" && typeof content === "string" ? { origin: { kind: "human" } } : {}),
    ...extra,
  });
}

const prompt = (time: string, text: string) => line("user", time, text);
const say = (time: string, text: string) => line("assistant", time, [{ type: "text", text }]);
const call = (time: string, id: string, name: string, input: Record<string, unknown>) =>
  line("assistant", time, [{ type: "tool_use", id, name, input }]);
const result = (time: string, id: string, text: string, isError = false) =>
  line("user", time, [{ type: "tool_result", tool_use_id: id, content: text, is_error: isError }]);

/** 「動画で報告して」から動画を作り終えるまでのターン(指示 1 回・ツール実行 6 回、うちコマンド 4 回・エラー 1 回) */
function videoTurn(start: number, ask = "動画で報告して"): string[] {
  const t = (m: number, s = 0) => `01:${String(start + m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  const id = (name: string) => `toolu_${name}_${start}`;
  return [
    prompt(t(0), ask),
    call(t(0, 5), id("skill"), "Skill", { skill: "video-report" }),
    result(t(0, 6), id("skill"), "Launching skill: video-report"),
    call(t(1), id("prepare"), "Bash", { command: "dopagakix prepare", description: "Prepare" }),
    result(t(1, 10), id("prepare"), "# 動画レポートの準備"),
    call(t(5), id("write"), "Write", { file_path: "/repo/dopagakix-out/20261001-x/report.json", content: "{}\n" }),
    result(t(5, 1), id("write"), "File created successfully"),
    call(t(6), id("check"), "Bash", { command: "dopagakix check dopagakix-out/20261001-x/report.json" }),
    result(t(6, 5), id("check"), "警告: なし"),
    call(t(7), id("render1"), "Bash", { command: "dopagakix render dopagakix-out/20261001-x/report.json" }),
    result(t(8), id("render1"), "Exit code 1\nエラー: 描画に失敗", true),
    call(t(8, 30), id("render2"), "Bash", { command: "dopagakix render dopagakix-out/20261001-x/report.json" }),
    result(t(9), id("render2"), "dopagakix-out/20261001-x/summary.mp4"),
    say(t(9, 10), "動画を作りました。"),
  ];
}

async function workOnly(): Promise<string> {
  return readFile(fixture, "utf8");
}

const factsOf = (jsonl: string) => excludeOutputs(collectFacts(parseTranscript(jsonl)));

/** videoReport を除いた集計値 */
function counted(jsonl: string) {
  const { videoReport: _, ...rest } = factsOf(jsonl);
  return rest;
}

describe("動画の作成の区間を集計から除く", () => {
  it("動画作成のターンを足しても、指示・ツール実行・コマンドの回数、期間、作業時間は作業だけのログと同じ", async () => {
    const work = await workOnly();
    const withVideo = [work.trimEnd(), ...videoTurn(30)].join("\n");

    const base = factsOf(work);
    expect(base).toMatchObject({
      userPrompts: 4,
      toolCalls: 7,
      commandsRun: 3,
      commandsFailed: 1,
      elapsedMinutes: 10,
      activeMinutes: 10,
      endTime: "2026-10-01T01:10:00.000Z",
    });
    expect(base.videoReport).toBeUndefined();

    // 区間を除かなければ数が変わってしまうことを確かめておく
    expect(parseTranscript(withVideo).endTime).toBe("2026-10-01T01:39:10.000Z");

    expect(counted(withVideo)).toEqual(base);
    expect(factsOf(withVideo).videoReport).toEqual({ spans: 1, userPrompts: 1, toolCalls: 6 });
  });

  it("作業と動画の依頼を同じ発言でした場合は、発言を作業の指示として数える", () => {
    const jsonl = [
      prompt("01:00:00", "ログイン画面を直して、終わったら動画で報告して"),
      call("01:01:00", "toolu_edit", "Edit", { file_path: "/repo/src/login.ts", old_string: "a", new_string: "b" }),
      result("01:01:01", "toolu_edit", "updated"),
      call("01:02:00", "toolu_test", "Bash", { command: "npm test" }),
      result("01:02:30", "toolu_test", "ok"),
      call("01:03:00", "toolu_skill", "Skill", { skill: "video-report" }),
      result("01:03:01", "toolu_skill", "ok"),
      call("01:04:00", "toolu_prepare", "Bash", { command: "dopagakix prepare" }),
      result("01:04:10", "toolu_prepare", "ok"),
    ].join("\n");
    const facts = factsOf(jsonl);
    expect(facts).toMatchObject({ userPrompts: 1, toolCalls: 2, commandsRun: 1, endTime: "2026-10-01T01:02:30.000Z" });
    expect(facts.videoReport).toEqual({ spans: 1, userPrompts: 0, toolCalls: 2 });
    expect(facts.files.map((f) => f.path)).toEqual(["src/login.ts"]);
  });

  it("動画を作ったあとの作り直しの依頼(最初のツール実行が台本の編集)も区間に含める", () => {
    const jsonl = [
      prompt("01:00:00", "設定を直して"),
      call("01:01:00", "toolu_edit", "Edit", { file_path: "/repo/src/config.ts", old_string: "a", new_string: "b" }),
      result("01:01:01", "toolu_edit", "updated"),
      ...videoTurn(2),
      prompt("01:20:00", "読み方を直して作り直して"),
      call("01:20:10", "toolu_fix", "Edit", {
        file_path: "/repo/dopagakix-out/20261001-x/report.json",
        old_string: "a",
        new_string: "b",
      }),
      result("01:20:11", "toolu_fix", "updated"),
      call("01:21:00", "toolu_again", "Bash", { command: "dopagakix render dopagakix-out/20261001-x/report.json" }),
      result("01:22:00", "toolu_again", "ok"),
    ].join("\n");
    const facts = factsOf(jsonl);
    expect(facts).toMatchObject({ userPrompts: 1, toolCalls: 1, commandsRun: 0, endTime: "2026-10-01T01:01:01.000Z" });
    expect(facts.videoReport).toEqual({ spans: 2, userPrompts: 2, toolCalls: 8 });
  });

  it("/video-report の指示と dopagakix コマンドを目印にし、動画を作ったあとの作業は数える", () => {
    const jsonl = [
      prompt("01:00:00", "テストを直して"),
      call("01:01:00", "toolu_t1", "Bash", { command: "npm test" }),
      result("01:01:30", "toolu_t1", "ok"),
      prompt("01:02:00", "<command-name>/video-report</command-name>\n<command-args></command-args>"),
      call("01:02:10", "toolu_read", "Read", { file_path: "/repo/README.md" }),
      result("01:02:11", "toolu_read", "..."),
      call("01:03:00", "toolu_p", "Bash", { command: "dopagakix prepare" }),
      result("01:03:10", "toolu_p", "ok"),
      prompt("01:05:00", "動画にして"),
      call("01:05:10", "toolu_p2", "Bash", { command: "dopagakix prepare --session 11111111" }),
      result("01:05:20", "toolu_p2", "ok"),
      prompt("01:08:00", "続けて README も直して"),
      call("01:08:10", "toolu_readme", "Edit", { file_path: "/repo/README.md", old_string: "a", new_string: "b" }),
      result("01:08:11", "toolu_readme", "updated"),
    ].join("\n");
    const facts = factsOf(jsonl);
    expect(facts).toMatchObject({ userPrompts: 2, toolCalls: 2, commandsRun: 1, startTime: "2026-10-01T01:00:00.000Z" });
    expect(facts.endTime).toBe("2026-10-01T01:08:11.000Z");
    expect(facts.videoReport).toEqual({ spans: 2, userPrompts: 2, toolCalls: 3 });
    // 動画の作成の前後は、間隔が短くても作業時間に足さない(01:00〜01:01:30 と 01:08〜01:08:11)
    expect(facts.activeMinutes).toBe(2);
  });

  it("目印にならないもの(dopagakix で始まらないコマンド、出力先の読み込み)では区間を作らない", () => {
    const session: ParsedSession = {
      file: "x",
      cwd: "/repo",
      models: [],
      skippedLines: 0,
      events: [
        { kind: "user_prompt", text: "dopagakix のテストを直して" },
        { kind: "tool_call", id: "1", name: "Bash", input: { command: "npm run dev -- dopagakix prepare" } },
        { kind: "tool_call", id: "2", name: "Read", input: { file_path: "/repo/dopagakix-out/x/report.json" } },
        { kind: "tool_call", id: "3", name: "Skill", input: { skill: "other-skill" } },
      ],
    };
    expect(findVideoSpans(session).spans).toEqual([]);
  });

  it("プラグインのスキル名と、指定した出力先の編集も目印にする", () => {
    const events: SessionEvent[] = [
      { kind: "user_prompt", text: "報告して" },
      { kind: "tool_call", id: "1", name: "Skill", input: { skill: "dopagakix:video-report" } },
      { kind: "user_prompt", text: "台本を直して" },
      { kind: "tool_call", id: "2", name: "Write", input: { file_path: "reports/run/report.json" } },
    ];
    const session: ParsedSession = { file: "x", cwd: "/repo", models: [], skippedLines: 0, events };
    expect(findVideoSpans(session).spans.map((s) => s.start)).toEqual([0]);
    expect(findVideoSpans(session, { outputDirs: ["/repo/reports/run"] }).spans.map((s) => s.start)).toEqual([0, 2]);
  });
});

describe("digest と prepare での扱い", () => {
  it("digest では動画の作成を 1 行にまとめ、指示者の発言として並べない", async () => {
    const work = await workOnly();
    const session = parseTranscript([work.trimEnd(), ...videoTurn(30)].join("\n"));
    const digest = buildDigest(session, collectFacts(session), { timeZone: "UTC" });
    expect(digest.text).toContain("01:30 (動画レポートの作成。報告の対象外。指示 1 回・ツール実行 6 回を省略)");
    expect(digest.text).not.toContain("動画で報告して");
    expect(digest.text).not.toContain("dopagakix render");
    expect(digest.text).not.toContain("動画を作りました");
    // 最終発言は作業の最後の発言
    expect(digest.text).toContain("[AI・最終発言] バリデーションを修正し");
    expect(digest.text).toContain("- 指示者の発言: 4 回 / ツール呼び出し: 7 回");
    expect(digest.text).toContain("- 集計から除いたもの: 動画レポートの作成 1 回(指示 1 回・ツール実行 6 回)");
  });

  it("prepare の「画面に出る数値」に、除外したことを出す", async () => {
    const work = await workOnly();
    const facts = factsOf([work.trimEnd(), ...videoTurn(30)].join("\n"));
    const brief = buildBrief({
      facts,
      reportFile: "dopagakix-out/x/report.json",
      checkCommand: "dopagakix check",
      renderCommand: "dopagakix render",
      digestCommand: "dopagakix digest",
      seconds: 60,
      environment: [],
      readings: { builtin: 0, project: 0 },
      timeZone: "UTC",
    });
    expect(brief).toContain("- 指示 4 回 ・ ツール実行 7 回(コマンド 3 回、うちエラー終了 1 回)");
    expect(brief).toContain("- 動画の作成(指示 1 回・ツール実行 6 回)は除外");
    expect(brief).toContain("期間: 2026/10/01 01:00 – 2026/10/01 01:10");
  });
});
