# Dopagakix

[![CI](https://github.com/4rtoflow/Dopagakix/actions/workflows/ci.yml/badge.svg)](https://github.com/4rtoflow/Dopagakix/actions/workflows/ci.yml)

AI エージェント(Claude Code)が自分の行った作業を、作業を指示した人(指示者)に **縦型動画**(1080×1920、mp4)で報告するための、Claude Code のスキルと CLI です。

指示者がスマートフォンで短時間に次の 3 点を把握できることを目的にしています。

1. 依頼した作業は終わったのか(結論)
2. 何をして、どう確かめたのか
3. 自分が判断・対応すべきことは何か

Claude Code に「動画で報告して」と頼むと、エージェントが同梱のスキル(`video-report`)の手順に従って台本を書き、`dopagakix` コマンドで動画にして渡します。

## 仕組み

```
指示者「動画で報告して」
 └─ エージェント(Claude Code)が video-report スキルを使う
     1. dopagakix prepare … 画面に出す数値をセッションログから集計し、口調・長さの目安と環境を表示
     2. 台本 report.json を書く … 文章の部分だけ。そのセッションで自分がした作業をもとに書く
     3. dopagakix check   … 形式・口調・長さ・読み上げにくい表記・数値との食い違いと、全文の読みを確認
     4. dopagakix render  … check で確かめた読みで VOICEVOX が読み上げ → HTML/CSS → Chromium で 1 コマずつ撮影 → ffmpeg → summary.mp4
 └─ mp4 を指示者に渡す
```

設計上の方針:

- **作業ログを外部の API に送りません。** 台本は作業をしたエージェント自身が、そのセッションの中で書きます。`dopagakix` が通信するのは、読み上げ文を送る VOICEVOX エンジン(通常は手元で動かすもの)だけです。
- **画面に出す数値はログから機械的に集計**し、エージェントの自己申告に頼りません。
- 台本はエージェントの **自己報告** なので、成果を良く見せる偏りが入りえます。スキルには「確かめていない検証は未実施と書く」などの規則を入れ、`check` で機械的に分かる食い違い(完了なのに検証が失敗、など)を警告します。動画にも「AI エージェントによる自己報告」と表示します。
- アニメーションはページ側で時刻を指定して止めた状態を撮影するため、マシンの速さに関係なく同じ映像になります。

## 動画の構成

| # | シーン | 内容 |
|---|--------|------|
| 1 | 結論 | 状態(完了 / 一部完了 / 判断待ち / 未達成)、タイトル、変更ファイル数・変更行数・作業時間(推定。15 分を超える空白は除外) |
| 2 | 実施した作業 | 作業の要点(最大 5 件)と変更ファイルの一覧 |
| 3 | 検証の結果 | テスト・ビルド等の成否。実行していなければ「未実施」 |
| 4 | ご判断ください | 指示者に判断・承認してほしいこと。なければ「判断が必要な事項はありません」 |
| 5 | 次のステップ | 次の一手、クレジット |

冒頭で依頼の内容を振り返らず、結論の直後に本題(実施した作業)に入ります。以前の台本にあった `request`(ご依頼の内容)は、書かれていても表示も読み上げもしません(`check` が知らせます)。

各シーンに VOICEVOX の読み上げと字幕が付きます。見た目は「紙の作業報告書」を縦長にしたもので、いわゆる「AI が作った UI」に見えやすい要素(暗い背景の光彩、格子背景、紫系の色、カードの羅列など)を避けています。方針と根拠は [docs/design.md](docs/design.md) にまとめています。

## 必要なもの

| もの | 用途 | 備考 |
|------|------|------|
| Claude Code | スキルを使って台本を書く | |
| Node.js 22 以上 | `dopagakix` の実行 | |
| ffmpeg | mp4 への書き出し、音声の仕上げ | libx264 と aac が使えるもの |
| Chromium | 描画 | `npx playwright-core install --only-shell chromium` で導入できます |
| VOICEVOX ENGINE | 読み上げ音声 | 必須です。字幕のみの動画は、`--no-voice` を明示した場合だけ作れます |

VOICEVOX ENGINE のない環境(クラウドのセッションなど)では、`--no-voice` を明示しない限り動画を作れません。読み上げ付きで作るには、その環境でエンジンを起動するか、到達できるエンジンを `VOICEVOX_URL` で指定してください。

## 導入

### 1. CLI(マシンに 1 回)

```bash
npm install -g github:4rtoflow/Dopagakix
npx playwright-core install --only-shell chromium   # Chromium が無ければ
```

ビルド済みのファイル(`dist/`)をリポジトリに含めているため、導入時にビルドは行いません(理由は「開発」を参照)。

VOICEVOX ENGINE は公式の Docker イメージで起動できます。

```bash
docker run -d --name voicevox -p 127.0.0.1:50021:50021 voicevox/voicevox_engine:cpu-latest
```

### 2. スキル(プロジェクトごと、または個人用に 1 回)

```bash
cd <使うプロジェクト>
dopagakix install-skill          # <プロジェクト>/.claude/skills/video-report に入れる(コミットすればチームで共有できる)
dopagakix install-skill --user   # ~/.claude/skills/video-report に入れる(自分のすべてのプロジェクトで使える)
```

手でコピーしても同じです: `cp -r "$(npm root -g)/dopagakix/.claude/skills/video-report" .claude/skills/`

Claude Code はスキルのディレクトリを監視しており、追加したスキルは実行中のセッションにも反映されます。ただし、セッション開始時に `.claude/skills` 自体が無かった場合は `/reload-skills` が必要です([Claude Code: Skills](https://code.claude.com/docs/en/skills))。`install-skill` はその場合に案内を表示します。

### 更新

```bash
npm install -g github:4rtoflow/Dopagakix
dopagakix install-skill --force   # スキルも更新する(手で編集していた場合は上書きされます)
```

`install-skill` は、既存のスキルと内容が異なる場合は `--force` なしでは上書きしません。

## 使い方

Claude Code で作業を終えたら、「動画で報告して」「動画にまとめて」などと頼みます。スキルは **頼まれたときだけ** 使うように書いてあり、作業の最後に自動では作りません(スキルの説明文で指示しているため、確実ではありません)。`/video-report` で直接呼び出すこともできます。

エージェントは、動画のパス(ファイルを送るツールがある環境ではファイルそのもの)を返します。出力は `dopagakix-out/<日時>-<セッション ID 先頭 8 桁>/` にまとまります。`dopagakix-out/` には `*` だけを書いた `.gitignore` を置くため、中身は git の管理対象になりません。

| ファイル | 内容 |
|----------|------|
| `report.json` | エージェントが書いた台本 |
| `checked-readings.json` | `check` で確かめた読み上げ文の読み。`render` はこれと照らし合わせます([読み方の確認](#読み方の確認)) |
| `script.json` | 描画に使った台本と数値、読みの指定、読み上げの有無と話者の記録。`dopagakix render <この script.json>` で同じ内容のまま作り直せます(話者を変える、など) |
| `narration.wav` | 読み上げ音声 |
| `audio.wav` | 仕上げた音声(BGM を混ぜ、音量を -16 LUFS にそろえたもの)。動画にはこれを使います |
| `timeline.json` | シーンと字幕の時刻、BGM の設定、音量の測定値 |
| `summary.mp4` | 完成した動画(動画の保存先を設定したときは作らず、保存先に置きます) |

完成した動画だけを 1 つのフォルダに集めたいときは、動画の保存先(環境変数 `DOPAGAKIX_VIDEO_DIR`、または `--video-dir`)を設定します。動画は `<保存先>/<日時>-<セッション ID 先頭 8 桁>-<タイトル>.mp4` になり、それ以外のファイルは上のフォルダに残ります。名前の前半が作業ファイルのフォルダと同じなので、対応する `script.json` を探せます。

読み上げは必須です。VOICEVOX に接続できない場合、`prepare` と `render` はエラー(終了コード 1)で止まり、動画を作りません(字幕のみには切り替えません)。エージェントはスキルの手順に従って、エラーの内容を指示者に伝えて終えます。エンジンの起動方法は環境(Docker・製品版のアプリ・別のマシン)ごとに違うため、エージェントには起動させません。読み上げありで作った音声がほぼ無音(最大音量 -40 dBFS 未満)だった場合も、エラーにします。

`DOPAGAKIX_VOICEVOX_START` に起動コマンドを設定しておくと、接続できないときに `dopagakix` がそのコマンドを実行し、エンジンが応答するまで最大 60 秒待ってから続けます。コマンドの出力は一時ディレクトリの `dopagakix-voicevox-start.log` に書き出し、失敗したときはその末尾を表示します。

### 設定

環境変数で変えられます。Claude Code では、`.claude/settings.json` などの `env` に書くと、そのプロジェクトのセッションに設定できます([Claude Code: Settings](https://code.claude.com/docs/en/settings-reference#env))。

| 環境変数 | 既定値 | 内容 |
|----------|--------|------|
| `DOPAGAKIX_SPEAKER` | `3` | VOICEVOX の話者(スタイル)ID。`dopagakix speakers` で一覧(3 = ずんだもん ノーマル) |
| `DOPAGAKIX_PERSONA` | `auto` | 読み上げ文の口調。`auto`(話者から判断)/ `none`(丁寧語)/ `zundamon` / 口調設定の JSON ファイル |
| `VOICEVOX_URL` | `http://127.0.0.1:50021` | VOICEVOX エンジンの URL |
| `DOPAGAKIX_VIDEO_DIR` | (なし) | 完成した動画だけを置くフォルダ。先頭の `~` はホームフォルダに置き換えます |
| `TZ` | 実行環境の設定 | 画面の日時表示のタイムゾーン(例: `Asia/Tokyo`) |
| `DOPAGAKIX_CREDIT` | 話者から決める | 動画に表示する音声のクレジット表記。通常は指定不要([VOICEVOX とキャラクターの規約](#voicevox-とキャラクターの規約)) |
| `DOPAGAKIX_VOICEVOX_START` | なし | VOICEVOX に接続できないときに実行する、エンジンの起動コマンド(例: `docker start voicevox`)。応答するまで最大 60 秒待ちます |
| `DOPAGAKIX_BGM` | なし | BGM の曲ファイル([BGM](#bgm)) |
| `DOPAGAKIX_BGM_CREDIT` | なし | BGM のクレジット。最終ページにそのまま表示します |
| `DOPAGAKIX_BGM_VOLUME` | `0` | BGM の音量。基準(-30 LUFS)からの増減(dB) |
| `DOPAGAKIX_READINGS` | `<git のルート>/.dopagakix/readings.json` | プロジェクトの読みの辞書([読み方の確認](#読み方の確認)) |
| `DOPAGAKIX_REQUIRE_VOICE` | なし | `1` にすると `--no-voice`(字幕のみ)をエラーにします |
| `DOPAGAKIX_CHROMIUM` | 自動探索 | 描画に使う Chromium の実行ファイル |
| `FFMPEG_PATH` | `ffmpeg` | ffmpeg の実行ファイル |

```json
{
  "env": {
    "DOPAGAKIX_SPEAKER": "2",
    "TZ": "Asia/Tokyo"
  }
}
```

例の `2` は四国めたん(ノーマル)です。話者によっては、企業が関わる利用に事前確認が必要です([VOICEVOX とキャラクターの規約](#voicevox-とキャラクターの規約))。

指示者が `env` に `"DOPAGAKIX_REQUIRE_VOICE": "1"` を書いておけば、エージェントは字幕のみの動画を作れなくなります。

すべてのプロジェクトの動画を 1 か所に集めるなら、個人の設定(`~/.claude/settings.json`)の `env` に `"DOPAGAKIX_VIDEO_DIR": "~/Movies/dopagakix"` のように書きます。

### BGM

利用者がダウンロードした曲ファイルを指定すると、読み上げの邪魔にならない音量で BGM を流します。指定しなければ BGM なしです。

```json
{
  "env": {
    "DOPAGAKIX_BGM": "~/Music/dopagakix/bgm.mp3",
    "DOPAGAKIX_BGM_CREDIT": "音楽：魔王魂"
  }
}
```

- 曲ファイルは ffmpeg が読める形式(mp3 / wav / ogg / m4a など)です。オプションでは `--bgm <file>`・`--bgm-credit <text>`・`--bgm-volume <dB>` で指定し、環境変数より優先します。`--no-bgm` を付けると、環境変数で設定していても BGM を付けません。
- **曲ファイルはリポジトリの外か、git の管理外に置いてください。** 配布元の規約で再配布が禁止されているため、コミットして公開すると規約違反になりえます。
- 曲は動画の長さに合わせてループ・カットし、冒頭 1 秒でフェードイン、末尾 2 秒でフェードアウトします。曲全体の音量を -30 LUFS にそろえてから `--bgm-volume` を足し、読み上げ中だけ自動で下げます(ダッキング)。
- 動画の音声は、BGM の有無にかかわらず、全体を -16 LUFS・トゥルーピーク -1.5 dBTP にそろえます(Apple がポッドキャストに推奨する値に合わせています)。
- `--bgm-credit` の文字列は、最終ページのクレジットにそのまま表示します。配布元の規約でクレジットが必要な場合は、規約どおりの表記を指定してください。
- `prepare` の「環境」に、BGM のファイル・長さ・クレジットを表示します。曲ファイルが無い・読めない場合は、`prepare` と `render` がエラーにします(`render` は音声合成と描画の前に止まります)。
- BGM の設定は `script.json` に記録し、`dopagakix render <script.json>` で描画し直すときも同じ曲・クレジット・音量を使います。オプションや環境変数で別の曲を指定した場合は、そちらを使います(記録のクレジットと音量は引き継ぎません)。
- dopagakix は曲を同梱せず、自動でダウンロードもしません。エージェント(スキル)も BGM を探したりダウンロードしたりしません。

主なフリー BGM の配布元の規約の要点です(2026 年 10 月 15 日に確認。規約は変わることがあるため、使う前に原文を確認してください)。いずれも、音源ファイルそのものの再配布を禁止しています。

| 配布元 | 商用利用 | クレジット | 再配布・ツールへの同梱 | 出典 |
|--------|----------|------------|------------------------|------|
| OpenTracks(旧 DOVA-SYNDROME。2026 年 9 月 15 日に改名) | 可 | 不要(作曲者ごとの条件が優先) | 再配布は禁止。ツールへの組み込みは運営への事前連絡が必要 | [ライセンス](https://opentracks.com/help/articles/license/) |
| 魔王魂 | 可 | **必要**(例:「音楽：魔王魂」) | 他サイトへの登録や、曲単品の再配布は禁止 | [利用規約](https://maou.audio/rule/) |
| 甘茶の音楽工房 | 可 | 任意 | 2 次配布・直リンクは禁止 | [利用規約](https://amachamusic.chagasi.com/terms.html) |
| Pixabay | 可 | 不要 | 加工せずに単体で配布するのは禁止 | [ライセンスの概要](https://pixabay.com/service/license-summary/) |

### キャラクターの口調

読み上げに使う話者に合わせて、台本の口調を選びます(`auto`)。現在、組み込みの口調はずんだもん(一人称「ボク」、文末「〜のだ/〜なのだ」)だけです。

- `prepare` が口調の説明と例文を表示し、エージェントはそれに従って読み上げ文を書きます。`check` と `render` は、口調どおりの文末になっていない文を警告します。
- 口調が変わるのは読み上げ文と字幕だけです。画面の見出しや項目は中立な書き方のままです。
- ほかのキャラクターの口調は JSON ファイルで追加できます(`DOPAGAKIX_PERSONA=./metan.json`)。

```json
{
  "id": "metan",
  "name": "四国めたん",
  "speakerNames": ["四国めたん"],
  "style": "ここに口調の説明を書く(一人称、文末、話し方)",
  "examples": ["例文 1", "例文 2"],
  "endingPattern": "文末を確かめる正規表現(省略可)"
}
```

ずんだもんの口調は、公式プロフィール([zunko.jp](https://zunko.jp/))に記載がないため、二次情報([pixiv 百科事典](https://dic.pixiv.net/a/ずんだもん))に基づいています。口調はキャラクター性の利用と見る余地があるため、扱いは [VOICEVOX とキャラクターの規約](#voicevox-とキャラクターの規約) を参照してください。

### 読み方の確認

VOICEVOX は漢字や英字を誤って読むことがあります(「話速」をハナシソク、「README」をアルファベット 1 文字ずつ、など)。完成した動画を聞いてから作り直さずに済むよう、描画の前に全文の読みを確かめます。

- `check` は、全ての読み上げ文を VOICEVOX に通し、文ごとの読み(カタカナ)を表示します。英字の語を 1 文字ずつ読んでいる文と、文脈で読みが変わる字(「行」)を含む文には「要確認」を付けます。確かめるには VOICEVOX が必要で、接続できなければエラー(終了コード 1)にします。
- 誤読は、台本の `readings` に「表記: 読み」で書いて直します。置き換えるのは VOICEVOX に送る文だけで、字幕と画面の文字は元の表記のままです。長い表記から順に置き換えるので、文脈で読みが変わる語は前後を含めて書きます(`"重複した行": "重複したぎょう"`)。1 文字の表記は `check` で警告します。
- 読みの指定は、組み込みの一覧(README・npm・JSON・ffmpeg・話速・行末・他の など)、プロジェクトの辞書、台本の `readings` を合わせて使います(後のものが優先)。プロジェクトの辞書は既定で `<git のルート>/.dopagakix/readings.json` で、同じ形の JSON オブジェクトを書いてコミットすれば、チームで共有できます。場所は `DOPAGAKIX_READINGS` で変えられます。
- `check` は確かめた読みを台本と同じ場所の `checked-readings.json` に保存します。`render` は文ごとの読みをこれと照らし合わせ、すべて一致したときだけ、照らし合わせたのと同じ内容で音声を作ります。確認していない文や読みが違う文(`check` の後に台本を直した、エンジンを更新した、など)があれば、`check` のやり直しを求めるエラーにします。比べるのは読みだけなので、話者を変えて描画し直す場合は、読みが同じなら確認をやり直さなくて構いません。
- `script.json` には、描画に使った読みの指定(3 か所を合わせた結果)を記録し、描画し直しても同じ読みにします。
- VOICEVOX のユーザー辞書は使いません(エンジン全体の辞書を変えるため)。抑揚(アクセント)は指定できません。

```json
{
  "README": "リードミー",
  "冪等": "べきとう"
}
```

## VOICEVOX とキャラクターの規約

生成した動画の音声には、本ツールのライセンスとは別に、次の規約が適用されます(2026 年 10 月 14 日に確認。規約は変わることがあるため、使う前に原文を確認してください)。

1. **VOICEVOX**: 商用・非商用とも利用でき、「VOICEVOX を利用したことがわかるクレジット表記」が必要です。作った音声は、各音声ライブラリ(キャラクター)の規約に従って使います([VOICEVOX 利用規約](https://voicevox.hiroshiba.jp/term/)、[VOICEVOX 音声モデル 利用規約](https://github.com/VOICEVOX/voicevox_vvm))。
2. **キャラクターの声**: キャラクターごとの規約です。ずんだもんは「VOICEVOX:ずんだもん」とクレジットを書けば、商用・非商用とも利用できます([音源利用ガイドライン](https://zunko.jp/con_ongen_kiyaku.html))。
   - 動画では「説明画面や動画内のクレジットなど」に書く必要があります。本ツールは、各ページの下部と最終ページにクレジットを表示します。
   - クレジットを書かない商用利用は、1 キャラクターにつき 40 万円(税別)の契約が必要です。
   - 政治・宗教目的の利用や「虚偽や誤解を招く内容」などは禁止されています。エージェントの自己報告で成果を誇張しないことは、品質だけでなく規約の面でも必要です。
3. **キャラクター自体(イラストなど)**: 声とは別の[キャラクター利用ガイドライン](https://zunko.jp/guideline.html)があり、「企業利用であっても、社外に出ない利用なら無償での利用OK」とされています。本ツールはイラストを使いませんが、「〜のだ」口調はキャラクター性の利用と見る余地があります。社内向けの報告なら無償の範囲ですが、社外に公開する場合に気になるなら `DOPAGAKIX_PERSONA=none`(丁寧語)にしてください。

クレジットは「VOICEVOX:話者名」を自動で表示します。規約が別の書式を求める話者(もち子さん、Voidoll、ユーレイちゃん、里石ユカ)は、規約どおりの表記にします。規約が変わった場合などは `--credit`(環境変数 `DOPAGAKIX_CREDIT`)で指定できます。

ずんだもん以外では、次の話者に条件があります(上記の音声モデル利用規約より)。それ以外の多くは、クレジットを書けば商用・非商用とも利用できます。

| 話者 | 条件 |
|------|------|
| 青山龍星、もち子さん、後鬼 | 企業が携わる形で利用する場合は、事前確認が必要 |
| Voidoll | 法人による利用は問い合わせが必要 |
| ぞん子 | 商用利用は問い合わせが必要 |
| No.7、ユーレイちゃん | 個人の非商用のみ。その他の商用利用は事前確認が必要 |

## コマンド

| コマンド | 内容 |
|----------|------|
| `dopagakix prepare` | 出力先を作り、台本を書くための情報(画面に出る数値、口調、文字数の目安、環境、次に実行するコマンド)を表示する |
| `dopagakix check <report.json>` | 台本と全文の読みを確かめ、確かめた読みを保存する。描画はしない |
| `dopagakix render <report.json>` | 動画を作る。`check` で確かめた読みと一致しなければ止まる。完成した mp4 のパスだけを標準出力に出す(進捗は標準エラー) |
| `dopagakix digest` | セッションログを時系列のダイジェストにする(エージェントが作業を振り返る用。既定で 3 万文字以内) |
| `dopagakix sessions` | プロジェクトのセッションログを新しい順に表示する |
| `dopagakix speakers` | VOICEVOX の話者とスタイル ID を表示する |
| `dopagakix install-skill` | スキルを導入する |

セッションログは、`--transcript <ファイル>` → `--session <ID の先頭>` → 実行中の Claude Code のセッション(Claude Code が Bash ツールのコマンドに渡す環境変数 `CLAUDE_CODE_SESSION_ID`。[Claude Code: Environment variables](https://code.claude.com/docs/en/env-vars))→ プロジェクトの最新のログ、の順に選びます。サブディレクトリで実行しても、git のルートまでさかのぼって探します。

主なオプション(`prepare` / `check` / `render`):

| オプション | 既定値 | 説明 |
|------------|--------|------|
| `--seconds <n>` | `60` | 動画の長さの目安。読み上げ文の文字数の目安に使い、`render` では 1.25 倍を超えると話速を最大 1.45 まで上げて収めます |
| `--no-voice` | (音声あり) | 字幕のみで作ります。動画の柱に「音声なし」と表示し、`script.json` にも記録します。`DOPAGAKIX_REQUIRE_VOICE=1` のときはエラー |
| `--speaker <id>` / `--persona <name>` / `--voicevox-url <url>` | 上の表 | 環境変数より優先されます |
| `--credit <text>` | 話者から決める | 音声のクレジット表記(`prepare` / `render`)。環境変数 `DOPAGAKIX_CREDIT` でも可 |
| `--speed <x>` | `1.25` | 話速(`render` のみ。ずんだもんの実測で約 7.3 文字/秒) |
| `--timezone <tz>` | 実行環境の設定 | 画面の日時表示に使います |
| `--out-dir <dir>` | `dopagakix-out` | 出力先の親ディレクトリ(`prepare` のみ) |
| `--bgm <file>` / `--bgm-credit <text>` / `--bgm-volume <dB>` | 上の表 | BGM の曲ファイル・クレジット・音量(`prepare` / `render`)。環境変数より優先されます。`--no-bgm` で BGM なし([BGM](#bgm)) |
| `--video-dir <dir>` | (なし) | 完成した動画だけを置くフォルダ(`prepare` / `render`)。環境変数 `DOPAGAKIX_VIDEO_DIR` でも可 |
| `-o, --out <file>` | 台本と同じ場所の `summary.mp4` | 動画の出力先(`render` のみ)。作業ファイルも同じ場所に置き、`--video-dir` より優先します |

`prepare` に付けたオプションは、`prepare` が表示する `check` / `render` のコマンドにも引き継がれます。

### スキルを使わずに試す

```bash
dopagakix render "$(npm root -g)/dopagakix/examples/script.example.json" --no-voice -o dopagakix-sample/summary.mp4
```

## 所要時間の目安

開発環境(4 vCPU)での実測で、約 40 秒の動画に、音声合成 約 16〜18 秒、描画 約 41 秒かかりました。描画は動画 1 秒あたりおよそ 1 秒です。VOICEVOX は同時に複数の要求を送っても速くならなかったため、1 文ずつ順に合成しています。

## 注意事項

- **ログ形式**: Claude Code のセッションログの形式は内部仕様で、バージョンごとに変わり、直接解析するスクリプトはどの更新でも動かなくなりうると公式に明記されています([Claude Code: Manage sessions](https://code.claude.com/docs/en/sessions#where-transcripts-are-stored))。Claude Code 2.1.29x のログで動作を確認しています。
- **数値の範囲**: 変更ファイルと行数は、Edit / Write ツールでの変更だけを数えます。シェルのコマンド(`sed`、`git rm`、`npm install` など)で変更・削除したファイルは含みません。報告のために書いた台本(`dopagakix-out/` の中)も数えません。また、数値はセッション全体から、動画レポートを作っていた区間を除いて集計します。区間は、1 つのターン(指示者の発言から次の発言の直前まで)のうち、最初の目印(`video-report` スキルの呼び出し、`/video-report` の指示、`dopagakix` コマンドの実行、出力先のファイルの編集)からターンの終わりまでです。ターンの最初のツール実行が目印なら、その発言(「動画で報告して」など)も区間に含めます。区間の中の指示・ツール実行・コマンドは回数に数えず、期間と作業時間にも含めません。`dopagakix digest` では区間を 1 行にまとめ、`prepare` は除いた回数を表示します。
- **自己報告**: 台本はエージェントが自分の作業について書いたものです。重要な判断の前には、差分やテスト結果を確認してください。
- **権限**: スキルは `allowed-tools: Bash(dopagakix *)` を指定しており、スキルを使うターンの間は `dopagakix` コマンドを許可の確認なしで実行します([Claude Code: Skills](https://code.claude.com/docs/en/skills))。
- **VOICEVOX のクレジット**: 動画内に自動で表示します。詳しくは [VOICEVOX とキャラクターの規約](#voicevox-とキャラクターの規約) を参照してください。
- **フォント**: Noto Serif JP(見出し)、Zen Kaku Gothic New(本文・字幕)、JetBrains Mono(パス)を npm パッケージ経由で使っています(いずれも SIL Open Font License 1.1)。

## 開発

```bash
git clone https://github.com/4rtoflow/Dopagakix.git
cd Dopagakix
npm install
npm run compile      # src/ を dist/ にビルドする
npm test             # テスト(Chromium・ffmpeg・VOICEVOX があれば結合テストも実行)
npm run typecheck    # 型検査
npm link             # 開発中の版を dopagakix コマンドとして使う
```

**`src/` を変更したら、`npm run compile` を実行して `dist/` もコミットしてください。** `npm install -g github:…` で導入できるよう、ビルド済みの `dist/` をリポジトリに含めています。ビルドを `prepare` スクリプトで行う方式は、npm がグローバル導入の際に依存関係をパッケージ内に入れずにビルドしようとして失敗したため、採用していません(npm 10.9.4 と 11.21.0 で確認)。同じ理由で、npm が git から入れるときに準備処理の対象とするスクリプト名(`build`・`prepare`・`prepack` など)は使わず、ビルドは `compile` という名前にしています。`dist/` がソースと一致しているかは `npm test` で確かめます。

このリポジトリ自体にも `.claude/skills/video-report/` があるため、ここで Claude Code を使えばスキルを試せます。

### CI

GitHub Actions(`.github/workflows/ci.yml`)で、push のたびに次の 3 つを実行します。フォークからの pull request でも実行します。

| ジョブ | 内容 |
|--------|------|
| テスト | Node.js 22・24・26 で型検査と `npm test`。Chromium と ffmpeg を入れ、描画の結合テストを省略させない |
| git からの導入 | 利用者と同じく git から `npm install -g` で導入し、スキルの導入と同梱サンプルの描画を確かめる |
| VOICEVOX との結合 | VOICEVOX ENGINE(Docker イメージ `cpu-0.25.2`)を起動し、実エンジンのテスト(読みの確認と `check` → `render` の流れを含む)と、読み上げ付きの動画(BGM なし・合成音の BGM 付き)の作成を行う。全体の音量と、読み上げ中に BGM が下がることも確かめる。作った動画は成果物(`voiced-sample`・`voiced-bgm-sample`)として 7 日間保存する |

結合テストは、必要な道具がない環境では省略されます。CI では環境変数 `DOPAGAKIX_TEST_REQUIRE_RENDER` / `DOPAGAKIX_TEST_REQUIRE_VOICEVOX` を `1` にして、準備に失敗したときに省略されたまま成功に見えないようにしています。

```
src/
├── cli.ts                 コマンドの定義
├── pipeline.ts            ログの読み込み・台本の読み込み・描画のつなぎ込み
├── brief.ts               prepare の表示内容と環境の確認
├── skill.ts               スキルの導入
├── facts.ts               ログから集計する事実情報の型
├── persona.ts             キャラクターの口調
├── redact.ts              秘匿情報のマスク
├── transcript/            セッションログの探索・解析・ダイジェスト化
├── script/                台本のスキーマ・整形・確認(check)・読みの指定と照合
├── tts/                   VOICEVOX・無音合成・WAV 処理
├── audio/                 音声の仕上げ(BGM の合成・音量の調整)
└── video/                 タイムライン・HTML テンプレート・描画
dist/                      ビルド済みの CLI(npm run compile で更新し、コミットする)
.claude/skills/video-report/  エージェント用のスキル(npm パッケージにも同梱)
.github/workflows/ci.yml   CI(GitHub Actions)
.claude/skills/ui-ux-pro-max/ UI/UX Pro Max スキル(npm ui-ux-pro-max-cli 2.15.0、MIT。デザインの検討用)
test/                      vitest のテストと合成フィクスチャ
examples/                  スキルを使わずに render を試すためのサンプル
docs/design.md             動画のデザイン方針(避ける要素、トークン、構成の決まりごと)
```

見た目を変えるときは、先に [docs/design.md](docs/design.md) を確認してください。

## ライセンス

[MIT License](LICENSE)(Copyright (c) 2026 4rtoflow)です。

- 対象は、このリポジトリのソースコードと文書です。`.claude/skills/ui-ux-pro-max/` は第三者のソフトウェアで、同じディレクトリの LICENSE(MIT)に従います。
- 生成した動画の音声には、本ツールのライセンスとは別に、VOICEVOX と各キャラクターの規約が適用されます([VOICEVOX とキャラクターの規約](#voicevox-とキャラクターの規約))。
- フォント(SIL Open Font License 1.1)は npm パッケージから読み込むだけで、同梱していません。フォントを使って作った動画には OFL の条件はかかりません([OFL 1.1](https://openfontlicense.org/open-font-license-official-text/))。
