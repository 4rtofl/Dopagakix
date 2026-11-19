/*
 * 動きの長さと大きさ。ページの CSS とページ内のスクリプト、シーンと字幕の時刻(timeline.ts)、
 * 効果音や図解の要素を出す時刻(audio/sfx.ts、figureTiming)が、すべてここの値を使う。
 * 既定の値は、作業報告と会話の要約の動きそのもの。自由形式では、形式の定義の motion で上書きできる。
 *
 * このファイルは Node.js の機能に頼らない(dopagakix/free の入口から読み込む)。
 */

export interface Motion {
  /** 要素の登場。登場順 i の要素は i * step + offset 秒後に現れ始め、seconds 秒かけて distance px 下から上がる */
  enter: { seconds: number; distance: number; step: number; offset: number };
  /** 罫線を左から引く長さ */
  rule: { seconds: number };
  /** シーンの切り替え。現れる長さと消える長さ */
  scene: { fadeIn: number; fadeOut: number };
  /** 字幕が現れる長さと、読み上げより先に出す時間 */
  caption: { fade: number; lead: number };
  /** 読み上げの前後の間(秒) */
  pause: { leadIn: number; lineGap: number; tail: number; closingTail: number; minScene: number };
}

export const DEFAULT_MOTION: Motion = {
  enter: { seconds: 0.38, distance: 14, step: 0.07, offset: 0.06 },
  rule: { seconds: 0.45 },
  scene: { fadeIn: 0.2, fadeOut: 0.18 },
  caption: { fade: 0.12, lead: 0.1 },
  // 文と文の間は、0.25 秒では間延びしたため詰めている。最後のシーンはクレジットを読めるよう長めに残す
  pause: { leadIn: 0.5, lineGap: 0.15, tail: 0.6, closingTail: 2.0, minScene: 2.4 },
};

/** 登場順 i の要素が現れ始める時刻(シーン開始からの秒数) */
export function enterDelay(i: number, motion: Motion = DEFAULT_MOTION): number {
  return Math.round((i * motion.enter.step + motion.enter.offset) * 1000) / 1000;
}
