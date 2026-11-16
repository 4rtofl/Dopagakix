/** 起動コマンドを実行してから、エンジンが応答するまで待つ時間の上限 */
export declare const START_TIMEOUT_MS = 60000;
export interface StartVoicevoxOptions {
    /** 起動コマンド(環境変数 DOPAGAKIX_VOICEVOX_START)。シェルで実行する */
    command: string;
    baseUrl: string;
    timeoutMs?: number;
    /** 応答を確かめる間隔 */
    intervalMs?: number;
    /** コマンドの出力の書き出し先 */
    logFile?: string;
    fetch?: typeof fetch;
}
/**
 * VOICEVOX エンジンの起動コマンドを実行し、/version に応答するまで待つ。
 * コマンドは docker start のようにすぐ終わるものでも、エンジンそのもの(終わらない)でもよい。
 * dopagakix が終わってもエンジンが動き続けるよう別のプロセスグループで起動し、出力はファイルに書かせる
 * (パイプにすると、dopagakix の終了後にエンジンの書き込みが失敗しうるため)。
 */
export declare function startVoicevox(options: StartVoicevoxOptions): Promise<void>;
export interface EngineStart {
    /** 起動コマンド。未設定なら起動しない */
    command?: string;
    baseUrl: string;
    /** 起動コマンドを実行する直前に呼ぶ(応答を待つ間の表示用) */
    onStart?: (command: string) => void;
    fetch?: typeof fetch;
}
/** run を実行し、エンジンに接続できなければ、起動コマンドでエンジンを起動してからもう一度実行する。 */
export declare function withVoicevoxStart<T>(run: () => Promise<T>, start: EngineStart): Promise<T>;
