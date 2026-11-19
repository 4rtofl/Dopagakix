import { z } from "zod";
import { type FreeLimits } from "./format.js";
/** 動画ごとのファイル(FreeFileSchema)の版 */
export declare const FREE_VERSION = 1;
/** 冒頭と締めの間に並べるシーンの種類 */
export declare const FREE_SCENE_TYPES: readonly ["text", "list", "point", "groups", "quote", "figure", "numbers", "image"];
export type FreeSceneType = (typeof FREE_SCENE_TYPES)[number];
/** 行の並び(list)の印。number=番号、dash=「―」、arrow=「→」 */
export declare const LIST_MARKS: readonly ["number", "dash", "arrow"];
/** 2 つに分けた行(groups)の印。色は順に、成功・一部完了・失敗・未実施の色 */
export declare const GROUP_MARKS: readonly ["circle", "triangle", "cross", "bar"];
/** 画像のシーンで受け付ける形式 */
export declare const IMAGE_EXTENSIONS: readonly ["png", "jpg", "jpeg", "webp"];
/** 台本の型を、形式の上限で作る(上限は JSON Schema の説明文に入る。読み込みで弾くのは形式の誤りだけ) */
export declare function freeScriptSchema(limits?: FreeLimits): z.ZodObject<{
    title: z.ZodString;
    headline: z.ZodString;
    opening: z.ZodObject<{
        label: z.ZodOptional<z.ZodString>;
        figures: z.ZodOptional<z.ZodArray<z.ZodString>>;
        note: z.ZodOptional<z.ZodString>;
        narration: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
    scenes: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<"text">;
        heading: z.ZodString;
        lines: z.ZodArray<z.ZodString>;
        narration: z.ZodArray<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"list">;
        label: z.ZodString;
        items: z.ZodArray<z.ZodString>;
        mark: z.ZodOptional<z.ZodEnum<{
            arrow: "arrow";
            dash: "dash";
            number: "number";
        }>>;
        narration: z.ZodArray<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"point">;
        label: z.ZodString;
        point: z.ZodString;
        items: z.ZodOptional<z.ZodArray<z.ZodString>>;
        narration: z.ZodArray<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"groups">;
        label: z.ZodString;
        groups: z.ZodArray<z.ZodObject<{
            label: z.ZodString;
            mark: z.ZodEnum<{
                bar: "bar";
                circle: "circle";
                cross: "cross";
                triangle: "triangle";
            }>;
            items: z.ZodArray<z.ZodString>;
        }, z.core.$strip>>;
        narration: z.ZodArray<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"quote">;
        label: z.ZodString;
        text: z.ZodString;
        by: z.ZodOptional<z.ZodString>;
        narration: z.ZodArray<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"figure">;
        figure: z.ZodDiscriminatedUnion<[z.ZodObject<{
            type: z.ZodLiteral<"before_after">;
            title: z.ZodString;
            before: z.ZodArray<z.ZodString>;
            after: z.ZodArray<z.ZodString>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"flow">;
            title: z.ZodString;
            steps: z.ZodArray<z.ZodObject<{
                label: z.ZodString;
                note: z.ZodOptional<z.ZodString>;
                changed: z.ZodOptional<z.ZodBoolean>;
            }, z.core.$strip>>;
        }, z.core.$strip>], "type">;
        narration: z.ZodArray<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"numbers">;
        label: z.ZodString;
        figures: z.ZodArray<z.ZodString>;
        narration: z.ZodArray<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"image">;
        label: z.ZodString;
        src: z.ZodString;
        caption: z.ZodOptional<z.ZodString>;
        narration: z.ZodArray<z.ZodString>;
    }, z.core.$strip>], "type">>;
    closing: z.ZodObject<{
        notes: z.ZodOptional<z.ZodArray<z.ZodString>>;
        narration: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
    readings: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
}, z.core.$strip>;
/** 既定の形式の上限で作った台本の型 */
export declare const FreeScriptSchema: z.ZodObject<{
    title: z.ZodString;
    headline: z.ZodString;
    opening: z.ZodObject<{
        label: z.ZodOptional<z.ZodString>;
        figures: z.ZodOptional<z.ZodArray<z.ZodString>>;
        note: z.ZodOptional<z.ZodString>;
        narration: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
    scenes: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<"text">;
        heading: z.ZodString;
        lines: z.ZodArray<z.ZodString>;
        narration: z.ZodArray<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"list">;
        label: z.ZodString;
        items: z.ZodArray<z.ZodString>;
        mark: z.ZodOptional<z.ZodEnum<{
            arrow: "arrow";
            dash: "dash";
            number: "number";
        }>>;
        narration: z.ZodArray<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"point">;
        label: z.ZodString;
        point: z.ZodString;
        items: z.ZodOptional<z.ZodArray<z.ZodString>>;
        narration: z.ZodArray<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"groups">;
        label: z.ZodString;
        groups: z.ZodArray<z.ZodObject<{
            label: z.ZodString;
            mark: z.ZodEnum<{
                bar: "bar";
                circle: "circle";
                cross: "cross";
                triangle: "triangle";
            }>;
            items: z.ZodArray<z.ZodString>;
        }, z.core.$strip>>;
        narration: z.ZodArray<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"quote">;
        label: z.ZodString;
        text: z.ZodString;
        by: z.ZodOptional<z.ZodString>;
        narration: z.ZodArray<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"figure">;
        figure: z.ZodDiscriminatedUnion<[z.ZodObject<{
            type: z.ZodLiteral<"before_after">;
            title: z.ZodString;
            before: z.ZodArray<z.ZodString>;
            after: z.ZodArray<z.ZodString>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"flow">;
            title: z.ZodString;
            steps: z.ZodArray<z.ZodObject<{
                label: z.ZodString;
                note: z.ZodOptional<z.ZodString>;
                changed: z.ZodOptional<z.ZodBoolean>;
            }, z.core.$strip>>;
        }, z.core.$strip>], "type">;
        narration: z.ZodArray<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"numbers">;
        label: z.ZodString;
        figures: z.ZodArray<z.ZodString>;
        narration: z.ZodArray<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"image">;
        label: z.ZodString;
        src: z.ZodString;
        caption: z.ZodOptional<z.ZodString>;
        narration: z.ZodArray<z.ZodString>;
    }, z.core.$strip>], "type">>;
    closing: z.ZodObject<{
        notes: z.ZodOptional<z.ZodArray<z.ZodString>>;
        narration: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
    readings: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
}, z.core.$strip>;
/** 画面に出す数値 1 つ。値は数(3 桁ごとに区切って出す)か、数で表せない短い文字列(例: v1.13.2) */
export declare const FreeFigureSchema: z.ZodObject<{
    label: z.ZodString;
    value: z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>;
    unit: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
/**
 * 動画ごとに変わる、画面に出すもの。数値はファイルを作る側(プログラム)が数え、台本には書かない(台本は名前で参照する)。
 */
export declare const FreeFactsSchema: z.ZodObject<{
    where: z.ZodOptional<z.ZodString>;
    date: z.ZodOptional<z.ZodISODate>;
    figures: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        label: z.ZodString;
        value: z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>;
        unit: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
    source: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
/** 台本が参照する数値の名前と、台本の中の位置 */
export declare function figureReferences(script: z.infer<typeof FreeScriptSchema>): Array<{
    path: Array<string | number>;
    name: string;
}>;
/**
 * check / render に渡す、動画ごとのファイル。形式の定義(format)は、定義のファイルのパスか、定義そのもの。
 * 省略すると既定の形式を使う。render は、描画に使った読みの指定、話者、形式の定義のパスを足して、
 * 作業フォルダーの script.json に残す(同じ形式で描画し直せる)。
 */
export declare const FreeFileSchema: z.ZodObject<{
    kind: z.ZodLiteral<"free">;
    version: z.ZodLiteral<1>;
    format: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodObject<{
        kind: z.ZodLiteral<"format">;
        version: z.ZodLiteral<1>;
        name: z.ZodOptional<z.ZodString>;
        page: z.ZodOptional<z.ZodObject<{
            mast: z.ZodOptional<z.ZodString>;
            labels: z.ZodOptional<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>>;
        size: z.ZodOptional<z.ZodObject<{
            width: z.ZodNumber;
            height: z.ZodNumber;
        }, z.core.$strip>>;
        colors: z.ZodOptional<z.ZodObject<{
            attention: z.ZodOptional<z.ZodString>;
            fail: z.ZodOptional<z.ZodString>;
            ink: z.ZodOptional<z.ZodString>;
            ink2: z.ZodOptional<z.ZodString>;
            ink3: z.ZodOptional<z.ZodString>;
            marker: z.ZodOptional<z.ZodString>;
            paper: z.ZodOptional<z.ZodString>;
            partial: z.ZodOptional<z.ZodString>;
            pass: z.ZodOptional<z.ZodString>;
            rule: z.ZodOptional<z.ZodString>;
            skip: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        fonts: z.ZodOptional<z.ZodObject<{
            heading: z.ZodOptional<z.ZodObject<{
                family: z.ZodString;
                files: z.ZodArray<z.ZodObject<{
                    path: z.ZodString;
                    weight: z.ZodUnion<readonly [z.ZodNumber, z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>]>;
                    style: z.ZodOptional<z.ZodEnum<{
                        italic: "italic";
                        normal: "normal";
                    }>>;
                }, z.core.$strip>>;
            }, z.core.$strip>>;
            body: z.ZodOptional<z.ZodObject<{
                family: z.ZodString;
                files: z.ZodArray<z.ZodObject<{
                    path: z.ZodString;
                    weight: z.ZodUnion<readonly [z.ZodNumber, z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>]>;
                    style: z.ZodOptional<z.ZodEnum<{
                        italic: "italic";
                        normal: "normal";
                    }>>;
                }, z.core.$strip>>;
            }, z.core.$strip>>;
            mono: z.ZodOptional<z.ZodObject<{
                family: z.ZodString;
                files: z.ZodArray<z.ZodObject<{
                    path: z.ZodString;
                    weight: z.ZodUnion<readonly [z.ZodNumber, z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>]>;
                    style: z.ZodOptional<z.ZodEnum<{
                        italic: "italic";
                        normal: "normal";
                    }>>;
                }, z.core.$strip>>;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
        motion: z.ZodOptional<z.ZodObject<{
            enter: z.ZodOptional<z.ZodObject<{
                seconds: z.ZodOptional<z.ZodNumber>;
                distance: z.ZodOptional<z.ZodNumber>;
                step: z.ZodOptional<z.ZodNumber>;
                offset: z.ZodOptional<z.ZodNumber>;
            }, z.core.$strip>>;
            rule: z.ZodOptional<z.ZodObject<{
                seconds: z.ZodOptional<z.ZodNumber>;
            }, z.core.$strip>>;
            scene: z.ZodOptional<z.ZodObject<{
                fadeIn: z.ZodOptional<z.ZodNumber>;
                fadeOut: z.ZodOptional<z.ZodNumber>;
            }, z.core.$strip>>;
            caption: z.ZodOptional<z.ZodObject<{
                fade: z.ZodOptional<z.ZodNumber>;
                lead: z.ZodOptional<z.ZodNumber>;
            }, z.core.$strip>>;
            pause: z.ZodOptional<z.ZodObject<{
                closingTail: z.ZodOptional<z.ZodNumber>;
                leadIn: z.ZodOptional<z.ZodNumber>;
                lineGap: z.ZodOptional<z.ZodNumber>;
                minScene: z.ZodOptional<z.ZodNumber>;
                tail: z.ZodOptional<z.ZodNumber>;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
        base: z.ZodOptional<z.ZodEnum<{
            none: "none";
            paper: "paper";
        }>>;
        style: z.ZodOptional<z.ZodString>;
        limits: z.ZodOptional<z.ZodObject<{
            title: z.ZodOptional<z.ZodNumber>;
            headline: z.ZodOptional<z.ZodNumber>;
            mast: z.ZodOptional<z.ZodNumber>;
            where: z.ZodOptional<z.ZodNumber>;
            pageLabels: z.ZodOptional<z.ZodObject<{
                count: z.ZodOptional<z.ZodNumber>;
                chars: z.ZodOptional<z.ZodNumber>;
            }, z.core.$strip>>;
            label: z.ZodOptional<z.ZodNumber>;
            headlineLabel: z.ZodOptional<z.ZodNumber>;
            note: z.ZodOptional<z.ZodNumber>;
            heading: z.ZodOptional<z.ZodNumber>;
            item: z.ZodOptional<z.ZodNumber>;
            point: z.ZodOptional<z.ZodNumber>;
            quote: z.ZodOptional<z.ZodNumber>;
            by: z.ZodOptional<z.ZodNumber>;
            caption: z.ZodOptional<z.ZodNumber>;
            closingNotes: z.ZodOptional<z.ZodObject<{
                count: z.ZodOptional<z.ZodNumber>;
                chars: z.ZodOptional<z.ZodNumber>;
            }, z.core.$strip>>;
            figures: z.ZodOptional<z.ZodObject<{
                count: z.ZodOptional<z.ZodNumber>;
                label: z.ZodOptional<z.ZodNumber>;
                value: z.ZodOptional<z.ZodNumber>;
                unit: z.ZodOptional<z.ZodNumber>;
            }, z.core.$strip>>;
            source: z.ZodOptional<z.ZodNumber>;
            scenes: z.ZodOptional<z.ZodObject<{
                min: z.ZodOptional<z.ZodNumber>;
                max: z.ZodOptional<z.ZodNumber>;
            }, z.core.$strip>>;
            items: z.ZodOptional<z.ZodObject<{
                text: z.ZodOptional<z.ZodNumber>;
                list: z.ZodOptional<z.ZodNumber>;
                point: z.ZodOptional<z.ZodNumber>;
                groups: z.ZodOptional<z.ZodNumber>;
                groupItems: z.ZodOptional<z.ZodNumber>;
            }, z.core.$strip>>;
            figure: z.ZodOptional<z.ZodObject<{
                title: z.ZodOptional<z.ZodNumber>;
                sideLines: z.ZodOptional<z.ZodNumber>;
                sideText: z.ZodOptional<z.ZodNumber>;
                minSteps: z.ZodOptional<z.ZodNumber>;
                maxSteps: z.ZodOptional<z.ZodNumber>;
                stepLabel: z.ZodOptional<z.ZodNumber>;
                stepNote: z.ZodOptional<z.ZodNumber>;
                narration: z.ZodOptional<z.ZodNumber>;
            }, z.core.$strip>>;
            narration: z.ZodOptional<z.ZodObject<{
                sentences: z.ZodOptional<z.ZodNumber>;
                chars: z.ZodOptional<z.ZodNumber>;
            }, z.core.$strip>>;
            minScale: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
    }, z.core.$strip>]>>;
    facts: z.ZodOptional<z.ZodObject<{
        where: z.ZodOptional<z.ZodString>;
        date: z.ZodOptional<z.ZodISODate>;
        figures: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
            label: z.ZodString;
            value: z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>;
            unit: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
        source: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    script: z.ZodObject<{
        title: z.ZodString;
        headline: z.ZodString;
        opening: z.ZodObject<{
            label: z.ZodOptional<z.ZodString>;
            figures: z.ZodOptional<z.ZodArray<z.ZodString>>;
            note: z.ZodOptional<z.ZodString>;
            narration: z.ZodArray<z.ZodString>;
        }, z.core.$strip>;
        scenes: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
            type: z.ZodLiteral<"text">;
            heading: z.ZodString;
            lines: z.ZodArray<z.ZodString>;
            narration: z.ZodArray<z.ZodString>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"list">;
            label: z.ZodString;
            items: z.ZodArray<z.ZodString>;
            mark: z.ZodOptional<z.ZodEnum<{
                arrow: "arrow";
                dash: "dash";
                number: "number";
            }>>;
            narration: z.ZodArray<z.ZodString>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"point">;
            label: z.ZodString;
            point: z.ZodString;
            items: z.ZodOptional<z.ZodArray<z.ZodString>>;
            narration: z.ZodArray<z.ZodString>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"groups">;
            label: z.ZodString;
            groups: z.ZodArray<z.ZodObject<{
                label: z.ZodString;
                mark: z.ZodEnum<{
                    bar: "bar";
                    circle: "circle";
                    cross: "cross";
                    triangle: "triangle";
                }>;
                items: z.ZodArray<z.ZodString>;
            }, z.core.$strip>>;
            narration: z.ZodArray<z.ZodString>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"quote">;
            label: z.ZodString;
            text: z.ZodString;
            by: z.ZodOptional<z.ZodString>;
            narration: z.ZodArray<z.ZodString>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"figure">;
            figure: z.ZodDiscriminatedUnion<[z.ZodObject<{
                type: z.ZodLiteral<"before_after">;
                title: z.ZodString;
                before: z.ZodArray<z.ZodString>;
                after: z.ZodArray<z.ZodString>;
            }, z.core.$strip>, z.ZodObject<{
                type: z.ZodLiteral<"flow">;
                title: z.ZodString;
                steps: z.ZodArray<z.ZodObject<{
                    label: z.ZodString;
                    note: z.ZodOptional<z.ZodString>;
                    changed: z.ZodOptional<z.ZodBoolean>;
                }, z.core.$strip>>;
            }, z.core.$strip>], "type">;
            narration: z.ZodArray<z.ZodString>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"numbers">;
            label: z.ZodString;
            figures: z.ZodArray<z.ZodString>;
            narration: z.ZodArray<z.ZodString>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"image">;
            label: z.ZodString;
            src: z.ZodString;
            caption: z.ZodOptional<z.ZodString>;
            narration: z.ZodArray<z.ZodString>;
        }, z.core.$strip>], "type">>;
        closing: z.ZodObject<{
            notes: z.ZodOptional<z.ZodArray<z.ZodString>>;
            narration: z.ZodArray<z.ZodString>;
        }, z.core.$strip>;
        readings: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    }, z.core.$strip>;
    generatedAt: z.ZodOptional<z.ZodString>;
    baseDir: z.ZodOptional<z.ZodString>;
    persona: z.ZodOptional<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
    }, z.core.$strip>>;
    voice: z.ZodOptional<z.ZodObject<{
        enabled: z.ZodBoolean;
        speaker: z.ZodOptional<z.ZodNumber>;
        name: z.ZodOptional<z.ZodString>;
        style: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    readings: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    bgm: z.ZodOptional<z.ZodObject<{
        file: z.ZodString;
        credit: z.ZodOptional<z.ZodString>;
        volume: z.ZodNumber;
    }, z.core.$strip>>;
    sfx: z.ZodOptional<z.ZodObject<{
        dir: z.ZodString;
        credit: z.ZodOptional<z.ZodString>;
        volume: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type FreeScript = z.infer<typeof FreeScriptSchema>;
export type FreeScene = FreeScript["scenes"][number];
export type FreeFacts = z.infer<typeof FreeFactsSchema>;
export type FreeFigure = z.infer<typeof FreeFigureSchema>;
export type FreeFile = z.infer<typeof FreeFileSchema>;
/** JSON が自由形式の動画ごとのファイルとして書かれたものか。形式が正しいかは問わない */
export declare function isFreeFile(json: unknown): boolean;
/** JSON が形式の定義として書かれたものか */
export declare function isFormatFile(json: unknown): boolean;
