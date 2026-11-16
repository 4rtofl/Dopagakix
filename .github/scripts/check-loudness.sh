#!/usr/bin/env bash
# 音声の積分ラウドネスとトゥルーピークを ebur128 で測り、-16 ±1 LUFS・トゥルーピーク <上限> dBTP 以下かを確かめる。
# 使い方: check-loudness.sh <ファイル> <トゥルーピークの上限>
# 仕上げた音声(audio.wav)は -1.5、AAC に変換した mp4 はピークが上がる分を見込んで -1 を上限にする。
set -euo pipefail
summary=$(ffmpeg -hide_banner -nostats -i "$1" -map 0:a:0 -af ebur128=peak=true:framelog=quiet -f null - 2>&1 | sed -n '/Summary:/,$p')
integrated=$(awk '/Integrated loudness:/ { getline; print $2 }' <<< "$summary")
peak=$(awk '/True peak:/ { getline; print $2 }' <<< "$summary")
echo "$1: ラウドネス ${integrated} LUFS、トゥルーピーク ${peak} dBTP(上限 $2)"
awk -v i="$integrated" -v p="$peak" -v max="$2" 'BEGIN { exit !(i >= -17 && i <= -15 && p <= max) }'
