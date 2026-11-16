import type { Synthesizer } from "./types.js";
import { type Pcm } from "./wav.js";
/**
 * 音声なし(字幕のみ)用。字幕を読み切れる長さの無音を返し、字幕の表示時間を決める。
 * 黙読の速さは読み上げの話速と関係ないため、speed は使わない。
 */
export declare class SilentSynthesizer implements Synthesizer {
    private readonly charsPerSecond;
    private readonly sampleRate;
    readonly credit: undefined;
    constructor(charsPerSecond?: number, sampleRate?: number);
    synthesize(text: string): Promise<Pcm>;
}
