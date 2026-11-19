export interface Motion {
    /** 要素の登場。登場順 i の要素は i * step + offset 秒後に現れ始め、seconds 秒かけて distance px 下から上がる */
    enter: {
        seconds: number;
        distance: number;
        step: number;
        offset: number;
    };
    /** 罫線を左から引く長さ */
    rule: {
        seconds: number;
    };
    /** シーンの切り替え。現れる長さと消える長さ */
    scene: {
        fadeIn: number;
        fadeOut: number;
    };
    /** 字幕が現れる長さと、読み上げより先に出す時間 */
    caption: {
        fade: number;
        lead: number;
    };
    /** 読み上げの前後の間(秒) */
    pause: {
        leadIn: number;
        lineGap: number;
        tail: number;
        closingTail: number;
        minScene: number;
    };
}
export declare const DEFAULT_MOTION: Motion;
/** 登場順 i の要素が現れ始める時刻(シーン開始からの秒数) */
export declare function enterDelay(i: number, motion?: Motion): number;
