#!/usr/bin/env node
// Build a HyperFrames composition from projects/<job>/edit/plan.json.
//
//   node engine/build.mjs <job>            -> projects/<job>/edit/hf/index.html (+ assets)
//   node engine/build.mjs <job> --check    -> also run `hyperframes lint`
//
// The plan is small and declarative (hook, emphasis, beats). Everything that makes it feel FAST —
// camera jump-zooms, punches, caption timing, SFX, flashes, progress bar — is derived automatically.
import { existsSync, mkdirSync, copyFileSync, linkSync, rmSync, writeFileSync, statSync, readFileSync } from "node:fs";
import { join, resolve, basename, extname, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { ENGINE, ROOT, PRESETS, readJSON, writeJSON, loadStyle, probe, args, r3, graphemes, toBnDigits } from "./lib.mjs";

const A = args();
const JOB = resolve(A._[0] || "");
if (!A._[0] || !existsSync(JOB)) { console.error("usage: build.mjs <projects/job>"); process.exit(1); }
const planPath = join(JOB, "edit", "plan.json");
const plan = readJSON(planPath);
const job = readJSON(join(JOB, "job.json"), {});
const format = plan.format || job.format || "short-explainer";
const { brand, fmt } = loadStyle(format);
if (plan.brand) { // one-off look for this video only — presets on disk are untouched
  Object.assign(brand.colors, plan.brand.colors || {});
  if (plan.brand.font) brand.font = plan.brand.font;
  if (plan.brand.vignette !== undefined) brand.vignette = plan.brand.vignette;
  if (plan.brand.radius !== undefined) brand.radius = plan.brand.radius;
}
const C = brand.colors;
const { width: W, height: H, fps } = fmt.canvas;
const isShort = H > W;
const warnings = [];
const warn = (m) => warnings.push(m);

const OUT = join(JOB, "edit", "hf");
const AS = join(OUT, "assets");
mkdirSync(join(AS, "fonts"), { recursive: true });
mkdirSync(join(AS, "sfx"), { recursive: true });
mkdirSync(join(AS, "media"), { recursive: true });

const place = (src, dst) => {
  if (existsSync(dst)) {
    const a = statSync(src), b = statSync(dst);
    if (a.ino === b.ino || (a.size === b.size && a.mtimeMs <= b.mtimeMs)) return;
    rmSync(dst);
  }
  try { linkSync(src, dst); } catch { copyFileSync(src, dst); }
};
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const NUMERALS = (job.lang || "bn") === "bn" ? brand.numerals : "latin";
const num = (s) => (NUMERALS === "bn" ? toBnDigits(s) : String(s));
// *word* -> orange accent, **word** -> orange box
const rich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<span class="box">$1</span>').replace(/\*(.+?)\*/g, '<span class="acc">$1</span>');

// ---------- inputs ----------
const videoSrc = resolve(JOB, plan.video || "cut/cut.mp4");
if (!existsSync(videoSrc)) throw new Error(`video not found: ${videoSrc} — run the rough cut first`);
const vinfo = probe(videoSrc);
const D0 = r3(Math.floor(vinfo.duration * fps) / fps);
const HOLD = Math.max(0, Number(plan.endHold || 0));
const D = r3(D0 + HOLD); // end hold: the last frame freezes so the final title is the last read
place(videoSrc, join(AS, "media", "aroll.mp4"));
if (Number(plan.endHold || 0) > 0) spawnSync("ffmpeg", ["-v", "error", "-y", "-sseof", "-0.08", "-i", videoSrc, "-frames:v", "1", "-q:v", "2", join(AS, "media", "endhold.jpg")]);

const corr = readJSON(join(PRESETS, "caption-corrections.json"), { words: {}, phrases: {} });
let words = readJSON(resolve(JOB, plan.transcript || "cut/transcript.json")).map((w, i) => ({ ...w, i }));
for (const w of words) {
  const m = w.text.match(/^(.*?)([.,!?।;:…]*)$/);
  if (corr.words?.[m[1]]) w.text = corr.words[m[1]] + m[2];
}
for (const [k, v] of Object.entries(plan.captionFixes || {})) if (words[k]) words[k].text = v;
for (const k of plan.hideWords || []) if (words[k]) words[k].hidden = true;

const tWord = (i, edge = "start") => {
  const w = words[Math.max(0, Math.min(words.length - 1, i))];
  return w ? w[edge] : 0;
};
const resolveTime = (b) => {
  let s = b.start ?? (b.startWord !== undefined ? tWord(b.startWord) - 0.08 : undefined);
  let e = b.end ?? (b.endWord !== undefined ? tWord(b.endWord, "end") + 0.25 : undefined);
  if (s === undefined) throw new Error(`beat needs start/startWord: ${JSON.stringify(b)}`);
  if (e === undefined) e = s + (b.duration || 2);
  s = Math.max(0, s);
  e = Math.min(D, e);
  return [r3(s), r3(e)];
};

// ---------- emphasis ----------
const normT = (t) => t.toLowerCase().replace(/[.,!?।;:"'“”‘’…]/g, "");
const emphList = (plan.emphasis || []).map(normT).filter(Boolean);
const emphIdx = new Set(plan.emphasisWords || []);
for (const w of words) {
  const n = normT(w.text);
  if (emphIdx.has(w.i) || emphList.some((e) => n === e || (e.length > 2 && n.includes(e)))) w.emph = true;
  else if (plan.autoEmphasizeNumbers !== false && /[0-9০-৯]/.test(w.text)) w.emph = true;
}

// ---------- hook ----------
const firstSentenceEnd = (() => {
  for (const w of words) if (/[.!?।]$/.test(w.text)) return w.end;
  return Math.min(D, 2.5);
})();
const hook = plan.hook === false ? null : {
  text: plan.hook?.text || words.filter((w) => w.end <= firstSentenceEnd + 0.01).map((w) => w.text).join(" "),
  highlight: (plan.hook?.highlight || []).map(normT),
  emoji: plan.hook?.emoji || "",
  sub: plan.hook?.sub || "",
  start: 0,
  end: r3(Math.min(D, plan.hook?.end ?? Math.min(Math.max(firstSentenceEnd + 0.15, 1.6), 3.2))),
  captions: !!plan.hook?.captions,
};

// a held hook must keep moving: pulse every ~1s after the words have slammed in
const hookPulses = [];
if (hook) for (let t = 1.2; t < hook.end - 0.35; t += 1.0) hookPulses.push(r3(t));

// ---------- captions -> chunks ----------
const CAP = { ...fmt.captions, ...(plan.captions || {}) };
const chunks = [];
if (CAP.enabled) {
  let cur = [];
  const push = () => { if (cur.length) chunks.push(cur); cur = []; };
  words.forEach((w, k) => {
    if (w.hidden) return;
    if (hook && !hook.captions && w.start < hook.end - 0.05) return;
    const prev = cur[cur.length - 1];
    const g = cur.reduce((s, x) => s + graphemes(x.text) + 1, 0) + graphemes(w.text);
    if (prev && (w.start - prev.end > 0.28 || cur.length >= CAP.maxWords || g > CAP.maxGraphemes || /[.!?।,;:]$/.test(prev.text) || w.emph && cur.length >= 2)) push();
    cur.push(w);
    if (w.emph && graphemes(w.text) > 7) push(); // long emphasized word owns its chunk
  });
  push();
}
// merge chunks that would flash by too fast (< minShow s) into a neighbour
{
  const minShow = CAP.minShow ?? 0.5, maxW2 = (CAP.maxWords || 3) + 2;
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i], next = chunks[i + 1];
    const dur = (next ? next[0].start : c[c.length - 1].end + 0.35) - c[0].start;
    if (dur < minShow && next && c.length + next.length <= maxW2 && next[0].start - c[c.length - 1].end < 0.3) { chunks.splice(i, 2, c.concat(next)); i--; }
  }
}
const capItems = chunks.map((ws, k) => {
  const s = ws[0].start;
  const nxt = chunks[k + 1]?.[0].start ?? D;
  const e = Math.min(nxt, ws[ws.length - 1].end + 0.35, D);
  return { s: r3(s), e: r3(Math.max(e, s + 0.2)), ws };
});

// ---------- beats ----------
const beats = (plan.beats || []).map((b) => (b.type === "swap" ? { ...b, type: "behind" } : b)).map((b, k) => {
  const [s, e] = resolveTime(b);
  const d = e - s;
  if (isShort && d > 4.5) warn(`beat #${k} (${b.type}) lasts ${d.toFixed(1)}s — shorts beats should be ≤ 3.5s to keep the speed up`);
  if (d < 0.6) warn(`beat #${k} (${b.type}) is only ${d.toFixed(2)}s`);
  const pos = b.pos || (b.type === "broll" || b.full ? "full" : fmt.graphics.zone);
  return { ...b, k, s, e, pos };
});
beats.sort((a, b) => a.s - b.s);
for (let i = capItems.length - 1; i >= 0; i--) {
  const c = capItems[i];
  if (beats.some((b) => ((b.type === "scene" && b.kinetic) || (b.type === "behind" && b.text && b.small !== false)) && c.s >= b.s - 0.05 && c.s < b.e - 0.05)) capItems.splice(i, 1);
}
const needSubject = beats.some((b) => b.type === "behind");
const subjectSrc = resolve(JOB, plan.subject || "cut/subject.webm");
if (needSubject && !existsSync(subjectSrc)) throw new Error(`behind/swap beats need the speaker cut-out — run: node engine/matte.mjs ${relative(ROOT, JOB)}`);
if (needSubject) place(subjectSrc, join(AS, "media", "subject.webm"));
for (let i = 1; i < beats.length; i++) {
  const p = beats[i - 1], b = beats[i];
  if (b.s < p.e && (b.pos === p.pos || b.pos === "full" || p.pos === "full")) {
    if (b.s - p.s >= 0.8) p.e = r3(b.s); // trim the earlier beat so the new one hard-cuts in
    else warn(`beats #${p.k} and #${b.k} start ${(b.s - p.s).toFixed(2)}s apart in the same zone — spread them out`);
  }
}

// ---------- camera shots (the speed engine) ----------
const CAM = { ...fmt.camera, ...(plan.camera || {}) };
const L = isShort ? { ...(brand.layout9x16 || {}) } : {};
// eyes on the thirds line: plan.camera.eyeY = where the eyes are in the cut footage (0..1)
if (CAM.eyeY !== undefined) CAM.originY = CAM.eyeY;
let eyeShift = CAM.eyeY !== undefined && CAM.eyesY !== undefined ? (CAM.eyesY - CAM.eyeY) * 100 : 0; // yPercent
// ---------- auto-framing ("virtual gimbal") from cut/facetrack.json ----------
// Scale around the face and ease it toward centre / the eyes line; never reveal frame edges.
let TRACK = null;
const trackFile = join(JOB, "cut", "facetrack.json");
if (CAM.autoframe !== false && existsSync(trackFile)) {
  const tj = readJSON(trackFile);
  if (tj.ok && tj.track?.length) {
    const k = CAM.autoframeStrength ?? 0.6, sMax = CAM.autoframeMaxZoom ?? 1.2, ty0 = CAM.eyesY ?? L.eyesY ?? 0.42;
    const ox = [], oy = [], tx = [], tyA = [], sc = [];
    const hsort = tj.track.map((p) => p.h).sort((a, b) => a - b), medH = hsort[Math.floor(hsort.length / 2)];
    for (const p of tj.track) {
      const wantX = k * (0.5 - p.x), wantY = k * (ty0 - p.y);
      // scale needed so the shifted, face-centred scale still covers the frame
      const need = (d, c) => (d > 0 ? 1 + d / Math.max(0.05, c) : 1 + -d / Math.max(0.05, 1 - c));
      // when the face is already big (leaning into the lens), don't zoom in further
      const cap = p.h > medH * 1.15 ? 1.04 : p.h > medH * 1.06 ? Math.min(sMax, 1.1) : sMax;
      let s = Math.min(cap, Math.max(1, need(wantX, p.x), need(wantY, p.y)));
      const clampT = (d, c) => Math.max((1 - c) * (1 - s), Math.min(c * (s - 1), d));
      ox.push(r3(p.x)); oy.push(r3(p.y)); tx.push(r3(clampT(wantX, p.x))); tyA.push(r3(clampT(wantY, p.y))); sc.push(r3(s));
    }
    TRACK = { fps: tj.fps, ox, oy, tx, ty: tyA, s: sc };
    eyeShift = 0;
    CAM.originY = ty0;
  }
}
const cutCandidates = new Set();
words.forEach((w, k) => {
  const p = words[k - 1];
  if (!p || w.start - p.end > 0.06 || /[.!?।,;:]$/.test(p.text)) cutCandidates.add(r3(w.start));
});
beats.forEach((b) => { cutCandidates.add(b.s); cutCandidates.add(b.e); });
if (hook) cutCandidates.add(hook.end);
const cands = [...cutCandidates].filter((t) => t > 0 && t < D).sort((a, b) => a - b);
const shots = [];
{
  let t = 0, i = 0;
  const minShot = Math.min(0.9, CAM.maxShot * 0.5);
  while (t < D - 0.05) {
    let best = null;
    for (const c of cands) {
      if (c < t + minShot) continue;
      if (c > t + CAM.maxShot + 0.2) break;
      if (best === null || Math.abs(c - (t + CAM.maxShot * 0.8)) < Math.abs(best - (t + CAM.maxShot * 0.8))) best = c;
    }
    const e = Math.min(D, best ?? t + CAM.maxShot);
    shots.push({ s: r3(t), e: r3(D - e < 0.4 ? D : e) });
    if (D - e < 0.4) break;
    t = e; i++;
  }
}
// beats that move the camera (side panels, explainer top cards) must start/end exactly on a shot boundary
{
  const forced = beats.filter((b) => b.pos === "side" || ((b.pos === "top" || b.pos === "pop") && CAM.beatShiftY)).flatMap((b) => [b.s, b.e]).concat(hookPulses);
  for (const t of forced) {
    const i = shots.findIndex((sh) => t > sh.s + 0.05 && t < sh.e - 0.05);
    if (i >= 0) shots.splice(i, 1, { s: shots[i].s, e: t }, { s: t, e: shots[i].e });
  }
}
// deterministic pseudo-random
let seed = 1337;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
shots.forEach((sh, i) => {
  let z = CAM.zooms[i % CAM.zooms.length];
  if (hook && sh.s < hook.end) z = Math.max(z, 1.12);
  const inBeat = beats.find((b) => sh.s >= b.s - 0.01 && sh.s < b.e && (b.pos === "side" || ((b.pos === "top" || b.pos === "pop") && CAM.beatShiftY)));
  sh.z = z;
  sh.x = r3((rnd() - 0.5) * 4 * (z - 1) * 10); // xPercent nudge, scaled by zoom
  sh.y = r3(eyeShift);
  sh.z = Math.max(sh.z, 1 + Math.abs(eyeShift) / 100 * 2.4); // never reveal frame edges
  z = sh.z;
  sh.drift = CAM.drift * (i % 2 ? 1 : -0.6);
  if (inBeat) {
    sh.z = CAM.beatZoom || 1;
    if (inBeat.pos === "side") sh.x = (CAM.beatShiftX || 0) * 100;
    else { sh.y = CAM.beatShiftY * 100; sh.x = 0; } // slide the face below the top card
  }
});

// ---------- punches & shakes ----------
const punches = [];
let lastPunch = -9;
for (const w of words) if (w.emph && w.start - lastPunch > 1.0 && (!hook || w.start > hook.end)) { punches.push(r3(w.start)); lastPunch = w.start; }
punches.push(...hookPulses);
punches.sort((a, b) => a - b);
const shakes = [0, ...beats.filter((b) => b.pos !== "side" && b.type !== "scene" && b.type !== "behind").map((b) => b.s)];

// ---------- SFX: every sound belongs to a visual event (pro kit in engine/sfx, policy below) ----------
// Captions, camera jump-cuts and emphasis punches are SILENT. Booms are rare (big reveals only).
const SFXV = brand.sfx.master;
const SP = brand.sfxPolicy || {};
const cand = []; // {t, name, vol, pri}
const want = (t, name, vol, pri = 1) => { if (name && t >= -0.2 && t < D) cand.push({ t: r3(Math.max(0, t)), name, vol, pri }); };
if (hook && plan.hook?.sfx !== false) { want(0, "boom", 0.9, 3); want(hook.end - 0.15, "swoosh", 0.5, 1); }
const titleSfx = { echo: "swoosh", glitch: "glitch", slam: "pop-click", type: "typing", marker: "scribble", split: "whoosh-fast" };
const sceneSfx = { cut: "whoosh-fast", iris: "air-zoom", whip: "whoosh-fast", wipe: "swoosh", zoom: "zoom-hit", glitch: "glitch", focus: "whoosh-soft" };
const cardSfx = { prompt: "typing", chip: "pop", terminal: "typing", text: "pop", stat: "ui-click", donut: "ui-click", bars: "tech-slide", line: "tech-slide", list: "pop", compare: "swoosh", image: "camera", map: "zoom-hit", emoji: "bubble", broll: "whoosh-fast" };
beats.forEach((b) => {
  if (b.sfx === false) return;
  if (b.sfx) { want(b.s - 0.05, b.sfx, 0.7, 2); return; }
  switch (b.type) {
    case "scene": {
      want(b.s - 0.1, b.pip ? "air-zoom" : sceneSfx[b.transition || "iris"] || "whoosh-soft", 0.6, 2);
      if (b.beam) want((b.beamAt ?? b.s + (b.e - b.s) * 0.3) + 0.25, "shine", 0.5, 1);
      if (b.zoomout) want((b.zoomAt ?? b.s + (b.e - b.s) * 0.55), "whoosh-soft", 0.45, 1);
      if (b.reveal === "split") want(b.revealAt ?? b.s + (b.e - b.s) * 0.35, "page", 0.6, 1);
      const it = b.inner?.type;
      if (it === "stat" || it === "donut") want((b.inner.countAt ?? b.s) + 1.05, "ding", 0.4, 1);
      if (it === "tryon" && b.inner.pressAt) want(b.inner.pressAt, "ui-click", 0.5, 1);
      if (it === "prompt" && b.inner.sendAt) want(b.inner.sendAt, "ui-click", 0.6, 1);
      if (it === "terminal") { want(b.s + 0.2, "typing", 0.45, 1); (b.inner.lines || []).slice(1).forEach((_, j) => want(b.s + termStep(b) * (j + 1) + 0.3, "ui-click", 0.35, 0)); }
      if (it === "list") (b.inner.items || []).forEach((_, j) => want(b.s + 0.35 + j * listStep({ ...b.inner, s: b.s, e: b.e }), "pop", 0.4, 0));
      break;
    }
    case "title": want(b.s, titleSfx[b.effect || "slam"] || "pop", 0.55, 1); if (b.mark) want(b.s + 0.35, "scribble", 0.5, 0); break;
    case "split":
      want(b.s - 0.05, "whoosh-fast", 0.5, 2);
      if (b.rightAt) want(b.rightAt, "ding", 0.4, 1);
      break;
    case "broll":
      if (b.wipeAt !== undefined) { want(b.s, "camera", 0.6, 2); want(b.wipeAt, "sparkle", 0.6, 2); }
      else want(b.s - 0.05, "whoosh-fast", 0.55, 1);
      break;
    case "behind":
      if (b.bg) want(b.s - 0.08, "whoosh-fast", 0.55, 2);
      if (b.text) want(b.s + (b.bg ? 0.12 : 0), b.boom === false ? "zoom-hit" : "boom", 0.8, 3);
      break;
    default:
      want(b.s - 0.05, cardSfx[b.type] || "pop", 0.5, 1);
      if (b.type === "stat" || b.type === "donut") want(b.s + 1.05, "ding", 0.4, 1);
      if (b.type === "list") (b.items || []).forEach((_, j) => want(b.s + 0.35 + j * listStep(b), "pop", 0.4, 0));
      if (b.type === "map") want(b.s + 0.75, "pop", 0.45, 0);
  }
});
const cta = (plan.cta ?? fmt.cta) && D > 6 ? {
  text: plan.cta?.text || ((job.lang || "bn") === "bn" ? "আরও এমন ভিডিওর জন্য ফলো করুন" : "Follow for more"),
  s: r3(Math.max(D - (plan.cta?.duration || 2.2), D * 0.6)),
  e: D,
} : null;
if (cta) want(cta.s, "bubble", 0.45, 1);
// spacing rules: nothing within minGap of a stronger sound; booms at least boomGap apart
const minGap = SP.minGap ?? 0.35, boomGap = SP.boomGap ?? 3.5;
const sfx = [];
let lastBoom = -99;
for (const c of cand.sort((x, y) => y.pri - x.pri || x.t - y.t)) {
  if (/boom/.test(c.name)) { if (c.t - lastBoom < boomGap && lastBoom >= 0) { c.name = "zoom-hit"; c.vol *= 0.8; } else lastBoom = c.t; }
  if (sfx.some((o) => Math.abs(o.t - c.t) < minGap && o.pri >= c.pri)) continue;
  sfx.push({ t: c.t, name: c.name, vol: r3(c.vol * SFXV * (SP.volume?.[c.name] ?? 1)) });
}
sfx.sort((x, y) => x.t - y.t);
function termStep(b) { return Math.max(0.2, Math.min(0.45, ((b.e - b.s) - 0.9) / Math.max(1, (b.inner?.lines || b.lines || []).length))); }
function listStep(b) { const d = (b.e ?? 0) - (b.s ?? 0); return Math.max(0.22, Math.min(0.5, (d - 0.7) / Math.max(1, (b.items || []).length))); }

const sfxDur = {};
for (const s of sfx) {
  const f = join(ENGINE, "sfx", `${s.name}.wav`);
  if (!existsSync(f)) { warn(`unknown sfx "${s.name}"`); continue; }
  place(f, join(AS, "sfx", `${s.name}.wav`));
  sfxDur[s.name] ??= probe(f).duration;
}

// ---------- fonts / vendor ----------
for (const f of Object.values(brand.font.files)) place(join(ENGINE, "fonts", f), join(AS, "fonts", f));
const DF = Object.fromEntries(Object.entries(brand.displayFonts || {}).filter(([k]) => !k.startsWith("_")));
for (const f of Object.values(DF)) place(join(ENGINE, "fonts", f.file), join(AS, "fonts", f.file));
place(join(ENGINE, "vendor", "gsap.min.js"), join(AS, "gsap.min.js"));

// ---------- beat HTML ----------
function media(src) {
  const p = resolve(JOB, src);
  if (!existsSync(p)) { warn(`missing media ${src}`); return ""; }
  const name = basename(p).replace(/[^\w.\-]/g, "_");
  place(p, join(AS, "media", name));
  return `assets/media/${name}`;
}
const fmtNum = (v, dec = 0) => num(Number(v).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }));

function beatHTML(b) {
  const id = `b${b.k}`;
  const title = b.title ? `<div class="bt-title">${rich(b.title)}</div>` : "";
  switch (b.type) {
    case "text":
      return `${b.emoji ? `<div class="bt-emoji">${esc(b.emoji)}</div>` : ""}<div class="bt-big${b.style === "outline" ? " outline" : ""}">${rich(b.text)}</div>${b.sub ? `<div class="bt-sub">${rich(b.sub)}</div>` : ""}`;
    case "stat": {
      const max = b.max ?? (b.suffix === "%" ? 100 : null);
      return `${title}<div class="bt-stat"><span class="pre">${esc(b.prefix || "")}</span><span class="val" data-to="${b.value}" data-dec="${b.decimals || 0}">${fmtNum(b.from || 0, b.decimals || 0)}</span><span class="suf">${esc(b.suffix || "")}</span></div>${b.label ? `<div class="bt-sub">${esc(b.label)}</div>` : ""}${max ? `<div class="bt-meter"><i data-frac="${Math.min(1, b.value / max)}"></i></div>` : ""}`;
    }
    case "bars": {
      const items = b.items || [];
      const mx = Math.max(...items.map((x) => x.value), 1);
      return `${title}<div class="bt-bars">${items.map((x, j) => `<div class="bar${x.highlight ? " hi" : ""}"><div class="v">${esc(x.display ?? fmtNum(x.value)) }${esc(b.unit || "")}</div><div class="col"><i style="height:${Math.max(4, (x.value / mx) * 100).toFixed(1)}%"></i></div><div class="l">${esc(x.label)}</div></div>`).join("")}</div>`;
    }
    case "line": {
      const pts = b.points || [];
      const mx = Math.max(...pts), mn = Math.min(0, ...pts);
      const VW = 900, VH = 420, P = 30;
      const xy = pts.map((v, j) => [P + (j * (VW - 2 * P)) / Math.max(1, pts.length - 1), VH - P - ((v - mn) / (mx - mn || 1)) * (VH - 2 * P)]);
      const d = xy.map(([x, y], j) => `${j ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
      const area = `${d} L${xy[xy.length - 1][0].toFixed(1)},${VH} L${xy[0][0].toFixed(1)},${VH} Z`;
      const labels = (b.labels || []).map((l, j) => `<span style="left:${((xy[j]?.[0] ?? 0) / VW * 100).toFixed(2)}%">${esc(l)}</span>`).join("");
      return `${title}<div class="bt-line"><svg viewBox="0 0 ${VW} ${VH}" preserveAspectRatio="none"><defs><linearGradient id="${id}-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.orange}" stop-opacity=".45"/><stop offset="1" stop-color="${C.orange}" stop-opacity="0"/></linearGradient></defs><path class="area" d="${area}" fill="url(#${id}-g)"/><path class="stroke" d="${d}" fill="none" stroke="${C.orange}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" pathLength="1"/>${xy.map(([x, y]) => `<circle class="dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="13" fill="${C.cream}" stroke="${C.orange}" stroke-width="6"/>`).join("")}</svg><div class="end-val">${esc(b.endLabel ?? fmtNum(pts[pts.length - 1]) + (b.unit || ""))}</div><div class="xl">${labels}</div></div>`;
    }
    case "donut": {
      const frac = Math.max(0, Math.min(1, b.value / (b.max || 100)));
      return `${title}<div class="bt-donut"><svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="80" fill="none" stroke="${C.mapLand}" stroke-width="26"/><circle class="arc" cx="100" cy="100" r="80" fill="none" stroke="${C.orange}" stroke-width="26" stroke-linecap="round" pathLength="1" transform="rotate(-90 100 100)" data-frac="${frac}"/></svg><div class="center"><span class="val" data-to="${b.value}" data-dec="${b.decimals || 0}">${num(0)}</span><span class="suf">${esc(b.suffix ?? "%")}</span></div></div>${b.label ? `<div class="bt-sub">${esc(b.label)}</div>` : ""}`;
    }
    case "list":
      return `${title}<div class="bt-list">${(b.items || []).map((x) => `<div class="li"><span class="ck">${esc(b.icon || "✓")}</span><span class="tx">${rich(x)}</span></div>`).join("")}</div>`;
    case "compare": {
      const side = (o, cls) => `<div class="side ${cls}">${o.emoji ? `<div class="em">${esc(o.emoji)}</div>` : ""}<div class="h">${esc(o.title || "")}</div>${o.text ? `<div class="t">${esc(o.text)}</div>` : ""}</div>`;
      return `${title}<div class="bt-compare">${side(b.left || {}, "bad")}<div class="vs">VS</div>${side(b.right || {}, "good")}</div>`;
    }
    case "image": {
      const src = media(b.src);
      return `<div class="bt-img"><img src="${src}" alt="" style="object-position:${esc(b.focus || "50% 50%")}"/></div>${b.caption ? `<div class="bt-cap">${esc(b.caption)}</div>` : ""}`;
    }
    case "map":
      return mapHTML(b, id);
    case "tryon": {
      const outfits = (b.outfits || ["#00D4FF", "#FFFFFF", "#FF4D6D"]).map((c, j) => `<path class="outfit" data-j="${j}" d="M78 196 Q150 168 222 196 L246 250 L224 262 L222 404 L78 404 L76 262 L54 250 Z" fill="${c}"/>`).join("");
      return `<div class="bt-tryon"><div class="ph"><div class="ph-top"><span>${esc(b.app || "ChatGPT")}</span><b>${esc(b.badge || "Try on")}</b></div><div class="ph-stage"><div class="ph-up"><span>📷</span><b>${esc(b.uploadLabel || "Upload a photo")}</b></div><svg class="ph-person" viewBox="0 0 300 420"><rect x="134" y="132" width="32" height="40" rx="10" fill="#c99a7c"/><circle cx="150" cy="96" r="50" fill="#d8ab8c"/><path d="M100 92 Q104 40 150 40 Q198 40 202 92 Q190 66 150 64 Q112 66 100 92Z" fill="#2a1d17"/>${outfits}<rect x="88" y="404" width="124" height="16" fill="#1d1d24"/></svg><div class="scan"></div></div><div class="ph-btn">${esc(b.button || "Try on")}</div></div></div>`;
    }
    case "waveform": {
      const n = b.bars || 44;
      return `<div class="bt-wave">${Array.from({ length: n }, () => "<i></i>").join("")}</div>${b.caption ? `<div class="bt-sub">${rich(b.caption)}</div>` : ""}`;
    }
    case "prompt": {
      const ls = b.lines || [b.text || ""];
      const lines = ls.map((l, j) => `<div class="pl"><span class="ptx">${esc(l)}</span>${j === ls.length - 1 ? '<span class="pr-caret"></span>' : ""}</div>`).join("");
      return `<div class="bt-prompt"><div class="pr-label">${esc(b.label || "Prompt")}</div><div class="pr-box"><div class="pr-lines">${lines}</div><div class="pr-send">↑</div></div></div>`;
    }
    case "chip":
      return `<div class="bt-chip">${b.dot !== false ? "<i></i>" : ""}<span class="${isLatin(String(b.text)) ? "f-condensed" : ""}">${rich(b.text)}</span></div>`;
    case "terminal": {
      const lines = (b.lines || []).map((l) => {
        const kind = l.startsWith(">") || l.startsWith("$") ? "cmd" : l.startsWith("✓") ? "ok" : "out";
        const txt = l.replace(/^[>$✓]\s*/, "");
        return `<div class="tl ${kind}"><span class="pfx">${kind === "cmd" ? "❯" : kind === "ok" ? "✓" : " "}</span><span class="tx" data-n="${txt.length}">${esc(txt)}</span></div>`;
      }).join("");
      return `<div class="bt-term"><div class="tb"><i></i><i></i><i></i><span>${esc(b.title || "terminal")}</span></div><div class="body">${lines}<div class="tl cur"><span class="pfx">❯</span><span class="caret"></span></div></div></div>`;
    }
    case "emoji":
      return `<div class="bt-burst">${Array.from({ length: b.count || 7 }, () => `<span>${esc(b.emoji || "🔥")}</span>`).join("")}</div>${b.text ? `<div class="bt-big">${esc(b.text)}</div>` : ""}`;
    case "title":
      return titleHTML(b);
    case "scene":
      return sceneHTML(b);
    case "broll":
      return ""; // rendered separately (video timing can't nest)
    default:
      warn(`unknown beat type "${b.type}"`);
      return `<div class="bt-big">${esc(b.text || b.type)}</div>`;
  }
}

// ---------- metaphor objects & photos ----------
function emojiAsset(ch) {
  const cps = [...ch].map((c) => c.codePointAt(0).toString(16)).filter((h) => h !== "fe0f");
  const id = cps.join("_");
  const cache = join(ENGINE, "cache", "noto", `${id}.svg`);
  if (!existsSync(cache)) {
    mkdirSync(join(ENGINE, "cache", "noto"), { recursive: true });
    const r = spawnSync("curl", ["-sSfL", "-o", cache, `https://fonts.gstatic.com/s/e/notoemoji/latest/${id}/emoji.svg`], { encoding: "utf8" });
    if (r.status !== 0) { warn(`emoji ${ch} (${id}) not available as SVG — use an image path instead`); return null; }
  }
  place(cache, join(AS, "media", `emoji-${id}.svg`));
  return `assets/media/emoji-${id}.svg`;
}
function objectSrc(o) {
  if (!o) return null;
  if (/[.\/]/.test(o) && existsSync(resolve(JOB, o))) return media(o);
  return emojiAsset(o);
}
function frameAsset(t, k) {
  const out = join(AS, "media", `frame-${k}.jpg`);
  ffmpegRun(["-ss", String(t), "-i", videoSrc, "-frames:v", "1", "-q:v", "2", out]);
  return `assets/media/frame-${k}.jpg`;
}
function ffmpegRun(a) { const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...a]); if (r.status) warn("ffmpeg failed: " + a.join(" ")); }
const PITCH = (w, h) => `<svg class="sb-pitch" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><g fill="none" stroke="rgba(255,255,255,.22)" stroke-width="4"><rect x="${w * 0.08}" y="${h * 0.04}" width="${w * 0.84}" height="${h * 0.92}"/><line x1="${w * 0.08}" y1="${h / 2}" x2="${w * 0.92}" y2="${h / 2}"/><circle cx="${w / 2}" cy="${h / 2}" r="${w * 0.17}"/><rect x="${w * 0.27}" y="${h * 0.04}" width="${w * 0.46}" height="${h * 0.13}"/><rect x="${w * 0.38}" y="${h * 0.04}" width="${w * 0.24}" height="${h * 0.05}"/><rect x="${w * 0.27}" y="${h * 0.83}" width="${w * 0.46}" height="${h * 0.13}"/><rect x="${w * 0.38}" y="${h * 0.91}" width="${w * 0.24}" height="${h * 0.05}"/><path d="M${w * 0.4} ${h * 0.17} A ${w * 0.1} ${w * 0.1} 0 0 0 ${w * 0.6} ${h * 0.17}"/><path d="M${w * 0.4} ${h * 0.83} A ${w * 0.1} ${w * 0.1} 0 0 1 ${w * 0.6} ${h * 0.83}"/></g></svg>`;
const RADAR = (w, h) => `<svg class="sb-pitch" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><g fill="none" stroke="rgba(255,255,255,.18)" stroke-width="3">${[0.12, 0.24, 0.36, 0.48, 0.6].map((r) => `<circle cx="${w / 2}" cy="${h * 0.45}" r="${w * r}"/>`).join("")}<line x1="0" y1="${h * 0.45}" x2="${w}" y2="${h * 0.45}"/><line x1="${w / 2}" y1="0" x2="${w / 2}" y2="${h}"/></g></svg>`;

// ---------- stylish titles + scenes ----------
const isLatin = (t) => /^[\x00-\x7F‘’“”–—…•]*$/.test(t);
const fontKey = (b, def) => (b.font && (b.font === "bangla" || DF[b.font]) ? b.font : def);
// English text animates per letter; Bangla per word (splitting Bangla glyph clusters breaks shaping)
function splitText(t) {
  if (isLatin(t.replace(/\*/g, ""))) return t.split(/(\*[^*]+\*)/).filter(Boolean).map((seg) => {
    const acc = /^\*.*\*$/.test(seg);
    return [...(acc ? seg.slice(1, -1) : seg)].map((c) => `<span class="ch${acc ? " acc" : ""}">${c === " " ? "&nbsp;" : esc(c)}</span>`).join(""); // a lone space in an inline-block collapses: keep word gaps
  }).join("");
  return t.split(/\s+/).map((w) => `<span class="ch">${rich(w)}</span>`).join(" ");
}
function titleHTML(b) {
  const text = String(b.text || "");
  const latin = isLatin(text.replace(/\*/g, ""));
  const fk = fontKey(b, latin ? "display" : "bangla");
  const fx = b.effect || (latin ? "echo" : "slam");
  const color = { cream: "var(--cream)", orange: "var(--orange)", ink: "var(--ink)" }[b.color || "cream"] || b.color;
  const em = { display: 0.47, condensed: 0.4, marker: 0.62, serif: 0.52, bangla: 0.55 }[fk] || 0.5;
  const maxW = W * (1 - 2 * (L.safeX ?? 0.05));
  const longest = latin ? text.replace(/\*/g, "").length : Math.max(...text.split(/\s+/).map((w) => graphemes(w))) * 1.6;
  const size = b.wrap ? (b.size || 110) : Math.round(Math.min(b.size || (fk === "bangla" ? 120 : fk === "serif" ? 130 : fk === "marker" ? 140 : 190), maxW / (longest * em)));
  const layers = [];
  if (fx === "marker") layers.push(`<div class="t-mark"></div>`);
  if (fx === "echo") for (let i = 0; i < 3; i++) layers.push(`<div class="t-echo f-${fk}">${esc(text)}</div>`);
  if (fx === "glitch") layers.push(`<div class="t-glitch r f-${fk}">${esc(text)}</div>`, `<div class="t-glitch c f-${fk}">${esc(text)}</div>`);
  const body = b.wrap
    ? text.split(/(\*[^*]+\*)/).filter(Boolean).flatMap((seg) => { const acc = /^\*.*\*$/.test(seg); return seg.replace(/\*/g, "").split(/\s+/).filter(Boolean).map((w) => `<span class="ch${acc ? " acc" : ""}">${esc(w)}</span>`); }).join(" ")
    : splitText(text);
  layers.push(`<div class="t-main f-${fk}${latin ? "" : " bn"}${b.wrap ? " wrap" : ""}">${body}${fx === "type" ? '<span class="t-caret"></span>' : ""}</div>`);
  const sub = b.sub ? `<div class="t-sub f-${fontKey({ font: b.subFont }, isLatin(b.sub) ? "condensed" : "bangla")}">${rich(b.sub)}</div>` : "";
  if (b.mark === "circle") layers.push(`<svg class="t-markpath" viewBox="0 0 100 40" preserveAspectRatio="none"><path pathLength="1" d="M8 22 C 6 8, 40 2, 62 4 S 98 12, 94 24 S 60 40, 34 37 S 2 30, 10 16 L 16 12"/></svg>`);
  if (b.mark === "underline") layers.push(`<div class="t-under"></div>`);
  return `<div class="beat-inner title-wrap fx-${fx}" style="--ty:${((b.y ?? L.titleY ?? 0.3) * H).toFixed(0)}px;--tsize:${size}px;--tcolor:${color};--techo:${b.echoColor || "var(--orange)"};--tilt:${b.tilt ?? (fx === "marker" ? -2 : 0)}deg"><div class="t-stack">${layers.join("")}</div>${sub}</div>`;
}
function sceneHTML(b) {
  if (b.object || b.photo || b.kinetic) return metaphorHTML(b);
  const bg = b.bg || "dark";
  const ink = bg === "orange" || bg === "cream" || bg === "paper";
  const parts = [];
  if (b.logo || b.logoText) {
    const lp = b.logo && existsSync(resolve(JOB, b.logo)) ? media(b.logo) : null;
    parts.push(lp ? `<img class="sc-logo" src="${lp}" alt=""/>` : `<div class="sc-wordmark">${esc(b.logoText || "")}</div>`);
    if (b.logo && !lp) warn(`logo not found yet: ${b.logo} — showing the wordmark "${b.logoText}"`);
  }
  if (b.icon) parts.push(`<div class="sc-icon">${esc(b.icon)}</div>`);
  if (b.kicker) { const ks = Math.round(Math.min(190, (W * (1 - 2 * (L.safeX ?? 0.05))) / (String(b.kicker).length * 0.47))); parts.push(`<div class="sc-kicker f-${fontKey({ font: b.kickerFont }, "display")}" style="--ks:${ks}px"><div class="k-echo">${esc(b.kicker)}</div><div class="k-echo">${esc(b.kicker)}</div><div class="k-main">${splitText(b.kicker)}</div></div>`); }
  if (b.text) parts.push(`<div class="sc-head"${b.headSize ? ` style="font-size:${b.headSize}px"` : ""}>${String(b.text).split(/\s+/).map((w) => `<span class="hw2">${rich(w).replace(/~/g, "&nbsp;")}</span>`).join(" ")}</div>`);
  if (b.en) parts.push(`<div class="sc-en f-${fontKey({ font: b.enFont }, "marker")}">${esc(b.en)}</div>`);
  if (b.inner) parts.push(`<div class="sc-panel type-${b.inner.type}">${beatHTML({ ...b.inner, k: `${b.k}i` })}</div>`);
  const pip = b.pip === "bubble";
  const sT = L.safeTop ?? 0.08, capY = CAP.enabled ? (CAP.y ?? 0.8) : 0.9;
  if (pip) {
    // headline in the text-hook band, face bubble on the eye line, English line between bubble and captions
    const bubBottom = (L.bubbleY ?? 0.5) + (L.bubbleR ?? 185) / H + 0.012;
    const top = parts.filter((x) => !x.startsWith('<div class="sc-en') && !x.startsWith('<div class="sc-panel'));
    const bot = parts.filter((x) => x.startsWith('<div class="sc-en'));
    return `<div class="beat-inner scene-content pip${ink ? " ink" : ""}" style="--sc-top:${(sT * H).toFixed(0)}px;--sc-bottom:${((1 - ((L.bubbleY ?? 0.5) - (L.bubbleR ?? 185) / H - 0.01)) * H).toFixed(0)}px">${top.join("")}</div>`
      + (bot.length ? `<div class="beat-inner scene-bot${ink ? " ink" : ""}" style="top:${(bubBottom * H).toFixed(0)}px;height:${((capY - 0.045 - bubBottom) * H).toFixed(0)}px">${bot.join("")}</div>` : "");
  }
  return `<div class="beat-inner scene-content${ink ? " ink" : ""}${bg === "paper" || bg === "cream" ? " light-bg" : ""}${String(bg).startsWith("pattern:") ? " on-pattern" : ""}" style="--sc-top:${(sT * H).toFixed(0)}px;--sc-bottom:${((1 - capY + 0.05) * H).toFixed(0)}px">${parts.join("")}</div>`;
}
// The "visual-metaphor explainer": object cut-outs, split photo reveal, size-contrast kinetic type, beam, zoom-out
function metaphorHTML(b) {
  const bg = b.bg || "paper";
  const ink = bg === "paper" || bg === "cream" || bg === "orange";
  const cy = (b.objectY ?? 0.47) * H, cx = W / 2;
  const os = b.objectSize ?? 0.42; // object width as fraction of canvas width
  const ow = W * os, oh = ow;
  const parts = [];
  // connector lines + split photo
  if (b.photo) {
    const src = b.photo.src ? media(b.photo.src) : frameAsset(b.photo.frame ?? b.s, b.k);
    const fw = W * (b.photo.width ?? 0.5), fh = fw * (b.photo.aspect ?? 1.3);
    const d = b.reveal === "split" ? ow / 2 + fw * 0.12 : 0;
    const L = [[cx - d, cy - fh / 2, cx - ow * 0.32, cy - oh * 0.3], [cx - d, cy + fh / 2, cx - ow * 0.32, cy + oh * 0.3], [cx + d, cy - fh / 2, cx + ow * 0.32, cy - oh * 0.3], [cx + d, cy + fh / 2, cx + ow * 0.32, cy + oh * 0.3]];
    if (b.reveal === "split") parts.push(`<svg class="mx-lines" viewBox="0 0 ${W} ${H}">${L.map(([x1, y1, x2, y2]) => `<line x1="${x1.toFixed(0)}" y1="${y1.toFixed(0)}" x2="${x2.toFixed(0)}" y2="${y2.toFixed(0)}" pathLength="1"/>`).join("")}</svg>`);
    const half = (side) => `<div class="mx-half ${side}" style="width:${(fw / 2).toFixed(0)}px;height:${fh.toFixed(0)}px"><img src="${src}" alt="" style="width:${fw.toFixed(0)}px;height:${fh.toFixed(0)}px;${side === "r" ? `left:${(-fw / 2).toFixed(0)}px` : "left:0"}"/></div>`;
    parts.push(`<div class="mx-photo${b.mono !== false ? " mono" : ""}" data-split="${d.toFixed(0)}" style="left:${(cx - fw / 2).toFixed(0)}px;top:${(cy - fh / 2).toFixed(0)}px;width:${fw.toFixed(0)}px;height:${fh.toFixed(0)}px">${half("l")}${half("r")}<div class="mx-outline"></div></div>`);
  }
  if (b.plate) parts.push(`<div class="mx-plate" style="left:${cx}px;top:${cy}px;width:${(ow * 1.55).toFixed(0)}px;height:${(ow * 1.55).toFixed(0)}px"></div>`);
  if (b.beam) parts.push(`<div class="mx-beam" style="left:${cx}px;top:${cy}px"></div>`);
  const osrc = objectSrc(b.object);
  if (osrc) parts.push(`<div class="mx-obj${b.mono ? " mono" : ""}" style="left:${(cx - ow / 2).toFixed(0)}px;top:${(cy - oh / 2).toFixed(0)}px;width:${ow.toFixed(0)}px;height:${oh.toFixed(0)}px"><img src="${osrc}" alt=""/><div class="mx-ht" style="-webkit-mask-image:url(${osrc});mask-image:url(${osrc})"></div></div>`);
  // kinetic size-contrast typography synced to the words
  if (b.kinetic) {
    const kz = typeof b.kinetic === "object" ? b.kinetic : {};
    const a = kz.startWord ?? b.startWord, z = kz.endWord ?? b.endWord;
    const keys = (kz.key || []).map(normT);
    const ws = a !== undefined ? words.slice(a, (z ?? a) + 1) : [];
    // phrase groups: each group ends on a key word; only one group is on screen at a time
    const groups = [[]];
    ws.forEach((w) => {
      const isKey = keys.some((k) => normT(w.text).includes(k));
      const strike = kz.strike && normT(w.text).includes(normT(kz.strike.word));
      const strikeT = strike ? (words.find((x) => x.start > w.start && normT(x.text).includes(normT(kz.strike.at || ""))) || w).start : 0;
      groups[groups.length - 1].push(`<span class="kw${isKey ? " key" : ""}${strike ? " strike" : ""}" data-t0="${r3(w.start)}"${strike ? ` data-ts="${r3(strikeT)}"` : ""}>${esc(w.text.replace(/[,।.]$/, ""))}${strike ? '<i class="sk"></i>' : ""}</span>`);
      if (isKey) groups.push([]);
    });
    const gs = groups.filter((g) => g.length);
    // trailing words after the last key join the last group
    if (gs.length > 1 && !gs[gs.length - 1].some((x) => x.includes(" key"))) gs[gs.length - 2].push(...gs.pop());
    parts.push(`<div class="mx-kin" style="top:${((kz.y ?? 0.17) * H).toFixed(0)}px">${gs.map((g) => `<div class="kg">${g.join(" ")}</div>`).join("")}</div>`);
  }
  if (b.beamText) parts.push(`<div class="mx-beamtext f-${fontKey({ font: b.beamFont }, isLatin(b.beamText) ? "display" : "bangla")}">${rich(b.beamText)}</div>`);
  return `<div class="beat-inner mx-stage${ink ? " ink" : " light"}">${b.horizon ? `<div class="mx-horizon" style="top:${cy}px"></div>` : ""}${parts.join("")}</div>`;
}
function sceneBG(b) {
  if (String(b.bg || "").startsWith("pattern:")) {
    const L2 = bgLayer(b.bg, b.k);
    return `<div id="sbg${b.k}" class="scene-bg bg-orange over" data-s="${b.s}" data-e="${b.e}" data-k="${b.k}">${L2.html}</div>`;
  }
  const bg = b.bg || "dark";
  const deco = [];
  if (bg === "dark") deco.push(`<div class="sb-blob a"></div><div class="sb-blob b"></div>`);
  if (bg === "cream") deco.push(`<div class="sb-dots"></div>`);
  if (bg === "grid") deco.push(`<div class="sb-floorwrap"><div class="sb-floor"></div></div><div class="sb-blob a" style="opacity:.3"></div>`);
  if (bg === "paper" || bg === "chalk") deco.push(`<div class="sb-grain"></div><div class="sb-vig"></div>`);
  if (b.backdrop === "pitch") deco.push(PITCH(W, H));
  if (b.backdrop === "radar") deco.push(RADAR(W, H));
  if (bg === "blur") deco.push(`<video id="sbv${b.k}" class="sb-video clip" src="assets/media/aroll.mp4" data-start="${b.s}" data-duration="${r3(b.e - b.s)}" data-media-start="${b.s}" data-track-index="2" muted playsinline></video><div class="sb-tint"></div>`);
  const mq = b.marquee ?? (!b.object && !b.photo && b.kicker && isLatin(b.kicker) ? b.kicker : null);
  if (mq) {
    const row = Array(6).fill(esc(mq)).join(" • ");
    deco.push(`<div class="sb-marquee"><div class="sb-row">${row}</div><div class="sb-row">${row}</div><div class="sb-row">${row}</div></div>`);
  }
  return `<div id="sbg${b.k}" class="scene-bg bg-${bg} ${b.pip === "bubble" ? "under" : "over"}" data-s="${b.s}" data-e="${b.e}" data-k="${b.k}">${deco.join("")}</div>`;
}

// ---------- behind-the-speaker layers: background swap + giant keyword behind the body ----------
const FLAGS = {
  BD: (w, h) => `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice"><rect width="${w}" height="${h}" fill="#006a4e"/><circle cx="${w * 0.45}" cy="${h * 0.42}" r="${w * 0.3}" fill="#f42a41"/></svg>`,
  IN: (w, h) => `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice"><rect width="${w}" height="${h / 3}" fill="#ff9933"/><rect y="${h / 3}" width="${w}" height="${h / 3}" fill="#fff"/><rect y="${(2 * h) / 3}" width="${w}" height="${h / 3}" fill="#138808"/><circle cx="${w / 2}" cy="${h / 2}" r="${h * 0.12}" fill="none" stroke="#000080" stroke-width="${h * 0.012}"/></svg>`,
  US: (w, h) => `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice">${Array.from({ length: 13 }, (_, i) => `<rect y="${(i * h) / 13}" width="${w}" height="${h / 13 + 1}" fill="${i % 2 ? "#fff" : "#b22234"}"/>`).join("")}<rect width="${w * 0.6}" height="${(h * 7) / 13}" fill="#3c3b6e"/>${Array.from({ length: 30 }, (_, i) => `<circle cx="${((i % 6) + 0.6) * w * 0.095}" cy="${(Math.floor(i / 6) + 0.6) * h * 0.1}" r="${w * 0.018}" fill="#fff"/>`).join("")}</svg>`,
};
function bgLayer(spec, k) {
  const sp = String(spec || "dark");
  const [kind, val] = sp.includes(":") ? [sp.slice(0, sp.indexOf(":")), sp.slice(sp.indexOf(":") + 1)] : [sp, ""];
  if (kind === "image") return { cls: "bg-dark", html: `<img class="bh-img" src="${media(val)}" alt=""/><div class="bh-shade"></div>` };
  if (kind === "gradient") { const [c1, c2] = val.split(","); return { cls: "", html: `<div class="bh-fill" style="background:linear-gradient(160deg,${c1},${c2 || "#0b0b0d"})"></div>` }; }
  if (kind === "flag") return { cls: "", html: `<div class="bh-flag">${(FLAGS[val.toUpperCase()] || FLAGS.BD)(W, H)}</div><div class="bh-shade"></div>` };
  if (kind === "map") return { cls: "bg-chalk", html: `<div class="bh-map">${mapHTML({ country: val, zoom: 1.6 }, `bh${k}`)}</div><div class="bh-shade"></div>` };
  if (kind === "pattern") {
    const ems = [...new Intl.Segmenter().segment(val)].map((x) => x.segment).filter((x) => x.trim());
    let sd = 7 + k; const rr = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    const cells = [];
    for (let r = 0; r < 9; r++) for (let c = 0; c < 5; c++) {
      const src = emojiAsset(ems[(r * 5 + c) % ems.length]);
      if (src) cells.push(`<img class="pt" src="${src}" style="left:${(c * 22 + (r % 2) * 11 - 6 + rr() * 4).toFixed(1)}%;top:${(r * 11.5 - 4 + rr() * 3).toFixed(1)}%;rotate:${((rr() - 0.5) * 40).toFixed(0)}deg" alt=""/>`);
    }
    return { cls: "bg-orange", html: `<div class="bh-pattern">${cells.join("")}</div><div class="bh-shade soft"></div>` };
  }
  const deco = kind === "grid" ? `<div class="sb-floorwrap"><div class="sb-floor"></div></div>` : kind === "paper" || kind === "chalk" ? `<div class="sb-grain"></div><div class="sb-vig"></div>` : kind === "dark" ? `<div class="sb-blob a"></div><div class="sb-blob b"></div>` : "";
  return { cls: `bg-${kind}`, html: deco };
}
function behindHTML(b) {
  const parts = [];
  if (b.bg) { const L2 = bgLayer(b.bg, b.k); parts.push(`<div class="bh-bg ${L2.cls}">${L2.html}</div>`); }
  if (b.text) {
    const text = String(b.text);
    const latin = isLatin(text);
    const fk = fontKey(b, latin ? "display" : "bangla");
    const em = { display: 0.47, condensed: 0.4, marker: 0.62, serif: 0.52, bangla: 0.6 }[fk] || 0.5;
    const longest = latin ? text.length : graphemes(text) * 1.5; // one line (nowrap): fit the whole text
    const size = Math.round(Math.min(b.size || (latin ? 330 : 240), (W * 0.94) / (longest * em)));
    const ws = words.filter((w) => w.start >= b.s - 0.05 && w.start < b.e - 0.05);
    const small = b.small === false ? "" : b.small ? `<div class="bh-small">${rich(b.small)}</div>`
      : ws.length ? `<div class="bh-small">${ws.map((w) => `<span class="sw" data-t0="${r3(w.start)}">${esc(w.text.replace(/[,।.]$/, ""))}</span>`).join(" ")}</div>` : "";
    parts.push(`<div class="bh-text color-${b.color || "gradient"}" style="top:${((b.y ?? 0.6) * H).toFixed(0)}px">${small}<div class="bh-big f-${fk}${latin ? "" : " bn"}" style="font-size:${size}px">${splitText(text)}</div></div>`);
  }
  if (b.card) parts.push(behindCardHTML(b));
  return parts.join("");
}
// glossy glass card + floating shapes behind the speaker (the cut-out sits on top, so hair overlaps it)
function behindCardHTML(b) {
  const c = b.card;
  const items = (c.items || []).map((it, j) => {
    const [txt, t] = Array.isArray(it) ? it : [it, b.s + 0.3 + j * 0.5];
    return `<div class="bhc-row" data-t="${r3(t)}"><span class="bhc-ic">${esc(c.icon || "✕")}</span><span class="bhc-it">${rich(txt)}</span></div>`;
  }).join("");
  const title = c.title ? String(c.title) : "";
  const tl = title && isLatin(title.replace(/\*/g, ""));
  const tsize = Math.round(Math.min(c.size || 128, (W * (c.w ?? 0.74) * 0.82) / Math.max(1, ((tl ? title.length : graphemes(title) * 1.5) + (c.badge ? 1.7 : 0)) * (tl ? 0.47 : 0.6))));
  const head = (c.kicker ? `<div class="bhc-kick f-condensed">${esc(c.kicker)}</div>` : "")
    + (title ? `<div class="bhc-title ${tl ? "f-display" : "bn"}" style="font-size:${tsize}px">${c.badge ? `<span class="bhc-badge">${esc(c.badge)}</span>` : ""}${splitText(title)}</div>` : "")
    + (c.sub ? `<div class="bhc-sub">${rich(c.sub)}</div>` : "");
  const shapes = '<i class="bhc-orb o1"></i><i class="bhc-orb o2"></i><i class="bhc-ring"></i><i class="bhc-dot d1"></i><i class="bhc-dot d2"></i>';
  return `<div class="bh-card" style="left:${((c.x ?? 0.5) * 100).toFixed(1)}%;top:${((c.y ?? 0.215) * H).toFixed(0)}px;width:${Math.round((c.w ?? 0.74) * W)}px">${shapes}<div class="bhc-glass" style="padding-bottom:${36 + (c.tail || 0)}px">${head}${items ? `<div class="bhc-rows">${items}</div>` : ""}</div></div>`;
}

// 30 fps loudness envelope of the voice (0..1), for audio-reactive waveforms
function voiceEnvelope() {
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", videoSrc, "-vn", "-ac", "1", "-ar", "12000", "-f", "s16le", "-"], { maxBuffer: 1 << 28 });
  if (r.status !== 0) return null;
  const b = r.stdout, hop = 400, out = [];
  for (let i = 0; i + hop * 2 <= b.length; i += hop * 2) { let e = 0; for (let j = 0; j < hop; j++) { const v = b.readInt16LE(i + j * 2) / 32768; e += v * v; } out.push(Math.sqrt(e / hop)); }
  const mx = Math.max(...out, 1e-6);
  return out.map((v) => r3(Math.min(1, Math.pow(v / mx, 0.7))));
}

// ---------- maps (world-atlas topojson -> SVG) ----------
let TOPO = null;
function countries() {
  if (TOPO) return TOPO;
  const topo = readJSON(join(ENGINE, "data", "countries-50m.json"));
  const { scale: [sx, sy], translate: [tx, ty] } = topo.transform;
  const arcs = topo.arcs.map((arc) => { let x = 0, y = 0; return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty]; }); });
  const ring = (idx) => { const pts = []; for (const i of idx) { const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i]; pts.push(...(pts.length ? a.slice(1) : a)); } return pts; };
  TOPO = topo.objects.countries.geometries.map((g) => ({
    name: g.properties?.name || "",
    polys: g.type === "Polygon" ? [g.arcs.map(ring)] : g.type === "MultiPolygon" ? g.arcs.map((p) => p.map(ring)) : [],
  }));
  return TOPO;
}
const bboxOf = (pts) => pts.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
function mapHTML(b, id) {
  const all = countries();
  const names = [].concat(b.country || b.countries || []).map((s) => s.toLowerCase());
  const hi = all.filter((c) => names.includes(c.name.toLowerCase()));
  if (names.length && !hi.length) warn(`map: country not found: ${names.join(", ")} (use English names as in Natural Earth, e.g. "Bangladesh", "United States of America")`);
  const pins = b.pins || [];
  // focus bbox: largest polygon of each highlighted country + pins
  let pts = [];
  for (const c of hi) { const big = c.polys.reduce((m, p) => (p[0].length > m[0].length ? p : m), c.polys[0]); pts.push(...big[0]); }
  for (const p of pins) pts.push([p.lon, p.lat]);
  if (!pts.length) pts = [[88, 22], [92.7, 26.6]];
  let [x0, y0, x1, y1] = bboxOf(pts);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const k = Math.cos((cy * Math.PI) / 180);
  const VW = 1000, VH = 760;
  const zoom = b.zoom || 2.4;
  let spanX = Math.max((x1 - x0) * k, 1.5) * zoom, spanY = Math.max(y1 - y0, 1.2) * zoom;
  if (spanX / spanY > VW / VH) spanY = (spanX * VH) / VW; else spanX = (spanY * VW) / VH;
  const proj = ([lon, lat]) => [((lon - cx) * k / spanX + 0.5) * VW, ((cy - lat) / spanY + 0.5) * VH];
  const view = [cx - spanX / k, cy - spanY, cx + spanX / k, cy + spanY];
  const pathOf = (polys) => polys.map((poly) => poly.map((r) => "M" + r.map((p) => proj(p).map((v) => v.toFixed(1)).join(",")).join("L") + "Z").join("")).join("");
  const visible = all.filter((c) => c.polys.some((p) => { const [a, bb, c2, d] = bboxOf(p[0]); return c2 >= view[0] && a <= view[2] && d >= view[1] && bb <= view[3]; }));
  const land = visible.filter((c) => !hi.includes(c)).map((c) => `<path d="${pathOf(c.polys)}"/>`).join("");
  const his = hi.map((c) => `<path class="hi" d="${pathOf(c.polys)}" pathLength="1"/>`).join("");
  const pinXY = pins.map((p) => proj([p.lon, p.lat]));
  const route = b.route && pinXY.length >= 2 ? `<path class="route" pathLength="1" d="${pinXY.map(([x, y], j) => { if (!j) return `M${x.toFixed(1)},${y.toFixed(1)}`; const [px, py] = pinXY[j - 1]; const mx = (px + x) / 2, my = Math.min(py, y) - Math.hypot(x - px, y - py) * 0.35; return `Q${mx.toFixed(1)},${my.toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}`; }).join(" ")}"/>` : "";
  const pinEls = pins.map((p, j) => `<div class="pin" style="left:${(pinXY[j][0] / VW * 100).toFixed(2)}%;top:${(pinXY[j][1] / VH * 100).toFixed(2)}%"><i></i>${p.label ? `<span>${esc(p.label)}</span>` : ""}</div>`).join("");
  const label = b.label ? `<div class="map-label">${esc(b.label)}</div>` : "";
  return `${b.title ? `<div class="bt-title">${esc(b.title)}</div>` : ""}<div class="bt-map"><div class="map-cam"><svg viewBox="0 0 ${VW} ${VH}" preserveAspectRatio="xMidYMid slice"><g class="land" fill="${C.mapLand}" stroke="${C.mapStroke}" stroke-width="1.5">${land}</g><g class="hig">${his}</g>${route}</svg>${pinEls}</div>${label}</div>`;
}

// ---------- assemble ----------
const underEls = beats.filter((b) => b.type === "scene" && b.pip === "bubble").map(sceneBG).join("\n      ");
const duckPts = [];
for (const b of beats.filter((x) => x.type === "broll" && x.audio)) {
  const w = b.wipeAt ?? b.e;
  duckPts.push([b.s - 0.03, 1], [b.s, 0], [w, 0], [w + 0.15, 1]);
}
const arollAuto = duckPts.length ? ` data-automation='{"version":1,"lanes":[{"target":"volume","points":[{"t":0,"v":1},${duckPts.map(([t, v]) => `{"t":${r3(Math.max(0, t))},"v":${v}}`).join(",")}]}]}'` : "";
const behindEls = beats.filter((b) => b.type === "behind").map((b) =>
  `<section id="b${b.k}" class="behind clip" data-start="${b.s}" data-duration="${r3(b.e - b.s)}" data-track-index="1" data-type="behind" data-k="${b.k}">${behindHTML(b)}</section>`).join("");
const subjEls = beats.filter((b) => b.type === "behind").map((b) =>
  `<video id="subj${b.k}" class="subj" src="assets/media/subject.webm" data-start="${b.s}" data-duration="${r3(b.e - b.s)}" data-media-start="${b.s}" data-track-index="2" muted playsinline></video>`).join("");
const beatEls = beats.filter((b) => b.type !== "behind").map((b) => {
  if (b.type === "scene") {
    const bgEl = b.pip === "bubble" ? "" : sceneBG(b);
    const vf = b.viewfinder ? `<div class="vf"><i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i><div class="vf-rec"><b></b>REC</div><div class="vf-tc">00:00:00:00</div></div>` : "";
    return `${bgEl}<section id="b${b.k}" class="beat clip pos-full type-scene" data-start="${b.s}" data-duration="${r3(b.e - b.s)}" data-track-index="3" data-type="scene" data-k="${b.k}">${beatHTML(b)}${vf}</section>`;
  }
  if (b.type === "split") {
    const wordAt = (k) => { const first = normT(k.split(/\s+/).pop()); const w = words.find((x) => x.start >= b.s && normT(x.text) === first || x.start >= b.s && normT(x.text).startsWith(first)); return w ? r3(w.start) : ""; };
    const hl = (t, keys) => { let h = esc(t); for (const k of keys || []) h = h.split(esc(k)).join(`<span class="hl" data-t="${wordAt(k)}">${esc(k)}</span>`); return h; };
    const side = (o, cls, icon) => `<div class="sp-side ${cls}"><div class="sp-ic">${icon}</div><div class="sp-tag">${esc(o.tag || "")}</div><div class="sp-tx">${hl(o.text || "", o.highlight)}</div></div>`;
    return `<section id="b${b.k}" class="beat clip pos-full type-split" data-start="${b.s}" data-duration="${r3(b.e - b.s)}" data-track-index="3" data-type="split" data-k="${b.k}"><div class="beat-inner sp-wrap">${side(b.left || {}, "bad", "✕")}${side(b.right || {}, "good", "✓")}<div class="sp-div"></div></div></section>`;
  }
  if (b.type === "title") {
    return `<section id="b${b.k}" class="beat clip pos-free type-title" data-start="${b.s}" data-duration="${r3(b.e - b.s)}" data-track-index="3" data-type="title" data-k="${b.k}">${beatHTML(b)}</section>`;
  }
  if (b.type === "broll") {
    const src = media(b.src);
    // before/after reveal: `wipeAt` sweeps the raw layer away; `audio: true` plays its own sound instead of the voice
    const d = r3(b.e - b.s), w = b.wipeAt !== undefined ? r3(b.wipeAt - b.s) : null;
    const auto = b.audio && w !== null ? ` data-automation='{"version":1,"lanes":[{"target":"volume","points":[{"t":0,"v":1},{"t":${r3(w)},"v":1},{"t":${r3(w + 0.15)},"v":0}]}]}'` : "";
    const media_ = b.audio ? `data-has-audio="true"${auto}` : "muted";
    const labels = (b.label ? `<div class="br-label before"><i></i>${esc(b.label)}</div>` : "") + (b.afterLabel ? `<div class="br-label after">${esc(b.afterLabel)}</div>` : "");
    return `<div id="b${b.k}" class="broll${w !== null ? " wipe" : ""}" data-s="${b.s}" data-e="${b.e}" data-w="${w ?? ""}" data-type="broll"><div class="br-media"><video id="b${b.k}-v" class="clip" src="${src}" data-start="${b.s}" data-duration="${d}" data-media-start="${b.mediaStart ?? 0}" data-track-index="3" ${media_} playsinline></video></div>${w !== null ? '<div class="br-line"></div>' : ""}${labels}</div>`;
  }
  const cardStyle = [b.top !== undefined ? `top:${(b.top * H).toFixed(0)}px` : "", b.height !== undefined ? `height:${(b.height * H).toFixed(0)}px` : ""].filter(Boolean).join(";");
  return `<section id="b${b.k}" class="beat clip pos-${b.pos} type-${b.type}" data-start="${b.s}" data-duration="${r3(b.e - b.s)}" data-track-index="3" data-type="${b.type}" data-k="${b.k}"><div class="beat-inner card${(b.height ?? plan.graphics?.height ?? fmt.graphics.height) < 0.23 ? " compact" : ""}"${cardStyle ? ` style="${cardStyle}"` : ""}>${beatHTML(b)}</div></section>`;
}).join("\n      ");

const hookHTML = hook ? (() => {
  const ws = hook.text.split(/\s+/).filter(Boolean);
  const spans = ws.map((t) => `<span class="hw${hook.highlight.some((h) => normT(t).includes(h)) ? " hl" : ""}">${esc(t)}</span>`).join(" ");
  return `<section id="hook" class="clip style-${fmt.hook.style}" data-start="0" data-duration="${hook.end}" data-track-index="4"><div class="hook-scrim"></div><div class="hook-inner">${hook.emoji ? `<div class="hook-emoji">${esc(hook.emoji)}</div>` : ""}<div class="hook-text">${spans}</div>${hook.sub ? `<div class="hook-sub">${esc(hook.sub)}</div>` : ""}</div></section>`;
})() : "";

const capHTML = capItems.map((c, k) => `<div id="c${k}" class="cap clip" data-start="${c.s}" data-duration="${r3(c.e - c.s)}" data-track-index="5"><div class="cap-inner">${c.ws.map((w) => `<span class="w${w.emph ? " em" : ""}" data-t0="${r3(w.start)}" data-t1="${r3(w.end)}">${esc(w.text)}</span>`).join(" ")}</div></div>`).join("\n      ");

const laneEnd = [];
const sfxHTML = sfx.filter((s) => sfxDur[s.name]).sort((a, b) => a.t - b.t).map((s, k) => {
  const d = r3(Math.min(sfxDur[s.name], D - s.t));
  let lane = laneEnd.findIndex((e) => e <= s.t);
  if (lane < 0) { lane = laneEnd.length; laneEnd.push(0); }
  laneEnd[lane] = s.t + d + 0.01;
  return `<audio id="sfx${k}" src="assets/sfx/${s.name}.wav" data-start="${s.t}" data-duration="${d}" data-track-index="${20 + lane}" data-volume="${s.vol}"></audio>`;
}).join("\n      ");


const ctaHTML = cta ? `<section id="cta" class="clip" data-start="${cta.s}" data-duration="${r3(cta.e - cta.s)}" data-track-index="6"><div class="cta-inner"><span class="cta-dot"></span><span class="cta-text">${esc(cta.text)}</span><span class="cta-arrow">➜</span></div></section>` : "";

const G = { ...fmt.graphics, ...(plan.graphics || {}) }; // plan.graphics: {top, height, width} in canvas fractions
const fontFaces = Object.entries(brand.font.files).map(([wt, f]) => `@font-face{font-family:"${brand.font.family}";src:url("assets/fonts/${f}") format("truetype");font-weight:${wt};font-style:normal;font-display:block;}`)
  .concat(Object.values(DF).map((f) => `@font-face{font-family:"${f.family}";src:url("assets/fonts/${f.file}") format("truetype");font-weight:${f.weight};font-style:${f.style};font-display:block;}`))
  .join("\n      ");
const css = readFileSync(join(ENGINE, "templates", "runtime.css"), "utf8").replace(/__FONT__/g, brand.font.family);
const vars = {
  "--W": `${W}px`, "--H": `${H}px`, "--bg": C.bg, "--panel": C.panel, "--panelSoft": C.panelSoft, "--cream": C.cream, "--orange": C.orange,
  "--orangeDeep": C.orangeDeep, "--amber": C.amber, "--muted": C.muted, "--ink": C.ink, "--good": C.good, "--bad": C.bad,
  "--radius": `${brand.radius}px`, "--shadow": brand.shadow, "--font": `"${brand.font.family}"`,
  "--cap-y": `${(CAP.y * H).toFixed(0)}px`, "--em-m": `${Math.round(Math.max(8, ((CAP.emphScale || 1.2) - 1) * CAP.fontSize * 1.6))}px`, "--cap-size": `${CAP.fontSize}px`, "--cap-weight": CAP.weight, "--cap-maxw": `${CAP.maxWidth}px`,
  "--g-top": `${(G.top * H).toFixed(0)}px`, "--g-h": `${(G.height * H).toFixed(0)}px`, "--g-w": `${(G.width * W).toFixed(0)}px`,
  "--hook-y": `${((plan.hook?.y ?? fmt.hook.y) * H).toFixed(0)}px`, "--hook-size": `${plan.hook?.size ?? fmt.hook.fontSize}px`,
  "--safe-x": `${((L.safeX ?? 0.05) * W).toFixed(0)}px`, "--origin-y": `${(CAM.originY * 100).toFixed(1)}%`,
  "--vignette": brand.vignette, "--u": isShort ? "1px" : "0.9px",
};
const runtimePlan = {
  D, W, H, fps, isShort, format,
  numerals: NUMERALS,
  shots, punch: CAM.punch, punches, shakes, capEmph: CAP.emphScale, originY: CAM.originY, capStyle: CAP.style || "pill", track: TRACK,
  hook: hook ? { end: hook.end, pulses: hookPulses, instant: plan.hook?.instant ?? true } : null,
  beats: beats.map((b) => ({ k: b.k, type: b.type, s: b.s, e: b.e, pos: b.pos, n: (b.items || b.points || []).length, step: b.type === "list" ? listStep(b) : b.inner?.type === "list" ? listStep({ ...b.inner, s: b.s, e: b.e }) : b.type === "terminal" || b.inner?.type === "terminal" ? termStep(b) : 0,
    effect: b.type === "title" ? (b.effect || (isLatin(String(b.text || "")) ? "echo" : "slam")) : undefined,
    transition: b.type === "scene" ? (b.transition || "iris") : undefined, pip: b.pip === "bubble", inner: b.inner?.type, bg: b.bg,
    metaphor: !!(b.object || b.photo || b.kinetic), reveal: b.reveal, sendAt: b.inner?.sendAt, typeDur: b.inner?.typeDur,
    enter: b.enter, uploadAt: b.inner?.uploadAt, subAt: b.subAt, countAt: b.countAt ?? b.inner?.countAt, leftAt: b.leftAt, rightAt: b.rightAt, winAt: b.winAt, pressAt: b.inner?.pressAt, revealAt: b.revealAt, zoomout: b.zoomout, zoomAt: b.zoomAt, beamAt: b.beamAt })),
  fadeOut: plan.fadeOut || 0,
  flash: plan.flash !== false, capActiveColor: CAP.activeColor !== false,
  env: beats.some((b) => b.type === "waveform" || b.inner?.type === "waveform") ? voiceEnvelope() : null,
  bubble: { x: 0.5, y: L.bubbleY ?? 0.5, r: L.bubbleR ?? 185, src: 270 },
  cta: cta ? { s: cta.s, e: cta.e } : null,
  progress: plan.progressBar ?? fmt.progressBar,
};

const html = `<!doctype html>
<html lang="bn" data-resolution="${isShort ? "portrait" : "landscape"}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <title>${esc(basename(JOB))}</title>
    <script src="assets/gsap.min.js"></script>
    <style>
      ${fontFaces}
      :root{${Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(";")}}
      ${css}
    </style>
  </head>
  <body class="${isShort ? "short" : "long"} fmt-${format} capstyle-${CAP.style || "pill"}">
    <div id="root" data-composition-id="main" data-start="0" data-duration="${D}" data-width="${W}" data-height="${H}">
      ${underEls}
      <div id="cam"><div id="cam-shake"><div id="cam-punch"><div id="cam-zoom"><div id="cam-track"><video id="aroll" src="assets/media/aroll.mp4" data-start="0" data-duration="${D0}" data-media-start="0" data-track-index="0" playsinline data-has-audio="true"${arollAuto}></video>${HOLD ? `<img id="endhold" class="clip" src="assets/media/endhold.jpg" data-start="${r3(D0 - 1 / fps)}" data-duration="${r3(HOLD + 1 / fps)}" data-track-index="0" alt=""/>` : ""}${behindEls}${subjEls}</div></div></div></div></div>
      <div id="vignette"></div>
      ${beats.some((b) => b.pip === "bubble") ? '<div id="bubble-ring"></div>' : ""}
      ${beatEls}
      ${hookHTML}
      ${capHTML}
      ${ctaHTML}
      ${runtimePlan.progress ? `<div id="progress"><div id="progress-fill"></div></div>` : ""}
      <div id="flash"></div>
      ${plan.fadeOut ? '<div id="fadeout"></div>' : ""}
      ${sfxHTML}
    </div>
    <script id="hf-plan" type="application/json">${JSON.stringify(runtimePlan)}</script>
    <script>
${readFileSync(join(ENGINE, "templates", "runtime.js"), "utf8")}
    </script>
  </body>
</html>
`;
writeFileSync(join(OUT, "index.html"), html);
writeJSON(join(OUT, "hyperframes.json"), {
  $schema: "https://hyperframes.heygen.com/schema/hyperframes.json",
  registry: "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry",
  paths: { blocks: "compositions", components: "compositions/components", assets: "assets" },
  media: { autoProxy: true },
});
writeJSON(join(OUT, "meta.json"), { id: basename(JOB), name: basename(JOB) });

// ---------- pacing report: no dead second ----------
const hookEv = hook ? Array.from({ length: hook.text.split(/\s+/).length + 2 }, (_, i) => r3(Math.min(hook.end, 0.03 + i * 0.09))).concat([hook.end], hookPulses) : [];
const kinEv = beats.filter((b) => (b.type === "scene" && b.kinetic) || (b.type === "behind" && b.text)).flatMap((b) => words.filter((w) => w.start >= b.s && w.start < b.e).map((w) => r3(w.start)));
const events = new Set([0, ...hookEv, ...kinEv, ...shots.map((s) => s.s), ...capItems.map((c) => c.s), ...capItems.flatMap((c) => c.ws.map((w) => r3(w.start))), ...beats.flatMap((b) => [b.s, b.e]), ...punches]);
const ev = [...events].filter((t) => t <= D).sort((a, b) => a - b);
let maxGap = 0, at = 0;
for (let i = 1; i < ev.length; i++) if (ev[i] - ev[i - 1] > maxGap) { maxGap = ev[i] - ev[i - 1]; at = ev[i - 1]; }
if (D - ev[ev.length - 1] > maxGap) { maxGap = D - ev[ev.length - 1]; at = ev[ev.length - 1]; }
// Visual-change gap: shot or graphic changes only (captions excluded)
const vis = [...new Set([0, ...hookEv, ...shots.map((s) => s.s), ...beats.flatMap((b) => [b.s, b.e]), ...punches])].sort((a, b) => a - b);
let maxVis = 0, visAt = 0;
for (let i = 1; i < vis.length; i++) if (vis[i] - vis[i - 1] > maxVis) { maxVis = vis[i] - vis[i - 1]; visAt = vis[i - 1]; }
const beatCover = beats.reduce((s, b) => s + (b.e - b.s), 0) / D;
const minGraphicsShare = isShort ? 0.3 : 0.15;
if (isShort && maxGap > 1.0) warn(`pacing: ${maxGap.toFixed(2)}s with no change at ${at.toFixed(2)}s — add a beat/emphasis there`);
if (beatCover < minGraphicsShare) warn(`pacing: graphics cover only ${(beatCover * 100).toFixed(0)}% of the video (target ≥ ${minGraphicsShare * 100}%) — add more b-roll beats`);
const firstBeat = beats[0]?.s ?? D;
if (isShort && hook && firstBeat - hook.end > 2.5) warn(`pacing: first graphic beat at ${firstBeat.toFixed(1)}s — put one within ~2s after the hook`);

// ---------- composition mix + asset plan (Stage 0: every visual tied to its words; claims to fact-check) ----------
const sampleN = Math.max(1, Math.round(D * 10));
let mFull = 0, mGfx = 0, mCanvas = 0;
for (let i = 0; i < sampleN; i++) {
  const t = (i + 0.5) / 10;
  const on = beats.filter((b) => t >= b.s && t < b.e);
  if (on.some((b) => (b.type === "scene" && !b.pip) || (b.type === "broll" && b.wipeAt === undefined) || b.pos === "full")) mCanvas++;
  else if (on.length || (hook && t < hook.end)) mGfx++;
  else mFull++;
}
const pcm = (x) => `${Math.round((100 * x) / sampleN)}%`;
const mix = { fullFace: pcm(mFull), faceWithGraphics: pcm(mGfx), fullCanvas: pcm(mCanvas) };
const spoken = (b) => words.filter((w) => w.start >= b.s - 0.1 && w.start < b.e).map((w) => w.text).join(" ");
const visualOf = (b) => [b.type, b.inner?.type, b.text || b.kicker || b.title || "", b.bg || "", b.object || ""].filter(Boolean).join(" · ");
const claimRe = /[0-9০-৯]|%|৳|\$|million|billion|লাখ|কোটি/;
const planRows = beats.map((b) => {
  const vis = visualOf(b) + (b.items ? ` [${b.items.join(" / ")}]` : "") + (b.lines ? ` [${b.lines.join(" / ")}]` : "") + (b.value !== undefined ? ` value=${b.value}${b.suffix || ""}` : "");
  return `| ${b.s.toFixed(2)}–${b.e.toFixed(2)} | ${vis.replace(/\|/g, "/")} | ${spoken(b).replace(/\|/g, "/") || "—"} | ${claimRe.test(vis) ? "⚠ check" : ""} |`;
});
writeFileSync(join(JOB, "edit", "asset-plan.md"), [
  `# Asset plan — ${basename(JOB)} (${D}s)`, "",
  `Composition: full face ${mix.fullFace} · face + graphics ${mix.faceWithGraphics} · full canvas ${mix.fullCanvas}`, "",
  hook ? `Hook (0–${hook.end}s): "${hook.text}"` : "No hook card.", "",
  "| time | visual | spoken words it illustrates | fact-check |", "|---|---|---|---|", ...planRows, "",
  "Every row must have spoken words that justify the visual. Rows marked ⚠ contain numbers/claims: verify them (source, date) before rendering.", "",
].join("\n"));

const report = {
  ok: true,
  out: relative(ROOT, join(OUT, "index.html")),
  duration: D,
  shots: shots.length,
  avgShot: r3(D / shots.length),
  captions: capItems.length,
  beats: beats.length,
  graphicsCoverage: `${(beatCover * 100).toFixed(0)}%`,
  composition: mix,
  sfx: sfx.length,
  maxDeadAir: r3(maxGap),
  maxVisualGap: `${maxVis.toFixed(2)}s @ ${visAt.toFixed(2)}`,
  warnings,
};
writeJSON(join(JOB, "edit", "build-report.json"), report);
console.log(JSON.stringify(report, null, 1));

if (A.check) {
  const r = spawnSync("npx", ["hyperframes", "lint"], { cwd: OUT, encoding: "utf8" });
  console.log(r.stdout.slice(-3000), r.stderr.slice(-1500));
}
