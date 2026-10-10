"""Word-level transcription (Bangla, English and more) with Whisper.

usage: <engine python> engine/transcribe.py <audio.wav> <out.json> [--lang bn] [--model large|turbo|<name>] [--prompt "..."] [--chunks speech.json]
Writes a flat word array: [{"text","start","end","p"}]  (p = word probability)

Two backends, chosen automatically:
  * mlx-whisper     Apple Silicon Macs (fastest, uses the Apple GPU)
  * faster-whisper  everything else: Windows, Intel Mac, Linux (CPU or NVIDIA GPU)
Force one with the environment variable STUDIO_ASR=mlx or STUDIO_ASR=faster-whisper.
"""
import argparse
import json
import os
import sys

MLX_MODELS = {
    "large": "mlx-community/whisper-large-v3-mlx",
    "turbo": "mlx-community/whisper-large-v3-turbo",
}
FW_MODELS = {"large": "large-v3", "turbo": "large-v3-turbo"}

# Seeds Whisper's vocabulary/style. Bangla prompt keeps it in Bengali script
# (otherwise it sometimes romanises or translates).
DEFAULT_PROMPTS = {
    "bn": "আজকে আমরা কথা বলব। এটা খুবই গুরুত্বপূর্ণ, তাই না? চলুন শুরু করি।",
    "en": "",
}


def pick_backend():
    want = os.environ.get("STUDIO_ASR", "").strip().lower()
    if want in ("faster-whisper", "faster", "fw"):
        return "faster-whisper"
    if want == "mlx":
        return "mlx"
    try:
        import mlx_whisper  # noqa: F401  (only installs/imports on Apple Silicon)
        return "mlx"
    except Exception:
        return "faster-whisper"


class Mlx:
    name = "mlx-whisper"

    def __init__(self, model):
        import mlx_whisper
        self.mw = mlx_whisper
        self.repo = MLX_MODELS.get(model, model)

    def run(self, audio, lang, prompt, full=True):
        kw = dict(path_or_hf_repo=self.repo, language=lang, word_timestamps=True, condition_on_previous_text=False,
                  initial_prompt=prompt or None, temperature=(0.0, 0.2, 0.4), verbose=None)
        if full:
            kw.update(no_speech_threshold=0.6, hallucination_silence_threshold=1.0)
        res = self.mw.transcribe(audio, **kw)
        words = []
        for s in res.get("segments", []):
            for w in s.get("words", []):
                words.append((w["word"], float(w["start"]), float(w["end"]), float(w.get("probability", 1.0))))
        return words, res.get("language")


class FasterWhisper:
    name = "faster-whisper"

    def __init__(self, model):
        from faster_whisper import WhisperModel
        self.repo = os.environ.get("STUDIO_FW_MODEL") or FW_MODELS.get(model, model)
        self.model = WhisperModel(self.repo, device="auto", compute_type="auto")

    @staticmethod
    def load(audio):
        """Decode with FFmpeg (already a hard requirement) instead of faster-whisper's PyAV, which breaks between versions."""
        if not isinstance(audio, str):
            return audio
        import subprocess
        import numpy as np
        pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", audio, "-f", "s16le", "-ac", "1", "-ar", "16000", "-"], capture_output=True).stdout
        return np.frombuffer(pcm, np.int16).astype(np.float32) / 32768.0

    def run(self, audio, lang, prompt, full=True):
        audio = self.load(audio)
        segs, info = self.model.transcribe(
            audio, language=lang, word_timestamps=True, condition_on_previous_text=False,
            initial_prompt=prompt or None, temperature=[0.0, 0.2, 0.4], no_speech_threshold=0.6,
            hallucination_silence_threshold=1.0)
        words = []
        for s in segs:
            for w in (s.words or []):
                words.append((w.word, float(w.start), float(w.end), float(w.probability)))
        return words, getattr(info, "language", lang)


def to_items(words, offset=0.0):
    out = []
    for text, st, en, p in words:
        t = text.strip()
        if t:
            out.append({"text": t, "start": round(offset + st, 3), "end": round(offset + en, 3), "p": round(p, 3)})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("out")
    ap.add_argument("--lang", default="bn")
    ap.add_argument("--model", default=None)
    ap.add_argument("--prompt", default=None)
    ap.add_argument("--chunks", default=None, help="speech.json: transcribe each group of speech islands separately (no long-silence loops)")
    a = ap.parse_args()

    model = a.model or ("large" if a.lang == "bn" else "turbo")
    prompt = a.prompt if a.prompt is not None else DEFAULT_PROMPTS.get(a.lang, "")
    backend = Mlx(model) if pick_backend() == "mlx" else FasterWhisper(model)

    if a.chunks:
        return chunked(a, backend, prompt)
    words, language = backend.run(a.audio, a.lang, prompt)
    items = to_items(words)
    with open(a.out, "w", encoding="utf8") as f:
        json.dump(items, f, ensure_ascii=False, indent=1)
    print(json.dumps({"ok": True, "model": backend.repo, "backend": backend.name, "words": len(items), "language": language}))


def chunked(a, backend, prompt):
    import numpy as np
    import subprocess
    isl = json.load(open(a.chunks))["islands"]
    # group islands into ~4-9s chunks, padded 0.15s
    groups, cur = [], []
    for s0, s1 in isl:
        if cur and (s1 - cur[0][0] > 9 or s0 - cur[-1][1] > 1.2):
            groups.append(cur); cur = []
        cur.append((s0, s1))
    if cur:
        groups.append(cur)
    pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", a.audio, "-f", "s16le", "-ac", "1", "-ar", "16000", "-"], capture_output=True).stdout
    audio = np.frombuffer(pcm, np.int16).astype(np.float32) / 32768.0
    items = []
    for g in groups:
        t0 = max(0.0, g[0][0] - 0.15); t1 = g[-1][1] + 0.15
        seg = audio[int(t0 * 16000): int(t1 * 16000)]
        words, _ = backend.run(seg, a.lang, prompt, full=False)
        items += to_items(words, offset=t0)
    with open(a.out, "w", encoding="utf8") as f:
        json.dump(items, f, ensure_ascii=False, indent=1)
    print(json.dumps({"ok": True, "model": backend.repo, "backend": backend.name, "words": len(items), "chunks": len(groups)}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
