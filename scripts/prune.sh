#!/usr/bin/env bash
# Delete regenerable intermediates once outputs/<job>.final.mp4 exists. Never touches raw/, plans, transcripts.
#   scripts/prune.sh <job> [--deep]   (--deep also removes cut/cut.mp4)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
JOB="${1:?job name}"; D="$ROOT/projects/$JOB"
[ -f "$ROOT/outputs/$JOB.final.mp4" ] || { echo "refusing: outputs/$JOB.final.mp4 not found (finish the job first)"; exit 1; }
before=$(du -sk "$D" | cut -f1)
rm -f "$D/work/audio16k.wav" "$D/work/source.mp4" "$D/work/source-sdr.mp4" "$D"/work/part*-sdr.mp4 "$D"/work/part*.mp4 "$D/work/concat.txt"
rm -rf "$D/work/hf-tx" "$D/edit/hf/assets/media" "$D/edit/hf/snapshots" "$D/edit/hf/renders" "$D/edit/thumb/snapshots"
rm -f "$D/edit/preview.mp4" "$D/edit/render.mp4"
[ "${2:-}" = "--deep" ] && rm -f "$D/cut/cut.mp4"
after=$(du -sk "$D" | cut -f1)
echo "{\"ok\":true,\"freedMB\":$(( (before-after)/1024 ))}"
