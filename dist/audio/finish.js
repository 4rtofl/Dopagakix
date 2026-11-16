import { runFfmpeg } from "./ffmpeg.js";
/*
 * 音声の仕上げ。読み上げ(narration.wav)に BGM などの追加の音を混ぜ、全体の音量をそろえた audio.wav を作る。
 * 映像の書き出しとは別の工程にして、音声だけを速く処理・テストできるようにする。
 */
/** 仕上げの音量(Apple がポッドキャストに推奨する -16 LKFS ±1 に合わせる) */
export const TARGET_LUFS = -16;
/** トゥルーピークの上限。-1 dBFS に、AAC への変換でピークが上がる分の余裕を持たせる */
export const TARGET_TRUE_PEAK = -1.5;
/**
 * ラウドネスレンジの目標。loudnorm は測定値がこれを超えると linear=true でも動的な処理に切り替わるため、
 * 文の間の無音でレンジが広がりやすい読み上げに合わせて広めにする。
 */
export const TARGET_LRA = 20;
/** 仕上げの標本化周波数とチャンネル(映像の書き出しの AAC と同じ) */
export const SAMPLE_RATE = 48_000;
/** これより小さい(または -inf の)ラウドネスは無音とみなし、音量をそろえない(字幕のみで BGM もない場合) */
const SILENT_LUFS = -70;
/** 読み上げを 48 kHz ステレオにそろえ、追加の音を混ぜて [mix] を作るフィルタグラフ */
export function buildMixGraph(layers) {
    const keyed = layers.map((layer, i) => (layer.needsKey ? `key${i}` : undefined));
    const keys = keyed.filter((key) => key !== undefined);
    const voice = `[0:a]aresample=${SAMPLE_RATE},aformat=channel_layouts=stereo`;
    const parts = keys.length > 0 ? [`${voice},asplit=${keys.length + 1}[voice]${keys.map((key) => `[${key}]`).join("")}`] : [`${voice}[voice]`];
    layers.forEach((layer, i) => parts.push(layer.filter({ input: `${i + 1}:a`, key: keyed[i], output: `layer${i}` })));
    parts.push(layers.length > 0
        ? // normalize の既定(true)では各入力が縮小されるため、無効にする
            `[voice]${layers.map((_, i) => `[layer${i}]`).join("")}amix=inputs=${layers.length + 1}:duration=first:normalize=0[mix]`
        : "[voice]anull[mix]");
    return parts.join(";");
}
const loudnormTarget = `I=${TARGET_LUFS}:TP=${TARGET_TRUE_PEAK}:LRA=${TARGET_LRA}`;
/** loudnorm の 2 回目(測定値を渡して linear=true で適用する) */
export function loudnormApply(measured) {
    return (`loudnorm=${loudnormTarget}:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}` +
        `:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}` +
        ":linear=true:print_format=json");
}
/** loudnorm が標準エラーに出す JSON(最後のもの)を読む */
export function parseLoudnorm(stderr) {
    const start = stderr.lastIndexOf("{");
    const end = stderr.lastIndexOf("}");
    if (start < 0 || end < start)
        throw new Error(`loudnorm の測定結果を読めません\n${stderr.slice(-2000)}`);
    return JSON.parse(stderr.slice(start, end + 1));
}
/**
 * 読み上げと追加の音を混ぜ、loudnorm の 2 パス(1 回目で測定、2 回目に測定値と linear=true で適用)で
 * -16 LUFS・トゥルーピーク -1.5 dBTP にそろえる。追加の音がなくても同じ処理をかけ、動画ごとの音量をそろえる。
 */
export async function finishAudio(options) {
    const layers = options.layers ?? [];
    const inputs = ["-i", options.narrationFile, ...layers.flatMap((layer) => layer.inputArgs)];
    const graph = buildMixGraph(layers);
    const measured = parseLoudnorm(await runFfmpeg([
        ...inputs,
        ...["-filter_complex", `${graph};[mix]loudnorm=${loudnormTarget}:print_format=json[out]`],
        ...["-map", "[out]", "-f", "null", "-"],
    ]));
    const inputLoudness = Number(measured.input_i);
    const silent = !(inputLoudness > SILENT_LUFS);
    // loudnorm は内部で 192 kHz にするため、48 kHz に戻す
    const finish = silent ? "anull" : loudnormApply(measured);
    const stderr = await runFfmpeg([
        ...["-y", ...inputs],
        ...["-filter_complex", `${graph};[mix]${finish},aresample=${SAMPLE_RATE}[out]`],
        ...["-map", "[out]", "-c:a", "pcm_s16le", "-ar", String(SAMPLE_RATE), "-ac", "2", options.outFile],
    ]);
    if (silent)
        return { outFile: options.outFile, inputLoudness: Number.isNaN(inputLoudness) ? -Infinity : inputLoudness, normalization: "none" };
    const applied = parseLoudnorm(stderr);
    return {
        outFile: options.outFile,
        inputLoudness,
        outputLoudness: Number(applied.output_i),
        outputTruePeak: Number(applied.output_tp),
        normalization: applied.normalization_type ?? "unknown",
    };
}
