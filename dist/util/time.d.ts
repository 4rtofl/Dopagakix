/** "HH:MM"。解釈できない時刻は空文字。 */
export declare function formatClock(iso: string | undefined, timeZone?: string): string;
/** "YYYY/MM/DD HH:MM" */
export declare function formatDateTime(iso: string | undefined, timeZone?: string): string;
/** ファイル名用の "YYYYMMDD-HHMMSS" */
export declare function formatStamp(date: Date, timeZone?: string): string;
/** タイムゾーン名(表示用)。未指定なら実行環境のもの。 */
export declare function zoneLabel(timeZone?: string): string;
