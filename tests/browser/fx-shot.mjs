// Deterministic effects capture: freeze the real-time clock, run a scripted maneuver
// synchronously while stepping the effects (particles + NIMBUS solver) on sim time, sync the
// smoke solver, then render and screenshot. Several shots can be taken along one run.
//   node tests/browser/fx-shot.mjs <scenario> <out prefix> [view] [shot times, s]
//   e.g. node tests/browser/fx-shot.mjs burnout tmp/burnout side 2,4,7
// views: chase side front rear top path drive
import { openBuild, ROOT } from "./lib.mjs";
import path from "node:path";
const [scenario = "burnout", prefix = path.join(ROOT, "tmp/fx"), view = "side", shotsArg] = process.argv.slice(2);
const shots = (shotsArg || { burnout: "2.5,5,8", lockup: "1.4", overrun: "2.5" }[scenario] || "2").split(",").map(Number);
const { browser, page, logs } = await openBuild(path.join(ROOT, "dist/LucidMoto_V2.0.0_dev.html"), { width: 1280, height: 720 });
await page.waitForFunction(() => window.__LUCID_CORE_FX_READY__ && window.__LUCID_V1300_READY__, null, { timeout: 120000 });
const btn = page.locator("button:visible", { hasText: "CONTINUE MUTED" }).first();
if (await btn.count()) await btn.click();
await page.waitForTimeout(800);

await page.evaluate(({ scenario, view }) => {
  const C = window.LUCID_CORE, A = window.DUCATI_V5_API, f = A.free, PT = window.DUCATI_ADVANCED_POWERTRAIN;
  C.realtime.timeScale = 0; // freeze the live loop; it keeps rendering
  if (C.nimbus) C.nimbus.externalClock = true;
  C.fx.clear();
  const cmd = new Proxy({}, { get: (_, k) => PT.states.free.command[k], set: (_, k, v) => ((PT.states.free.command[k] = v), true) }); // the powertrain may replace its command object on reset
  const S = {
    burnout: { speed: 0, setup: () => C.burnoutRig.start(), ctl: (dt) => C.burnoutRig.control(PT.states.free.command, dt) },
    lockup: { speed: 22, setup: () => Object.assign(cmd, { gear: 3, clutch: 1, throttle: 0, frontBrakeBar: 0, rearBrakeBar: 0 }), ctl: (dt, t) => { cmd.throttle = 0; cmd.rearBrakeBar = t > 0.2 ? 40 : 0; } },
    overrun: { speed: 30, setup: () => Object.assign(cmd, { gear: 2, clutch: 1, throttle: 0.9 }), ctl: (dt, t) => { cmd.throttle = t < 0.6 ? 0.9 : 0; } },
  }[scenario];
  A.setDomain("FREE_ROAD");
  f.reset(S.speed, 0);
  C.nimbus?.reset();
  S.setup();
  document.querySelector(`#v123RideCams [data-view="${view}"]`)?.click();
  window.__FXSHOT__ = { S, t: 0, maxKW: 0 };
}, { scenario, view });

let prevT = 0;
for (const [i, T] of shots.entries()) {
  const info = await page.evaluate((T) => {
    const C = window.LUCID_CORE, f = window.DUCATI_V5_API.free, PT = window.DUCATI_ADVANCED_POWERTRAIN, X = window.__FXSHOT__;
    const dt = f.S.dt, every = Math.round(1 / 60 / dt), n = Math.round((T - X.t) / dt);
    for (let k = 0; k < n; k++) {
      X.S.ctl(dt, X.t);
      f.__rttLite = k % every !== 0;
      f.step();
      X.t += dt;
      if (k % every === 0) {
        C.fx.tick(every * dt);
        C.nimbus?.simTick(every * dt);
        X.maxKW = Math.max(X.maxKW, C.tires.rear.out.slidingPowerW / 1000, C.tires.front.out.slidingPowerW / 1000);
      }
    }
    f.__rttLite = false;
    f.compute();
    const target = C.nimbus?.sync();
    const pt = PT.states.free;
    return { target, t: +f.time.toFixed(2), v: +Math.hypot(f.v[0], f.v[1]).toFixed(2), omR: +f.omegaR.toFixed(1), rpm: Math.round(pt.engine.rpm), rig: C.burnoutRig?.phase, maxSlideKW: +X.maxKW.toFixed(1), fx: { ...C.fx.stats } };
  }, T);
  if (info.target != null) await page.waitForFunction((n) => window.LUCID_CORE.nimbus.probeCount >= n, info.target, { timeout: 180000 });
  const nb = await page.evaluate(() => { const s = window.LUCID_CORE.nimbus?.snapshot(); return s && { sourceMode: s.sourceMode, src: s.sourceBreakdown, mass: +s.sourceMassProxy.toFixed(2), thermal: Object.fromEntries(Object.entries(s.thermal).map(([k, v]) => [k, +(+v).toPrecision(3)])), updates: s.updates, steps: s.stepsQueued, error: s.error, diag: window.LUCID_CORE.nimbus.diagnose(), metrics: s.metrics && Object.fromEntries(Object.entries(s.metrics).filter(([, v]) => typeof v === "number").slice(0, 12).map(([k, v]) => [k, +v.toPrecision(3)])) }; });
  console.log(JSON.stringify({ shot: i, ...info, nimbus: nb }));
  await page.waitForTimeout(1500); // a few rendered frames with the new field
  const out = `${prefix}_${scenario}_${view}_${T}s.png`;
  await page.screenshot({ path: out });
  console.log("saved", out);
  prevT = T;
}
const errs = logs.filter((l) => /pageerror|LUCID fx|LUCID NIMBUS|render hook/i.test(l));
if (errs.length) console.log(errs.slice(0, 6).join("\n"));
await browser.close();
