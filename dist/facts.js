import { z } from "zod";
/**
 * セッションログから機械的に集計した事実。LLM の要約とは別に保持し、
 * 画面の数値表示にはこちらだけを使う(数値を LLM に作らせない)。
 */
export const FileChangeSchema = z.object({
    path: z.string(),
    added: z.number(),
    removed: z.number(),
    edits: z.number(),
    created: z.boolean(),
});
/** 集計から除いた、動画レポートの作成の区間 */
export const VideoReportExclusionSchema = z.object({
    /** 区間の数(動画を作った回数) */
    spans: z.number(),
    userPrompts: z.number(),
    toolCalls: z.number(),
});
export const SessionFactsSchema = z.object({
    sessionId: z.string().optional(),
    title: z.string().optional(),
    project: z.string().optional(),
    cwd: z.string().optional(),
    branch: z.string().optional(),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    /** 開始から終了までの時間(放置していた時間も含む) */
    elapsedMinutes: z.number().optional(),
    /** 作業時間の推定。15 分を超える間隔(放置)を除いて合計したもの */
    activeMinutes: z.number().optional(),
    userPrompts: z.number(),
    toolCalls: z.number(),
    toolCounts: z.record(z.string(), z.number()),
    commandsRun: z.number(),
    commandsFailed: z.number(),
    files: z.array(FileChangeSchema),
    models: z.array(z.string()),
    /** 集計から除いた動画の作成(なければ省略)。期間・作業時間・指示・ツール実行・コマンドの数に含めていない */
    videoReport: VideoReportExclusionSchema.optional(),
});
