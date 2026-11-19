import type { FileChange, SessionFacts } from "../facts.js";
import { type Author, type CheckResult, type Figure, STATUS_LABELS, type ScriptStatus, type VideoScript } from "../script/schema.js";
import { formatDateTime } from "../util/time.js";
import { DEFAULT_MOTION, enterDelay as motionDelay, type Motion } from "./motion.js";
import { type ColorToken, DEFAULT_COLORS, DEFAULT_FONT_FAMILIES, type FontRole, VIDEO_HEIGHT, VIDEO_WIDTH } from "./tokens.js";
import { type SceneKind, splitCaption, type TimedScene } from "./timeline.js";

export { VIDEO_HEIGHT, VIDEO_WIDTH } from "./tokens.js";

export interface TemplateInput {
  script: VideoScript;
  facts: SessionFacts;
  scenes: TimedScene[];
  credit?: string;
  /** BGM のクレジット。最終ページにそのまま表示する(下部の柱は幅が足りないため出さない) */
  bgmCredit?: string;
  /** 効果音のクレジット。最終ページにそのまま表示する */
  sfxCredit?: string;
  /** 読み上げなし(字幕のみ)。柱に「音声なし」と出し、無音が意図したものだと分かるようにする */
  silent?: boolean;
  /** 台本の書き手。agent なら作業をした AI エージェント自身 */
  author: Author;
  timeZone?: string;
}

/*
 * デザインの方針は docs/design.md を参照。
 * 「AI が作った UI」に見えやすい要素(暗色＋光彩、格子背景、紫系の色、カードの羅列、
 * 見出し上のラベルやバッジ、側面の色帯など)を避け、紙の報告書の作法
 * (罫線、明朝の見出し、○×△、文末の「以上」)で組む。
 */

/** 状態ごとの色は彩度を抑えた「インク」の色にする */
const STATUS: Record<ScriptStatus, { label: string; color: string; mark: string }> = {
  completed: { label: STATUS_LABELS.completed, color: "#1e7a4c", mark: "○" },
  partial: { label: STATUS_LABELS.partial, color: "#9a6200", mark: "△" },
  blocked: { label: STATUS_LABELS.blocked, color: "#c2410c", mark: "!" },
  failed: { label: STATUS_LABELS.failed, color: "#b42318", mark: "×" },
};

const CHECK: Record<CheckResult, { label: string; mark: string }> = {
  pass: { label: "成功", mark: "○" },
  fail: { label: "失敗", mark: "×" },
  not_run: { label: "未実施", mark: "−" },
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** 長いパスは先頭側のディレクトリを省いて末尾を残す。 */
export function shortenPath(file: string, max = 36): string {
  if (file.length <= max) return file;
  const parts = file.split("/");
  while (parts.length > 1 && `…/${parts.join("/")}`.length > max) parts.shift();
  const tail = `…/${parts.join("/")}`;
  return tail.length <= max ? tail : `…${file.slice(file.length - max + 1)}`;
}

function formatElapsed(minutes: number | undefined): { value: string; unit: string } {
  if (minutes === undefined) return { value: "-", unit: "" };
  if (minutes < 60) return { value: String(minutes), unit: "分" };
  const hours = minutes / 60;
  return { value: hours >= 10 ? String(Math.round(hours)) : hours.toFixed(1), unit: "時間" };
}

export const number = (n: number) => n.toLocaleString("ja-JP");
/** 大きな数は桁を丸めて枠に収める */
const compact = (n: number) =>
  n >= 100_000 ? `${Math.round(n / 1000)}k` : n >= 10_000 ? `${(n / 1000).toFixed(1)}k` : number(n);
/** 増減の表示。0 は色を付けない */
const delta = (sign: "+" | "−", n: number, format = number) =>
  `<span class="${sign === "+" ? "plus" : "minus"}${n === 0 ? " zero" : ""}">${sign}${format(n)}</span>`;

/** 表示幅の目安(全角 1、半角英数 0.55) */
function visualLength(text: string): number {
  return [...text].reduce((n, c) => n + (/[\x20-\x7e]/.test(c) ? 0.55 : 1), 0);
}

/**
 * タイトルの文字の大きさ。日本語は文節の途中で改行しないようにしている(word-break: auto-phrase)が、
 * 1 行に収まらない長い文節は途中で折り返されるため、2 行以上になるタイトルは小さめにする。
 */
export function titleClass(title: string): string {
  const length = visualLength(title);
  return length <= 8 ? "title" : length <= 20 ? "title mid" : "title long";
}

/** 要素の登場の遅延(秒)。登場順 i の要素は i * enter.step + enter.offset 秒後に現れ始める(motion.ts) */
const enterDelay = (i: number) => motionDelay(i, DEFAULT_MOTION);
/** 表紙の「結果」の行の登場順 */
const RESULT_ROW = 2;
/** 表紙で「結果」の行が現れる時刻(シーン開始からの秒数。効果音を鳴らす時刻) */
export const RESULT_ROW_DELAY = enterDelay(RESULT_ROW);
/** 最終ページで「以上」が現れる時刻(シーン開始からの秒数。次のステップの件数で変わる) */
export const endMarkDelay = (nextSteps: number) => enterDelay(nextSteps + 1);

/** 要素の登場順(アニメーションの遅延)を付ける */
export const enter = (cls: string, i: number) => `class="enter ${cls}" style="--i:${i}"`;

/** 新聞の欄見出しのように、罫線の下に見出しを置く */
export function sectionHead(text: string, attention = false): string {
  return `<div class="section${attention ? " attention" : ""}"><div class="rule rule-in"></div><h2 ${enter("section-title", 0)}>${escapeHtml(text)}</h2></div>`;
}

function openingScene(script: VideoScript, facts: SessionFacts, timeZone?: string): string {
  const status = STATUS[script.status];
  const added = facts.files.reduce((n, f) => n + f.added, 0);
  const removed = facts.files.reduce((n, f) => n + f.removed, 0);
  // 放置期間を含む経過時間は誤解を招くので、作業時間の推定があればそちらを出す
  const duration = formatElapsed(facts.activeMinutes ?? facts.elapsedMinutes);
  const durationLabel = facts.activeMinutes !== undefined ? "作業時間" : "経過";
  const start = formatDateTime(facts.startTime, timeZone);
  const end = formatDateTime(facts.endTime, timeZone);
  // 同じ日なら終了は時刻だけ、日をまたぐなら月日も付ける("YYYY/MM/DD HH:MM")
  const period = start ? `${start} – ${end.slice(0, 10) === start.slice(0, 10) ? end.slice(11) : end.slice(5)}` : "";
  return `
    <h1 ${enter(titleClass(script.title), 0)}>${escapeHtml(script.title)}</h1>
    <div class="facts">
      <div class="rule rule-in" style="--i:1"></div>
      <div ${enter("fact-row result", RESULT_ROW)} style="--i:${RESULT_ROW}; --status:${status.color}">
        <div class="fact-label">結果</div>
        <div class="fact-body">
          <div class="result-line"><span class="mark">${status.mark}</span>${escapeHtml(status.label)}</div>
          <p class="lede">${escapeHtml(script.headline)}</p>
        </div>
      </div>
      <div class="rule thin rule-in" style="--i:3"></div>
      <div ${enter("figures", 4)}>
        <div class="figure"><div class="fact-label">変更ファイル</div><div class="num">${number(facts.files.length)}</div></div>
        <div class="figure"><div class="fact-label">変更行</div><div class="num">${delta("+", added, compact)}<span class="sub">${delta("−", removed, compact)}</span></div></div>
        <div class="figure"><div class="fact-label">${durationLabel}</div><div class="num">${duration.value}<small>${duration.unit}</small></div></div>
      </div>
      <div class="rule thin rule-in" style="--i:5"></div>
    </div>
    ${period ? `<div ${enter("when", 6)}>${escapeHtml(period)}</div>` : ""}`;
}

/** 0 行でなければ、極端に差があっても見える棒の長さ(%) */
const MIN_BAR = 1;

/**
 * 変更ファイルの各行に付ける棒の長さ(行の幅に対する %)。追加と削除の行数に比例させ、
 * 渡したファイルのうち変更行数が最大のものを全幅にする。0 行の側は 0(棒を出さない)。
 */
export function fileBars(files: FileChange[]): Array<{ added: number; removed: number }> {
  const max = Math.max(0, ...files.map((f) => f.added + f.removed));
  const width = (n: number) => (n === 0 || max === 0 ? 0 : Math.max(MIN_BAR, Math.round((n / max) * 1000) / 10));
  return files.map((f) => ({ added: width(f.added), removed: width(f.removed) }));
}

function fileList(files: FileChange[], limit: number): string {
  if (files.length === 0) return "";
  const shown = files.slice(0, limit);
  const added = files.reduce((n, f) => n + f.added, 0);
  const removed = files.reduce((n, f) => n + f.removed, 0);
  const bars = fileBars(shown);
  const rows = shown
    .map((f, i) => {
      const bar = bars[i]!;
      // 棒は罫線と同じく左から引く。ファイルの一覧(--i:6)が出たあとに上から順に
      const graph =
        bar.added + bar.removed > 0
          ? `<div class="bar rule-in" style="--i:${8 + i}">` +
            (bar.added ? `<span class="bar-add" style="width:${bar.added}%"></span>` : "") +
            (bar.removed ? `<span class="bar-del" style="width:${bar.removed}%"></span>` : "") +
            "</div>"
          : "";
      return (
        `<li class="file"><div class="file-line"><span class="path">${escapeHtml(shortenPath(f.path))}</span>` +
        `<span class="diff">${f.created ? '<span class="new">新規</span>' : ""}${delta("+", f.added)} ${delta("−", f.removed)}</span></div>${graph}</li>`
      );
    })
    .join("");
  const more = files.length > shown.length ? `<div class="more">ほか ${files.length - shown.length} ファイル</div>` : "";
  return `<div ${enter("files", 6)}>
      <div class="files-head">変更ファイル <b>${number(files.length)}</b> 件　${delta("+", added)} ${delta("−", removed)}</div>
      <ul class="mono">${rows}</ul>${more}
    </div>`;
}

function workScene(script: VideoScript, facts: SessionFacts): string {
  const items = script.work.items
    .map(
      (item, i) =>
        `<li ${enter("row", i + 1)}><span class="num-mark">${i + 1}</span><span class="row-text">${escapeHtml(item)}</span></li>`,
    )
    .join("");
  return `
    ${sectionHead("実施した作業")}
    <ol class="rows">${items}</ol>
    ${fileList(facts.files, script.work.items.length >= 4 ? 3 : 5)}`;
}

/** 図の要素の登場時刻(シーンの開始からの秒) */
export interface FigureTiming {
  /** before_after: 変更前・矢印・変更後 */
  before?: number;
  arrow?: number;
  after?: number;
  /** flow: 各段と、その段の上の矢印(先頭の段は矢印なし) */
  steps?: number[];
  arrows?: number[];
}

/** 最初の要素は欄見出しの直後に出す */
const FIGURE_FIRST = 0.2;
/** 矢印を引き終えてから次の要素を出す */
const ARROW_LEAD = 0.3;
const FLOW_GAP = { min: 0.25, max: 1.2 } as const;

const ms = (seconds: number) => Math.round(seconds * 1000) / 1000;

/**
 * 図の要素を読み上げに合わせて出す時刻を決める。字幕の時刻は描画の前に決まっているので、
 * 同じ台本からは毎回同じ時刻になる。
 * - before_after: 変更前を最初に、変更後を 2 文目の読み上げ開始に合わせて出す(1 文だけなら、その文の中ほど)。
 * - flow: 段を上から順に出し、最後の段が読み上げの中ほどで出そろうよう間隔をとる。
 */
export function figureTiming(figure: Figure, scene: TimedScene, motion: Motion = DEFAULT_MOTION): FigureTiming {
  // 字幕は読み上げより少し前に出る(motion.caption.lead)。図も字幕に合わせる
  const FIGURE_CUE_LEAD = motion.caption.lead;
  const cues = scene.cues.map((cue) => ({ start: cue.start - scene.start, end: cue.end - scene.start }));
  if (figure.type === "before_after") {
    // 字幕は長い文を分けて表示するので、1 文目が何枚の字幕になったかを数えて 2 文目の先頭を探す
    const firstCues = figure.narration[0] ? splitCaption(figure.narration[0]).length : 0;
    const second = cues[firstCues];
    const first = cues.slice(0, firstCues);
    let after = FIGURE_FIRST + 0.6;
    if (second) after = second.start - FIGURE_CUE_LEAD;
    else if (first.length > 0) after = (first[0]!.start + first.at(-1)!.end) / 2;
    after = Math.max(after, FIGURE_FIRST + ARROW_LEAD + 0.1);
    return { before: FIGURE_FIRST, arrow: ms(after - ARROW_LEAD), after: ms(after) };
  }
  const n = figure.steps.length;
  const speechStart = cues[0]?.start ?? FIGURE_FIRST;
  const speechEnd = cues.at(-1)?.end ?? speechStart + n * FLOW_GAP.min;
  const target = (speechStart + speechEnd) / 2;
  const gap = n > 1 ? Math.min(FLOW_GAP.max, Math.max(FLOW_GAP.min, (target - FIGURE_FIRST) / (n - 1))) : 0;
  const steps = figure.steps.map((_, i) => ms(FIGURE_FIRST + i * gap));
  return { steps, arrows: steps.slice(1).map((t) => ms(t - ARROW_LEAD)) };
}

/** 下向きの矢印。軸を引いてから矢じりを引く(「線を引く」動き) */
function arrow(cls: string, at: number): string {
  return (
    `<svg class="${cls}" viewBox="0 0 24 48" aria-hidden="true">` +
    `<path class="stroke" pathLength="1" d="M12 2 V45" style="animation-delay:${ms(at)}s"/>` +
    `<path class="stroke" pathLength="1" d="M3 35 L12 45 L21 35" style="animation-delay:${ms(at + 0.18)}s"/></svg>`
  );
}

/** 指定した時刻(シーンの開始からの秒)に、下からフェードインさせる */
const enterAt = (cls: string, at: number) => `class="enter ${cls}" style="animation-delay:${ms(at)}s"`;

export function figureScene(figure: Figure, scene: TimedScene | undefined, motion: Motion = DEFAULT_MOTION): string {
  const timing = figureTiming(figure, scene ?? { kind: "figure", start: 0, end: 0, cues: [] }, motion);
  if (figure.type === "before_after") {
    const side = (cls: "before" | "after", label: string, lines: string[], at: number) =>
      `<div ${enterAt(`ba-side ${cls}`, at)}><div class="ba-label">${label}</div>` +
      `<ul class="ba-lines">${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul></div>`;
    return `${sectionHead(figure.title)}
    <div class="ba">${side("before", "変更前", figure.before, timing.before!)}${arrow("ba-arrow", timing.arrow!)}${side("after", "変更後", figure.after, timing.after!)}</div>`;
  }
  const steps = figure.steps
    .map((step, i) => {
      const label = step.changed ? `<span class="marker">${escapeHtml(step.label)}</span>` : escapeHtml(step.label);
      const note = step.note ? `<div class="step-note">${escapeHtml(step.note)}</div>` : "";
      const box = `<li ${enterAt(`step${step.changed ? " changed" : ""}`, timing.steps![i]!)}><div class="step-label">${label}</div>${note}</li>`;
      return i === 0 ? box : `<li class="flow-arrow">${arrow("", timing.arrows![i - 1]!)}</li>${box}`;
    })
    .join("");
  return `${sectionHead(figure.title)}<ol class="flow">${steps}</ol>`;
}

function verificationScene(script: VideoScript): string {
  const items = script.verification.items;
  const body = items.length
    ? `<ul class="rows">${items
        .map(
          (item, i) =>
            `<li ${enter(`row check ${item.result}`, i + 1)}><span class="check-mark">${CHECK[item.result].mark}</span>` +
            `<span class="row-text">${escapeHtml(item.label)}</span><span class="check-result">${CHECK[item.result].label}</span></li>`,
        )
        .join("")}</ul>`
    : `<p ${enter("statement warn", 1)}><span class="check-mark">−</span>検証の記録はありません</p>`;
  return `${sectionHead("検証の結果")}${body}`;
}

function decisionsScene(script: VideoScript): string {
  const items = script.decisions.items;
  if (items.length === 0) {
    return `${sectionHead("ご判断いただく事項")}
      <p ${enter("statement ok", 1)}><span class="check-mark">○</span>判断が必要な事項はありません</p>`;
  }
  const list = items
    .map(
      (item, i) =>
        `<li ${enter("row decision", i + 1)}><span class="num-mark">${i + 1}</span><div class="row-text">` +
        `<div class="d-title"><span class="marker">${escapeHtml(item.title)}</span></div>` +
        `<div class="d-detail">${escapeHtml(item.detail)}</div></div></li>`,
    )
    .join("");
  return `${sectionHead("ご判断ください", true)}<ol class="rows">${list}</ol>`;
}

function closingScene(
  script: VideoScript,
  facts: SessionFacts,
  credit: string | undefined,
  bgmCredit: string | undefined,
  sfxCredit: string | undefined,
  author: Author,
  timeZone?: string,
): string {
  const items = script.next_steps.items;
  const next = items.length
    ? `${sectionHead("次のステップ")}<ul class="rows next">${items
        .map((item, i) => `<li ${enter("row", i + 1)}><span class="arrow">→</span><span class="row-text">${escapeHtml(item)}</span></li>`)
        .join("")}</ul>`
    : "";
  const models = facts.models.length > 0 ? `(${facts.models.join("、")})` : "";
  const credits = [
    // 自己報告であること(成果を良く見せる偏りがありうること)と、数値の出どころを明記する
    author === "agent"
      ? `報告: 作業をした AI エージェント${models}による自己報告。数値はセッションログから自動集計`
      : "報告: 手動で作成。数値はセッションログから自動集計",
    credit ? `音声: ${credit}` : undefined,
    bgmCredit,
    sfxCredit,
    `セッション ${facts.sessionId?.slice(0, 8) ?? "-"} ・ ${formatDateTime(facts.endTime, timeZone) || "-"}`,
  ]
    .filter(Boolean)
    .map((line) => `<div>${escapeHtml(line!)}</div>`)
    .join("");
  return `${next}
    <div ${enter("end-mark", items.length + 1)}>以上</div>
    <div ${enter("credits", items.length + 2)}>${credits}</div>`;
}

/** ページの見た目の設定。既定(DEFAULT_THEME)は作業報告と会話の要約の見た目そのもの */
export interface PageTheme {
  size: { width: number; height: number };
  colors: Record<ColorToken, string>;
  fonts: Record<FontRole, string>;
  motion: Motion;
  /** あふれたシーンを縮める最小の倍率 */
  minScale: number;
  /** paper=同梱の紙面のスタイルを使う / none=動作に要る最小のスタイルだけ */
  base: "paper" | "none";
  /** :root に --partial を書くか(自由形式だけ。作業報告と会話の要約の CSS を変えないため) */
  partialToken?: boolean;
  /** 書体の読み込み。bundled=同梱の書体の名前と太さで読む / computed=ページの要素が使う書体をすべて読む */
  fontLoading: "bundled" | "computed";
  /**
   * シーンの外(題字や柱)の CSS のアニメーションも、動画の頭からの時刻を入れて止めるか(自由形式。形式の CSS が
   * どこに動きを書いても、同じ入力から同じ映像にする)。作業報告と会話の要約はシーンの外に動きがないので入れない
   */
  seekOutside?: boolean;
  /** <style> の後に足す <head> の中身(形式の書体の @font-face、形式の CSS の読み込み) */
  head?: string;
}

export const DEFAULT_THEME: PageTheme = {
  size: { width: VIDEO_WIDTH, height: VIDEO_HEIGHT },
  colors: { ...DEFAULT_COLORS },
  fonts: { ...DEFAULT_FONT_FAMILIES },
  motion: DEFAULT_MOTION,
  minScale: 0.6,
  base: "paper",
  fontLoading: "bundled",
};

/** :root の色と書体のトークン */
export function rootStyle(theme: PageTheme): string {
  const { colors, fonts } = theme;
  const tokens: Array<[string, string]> = [
    ["paper", colors.paper],
    ["ink", colors.ink],
    ["ink-2", colors.ink2],
    ["ink-3", colors.ink3],
    ["rule", colors.rule],
    ["pass", colors.pass],
    ["fail", colors.fail],
    ["skip", colors.skip],
    ...(theme.partialToken ? ([["partial", colors.partial]] as Array<[string, string]>) : []),
    ["attention", colors.attention],
    ["marker", colors.marker],
    ["serif", fonts.heading],
    ["gothic", fonts.body],
    ["mono", fonts.mono],
  ];
  return `\n:root {\n${tokens.map(([name, value]) => `  --${name}: ${value};\n`).join("")}}\n`;
}

/** 同梱の紙面のスタイル(:root のトークンを除く)。docs/design.md の方針で組んだもの */
export function paperStyle(theme: PageTheme): string {
  const { size, motion: m } = theme;
  return String.raw`* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: ${size.width}px; height: ${size.height}px; overflow: hidden; background: var(--paper); }
body {
  font-family: var(--gothic);
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
  line-break: strict;
  word-break: auto-phrase;
  font-kerning: normal;
}
.mono { font-family: var(--mono); }
#stage { position: relative; width: ${size.width}px; height: ${size.height}px; overflow: hidden; background: var(--paper); }

/* 題字(マストヘッド): 上辺の二重罫 */
header.masthead { position: absolute; top: 72px; left: 80px; right: 80px; }
.mast-row { display: flex; justify-content: space-between; align-items: baseline; gap: 24px; }
.mast-title { font-family: var(--serif); font-weight: 900; font-size: 40px; letter-spacing: 0.08em; }
.mast-meta { font-size: 26px; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.double-rule { margin-top: 18px; border-top: 4px solid var(--ink); padding-top: 5px; }
.double-rule::after { content: ""; display: block; border-top: 1.5px solid var(--ink); }

main { position: absolute; top: 230px; left: 80px; right: 80px; height: 1180px; }
/* 本文ページは天揃え(見出しの位置をそろえる)。表紙だけ中央に置く */
.scene { position: absolute; inset: 0; display: none; flex-direction: column; justify-content: flex-start; padding-top: 40px; }
.scene[data-kind="opening"] { justify-content: center; padding-top: 0; }
.scene.active { display: flex; }
/* --u は文字や余白の単位。内容があふれるシーンでは小さくする */
.content { --u: calc(var(--s, 1) * 1px); display: flex; flex-direction: column; gap: calc(40 * var(--u)); }

.enter { animation: rise ${m.enter.seconds}s cubic-bezier(0.2, 0, 0, 1) both; animation-delay: calc(var(--i, 0) * ${m.enter.step}s + ${m.enter.offset}s); }
@keyframes rise { from { opacity: 0; transform: translateY(${m.enter.distance}px); } to { opacity: 1; transform: none; } }
.rule { height: 0; border-top: 2px solid var(--ink); }
.rule.thin { border-top: 1px solid var(--rule); }
.rule-in { transform-origin: left center; animation: draw ${m.rule.seconds}s cubic-bezier(0.2, 0, 0, 1) both; animation-delay: calc(var(--i, 0) * ${m.enter.step}s); }
@keyframes draw { from { transform: scaleX(0); } to { transform: scaleX(1); } }

/* 表紙 */
.title {
  font-family: var(--serif); font-weight: 900; font-size: calc(104 * var(--u)); line-height: 1.22;
  letter-spacing: -0.005em; font-feature-settings: "palt"; text-wrap: balance;
}
.title.mid { font-size: calc(84 * var(--u)); }
.title.long { font-size: calc(72 * var(--u)); }
.facts { display: flex; flex-direction: column; gap: calc(26 * var(--u)); }
.fact-row { display: grid; grid-template-columns: calc(150 * var(--u)) 1fr; gap: calc(24 * var(--u)); align-items: start; }
.fact-label { font-size: calc(26 * var(--u)); font-weight: 700; color: var(--ink-3); letter-spacing: 0.04em; padding-top: calc(10 * var(--u)); }
.result-line {
  display: flex; align-items: baseline; gap: calc(16 * var(--u));
  font-size: calc(58 * var(--u)); font-weight: 900; color: var(--status); line-height: 1.2;
}
.result-line .mark { font-family: var(--serif); font-weight: 700; }
.lede { margin-top: calc(14 * var(--u)); font-size: calc(40 * var(--u)); font-weight: 500; line-height: 1.6; color: var(--ink-2); text-wrap: balance; }
.figures { display: grid; grid-template-columns: 1fr 1.3fr 1fr; }
.figure { padding: 0 calc(22 * var(--u)); border-left: 1px solid var(--rule); }
.figure:first-child { padding-left: 0; border-left: none; }
.figure .num {
  margin-top: calc(6 * var(--u)); font-family: var(--serif); font-weight: 800; font-size: calc(76 * var(--u));
  line-height: 1.1; font-variant-numeric: tabular-nums lining-nums; white-space: nowrap;
}
.figure .num small { font-family: var(--gothic); font-size: calc(30 * var(--u)); font-weight: 700; margin-left: calc(6 * var(--u)); color: var(--ink-2); }
.figure .num .sub { display: block; font-size: calc(34 * var(--u)); font-weight: 700; margin-top: calc(2 * var(--u)); }
.when { font-size: calc(26 * var(--u)); color: var(--ink-3); font-variant-numeric: tabular-nums; }
.plus { color: var(--pass); }
.minus { color: var(--fail); }
.plus.zero, .minus.zero { color: var(--ink-3); }

/* 欄見出し */
.section { display: flex; flex-direction: column; gap: calc(18 * var(--u)); }
.section-title { font-size: calc(42 * var(--u)); font-weight: 900; letter-spacing: 0.04em; }
.section.attention .rule { border-top-color: var(--attention); border-top-width: 4px; }
.section.attention .section-title { color: var(--attention); }

/* 罫線で区切った行 */
.rows { list-style: none; display: flex; flex-direction: column; }
.row {
  display: grid; grid-template-columns: calc(64 * var(--u)) 1fr auto; column-gap: calc(18 * var(--u)); align-items: baseline;
  padding: calc(24 * var(--u)) 0; border-bottom: 1px solid var(--rule);
}
.row:first-child { padding-top: calc(4 * var(--u)); }
.row-text { font-size: calc(46 * var(--u)); font-weight: 700; line-height: 1.45; text-wrap: balance; }
.num-mark { font-family: var(--serif); font-weight: 800; font-size: calc(48 * var(--u)); color: var(--ink-3); font-variant-numeric: lining-nums; }
.check-mark { font-family: var(--serif); font-weight: 800; font-size: calc(52 * var(--u)); line-height: 1; }
.check-result { font-size: calc(32 * var(--u)); font-weight: 700; white-space: nowrap; }
.check.pass .check-mark, .check.pass .check-result { color: var(--pass); }
.check.fail .check-mark, .check.fail .check-result { color: var(--fail); }
.check.not_run .check-mark, .check.not_run .check-result { color: var(--skip); }
.statement { display: flex; align-items: baseline; gap: calc(22 * var(--u)); font-size: calc(50 * var(--u)); font-weight: 900; line-height: 1.4; }
.statement.ok { color: var(--pass); }
.statement.warn { color: var(--ink-2); }

/* 変更ファイル */
.files { padding-top: calc(6 * var(--u)); }
.files-head { font-size: calc(30 * var(--u)); font-weight: 700; color: var(--ink-2); margin-bottom: calc(10 * var(--u)); }
.files-head b { color: var(--ink); font-size: calc(36 * var(--u)); }
.files ul { list-style: none; }
.file { font-size: calc(28 * var(--u)); border-bottom: 1px dotted var(--rule); }
.file-line { display: flex; justify-content: space-between; gap: calc(24 * var(--u)); line-height: 1.6; }
.file .path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file .diff { flex: none; font-variant-numeric: tabular-nums; }
.file .new { font-family: var(--gothic); font-size: calc(22 * var(--u)); font-weight: 700; color: var(--ink-2); border: 1px solid var(--ink-3); padding: 0 calc(8 * var(--u)); margin-right: calc(14 * var(--u)); vertical-align: 2px; }
/* 変更行数の棒: 追加(緑)と削除(赤)を続けて置く。行の高さを大きく変えないよう細くする */
.bar { display: flex; height: calc(6 * var(--u)); margin: calc(2 * var(--u)) 0 calc(8 * var(--u)); }
.bar-add { background: var(--pass); }
.bar-del { background: var(--fail); }
.files .more { font-size: calc(26 * var(--u)); color: var(--ink-3); margin-top: calc(8 * var(--u)); }

/* 判断事項: 見出しに蛍光ペンの下線 */
.decision .row-text { font-weight: 400; }
.d-title { font-size: calc(48 * var(--u)); font-weight: 900; line-height: 1.45; text-wrap: balance; }
.d-detail { margin-top: calc(10 * var(--u)); font-size: calc(34 * var(--u)); font-weight: 500; line-height: 1.6; color: var(--ink-2); text-wrap: pretty; }

/* 図解: 枠と矢印は墨の細い罫線。角丸・影・背景の塗りは使わない(カードに見せない) */
.ba { display: flex; flex-direction: column; align-items: stretch; }
.ba-side { border: 1.5px solid var(--ink); padding: calc(22 * var(--u)) calc(36 * var(--u)) calc(28 * var(--u)); }
.ba-side.before { border-color: var(--ink-3); border-width: 1px; }
.ba-label { font-size: calc(28 * var(--u)); font-weight: 700; color: var(--ink-3); letter-spacing: 0.04em; margin-bottom: calc(10 * var(--u)); }
.ba-lines { list-style: none; display: flex; flex-direction: column; gap: calc(8 * var(--u)); }
.ba-lines li { font-size: calc(44 * var(--u)); font-weight: 700; line-height: 1.45; }
.ba-side.before .ba-lines li { font-weight: 500; color: var(--ink-2); }
.ba-arrow .stroke { stroke-width: 1.4; }
.ba-arrow { display: block; align-self: center; width: calc(36 * var(--u)); height: calc(72 * var(--u)); margin: calc(10 * var(--u)) 0; }
.flow { list-style: none; display: flex; flex-direction: column; }
.step { border: 1.5px solid var(--ink); padding: calc(16 * var(--u)) calc(30 * var(--u)); }
.step-label { font-size: calc(42 * var(--u)); font-weight: 700; line-height: 1.4; }
.step-note { margin-top: calc(4 * var(--u)); font-size: calc(30 * var(--u)); font-weight: 500; line-height: 1.5; color: var(--ink-2); }
.step .marker, .flow-arrow svg { display: block; margin: 0 auto; width: calc(28 * var(--u)); height: calc(52 * var(--u)); }
.stroke { fill: none; stroke: var(--ink); stroke-width: 2; stroke-dasharray: 1; animation: stroke 0.22s cubic-bezier(0.2, 0, 0, 1) both; }
@keyframes stroke { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }

/* 結び */
.next .row { grid-template-columns: calc(56 * var(--u)) 1fr; }
.arrow { font-family: var(--serif); font-weight: 700; font-size: calc(44 * var(--u)); color: var(--ink-3); }
.end-mark { align-self: flex-end; font-family: var(--serif); font-weight: 800; font-size: calc(64 * var(--u)); letter-spacing: 0.2em; }
.credits { font-size: calc(26 * var(--u)); line-height: 1.8; color: var(--ink-3); border-top: 1px solid var(--rule); padding-top: calc(18 * var(--u)); }

/* 字幕: 墨ベタに白抜き */
.caption-zone { position: absolute; left: 60px; right: 60px; top: 1450px; height: 300px; display: flex; align-items: center; justify-content: center; }
/* 幅は文の長さによらず一定。均等改行(balance)は文節の途中で切れやすいので使わない */
#caption {
  width: 100%; padding: 24px 40px; background: var(--ink); color: var(--paper);
  font-size: 46px; font-weight: 700; line-height: 1.5; text-align: center; text-wrap: pretty; opacity: 0;
}

/* 柱(フッター) */
footer.folio {
  position: absolute; left: 80px; right: 80px; bottom: 60px; padding-top: 14px; border-top: 1px solid var(--rule);
  display: flex; justify-content: space-between; align-items: baseline; gap: 24px; font-size: 24px; color: var(--ink-3);
}
.where { font-family: var(--mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.right { display: flex; gap: 22px; flex: none; }
.page { font-variant-numeric: tabular-nums; color: var(--ink-2); font-weight: 700; }
`;
}

/** base が none のときのスタイル。シーンの切り替え、縮小、登場の動き、字幕など、動作に要るものだけ */
export function minimalStyle(theme: PageTheme): string {
  const { size, motion: m } = theme;
  return String.raw`
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: ${size.width}px; height: ${size.height}px; overflow: hidden; background: var(--paper); }
body { font-family: var(--gothic); color: var(--ink); -webkit-font-smoothing: antialiased; }
#stage { position: relative; width: ${size.width}px; height: ${size.height}px; overflow: hidden; background: var(--paper); }
main { position: absolute; inset: 0; }
.scene { position: absolute; inset: 0; display: none; flex-direction: column; }
.scene.active { display: flex; }
.content { --u: calc(var(--s, 1) * 1px); }
.enter { animation: rise ${m.enter.seconds}s cubic-bezier(0.2, 0, 0, 1) both; animation-delay: calc(var(--i, 0) * ${m.enter.step}s + ${m.enter.offset}s); }
@keyframes rise { from { opacity: 0; transform: translateY(${m.enter.distance}px); } to { opacity: 1; transform: none; } }
.rule-in { transform-origin: left center; animation: draw ${m.rule.seconds}s cubic-bezier(0.2, 0, 0, 1) both; animation-delay: calc(var(--i, 0) * ${m.enter.step}s); }
@keyframes draw { from { transform: scaleX(0); } to { transform: scaleX(1); } }
.stroke { fill: none; stroke: var(--ink); stroke-width: 2; stroke-dasharray: 1; animation: stroke 0.22s cubic-bezier(0.2, 0, 0, 1) both; }
@keyframes stroke { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
#caption { opacity: 0; }
`;
}

/** 同梱の書体を、名前と太さを決め打ちして読み込む(作業報告と会話の要約) */
const BUNDLED_FONT_LOADS = String.raw`    await Promise.all([
      ...[500, 700, 800, 900].map((w) => document.fonts.load(w + ' 48px "Noto Serif JP Variable"', text)),
      ...[400, 500, 700, 900].map((w) => document.fonts.load(w + ' 48px "Zen Kaku Gothic New"', text)),
      document.fonts.load('400 28px "JetBrains Mono Variable"', text),
    ]);`;

/**
 * ページの要素(::before・::after を含む)が使う書体と太さをすべて集め、画面に出る文字と字幕の文字で読み込む(自由形式)。
 * 形式の CSS が書体や太さを変えても、撮る前に読み込み終える。
 */
const COMPUTED_FONT_LOADS = String.raw`    const fonts = new Set();
    let extra = "";
    for (const el of document.querySelectorAll("body *")) {
      for (const pseudo of [null, "::before", "::after"]) {
        const style = getComputedStyle(el, pseudo);
        if (pseudo) {
          if (!style.content || style.content === "none" || style.content === "normal") continue;
          extra += style.content.replace(/^["']|["']$/g, "");
        }
        fonts.add(style.fontStyle + " " + style.fontWeight + " 48px " + style.fontFamily);
      }
    }
    await Promise.all([...fonts].map((font) => document.fonts.load(font, text + extra)));`;

/** シーンの外のアニメーションに、動画の頭からの時刻を入れて止める(自由形式) */
const SEEK_OUTSIDE = String.raw`
    for (const animation of document.getAnimations()) {
      const target = animation.effect && animation.effect.target;
      if (target && target.closest && target.closest(".scene")) continue;
      animation.pause();
      animation.currentTime = t * 1000;
      const p = animation.effect.getComputedTiming().progress;
      progress.push(p === null ? -1 : Math.round(p * 1000));
    }`;

/** ページ内で動くスクリプト。__seek(t) で時刻 t の状態を描き、同じ見た目かどうかの判定キーを返す。 */
function pageScript(theme: PageTheme): string {
  const m = theme.motion;
  const fontLoads = theme.fontLoading === "computed" ? COMPUTED_FONT_LOADS : BUNDLED_FONT_LOADS;
  return String.raw`
(() => {
  const data = JSON.parse(document.getElementById("timeline-data").textContent);
  const scenes = [...document.querySelectorAll(".scene")];
  const page = document.getElementById("page");
  const caption = document.getElementById("caption");
  const main = document.querySelector("main");
  let current = -1;

  const activate = (index) => {
    scenes.forEach((el, i) => el.classList.toggle("active", i === index));
    page.textContent = (index + 1) + " / " + scenes.length;
    current = index;
  };

  window.__prepare = async () => {
    const text = document.body.textContent + data.scenes.flatMap((s) => s.cues.map((c) => c.text)).join("");
${fontLoads}
    await document.fonts.ready;
    const fitted = [];
    scenes.forEach((scene, i) => {
      activate(i);
      const content = scene.querySelector(".content");
      let scale = 1;
      while (content.offsetHeight > main.clientHeight && scale > ${theme.minScale}) {
        scale = Math.round((scale - 0.04) * 100) / 100;
        content.style.setProperty("--s", String(scale));
      }
      fitted.push(scale);
    });
    activate(0);
    return fitted;
  };

  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const CAPTION_LEAD = ${m.caption.lead};

  window.__seek = (t) => {
    let index = data.scenes.findIndex((s) => t < s.end);
    if (index < 0) index = data.scenes.length - 1;
    if (index !== current) activate(index);
    const scene = data.scenes[index];
    const local = t - scene.start;
    const fade = Math.round(clamp01(Math.min(local / ${m.scene.fadeIn}, (scene.end - t) / ${m.scene.fadeOut})) * 100) / 100;
    const el = scenes[index];
    el.style.opacity = String(fade);

    const progress = [];
    for (const animation of el.getAnimations({ subtree: true })) {
      animation.pause();
      animation.currentTime = local * 1000;
      const p = animation.effect.getComputedTiming().progress;
      progress.push(p === null ? -1 : Math.round(p * 1000));
    }

    let cueIndex = -1;
    scene.cues.forEach((cue, i) => { if (cue.start - CAPTION_LEAD <= t) cueIndex = i; });
    let captionOpacity = 0;
    if (cueIndex >= 0) {
      const cue = scene.cues[cueIndex];
      const key = index + "-" + cueIndex;
      if (caption.dataset.key !== key) {
        caption.textContent = cue.text;
        caption.dataset.key = key;
      }
      captionOpacity = Math.round(clamp01((t - cue.start + CAPTION_LEAD) / ${m.caption.fade}) * fade * 100) / 100;
    }
    caption.style.opacity = String(captionOpacity);${theme.seekOutside ? SEEK_OUTSIDE : ""}
    return [index, fade, progress.join(","), cueIndex, captionOpacity].join("|");
  };
})();
`;
}

export interface PageInput {
  /** 題字(例: 作業報告)。undefined なら題字を出さない */
  mastTitle: string | undefined;
  /** 題字の右に出す日付。題字も日付もなければ、題字の欄(header.masthead)ごと出さない */
  date: string;
  /** シーンごとの本文。scenes と同じ順 */
  bodies: string[];
  scenes: TimedScene[];
  /** 柱の左に出す場所(プロジェクト名やチャンネル名) */
  where: string;
  /** 柱の右に出す表示(AI 作成、クレジット、音声なしなど) */
  labels: string[];
  /** 種類に固有のスタイル */
  extraStyle?: string;
  /** 見た目の設定。省略すると作業報告と会話の要約の見た目(DEFAULT_THEME) */
  theme?: PageTheme;
}

function masthead(mastTitle: string | undefined, date: string): string {
  if (mastTitle === undefined && !date) return "";
  const title = mastTitle === undefined ? "" : `
      <div class="mast-title">${escapeHtml(mastTitle)}</div>`;
  return `
  <header class="masthead">
    <div class="mast-row">${title}
      <div class="mast-meta">${escapeHtml(date)}</div>
    </div>
    <div class="double-rule"></div>
  </header>`;
}

/** 動画 1 本分のページの枠(題字・本文・字幕・柱)を組む。フォントは /fonts/ 以下から読み込む前提。 */
export function pageHtml(input: PageInput): string {
  const { mastTitle, date, bodies, scenes, where, labels, extraStyle } = input;
  const theme = input.theme ?? DEFAULT_THEME;
  const style = rootStyle(theme) + (theme.base === "paper" ? paperStyle(theme) : minimalStyle(theme));
  const sections = scenes
    .map((scene, i) => `<section class="scene" data-kind="${scene.kind}"><div class="content">${bodies[i] ?? ""}</div></section>`)
    .join("\n");
  const data = JSON.stringify({ scenes: scenes.map(({ kind, start, end, cues }) => ({ kind, start, end, cues })) }).replace(
    /</g,
    "\\u003c",
  );

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="/fonts/serif/index.css">
<link rel="stylesheet" href="/fonts/gothic/400.css">
<link rel="stylesheet" href="/fonts/gothic/500.css">
<link rel="stylesheet" href="/fonts/gothic/700.css">
<link rel="stylesheet" href="/fonts/gothic/900.css">
<link rel="stylesheet" href="/fonts/mono/index.css">
<style>${style}${extraStyle ?? ""}</style>${theme.head ?? ""}
</head>
<body>
<div id="stage">${masthead(mastTitle, date)}
  <main>
${sections}
  </main>
  <div class="caption-zone"><div id="caption"></div></div>
  <footer class="folio">
    <span class="where">${escapeHtml(where)}</span>
    <span class="right">${labels.map((l) => `<span>${escapeHtml(l)}</span>`).join("")}<span class="page" id="page"></span></span>
  </footer>
</div>
<script id="timeline-data" type="application/json">${data}</script>
<script>${pageScript(theme)}</script>
</body>
</html>`;
}

/** 作業報告の動画 1 本分のページを作る。フォントは /fonts/ 以下から読み込む前提。 */
export function buildHtml(input: TemplateInput): string {
  const { script, facts, scenes, credit, bgmCredit, sfxCredit, silent, author, timeZone } = input;
  const bodies: Record<SceneKind, () => string> = {
    opening: () => openingScene(script, facts, timeZone),
    work: () => workScene(script, facts),
    figure: () => (script.figure ? figureScene(script.figure, scenes.find((scene) => scene.kind === "figure")) : ""),
    verification: () => verificationScene(script),
    decisions: () => decisionsScene(script),
    closing: () => closingScene(script, facts, credit, bgmCredit, sfxCredit, author, timeZone),
  };
  return pageHtml({
    mastTitle: "作業報告",
    date: formatDateTime(facts.endTime, timeZone).slice(0, 10).replaceAll("/", "."),
    bodies: scenes.map((scene) => bodies[scene.kind as SceneKind]?.() ?? ""),
    scenes,
    where: [facts.project, facts.branch].filter(Boolean).join(" ・ "),
    labels: [author === "agent" ? "AI 作成" : undefined, credit, silent ? "音声なし" : undefined].filter((l): l is string => Boolean(l)),
  });
}
