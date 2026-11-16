import { z } from "zod";
import { SessionFactsSchema } from "../facts.js";
export const STATUS_VALUES = ["completed", "partial", "blocked", "failed"];
export const STATUS_LABELS = { completed: "完了", partial: "一部完了", blocked: "判断待ち", failed: "未達成" };
export const CHECK_RESULTS = ["pass", "fail", "not_run"];
const Narration = z
    .array(z.string())
    .describe("このシーンの読み上げ文。字幕にもそのまま表示する。1要素=1文、1〜3文。");
export const FIGURE_TYPES = ["before_after", "flow"];
/**
 * 図の中身の上限。スマートフォンで数秒見て読め、縮小なしで本文枠に収まる量。
 * 形式の誤りでない限り読み込みは通し、超えた分は check で警告し、表示では切り捨てる。
 */
export const FIGURE_LIMITS = {
    title: 20,
    /** before_after の変更前・変更後それぞれの行数と、1 行の文字数 */
    sideLines: 3,
    sideText: 16,
    /** flow の段の数(最小・最大)と、段の名前・補足の文字数 */
    minSteps: 2,
    maxSteps: 5,
    stepLabel: 12,
    stepNote: 16,
    /** 読み上げ文の数 */
    narration: 2,
};
const FigureNarration = z.array(z.string()).describe("図解シーンの読み上げ文。字幕にもそのまま表示する。1要素=1文、1〜2文。");
const FigureTitle = z.string().describe(`図の見出し(全角${FIGURE_LIMITS.title}文字以内)`);
const BeforeAfterFigure = z.object({
    type: z.literal("before_after").describe("振る舞いや構成の変化"),
    title: FigureTitle,
    before: z.array(z.string()).describe(`変更前。1〜${FIGURE_LIMITS.sideLines}行、各全角${FIGURE_LIMITS.sideText}文字以内`),
    after: z.array(z.string()).describe(`変更後。1〜${FIGURE_LIMITS.sideLines}行、各全角${FIGURE_LIMITS.sideText}文字以内`),
    narration: FigureNarration,
});
const FlowFigure = z.object({
    type: z.literal("flow").describe("処理や手順の流れと、今回手を入れた箇所"),
    title: FigureTitle,
    steps: z
        .array(z.object({
        label: z.string().describe(`段の名前(全角${FIGURE_LIMITS.stepLabel}文字以内)`),
        note: z.string().optional().describe(`補足(全角${FIGURE_LIMITS.stepNote}文字以内)`),
        changed: z.boolean().optional().describe("今回変更した段なら true"),
    }))
        .describe(`上から順の段。${FIGURE_LIMITS.minSteps}〜${FIGURE_LIMITS.maxSteps}段。変更した段を1つ以上含める`),
    narration: FigureNarration,
});
/** 図解シーンの中身。配置と描画は dopagakix が受け持つ。数値の欄は設けない(数値はログから集計したものだけを出す) */
export const FigureSchema = z.discriminatedUnion("type", [BeforeAfterFigure, FlowFigure]);
/**
 * 動画の台本。作業をしたエージェント自身が書く(report.json)。画面に出す数値
 * (変更ファイル数など)はここに含めず、ログから機械的に集計した SessionFacts を使う。
 */
export const VideoScriptSchema = z.object({
    title: z.string().describe("動画タイトル。作業内容を表す名詞句(全角20文字以内)"),
    status: z
        .enum(STATUS_VALUES)
        .describe("completed=指示どおり完了 / partial=一部完了・残作業あり / blocked=指示者の判断や情報待ちで停止 / failed=目的を達成できなかった"),
    headline: z.string().describe("結論を一文で(全角40文字以内)"),
    opening: z.object({ narration: Narration }),
    /**
     * 廃止(「ご依頼の内容」のシーンはなくした)。以前の台本や script.json を読めるよう受け付けるが、
     * 表示も読み上げもしない。check は、書かれていれば知らせる。
     */
    request: z.unknown().optional().describe("廃止。書いても動画には表示されない"),
    work: z.object({
        items: z.array(z.string()).describe("実施した主な作業。成果ベースで最大5件、各全角28文字以内"),
        narration: Narration,
    }),
    figure: FigureSchema.optional().describe("任意。文章だけでは伝わりにくい変化や流れを図で示す。書くと「実施した作業」の次に図解シーンが入る"),
    verification: z.object({
        items: z
            .array(z.object({
            label: z.string().describe("テスト・ビルド・動作確認などの内容(全角24文字以内)"),
            result: z.enum(CHECK_RESULTS).describe("pass=成功 / fail=失敗 / not_run=未実施"),
        }))
            .describe("検証の結果。最大4件。ログに実行記録がないものは not_run"),
        narration: Narration,
    }),
    decisions: z.object({
        items: z
            .array(z.object({
            title: z.string().describe("判断・対応してほしいこと(全角24文字以内)"),
            detail: z.string().describe("背景や選択肢(全角50文字以内)"),
        }))
            .describe("指示者に判断・承認・手作業をお願いしたいこと。最大3件。なければ空配列"),
        narration: Narration,
    }),
    next_steps: z.object({
        items: z.array(z.string()).describe("次にやるべきこと。最大3件、各全角28文字以内"),
        narration: Narration,
    }),
    readings: z
        .record(z.string().min(1, "表記が空です"), z.string().min(1, "読みが空です"))
        .optional()
        .describe("読みの指定(表記 → 読み)。VOICEVOX に送る文だけを置き換え、字幕と画面の文字は元の表記のままにする"),
});
export const AUTHORS = ["agent", "manual"];
/**
 * script.json の形式。描画に使った台本と事実情報をまとめて残し、同じ内容で描画し直せるようにする。
 * render は、エージェントが書いた台本(VideoScript)とこの形式のどちらも受け付ける。
 */
export const ScriptFileSchema = z.object({
    version: z.literal(1),
    generatedAt: z.string(),
    /** 台本の書き手。agent=作業をした AI エージェント自身、manual=人が手で書いたもの */
    author: z.enum(AUTHORS).default("agent"),
    /** 読み上げ文の口調(確認に使ったもの。記録用) */
    persona: z.object({ id: z.string(), name: z.string() }).optional(),
    /** 読み上げの有無と話者(記録用。描画し直すときは、その時の指定で読み上げる) */
    voice: z
        .object({ enabled: z.boolean(), speaker: z.number().int().optional(), name: z.string().optional(), style: z.string().optional() })
        .optional(),
    /** 描画に使った読みの指定(組み込み・プロジェクト・台本を合わせた結果)。描画し直しても同じ読みにする */
    readings: VideoScriptSchema.shape.readings,
    /** BGM の設定。描画し直すときも同じ BGM を使う(オプションや環境変数で指定すればそちらを優先) */
    bgm: z.object({ file: z.string(), credit: z.string().optional(), volume: z.number() }).optional(),
    facts: SessionFactsSchema,
    script: VideoScriptSchema,
});
