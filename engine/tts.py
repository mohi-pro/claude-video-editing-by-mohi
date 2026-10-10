"""Text-to-video base: script -> neural voiceover + exact word timings + a ready job (no camera footage).

usage: engine/.venv/bin/python engine/tts.py <job-dir> "<script text>" [--voice bn-BD-PradeepNeural] [--rate +0%]
       [--total 10] [--lead 0.25] [--format short-explainer] [--display "এআই=AI।,না=না।"]
Writes: <job>/job.json, cut/cut.mp4 (dark canvas + voice, `--total` seconds), cut/transcript.json (word timings
from the TTS engine itself), work/vo.mp3. Then write edit/plan.json (scenes) and run engine/build.mjs.
Voices: bn-BD-PradeepNeural (male), bn-BD-NabanitaNeural (female), en-US-AndrewNeural, … (`edge-tts --list-voices`).
Uses Microsoft's online Edge TTS service: the script text is sent to it.
"""
import argparse
import asyncio
import json
import os
import subprocess
import sys

import edge_tts


async def synth(text, voice, rate, out):
    c = edge_tts.Communicate(text, voice, rate=rate, boundary="WordBoundary")
    audio, words = bytearray(), []
    async for ch in c.stream():
        if ch["type"] == "audio":
            audio += ch["data"]
        elif ch["type"] == "WordBoundary":
            words.append({"text": ch["text"], "start": ch["offset"] / 1e7, "end": (ch["offset"] + ch["duration"]) / 1e7})
    open(out, "wb").write(audio)
    return words


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("job")
    ap.add_argument("text")
    ap.add_argument("--voice", default="bn-BD-PradeepNeural")
    ap.add_argument("--rate", default="+0%")
    ap.add_argument("--total", type=float, default=None, help="video length; default = voice + 1.8s end card")
    ap.add_argument("--lead", type=float, default=0.25)
    ap.add_argument("--format", default="short-explainer")
    ap.add_argument("--display", default="", help="word replacements for display, e.g. 'এআই=AI।,না=না।'")
    a = ap.parse_args()
    job = os.path.abspath(a.job)
    for d in ("raw", "work", "cut", "edit"):
        os.makedirs(os.path.join(job, d), exist_ok=True)
    vo = os.path.join(job, "work", "vo.mp3")
    words = asyncio.run(synth(a.text, a.voice, a.rate, vo))
    dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", vo], text=True))
    total = a.total or round(dur + a.lead + 1.8, 2)
    disp = dict(x.split("=", 1) for x in a.display.split(",") if "=" in x)
    tx = [{"text": disp.get(w["text"], w["text"]), "start": round(w["start"] + a.lead, 3), "end": round(w["end"] + a.lead, 3)} for w in words]
    json.dump(tx, open(os.path.join(job, "cut", "transcript.json"), "w"), ensure_ascii=False, indent=1)
    lead_ms = int(a.lead * 1000)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"color=c=0x0B0B0D:s=1080x1920:r=30:d={total}", "-i", vo,
                    "-filter_complex", f"[1:a]adelay={lead_ms}|{lead_ms},aresample=48000,equalizer=f=3200:t=q:w=1.2:g=2,highpass=f=70,"
                    f"loudnorm=I=-14:TP=-1.5,apad=whole_dur={total},atrim=0:{total}[a]",
                    "-map", "0:v", "-map", "[a]", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "256k",
                    "-t", str(total), os.path.join(job, "cut", "cut.mp4")], check=True)
    lang = a.voice.split("-")[0]
    json.dump({"format": a.format, "lang": lang, "enhance": False, "speed": 1.0, "grade": "none", "source": "text-to-video"},
              open(os.path.join(job, "job.json"), "w"), ensure_ascii=False, indent=2)
    with open(os.path.join(job, "cut", "words.md"), "w") as f:
        f.write("# Voice words (TTS timings)\n\n" + " ".join(f"{i}:{w['text']}@{w['start']}" for i, w in enumerate(tx)) + "\n")
    print(json.dumps({"ok": True, "job": job, "voice": round(dur, 2), "total": total, "words": len(tx)}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
