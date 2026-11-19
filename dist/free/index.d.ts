import { type FormatDefinition } from "./format.js";
import { type FreeFile, type FreeScript } from "./schema.js";
export { checkFormatDefinition, checkFreeFile, DEFAULT_FREE_SECONDS, type FreeCheckOptions } from "./check.js";
export { checkFormat, contrastRatio, DEFAULT_FREE_LIMITS, defaultFormatDefinition, type FontSpec, FORMAT_VERSION, type FormatDefinition, type FormatIssue, FormatSchema, type FreeLimits, MIN_CONTRAST, type ResolvedFormat, resolveFormat, } from "./format.js";
export { freeNarrations, normalizeFreeScript } from "./normalize.js";
export { FREE_SCENE_TYPES, FREE_VERSION, type FreeFacts, FreeFactsSchema, type FreeFigure, FreeFigureSchema, type FreeFile, FreeFileSchema, type FreeScene, type FreeSceneType, type FreeScript, FreeScriptSchema, freeScriptSchema, GROUP_MARKS, LIST_MARKS, } from "./schema.js";
export { COLOR_TOKENS, type ColorToken, DEFAULT_COLORS, type FontRole } from "../video/tokens.js";
export { DEFAULT_MOTION, type Motion } from "../video/motion.js";
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
export declare function parseFreeScript(json: unknown): ParseResult<FreeScript>;
/** dopagakix check / render に渡す、動画ごとのファイル(台本と数値)を読み込む。facts にない数値の参照も誤りにする */
export declare function parseFreeFile(json: unknown): ParseResult<FreeFile>;
/** 形式の定義を読み込む */
export declare function parseFormat(json: unknown): ParseResult<FormatDefinition>;
/**
 * 台本の JSON Schema。AI に台本の形を伝えるのに使う。形式の定義を渡すと、各欄の説明に、その形式の文字数と件数の上限を書く。
 */
export declare function freeScriptJsonSchema(format?: FormatDefinition): Record<string, unknown>;
