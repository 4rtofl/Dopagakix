import type { FreeLimits } from "./format.js";
import type { FreeFacts, FreeScene, FreeScript } from "./schema.js";
/** 1 つのシーンを表示用に整える。件数の上限を超えた項目を落とす。中身がなく画面に出せないシーンは undefined */
export declare function normalizeFreeScene(scene: FreeScene, limits: FreeLimits, facts?: FreeFacts): FreeScene | undefined;
/** 画面に出すシーン(表示用に整えたもの)と、台本の scenes の中の位置。中身のないシーンと、上限を超えたシーンは落とす */
export declare function shownFreeScenes(script: FreeScript, limits: FreeLimits, facts?: FreeFacts): Array<{
    index: number;
    scene: FreeScene;
}>;
/**
 * 台本を表示用に整える。空白を整えて秘匿情報の取りこぼしをマスクし、件数の上限を超えた項目と、
 * 中身のないシーン、上限を超えたシーンを落とす(落としたものは check が警告する)。
 */
export declare function normalizeFreeScript(script: FreeScript, limits: FreeLimits, facts?: FreeFacts): FreeScript;
export type FreeNarrationKind = "opening" | FreeScene["type"] | "closing";
/**
 * 画面に出すシーンの読み上げ文(空白を整えたもの)を、描画の順に並べる。書かれたままの台本を渡す。
 * at は動画ごとのファイルの中の位置(script.〜)。lines の添字は台本の中の位置のまま(落としたシーンや空の文があってもずらさない)。
 */
export declare function freeNarrations(script: FreeScript, limits: FreeLimits, facts?: FreeFacts): Array<{
    at: string;
    kind: FreeNarrationKind;
    lines: string[];
}>;
