import { cleanText } from "../script/normalize.js";
function cleanLines(lines, limit) {
    const cleaned = (lines ?? []).map(cleanText).filter(Boolean);
    return limit === undefined ? cleaned : cleaned.slice(0, limit);
}
/** 画面に出す数値の名前。facts にある名前だけを、上限まで */
function figureNames(names, facts, limit) {
    return (names ?? []).filter((name) => facts.figures && Object.hasOwn(facts.figures, name)).slice(0, limit);
}
/** 1 つのシーンを表示用に整える。件数の上限を超えた項目を落とす。中身がなく画面に出せないシーンは undefined */
export function normalizeFreeScene(scene, limits, facts = {}) {
    const narration = cleanLines(scene.narration);
    const L = limits;
    switch (scene.type) {
        case "text": {
            const heading = cleanText(scene.heading);
            const lines = cleanLines(scene.lines, L.items.text);
            return heading || lines.length ? { type: "text", heading, lines, narration } : undefined;
        }
        case "list": {
            const items = cleanLines(scene.items, L.items.list);
            return items.length ? { type: "list", label: cleanText(scene.label), items, mark: scene.mark ?? "dash", narration } : undefined;
        }
        case "point": {
            const point = cleanText(scene.point);
            return point ? { type: "point", label: cleanText(scene.label), point, items: cleanLines(scene.items, L.items.point), narration } : undefined;
        }
        case "groups": {
            const groups = scene.groups
                .map((group) => ({ label: cleanText(group.label), mark: group.mark, items: cleanLines(group.items, L.items.groupItems) }))
                .filter((group) => group.items.length > 0)
                .slice(0, L.items.groups);
            return groups.length ? { type: "groups", label: cleanText(scene.label), groups, narration } : undefined;
        }
        case "quote": {
            // 引用は元の文のまま出すので、空白を整えるだけで切り詰めない
            const text = cleanText(scene.text);
            const by = scene.by === undefined ? "" : cleanText(scene.by);
            return text ? { type: "quote", label: cleanText(scene.label), text, ...(by ? { by } : {}), narration } : undefined;
        }
        case "figure": {
            const { figure } = scene;
            const title = cleanText(figure.title);
            const F = L.figure;
            if (figure.type === "before_after") {
                const before = cleanLines(figure.before, F.sideLines);
                const after = cleanLines(figure.after, F.sideLines);
                // 片側でも空なら比較を示せないので、シーンを出さない
                return before.length && after.length ? { type: "figure", figure: { type: "before_after", title, before, after }, narration } : undefined;
            }
            const steps = figure.steps
                .map((step) => {
                const note = step.note === undefined ? "" : cleanText(step.note);
                return { label: cleanText(step.label), ...(note ? { note } : {}), ...(step.changed ? { changed: true } : {}) };
            })
                .filter((step) => step.label)
                .slice(0, F.maxSteps);
            return steps.length ? { type: "figure", figure: { type: "flow", title, steps }, narration } : undefined;
        }
        case "numbers": {
            const figures = figureNames(scene.figures, facts, L.figures.count);
            return figures.length ? { type: "numbers", label: cleanText(scene.label), figures, narration } : undefined;
        }
        case "image": {
            const src = scene.src.trim();
            const caption = scene.caption === undefined ? "" : cleanText(scene.caption);
            return src ? { type: "image", label: cleanText(scene.label), src, ...(caption ? { caption } : {}), narration } : undefined;
        }
    }
}
/** 画面に出すシーン(表示用に整えたもの)と、台本の scenes の中の位置。中身のないシーンと、上限を超えたシーンは落とす */
export function shownFreeScenes(script, limits, facts = {}) {
    return script.scenes
        .map((scene, index) => ({ index, scene: normalizeFreeScene(scene, limits, facts) }))
        .filter((shown) => shown.scene !== undefined)
        .slice(0, limits.scenes.max);
}
/**
 * 台本を表示用に整える。空白を整えて秘匿情報の取りこぼしをマスクし、件数の上限を超えた項目と、
 * 中身のないシーン、上限を超えたシーンを落とす(落としたものは check が警告する)。
 */
export function normalizeFreeScript(script, limits, facts = {}) {
    const note = script.opening.note === undefined ? "" : cleanText(script.opening.note);
    const label = script.opening.label === undefined ? "" : cleanText(script.opening.label);
    return {
        title: cleanText(script.title),
        headline: cleanText(script.headline),
        opening: {
            ...(label ? { label } : {}),
            figures: figureNames(script.opening.figures, facts, limits.figures.count),
            ...(note ? { note } : {}),
            narration: cleanLines(script.opening.narration),
        },
        scenes: shownFreeScenes(script, limits, facts).map(({ scene }) => scene),
        closing: { notes: cleanLines(script.closing.notes, limits.closingNotes.count), narration: cleanLines(script.closing.narration) },
        ...(script.readings ? { readings: script.readings } : {}),
    };
}
/**
 * 画面に出すシーンの読み上げ文(空白を整えたもの)を、描画の順に並べる。書かれたままの台本を渡す。
 * at は動画ごとのファイルの中の位置(script.〜)。lines の添字は台本の中の位置のまま(落としたシーンや空の文があってもずらさない)。
 */
export function freeNarrations(script, limits, facts = {}) {
    return [
        { at: "script.opening.narration", kind: "opening", lines: script.opening.narration.map(cleanText) },
        ...shownFreeScenes(script, limits, facts).map(({ index, scene }) => ({
            at: `script.scenes[${index}].narration`,
            kind: scene.type,
            lines: script.scenes[index].narration.map(cleanText),
        })),
        { at: "script.closing.narration", kind: "closing", lines: script.closing.narration.map(cleanText) },
    ];
}
