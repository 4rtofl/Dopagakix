export interface RedactResult {
    text: string;
    count: number;
}
export declare function redactSecrets(input: string): RedactResult;
