# Reference: "How to edit viral reels in After Effects" (footballer / mind explainer, 14s)

Voice-over: "A true footballer doesn't just play with his feet, he plays with his mind. He thinks
quickly, has vision, and uses his intelligence to control not only his space, but the entire field."

Style: **visual-metaphor explainer** — every key idea becomes a physical object in one continuous
camera journey. Only 3 hard cuts in 14s; everything else is motion.

| t | Spoken | Visual technique |
|---|---|---|
| 0–0.3 | — | tutorial annotation frame (shadows + halftone texture on a cut-out brain) |
| 0.3–2.5 | "A true footballer…" | grey **paper texture** bg; player photo fades in inside a **chamfered (octagon) frame** with a thin offset outline; slow push-in |
| 2.5–3.3 | "…play with his feet" | the photo **splits vertically**, halves slide apart → a **3D brain cut-out** appears in the gap, **thin connector lines** from frame corners to the object |
| 3.0–4.3 | "he plays with his mind" | **size-contrast kinetic type** top-left: small light words typed one by one ("he play with is"), then the KEY word huge black bold ("mind") on the spoken beat |
| 4.3–5.0 | "He thinks quickly" | whole layout drifts + defocuses (exit by **blur + scale**) |
| 5.0–7.1 | "has vision" | **eyeball** object arrives **out of focus → snaps sharp** (rack focus), horizon line behind **rotates** (camera roll), soft shadow |
| 7.1 | "intelligence" | **shape match-cut**: round eyeball → round white **plate** carrying the brain; bg flips paper → **dark** |
| 7.1–9.7 | "control… his space" | a **light beam cone** sweeps from the brain; key text ("not only his / **space**") revealed **inside the beam** |
| 9.7–14 | "but the entire field" | **zoom-out reveal**: plate shrinks, camera pulls back → **football pitch** lines appear; beam scans like radar, narrows to a line, settles |

Craft rules extracted:
1. One metaphor object per idea; objects are cut-outs with soft drop shadow (+ halftone/grain).
2. Monochrome world (paper / dark), max one accent colour.
3. Typography: only key words big (5–8× the size of filler words); filler words light and small;
   words appear exactly when spoken.
4. Continuous camera: always pushing, drifting or rotating; transitions are focus pulls, shape
   match-cuts and zoom-outs — not hard cuts.
5. The background itself tells the story at the end (pitch = "the entire field").

Implemented in the engine as `scene` features: `bg: "paper" | "chalk"`, `object`, `plate`, `photo`
+ `reveal: "split"`, `kinetic`, `beam`, `backdrop: "pitch" | "radar"`, `transition: "focus"`,
`mono`. See `/graphics-plan`.
