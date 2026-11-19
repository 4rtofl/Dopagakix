/*
 * 色と書体のトークン(ページの :root の CSS 変数)と、動画の大きさ。値は docs/design.md の「デザイントークン」。
 * 作業報告と会話の要約はこの値のまま使い、自由形式では形式の定義で上書きする。
 *
 * このファイルは Node.js の機能に頼らない(dopagakix/free の入口から読み込む)。
 */
export const VIDEO_WIDTH = 1080;
export const VIDEO_HEIGHT = 1920;
/** 色のトークン(CSS 変数)。作業報告と会話の要約はこの値のまま使う。自由形式では形式の定義の colors で上書きする */
export const DEFAULT_COLORS = {
    paper: "#f5f5f1",
    ink: "#17171b",
    ink2: "#4a4a53",
    ink3: "#6e6e78",
    /** 罫線。既定は墨の 18% */
    rule: "rgba(23, 23, 27, 0.18)",
    pass: "#1e7a4c",
    fail: "#b42318",
    skip: "#6e6e78",
    /** 一部完了。作業報告と会話の要約では CSS 変数にせず、直接書いている */
    partial: "#9a6200",
    attention: "#c2410c",
    marker: "#ffe58a",
};
export const COLOR_TOKENS = Object.keys(DEFAULT_COLORS);
/** 書体の役割ごとの CSS の font-family。見出しと数字・本文と字幕・パス */
export const DEFAULT_FONT_FAMILIES = {
    heading: '"Noto Serif JP Variable", serif',
    body: '"Zen Kaku Gothic New", sans-serif',
    mono: '"JetBrains Mono Variable", "Zen Kaku Gothic New", monospace',
};
