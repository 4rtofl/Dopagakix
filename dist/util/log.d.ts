export declare function log(message: string): void;
/**
 * 進捗表示。端末では同じ行を書き換え、そうでなければ 25% ごとに 1 行出す。
 */
export declare function progress(label: string): (done: number, total: number) => void;
