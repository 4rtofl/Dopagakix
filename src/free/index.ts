/*
 * 自由形式の動画の型と確認の処理。ほかのプログラムから `dopagakix/free` として読み込む。
 *
 * Cloudflare Workers でも動くよう、ここから読み込むものは zod と、Node.js の機能(fs・child_process・path・
 * process・Buffer など)に頼らないファイルだけにする(test/free-entry.test.ts で確かめる)。
 * ファイル(書体、CSS、画像)の確認と、読みの確認(VOICEVOX が要る)は含めない(dopagakix check で行う)。
 */
import { z } from "zod";
import { type FormatDefinition, FormatSchema, resolveFormat } from "./format.js";
import { type FreeFile, FreeFileSchema, type FreeScript, FreeScriptSchema, freeScriptSchema } from "./schema.js";

export { checkFormatDefinition, checkFreeFile, DEFAULT_FREE_SECONDS, type FreeCheckOptions } from "./check.js";
export {
  checkFormat,
  contrastRatio,
  DEFAULT_FREE_LIMITS,
  defaultFormatDefinition,
  type FontSpec,
  FORMAT_VERSION,
  type FormatDefinition,
  type FormatIssue,
  FormatSchema,
  type FreeLimits,
  MIN_CONTRAST,
  type ResolvedFormat,
  resolveFormat,
} from "./format.js";
export { freeNarrations, normalizeFreeScript } from "./normalize.js";
export {
  FREE_SCENE_TYPES,
  FREE_VERSION,
  type FreeFacts,
  FreeFactsSchema,
  type FreeFigure,
  FreeFigureSchema,
  type FreeFile,
  FreeFileSchema,
  type FreeScene,
  type FreeSceneType,
  type FreeScript,
  FreeScriptSchema,
  freeScriptSchema,
  GROUP_MARKS,
  LIST_MARKS,
} from "./schema.js";
export { COLOR_TOKENS, type ColorToken, DEFAULT_COLORS, type FontRole } from "../video/tokens.js";
export { DEFAULT_MOTION, type Motion } from "../video/motion.js";
export { narrationBudget, type ScriptCheck, type ScriptIssue } from "../script/check.js";
export { BUILTIN_PERSONAS, checkEndings, findPersona, type Persona, PersonaSchema, ZUNDAMON } from "../personas.js";

export type ParseResult<T> = { success: true; data: T } | { success: false; error: string };

function parseWith<T>(schema: z.ZodType<T>, json: unknown): ParseResult<T> {
  const parsed = schema.safeParse(json);
  return parsed.success ? { success: true, data: parsed.data } : { success: false, error: z.prettifyError(parsed.error) };
}

/** AI が書いた台本を読み込む。形式が正しくなければ、AI に返せる文の形で誤りを返す */
export function parseFreeScript(json: unknown): ParseResult<FreeScript> {
  return parseWith(FreeScriptSchema, json);
}

/** dopagakix check / render に渡す、動画ごとのファイル(台本と数値)を読み込む。facts にない数値の参照も誤りにする */
export function parseFreeFile(json: unknown): ParseResult<FreeFile> {
  return parseWith(FreeFileSchema, json);
}

/** 形式の定義を読み込む */
export function parseFormat(json: unknown): ParseResult<FormatDefinition> {
  return parseWith(FormatSchema, json);
}

/**
 * 台本の JSON Schema。AI に台本の形を伝えるのに使う。形式の定義を渡すと、各欄の説明に、その形式の文字数と件数の上限を書く。
 */
export function freeScriptJsonSchema(format?: FormatDefinition): Record<string, unknown> {
  return z.toJSONSchema(freeScriptSchema(resolveFormat(format).limits)) as Record<string, unknown>;
}
