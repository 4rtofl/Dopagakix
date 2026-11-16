/**
 * 描画に使う Chromium を探す。優先順: 明示指定 → 環境変数 DOPAGAKIX_CHROMIUM →
 * playwright-core が想定する版 → Playwright のキャッシュにある他の版 → システムの Chrome。
 */
export declare function resolveChromium(explicit?: string): string;
