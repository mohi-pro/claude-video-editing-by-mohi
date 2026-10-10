#!/usr/bin/env bash
# Step 1 — Intake: copy raw clip(s) into projects/<job>/raw/ (originals are never modified).
#   scripts/new-job.sh <job-name> <format> <clip> [more clips...]
#   format: short-explainer | short-tiktok | long-youtube
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ $# -lt 3 ] && { echo "usage: new-job.sh <job-name> <short-explainer|short-tiktok|long-youtube> <clip>..."; exit 1; }
JOB="$1"; FMT="$2"; shift 2
case "$FMT" in short-explainer|short-tiktok|long-youtube) ;; *) echo "bad format: $FMT"; exit 1;; esac
D="$ROOT/projects/$JOB"
mkdir -p "$D/raw" "$D/work" "$D/cut" "$D/edit" "$D/assets"
i=0
for f in "$@"; do
  [ -f "$f" ] || { echo "not found: $f"; exit 1; }
  i=$((i+1)); ext="${f##*.}"
  dst="$D/raw/$(printf '%02d' $i)-$(basename "$f")"
  cp -n "$f" "$dst"
done
[ -f "$D/job.json" ] || printf '{\n  "format": "%s",\n  "lang": "bn",\n  "created": "%s"\n}\n' "$FMT" "$(date +%F)" > "$D/job.json"
echo "{\"ok\":true,\"job\":\"$D\",\"clips\":$i}"
