import { z } from "zod";
export declare const STATUS_VALUES: readonly ["completed", "partial", "blocked", "failed"];
export declare const STATUS_LABELS: {
    readonly completed: "完了";
    readonly partial: "一部完了";
    readonly blocked: "判断待ち";
    readonly failed: "未達成";
};
export declare const CHECK_RESULTS: readonly ["pass", "fail", "not_run"];
export declare const FIGURE_TYPES: readonly ["before_after", "flow"];
/**
 * 図の中身の上限。スマートフォンで数秒見て読め、縮小なしで本文枠に収まる量。
 * 形式の誤りでない限り読み込みは通し、超えた分は check で警告し、表示では切り捨てる。
 */
export declare const FIGURE_LIMITS: {
    readonly title: 20;
    /** before_after の変更前・変更後それぞれの行数と、1 行の文字数 */
    readonly sideLines: 3;
    readonly sideText: 16;
    /** flow の段の数(最小・最大)と、段の名前・補足の文字数 */
    readonly minSteps: 2;
    readonly maxSteps: 5;
    readonly stepLabel: 12;
    readonly stepNote: 16;
    /** 読み上げ文の数 */
    readonly narration: 2;
};
/** 図解シーンの中身。配置と描画は dopagakix が受け持つ。数値の欄は設けない(数値はログから集計したものだけを出す) */
export declare const FigureSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    type: z.ZodLiteral<"before_after">;
    title: z.ZodString;
    before: z.ZodArray<z.ZodString>;
    after: z.ZodArray<z.ZodString>;
    narration: z.ZodArray<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"flow">;
    title: z.ZodString;
    steps: z.ZodArray<z.ZodObject<{
        label: z.ZodString;
        note: z.ZodOptional<z.ZodString>;
        changed: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>;
    narration: z.ZodArray<z.ZodString>;
}, z.core.$strip>], "type">;
/**
 * 動画の台本。作業をしたエージェント自身が書く(report.json)。画面に出す数値
 * (変更ファイル数など)はここに含めず、ログから機械的に集計した SessionFacts を使う。
 */
export declare const VideoScriptSchema: z.ZodObject<{
    title: z.ZodString;
    status: z.ZodEnum<{
        blocked: "blocked";
        completed: "completed";
        failed: "failed";
        partial: "partial";
    }>;
    headline: z.ZodString;
    opening: z.ZodObject<{
        narration: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
    request: z.ZodOptional<z.ZodUnknown>;
    work: z.ZodObject<{
        items: z.ZodArray<z.ZodString>;
        narration: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
    figure: z.ZodOptional<z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<"before_after">;
        title: z.ZodString;
        before: z.ZodArray<z.ZodString>;
        after: z.ZodArray<z.ZodString>;
        narration: z.ZodArray<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"flow">;
        title: z.ZodString;
        steps: z.ZodArray<z.ZodObject<{
            label: z.ZodString;
            note: z.ZodOptional<z.ZodString>;
            changed: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strip>>;
        narration: z.ZodArray<z.ZodString>;
    }, z.core.$strip>], "type">>;
    verification: z.ZodObject<{
        items: z.ZodArray<z.ZodObject<{
            label: z.ZodString;
            result: z.ZodEnum<{
                fail: "fail";
                not_run: "not_run";
                pass: "pass";
            }>;
        }, z.core.$strip>>;
        narration: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
    decisions: z.ZodObject<{
        items: z.ZodArray<z.ZodObject<{
            title: z.ZodString;
            detail: z.ZodString;
        }, z.core.$strip>>;
        narration: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
    next_steps: z.ZodObject<{
        items: z.ZodArray<z.ZodString>;
        narration: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
    readings: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
}, z.core.$strip>;
export type VideoScript = z.infer<typeof VideoScriptSchema>;
export type Figure = z.infer<typeof FigureSchema>;
export type FigureType = (typeof FIGURE_TYPES)[number];
export type ScriptStatus = (typeof STATUS_VALUES)[number];
export type CheckResult = (typeof CHECK_RESULTS)[number];
export declare const AUTHORS: readonly ["agent", "manual"];
export type Author = (typeof AUTHORS)[number];
/**
 * script.json の形式。描画に使った台本と事実情報をまとめて残し、同じ内容で描画し直せるようにする。
 * render は、エージェントが書いた台本(VideoScript)とこの形式のどちらも受け付ける。
 */
export declare const ScriptFileSchema: z.ZodObject<{
    version: z.ZodLiteral<1>;
    generatedAt: z.ZodString;
    author: z.ZodDefault<z.ZodEnum<{
        agent: "agent";
        manual: "manual";
    }>>;
    persona: z.ZodOptional<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
    }, z.core.$strip>>;
    voice: z.ZodOptional<z.ZodObject<{
        enabled: z.ZodBoolean;
        speaker: z.ZodOptional<z.ZodNumber>;
        name: z.ZodOptional<z.ZodString>;
        style: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    sfx: z.ZodOptional<z.ZodObject<{
        dir: z.ZodString;
        credit: z.ZodOptional<z.ZodString>;
        volume: z.ZodNumber;
    }, z.core.$strip>>;
    readings: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    bgm: z.ZodOptional<z.ZodObject<{
        file: z.ZodString;
        credit: z.ZodOptional<z.ZodString>;
        volume: z.ZodNumber;
    }, z.core.$strip>>;
    facts: z.ZodObject<{
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
    script: z.ZodObject<{
        title: z.ZodString;
        status: z.ZodEnum<{
            blocked: "blocked";
            completed: "completed";
            failed: "failed";
            partial: "partial";
        }>;
        headline: z.ZodString;
        opening: z.ZodObject<{
            narration: z.ZodArray<z.ZodString>;
        }, z.core.$strip>;
        request: z.ZodOptional<z.ZodUnknown>;
        work: z.ZodObject<{
            items: z.ZodArray<z.ZodString>;
            narration: z.ZodArray<z.ZodString>;
        }, z.core.$strip>;
        figure: z.ZodOptional<z.ZodDiscriminatedUnion<[z.ZodObject<{
            type: z.ZodLiteral<"before_after">;
            title: z.ZodString;
            before: z.ZodArray<z.ZodString>;
            after: z.ZodArray<z.ZodString>;
            narration: z.ZodArray<z.ZodString>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"flow">;
            title: z.ZodString;
            steps: z.ZodArray<z.ZodObject<{
                label: z.ZodString;
                note: z.ZodOptional<z.ZodString>;
                changed: z.ZodOptional<z.ZodBoolean>;
            }, z.core.$strip>>;
            narration: z.ZodArray<z.ZodString>;
        }, z.core.$strip>], "type">>;
        verification: z.ZodObject<{
            items: z.ZodArray<z.ZodObject<{
                label: z.ZodString;
                result: z.ZodEnum<{
                    fail: "fail";
                    not_run: "not_run";
                    pass: "pass";
                }>;
            }, z.core.$strip>>;
            narration: z.ZodArray<z.ZodString>;
        }, z.core.$strip>;
        decisions: z.ZodObject<{
            items: z.ZodArray<z.ZodObject<{
                title: z.ZodString;
                detail: z.ZodString;
            }, z.core.$strip>>;
            narration: z.ZodArray<z.ZodString>;
        }, z.core.$strip>;
        next_steps: z.ZodObject<{
            items: z.ZodArray<z.ZodString>;
            narration: z.ZodArray<z.ZodString>;
        }, z.core.$strip>;
        readings: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type ScriptFile = z.infer<typeof ScriptFileSchema>;
