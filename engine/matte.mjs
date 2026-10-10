#!/usr/bin/env node
// Cut the speaker out of the cut video (for text-behind-subject and background swaps).
//   node engine/matte.mjs <job>   -> cut/subject.webm (VP9 + alpha, main speaker only)
// Takes ~5s per second of video on Apple Silicon. Re-run after every re-cut.
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { ENGINE, ROOT, PYTHON, args } from "./lib.mjs";

const A = args();
const JOB = resolve(A._[0] || "");
const cut = join(JOB, "cut", "cut.mp4");
if (!existsSync(cut)) { console.error("run the rough cut first"); process.exit(1); }
const raw = join(JOB, "work", "subject-raw.webm");
const out = join(JOB, "cut", "subject.webm");
let r = spawnSync("npx", ["hyperframes", "remove-background", cut, "-o", raw, "--quality", "balanced", "--json"], { cwd: ROOT, encoding: "utf8" });
if (r.status !== 0) { console.error(r.stdout, r.stderr); process.exit(1); }
r = spawnSync(PYTHON, [join(ENGINE, "matte_clean.py"), raw, out], { encoding: "utf8" });
if (r.status !== 0) { console.error(r.stdout, r.stderr); process.exit(1); }
console.log(JSON.stringify({ ok: true, out }));
