// Run the rider-in-the-loop maneuver library headless and print metrics (and traces).
//   node tests/browser/maneuvers.mjs [build.html] [--only a,b] [--trace] [--json out.json]
import { openBuild, ROOT } from "./lib.mjs";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const file = args.find((a) => a.endsWith(".html")) || path.join(ROOT, "dist/LucidMoto_V2.0.0_dev.html");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;
// Regression bands (physically motivated; see docs/PHYSICS.md). Crashes are allowed only where
// the maneuver is a physical crash (hands-off below the self-stable band, panic grab).
const EXPECT = {
  coast: { noCrash: 1, maxAbsRollDeg: [0, 3], maxDecelG: [0.05, 0.25] },
  coastSlow: {},
  standstill: { noCrash: 1, maxAbsRollDeg: [0, 3] },
  brakeFirm: { noCrash: 1, maxAbsRollDeg: [0, 3], maxDecelG: [0.6, 1.0], stopT: [2.5, 4.6] },
  brakeMax: { noCrash: 1, maxAbsRollDeg: [0, 5], maxDecelG: [0.9, 1.35] },
  brakeGrab: { maxNF: [0, 20000] },
  brakeAbs: { noCrash: 1, minPitchDeg: [-12, 0], maxDecelG: [0.9, 1.9], stopT: [2.5, 4.2] },
  stoppie: { noCrash: 1, maxLiftR: [0.06, 0.3], minPitchDeg: [-20, -4] },
  launch: { noCrash: 1, maxAccelG: [0.6, 1.4] },
  wheelie: { noCrash: 1, maxLiftF: [0.2, 1.0], maxPitchDeg: [10, 45] },
  lean35: { noCrash: 1, maxAbsRollDeg: [33, 38] },
  slalom: { noCrash: 1, maxAbsRollDeg: [12, 26] },
  radius60: { noCrash: 1, maxAbsRollDeg: [25, 42] },
};
function check(name, m) {
  const e = EXPECT[name] || {}, fails = [];
  if (!m.finite) fails.push("non-finite state");
  if (e.noCrash && m.crashT !== null) fails.push(`crash at ${m.crashT}s`);
  for (const [k, v] of Object.entries(e)) {
    if (!Array.isArray(v)) continue;
    const x = m[k];
    if (x === null || x === undefined || !(x >= v[0] && x <= v[1])) fails.push(`${k}=${x} not in [${v}]`);
  }
  return fails;
}

const { browser, page, logs } = await openBuild(file, { width: 480, height: 320 });
await page.waitForFunction(() => window.LUCID_CORE?.maneuvers && window.__LUCID_V1300_READY__, null, { timeout: 120000 }).catch(() => {});
const names = await page.evaluate(() => window.LUCID_CORE.maneuvers.names());
const results = {};
for (const name of names) {
  if (only && !only.includes(name)) continue;
  const r = await page.evaluate((n) => window.LUCID_CORE.maneuvers.simulate(n), name);
  results[name] = r;
  const m = r.metrics;
  console.log(`\n=== ${name}: ${r.about}`);
  console.log(`  sim ${m.simS}s in ${m.wallMs}ms | pitch [${m.minPitchDeg}, ${m.maxPitchDeg}] | |roll| ${m.maxAbsRollDeg} | decel ${m.maxDecelG}g accel ${m.maxAccelG}g | NF [${m.minNF}, ${m.maxNF}] NR [${m.minNR}, ${m.maxNR}] | lift F ${(m.maxLiftF * 1000).toFixed(0)}mm R ${(m.maxLiftR * 1000).toFixed(0)}mm | stop ${m.stopT} crash ${m.crashT} dist ${m.distanceM}m finite ${m.finite}`);
  const fails = check(name, m);
  r.fails = fails;
  console.log(fails.length ? `  FAIL: ${fails.join("; ")}` : "  ok");
  if (args.includes("--trace")) {
    const step = Math.max(1, Math.round(r.trace.length / 24));
    for (let i = 0; i < r.trace.length; i += step) console.log("   " + Object.entries(r.trace[i]).map(([k, v]) => `${k} ${v}`).join(" "));
  }
}
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(results));
const errs = logs.filter((l) => /pageerror/.test(l));
if (errs.length) console.log("\nPAGE ERRORS:\n" + errs.slice(0, 5).join("\n"));
await browser.close();
const failed = Object.entries(results).filter(([, r]) => r.fails.length).map(([n]) => n);
console.log(`\n${Object.keys(results).length - failed.length}/${Object.keys(results).length} maneuvers within bands${failed.length ? " - FAILED: " + failed.join(", ") : ""}${errs.length ? " - page errors present" : ""}`);
if (failed.length || errs.length) process.exitCode = 1;
