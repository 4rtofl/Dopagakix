import { z } from "zod";
import { type Motion } from "../video/motion.js";
import { type ColorToken, type FontRole } from "../video/tokens.js";
/** 形式の定義の版 */
export declare const FORMAT_VERSION = 1;
/**
 * 文字数(全角)と件数の上限の既定。作業報告と会話の要約の上限(CONVERSATION_LIMITS・FIGURE_LIMITS・SENTENCE_LIMIT)に
 * そろえ、新しく決めたものは Issue #25 の案の値にしている。
 */
export declare const DEFAULT_FREE_LIMITS: {
    /** タイトル、要旨 */
    readonly title: 20;
    readonly headline: 40;
    /** 題字(page.mast) */
    readonly mast: 8;
    /** 柱の左(facts.where) */
    readonly where: 24;
    /** 柱の表示(page.labels)の件数と、1 件の文字数 */
    readonly pageLabels: {
        readonly count: 2;
        readonly chars: 12;
    };
    /** 欄見出し(label)と、組の小見出し */
    readonly label: 12;
    /** 要旨の欄見出し(opening.label) */
    readonly headlineLabel: 4;
    /** 表紙の 1 行(opening.note) */
    readonly note: 30;
    /** 見出しと説明のシーンの見出し */
    readonly heading: 20;
    /** 項目 1 行(説明、行の並び、補足、2 つに分けた行) */
    readonly item: 28;
    /** 強調する 1 文 */
    readonly point: 28;
    /** 引用と、その名前 */
    readonly quote: 60;
    readonly by: 20;
    /** 画像の説明 */
    readonly caption: 28;
    /** 締めの行(closing.notes)の件数と、1 行の文字数 */
    readonly closingNotes: {
        readonly count: 3;
        readonly chars: 40;
    };
    /** 画面に出す数値。表紙と数値のシーンに並べる数と、見出し・値の文字列・単位の文字数 */
    readonly figures: {
        readonly count: 3;
        readonly label: 6;
        readonly value: 8;
        readonly unit: 4;
    };
    /** 数値の出どころ(facts.source) */
    readonly source: 40;
    /** 冒頭と締めの間に並べるシーンの数 */
    readonly scenes: {
        readonly min: 1;
        readonly max: 8;
    };
    /** シーンの種類ごとの件数。text=説明の行、list=行の並び、point=強調する 1 文の補足、groups=組の数、groupItems=1 組の行 */
    readonly items: {
        readonly text: 2;
        readonly list: 5;
        readonly point: 3;
        readonly groups: 2;
        readonly groupItems: 3;
    };
    /** 図解(作業報告の FIGURE_LIMITS と同じ) */
    readonly figure: {
        readonly title: 20;
        readonly sideLines: 3;
        readonly sideText: 16;
        readonly minSteps: 2;
        readonly maxSteps: 5;
        readonly stepLabel: 12;
        readonly stepNote: 16;
        readonly narration: 2;
    };
    /** 読み上げ。1 シーンの文の数と、1 文の文字数の目安(これより 10 文字多いと警告する) */
    readonly narration: {
        readonly sentences: 3;
        readonly chars: 35;
    };
    /** 内容が本文の枠からあふれたときに、縮める最小の倍率 */
    readonly minScale: 0.6;
};
type Widen<T> = T extends number ? number : {
    -readonly [K in keyof T]: Widen<T[K]>;
};
export type FreeLimits = Widen<typeof DEFAULT_FREE_LIMITS>;
/** パスの区切りで分けた部分。.. で上にたどり、形式のフォルダーの外に出るなら undefined */
export declare function relativeSegments(file: string): string[] | undefined;
declare const FontSpec: z.ZodObject<{
    family: z.ZodString;
    files: z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        weight: z.ZodUnion<readonly [z.ZodNumber, z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>]>;
        style: z.ZodOptional<z.ZodEnum<{
            italic: "italic";
            normal: "normal";
        }>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const FormatSchema: z.ZodObject<{
    kind: z.ZodLiteral<"format">;
    version: z.ZodLiteral<1>;
    name: z.ZodOptional<z.ZodString>;
    page: z.ZodOptional<z.ZodObject<{
        mast: z.ZodOptional<z.ZodString>;
        labels: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
    size: z.ZodOptional<z.ZodObject<{
        width: z.ZodNumber;
        height: z.ZodNumber;
    }, z.core.$strip>>;
    colors: z.ZodOptional<z.ZodObject<{
        attention: z.ZodOptional<z.ZodString>;
        fail: z.ZodOptional<z.ZodString>;
        ink: z.ZodOptional<z.ZodString>;
        ink2: z.ZodOptional<z.ZodString>;
        ink3: z.ZodOptional<z.ZodString>;
        marker: z.ZodOptional<z.ZodString>;
        paper: z.ZodOptional<z.ZodString>;
        partial: z.ZodOptional<z.ZodString>;
        pass: z.ZodOptional<z.ZodString>;
        rule: z.ZodOptional<z.ZodString>;
        skip: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    fonts: z.ZodOptional<z.ZodObject<{
        heading: z.ZodOptional<z.ZodObject<{
            family: z.ZodString;
            files: z.ZodArray<z.ZodObject<{
                path: z.ZodString;
                weight: z.ZodUnion<readonly [z.ZodNumber, z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>]>;
                style: z.ZodOptional<z.ZodEnum<{
                    italic: "italic";
                    normal: "normal";
                }>>;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
        body: z.ZodOptional<z.ZodObject<{
            family: z.ZodString;
            files: z.ZodArray<z.ZodObject<{
                path: z.ZodString;
                weight: z.ZodUnion<readonly [z.ZodNumber, z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>]>;
                style: z.ZodOptional<z.ZodEnum<{
                    italic: "italic";
                    normal: "normal";
                }>>;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
        mono: z.ZodOptional<z.ZodObject<{
            family: z.ZodString;
            files: z.ZodArray<z.ZodObject<{
                path: z.ZodString;
                weight: z.ZodUnion<readonly [z.ZodNumber, z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>]>;
                style: z.ZodOptional<z.ZodEnum<{
                    italic: "italic";
                    normal: "normal";
                }>>;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    motion: z.ZodOptional<z.ZodObject<{
        enter: z.ZodOptional<z.ZodObject<{
            seconds: z.ZodOptional<z.ZodNumber>;
            distance: z.ZodOptional<z.ZodNumber>;
            step: z.ZodOptional<z.ZodNumber>;
            offset: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        rule: z.ZodOptional<z.ZodObject<{
            seconds: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        scene: z.ZodOptional<z.ZodObject<{
            fadeIn: z.ZodOptional<z.ZodNumber>;
            fadeOut: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        caption: z.ZodOptional<z.ZodObject<{
            fade: z.ZodOptional<z.ZodNumber>;
            lead: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        pause: z.ZodOptional<z.ZodObject<{
            closingTail: z.ZodOptional<z.ZodNumber>;
            leadIn: z.ZodOptional<z.ZodNumber>;
            lineGap: z.ZodOptional<z.ZodNumber>;
            minScene: z.ZodOptional<z.ZodNumber>;
            tail: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    base: z.ZodOptional<z.ZodEnum<{
        none: "none";
        paper: "paper";
    }>>;
    style: z.ZodOptional<z.ZodString>;
    limits: z.ZodOptional<z.ZodObject<{
        title: z.ZodOptional<z.ZodNumber>;
        headline: z.ZodOptional<z.ZodNumber>;
        mast: z.ZodOptional<z.ZodNumber>;
        where: z.ZodOptional<z.ZodNumber>;
        pageLabels: z.ZodOptional<z.ZodObject<{
            count: z.ZodOptional<z.ZodNumber>;
            chars: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        label: z.ZodOptional<z.ZodNumber>;
        headlineLabel: z.ZodOptional<z.ZodNumber>;
        note: z.ZodOptional<z.ZodNumber>;
        heading: z.ZodOptional<z.ZodNumber>;
        item: z.ZodOptional<z.ZodNumber>;
        point: z.ZodOptional<z.ZodNumber>;
        quote: z.ZodOptional<z.ZodNumber>;
        by: z.ZodOptional<z.ZodNumber>;
        caption: z.ZodOptional<z.ZodNumber>;
        closingNotes: z.ZodOptional<z.ZodObject<{
            count: z.ZodOptional<z.ZodNumber>;
            chars: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        figures: z.ZodOptional<z.ZodObject<{
            count: z.ZodOptional<z.ZodNumber>;
            label: z.ZodOptional<z.ZodNumber>;
            value: z.ZodOptional<z.ZodNumber>;
            unit: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        source: z.ZodOptional<z.ZodNumber>;
        scenes: z.ZodOptional<z.ZodObject<{
            min: z.ZodOptional<z.ZodNumber>;
            max: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        items: z.ZodOptional<z.ZodObject<{
            text: z.ZodOptional<z.ZodNumber>;
            list: z.ZodOptional<z.ZodNumber>;
            point: z.ZodOptional<z.ZodNumber>;
            groups: z.ZodOptional<z.ZodNumber>;
            groupItems: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        figure: z.ZodOptional<z.ZodObject<{
            title: z.ZodOptional<z.ZodNumber>;
            sideLines: z.ZodOptional<z.ZodNumber>;
            sideText: z.ZodOptional<z.ZodNumber>;
            minSteps: z.ZodOptional<z.ZodNumber>;
            maxSteps: z.ZodOptional<z.ZodNumber>;
            stepLabel: z.ZodOptional<z.ZodNumber>;
            stepNote: z.ZodOptional<z.ZodNumber>;
            narration: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        narration: z.ZodOptional<z.ZodObject<{
            sentences: z.ZodOptional<z.ZodNumber>;
            chars: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        minScale: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type FormatDefinition = z.infer<typeof FormatSchema>;
export type FontSpec = z.infer<typeof FontSpec>;
/** 形式の定義に、既定の値を足したもの */
export interface ResolvedFormat {
    name?: string;
    page: {
        mast?: string;
        labels: string[];
    };
    size: {
        width: number;
        height: number;
    };
    colors: Record<ColorToken, string>;
    /** 形式で指定した書体。指定しなかった役割は同梱の書体 */
    fonts: Partial<Record<FontRole, FontSpec>>;
    motion: Motion;
    base: "paper" | "none";
    style?: string;
    limits: FreeLimits;
}
/** #rrggbb(aa) を { r, g, b, a } にする */
export declare function parseHexColor(color: string): {
    r: number;
    g: number;
    b: number;
    a: number;
} | undefined;
/** 形式の定義に既定の値を足す。定義がなければ既定の形式(作業報告と会話の要約の見た目と上限) */
export declare function resolveFormat(definition?: FormatDefinition): ResolvedFormat;
/**
 * 既定の値をすべて書いた形式の定義(dopagakix format init が書くもの)。書体は同梱の書体を使うので書かない。
 */
export declare function defaultFormatDefinition(name: string, style?: string): FormatDefinition;
/** 画像のシーンで、画像を収める枠の大きさ(px)。既定の大きさでは本文の枠の幅いっぱいで、字幕と重ならない高さ */
export declare function imageFrame(size: {
    width: number;
    height: number;
}): {
    width: number;
    height: number;
};
/** 枠に収まるように、画像の縦横の比を保って縮める(または拡大する) */
export declare function fitImage(image: {
    width: number;
    height: number;
}, frame: {
    width: number;
    height: number;
}): {
    width: number;
    height: number;
    scale: number;
};
/** 文字の色と背景の色のコントラスト比。半透明の色は、背景(さらにその下は白)に重ねて計算する */
export declare function contrastRatio(text: string, background: string, under?: string): number | undefined;
/** 文字のコントラスト比の目安(WCAG 2 の AA) */
export declare const MIN_CONTRAST = 4.5;
export interface FormatIssue {
    /** 形式の定義の中の位置(例: colors.ink3) */
    at: string;
    message: string;
}
/**
 * 形式の定義を確かめる(ファイルを読まずに分かるもの)。色のコントラストと、大きさと同梱のスタイルの組み合わせ、上限の矛盾。
 * どれも警告で、描画は止めない。ファイルがあるかの確認は src/free/files.ts。
 */
export declare function checkFormat(format: ResolvedFormat): FormatIssue[];
export {};
