import { z } from "zod";
/**
 * 口調の定義と、文末の確かめ方。Node.js の機能に頼らない(Workers でも使う。src/conversation/index.ts)。
 */
/**
 * 読み上げ役のキャラクターの口調。台本生成時に Claude へ渡し、
 * 読み上げ文(と字幕)だけをその口調で書かせる。画面の見出しや項目は中立なまま。
 */
export declare const PersonaSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    speakerNames: z.ZodDefault<z.ZodArray<z.ZodString>>;
    speakerIds: z.ZodDefault<z.ZodArray<z.ZodNumber>>;
    style: z.ZodString;
    examples: z.ZodDefault<z.ZodArray<z.ZodString>>;
    endingPattern: z.ZodOptional<z.ZodString>;
    source: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type Persona = z.infer<typeof PersonaSchema>;
/**
 * ずんだもん。公式プロフィール(zunko.jp)に口調の記載はなく、
 * 「〜のだ/〜なのだ」「一人称ボク」は二次情報(pixiv 百科事典)に基づく。
 */
export declare const ZUNDAMON: Persona;
export declare const BUILTIN_PERSONAS: Persona[];
export declare function findPersona(speaker: {
    id: number;
    name?: string;
}, personas?: Persona[]): Persona | undefined;
/** 台本の口調と読み上げる話者が食い違っていれば、その旨の文を返す(組み込みの口調のみ判定できる)。 */
export declare function personaMismatch(persona: {
    id: string;
    name: string;
} | undefined, speaker: number): string | undefined;
export interface EndingCheck {
    checked: number;
    /** 口調の文末になっていない文 */
    misses: string[];
}
/** 読み上げ文の文末が口調どおりかを確かめる(LLM の出力の揺れを検出するため)。 */
export declare function checkEndings(lines: string[], persona: Persona): EndingCheck;
