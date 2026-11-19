import { checkEndings, type Persona } from "../personas.js";
import { hardToRead, narrationBudget, type ScriptCheck, type ScriptIssue } from "../script/check.js";
import { checkFormat, type ResolvedFormat, resolveFormat } from "./format.js";
import { normalizeFreeScene } from "./normalize.js";
import type { FreeFacts, FreeFile, FreeScene, FreeScript } from "./schema.js";

/** 動画の長さの目安(秒)の既定値 */
export const DEFAULT_FREE_SECONDS = 60;

/** 読み上げ文 1 文の長さが、目安(limits.narration.chars)をこれだけ超えたら警告する(作業報告と同じ 35 → 45) */
const SENTENCE_MARGIN = 10;

export interface FreeCheckOptions {
  /**
   * 形式の定義(既定の値を足したもの)。省略すると、ファイルに定義そのものが書いてあればそれを、
   * なければ既定の形式を使う(ファイルに定義のパスが書いてあるときは、読み込んで渡す)。
   */
  format?: ResolvedFormat;
  /** 読み上げ文の口調(指定すると文末を確かめる) */
  persona?: Persona;
  /** 動画の長さの目安(秒)。既定は 60 */
  seconds?: number;
}

/** 文字数(全角も半角も 1 文字と数える) */
const length = (text: string) => [...text.trim()].length;

interface ScreenText {
  at: string;
  text: string;
  limit: number;
  /** 引用と名前。元の文のままなので、口調の確認から外す */
  verbatim?: boolean;
}

/** 画面に出る文字と、その上限 */
function screenTexts(script: FreeScript, format: ResolvedFormat): ScreenText[] {
  const L = format.limits;
  const texts: ScreenText[] = [
    { at: "script.title", text: script.title, limit: L.title },
    { at: "script.headline", text: script.headline, limit: L.headline },
  ];
  if (script.opening.label !== undefined) texts.push({ at: "script.opening.label", text: script.opening.label, limit: L.headlineLabel });
  if (script.opening.note !== undefined) texts.push({ at: "script.opening.note", text: script.opening.note, limit: L.note });
  const items = (at: string, list: string[] | undefined) => (list ?? []).map((text, i) => ({ at: `${at}[${i}]`, text, limit: L.item }));
  const label = (at: string, text: string) => ({ at: `${at}.label`, text, limit: L.label });
  script.scenes.forEach((scene, i) => {
    const at = `script.scenes[${i}]`;
    switch (scene.type) {
      case "text":
        texts.push({ at: `${at}.heading`, text: scene.heading, limit: L.heading }, ...items(`${at}.lines`, scene.lines));
        break;
      case "list":
        texts.push(label(at, scene.label), ...items(`${at}.items`, scene.items));
        break;
      case "point":
        texts.push(label(at, scene.label), { at: `${at}.point`, text: scene.point, limit: L.point }, ...items(`${at}.items`, scene.items));
        break;
      case "groups":
        texts.push(label(at, scene.label));
        scene.groups.forEach((group, j) => texts.push(label(`${at}.groups[${j}]`, group.label), ...items(`${at}.groups[${j}].items`, group.items)));
        break;
      case "quote":
        texts.push(label(at, scene.label), { at: `${at}.text`, text: scene.text, limit: L.quote, verbatim: true });
        if (scene.by !== undefined) texts.push({ at: `${at}.by`, text: scene.by, limit: L.by, verbatim: true });
        break;
      case "figure": {
        const F = L.figure;
        const { figure } = scene;
        texts.push({ at: `${at}.figure.title`, text: figure.title, limit: F.title });
        if (figure.type === "before_after") {
          figure.before.forEach((text, j) => texts.push({ at: `${at}.figure.before[${j}]`, text, limit: F.sideText }));
          figure.after.forEach((text, j) => texts.push({ at: `${at}.figure.after[${j}]`, text, limit: F.sideText }));
        } else {
          figure.steps.forEach((step, j) => {
            texts.push({ at: `${at}.figure.steps[${j}].label`, text: step.label, limit: F.stepLabel });
            if (step.note !== undefined) texts.push({ at: `${at}.figure.steps[${j}].note`, text: step.note, limit: F.stepNote });
          });
        }
        break;
      }
      case "numbers":
        texts.push(label(at, scene.label));
        break;
      case "image":
        texts.push(label(at, scene.label));
        if (scene.caption !== undefined) texts.push({ at: `${at}.caption`, text: scene.caption, limit: L.caption });
        break;
    }
  });
  (script.closing.notes ?? []).forEach((text, i) => texts.push({ at: `script.closing.notes[${i}]`, text, limit: L.closingNotes.chars }));
  return texts;
}

/** 件数の上限 */
function counts(scene: FreeScene, format: ResolvedFormat): Array<{ key: string; count: number; limit: number }> {
  const L = format.limits;
  switch (scene.type) {
    case "text":
      return [{ key: "lines", count: scene.lines.length, limit: L.items.text }];
    case "list":
      return [{ key: "items", count: scene.items.length, limit: L.items.list }];
    case "point":
      return [{ key: "items", count: scene.items?.length ?? 0, limit: L.items.point }];
    case "groups":
      return [
        { key: "groups", count: scene.groups.length, limit: L.items.groups },
        ...scene.groups.map((group, j) => ({ key: `groups[${j}].items`, count: group.items.length, limit: L.items.groupItems })),
      ];
    case "figure":
      return scene.figure.type === "before_after"
        ? [
            { key: "figure.before", count: scene.figure.before.length, limit: L.figure.sideLines },
            { key: "figure.after", count: scene.figure.after.length, limit: L.figure.sideLines },
          ]
        : [{ key: "figure.steps", count: scene.figure.steps.length, limit: L.figure.maxSteps }];
    case "numbers":
      return [{ key: "figures", count: scene.figures.length, limit: L.figures.count }];
    case "quote":
    case "image":
      return [];
  }
}

const EMPTY_SCENE: Record<FreeScene["type"], string> = {
  text: "見出しも説明もありません",
  list: "行がありません",
  point: "強調する文がありません",
  groups: "行のある組がありません",
  quote: "引用する文がありません",
  figure: "図の中身がありません(前後の比較は両方に、流れ図は段に、1 行以上要ります)",
  numbers: "数値がありません",
  image: "画像がありません",
};

/** facts(柱の左、数値、出どころ)を確かめる */
function checkFacts(facts: FreeFacts, script: FreeScript, format: ResolvedFormat): ScriptIssue[] {
  const issues: ScriptIssue[] = [];
  const L = format.limits;
  const over = (at: string, text: string, limit: number, what: string) => {
    if (length(text) > limit) issues.push({ at, message: `${length(text)} 文字あります(${what}の上限 ${limit} 文字)。文字が小さく縮小されるか、はみ出します:「${text.trim()}」` });
  };
  if (facts.where !== undefined) over("facts.where", facts.where, L.where, "柱");
  for (const [name, figure] of Object.entries(facts.figures ?? {})) {
    const at = `facts.figures.${name}`;
    over(`${at}.label`, figure.label, L.figures.label, "数値の見出し");
    if (typeof figure.value === "string") over(`${at}.value`, figure.value, L.figures.value, "値の文字列");
    if (figure.unit !== undefined) over(`${at}.unit`, figure.unit, L.figures.unit, "単位");
  }
  if (facts.source !== undefined) over("facts.source", facts.source, L.source, "数値の出どころ");
  const shown =
    (script.opening.figures?.length ?? 0) > 0 ||
    script.scenes.some((scene) => scene.type === "numbers" && normalizeFreeScene(scene, L, facts) !== undefined);
  if (shown && !facts.source?.trim()) {
    issues.push({ at: "facts.source", message: "数値を画面に出していますが、数値の出どころ(facts.source)がありません。最終ページに「数値: 〜」と出す出どころを書いてください。" });
  }
  return issues;
}

/** 形式の定義のうち、題字と柱の表示 */
function checkPage(format: ResolvedFormat, prefix: string): ScriptIssue[] {
  const issues: ScriptIssue[] = [];
  const L = format.limits;
  const { mast, labels } = format.page;
  if (mast !== undefined && length(mast) > L.mast) {
    issues.push({ at: `${prefix}page.mast`, message: `${length(mast)} 文字あります(題字の上限 ${L.mast} 文字):「${mast.trim()}」` });
  }
  if (labels.length > L.pageLabels.count) {
    issues.push({ at: `${prefix}page.labels`, message: `${labels.length} 件あります(柱の表示は ${L.pageLabels.count} 件まで)。柱からはみ出します。` });
  }
  labels.forEach((label, i) => {
    if (length(label) > L.pageLabels.chars) {
      issues.push({ at: `${prefix}page.labels[${i}]`, message: `${length(label)} 文字あります(柱の表示の上限 ${L.pageLabels.chars} 文字):「${label.trim()}」` });
    }
  });
  return issues;
}

/**
 * 形式の定義を確かめる(ファイルを読まずに分かるもの)。prefix は警告の at の頭に付ける位置(動画ごとのファイルの中なら "format.")。
 * ファイル(書体、CSS、画像)があるかは、dopagakix check が確かめる。
 */
export function checkFormatDefinition(format: ResolvedFormat, prefix = ""): ScriptIssue[] {
  return [...checkFormat(format).map((issue) => ({ at: `${prefix}${issue.at}`, message: issue.message })), ...checkPage(format, prefix)];
}

/**
 * 自由形式の動画ごとのファイルを確かめる。描画はできるが見づらくなる点や、決まりに合わない点を警告として返す
 * (形式の誤りと、facts にない数値の参照は FreeFileSchema での読み込みで検出する)。読みの確認(VOICEVOX が要る)と、
 * ファイル(書体、CSS、画像)の確認は含まない。警告の at は、動画ごとのファイルの中の位置(例: script.scenes[1].label)。
 * 形式の定義の警告は format.〜(定義のファイルの中の位置)。
 */
export function checkFreeFile(file: FreeFile, options: FreeCheckOptions = {}): ScriptCheck {
  const format = options.format ?? resolveFormat(typeof file.format === "object" ? file.format : undefined);
  const { script } = file;
  const facts = file.facts ?? {};
  const L = format.limits;
  const issues: ScriptIssue[] = [];
  const { persona } = options;
  const seconds = options.seconds ?? DEFAULT_FREE_SECONDS;
  let sentences = 0;
  let narrationChars = 0;

  const narrations = [
    { at: "script.opening.narration", lines: script.opening.narration, max: L.narration.sentences },
    ...script.scenes.map((scene, i) => ({
      at: `script.scenes[${i}].narration`,
      lines: scene.narration,
      max: scene.type === "figure" ? L.figure.narration : L.narration.sentences,
    })),
    { at: "script.closing.narration", lines: script.closing.narration, max: L.narration.sentences },
  ];
  for (const { at, lines, max } of narrations) {
    const spoken = lines.map((line) => line.trim()).filter(Boolean);
    sentences += spoken.length;
    narrationChars += spoken.reduce((n, line) => n + line.length, 0);
    if (spoken.length === 0) {
      issues.push({ at, message: "読み上げ文がありません。このシーンは読み上げも字幕もなくなります。" });
    } else if (spoken.length > max) {
      issues.push({ at, message: `${spoken.length} 文あります。このシーンは 1〜${max} 文にしてください。` });
    }
    lines.forEach((line, i) => {
      const text = line.trim();
      if (!text) return;
      if (text.length > L.narration.chars + SENTENCE_MARGIN) {
        issues.push({ at: `${at}[${i}]`, message: `${text.length} 文字あります(1 文 ${L.narration.chars} 文字以内が目安)。字幕が分かれます:「${text}」` });
      }
      const hard = hardToRead(text);
      if (hard.length > 0) {
        issues.push({ at: `${at}[${i}]`, message: `読み上げにくい表記(${hard.join("・")})があります。言い換えてください:「${text}」` });
      }
      if (persona && checkEndings([text], persona).misses.length > 0) {
        issues.push({ at: `${at}[${i}]`, message: `${persona.name}の口調の文末になっていません:「${text}」` });
      }
    });
  }

  for (const { at, text, limit, verbatim } of screenTexts(script, format)) {
    const trimmed = text.trim();
    if (length(trimmed) > limit) {
      issues.push({
        at,
        message:
          verbatim && at.endsWith(".text")
            ? `${length(trimmed)} 文字あります(上限 ${limit} 文字)。引用は元の文のまま出すので、短い文を選んでください:「${trimmed}」`
            : `${length(trimmed)} 文字あります(上限 ${limit} 文字)。文字が小さく縮小されるか、はみ出します:「${trimmed}」`,
      });
    }
    if (!verbatim && persona?.endingPattern && new RegExp(persona.endingPattern).test(trimmed)) {
      issues.push({ at, message: `画面の文字には口調を付けず、中立に書いてください:「${trimmed}」` });
    }
  }

  const openingFigures = script.opening.figures?.length ?? 0;
  if (openingFigures > L.figures.count) {
    issues.push({ at: "script.opening.figures", message: `${openingFigures} つあります。表示されるのは先頭の ${L.figures.count} つだけです。` });
  }
  const notes = script.closing.notes?.length ?? 0;
  if (notes > L.closingNotes.count) {
    issues.push({ at: "script.closing.notes", message: `${notes} 行あります。表示されるのは先頭の ${L.closingNotes.count} 行だけです。` });
  }

  let shown = 0;
  script.scenes.forEach((scene, i) => {
    const at = `script.scenes[${i}]`;
    if (!normalizeFreeScene(scene, L, facts)) {
      issues.push({ at, message: `${EMPTY_SCENE[scene.type]}。このシーンは出ません。` });
      return;
    }
    shown++;
    if (shown > L.scenes.max) {
      issues.push({ at, message: `シーンが ${L.scenes.max} を超えています。このシーンは出ません。` });
    }
    for (const { key, count, limit } of counts(scene, format)) {
      if (count > limit) issues.push({ at: `${at}.${key}`, message: `${count} 件あります。表示されるのは先頭の ${limit} 件だけです。` });
    }
    if (scene.type === "figure" && scene.figure.type === "flow") {
      const steps = scene.figure.steps.filter((step) => step.label.trim()).length;
      if (steps < L.figure.minSteps) issues.push({ at: `${at}.figure.steps`, message: `${steps} 段です。${L.figure.minSteps}〜${L.figure.maxSteps} 段にしてください。流れになりません。` });
    }
  });
  if (shown < L.scenes.min) {
    issues.push({
      at: "script.scenes",
      message: `画面に出るシーンが ${shown} つです。冒頭と締めの間に ${L.scenes.min}〜${L.scenes.max} シーンを並べてください。`,
    });
  }

  issues.push(...checkFacts(facts, script, format));
  issues.push(...checkFormatDefinition(format, "format."));

  const budget = narrationBudget(seconds);
  if (narrationChars > budget * 1.3) {
    issues.push({
      at: "narration",
      message: `読み上げ文が合計 ${narrationChars} 文字あり、目安の ${budget} 文字(約 ${seconds} 秒)を大きく超えています。話速が上がるか、動画が長くなります。`,
    });
  }

  return { issues, sentences, narrationChars, budget };
}
