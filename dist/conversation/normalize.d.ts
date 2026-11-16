import { type ConversationScene, type ConversationScript } from "./schema.js";
/** 1 つのシーンを表示用に整える。中身がなく画面に出せないシーンは undefined */
export declare function normalizeScene(scene: ConversationScene): ConversationScene | undefined;
/** 画面に出すシーン(表示用に整えたもの)と、台本の scenes の中の位置。中身のないシーンと、上限を超えたシーンは落とす */
export declare function shownScenes(script: ConversationScript): Array<{
    index: number;
    scene: ConversationScene;
}>;
/**
 * 台本を表示用に整える。空白を整えて秘匿情報の取りこぼしをマスクし、件数の上限を超えた項目と、
 * 中身のないシーン、上限を超えたシーンを落とす(落としたものは check が警告する)。
 */
export declare function normalizeConversationScript(script: ConversationScript): ConversationScript;
/**
 * 画面に出すシーンの読み上げ文(空白を整えたもの)を、描画の順に並べる。書かれたままの台本を渡す。
 * at と lines の添字は台本の中の位置のまま(落としたシーンや空の文があってもずらさない)。空の文は読み上げない。
 */
export declare function conversationNarrations(script: ConversationScript): Array<{
    at: string;
    kind: "opening" | ConversationScene["type"] | "closing";
    lines: string[];
}>;
