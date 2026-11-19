import { z } from "zod";
import { DEFAULT_MOTION, type Motion } from "../video/motion.js";
import { COLOR_TOKENS, type ColorToken, DEFAULT_COLORS, type FontRole, VIDEO_HEIGHT, VIDEO_WIDTH } from "../video/tokens.js";

/*
 * 形式の定義(kind: "format")。自由形式の動画の構成(題字と柱)、見た目(色、書体、動き、紙面の組み方)、
 * 文字数と件数の上限をまとめたもの。形式ごとに 1 回作り、動画ごとのファイル(kind: "free")から指す。
 * 定義の欄はすべて任意で、書いた欄だけが既定(作業報告と会話の要約の見た目と上限)を上書きする。
 *
 * このファイルは Node.js の機能に頼らない(dopagakix/free の入口から読み込む)。ファイルの読み込みは src/free/files.ts。
 *
 * 互換性の決まり(README の「互換性の決まり」): ここの形式は、壊す形で変えない。欄を足すのはよいが、
 * 欄をなくす、受け付ける値を狭める、意味を変えるときは FORMAT_VERSION を上げ、古い版も受け付ける。
 */

/** 形式の定義の版 */
export const FORMAT_VERSION = 1;

/**
 * 文字数(全角)と件数の上限の既定。作業報告と会話の要約の上限(CONVERSATION_LIMITS・FIGURE_LIMITS・SENTENCE_LIMIT)に
 * そろえ、新しく決めたものは Issue #25 の案の値にしている。
 */
export const DEFAULT_FREE_LIMITS = {
  /** タイトル、要旨 */
  title: 20,
  headline: 40,
  /** 題字(page.mast) */
  mast: 8,
  /** 柱の左(facts.where) */
  where: 24,
  /** 柱の表示(page.labels)の件数と、1 件の文字数 */
  pageLabels: { count: 2, chars: 12 },
  /** 欄見出し(label)と、組の小見出し */
  label: 12,
  /** 要旨の欄見出し(opening.label) */
  headlineLabel: 4,
  /** 表紙の 1 行(opening.note) */
  note: 30,
  /** 見出しと説明のシーンの見出し */
  heading: 20,
  /** 項目 1 行(説明、行の並び、補足、2 つに分けた行) */
  item: 28,
  /** 強調する 1 文 */
  point: 28,
  /** 引用と、その名前 */
  quote: 60,
  by: 20,
  /** 画像の説明 */
  caption: 28,
  /** 締めの行(closing.notes)の件数と、1 行の文字数 */
  closingNotes: { count: 3, chars: 40 },
  /** 画面に出す数値。表紙と数値のシーンに並べる数と、見出し・値の文字列・単位の文字数 */
  figures: { count: 3, label: 6, value: 8, unit: 4 },
  /** 数値の出どころ(facts.source) */
  source: 40,
  /** 冒頭と締めの間に並べるシーンの数 */
  scenes: { min: 1, max: 8 },
  /**
   * シーンの種類ごとの件数。text=説明の行、list=行の並び、point=強調する 1 文の補足、groups=組の数、groupItems=1 組の行。
   * groupItems は Issue #25 の案(3 件)から 2 件にした。2 行に折り返す項目(全角 28 文字)を 3 件ずつ並べると、本文の枠に収まらないため
   */
  items: { text: 2, list: 5, point: 3, groups: 2, groupItems: 2 },
  /** 図解(作業報告の FIGURE_LIMITS と同じ) */
  figure: { title: 20, sideLines: 3, sideText: 16, minSteps: 2, maxSteps: 5, stepLabel: 12, stepNote: 16, narration: 2 },
  /** 読み上げ。1 シーンの文の数と、1 文の文字数の目安(これより 10 文字多いと警告する) */
  narration: { sentences: 3, chars: 35 },
  /** 内容が本文の枠からあふれたときに、縮める最小の倍率 */
  minScale: 0.6,
} as const;

type Widen<T> = T extends number ? number : { -readonly [K in keyof T]: Widen<T[K]> };
export type FreeLimits = Widen<typeof DEFAULT_FREE_LIMITS>;

const Count = z.number().int().min(0);
const Chars = z.number().int().min(1);
const Seconds = z.number().min(0).max(30);

const LimitsSchema = z
  .object({
    title: Chars,
    headline: Chars,
    mast: Chars,
    where: Chars,
    pageLabels: z.object({ count: Count, chars: Chars }).partial(),
    label: Chars,
    headlineLabel: Chars,
    note: Chars,
    heading: Chars,
    item: Chars,
    point: Chars,
    quote: Chars,
    by: Chars,
    caption: Chars,
    closingNotes: z.object({ count: Count, chars: Chars }).partial(),
    figures: z.object({ count: Count, label: Chars, value: Chars, unit: Chars }).partial(),
    source: Chars,
    scenes: z.object({ min: Count, max: Count }).partial(),
    items: z.object({ text: Count, list: Count, point: Count, groups: Count, groupItems: Count }).partial(),
    figure: z
      .object({
        title: Chars,
        sideLines: Count,
        sideText: Chars,
        minSteps: Count,
        maxSteps: Count,
        stepLabel: Chars,
        stepNote: Chars,
        narration: Count,
      })
      .partial(),
    narration: z.object({ sentences: Count, chars: Chars }).partial(),
    minScale: z.number().gt(0).max(1),
  })
  .partial()
  .describe("文字数(全角)と件数の上限。書いたものだけが既定を上書きする");

/** 色。#rrggbb か #rrggbbaa */
const Color = z.string().regex(/^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, "色は #rrggbb か #rrggbbaa で書きます");

/** パスの区切りで分けた部分。.. で上にたどり、形式のフォルダーの外に出るなら undefined */
export function relativeSegments(file: string): string[] | undefined {
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(file) || file.startsWith("/") || file.startsWith("\\") || file.startsWith("//")) return undefined;
  const parts: string[] = [];
  for (const part of file.split(/[\\/]+/)) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) return undefined;
      parts.pop();
    } else parts.push(part);
  }
  return parts.length > 0 ? parts : undefined;
}

/** 形式のフォルダーの中のファイル。定義のファイルのあるフォルダーからの相対パスで、外のファイルと URL は受け付けない */
const FormatPath = z
  .string()
  .refine((file) => relativeSegments(file) !== undefined, "形式のフォルダーの中のファイルを、相対パスで書きます(URL と、フォルダーの外のファイルは使えません)");

const FONT_EXTENSIONS = ["woff2", "woff", "ttf", "otf"] as const;
const Weight = z.number().int().min(1).max(1000);

const FontFile = z.object({
  path: FormatPath.refine(
    (file) => FONT_EXTENSIONS.some((ext) => file.toLowerCase().endsWith(`.${ext}`)),
    `書体のファイルは ${FONT_EXTENSIONS.join("、")} のどれかです`,
  ).describe("書体のファイル(WOFF2、WOFF、TTF、OTF)。形式のフォルダーからの相対パス"),
  weight: z
    .union([Weight, z.tuple([Weight, Weight])])
    .describe("太さ。可変の書体なら [最小, 最大]"),
  style: z.enum(["normal", "italic"]).optional(),
});

const FontSpec = z.object({
  family: z
    .string()
    .min(1)
    .regex(/^[^"'\\;{}<>,]+$/, "書体の名前に引用符や記号(\" ' \\ ; { } < > ,)は使えません")
    .describe("書体の名前。マシンに入っている書体と重ならない名前にする"),
  files: z.array(FontFile).min(1).describe("書体のファイル。マシンに入っている書体を名前だけで指定することはできない"),
});

const Even = (label: string) =>
  z
    .number()
    .int()
    .min(2)
    .max(4096)
    .refine((n) => n % 2 === 0, `${label}は偶数にします`);

const motionPart = <T extends Record<string, number>>(shape: T) =>
  z.object(Object.fromEntries(Object.keys(shape).map((key) => [key, Seconds])) as Record<keyof T, typeof Seconds>).partial();

const MotionSchema = z
  .object({
    enter: z
      .object({ seconds: Seconds, distance: z.number().min(-400).max(400), step: Seconds, offset: Seconds })
      .partial(),
    rule: motionPart(DEFAULT_MOTION.rule),
    scene: motionPart(DEFAULT_MOTION.scene),
    caption: motionPart(DEFAULT_MOTION.caption),
    pause: motionPart(DEFAULT_MOTION.pause),
  })
  .partial();

export const FormatSchema = z.object({
  kind: z.literal("format"),
  version: z.literal(FORMAT_VERSION),
  /** 形式の名前(確認の表示に使う。画面には出さない) */
  name: z.string().optional(),
  page: z
    .object({
      mast: z.string().optional().describe("上辺の題字。書かなければ題字を出さない"),
      labels: z.array(z.string()).optional().describe("柱の右に出す表示(例: AI が書いた紹介)"),
    })
    .optional(),
  size: z.object({ width: Even("幅"), height: Even("高さ") }).optional(),
  colors: z.object(Object.fromEntries(COLOR_TOKENS.map((token) => [token, Color.optional()])) as Record<ColorToken, z.ZodOptional<typeof Color>>).optional(),
  fonts: z.object({ heading: FontSpec.optional(), body: FontSpec.optional(), mono: FontSpec.optional() }).optional(),
  motion: MotionSchema.optional(),
  /** paper=同梱の紙面のスタイルを先に読み込む / none=動作に要る最小のスタイルだけにする */
  base: z.enum(["paper", "none"]).optional(),
  /** 紙面の組み方の CSS。同梱のスタイルの後に読み込む */
  style: FormatPath.refine((file) => file.toLowerCase().endsWith(".css"), "style には CSS のファイルを書きます").optional(),
  limits: LimitsSchema.optional(),
});

export type FormatDefinition = z.infer<typeof FormatSchema>;
export type FontSpec = z.infer<typeof FontSpec>;

/** 形式の定義に、既定の値を足したもの */
export interface ResolvedFormat {
  name?: string;
  page: { mast?: string; labels: string[] };
  size: { width: number; height: number };
  colors: Record<ColorToken, string>;
  /** 形式で指定した書体。指定しなかった役割は同梱の書体 */
  fonts: Partial<Record<FontRole, FontSpec>>;
  motion: Motion;
  base: "paper" | "none";
  style?: string;
  limits: FreeLimits;
}

/** 書いた欄だけを上書きする(入れ子のオブジェクトもたどる) */
function merge<T>(base: T, override: unknown): T {
  if (override === undefined) return structuredClone(base);
  if (base === null || typeof base !== "object" || Array.isArray(base) || typeof override !== "object" || override === null) {
    return override as T;
  }
  const result = { ...base } as Record<string, unknown>;
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    result[key] = merge((base as Record<string, unknown>)[key], value);
  }
  return result as T;
}

/** #rrggbb(aa) を { r, g, b, a } にする */
export function parseHexColor(color: string): { r: number; g: number; b: number; a: number } | undefined {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i.exec(color);
  if (!match) return undefined;
  const [r, g, b] = [match[1]!, match[2]!, match[3]!].map((hex) => Number.parseInt(hex, 16));
  return { r: r!, g: g!, b: b!, a: match[4] ? Number.parseInt(match[4], 16) / 255 : 1 };
}

/** 罫線の既定は墨の 18%。墨の色を変えたら、罫線もその色の 18% にする */
function ruleFromInk(ink: string): string {
  const rgb = parseHexColor(ink);
  return rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.18)` : DEFAULT_COLORS.rule;
}

/** 形式の定義に既定の値を足す。定義がなければ既定の形式(作業報告と会話の要約の見た目と上限) */
export function resolveFormat(definition?: FormatDefinition): ResolvedFormat {
  const colors = { ...DEFAULT_COLORS, ...Object.fromEntries(Object.entries(definition?.colors ?? {}).filter(([, v]) => v !== undefined)) } as Record<
    ColorToken,
    string
  >;
  if (definition?.colors?.ink && !definition.colors.rule) colors.rule = ruleFromInk(definition.colors.ink);
  const fonts: Partial<Record<FontRole, FontSpec>> = {};
  for (const role of ["heading", "body", "mono"] as const) {
    const spec = definition?.fonts?.[role];
    if (spec) fonts[role] = spec;
  }
  return {
    ...(definition?.name ? { name: definition.name } : {}),
    page: { ...(definition?.page?.mast !== undefined ? { mast: definition.page.mast } : {}), labels: definition?.page?.labels ?? [] },
    size: definition?.size ?? { width: VIDEO_WIDTH, height: VIDEO_HEIGHT },
    colors,
    fonts,
    motion: merge(DEFAULT_MOTION, definition?.motion),
    base: definition?.base ?? "paper",
    ...(definition?.style ? { style: definition.style } : {}),
    limits: merge(DEFAULT_FREE_LIMITS as FreeLimits, definition?.limits),
  };
}

/**
 * 既定の値をすべて書いた形式の定義(dopagakix format init が書くもの)。書体は同梱の書体を使うので書かない。
 */
export function defaultFormatDefinition(name: string, style?: string): FormatDefinition {
  const resolved = resolveFormat();
  return {
    kind: "format",
    version: FORMAT_VERSION,
    name,
    page: { mast: "", labels: [] },
    size: resolved.size,
    colors: Object.fromEntries(COLOR_TOKENS.filter((token) => token !== "rule").map((token) => [token, resolved.colors[token]])),
    motion: resolved.motion,
    base: resolved.base,
    ...(style ? { style } : {}),
    limits: resolved.limits,
  };
}

/** 画像のシーンで、画像を収める枠の大きさ(px)。既定の大きさでは本文の枠の幅いっぱいで、字幕と重ならない高さ */
export function imageFrame(size: { width: number; height: number }): { width: number; height: number } {
  return { width: size.width - 160, height: Math.round((840 * size.height) / VIDEO_HEIGHT) };
}

/** 枠に収まるように、画像の縦横の比を保って縮める(または拡大する) */
export function fitImage(image: { width: number; height: number }, frame: { width: number; height: number }): { width: number; height: number; scale: number } {
  const scale = Math.min(frame.width / image.width, frame.height / image.height);
  return { width: Math.round(image.width * scale), height: Math.round(image.height * scale), scale };
}

/** 相対輝度(WCAG 2) */
function luminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

type Rgba = { r: number; g: number; b: number; a: number };

/** 半透明の色を、下の色に重ねた色にする */
function over(top: Rgba, bottom: Rgba): Rgba {
  const mix = (t: number, b: number) => t * top.a + b * (1 - top.a);
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a: 1 };
}

const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };

/** 文字の色と背景の色のコントラスト比。半透明の色は、背景(さらにその下は白)に重ねて計算する */
export function contrastRatio(text: string, background: string, under: string = "#ffffff"): number | undefined {
  const [t, b, u] = [text, background, under].map(parseHexColor);
  if (!t || !b || !u) return undefined;
  const back = over(b, over(u, WHITE));
  const front = over(t, back);
  const [l1, l2] = [luminance(front), luminance(back)].sort((x, y) => y - x);
  return Math.round(((l1! + 0.05) / (l2! + 0.05)) * 100) / 100;
}

/** 文字のコントラスト比の目安(WCAG 2 の AA) */
export const MIN_CONTRAST = 4.5;

/** 紙の上に置く文字の色 */
const TEXT_ON_PAPER: Array<{ token: ColorToken; use: string }> = [
  { token: "ink", use: "墨(本文)" },
  { token: "ink2", use: "補助の文字" },
  { token: "ink3", use: "補助の文字" },
  { token: "pass", use: "成功の色" },
  { token: "fail", use: "失敗の色" },
  { token: "skip", use: "未実施の色" },
  { token: "partial", use: "一部完了の色" },
  { token: "attention", use: "判断を求める事項の色" },
];

export interface FormatIssue {
  /** 形式の定義の中の位置(例: colors.ink3) */
  at: string;
  message: string;
}

/**
 * 形式の定義を確かめる(ファイルを読まずに分かるもの)。色のコントラストと、大きさと同梱のスタイルの組み合わせ、上限の矛盾。
 * どれも警告で、描画は止めない。ファイルがあるかの確認は src/free/files.ts。
 */
export function checkFormat(format: ResolvedFormat): FormatIssue[] {
  const issues: FormatIssue[] = [];
  const { colors } = format;
  const low = (at: string, what: string, ratio: number | undefined) => {
    if (ratio !== undefined && ratio < MIN_CONTRAST) {
      issues.push({ at, message: `${what}のコントラスト比が ${ratio.toFixed(2)}:1 です(${MIN_CONTRAST}:1 以上が目安)。読みにくくなります。` });
    }
  };
  for (const { token, use } of TEXT_ON_PAPER) {
    low(`colors.${token}`, `${use}(${colors[token]})と紙(${colors.paper})`, contrastRatio(colors[token], colors.paper));
  }
  low("colors.paper", `字幕の文字(紙の色 ${colors.paper})と字幕の帯(墨の色 ${colors.ink})`, contrastRatio(colors.paper, colors.ink, colors.paper));
  low("colors.marker", `蛍光ペン(${colors.marker})の上の墨の文字(${colors.ink})`, contrastRatio(colors.ink, colors.marker, colors.paper));

  const { width, height } = format.size;
  if (format.base === "paper" && (width !== VIDEO_WIDTH || height !== VIDEO_HEIGHT)) {
    issues.push({
      at: "size",
      message: `大きさが ${width}×${height} ですが、同梱のスタイル(base: paper)は ${VIDEO_WIDTH}×${VIDEO_HEIGHT} に合わせて組んであります。紙面の組み方を形式の CSS で書いてください。`,
    });
  }
  const { limits } = format;
  if (limits.scenes.min > limits.scenes.max) {
    issues.push({ at: "limits.scenes", message: `シーンの数の最小(${limits.scenes.min})が最大(${limits.scenes.max})より大きくなっています。` });
  }
  if (limits.figure.minSteps > limits.figure.maxSteps) {
    issues.push({ at: "limits.figure", message: `流れ図の段の数の最小(${limits.figure.minSteps})が最大(${limits.figure.maxSteps})より大きくなっています。` });
  }
  return issues;
}
