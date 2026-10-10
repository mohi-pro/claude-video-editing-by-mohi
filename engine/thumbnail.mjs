#!/usr/bin/env node
// Thumbnail: best frame + huge Hind Siliguri text -> outputs/<job>.thumb.png
//
//   node engine/thumbnail.mjs <job> --text "৭৫% মানুষ *হেরে যায়*" --at 3.2 [--emoji 😱] [--size 1280x720] [--side left|right]
//
// *word* in --text gets the orange box. Keep it to 2–5 words: thumbnails are read in 0.3s.
import { existsSync, mkdirSync, writeFileSync, copyFileSync, readdirSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { spawnSync } from "node:child_process";
import { ENGINE, ROOT, readJSON, loadStyle, ffmpeg, args } from "./lib.mjs";

const A = args();
const JOB = resolve(A._[0] || "");
if (!A._[0] || !A.text) { console.error('usage: thumbnail.mjs <job> --text "..." [--at 3.2] [--emoji 😱] [--size 1280x720]'); process.exit(1); }
const name = basename(JOB);
const job = readJSON(join(JOB, "job.json"), {});
const { brand } = loadStyle(job.format || "long-youtube");
const C = brand.colors;
const [W, H] = (A.size || (job.format === "long-youtube" ? "1280x720" : "1080x1920")).split("x").map(Number);
const portrait = H > W;
const side = A.side || "left";
const OUT = join(JOB, "edit", "thumb");
mkdirSync(join(OUT, "assets"), { recursive: true });

const src = resolve(JOB, A.video || "cut/cut.mp4");
ffmpeg(["-ss", String(A.at || 1), "-i", src, "-frames:v", "1", "-vf", `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},eq=contrast=1.12:saturation=1.25:brightness=0.02,unsharp=5:5:0.8`, "-q:v", "2", join(OUT, "assets", "frame.jpg")]);
for (const f of Object.values(brand.font.files)) copyFileSync(join(ENGINE, "fonts", f), join(OUT, "assets", f));

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const text = esc(A.text).replace(/\*(.+?)\*/g, '<span class="box">$1</span>');
const fs = portrait ? 150 : Math.round(H * 0.17);
const html = `<!doctype html>
<html lang="bn"><head><meta charset="UTF-8"/><meta name="viewport" content="width=${W}, height=${H}"/>
<style>
${Object.entries(brand.font.files).map(([w, f]) => `@font-face{font-family:"${brand.font.family}";src:url("assets/${f}") format("truetype");font-weight:${w};}`).join("\n")}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:${C.bg}}
#root{position:relative;width:100%;height:100%;overflow:hidden;font-family:"${brand.font.family}",sans-serif}
#bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
#shade{position:absolute;inset:0;background:${portrait
  ? `linear-gradient(0deg, rgba(11,11,13,.95) 0%, rgba(11,11,13,.75) 32%, rgba(11,11,13,0) 60%)`
  : `linear-gradient(${side === "left" ? 90 : 270}deg, rgba(11,11,13,.96) 0%, rgba(11,11,13,.82) 38%, rgba(11,11,13,0) 66%)`}}
#txt{position:absolute;${portrait ? `left:60px;right:60px;bottom:${Math.round(H * 0.09)}px;text-align:center` : `${side}:${Math.round(W * 0.045)}px;top:50%;translate:0 -50%;width:${Math.round(W * 0.56)}px;text-align:${side}`};
  font-size:${fs}px;font-weight:700;line-height:1.12;color:${C.cream};
  text-shadow:0 6px 0 rgba(0,0,0,.55),0 14px 40px rgba(0,0,0,.6);paint-order:stroke fill;-webkit-text-stroke:2px rgba(0,0,0,.35)}
.box{color:${C.ink};background:${C.orange};padding:0 .14em;border-radius:.12em;-webkit-text-stroke:0;text-shadow:none;box-shadow:0 10px 40px rgba(255,122,26,.55)}
#emoji{position:absolute;font-size:${Math.round(fs * 1.25)}px;${portrait ? `left:50%;translate:-50% 0;bottom:${Math.round(H * 0.42)}px` : `${side === "left" ? "right" : "left"}:${Math.round(W * 0.05)}px;top:${Math.round(H * 0.08)}px`};rotate:-10deg;filter:drop-shadow(0 10px 30px rgba(0,0,0,.6))}
#bar{position:absolute;left:0;right:0;bottom:0;height:${Math.round(H * 0.018)}px;background:linear-gradient(90deg,${C.orangeDeep},${C.orange},${C.amber})}
</style></head><body>
<div id="root" data-composition-id="main" data-start="0" data-duration="1" data-width="${W}" data-height="${H}">
<img id="bg" src="assets/frame.jpg" alt=""/><div id="shade"></div>
<div id="txt">${text}</div>${A.emoji ? `<div id="emoji">${esc(A.emoji)}</div>` : ""}<div id="bar"></div>
</div>
<script>window.__timelines["main"] = gsap.timeline({ paused: true });</script>
</body></html>`;
writeFileSync(join(OUT, "index.html"), html.replace("<style>", `<script src="assets/gsap.min.js"></script>\n<style>`));
copyFileSync(join(ENGINE, "vendor", "gsap.min.js"), join(OUT, "assets", "gsap.min.js"));
const r = spawnSync("npx", ["hyperframes", "snapshot", "--at", "0.1", "--no-end", "-o", "snapshots"], { cwd: OUT, encoding: "utf8" });
const snap = existsSync(join(OUT, "snapshots")) && readdirSync(join(OUT, "snapshots")).find((f) => f.startsWith("frame-") && f.endsWith(".png"));
if (!snap) { console.error(r.stdout, r.stderr); process.exit(1); }
mkdirSync(join(ROOT, "outputs"), { recursive: true });
const out = join(ROOT, "outputs", `${name}.thumb.png`);
ffmpeg(["-i", join(OUT, "snapshots", snap), "-vf", `scale=${W}:${H}`, out]);
console.log(JSON.stringify({ ok: true, out, size: `${W}x${H}` }));
