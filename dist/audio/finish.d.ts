/** 仕上げの音量(Apple がポッドキャストに推奨する -16 LKFS ±1 に合わせる) */
export declare const TARGET_LUFS = -16;
/** トゥルーピークの上限。-1 dBFS に、AAC への変換でピークが上がる分の余裕を持たせる */
export declare const TARGET_TRUE_PEAK = -1.5;
/**
 * ラウドネスレンジの目標。loudnorm は測定値がこれを超えると linear=true でも動的な処理に切り替わるため、
 * 文の間の無音でレンジが広がりやすい読み上げに合わせて広めにする。
 */
export declare const TARGET_LRA = 20;
/** 仕上げの標本化周波数とチャンネル(映像の書き出しの AAC と同じ) */
export declare const SAMPLE_RATE = 48000;
/**
 * 読み上げに混ぜる音(BGM・効果音など)。入力 1 つと、その入力から output のラベルを作るフィルタで表す。
 */
export interface AudioLayer {
    /** ffmpeg の入力引数(例: ["-stream_loop", "-1", "-i", "bgm.mp3"]) */
    inputArgs: string[];
    /** 読み上げを sidechain などに使う場合は true(key に読み上げのラベルを渡す) */
    needsKey?: boolean;
    /**
     * フィルタの文字列。input は入力のストリーム(例: "1:a")、key は 48 kHz ステレオにした読み上げのラベル、
     * output は作るラベル。いずれも角かっこなしで渡す。
     */
    filter(labels: {
        input: string;
        key?: string;
        output: string;
    }): string;
}
export interface LoudnormMeasurement {
    input_i: string;
    input_tp: string;
    input_lra: string;
    input_thresh: string;
    target_offset: string;
    output_i?: string;
    output_tp?: string;
    normalization_type?: string;
}
/** 読み上げを 48 kHz ステレオにそろえ、追加の音を混ぜて [mix] を作るフィルタグラフ */
export declare function buildMixGraph(layers: AudioLayer[]): string;
/** loudnorm の 2 回目(測定値を渡して linear=true で適用する) */
export declare function loudnormApply(measured: LoudnormMeasurement): string;
/** loudnorm が標準エラーに出す JSON(最後のもの)を読む */
export declare function parseLoudnorm(stderr: string): LoudnormMeasurement;
export interface FinishOptions {
    /** 読み上げ(narration.wav) */
    narrationFile: string;
    /** 混ぜる音(BGM・効果音など) */
    layers?: AudioLayer[];
    /** 書き出し先(48 kHz ステレオの WAV) */
    outFile: string;
}
export interface FinishResult {
    outFile: string;
    /** 仕上げる前の積分ラウドネス(LUFS)。無音なら -inf */
    inputLoudness: number;
    /** 仕上げたあとの積分ラウドネスとトゥルーピーク(無音で音量をそろえなかった場合は undefined) */
    outputLoudness?: number;
    outputTruePeak?: number;
    /** loudnorm の処理(linear / dynamic)。無音でそろえなかった場合は "none" */
    normalization: string;
}
/**
 * 読み上げと追加の音を混ぜ、loudnorm の 2 パス(1 回目で測定、2 回目に測定値と linear=true で適用)で
 * -16 LUFS・トゥルーピーク -1.5 dBTP にそろえる。追加の音がなくても同じ処理をかけ、動画ごとの音量をそろえる。
 */
export declare function finishAudio(options: FinishOptions): Promise<FinishResult>;
