# Setup

There are two ways to set up. Most people should use the first.

## A. Let Claude do it (recommended)

1. Open this folder in **Claude Code**: *Local*, this folder, **Permissions: Auto**, newest model.
2. Type: **`Set up this studio.`**

Claude follows `.claude/skills/setup-studio/SKILL.md`: it checks your computer (`python3 scripts/doctor.py`), installs
what is missing, downloads the speech models, fetches the few assets that are not stored in this repo, runs one full
test video, and creates a `.studio-ready` file. If a step fails it retries or finds an alternative, then tells you
what it did. You only step in when something needs **you**: your Mac password (Homebrew), or a click.

When it's done, open a **new chat** in this folder (skills load when a chat starts) and say
`Edit this video: /path/to/clip.mov`.

## B. By hand, one tool at a time

Open [`docs/index.html`](docs/index.html) in your browser. It explains each tool (what it is, why you need it) and
gives **one copy-paste** per tool: paste it into Claude Code and Claude runs it, checks it, retries on failure and
answers with ✅. The order matters:

1. Package manager (Homebrew on Mac, winget on Windows)
2. FFmpeg
3. Node.js 22+
4. uv + Python environment (`engine/.venv`)
5. HyperFrames
6. Speech-to-text (Whisper for Bangla, Parakeet for English)
7. This folder's assets: `python3 scripts/setup_assets.py`
8. Check everything: `python3 scripts/doctor.py`

## What `setup_assets.py` fetches

| Item | Why it isn't in the repo | Where it goes |
|---|---|---|
| GSAP animation library | official CDN copy, licence | `engine/vendor/gsap.min.js` |
| DeepFilterNet noise remover (matching your OS) | 25 MB binary, optional | `engine/bin/` |
| 24 sound effects | generated locally by `scripts/make_sfx.py` | `engine/sfx/*.wav` |

Without the noise remover the engine uses an FFmpeg denoiser. Everything else is required.

**Which Python command?** Mac and Linux use `python3`; on Windows use `python` (or `py`). Claude picks the right one.

## Check anytime

```
python3 scripts/doctor.py
```
One ✅ / ❌ line per item (➖ = optional). Ask Claude to fix any ❌: *"fix everything doctor.py shows as ❌"*.

## Windows, Intel Mac, Linux (experimental)

The engine was built on an Apple Silicon Mac. Elsewhere:
- Bangla/English transcription switches to **faster-whisper** automatically (CPU, or an NVIDIA GPU if present).
- The noise remover is downloaded for your OS.
- `scripts/*.sh` need a shell: Git Bash on Windows (or ask Claude to run the same steps by hand).
- Use `engine\.venv\Scripts\python.exe` where the docs say `engine/.venv/bin/python`.
- Claude is told to fix what breaks on your system and carry on. Please open an issue with what you hit.

## Music and sounds

- Music: put tracks in `music/` (nothing ships). Or ask Claude for free CC0 loops.
- Sounds: generated. To use better ones, save a `.wav` with the same name in `engine/sfx/` (for example `pop.wav`).

## Troubleshooting

| Symptom | Fix |
|---|---|
| Skills don't seem to load | Open a **new chat** in this folder. They load at chat start. |
| `doctor.py` says no space | Free up disk (about 20 GB). Delete old `projects/*/work` and `outputs`. |
| Bangla spelling is wrong in captions | Fix it at the "script check" step. Repeats go into `presets/caption-corrections.json`. |
| First Bangla edit is slow | It is downloading the ~3 GB speech model once. |
| Studio edits vanished | A rebuild regenerates the page. Tell Claude when you edit by hand so it renders your version. |
| macOS blocks a file | System Settings → Privacy & Security → Allow, or skip the optional noise remover. |

## Updating

`git pull`, then in Claude Code say *"run the studio doctor and fix anything new"*. Your `projects/`, `raw/`, `music/`
and any rules you saved into skills stay yours (rules live in `.claude/skills`, so `git pull` may ask you to merge if
you changed the same lines; keep your version of rules you like).
