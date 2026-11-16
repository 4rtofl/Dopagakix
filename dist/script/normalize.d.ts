import { type VideoScript } from "./schema.js";
/** 画面に表示できる項目数 */
export declare const LIMITS: {
    readonly work: 5;
    readonly verification: 4;
    readonly decisions: 3;
    readonly nextSteps: 3;
};
/** 表示用に空白を整え、秘匿情報をマスクする */
export declare function cleanText(text: string): string;
/**
 * 台本を表示用に整える。エージェントが書いた台本にも、手で編集した script.json にも使う。
 * 件数の上限を超えた項目は切り捨て、秘匿情報の取りこぼしをもう一度マスクする。
 * 廃止した request(ご依頼の内容)は表示しないので落とす。
 */
export declare function normalizeScript(script: VideoScript): VideoScript;
