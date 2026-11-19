export declare const VIDEO_WIDTH = 1080;
export declare const VIDEO_HEIGHT = 1920;
/** 色のトークン(CSS 変数)。作業報告と会話の要約はこの値のまま使う。自由形式では形式の定義の colors で上書きする */
export declare const DEFAULT_COLORS: {
    readonly paper: "#f5f5f1";
    readonly ink: "#17171b";
    readonly ink2: "#4a4a53";
    readonly ink3: "#6e6e78";
    /** 罫線。既定は墨の 18% */
    readonly rule: "rgba(23, 23, 27, 0.18)";
    readonly pass: "#1e7a4c";
    readonly fail: "#b42318";
    readonly skip: "#6e6e78";
    /** 一部完了。作業報告と会話の要約では CSS 変数にせず、直接書いている */
    readonly partial: "#9a6200";
    readonly attention: "#c2410c";
    readonly marker: "#ffe58a";
};
export type ColorToken = keyof typeof DEFAULT_COLORS;
export declare const COLOR_TOKENS: ColorToken[];
/** 書体の役割ごとの CSS の font-family。見出しと数字・本文と字幕・パス */
export declare const DEFAULT_FONT_FAMILIES: {
    readonly heading: '"Noto Serif JP Variable", serif';
    readonly body: '"Zen Kaku Gothic New", sans-serif';
    readonly mono: '"JetBrains Mono Variable", "Zen Kaku Gothic New", monospace';
};
export type FontRole = keyof typeof DEFAULT_FONT_FAMILIES;
