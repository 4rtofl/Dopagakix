import { z } from "zod";
import { ConversationFileSchema, ConversationScriptSchema } from "./schema.js";
export { checkConversationScript, type ConversationCheckOptions, DEFAULT_CONVERSATION_SECONDS } from "./check.js";
export { conversationNarrations, normalizeConversationScript } from "./normalize.js";
export { CONVERSATION_LIMITS, CONVERSATION_SCENE_LABELS, CONVERSATION_SCENE_TYPES, CONVERSATION_VERSION, type ConversationFacts, ConversationFactsSchema, type ConversationFile, ConversationFileSchema, type ConversationScene, ConversationSceneSchema, type ConversationSceneType, type ConversationScript, ConversationScriptSchema, } from "./schema.js";
export { narrationBudget, type ScriptCheck, type ScriptIssue } from "../script/check.js";
export { BUILTIN_PERSONAS, checkEndings, findPersona, type Persona, PersonaSchema, ZUNDAMON } from "../personas.js";
export type ParseResult<T> = {
    success: true;
    data: T;
} | {
    success: false;
    error: string;
};
/** AI が書いた台本を読み込む。形式が正しくなければ、AI に返せる文の形で誤りを返す */
export declare function parseConversationScript(json: unknown): ParseResult<z.infer<typeof ConversationScriptSchema>>;
/** dopagakix check / render に渡すファイル(台本と数値)を読み込む */
export declare function parseConversationFile(json: unknown): ParseResult<z.infer<typeof ConversationFileSchema>>;
/** 台本の JSON Schema。AI に台本の形を伝えるのに使う(各欄の説明に文字数の上限などを書いてある) */
export declare function conversationScriptJsonSchema(): Record<string, unknown>;
