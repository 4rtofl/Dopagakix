import { z } from "zod";
/** 会話の要約のファイル(ConversationFileSchema)の版 */
export declare const CONVERSATION_VERSION = 1;
/** シーンの種類。冒頭と締めは毎回入れ、その間に AI が会話に合わせて選んだシーンを並べる */
export declare const CONVERSATION_SCENE_TYPES: readonly ["topic", "flow", "quote", "points", "outcome"];
export type ConversationSceneType = (typeof CONVERSATION_SCENE_TYPES)[number];
/** 各シーンの欄見出し(画面に出す) */
export declare const CONVERSATION_SCENE_LABELS: Record<ConversationSceneType, string>;
/**
 * 件数と文字数(全角)の上限。スマートフォンで数秒見て読め、本文枠に収まる量。作業報告の型にそろえている。
 * 形式の誤りでない限り読み込みは通し、超えた分は check で警告し、件数は表示で切り捨てる。
 */
export declare const CONVERSATION_LIMITS: {
    readonly title: 20;
    readonly headline: 40;
    /** 冒頭と締めの間に並べるシーンの数 */
    readonly minScenes: 3;
    readonly maxScenes: 6;
    /** 話題の見出し */
    readonly heading: 20;
    /** 項目 1 行(話題の説明、流れ、意見、決まったこと・残ったこと) */
    readonly item: 28;
    /** 論点 */
    readonly point: 28;
    readonly topicLines: 2;
    readonly flowItems: 5;
    readonly opinions: 3;
    readonly outcomeItems: 3;
    /** 引用する発言。元の発言をそのまま使うので切り詰めない。長い発言は引用に選ばない */
    readonly quote: 60;
    /** 発言した人の名前 */
    readonly by: 20;
    /** 1 シーンの読み上げ文の数 */
    readonly sentences: 3;
};
export declare const ConversationSceneSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    type: z.ZodLiteral<"topic">;
    heading: z.ZodString;
    lines: z.ZodArray<z.ZodString>;
    narration: z.ZodArray<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"flow">;
    items: z.ZodArray<z.ZodString>;
    narration: z.ZodArray<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"quote">;
    text: z.ZodString;
    by: z.ZodOptional<z.ZodString>;
    narration: z.ZodArray<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"points">;
    point: z.ZodString;
    opinions: z.ZodArray<z.ZodString>;
    narration: z.ZodArray<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"outcome">;
    decided: z.ZodArray<z.ZodString>;
    open: z.ZodArray<z.ZodString>;
    narration: z.ZodArray<z.ZodString>;
}, z.core.$strip>], "type">;
/**
 * 会話の要約の台本。会話を読んだ AI が書く。画面に出す数値(参加者・発言の数・期間)はここに含めず、
 * 発言を集めたプログラムが数えた ConversationFacts を使う(AI の自己申告にしない)。
 */
export declare const ConversationScriptSchema: z.ZodObject<{
    title: z.ZodString;
    headline: z.ZodString;
    opening: z.ZodObject<{
        narration: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
    scenes: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<"topic">;
        heading: z.ZodString;
        lines: z.ZodArray<z.ZodString>;
        narration: z.ZodArray<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"flow">;
        items: z.ZodArray<z.ZodString>;
        narration: z.ZodArray<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"quote">;
        text: z.ZodString;
        by: z.ZodOptional<z.ZodString>;
        narration: z.ZodArray<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"points">;
        point: z.ZodString;
        opinions: z.ZodArray<z.ZodString>;
        narration: z.ZodArray<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"outcome">;
        decided: z.ZodArray<z.ZodString>;
        open: z.ZodArray<z.ZodString>;
        narration: z.ZodArray<z.ZodString>;
    }, z.core.$strip>], "type">>;
    closing: z.ZodObject<{
        narration: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
    readings: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
}, z.core.$strip>;
/**
 * 画面に出す数値。発言を集めたプログラム(Bobert)が、実際に AI に渡した発言から数える。
 */
export declare const ConversationFactsSchema: z.ZodObject<{
    channel: z.ZodOptional<z.ZodString>;
    participants: z.ZodNumber;
    messages: z.ZodNumber;
    firstMessageAt: z.ZodISODateTime;
    lastMessageAt: z.ZodISODateTime;
}, z.core.$strip>;
/**
 * dopagakix check / render に渡すファイル。台本(AI が書く)と数値(プログラムが数える)を別の欄に分けて入れる。
 * render は、描画に使った読みの指定と話者を足して、作業フォルダーの script.json に残す(同じ形式で描画し直せる)。
 */
export declare const ConversationFileSchema: z.ZodObject<{
    kind: z.ZodLiteral<"conversation">;
    version: z.ZodLiteral<1>;
    facts: z.ZodObject<{
        channel: z.ZodOptional<z.ZodString>;
        participants: z.ZodNumber;
        messages: z.ZodNumber;
        firstMessageAt: z.ZodISODateTime;
        lastMessageAt: z.ZodISODateTime;
    }, z.core.$strip>;
    script: z.ZodObject<{
        title: z.ZodString;
        headline: z.ZodString;
        opening: z.ZodObject<{
            narration: z.ZodArray<z.ZodString>;
        }, z.core.$strip>;
        scenes: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
            type: z.ZodLiteral<"topic">;
            heading: z.ZodString;
            lines: z.ZodArray<z.ZodString>;
            narration: z.ZodArray<z.ZodString>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"flow">;
            items: z.ZodArray<z.ZodString>;
            narration: z.ZodArray<z.ZodString>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"quote">;
            text: z.ZodString;
            by: z.ZodOptional<z.ZodString>;
            narration: z.ZodArray<z.ZodString>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"points">;
            point: z.ZodString;
            opinions: z.ZodArray<z.ZodString>;
            narration: z.ZodArray<z.ZodString>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"outcome">;
            decided: z.ZodArray<z.ZodString>;
            open: z.ZodArray<z.ZodString>;
            narration: z.ZodArray<z.ZodString>;
        }, z.core.$strip>], "type">>;
        closing: z.ZodObject<{
            narration: z.ZodArray<z.ZodString>;
        }, z.core.$strip>;
        readings: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    }, z.core.$strip>;
    generatedAt: z.ZodOptional<z.ZodString>;
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
    readings: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
}, z.core.$strip>;
export type ConversationScene = z.infer<typeof ConversationSceneSchema>;
export type ConversationScript = z.infer<typeof ConversationScriptSchema>;
export type ConversationFacts = z.infer<typeof ConversationFactsSchema>;
export type ConversationFile = z.infer<typeof ConversationFileSchema>;
/** JSON がこの形式のファイル(会話の要約)として書かれたものか。形式が正しいかは問わない */
export declare function isConversationFile(json: unknown): boolean;
