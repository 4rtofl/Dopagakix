import { type Persona } from "./personas.js";
export { BUILTIN_PERSONAS, checkEndings, type EndingCheck, findPersona, type Persona, PersonaSchema, personaMismatch, ZUNDAMON } from "./personas.js";
export declare function loadPersonaFile(file: string): Promise<Persona>;
export interface ResolvePersonaOptions {
    /** "auto"(話者から判断)、"none"(使わない)、組み込みの ID、または JSON ファイルのパス */
    option: string;
    speaker: number;
    /** 読み上げなしなら auto では口調を付けない */
    voice: boolean;
    voicevoxUrl?: string;
    fetch?: typeof fetch;
}
/** CLI の --persona の指定から、使う口調を決める。 */
export declare function resolvePersona(options: ResolvePersonaOptions): Promise<Persona | undefined>;
