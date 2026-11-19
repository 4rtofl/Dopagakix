import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { imageInfo } from "../util/image.js";
import { MEDIA_URL } from "../video/free.js";
import { FormatSchema, fitImage, imageFrame, relativeSegments, resolveFormat } from "./format.js";
import { normalizeFreeScript } from "./normalize.js";
import { FreeFileSchema } from "./schema.js";
/*
 * 自由形式のファイルの読み込みと、ファイル(形式の CSS、書体、画像)の確認。Node.js の機能を使うので、
 * dopagakix/free の入口には含めない。
 */
async function readJson(file) {
    try {
        return JSON.parse(await readFile(file, "utf8"));
    }
    catch (error) {
        throw new Error(`${file} を JSON として読めません: ${error.message}`);
    }
}
function formatError(file, error) {
    return new Error(`${file} の形式が正しくありません:\n${z.prettifyError(error)}`);
}
/** 形式の定義のファイルを読む */
export async function loadFormatFile(file) {
    const absolute = path.resolve(file);
    if (!existsSync(absolute))
        throw new Error(`形式の定義のファイルが見つかりません: ${absolute}`);
    const parsed = FormatSchema.safeParse(await readJson(absolute));
    if (!parsed.success)
        throw formatError(absolute, parsed.error);
    return { definition: parsed.data, file: absolute, dir: path.dirname(absolute) };
}
/**
 * 自由形式の動画ごとのファイル(render が残した script.json も同じ形式)を読む。
 * formatOverride(--format)を渡すと、ファイルに書いた format より優先する。
 */
export async function loadFree(file, formatOverride) {
    const parsed = FreeFileSchema.safeParse(await readJson(file));
    if (!parsed.success)
        throw formatError(file, parsed.error);
    const raw = parsed.data;
    const baseDir = raw.baseDir ?? path.dirname(path.resolve(file));
    let loaded;
    let inline;
    if (formatOverride)
        loaded = await loadFormatFile(formatOverride);
    else if (typeof raw.format === "string")
        loaded = await loadFormatFile(path.resolve(baseDir, raw.format));
    else
        inline = raw.format;
    const format = resolveFormat(loaded?.definition ?? inline);
    const facts = raw.facts ?? {};
    return {
        raw,
        script: normalizeFreeScript(raw.script, format.limits, facts),
        facts,
        format,
        ...(loaded ? { formatFile: loaded.file } : {}),
        formatDir: loaded?.dir ?? baseDir,
        baseDir,
    };
}
/** 形式の CSS が読もうとするもののうち、描画で読めないもの(外部の URL と、形式のフォルダーの外のファイル) */
export function unreadableCssUrls(css) {
    const found = [];
    const body = css.replace(/\/\*[\s\S]*?\*\//g, "");
    for (const match of body.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)|@import\s+(?:"([^"]*)"|'([^']*)')/gi)) {
        const url = (match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5] ?? "").trim();
        if (!url || url.startsWith("data:") || url.startsWith("#"))
            continue;
        if (relativeSegments(url.split(/[?#]/)[0]) === undefined)
            found.push(url);
    }
    return found;
}
/** 形式のフォルダーの中のファイルが、あるか */
function formatFileIssue(dir, file, at, what) {
    const segments = relativeSegments(file);
    if (!segments)
        return { at, message: `${what}は、形式のフォルダーの中のファイルを相対パスで書きます: ${file}` };
    const absolute = path.join(dir, ...segments);
    if (!existsSync(absolute) || !statSync(absolute).isFile())
        return { at, message: `${what}が見つかりません: ${absolute}` };
    return undefined;
}
/**
 * 形式の定義が使うファイル(形式の CSS、書体)を確かめる。prefix は警告の at の頭に付ける位置。
 * 戻り値の missing は、描画できない(ファイルがない)もの。
 */
export async function checkFormatFiles(format, dir, prefix = "") {
    const missing = [];
    const issues = [];
    if (format.style) {
        const issue = formatFileIssue(dir, format.style, `${prefix}style`, "形式の CSS");
        if (issue)
            missing.push(issue);
        else {
            const css = await readFile(path.join(dir, ...relativeSegments(format.style)), "utf8");
            for (const url of unreadableCssUrls(css)) {
                issues.push({
                    at: `${prefix}style`,
                    message: `形式の CSS が、外部の URL か形式のフォルダーの外のファイルを読もうとしています。描画では読み込みません: ${url}`,
                });
            }
        }
    }
    for (const [role, spec] of Object.entries(format.fonts)) {
        spec.files.forEach((font, i) => {
            const issue = formatFileIssue(dir, font.path, `${prefix}fonts.${role}.files[${i}].path`, "書体のファイル");
            if (issue)
                missing.push(issue);
        });
    }
    return { issues: [...missing, ...issues], missing };
}
/**
 * 画像のシーンの画像を確かめ、ページから読み込む URL を割り当てる。ファイルがない・形式が違うものは missing に入れ、
 * 本文の枠より小さく、拡大されてぼやけるものは issues で警告する。at は動画ごとのファイルの中の位置。
 */
export async function probeImages(loaded) {
    const images = {};
    const issues = [];
    const missing = [];
    const frame = imageFrame(loaded.format.size);
    let n = 0;
    for (const [i, scene] of loaded.raw.script.scenes.entries()) {
        if (scene.type !== "image")
            continue;
        const at = `script.scenes[${i}].src`;
        const src = scene.src.trim();
        if (images[src])
            continue;
        const file = path.resolve(loaded.baseDir, src);
        if (!existsSync(file) || !statSync(file).isFile()) {
            missing.push({ at, message: `画像が見つかりません: ${file}` });
            continue;
        }
        const info = imageInfo(new Uint8Array(await readFile(file)));
        if (!info.ok) {
            missing.push({ at, message: `${info.reason}: ${file}` });
            continue;
        }
        if (info.width < 1 || info.height < 1) {
            missing.push({ at, message: `画像の大きさを読めません: ${file}` });
            continue;
        }
        const fit = fitImage(info, frame);
        if (fit.scale > 1) {
            issues.push({
                at,
                message: `画像が ${info.width}×${info.height} で、本文の枠(${frame.width}×${frame.height})より小さいため、${fit.scale.toFixed(2)} 倍に拡大されてぼやけます。大きな画像にしてください。`,
            });
        }
        const ext = info.type === "jpeg" ? "jpg" : info.type;
        images[src] = { file, url: `${MEDIA_URL}${n++}.${ext}`, width: info.width, height: info.height };
    }
    return { images, issues: [...missing, ...issues], missing };
}
/** 描画に使うファイル(URL のパス → ファイル)。画像だけ。形式のフォルダーは /format/ の下にまとめて出す */
export function mediaFiles(images) {
    return Object.fromEntries(Object.values(images).map((image) => [image.url, image.file]));
}
