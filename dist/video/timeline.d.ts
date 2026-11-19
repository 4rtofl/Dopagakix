import type { ConversationSceneType } from "../conversation/schema.js";
import type { VideoScript } from "../script/schema.js";
import type { Synthesizer } from "../tts/types.js";
import { type Pcm } from "../tts/wav.js";
import { type Motion } from "./motion.js";
/** シーンの並び。figure(図解)は台本に figure があるときだけ入る */
export declare const SCENE_KINDS: readonly ["opening", "work", "figure", "verification", "decisions", "closing"];
export type SceneKind = (typeof SCENE_KINDS)[number];
/** 会話の要約のシーン。冒頭と締めの間に、台本に書かれた種類のシーンが並ぶ(同じ種類が続くこともある) */
export type ConversationSceneKind = "opening" | ConversationSceneType | "closing";
/** 自由形式のシーン。冒頭と締めの間に、台本に書かれた種類のシーンが並ぶ */
export type FreeSceneKind = "opening" | "text" | "list" | "point" | "groups" | "quote" | "figure" | "numbers" | "image" | "closing";
type AnySceneKind = SceneKind | ConversationSceneKind | FreeSceneKind;
/** シーン 1 つ分の読み上げ文(字幕 1 枚ごとに分けたもの) */
export interface SceneLines {
    kind: AnySceneKind;
    lines: string[];
}
/** 字幕 1 枚分。start〜end は読み上げ音声が鳴っている区間(秒)。 */
export interface Cue {
    text: string;
    start: number;
    end: number;
}
export interface TimedScene {
    kind: AnySceneKind;
    start: number;
    end: number;
    cues: Cue[];
}
export interface Timeline {
    scenes: TimedScene[];
    duration: number;
    audio: Pcm;
    /** 実際に使った話速 */
    speed: number;
    credit: string | undefined;
}
export interface TimelineOptions {
    /** これを超えたら話速を上げて収める(秒) */
    maxSeconds: number;
    speed: number;
    maxSpeed: number;
    onProgress?: (done: number, total: number) => void;
    /**
     * 読み上げの前後の間(motion.ts)。leadIn はシーン開始から最初の読み上げまで(要素の登場を見せる時間)。
     * 省略すると既定の値(作業報告と会話の要約)
     */
    pause?: Motion["pause"];
}
/** 字幕が 2 行に収まるよう、長い文を文末・読点のうち中央に近い位置で分ける。 */
export declare function splitCaption(text: string, max?: number): string[];
export declare function sceneLines(script: VideoScript): SceneLines[];
/** 作業報告の台本から、読み上げ音声とシーン・字幕の時刻を作る(buildSceneTimeline を参照) */
export declare function buildTimeline(script: VideoScript, synth: Synthesizer, options: TimelineOptions): Promise<Timeline>;
/**
 * 読み上げ音声を合成し、その長さからシーンと字幕の時刻を決める。
 * 全体が maxSeconds を超える場合は、話速を maxSpeed まで上げて一度だけ作り直す。
 */
export declare function buildSceneTimeline(scenes: SceneLines[], synth: Synthesizer, options: TimelineOptions): Promise<Timeline>;
export {};
