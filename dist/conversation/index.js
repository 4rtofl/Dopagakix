/*
 * 会話の要約の台本の型と確認の処理。ほかのプログラム(Bobert など)から `dopagakix/conversation` として読み込む。
 *
 * Cloudflare Workers でも動くよう、ここから読み込むものは zod と、Node.js の機能(fs・child_process・path・
 * process・Buffer など)に頼らないファイルだけにする(test/conversation-entry.test.ts で確かめる)。
 * 読みの確認は VOICEVOX が要るので含めない(dopagakix check で行う)。
 */
import { z } from "zod";
import { ConversationFileSchema, ConversationScriptSchema } from "./schema.js";
export { checkConversationScript, DEFAULT_CONVERSATION_SECONDS } from "./check.js";
export { conversationNarrations, normalizeConversationScript } from "./normalize.js";
export { CONVERSATION_LIMITS, CONVERSATION_SCENE_LABELS, CONVERSATION_SCENE_TYPES, CONVERSATION_VERSION, ConversationFactsSchema, ConversationFileSchema, ConversationSceneSchema, ConversationScriptSchema, } from "./schema.js";
export { narrationBudget } from "../script/check.js";
export { BUILTIN_PERSONAS, checkEndings, findPersona, PersonaSchema, ZUNDAMON } from "../personas.js";
function parseWith(schema, json) {
    const parsed = schema.safeParse(json);
    return parsed.success ? { success: true, data: parsed.data } : { success: false, error: z.prettifyError(parsed.error) };
}
/** AI が書いた台本を読み込む。形式が正しくなければ、AI に返せる文の形で誤りを返す */
export function parseConversationScript(json) {
    return parseWith(ConversationScriptSchema, json);
}
/** dopagakix check / render に渡すファイル(台本と数値)を読み込む */
export function parseConversationFile(json) {
    return parseWith(ConversationFileSchema, json);
}
/** 台本の JSON Schema。AI に台本の形を伝えるのに使う(各欄の説明に文字数の上限などを書いてある) */
export function conversationScriptJsonSchema() {
    return z.toJSONSchema(ConversationScriptSchema);
}
