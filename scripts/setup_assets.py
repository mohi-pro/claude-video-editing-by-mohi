#!/usr/bin/env python3
"""Fetch the few things that are NOT stored in this repo (licences / size), for the computer you are on.

    python scripts/setup_assets.py

  1. GSAP animation library  -> engine/vendor/gsap.min.js   (downloaded from the official CDN)
  2. Noise remover (DeepFilterNet) for your OS -> engine/bin/   (optional: without it an FFmpeg denoiser is used)
  3. Sound effects (our own synthesized set)   -> engine/sfx/   (scripts/make_sfx.py)

Safe to run again: anything already there is kept. Needs internet. No packages beyond Python itself (+ numpy for sounds).
"""
import os, platform, stat, subprocess, sys, urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
GSAP_URL = "https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"
DF_BASE = "https://github.com/Rikorose/DeepFilterNet/releases/download/v0.5.6/"
UA = {"User-Agent": "claude-video-editing-by-mohi/1.0"}


def fetch(url, dest):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=120) as r, open(dest + ".part", "wb") as f:
        while True:
            chunk = r.read(1 << 16)
            if not chunk:
                break
            f.write(chunk)
    os.replace(dest + ".part", dest)


def gsap():
    dest = os.path.join(ROOT, "engine", "vendor", "gsap.min.js")
    if os.path.exists(dest) and os.path.getsize(dest) > 50000:
        return "GSAP: already there"
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    fetch(GSAP_URL, dest)
    return "GSAP: downloaded (%d KB)" % (os.path.getsize(dest) // 1024)


def deep_filter():
    sysname, mach = platform.system(), platform.machine().lower()
    table = {
        ("Darwin", "arm64"): "deep-filter-0.5.6-aarch64-apple-darwin",
        ("Darwin", "x86_64"): "deep-filter-0.5.6-x86_64-apple-darwin",
        ("Windows", "amd64"): "deep-filter-0.5.6-x86_64-pc-windows-msvc.exe",
        ("Linux", "x86_64"): "deep-filter-0.5.6-x86_64-unknown-linux-musl",
        ("Linux", "aarch64"): "deep-filter-0.5.6-aarch64-unknown-linux-gnu",
    }
    asset = table.get((sysname, mach))
    if not asset:
        return "noise remover: no build for %s/%s, using the FFmpeg denoiser instead (fine)" % (sysname, mach)
    name = "deep-filter.exe" if sysname == "Windows" else "deep-filter"
    dest = os.path.join(ROOT, "engine", "bin", name)
    if os.path.exists(dest):
        return "noise remover: already there"
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    fetch(DF_BASE + asset, dest)
    if sysname != "Windows":
        os.chmod(dest, os.stat(dest).st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    try:
        v = subprocess.run([dest, "--version"], capture_output=True, text=True, timeout=30).stdout.strip()
    except Exception as e:
        os.remove(dest)
        return "noise remover: downloaded but would not run (%s), using the FFmpeg denoiser instead (fine)" % e
    return "noise remover: ready (%s)" % (v or asset)


def sounds():
    venv = [p for p in (os.path.join(ROOT, "engine", ".venv", "bin", "python"), os.path.join(ROOT, "engine", ".venv", "Scripts", "python.exe")) if os.path.exists(p)]
    py = venv[0] if venv else sys.executable          # the engine's Python has numpy
    r = subprocess.run([py, os.path.join(ROOT, "scripts", "make_sfx.py")], capture_output=True, text=True)
    return r.stdout.strip() if r.returncode == 0 else "sounds: FAILED (%s), is numpy installed in this Python?" % r.stderr.strip()[-200:]


def main():
    ok = True
    for step in (gsap, deep_filter, sounds):
        try:
            msg = step()
        except Exception as e:  # keep going: noise remover and sounds are optional, GSAP is not
            msg = "%s: FAILED (%s)" % (step.__name__, e)
            ok = ok and step is not gsap
        print(("OK   " if "FAILED" not in msg else "FAIL ") + msg)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
