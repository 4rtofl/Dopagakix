# 形式の定義

自由形式の動画([README の「自由形式の動画」](../README.md#自由形式の動画))の構成、見た目、上限をまとめたものを「形式の定義」と呼びます。形式ごとに 1 回作り、動画ごとのファイルから指します。

定義の欄はすべて任意で、書いた欄だけが既定の値を上書きします。既定の値は、作業報告と会話の要約の見た目と上限です。既定の見た目の方針は [docs/design.md](design.md) にまとめています。

## フォルダーの作り

形式の定義は、フォルダーにまとめます。

```
formats/intro/
  format.json    定義
  style.css      紙面の組み方(任意)
  fonts/         書体のファイル(任意)
  images/        背景やロゴの画像(任意)
```

- 定義の中のパス(`style`、書体の `path`)と、CSS の中の相対パス(`url(images/logo.png)` など)は、`format.json` のあるフォルダーからの相対パスで書きます。
- 描画のとき、ページが読めるのは形式のフォルダーの中のファイルだけです。フォルダーの外のファイルと、外部の URL は読めません。外部へのリクエストは止め、`render` が知らせます。
- 例は [examples/formats/intro/](../examples/formats/intro/) です。色と CSS を変え、題字の前に形式のフォルダーの画像を置いています。

### 作り始める

```bash
dopagakix format init formats/intro --name 制作物の紹介
dopagakix check formats/intro/format.json            # 定義だけを確かめる
dopagakix check video.json --format formats/intro/format.json --no-voice   # 台本と合わせて確かめる
```

`format init` は、既定の値をすべて書いた `format.json` と、同梱のスタイルを写した `style.css` を作ります。既にあるファイルは、`--force` を付けない限り上書きしません。

- `style.css` は `base: "paper"` のとき、同梱のスタイルの後に読み込みます。写した規則を書き換えれば、その規則だけが上書きされます。
- `base` を `"none"` にすると、同梱のスタイルは読み込まず、`style.css` だけで紙面を組みます。
- 大きさと動きの長さを書いた規則(`html`、`#stage`、`.enter`、`.rule-in` など)は写しません。これらは `format.json` の `size` と `motion` で決まり、写した CSS に残すと `format.json` を変えても効かなくなるためです。

## 欄

```json
{
  "kind": "format",
  "version": 1,
  "name": "制作物の紹介",
  "page": { "mast": "制作物の紹介", "labels": ["AI が書いた紹介"] },
  "size": { "width": 1080, "height": 1920 },
  "colors": { "paper": "#f2ede3", "ink": "#1f1c17", "marker": "#f5cf5a" },
  "fonts": {
    "heading": { "family": "Shippori Mincho", "files": [{ "path": "fonts/ShipporiMincho-ExtraBold.woff2", "weight": 800 }] }
  },
  "motion": { "enter": { "seconds": 0.3, "distance": 24 } },
  "base": "paper",
  "style": "style.css",
  "limits": { "title": 16, "item": 24, "scenes": { "min": 3, "max": 6 } }
}
```

| 欄 | 中身 | 既定 |
| --- | --- | --- |
| `kind`、`version` | `"format"` と `1`(必須) | |
| `name` | 形式の名前。`check` の表示に使い、画面には出しません | なし |
| `page.mast` | 上辺の題字。作業報告の「作業報告」に当たります | なし(題字を出さない) |
| `page.labels` | 柱の右に出す表示。音声のクレジットと「音声なし」は、この後ろに自動で足します | なし |
| `size` | 動画の大きさ(px)。幅と高さは偶数 | 1080×1920 |
| `colors` | 色のトークン(下の表) | 下の表 |
| `fonts` | 役割ごとの書体(下の「書体」) | 同梱の書体 |
| `motion` | 動きの長さと大きさ(下の「動き」) | 下の表 |
| `base` | `"paper"`=同梱の紙面のスタイルを先に読み込む / `"none"`=動作に要る最小のスタイルだけにする | `"paper"` |
| `style` | 紙面の組み方の CSS。同梱のスタイルの後に読み込みます | なし |
| `limits` | 文字数と件数の上限(下の「上限」) | 下の表 |

AI が書いた台本であることを画面に出すかは、`page.labels` で決めます。作業報告と会話の要約のように自動では出しません。

## 色

`colors` で、色のトークン(ページの `:root` の CSS 変数)を上書きします。色は `#rrggbb` か `#rrggbbaa` で書きます。

| 名前 | CSS 変数 | 用途 | 既定 |
| --- | --- | --- | --- |
| `paper` | `--paper` | 紙(背景)。字幕の文字にも使う | `#f5f5f1` |
| `ink` | `--ink` | 墨(本文)。字幕の帯にも使う | `#17171b` |
| `ink2`、`ink3` | `--ink-2`、`--ink-3` | 補助の文字 | `#4a4a53`、`#6e6e78` |
| `rule` | `--rule` | 罫線 | 墨の 18%(`ink` を変えると、その色の 18%) |
| `pass`、`fail`、`skip` | `--pass`、`--fail`、`--skip` | 成功、失敗、未実施 | `#1e7a4c`、`#b42318`、`#6e6e78` |
| `partial` | `--partial` | 一部完了 | `#9a6200` |
| `attention` | `--attention` | 判断を求める事項 | `#c2410c` |
| `marker` | `--marker` | 蛍光ペン | `#ffe58a` |

`check` は、文字の色と紙の色のコントラスト比を計算し、4.5:1 を下回る組み合わせを警告します。字幕(紙の色の文字と墨の色の帯)と、蛍光ペンの上の墨の文字も確かめます。警告にとどめ、描画は止めません。

## 書体

`fonts` で、役割ごとに書体を指定します。

| 役割 | CSS 変数 | 使うところ | 同梱の書体 |
| --- | --- | --- | --- |
| `heading` | `--serif` | 見出し、タイトル、数字 | Noto Serif JP |
| `body` | `--gothic` | 本文、字幕 | Zen Kaku Gothic New |
| `mono` | `--mono` | 柱の左(場所)など | JetBrains Mono |

```json
"fonts": {
  "heading": {
    "family": "Shippori Mincho",
    "files": [
      { "path": "fonts/ShipporiMincho-Bold.woff2", "weight": 700 },
      { "path": "fonts/ShipporiMincho-ExtraBold.woff2", "weight": 800 }
    ]
  },
  "body": { "family": "My Variable Gothic", "files": [{ "path": "fonts/gothic.ttf", "weight": [100, 900] }] }
}
```

- 役割ごとに、書体の名前(`family`)と、ファイルのパスと太さ(`files`)を書きます。太さは数か、可変の書体なら `[最小, 最大]` です。斜体は `"style": "italic"` を足します。
- 受け付ける形式は WOFF2、WOFF、TTF、OTF です。ファイルは形式のフォルダーに置きます。
- マシンに入っている書体を名前だけで指定することはできません。マシンによって映像が変わるためです。名前は、マシンの書体と重ならないものにしてください。
- 指定した書体にない文字は、同梱の書体で出します。指定しなかった役割は、同梱の書体のままです。
- 描画では、画面に出るすべての文字(字幕を含む)について、ページの要素が使う書体と太さをすべて読み込み終えてから撮ります。
- **書体のライセンスは、形式を作る人が確かめてください。** 形式のフォルダーに書体を置いて配布するなら、再配布が許されている書体(SIL Open Font License など)を使います。

## 動き

`motion` で、動きの長さ(秒)と大きさ(px)を指定します。書いた値だけが既定を上書きします。

| 名前 | 中身 | 既定 |
| --- | --- | --- |
| `enter` | 要素の登場。長さ(`seconds`)、動く距離(`distance`)、次の要素までの間隔(`step`)、最初の遅れ(`offset`) | 0.38 秒、14px、0.07 秒、0.06 秒 |
| `rule` | 罫線を左から引く長さ(`seconds`) | 0.45 秒 |
| `scene` | シーンの切り替え。現れる長さ(`fadeIn`)と消える長さ(`fadeOut`) | 0.2 秒、0.18 秒 |
| `caption` | 字幕が現れる長さ(`fade`)と、読み上げより先に出す時間(`lead`) | 0.12 秒、0.1 秒 |
| `pause` | 読み上げの前後の間。シーンの頭(`leadIn`)、文の間(`lineGap`)、シーンの終わり(`tail`)、最後のシーンの終わり(`closingTail`)、シーンの最短(`minScene`) | 0.5、0.15、0.6、2.0、2.4 秒 |

- この値は、ページの CSS と、シーンと字幕の時刻、効果音と図解の要素を出す時刻のすべてに使います。
- 登場順 `i` の要素(`.enter` に `--i: i`)は、`i × step + offset` 秒後に現れ始めます。最終ページの「以上」は登場順 1 で、効果音もこの時刻に鳴らします。
- 動きの種類そのものを変えるときは、形式の CSS にアニメーション(`@keyframes` と `animation`)や `transition` を書きます。描画は、1 コマごとにページのアニメーションをすべて止め、その時刻を入れてから撮るので、CSS で書いた動きは同じ入力から同じ映像になります。シーンの中の動きはシーンの頭から、シーンの外(題字や柱)の動きは動画の頭からの時刻です。
- JavaScript で動かすことはできません(時刻を指定して止められないため)。形式から入力できるのは CSS だけです。

## 紙面の組み方

紙面の組み方は、形式の CSS(`style`)で入力します。HTML の構造は dopagakix が作り、下の要素とクラスの名前を公開します。位置、大きさ、余白、罫線、枠、背景、登場の動きを、CSS から変えられます。

- 文字や余白の大きさは、`calc(40 * var(--u))` のように `--u` を単位にして書くと、内容があふれたシーンを縮めるときに一緒に縮みます。
- 内容が本文(`main`)の枠からあふれるシーンは、縮めて収めます(最小の倍率は `limits.minScale`)。縮めたシーンと、最小まで縮めても収まらないシーンは、`render` が知らせます。動画は作ります。
- 同梱のスタイルは 1080×1920 に合わせて組んであります。`base: "paper"` のまま `size` を変えると、`check` が警告します。ほかの大きさにするときは、`base: "none"` にして紙面を形式の CSS で組んでください。

### 公開する要素とクラス

ここに書いた要素とクラスの名前は、README の「互換性の決まり」の対象です。足すことはありますが、なくしたり意味を変えたりするときは、形式の定義の `version` を上げ、古い版も受け付けます。

| 部分 | 要素とクラス |
| --- | --- |
| 全体 | `#stage` |
| 題字 | `header.masthead`(題字も日付もなければ出しません)、`.mast-row`、`.mast-title`(`page.mast`)、`.mast-meta`(日付)、`.double-rule` |
| 本文 | `main`、`section.scene`(表示中は `.active`)、`.content` |
| シーンの種類 | `.scene` の `data-kind`。`opening`、`text`、`list`、`point`、`groups`、`quote`、`figure`、`numbers`、`image`、`closing` |
| 欄見出し | `.section`、`.rule`(細い罫は `.rule.thin`)、`h2.section-title` |
| 表紙 | `h1.title`(長さで `.mid`、`.long`)、`.facts`、`.fact-row`、`.fact-label`、`.fact-body`、`.lede.gist`(要旨)、`.when.note`(`opening.note`) |
| 数値 | `.figures`(表紙は `.figures.even`、数値のシーンは `.figures.stack`)、`.figure`、`.fact-label`(見出し)、`.num`(長い文字列は `.num.long`)、`.num small`(単位) |
| 見出しと説明 | `h2.text-heading`、`.text-lines`、`.text-line` |
| 行 | `.rows`、`.row`、`.row-text`。行の並びは `.rows.list`(`data-mark` に `number`、`dash`、`arrow`)、強調する 1 文の補足は `.rows.point-items` |
| 印 | `.num-mark`(番号)、`.dash`(―)、`.arrow`(→)、`.check-mark`(○ △ × −) |
| 強調する 1 文 | `p.point`、`.hl`(蛍光ペンの下線) |
| 2 つに分けた行 | `.group`(印の名前 `circle`、`triangle`、`cross`、`bar` をクラスと `data-mark` に付けます)、`.group-label` |
| 引用 | `figure.quote`、`blockquote.quote-text`、`figcaption.quote-by` |
| 図解 | 前後の比較: `.ba`、`.ba-side.before`、`.ba-side.after`、`.ba-label`、`.ba-lines`、`svg.ba-arrow`。流れ図: `ol.flow`、`li.step`(強調する段は `.changed`)、`.step-label`、`.marker`、`.step-note`、`li.flow-arrow`。矢印の線は `.stroke` |
| 画像 | `figure.image`、`img.image-img`、`figcaption.image-caption` |
| 締め | `.end-mark`(以上)、`.credits` |
| 字幕 | `.caption-zone`、`#caption` |
| 柱 | `footer.folio`、`.where`、`.right`、`.page`(ページ番号) |
| 登場の動き | `.enter`(下から現れる。`--i` が登場順)、`.rule-in`(左から引く)。`@keyframes rise`、`draw`、`stroke` |

CSS 変数: 色と書体のトークン(上の表)、`--u`(文字や余白の単位。縮めたシーンでは小さくなる)、`--i`(登場順)、`--n`(表紙の数値の数)。

例:

```css
/* 題字の二重罫を太い 1 本の罫にし、題字の前に形式のフォルダーの画像を置く */
.double-rule { border-top-width: 8px; padding-top: 0; }
.double-rule::after { display: none; }
.mast-title::before { content: ""; width: 34px; height: 34px; background: url("images/mark.png") center / contain no-repeat; }

/* 行の並びの番号を朱色にする */
.rows.list[data-mark="number"] .num-mark { color: var(--attention); }

/* 画像のシーンだけ、上下の余白を詰める */
.scene[data-kind="image"] .content { gap: calc(24 * var(--u)); }
```

## 上限

`limits` で、文字数(全角も半角も 1 文字と数えます)と件数の上限を上書きします。`check` はこの上限で警告し、表示で切り捨てる件数にも同じ上限を使います。台本の JSON Schema(`freeScriptJsonSchema(定義)`)の説明文にも、この上限が入ります。

| 欄 | 中身 | 既定 |
| --- | --- | --- |
| `title`、`headline` | タイトル、要旨 | 20、40 |
| `mast` | 題字(`page.mast`) | 8 |
| `where` | 柱の左(`facts.where`) | 24 |
| `pageLabels` | 柱の表示(`page.labels`)の件数(`count`)と文字数(`chars`) | 2 件、各 12 |
| `label` | 欄見出しと、組の小見出し | 12 |
| `headlineLabel` | 要旨の欄見出し(`opening.label`) | 4 |
| `note` | 表紙の 1 行(`opening.note`) | 30 |
| `heading` | 見出しと説明のシーンの見出し | 20 |
| `item` | 項目 1 行(説明、行の並び、補足、2 つに分けた行) | 28 |
| `point` | 強調する 1 文 | 28 |
| `quote`、`by` | 引用と、その名前 | 60、20 |
| `caption` | 画像の説明 | 28 |
| `closingNotes` | 締めの行の件数(`count`)と文字数(`chars`) | 3 行、各 40 |
| `figures` | 表紙と数値のシーンに並べる数値の数(`count`)、見出し(`label`)、値の文字列(`value`)、単位(`unit`)の文字数 | 3 つ、6、8、4 |
| `source` | 数値の出どころ | 40 |
| `scenes` | 冒頭と締めの間のシーンの数(`min`、`max`) | 1〜8 |
| `items` | シーンの種類ごとの件数。説明の行(`text`)、行の並び(`list`)、強調する 1 文の補足(`point`)、組の数(`groups`)、1 組の行(`groupItems`) | 2、5、3、2、3 |
| `figure` | 図解の見出し(`title`)、前後の行数(`sideLines`)と文字数(`sideText`)、段の数(`minSteps`、`maxSteps`)、段の名前(`stepLabel`)と補足(`stepNote`)、読み上げ文の数(`narration`) | 20、3、16、2〜5、12、16、2 |
| `narration` | 1 シーンの読み上げ文の数(`sentences`)と、1 文の文字数の目安(`chars`。これより 10 文字多いと警告) | 3、35 |
| `minScale` | あふれたシーンを縮める最小の倍率(0 より大きく 1 以下) | 0.6 |

既定の上限は、縮小なしで本文の枠に収まる量です(同梱の例 `examples/free.example.json` で確かめています)。上限を上げると、文字が縮小されるか、最小まで縮めても収まらないシーンが出ることがあります。`render` が知らせるので、文字を減らすか、形式の CSS で文字を小さくしてください。
