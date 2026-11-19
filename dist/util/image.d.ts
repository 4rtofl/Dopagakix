export type ImageType = "png" | "jpeg" | "webp";
export type ImageInfo = {
    ok: true;
    type: ImageType;
    width: number;
    height: number;
} | {
    ok: false;
    reason: string;
};
/** 画像のファイルの中身(少なくとも頭の数 KB)から、形式と大きさを読む */
export declare function imageInfo(bytes: Uint8Array): ImageInfo;
