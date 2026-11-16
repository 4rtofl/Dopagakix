import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { cleanText } from "./normalize.js";
import { VideoScriptSchema } from "./schema.js";
import { splitCaption } from "../video/timeline.js";
export const ReadingsSchema = VideoScriptSchema.shape.readings.unwrap();
/**
 * 組み込みの読みの指定。VOICEVOX ENGINE 0.25.2(ずんだもん、enable_katakana_english=true)で
 * 誤読を確かめた語(Issue #11 の調査)。
 */
export const BUILTIN_READINGS = {
    README: "リードミー",
    SKILL: "スキル",
    npm: "エヌピーエム",
    JSON: "ジェイソン",
    ffmpeg: "エフエフエムペグ",
    話速: "わそく",
    行頭: "ぎょうとう",
    行末: "ぎょうまつ",
    他の: "ほかの",
};
/** 読みの指定を合わせる。後のものが優先する */
export function mergeReadings(...layers) {
    return Object.assign({}, ...layers.filter(Boolean));
}
const ASCII_WORD = /[A-Za-z0-9]/;
/**
 * 読みの指定に従って、VOICEVOX に送る文を作る。長い表記から順に当てはめ、置き換えた部分はもう一度置き換えない。
 * 英数字で始まる(終わる)表記は、前(後)が英数字のときは当てはめない(npm が pnpm の一部に当たらないように)。
 */
export function applyReadings(text, readings) {
    const keys = Object.keys(readings)
        .filter(Boolean)
        .sort((a, b) => b.length - a.length);
    if (keys.length === 0)
        return text;
    let out = "";
    let i = 0;
    while (i < text.length) {
        const key = keys.find((k) => {
            if (!text.startsWith(k, i))
                return false;
            if (ASCII_WORD.test(k[0]) && i > 0 && ASCII_WORD.test(text[i - 1]))
                return false;
            const after = text[i + k.length];
            return !(ASCII_WORD.test(k.at(-1)) && after !== undefined && ASCII_WORD.test(after));
        });
        if (key) {
            out += readings[key];
            i += key.length;
        }
        else {
            out += text[i];
            i += 1;
        }
    }
    return out;
}
/**
 * VOICEVOX の AquesTalk 風記法(AudioQuery.kana)を、確認用の読み(カタカナ)にする。
 * アクセント(')と無声化(_)の記号を除き、句と息継ぎの区切り(/ 、)は空白にする。
 */
export function readingOf(kana) {
    return kana
        .replace(/['_]/g, "")
        .replace(/[/、]+/g, " ")
        .trim();
}
/** VOICEVOX がアルファベットを 1 文字ずつ読むときの読み(長音は母音を重ねる)。揺れのある字は候補を並べる */
const LETTER_NAMES = {
    A: ["エエ", "エイ"],
    B: ["ビイ"],
    C: ["シイ"],
    D: ["ディイ", "デイ"],
    E: ["イイ"],
    F: ["エフ"],
    G: ["ジイ"],
    H: ["エイチ", "エッチ"],
    I: ["アイ"],
    J: ["ジェエ", "ジェイ"],
    K: ["ケエ", "ケイ"],
    L: ["エル"],
    M: ["エム"],
    N: ["エヌ"],
    O: ["オオ", "オウ"],
    P: ["ピイ"],
    Q: ["キュウ", "キュー"],
    R: ["アアル", "アール"],
    S: ["エス"],
    T: ["ティイ", "ティー"],
    U: ["ユウ", "ユー"],
    V: ["ブイ", "ヴイ"],
    W: ["ダブリュウ", "ダブリュー"],
    X: ["エックス"],
    Y: ["ワイ"],
    Z: ["ゼット", "ズィイ", "ジイ"],
};
/** 1 文字ずつ読んだかを調べる英字の語の長さ(これより短い語は略語として 1 文字ずつ読むのが普通) */
const SPELLED_MIN = 4;
/** 文中の英字の語のうち、VOICEVOX がアルファベットの名前の連なりで読んだもの */
export function spelledWords(sent, kana) {
    const reading = readingOf(kana).replace(/\s+/g, "");
    const words = new Set(sent.match(new RegExp(`[A-Za-z]{${SPELLED_MIN},}`, "g")) ?? []);
    return [...words].filter((word) => {
        // 先頭からアルファベットの名前を順に当てはめ、語の全ての字を読めた箇所があるか
        const letters = [...word.toUpperCase()];
        const matchFrom = (at, index) => {
            if (index === letters.length)
                return true;
            return (LETTER_NAMES[letters[index]] ?? []).some((name) => reading.startsWith(name, at) && matchFrom(at + name.length, index + 1));
        };
        for (let at = 0; at < reading.length; at++)
            if (matchFrom(at, 0))
                return true;
        return false;
    });
}
/** 文脈で読みが変わる字(調査で誤読を確かめたもの)。含む文は要確認にする */
export const AMBIGUOUS_CHARS = ["行"];
/** 読みを確かめてほしい理由。なければ空 */
export function reviewReasons(sent, kana) {
    const reasons = spelledWords(sent, kana).map((word) => `「${word}」を英字 1 文字ずつ読んでいます`);
    for (const char of AMBIGUOUS_CHARS) {
        if (sent.includes(char))
            reasons.push(`「${char}」は文脈で読みが変わります`);
    }
    return reasons;
}
const NARRATION_KEYS = ["opening", "request", "work", "verification", "decisions", "next_steps"];
/** 台本の読み上げ文を、描画のときに音声を作るのと同じ単位(表示用に整えた文を、字幕 1 枚ごとに分けたもの)にする */
export function speechUnits(script) {
    return NARRATION_KEYS.flatMap((key) => script[key].narration.flatMap((line, i) => splitCaption(cleanText(line)).map((text) => ({ at: `${key}.narration[${i}]`, text }))));
}
/** 読みの確認結果(check が保存し、render が照らし合わせる) */
export const CheckedReadingsSchema = z.object({
    version: z.literal(1),
    checkedAt: z.string(),
    /** 確認に使ったエンジンと話者(記録用。照合では読みだけを比べる) */
    engine: z.object({ version: z.string(), speaker: z.number().int(), name: z.string() }),
    sentences: z.array(z.object({ at: z.string(), text: z.string(), sent: z.string(), reading: z.string() })),
});
/** check が確認結果を保存するファイル名(台本と同じ場所に置く) */
export const CHECKED_READINGS_FILE = "checked-readings.json";
export function checkedReadingsFile(report) {
    return path.join(path.dirname(path.resolve(report)), CHECKED_READINGS_FILE);
}
export async function loadCheckedReadings(file) {
    if (!existsSync(file))
        return undefined;
    let json;
    try {
        json = JSON.parse(await readFile(file, "utf8"));
    }
    catch (error) {
        throw new Error(`${file} を JSON として読めません: ${error.message}`);
    }
    const parsed = CheckedReadingsSchema.safeParse(json);
    if (!parsed.success)
        throw new Error(`${file} の形式が正しくありません:\n${z.prettifyError(parsed.error)}`);
    return parsed.data;
}
/** 描画で使う読みを、check で確かめた読みと照らし合わせる。比べるのは読み(カタカナ)だけ */
export function compareReadings(actual, checked) {
    const known = new Map();
    for (const sentence of checked?.sentences ?? [])
        known.set(sentence.sent, sentence.reading);
    const mismatches = [];
    for (const sentence of actual) {
        const expected = known.get(sentence.sent);
        if (expected === undefined) {
            mismatches.push({ ...sentence, kind: "unchecked", actual: sentence.reading });
        }
        else if (expected !== sentence.reading) {
            mismatches.push({ ...sentence, kind: "changed", expected, actual: sentence.reading });
        }
    }
    return mismatches;
}
/** 照合で見つかった食い違いを、check のやり直しを求めるエラーの文にする */
export function mismatchMessage(mismatches, checkFile, checked) {
    const head = checked
        ? `check で確かめた読みと一致しない読み上げ文が ${mismatches.length} 文あります(${checkFile})。`
        : `読みを確かめた記録(${checkFile})がありません。`;
    const lines = checked
        ? mismatches.slice(0, 10).map((m) => m.kind === "unchecked"
            ? `- ${m.at}「${m.text}」: 確認していない文です`
            : `- ${m.at}「${m.text}」: 確認したときは「${m.expected}」、今は「${m.actual}」`)
        : [];
    if (checked && mismatches.length > 10)
        lines.push(`- ほか ${mismatches.length - 10} 文`);
    return [head, ...lines, "dopagakix check で全文の読みを確かめ直してから、描画してください。"].join("\n");
}
/** プロジェクトの辞書の場所。環境変数 DOPAGAKIX_READINGS、なければ <git のルート>/.dopagakix/readings.json */
export function projectReadingsFile(cwd = process.cwd(), env = process.env) {
    if (env.DOPAGAKIX_READINGS)
        return { file: path.resolve(cwd, env.DOPAGAKIX_READINGS), explicit: true };
    const git = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" });
    if (git.status !== 0 || !git.stdout.trim())
        return undefined;
    return { file: path.join(git.stdout.trim(), ".dopagakix", "readings.json"), explicit: false };
}
/** プロジェクトの辞書を読む。既定の場所になければ空とし、環境変数で指定したファイルがなければエラーにする */
export async function loadProjectReadings(cwd = process.cwd(), env = process.env) {
    const located = projectReadingsFile(cwd, env);
    if (!located)
        return { readings: {} };
    if (!existsSync(located.file)) {
        if (located.explicit)
            throw new Error(`DOPAGAKIX_READINGS に指定した読みの辞書がありません: ${located.file}`);
        return { file: located.file, readings: {} };
    }
    let json;
    try {
        json = JSON.parse(await readFile(located.file, "utf8"));
    }
    catch (error) {
        throw new Error(`読みの辞書 ${located.file} を JSON として読めません: ${error.message}`);
    }
    const parsed = ReadingsSchema.safeParse(json);
    if (!parsed.success) {
        throw new Error(`読みの辞書 ${located.file} の形式が正しくありません(「表記: 読み」の JSON オブジェクトで書きます):\n${z.prettifyError(parsed.error)}`);
    }
    return { file: located.file, readings: parsed.data };
}
/**
 * 描画に使う読みの指定を決める。script.json に記録があればそれを使い(描画し直しても同じ読みにする)、
 * なければ組み込みの一覧・プロジェクトの辞書・台本の readings の順に合わせる(後のものが優先)。
 */
export async function resolveReadings(script, recorded, options = {}) {
    if (recorded) {
        const singleChars = Object.keys(recorded)
            .filter((key) => [...key].length === 1)
            .map((key) => ({ key, source: "script.json の記録" }));
        return { readings: recorded, singleChars, recorded: true };
    }
    const project = await loadProjectReadings(options.cwd, options.env);
    const layers = [
        ["組み込みの一覧", BUILTIN_READINGS],
        [project.file ?? "プロジェクトの辞書", project.readings],
        ["台本の readings", script.readings ?? {}],
    ];
    const singleChars = layers.flatMap(([source, readings]) => Object.keys(readings)
        .filter((key) => [...key].length === 1)
        .map((key) => ({ key, source })));
    return { readings: mergeReadings(...layers.map(([, r]) => r)), singleChars, projectFile: project.file, recorded: false };
}
