// Whole-vehicle maneuver scenarios on the consolidated build (headless Chromium).
//   node tests/browser/scenarios.mjs [build.html] [--only name] [--json]
// Each scenario drives the free-road V5 vehicle through the V1.21 powertrain command interface
// and the steering-torque input, exactly like the ride controls, and reports key metrics.
import { openBuild, ROOT } from "./lib.mjs";
import path from "node:path";

const args = process.argv.slice(2);
const file = args.find((a) => a.endsWith(".html")) || path.join(ROOT, "dist/LucidMoto_V2.0.0_dev.html");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;

export const SCENARIOS = {
  coast: { speed: 20, roll: 0.5, T: 6, events: [] },
  coastSlow: { speed: 6, roll: 0.5, T: 5, events: [] },
  turnLeft: { speed: 20, roll: 0, T: 8, events: [{ t: 0.3, steer: -2.5 }] },
  brake: { speed: 25, roll: 0, T: 5, events: [{ t: 0.3, front: 40, rear: 12, throttle: 0 }] },
  stoppie: { speed: 22, roll: 0, T: 3, events: [{ t: 0.2, front: 95, rear: 0, throttle: 0 }] },
  launch: { speed: 0, roll: 0, T: 4, gear: 1, clutch: 0, assist: "ROLL_ASSIST", events: [{ t: 0.0, throttle: 0.45 }, { t: 0.5, clutch: 1, throttle: 1 }] },
  slalom: { speed: 18, roll: 0, T: 8, events: [], steerFn: "slalom" },
};

async function run(page, name, sc) {
  return page.evaluate(
    ({ name, sc }) => {
      const A = window.DUCATI_V5_API, f = A.free, PT = window.DUCATI_ADVANCED_POWERTRAIN, C = window.LUCID_CORE;
      A.setDomain("FREE_ROAD");
      A.pause && A.pause();
      const setup = { mode: "ENGINE", throttle: 0, gear: sc.gear || 3, clutch: sc.clutch ?? 1, frontBrakeBar: 0, rearBrakeBar: 0, absEnabled: false, tcEnabled: false, autoShift: false };
      Object.assign(PT.states.free.command, setup);
      A.setAssistMode?.(sc.assist || "RAW");
      f.reset(sc.speed, sc.roll);
      // the V1.21 powertrain reset replaces its command object: take the reference afterwards
      const cmd = PT.states.free.command;
      Object.assign(cmd, setup);
      f.controls.userSteerTorqueNm = 0;
      const dt = f.S.dt, n = Math.round(sc.T / dt), rows = [], ev = sc.events.slice();
      let maxPitch = -99, minPitch = 99, maxRoll = 0, minNR = 1e9, minNF = 1e9, crash = null, maxDecel = 0, maxAccel = 0, stopT = null, dist = 0, x0 = f.p.slice();
      let lastV = f.speedMps();
      for (let i = 0; i <= n; i++) {
        const t = i * dt;
        while (ev.length && ev[0].t <= t + 1e-9) {
          const e = ev.shift();
          if (e.steer !== undefined) f.controls.userSteerTorqueNm = e.steer;
          for (const k of ["throttle", "clutch", "gear"]) if (e[k] !== undefined) cmd[k] = e[k];
          if (e.front !== undefined) cmd.frontBrakeBar = e.front;
          if (e.rear !== undefined) cmd.rearBrakeBar = e.rear;
        }
        if (sc.steerFn === "slalom") f.controls.userSteerTorqueNm = t > 0.5 ? 3.2 * Math.sign(Math.sin(2 * Math.PI * 0.45 * (t - 0.5))) : 0;
        f.__rttLite = i % 27 !== 0;
        f.step();
        f.__rttLite = false;
        const v = f.speedMps(), a = (v - lastV) / dt;
        lastV = v;
        if (i % 27 === 0) {
          const M = f.compute();
          maxPitch = Math.max(maxPitch, M.body.pitchDeg);
          minPitch = Math.min(minPitch, M.body.pitchDeg);
          maxRoll = Math.max(maxRoll, Math.abs(M.body.rollDeg));
          minNR = Math.min(minNR, M.rear.loadN);
          minNF = Math.min(minNF, M.front.loadN);
          maxDecel = Math.max(maxDecel, -a);
          maxAccel = Math.max(maxAccel, a);
          if (!crash && M.collision?.contacts?.length) crash = { t: +t.toFixed(3), parts: M.collision.contacts.map((c) => c.name) };
          if (stopT === null && sc.speed > 1 && v < 0.3) stopT = +t.toFixed(3);
          if (i % 108 === 0)
            rows.push({
              t: +t.toFixed(2), v: +v.toFixed(2), roll: +M.body.rollDeg.toFixed(2), pitch: +M.body.pitchDeg.toFixed(2), yawRate: +((f.w && v5qrot(f.q, f.w)[2]) / (Math.PI / 180)).toFixed(2),
              steer: +M.steering.angleDeg.toFixed(2), NF: +M.front.loadN.toFixed(0), NR: +M.rear.loadN.toFixed(0), aF: +M.front.slipAngleDeg.toFixed(2), aR: +M.rear.slipAngleDeg.toFixed(2),
              kF: +M.front.slipRatio.toFixed(3), kR: +M.rear.slipRatio.toFixed(3), fork: +(M.suspension.frontTravelM * 1000).toFixed(1), rear: +(M.suspension.rearTravelM * 1000).toFixed(1),
              rpm: Math.round(M.powertrain?.engine?.rpm || 0), gear: M.powertrain?.gear,
            });
        }
        if (!Number.isFinite(f.p[2]) || Math.abs(v5bodyAngles(f.q).rollRad) > 1.4) break;
      }
      dist = Math.hypot(f.p[0] - x0[0], f.p[1] - x0[1]);
      const last = rows[rows.length - 1];
      return {
        name, rows, final: last, maxPitch: +maxPitch.toFixed(2), minPitch: +minPitch.toFixed(2), maxRoll: +maxRoll.toFixed(2), minNR: Math.round(minNR), minNF: Math.round(minNF),
        maxDecelG: +(maxDecel / 9.81).toFixed(3), maxAccelG: +(maxAccel / 9.81).toFixed(3), crash, stopT, distM: +dist.toFixed(1), tireModel: C?.tireModel?.(),
      };
    },
    { name, sc },
  );
}

const { browser, page, logs } = await openBuild(file, { width: 480, height: 320 });
await page.waitForTimeout(2500);
const results = {};
for (const [name, sc] of Object.entries(SCENARIOS)) {
  if (only && name !== only) continue;
  const t0 = Date.now();
  results[name] = await run(page, name, sc);
  const r = results[name];
  console.log(`\n=== ${name} (${((Date.now() - t0) / 1000).toFixed(1)} s wall)  maxRoll ${r.maxRoll}  pitch [${r.minPitch}, ${r.maxPitch}]  minNF ${r.minNF} minNR ${r.minNR}  decel ${r.maxDecelG} g  accel ${r.maxAccelG} g  stop ${r.stopT}  dist ${r.distM} m  crash ${JSON.stringify(r.crash)}`);
  if (!args.includes("--quiet"))
    for (const q of r.rows) console.log("  " + Object.entries(q).map(([k, v]) => `${k} ${v}`).join("  "));
}
if (args.includes("--json")) console.log(JSON.stringify(results));
const errs = logs.filter((l) => /pageerror|Error/.test(l));
if (errs.length) console.log("\nPAGE ERRORS:\n" + errs.slice(0, 10).join("\n"));
await browser.close();
