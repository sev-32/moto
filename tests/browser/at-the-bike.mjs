// The physical rider at the bike in the game (headless Chromium, the 916's own chassis, the
// interact button as a player presses it): getting off and on again, and lifting the bike after a
// crash and getting on. The motions (48_rider_onfoot.js) run with the chassis's dynamics, its side
// stand and the declared assists - reported, not hidden.
//   node tests/browser/at-the-bike.mjs [off-on|crash-lift-on|all] [build.html]
// off-on: stopped, F - she puts the stand down and climbs off; she walks 2 s away and back to it;
//   F - she walks round to its left, holds it up, gets on and rides off with both grips.
// crash-lift-on: a low-side crash at 12 m/s; once she is up she walks to the bike, F - she walks
//   round to its upper side and lifts it onto its stand; F - she gets on.
// Headless it runs at a few percent of real time: several minutes per scenario.
import { openBuild, ROOT } from "./lib.mjs";
import path from "node:path";
const which = ["off-on", "crash-lift-on", "all"].includes(process.argv[2]) ? process.argv[2] : "all";
const file = process.argv.find((a) => a.endsWith(".html")) || path.join(ROOT, "dist/LucidMoto_V2.0.0_dev.html");
const fails = [];
const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) fails.push(what); };

async function scenario(name, session) {
  const { browser, page, logs } = await openBuild(file + "?rider=bio", { width: 640, height: 400 });
  try {
    await page.waitForFunction(() => window.__LUCID_V1300_READY__ && window.LUCID_CORE?.maneuvers && window.LUCID_RIDER_ONFOOT, null, { timeout: 180000 }).catch(() => {});
    const btn = page.locator("button:visible", { hasText: session }).first();
    if (await btn.count()) await btn.click().catch(() => {});
    await page.waitForTimeout(1500);
    const out = await page.evaluate(({ name, DETAIL }) => {
      const C = window.LUCID_CORE, B = C.riderBio, R = B.rider, f = window.DUCATI_V5_API.free, G = R.onFoot, P = R.plan, M = C.maneuvers, RT = C.realtime;
      C.world?.setEnabled?.(false);
      // (the bike's controls - read each time: a reset replaces them)
      const cmd = () => window.DUCATI_ADVANCED_POWERTRAIN?.states?.free?.command;
      const ev = [], o = { name, ok: {} };
      let t = 0;
      // (the game's own per-frame work, then 9 physics steps of 1/540 s: a 60 Hz frame)
      const frame = (n = 1, fn) => {
        for (let k = 0; k < n; k++) {
          window.__LUCID_RIDE_PRESTEP__();
          const c = cmd();
          if (!P.fallen && c && !o.riding) { c.clutch = 0; c.throttle = 0; c.frontBrakeBar = 8; }
          if (P.mode === "fallen" && o.onFoot) o.fellOnFoot = true;
          if (P.mode === "foot") o.onFoot = true;
          if (fn) fn();
          for (let i = 0; i < 9; i++) f.step();
          t += 9 * f.S.dt;
        }
      };
      const roll = () => (v5bodyAngles(f.q).rollRad * 180) / Math.PI;
      const mode = () => (P.fallen ? P.mode + (P.mode === "script" ? ":" + G.script.name : "") + (G.goal ? ":goto" : "") : "ride");
      const note = (what) => ev.push(`t ${t.toFixed(2)} ${what.padEnd(14)} ${mode().padEnd(16)} bike roll ${roll().toFixed(1)} v ${Math.hypot(f.v[0], f.v[1]).toFixed(2)} pelvis z ${R.body.p[2].toFixed(2)}${G.script.failed ? " failed " + JSON.stringify(G.script.failed) : ""}${G.error ? " error " + G.error : ""}`);
      const press = () => { G.ui.interact = true; frame(1); };
      // (DETAIL: a line every quarter second while waiting)
      const until = (cond, maxS, fn) => { const t0 = t; let k = 0; while (!cond() && t - t0 < maxS) { frame(1, fn); if (DETAIL && ++k % 15 === 0) note(".." + (P.mode === "script" ? G.script.i : "") + (PL_stand() ? " stand" : "")); } return cond(); };
      const PL_stand = () => !!P.sideStand;
      // (as a player walks her to it: towards its seat until F would do something - the prompt)
      const approach = (want, maxS) => {
        const ok = until(() => G.action(B.bikeAdapter()) === want, maxS, () => { const bk = B.bikeAdapter(), p = R.internal.bikeToWorld(bk, [0, -0.3, 0]), d = [p[0] - R.body.p[0], p[1] - R.body.p[1]], n = Math.hypot(d[0], d[1]); G.setIntent([d[0] / n, d[1] / n]); });
        frame(30, () => G.setIntent([0, 0]));
        return ok;
      };
      const ride = () => { o.riding = true; frame(90, () => { const c = cmd(); if (c) { c.clutch = 1; c.throttle = 0.2; c.frontBrakeBar = 0; c.gear = 1; } }); };
      if (name === "off-on") {
        RT && (window.DUCATI_V5_API.pause?.(), f.reset(0, 0));
        frame(90); note("stopped");
        press(); note("F: get off");
        o.ok.off = until(() => P.mode === "foot" && !G.goal, 20); note("off");
        o.ok.onStand = Math.abs(roll() + 10) < 6;
        // (away from it, out to its left - the stick pushed that way)
        const bk0 = B.bikeAdapter(), away = [-bk0.R[0], -bk0.R[3]], an = Math.hypot(away[0], away[1]);
        until(() => false, 2, () => G.setIntent([away[0] / an, away[1] / an]));
        frame(40, () => G.setIntent([0, 0]));
        o.ok.walkedAway = P.mode === "foot" && !o.fellOnFoot; note("walked away");
        o.ok.backAtIt = approach("mount", 12); note("back at it");
        const t0 = t; press(); note("F: get on");
        o.ok.on = until(() => !P.fallen, 40); o.onS = t - t0; note("seated");
      } else {
        // (the crash: a slippery patch under the rear tyre at 12 m/s, leaned 25 deg - as in the
        // maneuver suite's slides)
        let t0c = null; const mu0 = RT.road.mu;
        const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
        M.defs.__crash = { speed: 12, T: 6, gear: 2, setup() { RT.road.mu = (x, y) => { const tt = t0c == null ? -1 : f.time - t0c, rk = f.RK?.hubW; return tt > 2.5 && tt < 3.1 && rk && Math.hypot(x - rk[0], y - rk[1]) < 0.05 ? 0.25 : 1; }; }, teardown() {}, control(c) { if (c.t === 0) t0c = f.time; c.cmd.throttle = clamp(0.18 + 0.05 * (12 - c.s.speed), 0, 1); c.steer = c.mem.lean(c.s, c.t < 0.4 ? 0 : (25 * Math.PI) / 180, c.dt); } };
        M.simulate("__crash"); delete M.defs.__crash; RT.road.mu = mu0;
        C.world?.setEnabled?.(false); window.DUCATI_V5_API.pause?.();
        o.ok.crashed = P.fallen && Math.abs(roll()) > 60; note("crashed");
        o.ok.up = until(() => P.mode === "foot" && !G.rise, 20); note("up"); o.fellOnFoot = false;
        o.ok.atBike = approach("lift", 20); note("at the bike");
        const t0 = t; press(); note("F: lift");
        until(() => G.script.name === "lift" && P.mode === "script", 30);
        o.ok.lifted = until(() => P.mode !== "script" && !G.goal, 40) && P.mode === "foot" && Math.abs(roll() + 10) < 6; o.liftS = t - t0; note("lifted");
        frame(30);
        const t1 = t; press(); note("F: get on");
        o.ok.on = until(() => !P.fallen, 40); o.onS = t - t1; note("seated");
      }
      frame(60);
      o.ok.neverFellOnFoot = !o.fellOnFoot;
      o.ok.riding = !P.fallen && R.grips.L.held && R.grips.R.held;
      note("riding");
      if (o.ok.riding) { ride(); o.ok.rodeOff = !P.fallen && Math.hypot(f.v[0], f.v[1]) > 0.3; note("rode off"); }
      const hs = G.hold.stats, ls = G.lift.stats, ss = G.script.stats;
      o.assists = { holdNmMean: hs.n ? hs.NmSum / hs.n : 0, holdNmMax: hs.maxNm, liftNmMean: ls.n ? ls.NmSum / ls.n : 0, liftNmMax: ls.maxNm, motionNMean: ss.n ? ss.Nsum / ss.n : 0, motionNMax: ss.maxN };
      o.ev = ev;
      return o;
    }, { name, DETAIL: !!process.env.DETAIL });
    console.log(`--- ${name}`);
    for (const e of out.ev) console.log("   " + e);
    for (const [k, v] of Object.entries(out.ok)) check(!!v, `${name}: ${k}`);
    if (out.onS != null) console.log(`   F to seated ${out.onS.toFixed(1)} s${out.liftS != null ? `, F to lifted ${out.liftS.toFixed(1)} s` : ""}`);
    console.log(`   declared assists: hold residual ${out.assists.holdNmMean.toFixed(0)} N m mean / ${out.assists.holdNmMax.toFixed(0)} max; lift ${out.assists.liftNmMean.toFixed(0)} / ${out.assists.liftNmMax.toFixed(0)} N m; motion ${out.assists.motionNMean.toFixed(0)} / ${out.assists.motionNMax.toFixed(0)} N`);
    const errs = logs.filter((l) => l.startsWith("[pageerror]"));
    check(!errs.length, `${name}: no page errors${errs.length ? ": " + errs[0].slice(0, 200) : ""}`);
  } finally {
    await browser.close();
  }
}
if (which !== "crash-lift-on") await scenario("off-on", "STANDING START");
if (which !== "off-on") await scenario("crash-lift-on", "START ROLLING RIDE");
console.log(fails.length ? `${fails.length} FAILED` : "all ok");
process.exit(fails.length ? 1 : 0);
