import { z } from "zod";
/**
 * セッションログから機械的に集計した事実。LLM の要約とは別に保持し、
 * 画面の数値表示にはこちらだけを使う(数値を LLM に作らせない)。
 */
export declare const FileChangeSchema: z.ZodObject<{
    path: z.ZodString;
    added: z.ZodNumber;
    removed: z.ZodNumber;
    edits: z.ZodNumber;
    created: z.ZodBoolean;
}, z.core.$strip>;
/** 集計から除いた、動画レポートの作成の区間 */
export declare const VideoReportExclusionSchema: z.ZodObject<{
    spans: z.ZodNumber;
    userPrompts: z.ZodNumber;
    toolCalls: z.ZodNumber;
}, z.core.$strip>;
export declare const SessionFactsSchema: z.ZodObject<{
    sessionId: z.ZodOptional<z.ZodString>;
    title: z.ZodOptional<z.ZodString>;
    project: z.ZodOptional<z.ZodString>;
    cwd: z.ZodOptional<z.ZodString>;
    branch: z.ZodOptional<z.ZodString>;
    startTime: z.ZodOptional<z.ZodString>;
    endTime: z.ZodOptional<z.ZodString>;
    elapsedMinutes: z.ZodOptional<z.ZodNumber>;
    activeMinutes: z.ZodOptional<z.ZodNumber>;
    userPrompts: z.ZodNumber;
    toolCalls: z.ZodNumber;
    toolCounts: z.ZodRecord<z.ZodString, z.ZodNumber>;
    commandsRun: z.ZodNumber;
    commandsFailed: z.ZodNumber;
    files: z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        added: z.ZodNumber;
        removed: z.ZodNumber;
        edits: z.ZodNumber;
        created: z.ZodBoolean;
    }, z.core.$strip>>;
    models: z.ZodArray<z.ZodString>;
    videoReport: z.ZodOptional<z.ZodObject<{
        spans: z.ZodNumber;
        userPrompts: z.ZodNumber;
        toolCalls: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type FileChange = z.infer<typeof FileChangeSchema>;
export type VideoReportExclusion = z.infer<typeof VideoReportExclusionSchema>;
export type SessionFacts = z.infer<typeof SessionFactsSchema>;
