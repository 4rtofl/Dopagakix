import { type BgmSetting, type BgmTrack } from "./audio/bgm.js";
import { type ConversationFacts, type ConversationScript } from "./conversation/schema.js";
import { type SfxSet, type SfxSetting } from "./audio/sfx.js";
import type { SessionFacts } from "./facts.js";
import { type CheckedReadings, type Readings, type SpeechUnit } from "./script/readings.js";
import { type Author, type VideoScript } from "./script/schema.js";
import type { Synthesizer } from "./tts/types.js";
import { type SpokenText, VoicevoxSynthesizer } from "./tts/voicevox.js";
import { type LocatedTranscript, type LocateOptions } from "./transcript/locate.js";
import type { ParsedSession } from "./transcript/types.js";
import { type RenderStats } from "./video/render.js";
export { DEFAULT_OUT_DIR } from "./output.js";
/**
 * 報告のために書いたファイル(台本など)を、作業の成果として数えないよう集計から除く。
 * 既定の出力先(dopagakix-out)の中と、指定したディレクトリの中にあるファイルが対象。
 */
export declare function excludeOutputs(facts: SessionFacts, dirs?: string[]): SessionFacts;
export interface LoadedSession extends LocatedTranscript {
    session: ParsedSession;
    facts: SessionFacts;
    /** セッション ID(ログに記録がなければファイル名) */
    sessionId: string;
}
/**
 * セッションログを探して読み、画面に出す数値を集計する。動画レポートを作っていた区間は集計から除く。
 * outputDirs には、報告の台本などを置くディレクトリを渡す(変更ファイルの集計から除き、
 * そこのファイルの編集を動画の作成とみなす)。
 */
export declare function loadSession(options: LocateOptions, outputDirs?: string[]): Promise<LoadedSession>;
export interface DigestResult {
    file: string;
    facts: SessionFacts;
    /** 秘匿情報をマスク済みのダイジェスト */
    digest: string;
    level: number;
    omittedLines: number;
    redactions: number;
}
/** セッションログを、振り返り用のダイジェスト(時系列の要約)にする。 */
export declare function digestSession(options: LocateOptions & {
    maxDigestChars: number;
    timeZone?: string;
}): Promise<DigestResult>;
export interface LoadedReport {
    /** 書かれたままの台本(確認に使う) */
    raw: VideoScript;
    /** 表示用に整えた台本 */
    script: VideoScript;
    author: Author;
    /** script.json(描画したときの記録)から読んだ場合の事実情報 */
    facts?: SessionFacts;
    persona?: {
        id: string;
        name: string;
    };
    /** script.json に記録された、描画に使った読みの指定 */
    readings?: Readings;
    /** script.json に記録された BGM の設定 */
    bgm?: BgmSetting;
    /** script.json に記録された効果音の設定 */
    sfx?: SfxSetting;
}
/**
 * 台本を読む。エージェントが書いた台本(report.json)と、描画したときに残す script.json の
 * どちらも受け付ける。後者には事実情報が入っているので、同じ内容で描画し直せる。
 */
export declare function loadReport(file: string): Promise<LoadedReport>;
/**
 * 環境変数 DOPAGAKIX_REQUIRE_VOICE=1 のときは、字幕のみ(--no-voice)を許さない。
 * 指示者が設定しておけば、エージェントが読み上げを省いた動画で済ませることを防げる。
 */
export declare function assertVoiceAllowed(voice: boolean | undefined, env?: NodeJS.ProcessEnv): void;
export interface SynthesizerOptions {
    voice: boolean;
    speaker: number;
    voicevoxUrl: string;
    /** クレジット表記の指定(省略時は話者から決める) */
    credit?: string;
    /** 読みの指定(VOICEVOX に送る文だけを置き換える) */
    readings?: Readings;
    /** 接続できないときに実行するエンジンの起動コマンド(環境変数 DOPAGAKIX_VOICEVOX_START) */
    startCommand?: string;
    /** 起動コマンドを実行する直前に呼ぶ(応答を待つ間の表示用) */
    onStart?: (command: string) => void;
    fetch?: typeof fetch;
}
/**
 * 読み上げに使う合成器を作る。読み上げありで VOICEVOX に接続できなければ、起動コマンドが設定されていれば
 * エンジンを起動してから続け、なければエラーにする(字幕のみには切り替えない)。
 */
export declare function createSynthesizer(options: SynthesizerOptions): Promise<Synthesizer>;
/** 読み上げ文 1 文分の読みの確認結果 */
export interface InspectedSentence extends SpeechUnit, SpokenText {
    /** 読みを確かめてほしい理由(誤読の候補)。なければ空 */
    reasons: string[];
}
/** 台本の全ての読み上げ文を、描画と同じ単位で VOICEVOX に通し、読みを調べる */
export declare function inspectReadings(script: VideoScript, synth: VoicevoxSynthesizer): Promise<InspectedSentence[]>;
/** 読み上げる単位(speechUnits・conversationSpeechUnits)ごとに VOICEVOX に通し、読みを調べる */
export declare function inspectUnits(units: SpeechUnit[], synth: VoicevoxSynthesizer): Promise<InspectedSentence[]>;
/** check が確かめた読みを、台本と同じ場所の checked-readings.json に保存する */
export declare function saveCheckedReadings(report: string, inspected: InspectedSentence[], engine: CheckedReadings["engine"]): Promise<string>;
/**
 * 描画の前に、全ての読み上げ文の読みが check で確かめた読みと一致するかを照らし合わせる。
 * 確認していない文や読みが違う文があればエラーにする。照らし合わせたクエリで音声を作るので、
 * 動画の読みは check で表示した読みと必ず一致する。
 */
export declare function verifyReadings(report: string, script: VideoScript, synth: VoicevoxSynthesizer): Promise<number>;
/** verifyReadings と同じ照らし合わせを、読み上げる単位を渡して行う */
export declare function verifyUnits(report: string, units: SpeechUnit[], synth: VoicevoxSynthesizer): Promise<number>;
/** 出力先を作り、中身を git の管理対象から外す(pytest のキャッシュと同じく、.gitignore に * を書く)。 */
export declare function prepareOutputRoot(dir: string): Promise<void>;
export interface RenderPathOptions {
    /** 台本のパス */
    report: string;
    /** 台本のタイトル(保存先に置く動画の名前に使う) */
    title: string;
    /** 動画の出力先(-o)。作業ファイルも同じ場所に置く */
    out?: string;
    /** 完成した動画だけを置くフォルダ */
    videoDir?: string;
    /** 作業ファイルを置くフォルダ(-o や保存先の指定より優先する) */
    workDir?: string;
}
/**
 * 動画と作業ファイル(narration.wav・timeline.json・script.json)の置き場所を決める。
 * -o を最優先し、保存先の指定があれば動画だけを「台本のフォルダ名-タイトル.mp4」としてそこに置く。
 * 作業フォルダーの指定(--work-dir)があれば、作業ファイルはそこに置く(動画の名前のフォルダ名は作業フォルダーの名前)。
 */
export declare function resolveRenderPaths(options: RenderPathOptions): {
    outFile: string;
    workDir: string;
};
export interface RenderInput {
    script: VideoScript;
    facts: SessionFacts;
    author: Author;
    persona?: {
        id: string;
        name: string;
    };
    /** 描画に使う読みの指定(script.json に記録し、描画し直しても同じ読みにする) */
    readings?: Readings;
    /** BGM(probeBgm で確かめたもの)。なければ BGM なし */
    bgm?: BgmTrack;
    /** 効果音(probeSfx で確かめたもの)。なければ効果音なし */
    sfx?: SfxSet;
}
export interface RenderPipelineOptions {
    outFile: string;
    /** narration.wav・timeline.json・script.json を置く場所 */
    workDir: string;
    synth: Synthesizer;
    speed: number;
    maxSpeed: number;
    maxSeconds: number;
    fps: number;
    /** 1 で 1080x1920。テストでは小さくして時間を短縮する */
    scale?: number;
    chromiumPath?: string;
    timeZone?: string;
    onSpeechProgress?: (done: number, total: number) => void;
    onFrameProgress?: (done: number, total: number) => void;
}
export interface RenderResult {
    outFile: string;
    /** 描画に使った台本と事実情報の記録 */
    scriptFile: string;
    /** 仕上げた音声(BGM と効果音を混ぜ、音量をそろえたもの) */
    audioFile: string;
    duration: number;
    speed: number;
    credit: string | undefined;
    stats: RenderStats;
}
/** 読み上げありで、最大音量がこれを下回ったら無音とみなす(CI の確認と同じ基準) */
export declare const SILENT_DBFS = -40;
/** 台本から音声と映像を作り、mp4 に書き出す。 */
export declare function renderReport(input: RenderInput, options: RenderPipelineOptions): Promise<RenderResult>;
export interface LoadedConversation {
    /** 書かれたままの台本(確認に使う) */
    raw: ConversationScript;
    /** 表示用に整えた台本 */
    script: ConversationScript;
    facts: ConversationFacts;
    persona?: {
        id: string;
        name: string;
    };
    /** script.json に記録された、描画に使った読みの指定 */
    readings?: Readings;
}
/** 台本のファイルが、会話の要約(kind: "conversation")か */
export declare function isConversationInput(file: string): Promise<boolean>;
/** 会話の要約のファイル(台本と数値。render が残した script.json も同じ形式)を読む */
export declare function loadConversation(file: string): Promise<LoadedConversation>;
export interface ConversationRenderInput {
    /** 書かれたままの台本(表示用に整えて描画する。読み上げの単位は check と同じ) */
    raw: ConversationScript;
    facts: ConversationFacts;
    persona?: {
        id: string;
        name: string;
    };
    readings?: Readings;
}
/** 会話の要約の台本から音声と映像を作り、mp4 に書き出す。BGM と効果音は使わない */
export declare function renderConversation(input: ConversationRenderInput, options: RenderPipelineOptions): Promise<RenderResult>;
