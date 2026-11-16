import os from "node:os";
import path from "node:path";

/**
 * 先頭の ~ をホームフォルダに置き換え、絶対パスにする。
 * 設定ファイル(.claude/settings.json の env など)に書いた値はシェルを通らず、~ が展開されないため。
 */
export function resolveUserPath(file: string): string {
  return path.resolve(file.replace(/^~(?=$|[\\/])/, () => os.homedir()));
}
