/*
 * 自由形式の動画の型と確認の処理。ほかのプログラムから `dopagakix/free` として読み込む。
 *
 * Cloudflare Workers でも動くよう、ここから読み込むものは zod と、Node.js の機能(fs・child_process・path・
 * process・Buffer など)に頼らないファイルだけにする(test/free-entry.test.ts で確かめる)。
 * ファイル(書体、CSS、画像)の確認と、読みの確認(VOICEVOX が要る)は含めない(dopagakix check で行う)。
 */
import { z } from "zod";
import { FormatSchema, resolveFormat } from "./format.js";
import { FreeFileSchema, FreeScriptSchema, freeScriptSchema } from "./schema.js";
export { checkFormatDefinition, checkFreeFile, DEFAULT_FREE_SECONDS } from "./check.js";
export { checkFormat, contrastRatio, DEFAULT_FREE_LIMITS, defaultFormatDefinition, FORMAT_VERSION, FormatSchema, MIN_CONTRAST, resolveFormat, } from "./format.js";
export { freeNarrations, normalizeFreeScript } from "./normalize.js";
export { FREE_SCENE_TYPES, FREE_VERSION, FreeFactsSchema, FreeFigureSchema, FreeFileSchema, FreeScriptSchema, freeScriptSchema, GROUP_MARKS, LIST_MARKS, } from "./schema.js";
export { COLOR_TOKENS, DEFAULT_COLORS } from "../video/tokens.js";
export { DEFAULT_MOTION } from "../video/motion.js";
export { narrationBudget } from "../script/check.js";
export { BUILTIN_PERSONAS, checkEndings, findPersona, PersonaSchema, ZUNDAMON } from "../personas.js";
function parseWith(schema, json) {
    const parsed = schema.safeParse(json);
    return parsed.success ? { success: true, data: parsed.data } : { success: false, error: z.prettifyError(parsed.error) };
}
/** AI が書いた台本を読み込む。形式が正しくなければ、AI に返せる文の形で誤りを返す */
export function parseFreeScript(json) {
    return parseWith(FreeScriptSchema, json);
}
/** dopagakix check / render に渡す、動画ごとのファイル(台本と数値)を読み込む。facts にない数値の参照も誤りにする */
export function parseFreeFile(json) {
    return parseWith(FreeFileSchema, json);
}
/** 形式の定義を読み込む */
export function parseFormat(json) {
    return parseWith(FormatSchema, json);
}
/**
 * 台本の JSON Schema。AI に台本の形を伝えるのに使う。形式の定義を渡すと、各欄の説明に、その形式の文字数と件数の上限を書く。
 */
export function freeScriptJsonSchema(format) {
    return z.toJSONSchema(freeScriptSchema(resolveFormat(format).limits));
}
