import { checkEndings, type Persona } from "../personas.js";
import { hardToRead, narrationBudget, SENTENCE_LIMIT, SENTENCE_WARN, type ScriptCheck, type ScriptIssue } from "../script/check.js";
import { normalizeScene } from "./normalize.js";
import { CONVERSATION_LIMITS as L, type ConversationScene, type ConversationScript } from "./schema.js";

/** 動画の長さの目安(秒)の既定値 */
export const DEFAULT_CONVERSATION_SECONDS = 60;

export interface ConversationCheckOptions {
  /** 読み上げ文の口調(指定すると文末を確かめる) */
  persona?: Persona;
  /** 動画の長さの目安(秒)。既定は 60 */
  seconds?: number;
}

/** 動画の作成依頼への言及。動画を作ること自体は要約の対象ではない */
const VIDEO_REQUEST = /動画(?:で|に)(?:要約|まとめ|報告|紹介)|(?:要約|報告)動画/;
const VIDEO_REQUEST_MESSAGE = "動画の作成依頼に触れています。動画を作ることは要約の対象外なので、会話の内容だけを書いてください";

/** 画面に出る文字。quote は元の発言のままなので、口調の確認から外す */
function screenTexts(script: ConversationScript): Array<{ at: string; text: string; limit: number; verbatim?: boolean }> {
  const texts: Array<{ at: string; text: string; limit: number; verbatim?: boolean }> = [
    { at: "title", text: script.title, limit: L.title },
    { at: "headline", text: script.headline, limit: L.headline },
  ];
  const items = (at: string, list: string[]) => list.map((text, i) => ({ at: `${at}[${i}]`, text, limit: L.item }));
  script.scenes.forEach((scene, i) => {
    const at = `scenes[${i}]`;
    switch (scene.type) {
      case "topic":
        texts.push({ at: `${at}.heading`, text: scene.heading, limit: L.heading }, ...items(`${at}.lines`, scene.lines));
        break;
      case "flow":
        texts.push(...items(`${at}.items`, scene.items));
        break;
      case "quote":
        texts.push({ at: `${at}.text`, text: scene.text, limit: L.quote, verbatim: true });
        if (scene.by !== undefined) texts.push({ at: `${at}.by`, text: scene.by, limit: L.by, verbatim: true });
        break;
      case "points":
        texts.push({ at: `${at}.point`, text: scene.point, limit: L.point }, ...items(`${at}.opinions`, scene.opinions));
        break;
      case "outcome":
        texts.push(...items(`${at}.decided`, scene.decided), ...items(`${at}.open`, scene.open));
        break;
    }
  });
  return texts;
}

/** 件数の上限 */
function counts(scene: ConversationScene): Array<{ key: string; count: number; limit: number }> {
  switch (scene.type) {
    case "topic":
      return [{ key: "lines", count: scene.lines.length, limit: L.topicLines }];
    case "flow":
      return [{ key: "items", count: scene.items.length, limit: L.flowItems }];
    case "points":
      return [{ key: "opinions", count: scene.opinions.length, limit: L.opinions }];
    case "outcome":
      return [
        { key: "decided", count: scene.decided.length, limit: L.outcomeItems },
        { key: "open", count: scene.open.length, limit: L.outcomeItems },
      ];
    case "quote":
      return [];
  }
}

const EMPTY_SCENE: Record<ConversationScene["type"], string> = {
  topic: "見出しも説明もありません",
  flow: "流れの項目がありません",
  quote: "引用する発言がありません",
  points: "論点がありません",
  outcome: "決まったことも残ったこともありません",
};

/**
 * 会話の要約の台本を確かめる。描画はできるが見づらくなる点や、決まりに合わない点を警告として返す
 * (形式の誤りは ConversationScriptSchema での読み込みで検出する)。読みの確認(VOICEVOX が要る)は含まない。
 * 警告の at は、台本(script)の中の位置。
 */
export function checkConversationScript(script: ConversationScript, options: ConversationCheckOptions = {}): ScriptCheck {
  const issues: ScriptIssue[] = [];
  const { persona } = options;
  const seconds = options.seconds ?? DEFAULT_CONVERSATION_SECONDS;
  let sentences = 0;
  let narrationChars = 0;

  const narrations = [
    { at: "opening.narration", lines: script.opening.narration },
    ...script.scenes.map((scene, i) => ({ at: `scenes[${i}].narration`, lines: scene.narration })),
    { at: "closing.narration", lines: script.closing.narration },
  ];
  for (const { at, lines } of narrations) {
    const spoken = lines.map((line) => line.trim()).filter(Boolean);
    sentences += spoken.length;
    narrationChars += spoken.reduce((n, line) => n + line.length, 0);
    if (spoken.length === 0) {
      issues.push({ at, message: "読み上げ文がありません。このシーンは読み上げも字幕もなくなります。" });
    } else if (spoken.length > L.sentences) {
      issues.push({ at, message: `${spoken.length} 文あります。各シーン 1〜${L.sentences} 文にしてください。` });
    }
    lines.forEach((line, i) => {
      const text = line.trim();
      if (!text) return;
      if (text.length > SENTENCE_WARN) {
        issues.push({ at: `${at}[${i}]`, message: `${text.length} 文字あります(1 文 ${SENTENCE_LIMIT} 文字以内が目安)。字幕が分かれます:「${text}」` });
      }
      const hard = hardToRead(text);
      if (hard.length > 0) {
        issues.push({ at: `${at}[${i}]`, message: `読み上げにくい表記(${hard.join("・")})があります。言い換えてください:「${text}」` });
      }
      if (VIDEO_REQUEST.test(text)) issues.push({ at: `${at}[${i}]`, message: `${VIDEO_REQUEST_MESSAGE}:「${text}」` });
      if (persona && checkEndings([text], persona).misses.length > 0) {
        issues.push({ at: `${at}[${i}]`, message: `${persona.name}の口調の文末になっていません:「${text}」` });
      }
    });
  }

  for (const { at, text, limit, verbatim } of screenTexts(script)) {
    const trimmed = text.trim();
    if (verbatim) {
      // 引用は切り詰めも言い換えもできないので、上限を少しでも超えたら別の発言を選んでもらう
      if (trimmed.length > limit) {
        issues.push({
          at,
          message: at.endsWith(".by")
            ? `${trimmed.length} 文字あります(上限 ${limit} 文字)。名前が縮小されます:「${trimmed}」`
            : `${trimmed.length} 文字あります(上限 ${limit} 文字)。引用は元の発言のまま出すので、短い発言を選ぶか、引用のシーンを使わないでください:「${trimmed}」`,
        });
      }
      continue;
    }
    if (trimmed.length > Math.round(limit * 1.25)) {
      issues.push({ at, message: `${trimmed.length} 文字あります(目安 ${limit} 文字以内)。文字が小さく縮小されます:「${trimmed}」` });
    }
    if (VIDEO_REQUEST.test(trimmed)) issues.push({ at, message: `${VIDEO_REQUEST_MESSAGE}:「${trimmed}」` });
    if (persona?.endingPattern && new RegExp(persona.endingPattern).test(trimmed)) {
      issues.push({ at, message: `画面の文字には口調を付けず、中立に書いてください:「${trimmed}」` });
    }
  }

  let shown = 0;
  script.scenes.forEach((scene, i) => {
    const at = `scenes[${i}]`;
    if (!normalizeScene(scene)) {
      issues.push({ at, message: `${EMPTY_SCENE[scene.type]}。このシーンは出ません。` });
      return;
    }
    shown++;
    if (shown > L.maxScenes) {
      issues.push({ at, message: `シーンが ${L.maxScenes} を超えています。このシーンは出ません。` });
    }
    for (const { key, count, limit } of counts(scene)) {
      if (count > limit) issues.push({ at: `${at}.${key}`, message: `${count} 件あります。表示されるのは先頭の ${limit} 件だけです。` });
    }
    if (scene.type === "points" && scene.opinions.filter((t) => t.trim()).length === 0) {
      issues.push({ at: `${at}.opinions`, message: "出た意見がありません。論点だけが表示されます。" });
    }
  });
  if (shown < L.minScenes) {
    issues.push({
      at: "scenes",
      message: `画面に出るシーンが ${shown} つです。冒頭と締めの間に ${L.minScenes}〜${L.maxScenes} シーンを並べてください。`,
    });
  }

  const budget = narrationBudget(seconds);
  if (narrationChars > budget * 1.3) {
    issues.push({
      at: "narration",
      message: `読み上げ文が合計 ${narrationChars} 文字あり、目安の ${budget} 文字(約 ${seconds} 秒)を大きく超えています。話速が上がるか、動画が長くなります。`,
    });
  }

  return { issues, sentences, narrationChars, budget };
}
