#!/usr/bin/env node
// The gym's command line.
//   node gym/run.mjs [--methods wbc,motors] [--events stand.,hold.] [--level 1-4] [--seeds 8]
//                    [--jobs 4] [--no-vary] [--mods '{"jointStdDeg":0}'] [--out lab/out/gym.json] [--md docs/lab/SCOREBOARD.md] [--list]
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { EVENTS } from "./events/index.mjs";
import { METHODS } from "./methods/index.mjs";
import { runEnsemble, aggregate, grade } from "./core/ensemble.mjs";
import { scoreboardMd } from "./core/report.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf("--" + n); return i < 0 ? d : args[i + 1]; };
const has = (n) => args.includes("--" + n);
if (has("list")) { for (const e of EVENTS) console.log(`L${e.level} D${e.D}\t${e.id}\t${e.title}`); process.exit(0); }

const methods = (opt("methods", Object.keys(METHODS).join(","))).split(",");
const prefixes = opt("events", "").split(",").filter(Boolean);
const [lo, hi] = (opt("level", "1-10")).split("-").map(Number);
const events = EVENTS.filter((e) => e.level >= lo && e.level <= (hi || lo) && (!prefixes.length || prefixes.some((p) => e.id.startsWith(p))));
const seeds = +opt("seeds", 8), vary = !has("no-vary"), extra = JSON.parse(opt("mods", "{}"));
const t0 = Date.now();
let last = 0;
const res = await runEnsemble({
  methods, events, seeds, vary, extra, jobs: +opt("jobs", 4),
  onResult: (r, done, total) => { if (Date.now() - last > 4000 || done === total) { last = Date.now(); process.stderr.write(`\r${done}/${total} episodes, ${Math.round((Date.now() - t0) / 1000)} s`); } },
});
process.stderr.write("\n");
const rows = aggregate(res, EVENTS);
const wallS = (Date.now() - t0) / 1000;
let commit = ""; try { commit = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch {}
const out = opt("out", "lab/out/gym.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ meta: { date: new Date().toISOString(), commit, seeds, vary, methods, wallS }, rows, grades: Object.fromEntries(methods.map((m) => [m, grade(rows, m)])), records: res.records }, null, 0));
const md = scoreboardMd(rows, { seeds, vary, commit, date: new Date().toISOString().slice(0, 10), events: events.filter((e) => rows.some((r) => r.event === e.id)), wallS });
if (opt("md")) { fs.mkdirSync(path.dirname(opt("md")), { recursive: true }); fs.writeFileSync(opt("md"), md); }
else console.log(md);
console.error(`wrote ${out} (${res.records.length} episodes, ${Math.round(wallS)} s)`);
