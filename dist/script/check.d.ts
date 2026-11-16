import type { SessionFacts } from "../facts.js";
import { type Persona } from "../personas.js";
import { type VideoScript } from "./schema.js";
/** 読み上げ文 1 文の長さの目安(全角)。字幕 1 枚に収まる */
export declare const SENTENCE_LIMIT = 35;
/** これを超えたら警告する(字幕が 2 枚に分かれる) */
export declare const SENTENCE_WARN = 45;
/** 1 シーンの文の数の上限の目安 */
export declare const SENTENCES_PER_SCENE = 3;
/**
 * 読み上げ文の合計文字数の目安。VOICEVOX ずんだもんの実測で、話速 1.25 で約 7.3 文字/秒。
 * シーン切り替えや文間の間(合計 8 秒程度)を除いた時間に収まるよう、少なめ(6 文字/秒)に見積もる。
 */
export declare function narrationBudget(targetSeconds: number): number;
export declare function hardToRead(text: string): string[];
export interface ScriptIssue {
    /** 台本(JSON)の中の位置。例: work.narration[1] */
    at: string;
    message: string;
}
export interface ScriptCheck {
    issues: ScriptIssue[];
    /** 読み上げ文の数と合計文字数 */
    sentences: number;
    narrationChars: number;
    /** 合計文字数の目安 */
    budget: number;
}
export interface CheckOptions {
    /** 読み上げ文の口調(指定すると文末を確かめる) */
    persona?: Persona;
    /** セッションログから集計した事実(あれば数値との食い違いも確かめる) */
    facts?: SessionFacts;
    /** 動画の長さの目安(秒) */
    seconds: number;
}
/**
 * エージェントが書いた台本を確かめる。描画はできるが見づらくなる点や、
 * 事実との食い違いが疑われる点を警告として返す(形式の誤りは読み込み時に検出する)。
 */
export declare function checkScript(script: VideoScript, options: CheckOptions): ScriptCheck;
