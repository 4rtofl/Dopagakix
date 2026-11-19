import { z } from "zod";
import { conversationNarrations } from "../conversation/normalize.js";
import type { ConversationScript } from "../conversation/schema.js";
import type { FreeLimits } from "../free/format.js";
import { type FreeNarrationKind } from "../free/normalize.js";
import type { FreeFacts, FreeScript } from "../free/schema.js";
import { type VideoScript } from "./schema.js";
/** 読みの指定(表記 → 読み)。VOICEVOX に送る文だけを置き換え、字幕と画面の文字は元の表記のままにする */
export type Readings = Record<string, string>;
export declare const ReadingsSchema: z.ZodRecord<z.ZodString, z.ZodString>;
/**
 * 組み込みの読みの指定。VOICEVOX ENGINE 0.25.2(ずんだもん、enable_katakana_english=true)で
 * 誤読を確かめた語(Issue #11 の調査)。
 */
export declare const BUILTIN_READINGS: Readonly<Readings>;
/** 読みの指定を合わせる。後のものが優先する */
export declare function mergeReadings(...layers: Array<Readings | undefined>): Readings;
/**
 * 読みの指定に従って、VOICEVOX に送る文を作る。長い表記から順に当てはめ、置き換えた部分はもう一度置き換えない。
 * 英数字で始まる(終わる)表記は、前(後)が英数字のときは当てはめない(npm が pnpm の一部に当たらないように)。
 */
export declare function applyReadings(text: string, readings: Readings): string;
/**
 * VOICEVOX の AquesTalk 風記法(AudioQuery.kana)を、確認用の読み(カタカナ)にする。
 * アクセント(')と無声化(_)の記号を除き、句と息継ぎの区切り(/ 、)は空白にする。
 */
export declare function readingOf(kana: string): string;
/** 文中の英字の語のうち、VOICEVOX がアルファベットの名前の連なりで読んだもの */
export declare function spelledWords(sent: string, kana: string): string[];
/** 文脈で読みが変わる字(調査で誤読を確かめたもの)。含む文は要確認にする */
export declare const AMBIGUOUS_CHARS: readonly string[];
/** 読みを確かめてほしい理由。なければ空 */
export declare function reviewReasons(sent: string, kana: string): string[];
/** 読み上げる単位。描画と同じく、表示用に整えた台本を字幕 1 枚ごとに分けたもの */
export interface SpeechUnit {
    /** 台本の中の位置。例: work.narration[0] */
    at: string;
    /** 字幕に出る文(元の表記) */
    text: string;
}
/** 台本の読み上げ文を、描画のときに音声を作るのと同じ単位(表示用に整えた文を、字幕 1 枚ごとに分けたもの)にする */
export declare function speechUnits(script: VideoScript): SpeechUnit[];
/** 会話の要約の台本の読み上げ文を、描画のときに音声を作るのと同じ単位にする。at は台本(script)の中の位置 */
export declare function conversationSpeechUnits(script: ConversationScript): SpeechUnit[];
/** 会話の要約の台本の、シーンごとの読み上げ文(字幕 1 枚ごとに分けたもの)。描画の順 */
export declare function conversationSceneLines(script: ConversationScript): Array<{
    kind: ReturnType<typeof conversationNarrations>[number]["kind"];
    lines: string[];
}>;
/** 自由形式の台本の読み上げ文を、描画のときに音声を作るのと同じ単位にする。at は動画ごとのファイルの中の位置(script.〜) */
export declare function freeSpeechUnits(script: FreeScript, limits: FreeLimits, facts?: FreeFacts): SpeechUnit[];
/** 自由形式の台本の、シーンごとの読み上げ文(字幕 1 枚ごとに分けたもの)。描画の順 */
export declare function freeSceneLines(script: FreeScript, limits: FreeLimits, facts?: FreeFacts): Array<{
    kind: FreeNarrationKind;
    lines: string[];
}>;
/** 読みの確認結果(check が保存し、render が照らし合わせる) */
export declare const CheckedReadingsSchema: z.ZodObject<{
    version: z.ZodLiteral<1>;
    checkedAt: z.ZodString;
    engine: z.ZodObject<{
        version: z.ZodString;
        speaker: z.ZodNumber;
        name: z.ZodString;
    }, z.core.$strip>;
    sentences: z.ZodArray<z.ZodObject<{
        at: z.ZodString;
        text: z.ZodString;
        sent: z.ZodString;
        reading: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type CheckedReadings = z.infer<typeof CheckedReadingsSchema>;
/** check が確認結果を保存するファイル名(台本と同じ場所に置く) */
export declare const CHECKED_READINGS_FILE = "checked-readings.json";
export declare function checkedReadingsFile(report: string): string;
export declare function loadCheckedReadings(file: string): Promise<CheckedReadings | undefined>;
export interface ReadingMismatch {
    at: string;
    text: string;
    sent: string;
    /** unchecked=確認していない文 / changed=確認したときと読みが違う */
    kind: "unchecked" | "changed";
    /** 確認したときの読み */
    expected?: string;
    actual: string;
}
/** 描画で使う読みを、check で確かめた読みと照らし合わせる。比べるのは読み(カタカナ)だけ */
export declare function compareReadings(actual: Array<{
    at: string;
    text: string;
    sent: string;
    reading: string;
}>, checked: CheckedReadings | undefined): ReadingMismatch[];
/** 照合で見つかった食い違いを、check のやり直しを求めるエラーの文にする */
export declare function mismatchMessage(mismatches: ReadingMismatch[], checkFile: string, checked: boolean): string;
/** プロジェクトの辞書の場所。環境変数 DOPAGAKIX_READINGS、なければ <git のルート>/.dopagakix/readings.json */
export declare function projectReadingsFile(cwd?: string, env?: NodeJS.ProcessEnv): {
    file: string;
    explicit: boolean;
} | undefined;
export interface ProjectReadings {
    file?: string;
    readings: Readings;
}
/** プロジェクトの辞書を読む。既定の場所になければ空とし、環境変数で指定したファイルがなければエラーにする */
export declare function loadProjectReadings(cwd?: string, env?: NodeJS.ProcessEnv): Promise<ProjectReadings>;
export interface ResolvedReadings {
    /** 3 か所を合わせた結果(描画に使う) */
    readings: Readings;
    /** 1 文字の表記(意図しない箇所を置き換えやすい)。どこで指定したか */
    singleChars: Array<{
        key: string;
        source: string;
    }>;
    projectFile?: string;
    /** script.json に記録した指定を使った */
    recorded: boolean;
}
/**
 * 描画に使う読みの指定を決める。script.json に記録があればそれを使い(描画し直しても同じ読みにする)、
 * なければ組み込みの一覧・プロジェクトの辞書・台本の readings の順に合わせる(後のものが優先)。
 */
export declare function resolveReadings(script: {
    readings?: Readings;
}, recorded: Readings | undefined, options?: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
}): Promise<ResolvedReadings>;
