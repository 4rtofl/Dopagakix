import path from "node:path";

/** 動画と作業ファイルの出力先(既定) */
export const DEFAULT_OUT_DIR = "dopagakix-out";

/**
 * 報告のために書いたファイル(台本など)かどうか。既定の出力先(dopagakix-out)の中と、
 * 指定したディレクトリの中にあるファイルが当てはまる。相対パスは base を基準にする。
 */
export function isOutputPath(file: string, base: string, dirs: string[] = []): boolean {
  const absolute = path.resolve(base, file);
  return (
    absolute.split(path.sep).includes(DEFAULT_OUT_DIR) ||
    dirs.map((dir) => path.resolve(dir)).some((root) => absolute === root || absolute.startsWith(`${root}${path.sep}`))
  );
}
