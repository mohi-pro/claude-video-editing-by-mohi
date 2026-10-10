#!/usr/bin/env python3
"""Generate the studio's sound effects: 24 original, synthesized sounds, no downloads and no licences to worry about.

    python scripts/make_sfx.py            # makes engine/sfx/<name>.wav, skips files that already exist
    python scripts/make_sfx.py --force    # regenerate everything

Want nicer sounds? Drop your own .wav into engine/sfx with the SAME NAME (for example pop.wav). Files you add are never
overwritten. Free packs: https://mixkit.co/free-sound-effects/ (personal/commercial use, not for re-sharing as files),
or CC0 sounds through .claude/skills/claude-video-editing/scripts/sound.py
"""
import os, sys, wave
import numpy as np

SR = 48000
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "engine", "sfx")
rng = np.random.default_rng(7)


def T(sec): return np.arange(int(SR * sec)) / SR
def env_exp(t, k): return np.exp(-k * t)
def env_ad(t, a, d):
    e = np.minimum(t / max(a, 1e-4), 1.0)
    return e * np.exp(-np.maximum(t - a, 0) * d)
def bell_env(t, peak):
    x = t / t[-1]
    return np.sin(np.pi * np.clip(x, 0, 1)) ** 2 if peak is None else np.exp(-((x - peak) ** 2) / 0.05)
def sweep(t, f0, f1, curve=1.0):
    x = (t / t[-1]) ** curve
    f = f0 + (f1 - f0) * x
    return np.sin(2 * np.pi * np.cumsum(f) / SR)
def noise(n): return rng.standard_normal(n)

def bandpass_noise(t, f0, f1, q=3.0, curve=1.0):
    """White noise through a state-variable band-pass whose centre frequency glides f0 -> f1."""
    n = len(t); x = noise(n); y = np.zeros(n)
    f = f0 + (f1 - f0) * (np.linspace(0, 1, n) ** curve)
    low = band = 0.0
    for i in range(n):
        g = 2 * np.sin(np.pi * min(f[i], SR * 0.45) / SR)
        low += g * band
        high = x[i] - low - band / q
        band += g * high
        y[i] = band
    return y / (np.max(np.abs(y)) + 1e-9)

def lowpass(x, fc):
    a = 1 - np.exp(-2 * np.pi * fc / SR); y = np.zeros_like(x); s = 0.0
    for i in range(len(x)):
        s += a * (x[i] - s); y[i] = s
    return y
def highpass(x, fc): return x - lowpass(x, fc)
def norm(x, peak_db=-3.0): return x / (np.max(np.abs(x)) + 1e-9) * (10 ** (peak_db / 20))
def place(buf, at, snd):
    i = int(at * SR); n = min(len(snd), len(buf) - i)
    if n > 0: buf[i:i + n] += snd[:n]
def fade(x, ms_in=1.0, ms_out=8):
    a, b = int(SR * ms_in / 1000), int(SR * ms_out / 1000); x = x.copy(); x[:a] *= np.linspace(0, 1, a); x[-b:] *= np.linspace(1, 0, b); return x


def pop():
    t = T(0.17); return sweep(t, 760, 170) * env_exp(t, 26) + 0.25 * noise(len(t)) * env_exp(t, 160)
def pop_click():
    a = pop(); t = T(0.5); b = highpass(noise(len(t)), 2500) * env_exp(t, 90) * 0.5
    o = np.zeros(len(t)); place(o, 0, a * 0.9); place(o, 0.09, b); return o
def bubble():
    t = T(0.37); return (sweep(t, 330, 980, 1.6) * env_ad(t, 0.02, 7) + 0.4 * sweep(t, 520, 1500, 1.6) * env_ad(t, 0.05, 11))
def ding():
    t = T(1.8); o = np.zeros(len(t))
    for f, a, k in [(880, 1.0, 2.2), (1760, 0.55, 3.0), (2490, 0.3, 4.2), (3400, 0.16, 6.0), (4720, 0.08, 9.0)]:
        o += a * np.sin(2 * np.pi * f * t) * env_exp(t, k)
    return o * np.minimum(t / 0.003, 1)
def ui_click():
    t = T(0.12); return (np.sin(2 * np.pi * 1900 * t) * env_exp(t, 90) + highpass(noise(len(t)), 3000) * env_exp(t, 140) * 0.8)
def camera():
    t = T(0.21); o = np.zeros(len(t))
    for at, g in ((0.0, 1.0), (0.085, 0.8)):
        c = lowpass(noise(int(SR * 0.05)), 5200) * env_exp(T(0.05), 90); place(o, at, c * g)
    return o
def typing():
    t = T(1.4); o = np.zeros(len(t))
    for at in np.cumsum(rng.uniform(0.07, 0.17, 10)):
        if at < 1.3:
            c = T(0.045); k = (np.sin(2 * np.pi * rng.uniform(1300, 2200) * c) + highpass(noise(len(c)), 1800)) * env_exp(c, 85)
            place(o, at, k * rng.uniform(0.6, 1.0))
    return o
def page():
    t = T(0.39); return bandpass_noise(t, 1800, 4200, 3.0) * bell_env(t, 0.35)
def scribble():
    t = T(1.0); n = highpass(noise(len(t)), 1800) * 0.7
    am = np.abs(np.sin(2 * np.pi * np.cumsum(rng.uniform(7, 15, len(t))) / SR * 1.0)) ** 0.6
    return n * am * bell_env(t, 0.45)
def swoosh():
    t = T(0.45); return bandpass_noise(t, 450, 3200, 5.0) * bell_env(t, 0.5)
def whoosh_fast():
    t = T(0.9); return bandpass_noise(t, 260, 4200, 5.0, 1.4) * bell_env(t, 0.55)
def whoosh_soft():
    t = T(1.6); return bandpass_noise(t, 180, 2000, 3.0, 1.2) * bell_env(t, 0.5)
def boom():
    t = T(1.0); return (sweep(t, 78, 34) * env_exp(t, 4.4) + 0.35 * lowpass(noise(len(t)), 220) * env_exp(t, 9)) * np.minimum(t / 0.004, 1)
def boom_big():
    t = T(2.2); b = sweep(t, 62, 28) * env_exp(t, 2.1) + 0.5 * lowpass(noise(len(t)), 180) * env_exp(t, 3.2)
    return b * np.minimum(t / 0.004, 1) + 0.12 * lowpass(noise(len(t)), 700) * env_exp(t, 2.4)
def whoosh_impact():
    t = T(1.8); o = np.zeros(len(t)); place(o, 0, bandpass_noise(t[:int(SR * 1.2)], 250, 3600, 4.5, 1.6) * bell_env(t[:int(SR * 1.2)], 0.8) * 0.8)
    place(o, 1.0, boom()[: int(SR * 0.8)]); return o
def air_zoom():
    t = T(1.1); return bandpass_noise(t, 380, 5200, 5.0, 1.8) * (t / t[-1]) ** 1.4 * (1 - (t / t[-1]) ** 8) + 0.15 * sweep(t, 220, 1100, 2.0) * (t / t[-1])
def zoom_hit():
    t = T(0.9); return (sweep(t, 120, 38) * env_exp(t, 6.0) + 0.5 * bandpass_noise(t, 3000, 300, 1.4) * env_exp(t, 9)) * np.minimum(t / 0.003, 1)
def sub_bass():
    t = T(2.0); return (np.sin(2 * np.pi * 46 * t) + 0.35 * np.sin(2 * np.pi * 92 * t)) * env_ad(t, 0.01, 1.7)
def riser():
    t = T(2.0); n = bandpass_noise(t, 220, 7000, 4.0, 2.0) * (t / t[-1]) ** 1.6
    return (n + 0.35 * sweep(t, 180, 1900, 2.2) * (t / t[-1]) ** 1.2) * np.minimum((t[-1] - t) / 0.02, 1)
def shine():
    t = T(1.5); o = np.zeros(len(t))
    for i, f in enumerate((2093, 2637, 3136, 3951)):
        place(o, 0.07 * i, np.sin(2 * np.pi * f * T(1.2)) * env_exp(T(1.2), 3.4 + i * 0.5) * (1 - i * 0.12))
    return o
def sparkle():
    t = T(1.6); o = np.zeros(len(t))
    for at in np.sort(rng.uniform(0, 1.2, 14)):
        c = T(0.25); place(o, at, np.sin(2 * np.pi * rng.uniform(3200, 8200) * c) * env_exp(c, 16) * rng.uniform(0.3, 1.0))
    return o
def _crushed(dur, bursts):
    t = T(dur); o = np.zeros(len(t))
    for _ in range(bursts):
        at = rng.uniform(0, dur * 0.8); c = T(rng.uniform(0.03, 0.12)); f = rng.uniform(150, 3000)
        s = np.sign(np.sin(2 * np.pi * f * c)) * 0.6 + noise(len(c)) * 0.3
        s = np.round(s * 4) / 4; place(o, at, s * np.minimum(np.linspace(1, 0, len(c)) * 6, 1))
    return o
def glitch(): return _crushed(0.9, 9)
def glitch_text(): return _crushed(0.6, 7)
def tech_slide():
    t = T(1.0); o = sweep(t, 420, 1900, 1.4) * bell_env(t, 0.6) * 0.6
    steps = np.repeat(rng.uniform(600, 2400, 10), int(len(t) / 10) + 1)[: len(t)]
    return o + 0.3 * np.sign(np.sin(2 * np.pi * np.cumsum(steps) / SR)) * bell_env(t, 0.5) * 0.4

SOUNDS = {
    "pop": (pop, -3), "pop-click": (pop_click, -3), "bubble": (bubble, -3), "ding": (ding, -3), "ui-click": (ui_click, -3),
    "camera": (camera, -3), "typing": (typing, -9), "page": (page, -3), "scribble": (scribble, -3),
    "swoosh": (swoosh, -3), "whoosh-fast": (whoosh_fast, -3), "whoosh-soft": (whoosh_soft, -3), "whoosh-impact": (whoosh_impact, -3),
    "air-zoom": (air_zoom, -3), "zoom-hit": (zoom_hit, -3), "boom": (boom, -3), "boom-big": (boom_big, -3),
    "sub-bass": (sub_bass, -3), "riser": (riser, -3.8), "shine": (shine, -3), "sparkle": (sparkle, -3),
    "glitch": (glitch, -3), "glitch-text": (glitch_text, -3.7), "tech-slide": (tech_slide, -3),
}


def write_wav(path, x):
    st = np.repeat(x[:, None], 2, axis=1)      # stereo, 48 kHz, 16-bit like the engine expects
    with wave.open(path, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((st * 32767).astype("<i2").tobytes())


def main():
    force = "--force" in sys.argv
    os.makedirs(OUT, exist_ok=True)
    made = kept = 0
    for name, (fn, peak) in SOUNDS.items():
        path = os.path.join(OUT, name + ".wav")
        if os.path.exists(path) and not force:
            kept += 1; continue
        write_wav(path, norm(fade(np.nan_to_num(fn())), peak)); made += 1
    print("sounds: %d made, %d already there (engine/sfx)" % (made, kept))


if __name__ == "__main__":
    main()
