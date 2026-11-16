import { isOutputPath } from "../output.js";
import { str } from "./parse.js";
import type { ParsedSession, SessionEvent } from "./types.js";

type ToolCall = Extract<SessionEvent, { kind: "tool_call" }>;

/** 動画レポートのスキルの名前 */
export const VIDEO_SKILL = "video-report";

const EDIT_TOOLS = new Set(["Edit", "MultiEdit", "Write", "NotebookEdit"]);
/** `/video-report` の指示(プラグインから入れた場合は `/プラグイン名:video-report`) */
const VIDEO_COMMAND = new RegExp(`^/(?:[\\w.-]+:)?${VIDEO_SKILL}(?:\\s|$)`);
const DOPAGAKIX_COMMAND = /^\s*dopagakix(?:\s|$)/;

/** 動画の作成の区間。session.events の start 番目から end 番目の直前まで */
export interface VideoSpan {
  start: number;
  end: number;
  /** 区間に含まれる指示者の発言の数 */
  userPrompts: number;
  /** 区間に含まれるツール実行の数 */
  toolCalls: number;
}

export interface VideoSpans {
  spans: VideoSpan[];
  /** 区間に含まれるイベントの位置 */
  excluded: Set<number>;
}

export interface VideoSpanOptions {
  /** 報告の台本などを置くディレクトリ。ここのファイルの編集も動画の作成とみなす */
  outputDirs?: string[];
}

function isVideoCall(call: ToolCall, cwd: string, outputDirs: string[]): boolean {
  const input = call.input;
  if (call.name === "Skill") {
    const skill = str(input.skill) ?? str(input.command) ?? "";
    return skill.replace(/^\//, "").split(":").at(-1) === VIDEO_SKILL;
  }
  if (call.name === "Bash") return DOPAGAKIX_COMMAND.test(str(input.command) ?? "");
  if (EDIT_TOOLS.has(call.name)) {
    const file = str(input.file_path) ?? str(input.notebook_path);
    return file !== undefined && isOutputPath(file, cwd, outputDirs);
  }
  return false;
}

function isMarker(event: SessionEvent, cwd: string, outputDirs: string[]): boolean {
  if (event.kind === "user_prompt") return VIDEO_COMMAND.test(event.text.trim());
  if (event.kind === "tool_call") return isVideoCall(event, cwd, outputDirs);
  return false;
}

/**
 * 動画レポートを作っていた区間を見つける。報告の対象(作業)ではないので、集計とダイジェストから除く。
 *
 * 1 つのターン(指示者の発言から次の発言の直前まで)の中で、最初の目印からターンの終わりまでを区間とする。
 * 目印は、video-report スキルの呼び出し、`/video-report` の指示、`dopagakix` コマンドの実行、
 * 出力先のファイルの編集。ターンの最初のツール実行が目印なら、そのターンの指示者の発言も区間に含める
 * (「動画で報告して」「読み方を直して作り直して」など)。先に作業のツール実行があれば、
 * 発言は作業の指示として数える(「X を直して、終わったら動画で報告して」など)。
 */
export function findVideoSpans(session: ParsedSession, options: VideoSpanOptions = {}): VideoSpans {
  const { events } = session;
  const cwd = session.cwd ?? process.cwd();
  const outputDirs = options.outputDirs ?? [];

  const turnStarts = [0];
  events.forEach((event, i) => {
    if (event.kind === "user_prompt" && i > 0) turnStarts.push(i);
  });

  const spans: VideoSpan[] = [];
  const excluded = new Set<number>();
  turnStarts.forEach((turnStart, t) => {
    const turnEnd = turnStarts[t + 1] ?? events.length;
    let marker = -1;
    let firstCall = -1;
    for (let i = turnStart; i < turnEnd; i++) {
      const event = events[i]!;
      if (event.kind === "tool_call" && firstCall < 0) firstCall = i;
      if (isMarker(event, cwd, outputDirs)) {
        marker = i;
        break;
      }
    }
    if (marker < 0) return;

    const hasPrompt = events[turnStart]!.kind === "user_prompt";
    const start = hasPrompt && (marker === turnStart || marker === firstCall) ? turnStart : marker;
    const span: VideoSpan = { start, end: turnEnd, userPrompts: 0, toolCalls: 0 };
    for (let i = start; i < turnEnd; i++) {
      excluded.add(i);
      const kind = events[i]!.kind;
      if (kind === "user_prompt") span.userPrompts++;
      else if (kind === "tool_call") span.toolCalls++;
    }
    spans.push(span);
  });
  return { spans, excluded };
}

