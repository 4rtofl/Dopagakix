import { type Page } from "playwright-core";
declare global {
    interface Window {
        __prepare(): Promise<number[]>;
        __seek(t: number): string;
    }
}
export interface RenderOptions {
    outFile: string;
    /** 読み上げ音声(WAV) */
    audioFile: string;
    duration: number;
    fps?: number;
    /** 1 で 1080x1920。テストでは小さくして時間を短縮する */
    scale?: number;
    crf?: number;
    chromiumPath?: string;
    onProgress?: (frame: number, total: number) => void;
    /** ページの大きさ(CSS の px)。省略すると 1080×1920 */
    size?: {
        width: number;
        height: number;
    };
    /** 形式のフォルダー。ページの /format/ 以下に、このフォルダーの中のファイルだけを出す(自由形式) */
    formatDir?: string;
    /** ページの URL のパス(/media/0.png など)ごとに出すファイル(自由形式の画像) */
    files?: Record<string, string>;
}
export interface RenderStats {
    frames: number;
    /** 実際にスクリーンショットを撮った枚数(残りは直前の画像を再利用) */
    captured: number;
    width: number;
    height: number;
    /** 文字を縮めて収めたシーンの倍率 */
    fitScales: number[];
    /** 最小まで縮めても、本文の枠に収まらなかったシーン(シーンの順に true / false) */
    overflows: boolean[];
    /** 止めたリクエスト(架空のオリジン以外への読み込み)の URL */
    blocked: string[];
}
/** ページを開くときの設定(renderVideo と openPage で共通) */
export type PageOptions = Pick<RenderOptions, "chromiumPath" | "size" | "formatDir" | "files">;
/** 開いたページと、描画の準備(書体の読み込みと、あふれたシーンの縮小)の結果 */
export interface OpenedPage {
    page: Page;
    viewport: {
        width: number;
        height: number;
    };
    fitScales: number[];
    overflows: boolean[];
    /** 止めたリクエストの URL(ページを開いている間、増えていく) */
    blocked: string[];
    close(): Promise<void>;
}
/**
 * HTML を Chromium で開き、書体を読み込んで、あふれたシーンを縮める。ページのファイルは架空のオリジンから出し、
 * それ以外の宛先へのリクエストはすべて止める。描画(renderVideo)と、テストでの撮影に使う。
 */
export declare function openPage(html: string, options?: PageOptions): Promise<OpenedPage>;
/**
 * HTML を Chromium で 1 フレームずつ描き、ffmpeg で H.264/AAC の mp4 にする。
 * アニメーションはページ側の __seek(t) で時刻を指定して止めた状態を撮るため、
 * 描画速度に左右されず毎回同じ結果になる。
 */
export declare function renderVideo(html: string, options: RenderOptions): Promise<RenderStats>;
