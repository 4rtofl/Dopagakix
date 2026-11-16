import { redactSecrets } from "../redact.js";
import { FIGURE_LIMITS } from "./schema.js";
/** 画面に表示できる項目数 */
export const LIMITS = { work: 5, verification: 4, decisions: 3, nextSteps: 3 };
/** 表示用に空白を整え、秘匿情報をマスクする */
export function cleanText(text) {
    return redactSecrets(text.replace(/\s+/g, " ").trim()).text;
}
function cleanLines(lines) {
    return lines.map(cleanText).filter(Boolean);
}
function normalizeFigure(figure) {
    if (!figure)
        return undefined;
    const title = cleanText(figure.title);
    const narration = cleanLines(figure.narration);
    if (figure.type === "before_after") {
        const before = cleanLines(figure.before).slice(0, FIGURE_LIMITS.sideLines);
        const after = cleanLines(figure.after).slice(0, FIGURE_LIMITS.sideLines);
        // 片側でも空なら変化を示せないので、図解シーンを出さない
        return before.length && after.length ? { type: "before_after", title, before, after, narration } : undefined;
    }
    const steps = figure.steps
        .map((step) => {
        const note = step.note === undefined ? "" : cleanText(step.note);
        return { label: cleanText(step.label), ...(note ? { note } : {}), ...(step.changed ? { changed: true } : {}) };
    })
        .filter((step) => step.label)
        .slice(0, FIGURE_LIMITS.maxSteps);
    return steps.length ? { type: "flow", title, steps, narration } : undefined;
}
/**
 * 台本を表示用に整える。エージェントが書いた台本にも、手で編集した script.json にも使う。
 * 件数の上限を超えた項目は切り捨て、秘匿情報の取りこぼしをもう一度マスクする。
 * 廃止した request(ご依頼の内容)は表示しないので落とす。
 */
export function normalizeScript(script) {
    const figure = normalizeFigure(script.figure);
    return {
        title: cleanText(script.title),
        status: script.status,
        headline: cleanText(script.headline),
        opening: { narration: cleanLines(script.opening.narration) },
        work: {
            items: cleanLines(script.work.items).slice(0, LIMITS.work),
            narration: cleanLines(script.work.narration),
        },
        ...(figure ? { figure } : {}),
        verification: {
            items: script.verification.items
                .map((item) => ({ label: cleanText(item.label), result: item.result }))
                .filter((item) => item.label)
                .slice(0, LIMITS.verification),
            narration: cleanLines(script.verification.narration),
        },
        decisions: {
            items: script.decisions.items
                .map((item) => ({ title: cleanText(item.title), detail: cleanText(item.detail) }))
                .filter((item) => item.title)
                .slice(0, LIMITS.decisions),
            narration: cleanLines(script.decisions.narration),
        },
        next_steps: {
            items: cleanLines(script.next_steps.items).slice(0, LIMITS.nextSteps),
            narration: cleanLines(script.next_steps.narration),
        },
        ...(script.readings ? { readings: script.readings } : {}),
    };
}
