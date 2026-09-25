// Probe the consolidated build: readiness, settle state, per-stage cost, straight-line run.
import { openBuild, ROOT } from "./lib.mjs";
import path from "node:path";
const file = process.argv[2] || path.join(ROOT, "dist/LucidMoto_V2.0.0_dev.html");
const { browser, page, logs } = await openBuild(file);
await page.waitForFunction(() => window.__LUCID_CORE_REALTIME_READY__ || window.__LUCID_CORE_REALTIME__ === undefined, null, { timeout: 120000 }).catch(() => {});
await page.waitForTimeout(2500);
const r = await page.evaluate(() => {
  const A = window.DUCATI_V5_API, f = A.free, C = window.LUCID_CORE;
  A.setDomain("FREE_ROAD"); A.pause && A.pause();
  f.reset(20, 0);
  const M = f.last, W = f.S.mTotal * f.S.g;
  const settle = { loadF: M.front.loadN, loadR: M.rear.loadN, total: M.front.loadN + M.rear.loadN, weight: W, pitchDeg: M.body.pitchDeg, z: M.body.positionM[2], forkMm: M.suspension.frontTravelM * 1000, rearMm: M.suspension.rearTravelM * 1000, speed: M.body.speedMps, kF: M.front.slipRatio, kR: M.rear.slipRatio };
  // profile stages
  const names = ["_syncTyres", "_integrateWheels", "_integrateCoupled", "_resolveGroundCollisions", "compute"], acc = {};
  const saved = {};
  for (const n of names) { acc[n] = 0; saved[n] = f[n]; const o = f[n]; f[n] = function (...a) { const t = performance.now(); const r = o.apply(this, a); acc[n] += performance.now() - t; return r; }; }
  let t0 = performance.now(); const N = 1080;
  for (let i = 0; i < N; i++) { f.__rttLite = (i % 9) !== 8; f.step(); }
  f.__rttLite = false;
  const total = (performance.now() - t0) / N;
  for (const n of names) delete f[n];
  const prof = { stepMs: +total.toFixed(4) }; for (const n of names) prof[n] = +(acc[n] / N).toFixed(4);
  // straight run with no input for 4 s
  f.reset(20, 0);
  const traj = [];
  for (let i = 0; i <= 4 * 540; i++) { if (i % 108 === 0) { const m = f.compute(); traj.push({ t: +m.timeS.toFixed(2), v: +m.body.speedMps.toFixed(2), roll: +m.body.rollDeg.toFixed(3), steer: +m.steering.angleDeg.toFixed(3), yaw: +m.body.yawDeg.toFixed(2), NF: +m.front.loadN.toFixed(0), NR: +m.rear.loadN.toFixed(0) }); } f.__rttLite = true; f.step(); }
  f.__rttLite = false;
  return { core: C && C.stats(), settle, prof, traj, tireModel: C && C.tireModel() };
});
const { traj, ...rest } = r; console.log(JSON.stringify(rest, null, 1)); console.log("traj:", traj.map((q) => `t${q.t} v${q.v} roll${q.roll} steer${q.steer} NF${q.NF} NR${q.NR}`).join(" | "));
console.log(logs.filter((l) => /error|warn/i.test(l)).slice(0, 20).join("\n"));
await browser.close();
