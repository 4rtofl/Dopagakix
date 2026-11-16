import { cleanText } from "../script/normalize.js";
import { CONVERSATION_LIMITS as L } from "./schema.js";
function cleanLines(lines, limit) {
    const cleaned = lines.map(cleanText).filter(Boolean);
    return limit === undefined ? cleaned : cleaned.slice(0, limit);
}
/** 1 つのシーンを表示用に整える。中身がなく画面に出せないシーンは undefined */
export function normalizeScene(scene) {
    const narration = cleanLines(scene.narration);
    switch (scene.type) {
        case "topic": {
            const heading = cleanText(scene.heading);
            const lines = cleanLines(scene.lines, L.topicLines);
            return heading || lines.length ? { type: "topic", heading, lines, narration } : undefined;
        }
        case "flow": {
            const items = cleanLines(scene.items, L.flowItems);
            return items.length ? { type: "flow", items, narration } : undefined;
        }
        case "quote": {
            // 引用は元の発言のまま出すので、空白を整えるだけで切り詰めない
            const text = cleanText(scene.text);
            const by = scene.by === undefined ? "" : cleanText(scene.by);
            return text ? { type: "quote", text, ...(by ? { by } : {}), narration } : undefined;
        }
        case "points": {
            const point = cleanText(scene.point);
            return point ? { type: "points", point, opinions: cleanLines(scene.opinions, L.opinions), narration } : undefined;
        }
        case "outcome": {
            const decided = cleanLines(scene.decided, L.outcomeItems);
            const open = cleanLines(scene.open, L.outcomeItems);
            return decided.length || open.length ? { type: "outcome", decided, open, narration } : undefined;
        }
    }
}
/** 画面に出すシーン(表示用に整えたもの)と、台本の scenes の中の位置。中身のないシーンと、上限を超えたシーンは落とす */
export function shownScenes(script) {
    return script.scenes
        .map((scene, index) => ({ index, scene: normalizeScene(scene) }))
        .filter((shown) => shown.scene !== undefined)
        .slice(0, L.maxScenes);
}
/**
 * 台本を表示用に整える。空白を整えて秘匿情報の取りこぼしをマスクし、件数の上限を超えた項目と、
 * 中身のないシーン、上限を超えたシーンを落とす(落としたものは check が警告する)。
 */
export function normalizeConversationScript(script) {
    return {
        title: cleanText(script.title),
        headline: cleanText(script.headline),
        opening: { narration: cleanLines(script.opening.narration) },
        scenes: shownScenes(script).map(({ scene }) => scene),
        closing: { narration: cleanLines(script.closing.narration) },
        ...(script.readings ? { readings: script.readings } : {}),
    };
}
/**
 * 画面に出すシーンの読み上げ文(空白を整えたもの)を、描画の順に並べる。書かれたままの台本を渡す。
 * at と lines の添字は台本の中の位置のまま(落としたシーンや空の文があってもずらさない)。空の文は読み上げない。
 */
export function conversationNarrations(script) {
    return [
        { at: "opening.narration", kind: "opening", lines: script.opening.narration.map(cleanText) },
        ...shownScenes(script).map(({ index, scene }) => ({
            at: `scenes[${index}].narration`,
            kind: scene.type,
            lines: script.scenes[index].narration.map(cleanText),
        })),
        { at: "closing.narration", kind: "closing", lines: script.closing.narration.map(cleanText) },
    ];
}
