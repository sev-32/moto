// LUCID MOTO core · real-time integration layer
// ------------------------------------------------------------------------------------------
// Installs the RTT tire (10_rtt_tire.js) into the legacy V5.6.7 free-road vehicle and turns the
// free-road loop into a real-time fixed-step simulation:
//   * _advanceTyre -> RTT (REALTIME) or the legacy particle solver (REFERENCE), switchable live
//   * reset settles the chassis on the RTT tires (replaces the particle pre-roll seed)
//   * lite compute(): full telemetry once per rendered frame instead of every 1/540 s step
//   * tick(): wall-clock accumulator, fixed dt, bounded catch-up; `sr` becomes legacy-only
//   * rider shadow bridge (V1.28.7) advanced at 60 Hz instead of 540 Hz
//   * cheap broad-phase before the coupled generalized-impulse ground collision solve
//   * the particle tire mesh is posed from the RTT contact for rendering
// Nothing in src/legacy is modified; every override delegates to the legacy chain when the
// REFERENCE model is selected or the page is not in the free-road domain.
(function (global) {
  "use strict";
  if (global.__LUCID_CORE_REALTIME__) return;
  const RTTAPI = global.LucidRealtimeTire;
  const API = global.DUCATI_V5_API;
  if (!RTTAPI || !API || typeof free === "undefined") {
    console.warn("LUCID core real-time: prerequisites missing");
    return;
  }
  global.__LUCID_CORE_REALTIME__ = true;
  const PSI = 6894.757293168;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const FP = Object.getPrototypeOf(free);
  const CORE = (global.LUCID_CORE = global.LUCID_CORE || {});

  // ------------------------------------------------------------------ configuration / state
  const RT = {
    tireModel: "REALTIME", // REALTIME | REFERENCE
    realtime: true, // wall-clock stepping in the free-road domain
    timeScale: 1,
    maxCatchUpS: 0.05, // never simulate more than this per frame (drops time instead of spiralling)
    frameBudgetMs: 28, // wall-clock physics budget per frame (REFERENCE tire runs slower than real time)
    riderBridgeHz: 60,
    applyAligningMoment: true,
    carrierContactVelocity: true, // slip velocity at the contact point, not the hub
    stats: { frameMs: 0, physicsMs: 0, stepsLastFrame: 0, stepMsAvg: 0, realtimeFactor: 0, droppedS: 0, frames: 0 },
    road: {
      // flat reference road; the world layer replaces these with terrain queries
      height: () => 0,
      normal: () => [0, 0, 1],
      mu: () => 1,
    },
  };
  CORE.realtime = RT;

  // ------------------------------------------------------------------ RTT instances
  const geomF = new RTTAPI.TireGeometry(global.__FRONT_ASSET__);
  const geomR = new RTTAPI.TireGeometry(global.__REAR_ASSET__);
  const tires = {
    front: new RTTAPI.RealtimeTire(geomF, { ...RTTAPI.PRESETS.front }),
    rear: new RTTAPI.RealtimeTire(geomR, { ...RTTAPI.PRESETS.rear }),
  };
  CORE.tires = tires;

  function hotPressurePsi(which) {
    // V1.26 thermal feedback publishes hot inflation pressure; the legacy _advanceTyre overwrote it
    // with the cold setup pressure every step, so the feedback never reached the tire. RTT uses it.
    try {
      const BT = global.LUCID_BRAKE_TIRE_FEEDBACK;
      const p = BT?.state?.tires?.[which]?.pressurePsi;
      const on = BT?.calibration?.tires?.enabled !== false;
      if (on && Number.isFinite(p) && p > 5) return p;
    } catch (_) {}
    return which === "front" ? free.S.frontPsi : free.S.rearPsi;
  }

  function gripScale(sol, which) {
    // V1.26 thermal feedback writes p.mu = baseMu * gripFactor (baseMu = legacy particle-tire mu).
    // RTT keeps its own calibrated mu and takes the thermal grip factor as a ratio.
    const base = +global.LUCID_BRAKE_TIRE_FEEDBACK?.state?.tires?.[which]?.baseMu || legacyMu[which];
    const s = (+sol.p.mu || base) / base;
    return Number.isFinite(s) ? clamp(s, 0.3, 1.5) : 1;
  }
  const legacyMu = { front: 1.18, rear: 1.27 }; // FiniteThicknessTyreSolverV5 presets

  // ------------------------------------------------------------------ _advanceTyre override
  const baseAdvance = FP._advanceTyre;
  const tmp = { wW: [0, 0, 0] };
  function rttAdvance(sol, K, omega, R, dt) {
    const which = sol === this.front ? "front" : "rear";
    const T = tires[which];
    const F = this._wheelRoadFrame(K);
    const up = F.up, fwd = F.fwd, right = F.right;
    const roadZ = RT.road.height(K.hubW[0], K.hubW[1]);
    const h = K.hubW[2] - roadZ;
    // carrier (non-spinning wheel frame) angular velocity in world coordinates
    const wW = v5qrot(this.q, this.w);
    if (which === "front") {
      const s = this.steerRate || 0;
      wW[0] += K.axisW[0] * s;
      wW[1] += K.axisW[1] * s;
      wW[2] += K.axisW[2] * s;
    }
    // slip velocity is evaluated at the contact point (roll rate x hub height matters for bikes)
    let Vc = K.hubV;
    if (RT.carrierContactVelocity) {
      const lat = T.out.contactLateralM || 0;
      const r = [right[0] * lat - up[0] * h, right[1] * lat - up[1] * h, right[2] * lat - up[2] * h];
      const wr = v5cross(wW, r);
      Vc = [K.hubV[0] + wr[0], K.hubV[1] + wr[1], K.hubV[2] + wr[2]];
    }
    const Vx = v5dot(Vc, fwd), Vy = v5dot(Vc, right);
    const psi = hotPressurePsi(which);
    const o = T.step({
      dt, h, hDot: v5dot(K.hubV, up), gamma: F.camberRad, Vx, Vy, yawRate: v5dot(wW, up), omega,
      pressurePa: psi * PSI, mu: T.P.mu * gripScale(sol, which), muScale: RT.road.mu(K.hubW[0], K.hubW[1]),
    });
    // legacy consumers read slip state from the solver parameter block (TC / ABS / thermal)
    sol.p.slipRatio = o.kappa;
    sol.p.slipAngleDeg = o.alpha / DEG;
    sol.p.speedMps = Math.abs(Vx);
    const lat = o.contactLateralM;
    const cp = [K.hubW[0] + right[0] * lat - up[0] * h, K.hubW[1] + right[1] * lat - up[1] * h, roadZ];
    const force = [fwd[0] * o.Fx + right[0] * o.Fy + up[0] * o.Fz, fwd[1] * o.Fx + right[1] * o.Fy + up[1] * o.Fz, fwd[2] * o.Fx + right[2] * o.Fy + up[2] * o.Fz];
    const mz = RT.applyAligningMoment ? o.Mz : 0;
    return {
      frame: F, kappa: o.kappa, alphaDeg: o.alpha / DEG, rawKappa: o.kappa, rawAlphaDeg: o.alpha / DEG, Vlong: Vx, Vlat: Vy,
      force, contactPoint: cp, loadN: o.Fz, FxN: o.Fx, FyN: o.Fy, metrics: sol.last,
      aligningMomentNm: mz, aligningMomentRawNm: o.Mz, aligningMomentWorld: [up[0] * mz, up[1] * mz, up[2] * mz],
      relaxation: { enabled: true, model: "RTT brush + carcass", carcassYM: o.carcassYM },
      lowSpeedLongitudinal: null, rimReaction: null,
      rtt: o, pressurePsi: psi, roadZ,
    };
  }
  FP._advanceTyre = function (sol, K, omega, R, dt) {
    if (RT.tireModel !== "REALTIME") return baseAdvance.call(this, sol, K, omega, R, dt);
    return rttAdvance.call(this, sol, K, omega, R, dt);
  };

  // ------------------------------------------------------------------ rolling-resistance spin torque
  const baseWheels = FP._integrateWheels;
  FP._integrateWheels = function (dt) {
    const r = baseWheels.call(this, dt);
    if (RT.tireModel === "REALTIME") {
      const S = this.S;
      for (const [k, I, T] of [["omegaF", S.IwF, tires.front.out], ["omegaR", S.IwR, tires.rear.out]]) {
        const w = this[k], dw = ((T.rollingResistanceTorqueNm || 0) * dt) / Math.max(0.05, I);
        this[k] = Math.abs(dw) >= Math.abs(w) ? 0 : w - dw; // never reverses the wheel
      }
    }
    return r;
  };

  // ------------------------------------------------------------------ RTT-compatible tire metrics
  // Lightweight stand-in for FiniteThicknessTyreSolverV5.last so legacy telemetry panels keep working.
  function rttMetrics(sol, which) {
    const o = tires[which].out, a = o.halfLengthM || 0, b = o.halfWidthM || 0, hull = [];
    for (let i = 0; i < 24; i++) {
      const t = (i / 24) * 2 * Math.PI;
      hull.push([o.contactLateralM + b * Math.cos(t), a * Math.sin(t)]);
    }
    const prev = sol.last || {};
    return {
      ...prev,
      schema: "lucid.rtt.tire-metrics.v1",
      model: "RTT",
      contact: {
        ...(prev.contact || {}), loadN: o.Fz, nodes: o.contact ? 30 : 0, areaM2: o.areaM2, lengthM: 2 * a, widthM: 2 * b, hull,
        centroid: [o.contactLateralM, 0], slidingFraction: o.slidingFraction, visualPenetrationM: 0, minVisualZ: 0, minForceZ: 0,
        samples: [],
      },
      forces: { FxN: o.Fx, FyN: o.Fy, pressureClosureErrorN: 0 },
      pressure: { ...(prev.pressure || {}), psi: hotPressurePsi(which) },
      rtt: { ...o },
    };
  }

  // ------------------------------------------------------------------ settle / reset
  const baseReset = FP.reset;
  function settle(F, speed, rollDeg) {
    // Let the chassis find its static equilibrium on the RTT tires (suspension sag, tire
    // deflection, rider COM) while horizontal motion and roll are held.
    const S = F.S, dt = S.dt, V = Math.max(0, +speed || 0), n = Math.round(0.9 / dt);
    const q0 = v5qaxis(V5_Y, (+rollDeg || 0) * DEG);
    tires.front.reset();
    tires.rear.reset();
    F.wheelDyn = null;
    const vertical = (T) => {
      // settle is a vertical equilibrium: drop the horizontal tire forces and aligning moments so
      // the brush cannot lock in a preload while the suspension sags (hubs move fore/aft)
      if (!T || !T.force) return;
      const up = T.frame?.up || V5_UP, fn = v5dot(T.force, up);
      T.force = [up[0] * fn, up[1] * fn, up[2] * fn];
      T.aligningMomentWorld = [0, 0, 0];
    };
    for (let i = 0; i < n; i++) {
      tires.front.resetBrush();
      tires.rear.resetBrush();
      F._syncTyres(dt);
      vertical(F.tf);
      vertical(F.tr);
      F.omegaF = V / Math.max(0.2, tires.front.out.effectiveRadiusM || S.rF);
      F.omegaR = V / Math.max(0.2, tires.rear.out.effectiveRadiusM || S.rR);
      F._integrateCoupled(dt);
      const damp = i < n * 0.7 ? 0.9 : 0.97;
      F.v = [0, V, F.v[2] * damp];
      F.w = [F.w[0] * damp, 0, 0];
      F.steer = 0;
      F.steerRate = 0;
      F.forkRate *= damp;
      F.rearRate *= damp;
      // keep the requested roll, allow pitch/heave to settle
      const a = v5bodyAngles(F.q);
      F.q = v5qmul(q0, v5qaxis(V5_X, a.pitchRad));
      F.p = [0, 0, F.p[2]];
    }
    F.v = [0, V, 0];
    F.w = [0, 0, 0];
    F.forkRate = 0;
    F.rearRate = 0;
    F.omegaF = V / Math.max(0.2, tires.front.out.effectiveRadiusM || S.rF);
    F.omegaR = V / Math.max(0.2, tires.rear.out.effectiveRadiusM || S.rR);
    F.time = 0;
    F.stepIndex = 0;
    F.history = [];
    for (const k of Object.keys(F.energy || {})) F.energy[k] = 0;
    tires.front.resetBrush();
    tires.rear.resetBrush();
    F._syncTyres(dt, true);
  }
  FP.reset = function (speed = this.S.initialSpeedMps, rollDeg = this.S.initialRollDeg) {
    if (RT.tireModel !== "REALTIME") return baseReset.call(this, speed, rollDeg);
    const pre = this.S.preRollOnReset;
    this.S.preRollOnReset = false; // the particle pre-roll seed is meaningless for RTT
    let out;
    try {
      out = baseReset.call(this, speed, rollDeg);
    } finally {
      this.S.preRollOnReset = pre;
    }
    settle(this, speed, rollDeg);
    this.__rttLite = false;
    this.compute();
    return this.last || out;
  };

  // ------------------------------------------------------------------ lite compute
  const baseCompute = FP.compute;
  FP.compute = function () {
    if (this.__rttLite && this.last) {
      // intermediate real-time substep: keep the cheap, frequently read fields current
      const L = this.last;
      L.timeS = this.time;
      if (L.body) {
        L.body.speedMps = this.speedMps();
        L.body.velocityMps = this.v.slice();
      }
      return L;
    }
    const M = baseCompute.call(this);
    if (RT.tireModel === "REALTIME") {
      this.front.last = rttMetrics(this.front, "front");
      this.rear.last = rttMetrics(this.rear, "rear");
      if (M.front) {
        M.front.tire = this.front.last;
        M.front.rtt = { ...tires.front.out };
      }
      if (M.rear) {
        M.rear.tire = this.rear.last;
        M.rear.rtt = { ...tires.rear.out };
      }
      M.tireModel = "RTT";
      if (M.modelAuthority)
        M.modelAuthority.tire =
          "LUCID core RTT: geometric pneumatic contact on the GLB tread profile + 3x10 semi-Lagrangian brush patch with turn slip, camber spin, friction ellipse and implicit carcass compliance; the V5 particle tire remains available as REFERENCE.";
    } else M.tireModel = "PARTICLE_REFERENCE";
    return M;
  };

  // ------------------------------------------------------------------ collision broad-phase
  const baseCollide = FP._resolveGroundCollisions;
  FP._resolveGroundCollisions = function () {
    // The legacy solve always builds the 9x9 coupled mass matrix even with nothing near the
    // ground. Skip it when no sphere proxy can touch the road this step (bit-identical result).
    const G = this.geom;
    let near = false;
    for (const pr of G.collisionProxies) {
      const c = v5add(this.p, v5qrot(this.q, pr.c));
      if (c[2] - pr.r < 0.004 + RT.road.height(c[0], c[1])) {
        near = true;
        break;
      }
    }
    if (near) return baseCollide.call(this);
    this.collisions = {
      solver: "coupled_generalized_impulse_v1", contacts: [], maxPenetrationM: 0, impulseNs: 0,
      massMatrixSymmetryError: 0, maxSolveConditionProxy: 0, maxJointVelocityKick: 0, dissipatedKineticJ: 0, biasAddedKineticJ: 0,
    };
    return this.collisions;
  };

  // ------------------------------------------------------------------ recomposed step (throttled rider bridge)
  const protoStep = FP.step;
  const chainModel = global.DUCATI_CHAIN_PARAMETRIC;
  let riderAcc = 0;
  function chainAdvance(F) {
    // Same inputs as the legacy V5.8 chain wrapper (src/legacy/04_chain_parametric_v2.js)
    try {
      const RK = F._rearKinematics(), ey = v5qrot(F.q, V5_Y), ez = v5qrot(F.q, V5_UP);
      const c1 = v5add(F.p, v5qrot(F.q, [chainX, dyn.S.countershaftY, dyn.S.countershaftZFromBody]));
      const c2 = v5add(RK.hubW, v5mul(RK.axleW, chainX)), d = v5sub(c2, c1), dy = v5dot(d, ey), dz = v5dot(d, ez);
      chainModel.advance("free", { timeS: F.time, rearZ: dz, driveTorqueNm: F.controls?.rearDriveTorqueNm || 0, r1: dyn.S.frontSprocketRadius, r2: dyn.S.rearSprocketRadius, dy, dz });
    } catch (_) {}
  }
  function riderAdvance(dt) {
    const B = global.LUCID_RIDER_MOTORCYCLE_DYNAMICS_V1287;
    if (!B?.advance) return;
    riderAcc += dt;
    const h = 1 / RT.riderBridgeHz;
    if (riderAcc >= h) {
      B.advance(Math.min(0.05, riderAcc), "V5_STEP");
      riderAcc = 0;
    }
  }
  free.step = function (dt) {
    riderAdvance(Number.isFinite(+dt) && +dt > 0 ? +dt : this.S.dt);
    const r = protoStep.call(this, dt);
    if (!this.__rttLite && chainModel) chainAdvance(this);
    return r;
  };
  free.__v1287RiderDynamicsHook = true;
  free.__v58ChainWrapped = true;

  // ------------------------------------------------------------------ tire mesh pose for rendering
  function poseSolver(sol, K, frame, which) {
    const o = tires[which].out;
    const cam = clamp(frame.camberDeg, -75, 75);
    sol.p.camberDeg = cam;
    sol.hubZ = K.hubW[2];
    const roadZ = RT.road.height(K.hubW[0], K.hubW[1]);
    const ref = sol.inflatedReference, iref = sol.innerInflatedReference;
    if (!ref || !iref) return;
    const outer = sol.outerNodes, inner = sol.innerNodes;
    const bulge = clamp((o.deflectionM || 0) * 0.35, 0, 0.012);
    for (let i = 0; i < outer.length; i++) {
      const p = sol.transformLocal(ref[i]), q = sol.transformLocal(iref[i]);
      let dz = 0;
      if (p[2] < roadZ + 0.0004) dz = roadZ + 0.0004 - p[2];
      if (dz > 0) {
        p[2] += dz;
        q[2] += dz * 0.85;
        // sidewall bulge next to the flattened crown
        const side = Math.sign(p[0] - o.contactLateralM || 1);
        p[0] += side * Math.min(bulge, dz * 0.6);
      }
      outer[i].pos = p;
      inner[i].pos = q;
    }
  }
  if (typeof updateTyreFree === "function") {
    const baseUpdateTyreFree = updateTyreFree;
    updateTyreFree = function (tb, asset, sol, K, frame) {
      if (RT.tireModel === "REALTIME") poseSolver(sol, K, frame, sol === free.front ? "front" : "rear");
      return baseUpdateTyreFree(tb, asset, sol, K, frame);
    };
  }

  // ------------------------------------------------------------------ real-time tick
  const legacyTick = tick;
  let lastWall = performance.now(), acc = 0, stepMsEMA = 0;
  tick = function () {
    if (simDomain !== "FREE_ROAD" || !RT.realtime) {
      lastWall = performance.now();
      acc = 0;
      return legacyTick();
    }
    const page = global.__LUCID_ACTIVE_PAGE__ || "LAB", ride = page === "RIDE", telemetry = page === "TELEMETRY";
    const now = performance.now(), frameDt = clamp((now - lastWall) / 1000, 0, 0.25);
    lastWall = now;
    let n = 0;
    if (!paused) {
      if (ride && global.__LUCID_RIDE_PRESTEP__) global.__LUCID_RIDE_PRESTEP__();
      freeApplyUI();
      const dt = free.S.dt;
      acc += frameDt * RT.timeScale;
      n = Math.floor(acc / dt);
      const cap = Math.max(1, Math.ceil(RT.maxCatchUpS / dt));
      if (n > cap) {
        RT.stats.droppedS += (n - cap) * dt;
        n = cap;
        acc = 0;
      } else acc -= n * dt;
      const t0 = performance.now();
      let done = 0;
      for (let i = 0; i < n; i++) {
        free.__rttLite = i < n - 1;
        free.step();
        done++;
        if (performance.now() - t0 > RT.frameBudgetMs && i < n - 1) {
          free.__rttLite = false;
          free.compute();
          RT.stats.droppedS += (n - done) * dt;
          break;
        }
      }
      n = done;
      free.__rttLite = false;
      if (n === 0) free.compute();
      const ms = performance.now() - t0;
      RT.stats.physicsMs = ms;
      if (n) stepMsEMA = stepMsEMA ? stepMsEMA * 0.9 + (ms / n) * 0.1 : ms / n;
      RT.stats.stepMsAvg = stepMsEMA;
      RT.stats.realtimeFactor = frameDt > 0 ? (n * dt) / frameDt : 0;
    } else {
      acc = 0;
      if (!ride) free.compute();
    }
    RT.stats.stepsLastFrame = n;
    RT.stats.frames++;
    RT.stats.frameMs = frameDt * 1000;
    renderFree();
    if (ride) {
      global.__VEHICLE_LAB_TELEMETRY__ = free.last;
      if (global.__LUCID_RIDE_FRAME__) global.__LUCID_RIDE_FRAME__(free.last);
    } else if (telemetry) {
      freeHistoryPanel();
      freePatchesPanel();
      freeEnergyPanel();
      freeShow();
      global.__VEHICLE_LAB_TELEMETRY__ = JSON.parse(JSON.stringify(free.last));
    } else {
      if (page === "DYNAMICS" || page === "INSPECT") freeShow();
      global.__VEHICLE_LAB_TELEMETRY__ = free.last;
    }
    global.__LAB_FRAMES__++;
    requestAnimationFrame(tick);
  };

  // ------------------------------------------------------------------ public API
  function setTireModel(mode) {
    mode = String(mode || "REALTIME").toUpperCase() === "REFERENCE" ? "REFERENCE" : "REALTIME";
    if (mode === RT.tireModel) return mode;
    RT.tireModel = mode;
    const V = free.speedMps ? free.speedMps() : free.S.initialSpeedMps;
    if (mode === "REFERENCE") free.v53RollingSeeds = new Map();
    free.reset(Number.isFinite(V) ? V : free.S.initialSpeedMps, v5bodyAngles(free.q).rollRad / DEG);
    CORE.emit?.("tireModel", mode);
    return mode;
  }
  function setRealtime(on) {
    RT.realtime = !!on;
    return RT.realtime;
  }
  function setTimeScale(s) {
    RT.timeScale = clamp(+s || 1, 0.02, 2);
    return RT.timeScale;
  }
  Object.assign(CORE, {
    version: "V2.0.0-dev",
    setTireModel,
    setRealtime,
    setTimeScale,
    tireModel: () => RT.tireModel,
    stats: () => ({ ...RT.stats, tireModel: RT.tireModel, realtime: RT.realtime, timeScale: RT.timeScale, dt: free.S.dt }),
    tireState: (which) => ({ ...tires[which].out }),
  });
  API.setTireModel = setTireModel;
  API.coreStats = CORE.stats;

  // Re-seat the current free-road state on the RTT tires.
  try {
    free.reset(free.S.initialSpeedMps, free.S.initialRollDeg);
  } catch (e) {
    console.warn("LUCID core real-time: initial reset failed", e);
  }
  global.__LUCID_CORE_REALTIME_READY__ = true;
})(typeof window !== "undefined" ? window : globalThis);
