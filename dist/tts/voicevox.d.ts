import { type Readings } from "../script/readings.js";
import type { Synthesizer, VoiceInfo } from "./types.js";
import { type Pcm } from "./wav.js";
export declare const DEFAULT_VOICEVOX_URL = "http://127.0.0.1:50021";
/** ずんだもん(ノーマル) */
export declare const DEFAULT_SPEAKER = 3;
/** エンジンに接続できないときの対処(指示者に伝える内容) */
export declare const ENGINE_HELP: string;
export interface VoicevoxSpeaker {
    name: string;
    speaker_uuid: string;
    styles: Array<{
        name: string;
        id: number;
        type?: string;
    }>;
}
export declare class VoicevoxError extends Error {
    name: string;
}
/** エンジンに接続できない(起動していない、URL が違う)。起動コマンドを試すかどうかの判断に使う。 */
export declare class VoicevoxConnectionError extends VoicevoxError {
    name: string;
}
/** VOICEVOX ENGINE の HTTP API のうち、本ツールが使う部分。 */
export declare class VoicevoxClient {
    readonly baseUrl: string;
    private readonly fetchImpl;
    constructor(baseUrl?: string, fetchImpl?: typeof fetch);
    private request;
    version(): Promise<string>;
    speakers(): Promise<VoicevoxSpeaker[]>;
    initializeSpeaker(speaker: number): Promise<void>;
    /** ユーザー辞書の一覧(読みの確認がエンジンの状態を変えていないことを確かめるのに使う) */
    userDict(): Promise<Record<string, unknown>>;
    audioQuery(text: string, speaker: number): Promise<Record<string, unknown>>;
    synthesis(query: Record<string, unknown>, speaker: number): Promise<Buffer>;
}
/**
 * 音声ライブラリの規約が、話者名と異なる書式のクレジットを求めているもの
 * (VOICEVOX 音声モデル 利用規約 https://github.com/VOICEVOX/voicevox_vvm 、2026-10-14 確認)。
 * キーはエンジンの /speakers が返す話者名。
 */
export declare const CREDIT_OVERRIDES: Readonly<Record<string, string>>;
/** VOICEVOX の利用規約と音声ライブラリの規約で求められるクレジット表記 */
export declare function creditFor(speakerName: string): string;
export interface VoicevoxOptions {
    baseUrl?: string;
    speaker?: number;
    /** クレジット表記を指定する(規約の書式が変わった場合など)。省略時は creditFor で決める */
    credit?: string;
    /** 読みの指定。VOICEVOX に送る文だけを置き換える(エンジンのユーザー辞書は変えない) */
    readings?: Readings;
    fetch?: typeof fetch;
}
/** 読み上げ文を VOICEVOX がどう読むか */
export interface SpokenText {
    /** VOICEVOX に送る文(読みの指定で置き換えたもの) */
    sent: string;
    /** AquesTalk 風記法の読み(AudioQuery.kana) */
    kana: string;
    /** 確認用の読み(カタカナ。句の区切りは空白、アクセント記号なし) */
    reading: string;
}
export declare class VoicevoxSynthesizer implements Synthesizer {
    private readonly client;
    readonly voice: VoiceInfo;
    readonly credit: string;
    readonly readings: Readings;
    /** 送る文ごとの AudioQuery。読みを確かめたクエリのまま音声を作るため、一度作ったものを使い回す */
    private readonly queries;
    private constructor();
    /** エンジンへの接続と話者の存在を確かめてから作る。 */
    static create(options?: VoicevoxOptions): Promise<VoicevoxSynthesizer>;
    /** エンジンのバージョン */
    engineVersion(): Promise<string>;
    private query;
    /** 読み上げ文を VOICEVOX がどう読むかを調べる。ここで調べたクエリで synthesize が音声を作る */
    inspect(text: string): Promise<SpokenText>;
    synthesize(text: string, speed: number): Promise<Pcm>;
}
