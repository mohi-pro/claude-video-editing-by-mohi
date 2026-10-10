// Shared helpers for the editing engine (no npm deps).
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ENGINE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(ENGINE, "..");
export const PRESETS = join(ROOT, "presets");
// the engine's own Python (made by setup): bin/python on Mac/Linux, Scripts/python.exe on Windows
export const PYTHON = [join(ENGINE, ".venv", "bin", "python"), join(ENGINE, ".venv", "Scripts", "python.exe")].find((p) => existsSync(p)) || join(ENGINE, ".venv", "bin", "python");
// noise remover (DeepFilterNet): deep-filter on Mac/Linux, deep-filter.exe on Windows. Optional: without it an FFmpeg denoiser is used.
export const DEEP_FILTER = [join(ENGINE, "bin", "deep-filter"), join(ENGINE, "bin", "deep-filter.exe")].find((p) => existsSync(p)) || null;

export const FORMATS = {
  "short-explainer": "captions-style.json",
  "short-tiktok": "tiktok-raw-style.json",
  "long-youtube": "liquid-glass-style.json",
};

export function readJSON(p, fallback) {
  if (!existsSync(p)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`missing file: ${p}`);
  }
  return JSON.parse(readFileSync(p, "utf8"));
}
export function writeJSON(p, data) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(data, null, 2) + "\n");
}

export function loadStyle(format) {
  const file = FORMATS[format];
  if (!file) throw new Error(`unknown format "${format}" — use one of: ${Object.keys(FORMATS).join(", ")}`);
  const brand = readJSON(join(PRESETS, "signature-style.json"));
  const fmt = readJSON(join(PRESETS, file));
  return { brand, fmt, format };
}

export function ffmpeg(args, opts = {}) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", opts.loglevel || "error", "-y", ...args], {
    encoding: "utf8",
    maxBuffer: 1 << 28,
  });
  if (r.status !== 0) throw new Error(`ffmpeg failed:\n${r.stderr}`);
  return r.stderr;
}

export function probe(file) {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "stream=codec_type,width,height,r_frame_rate,color_transfer:stream_side_data=rotation:format=duration", "-of", "json", file],
    { encoding: "utf8" },
  );
  const j = JSON.parse(out);
  const v = j.streams.find((s) => s.codec_type === "video");
  const a = j.streams.find((s) => s.codec_type === "audio");
  let w = v?.width, h = v?.height;
  const rot = Math.abs(Number(v?.side_data_list?.find((d) => d.rotation !== undefined)?.rotation || 0));
  if (rot === 90 || rot === 270) [w, h] = [h, w];
  const [fn, fd] = (v?.r_frame_rate || "30/1").split("/").map(Number);
  const hdr = ["arib-std-b67", "smpte2084"].includes(v?.color_transfer);
  return { duration: Number(j.format.duration), width: w, height: h, fps: fn / (fd || 1), hasAudio: !!a, hasVideo: !!v, hdr, transfer: v?.color_transfer };
}

const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
export const graphemes = (s) => [...seg.segment(s)].length;

const BN = "০১২৩৪৫৬৭৮৯";
export const toBnDigits = (s) => String(s).replace(/[0-9]/g, (d) => BN[d]);
export const fromBnDigits = (s) => String(s).replace(/[০-৯]/g, (d) => String(BN.indexOf(d)));

export function listMedia(dir, exts = /\.(mp4|mov|m4v|mkv|webm|mts)$/i) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => exts.test(f) && !f.startsWith(".")).sort().map((f) => join(dir, f));
}

export function args(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const nxt = argv[i + 1];
      if (nxt === undefined || nxt.startsWith("--")) out[k] = true;
      else { out[k] = nxt; i++; }
    } else out._.push(a);
  }
  return out;
}

export const r3 = (x) => Math.round(x * 1000) / 1000;
