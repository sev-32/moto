// LUCID MOTO core · maneuver library (rider-in-the-loop test scenarios)
// ------------------------------------------------------------------------------------------
// Scripted riders that only use the inputs a real rider has: bar torque, throttle, clutch,
// gear, brake levers (with lever rise rates), and later body posture. Used by the headless test
// suite (tests/browser/maneuvers.mjs) and callable from the console:
//     LUCID_CORE.maneuvers.simulate("stoppie")      // synchronous, returns metrics + trace
//     LUCID_CORE.maneuvers.names()
// Conventions (measured): +x right, roll > 0 leans right, pitch > 0 nose up, a positive bar
// torque steers left (counter-steer: the bike leans and then turns right).
(function (global) {
  "use strict";
  const CORE = global.LUCID_CORE;
  if (!CORE || !global.DUCATI_V5_API || typeof free === "undefined") return;
  const API = global.DUCATI_V5_API, PT = () => global.DUCATI_ADVANCED_POWERTRAIN;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const DEGR = Math.PI / 180;
  const toward = (x, target, rate, dt) => x + clamp(target - x, -rate * dt, rate * dt);

  // ------------------------------------------------------------------ vehicle state helpers
  function riderCom(F) {
    try {
      const rc = F._massMatrixAndBias().riderCoupling;
      if (rc && rc.massKg) return { m: rc.massKg, r: rc.comOffsetBodyM };
    } catch (_) {}
    return { m: 0, r: [0, 0, 0] };
  }
  function systemCog(F, rider) {
    const S = F.S, mF = S.mUnsprungF, mR = S.mUnsprungR, FK = F._frontKinematics(), RK = F._rearKinematics();
    const RB = CORE.rider;
    if (RB?.active && RB.initialized) {
      // physical rider body: rigid parts on the bike + sprung pelvis/torso masses
      const mb = S.mSprung - RB.model.totalKg, pts = [[mb, F.p], [mF, FK.hubW], [mR, RK.hubW], [RB.pelvis.m, RB.pelvis.x], [RB.upper.m, RB.upper.x]];
      for (const part of RB.rigid) pts.push([part.m, v5add(F.p, v5qrot(F.q, part.r))]);
      const M = pts.reduce((a, x) => a + x[0], 0), c = [0, 1, 2].map((i) => pts.reduce((a, x) => a + x[0] * x[1][i], 0) / M);
      return { c, M, FK, RK };
    }
    const mr = rider.m, mb = S.mSprung - mr, M = mb + mr + mF + mR;
    const pr = v5add(F.p, v5qrot(F.q, rider.r));
    const c = [0, 1, 2].map((i) => (mb * F.p[i] + mr * pr[i] + mF * FK.hubW[i] + mR * RK.hubW[i]) / M);
    return { c, M, FK, RK };
  }
  function state(F, rider) {
    const a = v5bodyAngles(F.q), wW = v5qrot(F.q, F.w), fw = v5qrot(F.q, V5_Y), h = v5norm([fw[0], fw[1], 0]);
    const cog = systemCog(F, rider);
    const tf = CORE.tires.front, tr = CORE.tires.rear;
    const gF = F.tf?.frame?.camberRad || 0, gR = F.tr?.frame?.camberRad || 0;
    const liftF = Math.max(0, cog.FK.hubW[2] - tf.g.touchHeight(gF)), liftR = Math.max(0, cog.RK.hubW[2] - tr.g.touchHeight(gR));
    return {
      roll: a.rollRad, pitch: a.pitchRad, yaw: a.yawRad, rollRate: v5dot(wW, h), pitchRate: v5dot(wW, v5norm(v5cross(h, [0, 0, 1]))),
      yawRate: wW[2], speed: v5dot(F.v, h), heading: h, cog: cog.c, liftF, liftR,
      NF: F.tf?.loadN || 0, NR: F.tr?.loadN || 0, kF: F.tf?.kappa || 0, kR: F.tr?.kappa || 0, aF: F.tf?.alphaDeg || 0, aR: F.tr?.alphaDeg || 0,
    };
  }

  // ------------------------------------------------------------------ rider controllers
  function leanController({ kp = 80, kd = 12, ki = 25, max = 45, iBand = 8 } = {}) {
    // bar torque from roll error (positive torque = counter-steer toward a right lean); the
    // integral only acts near the target (conditional integration, no wind-up on big changes)
    let I = 0;
    return (s, targetRad, dt) => {
      const e = targetRad - s.roll;
      if (Math.abs(e) < iBand * DEGR) I = clamp(I + e * dt, -0.8, 0.8);
      else I *= Math.exp(-dt / 0.4);
      return clamp(kp * e - kd * s.rollRate + ki * I, -max, max);
    };
  }
  function headingController(lean, { k = 1.6, maxLeanDeg = 25 } = {}) {
    // follow a heading by choosing a lean target (small-angle yaw-rate/lean relation)
    return (s, headingRad, dt) => {
      const cur = Math.atan2(-s.heading[0], s.heading[1]);
      let e = headingRad - cur;
      while (e > Math.PI) e -= 2 * Math.PI;
      while (e < -Math.PI) e += 2 * Math.PI;
      const tgt = clamp(-k * e, -maxLeanDeg * DEGR, maxLeanDeg * DEGR);
      return lean(s, tgt, dt);
    };
  }

  // ------------------------------------------------------------------ scenario definitions
  // Each: { speed, roll, T, gear, clutch, assist, setup(ctx), control(ctx) }
  // ctx = { F, cmd, s (state), t, dt, mem } - control writes cmd.* and F.controls.userSteerTorqueNm
  const DEFS = {
    coast: { speed: 20, T: 5, gear: 3, about: "closed throttle, hands off, 20 m/s: self-stability, engine braking + drag" },
    coastSlow: { speed: 6, T: 5, gear: 2, about: "hands off at 6 m/s (below the self-stable band, a capsize/fall is physical)" },
    standstill: { speed: 0, T: 4, gear: 1, clutch: 0, about: "stopped, rider feet down" },
    brakeFirm: {
      speed: 25, T: 4.5, gear: 3, about: "firm straight-line stop: 0.1 s lever squeeze to 16 bar front + 5 bar rear, rider holds the bars straight",
      control(c) {
        if (c.t > 0.3) { c.cmd.throttle = 0; c.cmd.frontBrakeBar = toward(c.cmd.frontBrakeBar, 16, 160, c.dt); c.cmd.rearBrakeBar = toward(c.cmd.rearBrakeBar, 5, 60, c.dt); }
        if (c.s.speed < 0.5) { c.cmd.frontBrakeBar = 4; c.cmd.rearBrakeBar = 3; }
        c.steer = c.mem.lean(c.s, 0, c.dt);
      },
    },
    brakeMax: {
      speed: 25, T: 4, gear: 3, about: "threshold braking: front lever modulated on front slip (-6..-9 %), rear light",
      control(c) {
        if (c.t > 0.3) {
          c.cmd.throttle = 0;
          const slip = -c.s.kF, tgt = slip > 0.12 ? 8 : slip > 0.07 ? c.cmd.frontBrakeBar : 30;
          c.cmd.frontBrakeBar = toward(c.cmd.frontBrakeBar, tgt, slip > 0.12 ? 400 : 120, c.dt);
          c.cmd.rearBrakeBar = c.s.NR > 400 ? 3 : 0;
        }
        if (c.s.speed < 0.5) c.cmd.frontBrakeBar = 4;
        c.steer = c.mem.lean(c.s, 0, c.dt);
      },
    },
    brakeGrab: {
      speed: 25, T: 2.5, gear: 3, about: "panic grab: 40 bar step on a non-ABS front (expect lock and a low-side, not a numeric explosion)",
      control(c) { if (c.t > 0.3) { c.cmd.throttle = 0; c.cmd.frontBrakeBar = 40; } c.steer = c.mem.lean(c.s, 0, c.dt); },
    },
    brakeAbs: {
      speed: 25, T: 4, gear: 3, abs: true, about: "V1.21 ABS stop, full lever (55 bar) squeezed in 0.12 s",
      control(c) { if (c.t > 0.3) { c.cmd.throttle = 0; c.cmd.frontBrakeBar = toward(c.cmd.frontBrakeBar, 55, 450, c.dt); c.cmd.rearBrakeBar = 6; } c.steer = c.mem.lean(c.s, 0, c.dt); },
    },
    stoppie: {
      speed: 20, T: 4, gear: 3, about: "endo/stoppie: brake to lift the rear, hold ~12 cm, release before stopping",
      control(c) {
        const m = c.mem;
        if (c.t < 0.3) return;
        c.cmd.throttle = 0;
        c.cmd.rearBrakeBar = 0;
        if (!m.up && c.s.liftR > 0.02) m.up = c.t;
        let tgt;
        if (c.s.speed < 3.0 || m.done) { m.done = true; tgt = 0; }
        else if (!m.up) tgt = 34; // squeeze until the rear leaves the ground
        else tgt = clamp(22 + 90 * (0.12 - c.s.liftR) + 18 * c.s.pitchRate, 0, 38); // hold the rear up
        if (-c.s.kF > 0.12) tgt = Math.min(tgt, 10); // rider feels the front going: release
        c.cmd.frontBrakeBar = toward(c.cmd.frontBrakeBar, tgt, 220, c.dt);
        c.steer = m.lean(c.s, 0, c.dt);
      },
    },
    launch: {
      speed: 0, T: 4, gear: 1, clutch: 0, about: "street launch: 5500 rpm, clutch let out over 0.7 s, throttle 70 %",
      control(c) {
        c.cmd.throttle = c.t < 0.4 ? 0.3 : 0.7;
        c.cmd.clutch = c.t < 0.4 ? 0 : clamp((c.t - 0.4) / 0.7, 0, 1);
        c.steer = c.mem.lean(c.s, 0, c.dt);
      },
    },
    wheelie: {
      speed: 8, T: 6.5, gear: 1, about: "clutch-up wheelie in first: rev to ~8000 rpm on the clutch, pop it, hold ~25 deg on the throttle, cover the rear brake",
      control(c) {
        const m = c.mem, target = 25 * DEGR, rpm = c.rpm || 0;
        c.steer = m.lean(c.s, 0, c.dt);
        if (c.t < 0.3) { c.cmd.throttle = 0.2; c.cmd.clutch = 1; return; }
        if (!m.popped) {
          c.cmd.clutch = 0;
          c.cmd.throttle = rpm < 8000 ? 1 : 0.35;
          if (rpm >= 7800 || c.t > 1.4) { m.popped = c.t; }
          return;
        }
        c.cmd.clutch = Math.min(1, (c.t - m.popped) / 0.08);
        if (!m.up && c.s.liftF > 0.05) m.up = c.t;
        if (!m.up) c.cmd.throttle = 1;
        else {
          const e = target - c.s.pitch;
          c.cmd.throttle = clamp(0.4 + 2.4 * e - 0.6 * c.s.pitchRate, 0, 1);
          c.cmd.rearBrakeBar = c.s.pitch > target + 8 * DEGR ? clamp((25 * (c.s.pitch - target - 8 * DEGR)) / DEGR, 0, 30) : 0;
        }
        if (c.t > 5.2) { c.cmd.throttle = 0.12; c.cmd.rearBrakeBar = 0; }
      },
    },
    lean35: {
      speed: 22, T: 7, gear: 3, rider: { auto: false }, about: "steady turn: counter-steer into a 35 deg right lean (rider in line, no hang-off), hold with part throttle",
      control(c) {
        const tgt = c.t < 0.5 ? 0 : 35 * DEGR;
        c.cmd.throttle = clamp(0.2 + 0.05 * Math.min(1, Math.abs(c.s.roll) / (35 * DEGR)) + 0.05 * (22 - c.s.speed), 0, 1); // hold ~22 m/s
        c.steer = c.mem.lean(c.s, tgt, c.dt);
      },
    },
    radius60: {
      speed: 20, T: 10, gear: 3, about: "constant 60 m radius right-hander at 20 m/s (0.68 g): the rider's hang-off decides the bike's lean",
      control(c) {
        // a rider sets up the corner: curvature eased in over 1.5 s, lean feed-forward for the
        // target curvature, slow trim on the (low-passed) yaw-rate error
        const m = c.mem, V = Math.max(1, c.s.speed), e0 = clamp((c.t - 0.5) / 1.5, 0, 1), ramp = e0 * e0 * (3 - 2 * e0);
        const rT = (-V / 60) * ramp; // right turn = negative yaw rate
        const ff = Math.atan((V * -rT) / 9.81);
        m.ey = (m.ey || 0) + (c.s.yawRate - rT - (m.ey || 0)) * Math.min(1, c.dt / 0.5);
        if (c.t > 2.2) m.iy = clamp((m.iy || 0) + m.ey * c.dt, -1.2, 1.2);
        const lean = clamp(ff + 0.15 * m.ey + 0.12 * (m.iy || 0), -48 * DEGR, 48 * DEGR);
        c.cmd.throttle = clamp(0.22 + 0.06 * (20 - c.s.speed) + 0.06 * Math.min(1, Math.abs(c.s.roll) / (35 * DEGR)), 0, 1);
        c.steer = m.lean(c.s, lean, c.dt);
      },
    },
    slalom: {
      speed: 18, T: 8, gear: 3, about: "lean-to-lean slalom +/-22 deg every 1.2 s",
      control(c) {
        const tgt = c.t < 0.5 ? 0 : 22 * DEGR * Math.sign(Math.sin((Math.PI * (c.t - 0.5)) / 1.2) || 1);
        c.cmd.throttle = 0.2;
        c.steer = c.mem.lean(c.s, tgt, c.dt);
      },
    },
  };

  // ------------------------------------------------------------------ runner
  function simulate(name, opts = {}) {
    const d = DEFS[name];
    if (!d) throw Error("unknown maneuver " + name);
    const F = free, pt = PT(), RB = CORE.rider;
    const wasPaused = API.isPaused?.();
    const riderSave = RB ? { auto: RB.config.auto.enabled, manual: { ...RB.manual } } : null;
    if (RB && d.rider) {
      if ("auto" in d.rider) RB.setAuto(d.rider.auto);
      RB.setPosture(d.rider);
    }
    API.setDomain?.("FREE_ROAD");
    API.pause?.();
    API.setAssistMode?.(opts.assist || d.assist || "RAW");
    const setup = { mode: "ENGINE", throttle: 0, gear: d.gear || 3, clutch: d.clutch ?? 1, frontBrakeBar: 0, rearBrakeBar: 0, absEnabled: !!d.abs, tcEnabled: !!d.tc, autoShift: false };
    if (pt) Object.assign(pt.states.free.command, setup);
    F.reset(d.speed ?? 20, d.roll ?? 0);
    const cmd = pt ? pt.states.free.command : {};
    Object.assign(cmd, setup);
    F.controls.userSteerTorqueNm = 0;
    const rider = riderCom(F);
    const dt = F.S.dt, T = opts.T ?? d.T ?? 5, n = Math.round(T / dt), every = Math.max(1, Math.round((opts.traceHz ? 1 / opts.traceHz : 0.05) / dt));
    const mem = { lean: leanController(opts.leanGains || d.leanGains), heading: null };
    const trace = [], M = { maxPitchDeg: -1e9, minPitchDeg: 1e9, maxAbsRollDeg: 0, maxDecelG: 0, maxAccelG: 0, minNF: 1e9, minNR: 1e9, maxNF: 0, maxNR: 0, maxLiftF: 0, maxLiftR: 0, stopT: null, crashT: null, finite: true };
    let cogPrev = null, vPrev = null, vHist = [];
    const t0 = performance.now();
    for (let i = 0; i <= n; i++) {
      const t = i * dt;
      const s = state(F, rider);
      const ctx = { F, cmd, s, t, dt, mem, steer: 0, rpm: pt?.states?.free?.engine?.rpm || 0 };
      if (d.control) d.control(ctx);
      F.controls.userSteerTorqueNm = d.control ? ctx.steer : 0;
      F.__rttLite = i % every !== 0;
      F.step();
      F.__rttLite = false;
      if (!Number.isFinite(F.p[2]) || !Number.isFinite(F.v[1])) { M.finite = false; break; }
      // CoG kinematics for honest accelerations (the body origin swings with pitch)
      const cg = systemCog(F, rider).c, vcg = cogPrev ? [(cg[0] - cogPrev[0]) / dt, (cg[1] - cogPrev[1]) / dt, (cg[2] - cogPrev[2]) / dt] : null;
      cogPrev = cg;
      if (vcg) {
        vHist.push(vcg);
        if (vHist.length > Math.round(0.05 / dt)) {
          const va = vHist.shift(), h = s.heading, ax = (v5dot(vcg, h) - v5dot(va, h)) / 0.05;
          M.maxDecelG = Math.max(M.maxDecelG, -ax / 9.81);
          M.maxAccelG = Math.max(M.maxAccelG, ax / 9.81);
        }
      }
      if (i % every === 0) {
        const s2 = state(F, rider);
        M.maxPitchDeg = Math.max(M.maxPitchDeg, s2.pitch / DEGR);
        M.minPitchDeg = Math.min(M.minPitchDeg, s2.pitch / DEGR);
        M.maxAbsRollDeg = Math.max(M.maxAbsRollDeg, Math.abs(s2.roll / DEGR));
        M.minNF = Math.min(M.minNF, s2.NF); M.minNR = Math.min(M.minNR, s2.NR);
        M.maxNF = Math.max(M.maxNF, s2.NF); M.maxNR = Math.max(M.maxNR, s2.NR);
        M.maxLiftF = Math.max(M.maxLiftF, s2.liftF); M.maxLiftR = Math.max(M.maxLiftR, s2.liftR);
        if (M.stopT === null && (d.speed || 0) > 1 && s2.speed < 0.3) M.stopT = +t.toFixed(3);
        const L = F.last || {};
        if (M.crashT === null && (L.collision?.contacts?.length || F.collisions?.contacts?.length)) M.crashT = +t.toFixed(3);
        const ptl = pt?.states?.free;
        trace.push({
          t: +t.toFixed(3), v: +s2.speed.toFixed(2), roll: +(s2.roll / DEGR).toFixed(2), pitch: +(s2.pitch / DEGR).toFixed(2), yawRate: +(s2.yawRate / DEGR).toFixed(2),
          steer: +((F.steer || 0) / DEGR).toFixed(2), barNm: +(F.controls.userSteerTorqueNm || 0).toFixed(2), NF: Math.round(s2.NF), NR: Math.round(s2.NR),
          kF: +s2.kF.toFixed(3), kR: +s2.kR.toFixed(3), aF: +s2.aF.toFixed(2), aR: +s2.aR.toFixed(2), fork: +(F.forkTravel * 1000).toFixed(1),
          liftF: +(s2.liftF * 1000).toFixed(0), liftR: +(s2.liftR * 1000).toFixed(0), thr: +(cmd.throttle || 0).toFixed(2), fb: +(cmd.frontBrakeBar || 0).toFixed(1),
          rb: +(cmd.rearBrakeBar || 0).toFixed(1), rpm: Math.round(ptl?.engine?.rpm || 0), gear: cmd.gear,
        });
      }
      if (Math.abs(v5bodyAngles(F.q).rollRad) > 1.45) { M.crashT = M.crashT ?? +t.toFixed(3); break; }
    }
    if (RB && riderSave) {
      RB.setAuto(riderSave.auto);
      RB.setPosture(riderSave.manual);
    }
    const tail = trace.filter((x) => x.t > (trace.length ? trace[trace.length - 1].t : 0) - 2);
    M.steadyRollDeg = tail.length ? tail.reduce((a, x) => a + x.roll, 0) / tail.length : null;
    M.steadyYawRateDeg = tail.length ? tail.reduce((a, x) => a + x.yawRate, 0) / tail.length : null;
    M.wallMs = +(performance.now() - t0).toFixed(0);
    M.simS = +(trace.length ? trace[trace.length - 1].t : 0).toFixed(2);
    M.distanceM = +Math.hypot(F.p[0], F.p[1]).toFixed(1);
    for (const k of Object.keys(M)) if (typeof M[k] === "number") M[k] = +M[k].toFixed(3);
    if (!wasPaused) API.resume?.();
    return { name, about: d.about || "", metrics: M, trace };
  }

  CORE.maneuvers = { defs: DEFS, names: () => Object.keys(DEFS), simulate, controllers: { leanController, headingController }, state };
})(typeof window !== "undefined" ? window : globalThis);
