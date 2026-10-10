#!/usr/bin/env node
// Off-ramp: rough-cut decisions -> Premiere Pro timeline (FCP7 XML / xmeml v4, File > Import in Premiere).
//
//   node engine/to-premiere.mjs <job>   -> outputs/<job>.premiere.xml
//
// Cuts reference the ORIGINAL raw clip at 1x speed (Premiere gets full-quality media and every handle).
// The speed-up, reframe and audio polish are NOT baked in — apply them in Premiere if wanted.
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT, readJSON, probe, args } from "./lib.mjs";

const A = args();
const JOB = resolve(A._[0] || "");
const segPath = join(JOB, "cut", "segments.json");
if (!existsSync(segPath)) { console.error("run the rough cut first (cut/segments.json missing)"); process.exit(1); }
const seg = readJSON(segPath);
const src = seg.source;
const info = probe(src);
const ntsc = Math.abs(info.fps - Math.round(info.fps)) > 0.01;
const tb = Math.round(info.fps);
const fr = (t) => Math.round(t * (ntsc ? info.fps : tb));
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const name = basename(JOB);
const rate = `<rate><timebase>${tb}</timebase><ntsc>${ntsc ? "TRUE" : "FALSE"}</ntsc></rate>`;
const fileDur = fr(info.duration);
const fileEl = (first) => first
  ? `<file id="file-1"><name>${esc(basename(src))}</name><pathurl>${esc(pathToFileURL(src).href)}</pathurl>${rate}<duration>${fileDur}</duration><media><video><samplecharacteristics><width>${info.width}</width><height>${info.height}</height></samplecharacteristics></video><audio><channelcount>2</channelcount></audio></media></file>`
  : `<file id="file-1"/>`;

let t = 0;
const v = [], a = [];
seg.segments.forEach((s, i) => {
  const inF = fr(s.srcStart), outF = fr(s.srcEnd), len = outF - inF;
  const common = `<name>${esc(name)} ${i + 1}</name><enabled>TRUE</enabled><duration>${fileDur}</duration>${rate}<start>${t}</start><end>${t + len}</end><in>${inF}</in><out>${outF}</out>`;
  v.push(`<clipitem id="v${i}">${common}${fileEl(i === 0)}<link><linkclipref>v${i}</linkclipref></link><link><linkclipref>a${i}</linkclipref></link></clipitem>`);
  a.push(`<clipitem id="a${i}">${common}<file id="file-1"/><sourcetrack><mediatype>audio</mediatype><trackindex>1</trackindex></sourcetrack><link><linkclipref>v${i}</linkclipref></link><link><linkclipref>a${i}</linkclipref></link></clipitem>`);
  t += len;
});
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
<sequence id="seq-1"><name>${esc(name)} rough cut</name><duration>${t}</duration>${rate}
<media>
<video><format><samplecharacteristics>${rate}<width>${info.width}</width><height>${info.height}</height><pixelaspectratio>square</pixelaspectratio></samplecharacteristics></format>
<track>${v.join("\n")}</track></video>
<audio><track>${a.join("\n")}</track></audio>
</media></sequence>
</xmeml>
`;
mkdirSync(join(ROOT, "outputs"), { recursive: true });
const out = join(ROOT, "outputs", `${name}.premiere.xml`);
writeFileSync(out, xml);
console.log(JSON.stringify({ ok: true, out, clips: seg.segments.length, seconds: +(t / info.fps).toFixed(2), note: `speed ${seg.speed}x / reframe / audio polish not baked in` }));
