import { type Persona } from "../personas.js";
import { type ScriptCheck } from "../script/check.js";
import { type ConversationScript } from "./schema.js";
/** 動画の長さの目安(秒)の既定値 */
export declare const DEFAULT_CONVERSATION_SECONDS = 60;
export interface ConversationCheckOptions {
    /** 読み上げ文の口調(指定すると文末を確かめる) */
    persona?: Persona;
    /** 動画の長さの目安(秒)。既定は 60 */
    seconds?: number;
}
/**
 * 会話の要約の台本を確かめる。描画はできるが見づらくなる点や、決まりに合わない点を警告として返す
 * (形式の誤りは ConversationScriptSchema での読み込みで検出する)。読みの確認(VOICEVOX が要る)は含まない。
 * 警告の at は、台本(script)の中の位置。
 */
export declare function checkConversationScript(script: ConversationScript, options?: ConversationCheckOptions): ScriptCheck;
