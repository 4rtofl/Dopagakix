import { FREE_END_MARK } from "../audio/sfx.js";
import { fitImage, imageFrame, relativeSegments, type ResolvedFormat } from "../free/format.js";
import type { FreeFacts, FreeFigure, FreeScene, FreeScript } from "../free/schema.js";
import type { Figure } from "../script/schema.js";
import {
  DEFAULT_THEME,
  enter,
  escapeHtml,
  figureScene,
  number,
  type PageTheme,
  pageHtml,
  paperStyle,
  sectionHead,
  titleClass,
} from "./template.js";
import type { TimedScene } from "./timeline.js";
import { DEFAULT_FONT_FAMILIES, type FontRole } from "./tokens.js";

/*
 * 自由形式の動画のページ。HTML の構造は dopagakix が作り、見た目は形式の定義(色、書体、動き、形式の CSS)で変える。
 * 公開する要素とクラスの名前は docs/format.md に書く(README の「互換性の決まり」の対象)。
 * 既定の形式の見た目は、作業報告と会話の要約と同じ紙面の作法(docs/design.md)で組む。
 */

/** 形式のフォルダーの中のファイルを配信する URL の頭。描画では、これ以外の場所のファイルを読ませない(render.ts) */
export const FORMAT_URL = "/format/";
/** 画像のシーンの画像を配信する URL の頭 */
export const MEDIA_URL = "/media/";

/** 形式のフォルダーの中のファイルの URL */
export function formatUrl(file: string): string {
  const segments = relativeSegments(file);
  if (!segments) throw new Error(`形式のフォルダーの外のファイルは使えません: ${file}`);
  return FORMAT_URL + segments.map(encodeURIComponent).join("/");
}

/** 画像のシーンの画像(描画の前に、ファイルがあることと大きさを確かめたもの) */
export interface FreeImage {
  /** ページから読み込む URL(MEDIA_URL の下) */
  url: string;
  width: number;
  height: number;
}

export interface FreeTemplateInput {
  /** 表示用に整えた台本(normalizeFreeScript) */
  script: FreeScript;
  facts: FreeFacts;
  format: ResolvedFormat;
  scenes: TimedScene[];
  /** 台本の src ごとの画像 */
  images?: Record<string, FreeImage>;
  credit?: string;
  bgmCredit?: string;
  sfxCredit?: string;
  /** 読み上げなし(字幕のみ)。柱に「音声なし」と出す */
  silent?: boolean;
}

/** 数値の値。数は 3 桁ごとに区切る */
function figureValue(figure: FreeFigure): string {
  return typeof figure.value === "number" ? number(figure.value) : figure.value;
}

/** 数値の文字の幅の目安(em)。数字と英字は約 0.6em、区切りの記号は狭く、全角は 1em */
function valueEm(text: string): number {
  return [...text].reduce((n, c) => n + (/[,.:]/.test(c) ? 0.3 : /[\x20-\x7e]/.test(c) ? 0.6 : 1), 0);
}

/** 数値の大きさの決め方。width=数値 1 つに使える幅、max=数字の最大の大きさ、unit=単位の文字の大きさ(px) */
interface FigureFit {
  width: number;
  max: number;
  unit: number;
}

/** 表紙(横に並べる)と数値のシーン(縦に並べる)の、数値の大きさの決め方。既定の大きさの紙面のときの値 */
function figureFits(size: { width: number }, columns: number): { row: FigureFit; stack: FigureFit } {
  const frame = size.width - 160;
  return {
    row: { width: Math.floor(frame / Math.max(1, columns)) - 44, max: 76, unit: 30 },
    stack: { width: frame - 264, max: 104, unit: 30 },
  };
}

/**
 * 数値 1 つ。数字が枠の幅からはみ出さないよう、値と単位の長さから数字の大きさ(--fit)を決める
 * (あふれたシーンの縮小は高さしか見ないため)。それでも収まらない長さなら、単位を値の下に置く(.unit-below)。
 */
function figureHtml(figure: FreeFigure, fit: FigureFit): string {
  const value = figureValue(figure);
  const unitWidth = figure.unit ? [...figure.unit].reduce((n, c) => n + (/[\x20-\x7e]/.test(c) ? 0.55 : 1), 0) * fit.unit + 6 : 0;
  const em = Math.max(valueEm(value), 1);
  let size = Math.floor((fit.width - unitWidth) / em);
  let below = false;
  if (size < Math.round(fit.max * 0.55) && figure.unit) {
    below = true;
    size = Math.floor(fit.width / em);
  }
  size = Math.max(24, Math.min(fit.max, size));
  const unit = figure.unit ? `<small>${escapeHtml(figure.unit)}</small>` : "";
  return (
    `<div class="figure"><div class="fact-label">${escapeHtml(figure.label)}</div>` +
    `<div class="num${below ? " unit-below" : ""}" style="--fit:${size}">${escapeHtml(value)}${unit}</div></div>`
  );
}

function figuresOf(names: string[] | undefined, facts: FreeFacts): FreeFigure[] {
  return (names ?? []).flatMap((name) => (facts.figures?.[name] ? [facts.figures[name]] : []));
}

function openingScene(script: FreeScript, facts: FreeFacts, format: ResolvedFormat): string {
  const figures = figuresOf(script.opening.figures, facts);
  const fit = figureFits(format.size, figures.length).row;
  const row = figures.length
    ? `
      <div class="rule thin rule-in" style="--i:3"></div>
      <div class="enter figures even" style="--i:4; --n:${figures.length}">${figures.map((figure) => figureHtml(figure, fit)).join("")}</div>`
    : "";
  return `
    <h1 ${enter(titleClass(script.title), 0)}>${escapeHtml(script.title)}</h1>
    <div class="facts">
      <div class="rule rule-in" style="--i:1"></div>
      <div ${enter("fact-row", 2)}>
        <div class="fact-label">${escapeHtml(script.opening.label ?? "要旨")}</div>
        <div class="fact-body"><p class="lede gist">${escapeHtml(script.headline)}</p></div>
      </div>${row}
      <div class="rule thin rule-in" style="--i:5"></div>
    </div>
    ${script.opening.note ? `<div ${enter("when note", 6)}>${escapeHtml(script.opening.note)}</div>` : ""}`;
}

const rows = (items: string[], mark: (i: number) => string, from = 1) =>
  items.map((item, i) => `<li ${enter("row", i + from)}>${mark(i)}<span class="row-text">${escapeHtml(item)}</span></li>`).join("");

const LIST_MARK: Record<string, (i: number) => string> = {
  number: (i) => `<span class="num-mark">${i + 1}</span>`,
  dash: () => '<span class="dash">―</span>',
  arrow: () => '<span class="arrow">→</span>',
};
const GROUP_MARK: Record<string, string> = { circle: "○", triangle: "△", cross: "×", bar: "−" };

function sceneBody(scene: FreeScene, timed: TimedScene | undefined, input: FreeTemplateInput): string {
  const { facts, format, images } = input;
  switch (scene.type) {
    case "text":
      // 見出しの上にラベルを重ねない(docs/design.md の「避けるもの」)。罫線の下に、見出しを大きく置く
      return `<div class="section"><div class="rule rule-in"></div><h2 ${enter("text-heading", 0)}>${escapeHtml(scene.heading)}</h2></div>
    <div class="text-lines">${scene.lines.map((line, i) => `<p ${enter("text-line", i + 1)}>${escapeHtml(line)}</p>`).join("")}</div>`;
    case "list": {
      const mark = scene.mark ?? "dash";
      const tag = mark === "number" ? "ol" : "ul";
      return `${sectionHead(scene.label)}<${tag} class="rows list" data-mark="${mark}">${rows(scene.items, LIST_MARK[mark]!)}</${tag}>`;
    }
    case "point":
      return `${sectionHead(scene.label)}
    <p ${enter("point", 1)}><span class="hl">${escapeHtml(scene.point)}</span></p>
    ${scene.items?.length ? `<ul class="rows point-items">${rows(scene.items, LIST_MARK.dash!, 2)}</ul>` : ""}`;
    case "groups": {
      let order = 1;
      const groups = scene.groups
        .map((group) => {
          const from = order;
          order += group.items.length + 1;
          return (
            `<div class="group ${group.mark}" data-mark="${group.mark}"><div ${enter("group-label", from)}>${escapeHtml(group.label)}</div>` +
            `<ul class="rows">${rows(group.items, () => `<span class="check-mark">${GROUP_MARK[group.mark]}</span>`, from + 1)}</ul></div>`
          );
        })
        .join("\n    ");
      return `${sectionHead(scene.label)}
    ${groups}`;
    }
    case "quote":
      return `${sectionHead(scene.label)}
    <figure ${enter("quote", 1)}>
      <blockquote class="quote-text">${escapeHtml(scene.text)}</blockquote>
      ${scene.by ? `<figcaption class="quote-by">${escapeHtml(scene.by)}</figcaption>` : ""}
    </figure>`;
    case "figure": {
      // 作業報告の図解と同じ組み方。要素は読み上げに合わせて現れる(時刻は形式の motion の字幕の先出しに合わせる)
      const figure = { ...scene.figure, narration: scene.narration } as Figure;
      return figureScene(figure, timed, format.motion);
    }
    case "numbers":
      return `${sectionHead(scene.label)}
    <div ${enter("figures stack", 1)}>${figuresOf(scene.figures, facts)
      .map((figure) => figureHtml(figure, figureFits(format.size, 1).stack))
      .join("")}</div>`;
    case "image": {
      const image = images?.[scene.src];
      if (!image) return sectionHead(scene.label);
      const size = fitImage(image, imageFrame(format.size));
      return `${sectionHead(scene.label)}
    <figure ${enter("image", 1)}>
      <img class="image-img" src="${escapeHtml(image.url)}" alt="" width="${image.width}" height="${image.height}" style="width: calc(${size.width} * var(--u)); height: calc(${size.height} * var(--u))">
      ${scene.caption ? `<figcaption class="image-caption">${escapeHtml(scene.caption)}</figcaption>` : ""}
    </figure>`;
    }
  }
}

function closingScene(input: FreeTemplateInput): string {
  const { script, facts, credit, bgmCredit, sfxCredit } = input;
  const credits = [
    ...(script.closing.notes ?? []),
    facts.source && (script.opening.figures?.length || script.scenes.some((scene) => scene.type === "numbers")) ? `数値: ${facts.source}` : undefined,
    credit ? `音声: ${credit}` : undefined,
    bgmCredit,
    sfxCredit,
  ]
    .filter(Boolean)
    .map((line) => `<div>${escapeHtml(line!)}</div>`)
    .join("");
  return `
    <div ${enter("end-mark", FREE_END_MARK)}>以上</div>
    ${credits ? `<div ${enter("credits", FREE_END_MARK + 1)}>${credits}</div>` : ""}`;
}

/** 自由形式のシーンの、同梱のスタイル(base: paper のときだけ読み込む)。色と書体はトークンだけを使う */
export const FREE_STYLE = String.raw`
/* 自由形式 */
.lede.gist { margin-top: 0; color: var(--ink); font-weight: 700; }
.figures.even { grid-template-columns: repeat(var(--n, 3), minmax(0, 1fr)); }
/* 数字の大きさは、値と単位の長さから枠に収まるよう決める(--fit)。収まらない長さなら単位を値の下に置く */
.figure .num { font-size: calc(var(--fit, 76) * var(--u)); }
.figure .num.unit-below small { display: block; margin-left: 0; }
.text-heading {
  font-family: var(--serif); font-weight: 900; font-size: calc(72 * var(--u)); line-height: 1.3;
  font-feature-settings: "palt"; text-wrap: balance;
}
.text-lines { display: flex; flex-direction: column; gap: calc(14 * var(--u)); border-top: 1px solid var(--rule); padding-top: calc(28 * var(--u)); }
.text-line { font-size: calc(44 * var(--u)); font-weight: 500; line-height: 1.6; color: var(--ink-2); text-wrap: pretty; }
.rows[data-mark="dash"] .row, .rows[data-mark="arrow"] .row, .point-items .row, .group .row { grid-template-columns: calc(56 * var(--u)) 1fr; }
.dash { font-family: var(--serif); font-weight: 700; font-size: calc(40 * var(--u)); color: var(--ink-3); }
/* 引用: 明朝の大きな文字を鉤括弧で囲む。枠・色帯・背景の塗りは使わない */
.quote { display: flex; flex-direction: column; gap: calc(28 * var(--u)); padding-top: calc(12 * var(--u)); }
.quote-text {
  font-family: var(--serif); font-weight: 700; font-size: calc(58 * var(--u)); line-height: 1.6;
  font-feature-settings: "palt"; text-wrap: pretty; text-indent: -0.5em; padding-left: 0.5em;
}
.quote-text::before { content: "「"; }
.quote-text::after { content: "」"; }
.quote-by { align-self: flex-end; font-size: calc(36 * var(--u)); font-weight: 700; color: var(--ink-2); }
.quote-by::before { content: "― "; color: var(--ink-3); }
/* 強調する 1 文は蛍光ペンの下線で示す(判断事項と同じ --marker) */
.point { font-size: calc(52 * var(--u)); font-weight: 900; line-height: 1.45; text-wrap: balance; }
.point .hl { background: linear-gradient(transparent 62%, var(--marker) 62%); -webkit-box-decoration-break: clone; box-decoration-break: clone; }
/* 2 つに分けた行: 印の色は、成功・一部完了・失敗・未実施の色 */
.group { display: flex; flex-direction: column; gap: calc(6 * var(--u)); }
.group-label { font-size: calc(30 * var(--u)); font-weight: 700; color: var(--ink-2); letter-spacing: 0.04em; }
.group.circle .check-mark { color: var(--pass); }
.group.triangle .check-mark { color: var(--partial); }
.group.cross .check-mark { color: var(--fail); }
.group.bar .check-mark { color: var(--skip); }
/* 数値のシーン: 1 つずつ罫線で区切った行にし、数字を大きく出す */
.figures.stack { display: flex; flex-direction: column; }
.figures.stack .figure {
  display: flex; justify-content: space-between; align-items: baseline; gap: calc(24 * var(--u));
  padding: calc(26 * var(--u)) 0; border-left: none; border-bottom: 1px solid var(--rule);
}
.figures.stack .fact-label { font-size: calc(36 * var(--u)); color: var(--ink-2); }
.figures.stack .num { font-size: calc(var(--fit, 104) * var(--u)); text-align: right; }
/* 画像: 切り抜かずに枠に収め、墨の細い罫線で囲む。角丸・影・背景の塗りは使わない */
.image { display: flex; flex-direction: column; align-items: center; gap: calc(20 * var(--u)); }
.image-img { display: block; max-width: 100%; border: 1.5px solid var(--ink); }
.image-caption { align-self: stretch; font-size: calc(32 * var(--u)); font-weight: 500; line-height: 1.5; color: var(--ink-2); text-align: center; }
`;

/** 形式の書体の @font-face。ファイルは形式のフォルダーから読む */
export function fontFaces(format: ResolvedFormat): string {
  const faces: string[] = [];
  for (const spec of Object.values(format.fonts)) {
    for (const file of spec.files) {
      const ext = file.path.toLowerCase().split(".").at(-1)!;
      const type = { woff2: "woff2", woff: "woff", ttf: "truetype", otf: "opentype" }[ext] ?? ext;
      const weight = Array.isArray(file.weight) ? `${file.weight[0]} ${file.weight[1]}` : String(file.weight);
      faces.push(
        `@font-face { font-family: "${spec.family}"; src: url("${formatUrl(file.path)}") format("${type}"); font-weight: ${weight}; font-style: ${file.style ?? "normal"}; font-display: block; }`,
      );
    }
  }
  return faces.join("\n");
}

/** 形式の定義から、ページの見た目の設定を作る */
export function freeTheme(format: ResolvedFormat): PageTheme {
  const fonts = { ...DEFAULT_FONT_FAMILIES } as Record<FontRole, string>;
  for (const role of ["heading", "body", "mono"] as const) {
    const spec = format.fonts[role];
    // 指定した書体にない文字は、同梱の書体で出す(マシンの書体に頼らない)
    if (spec) fonts[role] = `"${spec.family}", ${DEFAULT_FONT_FAMILIES[role]}`;
  }
  const faces = fontFaces(format);
  const head = (faces ? `\n<style>\n${faces}\n</style>` : "") + (format.style ? `\n<link rel="stylesheet" href="${escapeHtml(formatUrl(format.style))}">` : "");
  return {
    ...DEFAULT_THEME,
    size: format.size,
    colors: format.colors,
    fonts,
    motion: format.motion,
    minScale: format.limits.minScale,
    base: format.base,
    partialToken: true,
    fontLoading: "computed",
    seekOutside: true,
    head,
  };
}

/**
 * 同梱のスタイル(dopagakix format init が style.css に写すもの)。:root のトークンは形式の定義に書くので含めない。
 * 大きさと動きの長さは format.json の size と motion で決めるので、それを書いた規則も含めない
 * (写した CSS は後から読み込むので、含めると format.json を変えても効かなくなる)。
 */
export function bundledFreeStyle(format: ResolvedFormat): string {
  // 大きさと動きの値に目印の数を入れて組み、目印を含む行を落とす
  const MARK = 987_654;
  const motion = format.motion;
  const marked = {
    ...freeTheme(format),
    size: { width: MARK, height: MARK },
    motion: {
      ...motion,
      enter: { seconds: MARK, distance: MARK, step: MARK, offset: MARK },
      rule: { seconds: MARK },
    },
  };
  return (paperStyle(marked) + FREE_STYLE)
    .split("\n")
    .filter((line) => !line.includes(String(MARK)))
    .join("\n");
}

/** 題字の横の日付(2026-11-18 → 2026.11.18) */
const dateLabel = (date: string | undefined) => (date ? date.replaceAll("-", ".") : "");

/** 自由形式の動画 1 本分のページを作る */
export function buildFreeHtml(input: FreeTemplateInput): string {
  const { script, facts, format, scenes, credit, silent } = input;
  // 冒頭と締めの間のシーンは、台本の scenes と同じ順に並ぶ
  let body = 0;
  const bodies = scenes.map((timed) => {
    if (timed.kind === "opening") return openingScene(script, facts, format);
    if (timed.kind === "closing") return closingScene(input);
    const content = script.scenes[body++];
    return content ? sceneBody(content, timed, input) : "";
  });
  return pageHtml({
    mastTitle: format.page.mast || undefined,
    date: dateLabel(facts.date),
    bodies,
    scenes,
    where: facts.where ?? "",
    labels: [...format.page.labels, credit, silent ? "音声なし" : undefined].filter((l): l is string => Boolean(l)),
    extraStyle: format.base === "paper" ? FREE_STYLE : "",
    theme: freeTheme(format),
  });
}
