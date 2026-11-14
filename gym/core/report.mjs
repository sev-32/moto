// The scoreboard, as Markdown.
import { METHODS } from "../methods/index.mjs";
import { grade } from "./ensemble.mjs";

const pct = (x) => (x == null || Number.isNaN(x) ? "-" : `${Math.round(100 * x)}%`);
const f1 = (x) => (x == null ? "-" : x.toFixed(1));
const whyStr = (w) => Object.entries(w).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v]) => `${k} x${v}`).join(", ") || "";

export function scoreboardMd(rows, { seeds, vary, commit, date, events, wallS }) {
  const L = [];
  L.push("# Gym scoreboard", "");
  L.push(`Generated ${date}${commit ? ` at \`${commit}\`` : ""} by \`node gym/run.mjs\`: ${seeds} seeds per event${vary ? ", grip scale cycling 1.0 / 0.8 / 0.6" : ""}, ${wallS ? `${Math.round(wallS)} s wall` : ""}.`);
  L.push("PASS = the lower 95 % bound of the success rate is at least 80 %; FAIL = the upper bound is under it; UNSURE = more seeds are needed. N/A = the method has no such command (not a failure). A success is an episode with no violation of the whole-body gate (`gym/core/gate.mjs`) and of the event's own check.", "");
  for (const m of [...new Set(rows.map((r) => r.method))]) {
    const g = grade(rows, m), meth = METHODS[m];
    L.push(`## ${meth.title}`, "", `Drive: ${meth.drive}. Declared assists: ${meth.assists}.`, "");
    L.push(`**Grade ${g.grade}** (levels cleared in a row from 1) · **${g.points.toFixed(1)} of ${g.possible.toFixed(1)}** D points`, "");
    L.push("| level | status | events passed |", "| ---: | --- | --- |");
    for (const x of g.levels) L.push(`| ${x.level} | ${x.status} | ${x.pass} of ${x.applicable}${x.applicable < x.total ? ` (${x.total - x.applicable} N/A)` : ""} |`);
    const assisted = meth.assists !== "none";
    L.push("", `| level | event | D | n | passed | 95 % interval | verdict | how it fails | head max p90 | steps |${assisted ? " assists used |" : ""}`, `| ---: | --- | ---: | ---: | ---: | --- | --- | --- | ---: | ---: |${assisted ? " --- |" : ""}`);
    for (const r of rows.filter((x) => x.method === m)) {
      if (r.verdict === "N/A") { L.push(`| ${r.level} | ${r.event} | ${r.D} | - | - | - | N/A | | | |${assisted ? " |" : ""}`); continue; }
      const as = assisted ? ` ${f1(r.assistBalNm)} N m rms${r.assistCatchN > 1 ? `, catch ${Math.round(r.assistCatchN)} N` : ""}${r.assistGetUpN > 1 ? `, get-up ${Math.round(r.assistGetUpN)} N` : ""} |` : "";
      L.push(`| ${r.level} | ${r.event} | ${r.D} | ${r.n} | ${r.pass} | ${pct(r.lo)}-${pct(r.hi)} | **${r.verdict}** | ${whyStr(r.why)} | ${f1(r.headMaxP90)}° | ${f1(r.stepsMean)} |${as}`);
    }
    L.push("");
  }
  L.push("## Events", "", "| id | level | D | what |", "| --- | ---: | ---: | --- |");
  for (const e of events) L.push(`| ${e.id} | ${e.level} | ${e.D} | ${e.title} |`);
  return L.join("\n") + "\n";
}
