import { type ConversationFacts, type ConversationScript } from "../conversation/schema.js";
import type { TimedScene } from "./timeline.js";
export interface ConversationTemplateInput {
    /** 表示用に整えた台本(normalizeConversationScript) */
    script: ConversationScript;
    facts: ConversationFacts;
    scenes: TimedScene[];
    credit?: string;
    /** 読み上げなし(字幕のみ)。柱に「音声なし」と出す */
    silent?: boolean;
    timeZone?: string;
}
/** 最初と最後の発言の間の長さ。1 時間未満は分、48 時間未満は時間、それ以上は日 */
export declare function formatSpan(first: string, last: string): {
    value: string;
    unit: string;
};
/** 期間の表示。同じ日なら終わりは時刻だけ、日をまたぐなら月日も付ける */
export declare function formatPeriod(facts: ConversationFacts, timeZone?: string): string;
/** 会話の要約の動画 1 本分のページを作る。フォントは /fonts/ 以下から読み込む前提。 */
export declare function buildConversationHtml(input: ConversationTemplateInput): string;
