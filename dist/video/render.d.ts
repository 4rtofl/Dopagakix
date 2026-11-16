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
}
export interface RenderStats {
    frames: number;
    /** 実際にスクリーンショットを撮った枚数(残りは直前の画像を再利用) */
    captured: number;
    width: number;
    height: number;
    /** 文字を縮めて収めたシーンの倍率 */
    fitScales: number[];
}
/**
 * HTML を Chromium で 1 フレームずつ描き、ffmpeg で H.264/AAC の mp4 にする。
 * アニメーションはページ側の __seek(t) で時刻を指定して止めた状態を撮るため、
 * 描画速度に左右されず毎回同じ結果になる。
 */
export declare function renderVideo(html: string, options: RenderOptions): Promise<RenderStats>;
