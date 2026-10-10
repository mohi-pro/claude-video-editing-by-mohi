# Reference: "Editing normal podcast into engaging reels" (before/after, 24s) — FOLLOW the AFTER
- Speaker cut out (matte) and the BACKGROUND SWAPPED to match the words: Shark Tank poster, India flag,
  US flag, village, office buildings, dark satellite map of India (outline draws, red fill).
- Huge condensed keyword BEHIND the speaker's body ("AMERICAN DREAM", "COMPANIES", "INVOLVED"),
  white→blue gradient or red, with a small red caption line (the spoken words) just above it.
- Colour flashes (red/orange tint) and white-outs into whiteboard explainers (ENTREPRENEURSHIP →
  hand-drawn line → BASIC). Warm cinematic grade + vignette.
- Sound: deep bass booms ONLY on the big keyword reveals (4.6s, 9.2s); chimes when a new visual
  appears; tonal risers into reveals; sparkle on the white-out; quiet music bed. Nothing on captions.
Implemented: `node engine/matte.mjs <job>` (speaker-only cut-out), `behind` beat (bg swap:
pattern/map/flag/image/gradient/brand bgs + giant keyword behind the body + small spoken line),
pro SFX kit + event policy (booms ≥3.5s apart, min 0.35s spacing).
