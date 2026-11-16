/** 16bit リニア PCM(チャンネルはインターリーブ) */
export interface Pcm {
    sampleRate: number;
    channels: number;
    samples: Int16Array;
}
export declare function durationOf(pcm: Pcm): number;
/** 最大音量(dBFS)。完全な無音なら -Infinity */
export declare function peakDbfs(pcm: Pcm): number;
export declare function silence(seconds: number, sampleRate: number, channels?: number): Pcm;
/** RIFF/WAVE(16bit PCM)を読む。fmt と data 以外のチャンクは読み飛ばす。 */
export declare function parseWav(buffer: Buffer): Pcm;
export declare function encodeWav(pcm: Pcm): Buffer;
/** target の atSeconds の位置に source を加算合成する(はみ出した分は捨てる)。 */
export declare function mixInto(target: Pcm, source: Pcm, atSeconds: number): void;
