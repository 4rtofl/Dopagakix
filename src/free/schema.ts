import { z } from "zod";
import { ScriptFileSchema } from "../script/schema.js";
import { DEFAULT_FREE_LIMITS, type FreeLimits, FormatSchema } from "./format.js";

/*
 * 自由形式の動画ごとのファイル(kind: "free")と、その台本の型。台本の構成は形式の定義(format.ts)によらず同じで、
 * 文字数と件数の上限だけが形式ごとに変わる(JSON Schema の説明文に、その形式の上限を書く)。
 *
 * このファイルは Node.js の機能に頼らない(dopagakix/free の入口から読み込む)。
 *
 * 互換性の決まり(README の「互換性の決まり」): ここの型は、壊す形で変えない。欄を足すときは任意の欄にし、
 * 必須の欄を足す・欄をなくす・値の範囲を狭める・意味を変えるときは FREE_VERSION を上げ、古い版も受け付ける。
 */

/** 動画ごとのファイル(FreeFileSchema)の版 */
export const FREE_VERSION = 1;

/** 冒頭と締めの間に並べるシーンの種類 */
export const FREE_SCENE_TYPES = ["text", "list", "point", "groups", "quote", "figure", "numbers", "image"] as const;
export type FreeSceneType = (typeof FREE_SCENE_TYPES)[number];

/** 行の並び(list)の印。number=番号、dash=「―」、arrow=「→」 */
export const LIST_MARKS = ["number", "dash", "arrow"] as const;
/** 2 つに分けた行(groups)の印。色は順に、成功・一部完了・失敗・未実施の色 */
export const GROUP_MARKS = ["circle", "triangle", "cross", "bar"] as const;

/** 画像のシーンで受け付ける形式 */
export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp"] as const;

/** 画像のパス。動画ごとのファイルのあるフォルダーからの相対パス。URL と絶対パスは受け付けない */
const ImagePath = z
  .string()
  .min(1, "画像のパスが空です")
  .refine((src) => !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(src) && !src.startsWith("/") && !src.startsWith("\\"), "画像は、ファイルのあるフォルダーからの相対パスで書きます(URL と絶対パスは使えません)")
  .refine(
    (src) => IMAGE_EXTENSIONS.some((ext) => src.toLowerCase().endsWith(`.${ext}`)),
    "画像は PNG、JPEG、WebP のどれかです(動く画像と SVG は使えません)",
  );

/** 台本の型を、形式の上限で作る(上限は JSON Schema の説明文に入る。読み込みで弾くのは形式の誤りだけ) */
export function freeScriptSchema(limits: FreeLimits = DEFAULT_FREE_LIMITS as FreeLimits) {
  const L = limits;
  const Narration = z
    .array(z.string())
    .describe(`このシーンの読み上げ文。字幕にもそのまま表示する。1要素=1文、1〜${L.narration.sentences}文。1文は全角${L.narration.chars}文字以内が目安`);
  const Label = z.string().describe(`欄見出し(全角${L.label}文字以内)`);
  const Items = (what: string, count: number) => z.array(z.string()).describe(`${what}。最大${count}件、各全角${L.item}文字以内`);
  const FigureNames = (count: number) =>
    z.array(z.string()).describe(`並べる数値の名前(facts.figures に書いた名前)。最大${count}つ。数値そのものは台本に書かない`);

  const TextScene = z.object({
    type: z.literal("text").describe("見出しと説明: 罫線の下に大きな見出しと説明。欄見出しは出さない"),
    heading: z.string().describe(`見出し(全角${L.heading}文字以内)`),
    lines: z.array(z.string()).describe(`説明。1〜${L.items.text}行、各全角${L.item}文字以内`),
    narration: Narration,
  });
  const ListScene = z.object({
    type: z.literal("list").describe("行の並び: 欄見出しと、印の付いた行"),
    label: Label,
    items: Items("行", L.items.list),
    mark: z.enum(LIST_MARKS).optional().describe("行の印。number=番号 / dash=「―」 / arrow=「→」。省略すると dash"),
    narration: Narration,
  });
  const PointScene = z.object({
    type: z.literal("point").describe("強調する1文: 欄見出しと、蛍光ペンの下線を引いた1文、補足の行"),
    label: Label,
    point: z.string().describe(`強調する1文(全角${L.point}文字以内)`),
    items: Items("補足の行", L.items.point).optional(),
    narration: Narration,
  });
  const GroupsScene = z.object({
    type: z.literal("groups").describe("2つに分けた行: 欄見出しと、小見出しごとの行"),
    label: Label,
    groups: z
      .array(
        z.object({
          label: z.string().describe(`小見出し(全角${L.label}文字以内)`),
          mark: z.enum(GROUP_MARKS).describe("行の印。circle=○(成功の色) / triangle=△(一部完了の色) / cross=×(失敗の色) / bar=−(未実施の色)"),
          items: Items("行", L.items.groupItems),
        }),
      )
      .describe(`組。最大${L.items.groups}組`),
    narration: Narration,
  });
  const QuoteScene = z.object({
    type: z.literal("quote").describe("引用: 欄見出しと、鉤括弧で囲んだ文、名前"),
    label: Label,
    text: z.string().describe(`引用する文(全角${L.quote}文字以内)。元の文をそのまま書く`),
    by: z.string().optional().describe(`名前(全角${L.by}文字以内)。省略すると名前を出さない`),
    narration: Narration,
  });
  const F = L.figure;
  const FigureScene = z.object({
    type: z.literal("figure").describe("図解: 変更前後の比較(before_after)か、流れ図(flow)"),
    figure: z.discriminatedUnion("type", [
      z.object({
        type: z.literal("before_after").describe("前後の比較"),
        title: z.string().describe(`図の見出し(全角${F.title}文字以内)`),
        before: z.array(z.string()).describe(`前。1〜${F.sideLines}行、各全角${F.sideText}文字以内`),
        after: z.array(z.string()).describe(`後。1〜${F.sideLines}行、各全角${F.sideText}文字以内`),
      }),
      z.object({
        type: z.literal("flow").describe("上から下への流れ"),
        title: z.string().describe(`図の見出し(全角${F.title}文字以内)`),
        steps: z
          .array(
            z.object({
              label: z.string().describe(`段の名前(全角${F.stepLabel}文字以内)`),
              note: z.string().optional().describe(`補足(全角${F.stepNote}文字以内)`),
              changed: z.boolean().optional().describe("強調する段なら true(蛍光ペンの下線を引く)"),
            }),
          )
          .describe(`上から順の段。${F.minSteps}〜${F.maxSteps}段`),
      }),
    ]),
    narration: z.array(z.string()).describe(`図解シーンの読み上げ文。1〜${F.narration}文。前後の比較では、2文目の読み上げに合わせて「後」が現れる`),
  });
  const NumbersScene = z.object({
    type: z.literal("numbers").describe("数値: 欄見出しと、facts.figures の数値"),
    label: Label,
    figures: FigureNames(L.figures.count),
    narration: Narration,
  });
  const ImageScene = z.object({
    type: z.literal("image").describe("画像: 欄見出しと、画像1枚、説明"),
    label: Label,
    src: ImagePath.describe("画像のファイル(PNG、JPEG、WebP)。動画ごとのファイルのあるフォルダーからの相対パス"),
    caption: z.string().optional().describe(`画像の説明(全角${L.caption}文字以内)`),
    narration: Narration,
  });

  const Scene = z.discriminatedUnion("type", [TextScene, ListScene, PointScene, GroupsScene, QuoteScene, FigureScene, NumbersScene, ImageScene]);

  return z.object({
    title: z.string().describe(`動画のタイトル(全角${L.title}文字以内)`),
    headline: z.string().describe(`要旨を一文で(全角${L.headline}文字以内)`),
    opening: z
      .object({
        label: z.string().optional().describe(`要旨の欄見出し(全角${L.headlineLabel}文字以内)。省略すると「要旨」`),
        figures: FigureNames(L.figures.count).optional(),
        note: z.string().optional().describe(`数値の下に出す1行(全角${L.note}文字以内)`),
        narration: Narration,
      })
      .describe("冒頭。タイトルと要旨を出す"),
    scenes: z
      .array(Scene)
      .describe(`冒頭と締めの間に並べるシーン。${L.scenes.min}〜${L.scenes.max}シーン。同じ種類を繰り返してもよい`),
    closing: z
      .object({
        notes: z.array(z.string()).optional().describe(`締めに出す行。最大${L.closingNotes.count}行、各全角${L.closingNotes.chars}文字以内`),
        narration: Narration,
      })
      .describe("締め。画面には右寄せの「以上」と、notes、数値の出どころ、クレジットを出す"),
    readings: z
      .record(z.string().min(1, "表記が空です"), z.string().min(1, "読みが空です"))
      .optional()
      .describe("読みの指定(表記 → 読み)。VOICEVOX に送る文だけを置き換え、字幕と画面の文字は元の表記のままにする"),
  });
}

/** 既定の形式の上限で作った台本の型 */
export const FreeScriptSchema = freeScriptSchema();

/** 画面に出す数値 1 つ。値は数(3 桁ごとに区切って出す)か、数で表せない短い文字列(例: v1.13.2) */
export const FreeFigureSchema = z.object({
  label: z.string().describe("見出し"),
  value: z.union([z.number().finite(), z.string()]).describe("値"),
  unit: z.string().optional().describe("単位"),
});

/**
 * 動画ごとに変わる、画面に出すもの。数値はファイルを作る側(プログラム)が数え、台本には書かない(台本は名前で参照する)。
 */
export const FreeFactsSchema = z.object({
  /** 柱の左に出す場所(例: 4rtofl/Bobert) */
  where: z.string().optional(),
  /** 題字の横の日付(ISO 8601 の日付)。描画した日からは決めない(同じファイルからは、いつ描画しても同じ映像にする) */
  date: z.iso.date().optional(),
  /** 名前を付けた数値 */
  figures: z.record(z.string().min(1), FreeFigureSchema).optional(),
  /** 数値の出どころ。最終ページに「数値: 〜」と出す */
  source: z.string().optional(),
});

/** 台本が参照する数値の名前と、台本の中の位置 */
export function figureReferences(script: z.infer<typeof FreeScriptSchema>): Array<{ path: Array<string | number>; name: string }> {
  const refs: Array<{ path: Array<string | number>; name: string }> = [];
  script.opening.figures?.forEach((name, i) => refs.push({ path: ["opening", "figures", i], name }));
  script.scenes.forEach((scene, i) => {
    if (scene.type === "numbers") scene.figures.forEach((name, j) => refs.push({ path: ["scenes", i, "figures", j], name }));
  });
  return refs;
}

/**
 * check / render に渡す、動画ごとのファイル。形式の定義(format)は、定義のファイルのパスか、定義そのもの。
 * 省略すると既定の形式を使う。render は、描画に使った読みの指定、話者、形式の定義のパスを足して、
 * 作業フォルダーの script.json に残す(同じ形式で描画し直せる)。
 */
export const FreeFileSchema = z
  .object({
    kind: z.literal("free"),
    version: z.literal(FREE_VERSION),
    /** 形式の定義のファイルのパス(このファイルのあるフォルダーからの相対パス)か、定義そのもの */
    format: z.union([z.string().min(1), FormatSchema]).optional(),
    facts: FreeFactsSchema.optional(),
    script: FreeScriptSchema,
    /** 以下は render が書く記録。渡すファイルには書かなくてよい */
    generatedAt: z.string().optional(),
    /** 相対パス(形式の定義、画像)の基準のフォルダー。render が script.json に記録する(作業フォルダーが元のファイルと違うため) */
    baseDir: z.string().optional(),
    persona: z.object({ id: z.string(), name: z.string() }).optional(),
    voice: ScriptFileSchema.shape.voice,
    readings: ScriptFileSchema.shape.readings,
    bgm: ScriptFileSchema.shape.bgm,
    sfx: ScriptFileSchema.shape.sfx,
  })
  .superRefine((file, ctx) => {
    // 台本が facts.figures にない数値を参照していたら、描画できないので形式の誤りにする
    const figures = file.facts?.figures ?? {};
    for (const { path, name } of figureReferences(file.script)) {
      if (!Object.hasOwn(figures, name)) {
        ctx.addIssue({ code: "custom", path: ["script", ...path], message: `facts.figures にない数値の名前です: "${name}"` });
      }
    }
  });

export type FreeScript = z.infer<typeof FreeScriptSchema>;
export type FreeScene = FreeScript["scenes"][number];
export type FreeFacts = z.infer<typeof FreeFactsSchema>;
export type FreeFigure = z.infer<typeof FreeFigureSchema>;
export type FreeFile = z.infer<typeof FreeFileSchema>;

/** JSON が自由形式の動画ごとのファイルとして書かれたものか。形式が正しいかは問わない */
export function isFreeFile(json: unknown): boolean {
  return json !== null && typeof json === "object" && (json as { kind?: unknown }).kind === "free";
}

/** JSON が形式の定義として書かれたものか */
export function isFormatFile(json: unknown): boolean {
  return json !== null && typeof json === "object" && (json as { kind?: unknown }).kind === "format";
}
