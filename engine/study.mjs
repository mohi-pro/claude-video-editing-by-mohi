#!/usr/bin/env node
// Study a reference video ("watch" skill): everything Claude needs to learn its editing style.
//   node engine/study.mjs <video> [--name my-ref] [--from 0] [--to 38] [--fps 2] [--lang en]
// -> style-references/<name>/: reference.mp4, frames/ (fps), sheet-*.png (contact sheets, 8x3, time-stamped order),
//    cuts.txt (hard cuts), ref-words.json (transcript), spectrum.png (sound design), faces.json (+ composition mix)
import { existsSync, mkdirSync, readdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve, basename, extname } from "node:path";
import { spawnSync } from "node:child_process";
import { ENGINE, ROOT, PYTHON, ffmpeg, probe, args, r3 } from "./lib.mjs";

const A = args();
const src = resolve(A._[0] || "");
if (!A._[0] || !existsSync(src)) { console.error("usage: study.mjs <video> [--name x] [--from s] [--to s] [--fps 2]"); process.exit(1); }
const name = A.name || basename(src, extname(src)).replace(/[^\w-]+/g, "-").slice(0, 40).toLowerCase();
const D = join(ROOT, "style-references", name);
mkdirSync(join(D, "frames"), { recursive: true });
const from = Number(A.from || 0), to = A.to ? Number(A.to) : null, fps = Number(A.fps || 2);
const ref = join(D, "reference.mp4");
if (!existsSync(ref)) ffmpeg(["-ss", String(from), ...(to ? ["-to", String(to)] : []), "-i", src, "-c:v", "libx264", "-crf", "18", "-c:a", "aac", "-b:a", "192k", ref]);
const info = probe(ref);

// frames + contact sheets (24 per sheet)
ffmpeg(["-i", ref, "-vf", `fps=${fps},scale=240:-1`, join(D, "frames", "f%03d.png")]);
const nFrames = readdirSync(join(D, "frames")).length;
const sheets = Math.ceil(nFrames / 24);
for (let k = 0; k < sheets; k++) ffmpeg(["-start_number", String(k * 24 + 1), "-i", join(D, "frames", "f%03d.png"), "-frames:v", "1", "-vf", "tile=8x3", join(D, `sheet-${k}.png`)]);

// hard cuts
const sc = spawnSync("ffmpeg", ["-hide_banner", "-i", ref, "-vf", "select='gt(scene,0.3)',showinfo", "-f", "null", "-"], { encoding: "utf8" }).stderr;
const cuts = [...sc.matchAll(/pts_time:([\d.]+)/g)].map((m) => r3(Number(m[1])));
writeFileSync(join(D, "cuts.txt"), cuts.join("\n") + "\n");

// sound design + transcript
ffmpeg(["-i", ref, "-lavfi", "showspectrumpic=s=1600x500:legend=1:fscale=log:scale=log", join(D, "spectrum.png")]);
ffmpeg(["-i", ref, "-vn", "-ac", "1", "-ar", "16000", join(D, "ref.wav")]);
spawnSync(PYTHON, [join(ENGINE, "transcribe.py"), join(D, "ref.wav"), join(D, "ref-words.json"), "--lang", A.lang || "en"], { stdio: "ignore" });

// face presence per frame -> composition mix (full face / face + graphics / full canvas, approximated)
const tr = spawnSync(PYTHON, [join(ENGINE, "track.py"), ref, join(D, "faces.json"), "--fps", String(fps)], { encoding: "utf8" });
let mix = null;
try {
  const pres = JSON.parse(readFileSync(join(D, "faces.json"), "utf8")).presence || [];
  if (pres.length) {
    // big face = talking head on screen; small face = face sharing the frame with graphics (split/PiP); none = full-canvas graphics/b-roll
    const big = pres.filter((h) => h >= 0.18).length, small = pres.filter((h) => h > 0 && h < 0.18).length, none = pres.filter((h) => h === 0).length;
    const pc = (x) => `${Math.round((100 * x) / pres.length)}%`;
    mix = { fullFace: pc(big), faceWithGraphics: pc(small), fullCanvasNoFace: pc(none) };
  }
} catch {}
writeFileSync(join(D, "stats.json"), JSON.stringify({ duration: r3(info.duration), cuts, avgShot: r3(info.duration / (cuts.length + 1)), mix }, null, 1));
console.log(JSON.stringify({ ok: true, dir: D, duration: r3(info.duration), size: `${info.width}x${info.height}`, frames: nFrames, sheets, cuts: cuts.length, avgShot: r3(info.duration / (cuts.length + 1)), mix }));
