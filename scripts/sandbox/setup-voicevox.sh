#!/usr/bin/env bash
# VOICEVOX ENGINE(CPU 版、Linux x64)をダウンロードして起動し、dopagakix を動かす環境変数を env.sh に書く。
# Claude の Managed Agents のサンドボックスで動画を作るための手順(docs/sandbox.md)の一部。
#
#   bash "$(npm root -g)/dopagakix/scripts/sandbox/setup-voicevox.sh" [作業フォルダー]
#   . <作業フォルダー>/env.sh
#
# 作業フォルダー(既定: /tmp/dopagakix)に、エンジンとログを置く。動画の出力先には何も書かない。
# 決まった形で結果を出す(互換性の決まりの対象。README を参照):
#   - 成功: 終了コード 0。標準出力の最後の行が「env: <env.sh のパス>」
#   - 失敗: 終了コード 1。標準エラーに理由とログの末尾
set -euo pipefail

WORK="${1:-/tmp/dopagakix}"
# CI(.github/workflows/ci.yml の VOICEVOX_IMAGE)と同じ版。組み込みの読みの指定は、この版で確かめている
VERSION="${VOICEVOX_VERSION:-0.25.2}"
PORT="${VOICEVOX_PORT:-50021}"
URL="http://127.0.0.1:$PORT"
BASE="https://github.com/VOICEVOX/voicevox_engine/releases/download/$VERSION"
ASSET="voicevox_engine-linux-cpu-x64-$VERSION"
ENGINE="$WORK/voicevox-$VERSION"
LOG="$WORK/voicevox.log"

mkdir -p "$WORK"

fail() {
  echo "エラー: $1" >&2
  if [ -f "$LOG" ]; then
    echo "--- $LOG の末尾 ---" >&2
    tail -n 30 "$LOG" >&2
  fi
  exit 1
}

say() { echo "$(date +%H:%M:%S) $*"; }

# 描画に使う Chromium。サンドボックスには Playwright のブラウザーが /opt/pw-browsers に入っている
chromium="${DOPAGAKIX_CHROMIUM:-}"
if [ -z "$chromium" ]; then
  chromium=$(find "${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}" -maxdepth 5 -type f \
    \( -name chrome-headless-shell -o -name headless_shell -o -name chrome \) 2>/dev/null | sort | head -1 || true)
fi
command -v ffmpeg > /dev/null || fail "ffmpeg が見つかりません。"

if curl -fsS "$URL/version" > /dev/null 2>&1; then
  say "VOICEVOX ENGINE は起動済みです($URL)"
else
  if [ ! -d "$ENGINE" ]; then
    # 0.26 からは 2 つのファイル(.001.vvppp、.002.vvppp)に分かれている。どちらも zip で、つなげると 1 つの vvpp になる
    say "VOICEVOX ENGINE $VERSION をダウンロードします(約 2GB)"
    archive="$WORK/engine.vvpp"
    if curl -fsSL "$BASE/$ASSET.vvpp" -o "$archive" 2>> "$LOG"; then
      :
    elif curl -fsSL "$BASE/$ASSET.001.vvppp" -o "$archive" 2>> "$LOG" && curl -fsSL "$BASE/$ASSET.002.vvppp" >> "$archive" 2>> "$LOG"; then
      :
    else
      rm -f "$archive"
      fail "VOICEVOX ENGINE $VERSION をダウンロードできませんでした($BASE)。"
    fi
    say "展開します"
    unzip -q "$archive" -d "$ENGINE.partial" >> "$LOG" 2>&1 || fail "VOICEVOX ENGINE を展開できませんでした。"
    rm -f "$archive"
    mv "$ENGINE.partial" "$ENGINE"
  fi
  run=$(find "$ENGINE" -maxdepth 3 -type f -name run | head -1)
  [ -n "$run" ] || fail "VOICEVOX ENGINE の実行ファイル(run)が見つかりません($ENGINE)。"
  chmod +x "$run"
  say "VOICEVOX ENGINE を起動します"
  (cd "$(dirname "$run")" && setsid nohup ./run --host 127.0.0.1 --port "$PORT" >> "$LOG" 2>&1 < /dev/null &)
  for _ in $(seq 1 120); do
    if curl -fsS "$URL/version" > /dev/null 2>&1; then break; fi
    sleep 1
  done
  curl -fsS "$URL/version" > /dev/null 2>&1 || fail "VOICEVOX ENGINE が 120 秒待っても応答しません。"
  say "VOICEVOX ENGINE $(curl -fsS "$URL/version") が応答しました"
fi

{
  echo "export VOICEVOX_URL=$URL"
  # 読み上げ付きの動画だけを作る(字幕だけの動画で済ませない)
  echo "export DOPAGAKIX_REQUIRE_VOICE=1"
  if [ -n "$chromium" ]; then echo "export DOPAGAKIX_CHROMIUM=$chromium"; fi
} > "$WORK/env.sh"
if [ -z "$chromium" ]; then say "注意: Chromium が見つかりません。render の --chromium で指定してください"; fi
echo "env: $WORK/env.sh"
