/*
 * 画像のファイルの形式と大きさを、ファイルの頭から読む(画像のシーンの確認に使う)。
 * 受け付けるのは PNG、JPEG、WebP の静止画。動く画像(APNG、動く WebP)と、ほかの形式は見分けて断る。
 */

export type ImageType = "png" | "jpeg" | "webp";

export type ImageInfo =
  | { ok: true; type: ImageType; width: number; height: number }
  | { ok: false; reason: string };

const ascii = (bytes: Uint8Array, start: number, length: number) => String.fromCharCode(...bytes.subarray(start, start + length));
const u16be = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!;
const u32be = (b: Uint8Array, i: number) => ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!;
const u16le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8);
const u24le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16);

function png(bytes: Uint8Array): ImageInfo {
  if (ascii(bytes, 12, 4) !== "IHDR") return { ok: false, reason: "PNG の形式が正しくありません" };
  // 動く PNG(APNG)は、画像のデータ(IDAT)の前に acTL を置く
  for (let i = 8; i + 8 <= bytes.length; ) {
    const length = u32be(bytes, i);
    const type = ascii(bytes, i + 4, 4);
    if (type === "acTL") return { ok: false, reason: "動く PNG(APNG)は使えません" };
    if (type === "IDAT" || type === "IEND") break;
    i += 12 + length;
  }
  return { ok: true, type: "png", width: u32be(bytes, 16), height: u32be(bytes, 20) };
}

function jpeg(bytes: Uint8Array): ImageInfo {
  for (let i = 2; i + 9 < bytes.length; ) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = bytes[i + 1]!;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xff) {
      i += marker === 0xff ? 1 : 2;
      continue;
    }
    // SOF0〜SOF15(DHT・JPG・DAC を除く)に縦横の大きさがある
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { ok: true, type: "jpeg", width: u16be(bytes, i + 7), height: u16be(bytes, i + 5) };
    }
    i += 2 + u16be(bytes, i + 2);
  }
  return { ok: false, reason: "JPEG の大きさを読めません" };
}

function webp(bytes: Uint8Array): ImageInfo {
  const chunk = ascii(bytes, 12, 4);
  if (chunk === "VP8 ") return { ok: true, type: "webp", width: u16le(bytes, 26) & 0x3fff, height: u16le(bytes, 28) & 0x3fff };
  if (chunk === "VP8L") {
    const b = bytes.subarray(21, 25);
    const bits = b[0]! | (b[1]! << 8) | (b[2]! << 16) | (b[3]! << 24);
    return { ok: true, type: "webp", width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") {
    if (bytes[20]! & 0x02) return { ok: false, reason: "動く WebP は使えません" };
    return { ok: true, type: "webp", width: u24le(bytes, 24) + 1, height: u24le(bytes, 27) + 1 };
  }
  return { ok: false, reason: "WebP の形式が正しくありません" };
}

/** 画像のファイルの中身(少なくとも頭の数 KB)から、形式と大きさを読む */
export function imageInfo(bytes: Uint8Array): ImageInfo {
  if (bytes.length >= 24 && u32be(bytes, 0) === 0x89504e47 && u32be(bytes, 4) === 0x0d0a1a0a) return png(bytes);
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return jpeg(bytes);
  if (bytes.length >= 30 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return webp(bytes);
  if (ascii(bytes, 0, 4) === "GIF8") return { ok: false, reason: "GIF は使えません(PNG、JPEG、WebP の静止画にしてください)" };
  if (/<svg[\s>]/i.test(ascii(bytes, 0, Math.min(bytes.length, 512)))) return { ok: false, reason: "SVG は使えません(PNG、JPEG、WebP の静止画にしてください)" };
  return { ok: false, reason: "PNG、JPEG、WebP のどれでもありません" };
}
