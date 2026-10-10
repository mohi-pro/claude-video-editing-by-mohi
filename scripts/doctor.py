#!/usr/bin/env python3
"""One command that checks the whole studio and prints a ✅ / ❌ line per item.

    python scripts/doctor.py           (use the engine's Python if you have it: engine/.venv/bin/python scripts/doctor.py)

Exit code 0 = everything the studio needs is ready. Optional items show ➖ and never fail the check.
"""
import glob, importlib.util, os, platform, re, shutil, subprocess, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
rows = []


def add(ok, name, detail="", optional=False):
    rows.append(("✅" if ok else ("➖" if optional else "❌"), name, detail, ok or optional))


def run(cmd, timeout=60):
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return r.returncode, (r.stdout + r.stderr).strip()
    except Exception as e:
        return 1, str(e)


def venv_python():
    for p in (os.path.join(ROOT, "engine", ".venv", "bin", "python"), os.path.join(ROOT, "engine", ".venv", "Scripts", "python.exe")):
        if os.path.exists(p):
            return p
    return None


def main():
    sysname, mach = platform.system(), platform.machine().lower()
    apple = sysname == "Darwin" and mach == "arm64"
    add(True, "Computer", "%s %s%s" % (sysname, mach, " (Apple Silicon: fastest path)" if apple else ""))
    free = shutil.disk_usage(ROOT).free / 1e9
    add(free >= 15, "Free disk space", "%.0f GB free (about 20 GB is comfortable)" % free)

    ff = shutil.which("ffmpeg"); fp = shutil.which("ffprobe")
    add(bool(ff and fp), "FFmpeg + FFprobe", run(["ffmpeg", "-version"])[1].split("\n")[0][:60] if ff else "not found")
    node = shutil.which("node"); ver = run(["node", "-v"])[1] if node else ""
    major = int(re.sub(r"\D.*", "", ver.lstrip("v")) or 0) if ver else 0
    add(major >= 22 and bool(shutil.which("npx")), "Node.js 22+ (and npx)", ver or "not found")
    add(bool(shutil.which("uv")), "uv (Python manager)", "found" if shutil.which("uv") else "not found", optional=bool(venv_python()))

    vp = venv_python()
    add(bool(vp), "Python environment", os.path.relpath(vp, ROOT) if vp else "engine/.venv is missing")
    if vp:
        want = ["cv2", "numpy"] + (["mlx_whisper"] if apple else ["faster_whisper"])
        code, out = run([vp, "-c", "import importlib.util\nbad=[m for m in %r if importlib.util.find_spec(m) is None]\nprint(','.join(bad))" % want])
        bad = out.strip()
        add(code == 0 and not bad, "Python packages", ("missing: " + bad) if bad else ", ".join(want))
        hub = os.path.join(os.path.expanduser("~"), ".cache", "huggingface", "hub")
        pat = "models--mlx-community--whisper-large-v3-mlx" if apple else "models--Systran--faster-whisper-large-v3"
        add(os.path.isdir(os.path.join(hub, pat)), "Bangla speech model (Whisper large-v3)", "downloaded" if os.path.isdir(os.path.join(hub, pat)) else "not downloaded yet (first Bangla edit will fetch ~3 GB)", optional=True)

    code, out = run(["npx", "--no-install", "hyperframes", "--version"], 120) if node else (1, "")
    if code != 0 and node:
        code, out = run(["npx", "-y", "hyperframes@latest", "--version"], 240)
    add(code == 0, "HyperFrames", out.splitlines()[-1][:50] if out else "not found")
    pk = os.path.join(os.path.expanduser("~"), ".cache", "hyperframes", "parakeet")
    add(os.path.isdir(pk), "Parakeet (English speech model)", "installed" if os.path.isdir(pk) else "not installed (only needed for English videos)", optional=True)

    add(os.path.exists(os.path.join(ROOT, "engine", "vendor", "gsap.min.js")), "GSAP animation library", "engine/vendor/gsap.min.js")
    df = [p for p in (os.path.join(ROOT, "engine", "bin", "deep-filter"), os.path.join(ROOT, "engine", "bin", "deep-filter.exe")) if os.path.exists(p)]
    add(bool(df), "Noise remover (DeepFilterNet)", "ready" if df else "not installed: an FFmpeg denoiser is used instead", optional=True)
    n_sfx = len(glob.glob(os.path.join(ROOT, "engine", "sfx", "*.wav")))
    add(n_sfx >= 24, "Sound effects", "%d of 24" % n_sfx)
    n_skill = len(glob.glob(os.path.join(ROOT, ".claude", "skills", "*", "SKILL.md")))
    add(n_skill >= 11, "Skills", "%d found in .claude/skills" % n_skill)
    n_font = len(glob.glob(os.path.join(ROOT, "engine", "fonts", "*.ttf")))
    add(n_font >= 8, "Fonts (Hind Siliguri etc.)", "%d files" % n_font)

    w = max(len(r[1]) for r in rows)
    for icon, name, detail, _ in rows:
        print("%s %-*s  %s" % (icon, w, name, detail))
    good = all(r[3] for r in rows)
    print("\n" + ("ALL GOOD: the studio is ready. Drop a video in raw/ and ask Claude to edit it." if good else "Some items need attention (see the ❌ lines)."))
    sys.exit(0 if good else 1)


if __name__ == "__main__":
    main()
