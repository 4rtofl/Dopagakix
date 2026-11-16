import { z } from "zod";

/*
 * 会話の要約の台本と、画面に出す数値の型。Bobert(Cloudflare Workers)が取り込んで台本を確かめるため、
 * このファイルから読み込むものは Node.js の機能に頼らない(src/conversation/index.ts を参照)。
 *
 * 互換性の決まり(README の「互換性の決まり」): ここの型は、壊す形で変えない。
 * 欄を足すときは任意の欄にし、必須の欄を足す・欄をなくす・値の範囲を狭めるときは CONVERSATION_VERSION を上げ、
 * 古い版も受け付ける。
 */

/** 会話の要約のファイル(ConversationFileSchema)の版 */
export const CONVERSATION_VERSION = 1;

/** シーンの種類。冒頭と締めは毎回入れ、その間に AI が会話に合わせて選んだシーンを並べる */
export const CONVERSATION_SCENE_TYPES = ["topic", "flow", "quote", "points", "outcome"] as const;
export type ConversationSceneType = (typeof CONVERSATION_SCENE_TYPES)[number];

/** 各シーンの欄見出し(画面に出す) */
export const CONVERSATION_SCENE_LABELS: Record<ConversationSceneType, string> = {
  topic: "話題",
  flow: "話の流れ",
  quote: "印象に残った発言",
  points: "論点",
  outcome: "結論",
};

/**
 * 件数と文字数(全角)の上限。スマートフォンで数秒見て読め、本文枠に収まる量。作業報告の型にそろえている。
 * 形式の誤りでない限り読み込みは通し、超えた分は check で警告し、件数は表示で切り捨てる。
 */
export const CONVERSATION_LIMITS = {
  title: 20,
  headline: 40,
  /** 冒頭と締めの間に並べるシーンの数 */
  minScenes: 3,
  maxScenes: 6,
  /** 話題の見出し */
  heading: 20,
  /** 項目 1 行(話題の説明、流れ、意見、決まったこと・残ったこと) */
  item: 28,
  /** 論点 */
  point: 28,
  topicLines: 2,
  flowItems: 5,
  opinions: 3,
  outcomeItems: 3,
  /** 引用する発言。元の発言をそのまま使うので切り詰めない。長い発言は引用に選ばない */
  quote: 60,
  /** 発言した人の名前 */
  by: 20,
  /** 1 シーンの読み上げ文の数 */
  sentences: 3,
} as const;

const Narration = z.array(z.string()).describe("このシーンの読み上げ文。字幕にもそのまま表示する。1要素=1文、1〜3文。");
const L = CONVERSATION_LIMITS;

const TopicScene = z.object({
  type: z.literal("topic").describe("話題: 何について話していたか。どの会話にも向く"),
  heading: z.string().describe(`話題の見出し(全角${L.heading}文字以内)`),
  lines: z.array(z.string()).describe(`話題の説明。1〜${L.topicLines}行、各全角${L.item}文字以内`),
  narration: Narration,
});

const FlowScene = z.object({
  type: z.literal("flow").describe("話の流れ: 主な発言や出来事を時間の順に。報告・相談に向く"),
  items: z.array(z.string()).describe(`主な発言や出来事。時間の順に最大${L.flowItems}件、各全角${L.item}文字以内`),
  narration: Narration,
});

const QuoteScene = z.object({
  type: z.literal("quote").describe("印象に残った発言: 1件。雑談に向く"),
  text: z
    .string()
    .describe(`元の発言をそのまま(全角${L.quote}文字以内)。言い換えた文・要約した文・一部を変えた文は書かない。長い発言は選ばない`),
  by: z.string().optional().describe(`発言した人の名前(全角${L.by}文字以内)。書けば画面に出す。省略すると名前を出さない`),
  narration: Narration,
});

const PointsScene = z.object({
  type: z.literal("points").describe("論点: 1つの論点と、出た意見。議論に向く"),
  point: z.string().describe(`論点(全角${L.point}文字以内)`),
  opinions: z.array(z.string()).describe(`出た意見。最大${L.opinions}件、各全角${L.item}文字以内`),
  narration: Narration,
});

const OutcomeScene = z.object({
  type: z.literal("outcome").describe("結論: 決まったことと、残ったこと。議論・相談に向く"),
  decided: z.array(z.string()).describe(`決まったこと。最大${L.outcomeItems}件、各全角${L.item}文字以内。なければ空配列`),
  open: z.array(z.string()).describe(`決まらずに残ったこと。最大${L.outcomeItems}件、各全角${L.item}文字以内。なければ空配列`),
  narration: Narration,
});

export const ConversationSceneSchema = z.discriminatedUnion("type", [TopicScene, FlowScene, QuoteScene, PointsScene, OutcomeScene]);

/**
 * 会話の要約の台本。会話を読んだ AI が書く。画面に出す数値(参加者・発言の数・期間)はここに含めず、
 * 発言を集めたプログラムが数えた ConversationFacts を使う(AI の自己申告にしない)。
 */
export const ConversationScriptSchema = z.object({
  title: z.string().describe(`動画のタイトル。会話の話題を表す名詞句(全角${L.title}文字以内)`),
  headline: z.string().describe(`会話の要旨を一文で(全角${L.headline}文字以内)`),
  opening: z.object({ narration: Narration }).describe("冒頭。何についての会話かを伝える"),
  scenes: z
    .array(ConversationSceneSchema)
    .describe(`冒頭と締めの間に並べるシーン。会話に合う種類を選び、${L.minScenes}〜${L.maxScenes}シーン。同じ種類を繰り返してもよい`),
  closing: z.object({ narration: Narration }).describe("締め。画面には「以上」と、AI による要約であることを出す"),
  readings: z
    .record(z.string().min(1, "表記が空です"), z.string().min(1, "読みが空です"))
    .optional()
    .describe("読みの指定(表記 → 読み)。VOICEVOX に送る文だけを置き換え、字幕と画面の文字は元の表記のままにする"),
});

/** 日時(ISO 8601。タイムゾーンの指定を含む) */
const DateTime = z.iso.datetime({ offset: true });

/**
 * 画面に出す数値。発言を集めたプログラム(Bobert)が、実際に AI に渡した発言から数える。
 */
export const ConversationFactsSchema = z.object({
  /** チャンネルまたはスレッドの名前(例: #雑談)。画面の下の柱に出す */
  channel: z.string().optional(),
  /** 発言した人の数 */
  participants: z.number().int().nonnegative(),
  /** 発言の数 */
  messages: z.number().int().nonnegative(),
  /** 最初と最後の発言の日時 */
  firstMessageAt: DateTime,
  lastMessageAt: DateTime,
});

/**
 * dopagakix check / render に渡すファイル。台本(AI が書く)と数値(プログラムが数える)を別の欄に分けて入れる。
 * render は、描画に使った読みの指定と話者を足して、作業フォルダーの script.json に残す(同じ形式で描画し直せる)。
 */
export const ConversationFileSchema = z.object({
  kind: z.literal("conversation"),
  version: z.literal(CONVERSATION_VERSION),
  facts: ConversationFactsSchema,
  script: ConversationScriptSchema,
  /** 以下は render が書く記録。渡すファイルには書かなくてよい */
  generatedAt: z.string().optional(),
  /** 読み上げ文の口調(記録用) */
  persona: z.object({ id: z.string(), name: z.string() }).optional(),
  /** 読み上げの有無と話者(記録用。描画し直すときは、その時の指定で読み上げる) */
  voice: z
    .object({ enabled: z.boolean(), speaker: z.number().int().optional(), name: z.string().optional(), style: z.string().optional() })
    .optional(),
  /** 描画に使った読みの指定(組み込み・プロジェクト・台本を合わせた結果)。描画し直しても同じ読みにする */
  readings: ConversationScriptSchema.shape.readings,
});

export type ConversationScene = z.infer<typeof ConversationSceneSchema>;
export type ConversationScript = z.infer<typeof ConversationScriptSchema>;
export type ConversationFacts = z.infer<typeof ConversationFactsSchema>;
export type ConversationFile = z.infer<typeof ConversationFileSchema>;

/** JSON がこの形式のファイル(会話の要約)として書かれたものか。形式が正しいかは問わない */
export function isConversationFile(json: unknown): boolean {
  return json !== null && typeof json === "object" && (json as { kind?: unknown }).kind === "conversation";
}
