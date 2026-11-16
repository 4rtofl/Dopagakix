import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { BUILTIN_PERSONAS, findPersona, type Persona, PersonaSchema } from "./personas.js";
import { VoicevoxClient } from "./tts/voicevox.js";

export { BUILTIN_PERSONAS, checkEndings, type EndingCheck, findPersona, type Persona, PersonaSchema, personaMismatch, ZUNDAMON } from "./personas.js";

export async function loadPersonaFile(file: string): Promise<Persona> {
  let json: unknown;
  try {
    json = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    throw new Error(`口調設定 ${file} を JSON として読めません: ${(error as Error).message}`);
  }
  const parsed = PersonaSchema.safeParse(json);
  if (!parsed.success) throw new Error(`口調設定 ${file} の形式が正しくありません:\n${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

export interface ResolvePersonaOptions {
  /** "auto"(話者から判断)、"none"(使わない)、組み込みの ID、または JSON ファイルのパス */
  option: string;
  speaker: number;
  /** 読み上げなしなら auto では口調を付けない */
  voice: boolean;
  voicevoxUrl?: string;
  fetch?: typeof fetch;
}

/** エンジンが動いていれば話者 ID から話者名を引く。動いていなければ undefined。 */
async function speakerName(id: number, url: string | undefined, fetchImpl?: typeof fetch): Promise<string | undefined> {
  if (!url) return undefined;
  try {
    const speakers = await new VoicevoxClient(url, fetchImpl).speakers();
    return speakers.find((s) => s.styles.some((style) => style.id === id))?.name;
  } catch {
    return undefined;
  }
}

/** CLI の --persona の指定から、使う口調を決める。 */
export async function resolvePersona(options: ResolvePersonaOptions): Promise<Persona | undefined> {
  const { option } = options;
  if (option === "none") return undefined;
  if (option === "auto") {
    if (!options.voice) return undefined;
    return findPersona({ id: options.speaker, name: await speakerName(options.speaker, options.voicevoxUrl, options.fetch) });
  }
  const builtin = BUILTIN_PERSONAS.find((p) => p.id === option);
  if (builtin) return builtin;
  if (!existsSync(option)) {
    const ids = BUILTIN_PERSONAS.map((p) => p.id).join(", ");
    throw new Error(`口調「${option}」が見つかりません。auto / none / ${ids} / 口調設定の JSON ファイルを指定してください。`);
  }
  return loadPersonaFile(option);
}

