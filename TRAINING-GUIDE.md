# How to teach Claude new editing skills

Everything Claude knows about editing your videos lives in plain files in this folder. "Training"
means changing those files — and you can do almost all of it by just talking.

## 1. Just tell me (fastest)
Say what you liked or didn't, in your own words, right after an edit:
- "captions are too big" / "use more scenes" / "never cover my face" / "hooks should be in English"

I fix the video **and** write the rule into the skill or preset so every future video follows it.
Add **"from now on"** or **"always"** when you mean it as a permanent rule, so I know it's not just
for this one video.

## 2. Show me (best for style)
1. Put screenshots or short clips of edits you like into `style-references/`
   (like your thirds-grid picture — that became the locked layout).
2. Say: **"study style-references and add it to the editing skill"**.
3. I look at the frames, describe the technique (layout, font, motion, colour, timing), build it into
   the engine if it's new, and test it on a clip.

## 3. Where each kind of knowledge lives
| What | File | Example change |
|---|---|---|
| Brand look: fonts, colours, colour grade, SFX, layout grid | `presets/signature-style.json` | "make the accent yellow", "warmer grade" |
| Per-format settings (speed, caption size, zoom rhythm) | `presets/captions-style.json`, `tiktok-raw-style.json`, `liquid-glass-style.json` | "TikTok cuts even faster" |
| Spelling fixes that keep coming back | `presets/caption-corrections.json` | names, brands, English terms |
| Editorial taste: hooks, pacing, when to use scenes/titles | `.claude/skills/video-edit/references/storytelling.md` | "always open with a question" |
| The step-by-step workflow | `.claude/skills/<step>/SKILL.md` | "always make a thumbnail too" |
| New visual templates (a new card, effect, transition) | `engine/build.mjs` + `engine/templates/runtime.css/.js` | "add a 3D phone mockup scene" |

## 4. Adding a brand-new skill
A skill is a folder `.claude/skills/<name>/` with a `SKILL.md`:
```markdown
---
name: podcast-clip
description: Turn a long podcast into 3 vertical clips with speaker labels. Use when the user says podcast, clips, highlights.
---
# Podcast clip
1. ...steps, commands, rules...
```
The `description` decides when I use it automatically — write the words you'd naturally say.
Easiest way: tell me **"make a new skill for X"** and describe how you'd do it; I'll write it, test it
and show you. (There's also a built-in `/skill-creator` skill that interviews you and can benchmark a
skill.)

Skills in this folder only work when Claude is opened in this folder. Skills in `~/.claude/skills/`
(like the HyperFrames ones) work everywhere.

## 5. A good habit
After each video, send one line of feedback ("hook was weak", "loved the bubble"). Over 5–10 videos
that turns into a style guide that is exactly yours.
