# サンドボックスで会話の要約の動画を作る

Bobert(Discord の bot)は、頼んだ人の Anthropic のアカウントで Managed Agents のサンドボックスを動かし、その中で dopagakix に動画を作らせます(4rtoflow/Bobert#118)。ここでは、サンドボックスの中で実行する手順と、手順を進めるエージェント(Claude Haiku 5.5)への指示の例をまとめます。

試作(Bobert#118 の「試作の結果」)では、全体で約 2 分、動画 1 本あたり約 $0.004 でした。時間の半分ほどは VOICEVOX ENGINE のダウンロード(約 2GB)です。

## 前提

- サンドボックスのネットワークは `limited` に `allow_package_managers: true` を付けます。これで GitHub からの dopagakix の導入も、VOICEVOX ENGINE のダウンロードも通ります。
- エージェントには `bash` と `read` の道具を許します。台本の読みを直すため、ファイルを書き換える道具も許します。
- サンドボックスには Node.js 22、ffmpeg、Chromium(`/opt/pw-browsers`)、`curl`、`unzip` が入っています。
- 渡すファイルは、会話の要約のファイル(`kind: "conversation"`。README の「会話の要約の動画」を参照)1 つです。Bobert が、AI の書いた台本(`script`)と、Bobert が数えた数値(`facts`)をまとめて作ります。

以下では、渡したファイルを `/mnt/session/uploads/conversation.json`、動画を取り出すフォルダーを `/mnt/session/outputs` とします。実際の場所に読み替えてください。

## 手順

### 1. dopagakix を入れ、VOICEVOX ENGINE を起動する

```bash
npm install -g github:4rtoflow/Dopagakix
bash "$(npm root -g)/dopagakix/scripts/sandbox/setup-voicevox.sh" /tmp/dopagakix
. /tmp/dopagakix/env.sh
```

`setup-voicevox.sh` は、VOICEVOX ENGINE をダウンロードして展開し、起動して応答するまで待ちます。終わると、dopagakix に渡す環境変数(VOICEVOX の URL、Chromium の場所、読み上げを必須にする設定)を `/tmp/dopagakix/env.sh` に書きます。

- 成功すると、終了コード 0 で、標準出力の最後の行が `env: /tmp/dopagakix/env.sh` になります。
- 失敗すると、終了コード 1 で、標準エラーに理由とログの末尾を出します。
- エンジンとログは作業フォルダー(`/tmp/dopagakix`)に置きます。動画の出力先には何も書きません。
- VOICEVOX ENGINE の版は、CI と同じ 0.25.2 です。環境変数 `VOICEVOX_VERSION` で変えられます。

### 2. 台本を作業フォルダーに写し、確かめる

```bash
cp /mnt/session/uploads/conversation.json /tmp/dopagakix/conversation.json
dopagakix check /tmp/dopagakix/conversation.json --json --speaker 3
```

渡したファイルは書き換えられないことがあるので、作業フォルダーに写してから使います。`check` は、読みを確かめた結果を、台本と同じフォルダーの `checked-readings.json` に保存します。`render` は、この記録と読みが一致しない台本を描画しません。

`--speaker` には VOICEVOX の話者(スタイル)ID を渡します。口調(`--persona auto`)は話者から決まり、ずんだもん(3 など)なら「〜のだ」口調の文末を確かめます。

`--json` の出力の形は次のとおりです(README の「互換性の決まり」の対象です)。値は例で、`sentences` は 1 文だけ示しています。

```json
{
  "kind": "conversation",
  "file": "/tmp/dopagakix/conversation.json",
  "title": "リリース日の見直し",
  "narration": { "sentences": 11, "chars": 279, "budget": 312, "seconds": 60 },
  "persona": "ずんだもん",
  "issues": [],
  "readings": {
    "status": "checked",
    "engine": "0.25.2",
    "speaker": { "id": 3, "name": "ずんだもん" },
    "review": 1,
    "sentences": [
      {
        "at": "opening.narration[0]",
        "text": "来週のリリースを予定どおり出すかについての会話なのだ。",
        "sent": "来週のリリースを予定どおり出すかについての会話なのだ。",
        "reading": "ライシュウノ リリースオ ヨテイドオリ ダスカニ ツイテノ カイワナノダ",
        "review": false,
        "reasons": []
      }
    ],
    "savedTo": "/tmp/dopagakix/checked-readings.json"
  }
}
```

| 欄 | 意味 |
| --- | --- |
| `issues` | 台本の直したほうがよい点。`at` はファイルの `script` の中の位置(例: `scenes[1].narration[0]`)。台本は Bobert の AI が確かめ済みなので、ここでは直さなくてかまわない |
| `readings.status` | `checked`=読みを確かめた / `skipped`=読み上げなしで省いた / `failed`=確かめられなかった(`error` に理由。終了コードは 1) |
| `readings.sentences[].text` | 字幕に出る文 |
| `readings.sentences[].sent` | VOICEVOX に送った文(読みの指定を当てはめたもの) |
| `readings.sentences[].reading` | VOICEVOX が決めた読み(カタカナ。句の区切りは空白) |
| `readings.sentences[].review` | 誤読が疑われるか。`reasons` に理由(英字を 1 文字ずつ読んだ、文脈で読みが変わる字がある、など) |

### 3. 誤読があれば、台本の readings で直して確かめ直す

`readings.sentences` を 1 文ずつ見て、読みが違う語があれば、`/tmp/dopagakix/conversation.json` の `script.readings` に「表記: 読み(カタカナかひらがな)」を足します。読み上げ文(`narration`)そのものは書き換えません。字幕と画面の文字は元の表記のまま出ます。

```json
"readings": { "Bobert": "ボバート", "昨日": "きのう" }
```

足したら、手順 2 の `check` をもう一度実行します。誤読がなくなるまで繰り返します。1 文字だけの表記は、意図しない箇所も置き換えるので避けます(`issues` で警告されます)。

### 4. 描画する

```bash
dopagakix render /tmp/dopagakix/conversation.json --speaker 3 \
  -o /mnt/session/outputs/summary.mp4 --work-dir /tmp/dopagakix --timezone Asia/Tokyo
```

`-o` に動画の出力先を、`--work-dir` に作業ファイル(`narration.wav`、`audio.wav`、`timeline.json`、`script.json`)の置き場所を渡します。これで出力のフォルダーには動画だけが入ります。成功すると、標準出力に動画のパスを 1 行だけ出します。

`--speaker` は、手順 2 と同じ値にします。`--timezone` は、画面に出す日時のタイムゾーンです。

動画が 10MB(Discord に添付できる大きさ)を超えたら、`render` はエラー(終了コード 1)にし、標準エラーに大きさを出します。動画は出力先に置かず、作業フォルダーの `oversize.mp4` に移します。

## エージェントへの指示の例

```text
Discord の会話を要約した縦型動画を作ってください。台本は /mnt/session/uploads/conversation.json です。
話者 ID は 3 です。

1. 次を実行します。終了コードが 0 でなければ、標準エラーの内容を報告して終わります。
   npm install -g github:4rtoflow/Dopagakix
   bash "$(npm root -g)/dopagakix/scripts/sandbox/setup-voicevox.sh" /tmp/dopagakix
2. 台本を /tmp/dopagakix/conversation.json に写し、次を実行します。
   . /tmp/dopagakix/env.sh && dopagakix check /tmp/dopagakix/conversation.json --json --speaker 3
3. 出力の readings.sentences を 1 文ずつ見て、text の読みとして reading が正しいかを確かめます。
   review が true の文は特に注意します。誤読があれば、/tmp/dopagakix/conversation.json の
   script.readings に「表記: 読み」を足し、手順 2 の check をやり直します。narration は書き換えません。
   readings 以外の欄も書き換えません。
4. 誤読がなくなったら、次を実行します。
   . /tmp/dopagakix/env.sh && dopagakix render /tmp/dopagakix/conversation.json --speaker 3 \
     -o /mnt/session/outputs/summary.mp4 --work-dir /tmp/dopagakix --timezone Asia/Tokyo
5. render の終了コードが 0 でなければ、標準エラーの内容を報告して終わります(動画が 10MB を超えた場合も含む)。
6. /mnt/session/outputs には summary.mp4 だけを置きます。ほかのファイルを書きません。
```
