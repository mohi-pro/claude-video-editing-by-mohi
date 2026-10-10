#!/usr/bin/env bash
# Render the HyperFrames composition.
#   scripts/render.sh <job> draft   -> projects/<job>/edit/preview.mp4  (fast review copy)
#   scripts/render.sh <job> final   -> projects/<job>/edit/render.mp4   (delivery quality)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
JOB="$ROOT/projects/${1:?job name}"; MODE="${2:-draft}"
cd "$JOB/edit/hf"
if [ "$MODE" = "final" ]; then Q=delivery; OUT=../render.mp4; else Q=draft; OUT=../preview.mp4; fi
# fast capture + 4 workers: ~18x faster than auto on Apple Silicon, frame-identical (SSIM 0.996)
npx hyperframes render -o "$OUT" --quality "$Q" --fps 30 --workers 4 --experimental-fast-capture --quiet 2>&1 | grep -vE '^\[(INFO|initSession)' | tail -3
echo "{\"ok\":true,\"out\":\"$JOB/edit/${OUT#../}\"}"
