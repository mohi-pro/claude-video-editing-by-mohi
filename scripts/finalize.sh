#!/usr/bin/env bash
# Step 7 — Export: mix music (optional), normalize to -14 LUFS, write outputs/<job>.final.mp4 + .srt
#   scripts/finalize.sh <job> [--music music/x.mp3] [--music-vol 0.16] [--no-music]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
JOB="${1:?job name}"; shift
node "$ROOT/engine/finalize.mjs" "$ROOT/projects/$JOB" "$@"
