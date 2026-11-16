/*
 * 会話の要約の台本の型と確認の処理。ほかのプログラム(Bobert など)から `dopagakix/conversation` として読み込む。
 *
 * Cloudflare Workers でも動くよう、ここから読み込むものは zod と、Node.js の機能(fs・child_process・path・
 * process・Buffer など)に頼らないファイルだけにする(test/conversation-entry.test.ts で確かめる)。
 * 読みの確認は VOICEVOX が要るので含めない(dopagakix check で行う)。
 */
import { z } from "zod";
import { ConversationFileSchema, ConversationScriptSchema } from "./schema.js";

export { checkConversationScript, type ConversationCheckOptions, DEFAULT_CONVERSATION_SECONDS } from "./check.js";
export { conversationNarrations, normalizeConversationScript } from "./normalize.js";
export {
  CONVERSATION_LIMITS,
  CONVERSATION_SCENE_LABELS,
  CONVERSATION_SCENE_TYPES,
  CONVERSATION_VERSION,
  type ConversationFacts,
  ConversationFactsSchema,
  type ConversationFile,
  ConversationFileSchema,
  type ConversationScene,
  ConversationSceneSchema,
  type ConversationSceneType,
  type ConversationScript,
  ConversationScriptSchema,
} from "./schema.js";
export { narrationBudget, type ScriptCheck, type ScriptIssue } from "../script/check.js";
export { BUILTIN_PERSONAS, checkEndings, findPersona, type Persona, PersonaSchema, ZUNDAMON } from "../personas.js";

export type ParseResult<T> = { success: true; data: T } | { success: false; error: string };

function parseWith<T>(schema: z.ZodType<T>, json: unknown): ParseResult<T> {
  const parsed = schema.safeParse(json);
  return parsed.success ? { success: true, data: parsed.data } : { success: false, error: z.prettifyError(parsed.error) };
}

/** AI が書いた台本を読み込む。形式が正しくなければ、AI に返せる文の形で誤りを返す */
export function parseConversationScript(json: unknown): ParseResult<z.infer<typeof ConversationScriptSchema>> {
  return parseWith(ConversationScriptSchema, json);
}

/** dopagakix check / render に渡すファイル(台本と数値)を読み込む */
export function parseConversationFile(json: unknown): ParseResult<z.infer<typeof ConversationFileSchema>> {
  return parseWith(ConversationFileSchema, json);
}

/** 台本の JSON Schema。AI に台本の形を伝えるのに使う(各欄の説明に文字数の上限などを書いてある) */
export function conversationScriptJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(ConversationScriptSchema) as Record<string, unknown>;
}
