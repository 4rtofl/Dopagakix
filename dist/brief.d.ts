import { type BgmSetting } from "./audio/bgm.js";
import { type SfxSetting } from "./audio/sfx.js";
import type { SessionFacts } from "./facts.js";
import type { Persona } from "./persona.js";
export interface EnvironmentItem {
    name: string;
    /** ok=問題なし / missing=描画できない */
    status: "ok" | "missing";
    detail: string;
}
export interface EnvironmentOptions {
    voice: boolean;
    speaker: number;
    voicevoxUrl: string;
    /** クレジット表記の指定(省略時は話者から決める) */
    credit?: string;
    chromium?: string;
    /** BGM の設定(なければ BGM なし) */
    bgm?: BgmSetting;
    /** 効果音の設定(なければ効果音なし) */
    sfx?: SfxSetting;
    /** 接続できないときに実行するエンジンの起動コマンド(環境変数 DOPAGAKIX_VOICEVOX_START) */
    startCommand?: string;
    /** 起動コマンドを実行する直前に呼ぶ(応答を待つ間の表示用) */
    onStart?: (command: string) => void;
    fetch?: typeof fetch;
}
/** 描画に必要なもの(VOICEVOX・Chromium・ffmpeg)がそろっているかを、台本を書く前に確かめる。 */
export declare function checkEnvironment(options: EnvironmentOptions): Promise<EnvironmentItem[]>;
export interface BriefInput {
    facts: SessionFacts;
    /** 台本の書き出し先(表示用のパス) */
    reportFile: string;
    checkCommand: string;
    renderCommand: string;
    digestCommand: string;
    persona?: Persona;
    /** 読みの指定の件数 */
    readings: {
        builtin: number;
        project: number;
        projectFile?: string;
    };
    seconds: number;
    environment: EnvironmentItem[];
    timeZone?: string;
}
/** prepare の出力。エージェントが台本を書くときに参照する情報をまとめる。 */
export declare function buildBrief(input: BriefInput): string;
