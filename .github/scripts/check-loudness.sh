#!/usr/bin/env bash
# 動画の音声の積分ラウドネスとトゥルーピークを ebur128 で測り、-16 ±1 LUFS・-1.5 dBTP 以下かを確かめる
set -euo pipefail
summary=$(ffmpeg -hide_banner -nostats -i "$1" -map 0:a:0 -af ebur128=peak=true:framelog=quiet -f null - 2>&1 | sed -n '/Summary:/,$p')
integrated=$(awk '/Integrated loudness:/ { getline; print $2 }' <<< "$summary")
peak=$(awk '/True peak:/ { getline; print $2 }' <<< "$summary")
echo "ラウドネス: ${integrated} LUFS、トゥルーピーク: ${peak} dBTP"
awk -v i="$integrated" -v p="$peak" 'BEGIN { exit !(i >= -17 && i <= -15 && p <= -1.5) }'
