// LUCID MOTO core · chassis dynamics layer
// ------------------------------------------------------------------------------------------
// Physics fixes and additions to the V5.6.7 free-road multibody. Every item below was found by
// driving the consolidated build through hard maneuvers (tests/browser/scenarios.mjs); the
// legacy integrator is kept intact and selectable (LUCID_CORE.chassis.enabled = false).
//
//  1. Implicit wheel spin. The legacy spin update is explicit against the tire force. With a
//     brush tire the tire/wheel pair is a stiff torsional spring (k ~ kx*A*R^2) and the explicit
//     update diverges at high load or low speed (a locked front at 70 kN spun up past road speed
//     in one step). The RTT now reports dFx/domega for its adhered bristles and the spin is
//     advanced with the linearised backward-Euler inertia I + dt*R*dFx/domega.
//  2. Suspension end of travel. The legacy bump term evaluates to ~78 N at the fork hard stop
//     (units slip), so every heavy stop ended in the kinematic clamp, which removes fork velocity
//     without any reaction on the chassis. Added: fork air spring (polytropic, two legs), oil
//     lock, elastomer stop and top-out spring; rear bump rubber. Joint limits that are still hit
//     are resolved with a generalized impulse through the mass matrix (momentum-consistent).
//  3. Chain drive. The legacy maps the tire moment about the rear hub onto the swingarm and only
//     removes I*domega from the main body, which equals a drive torque reacted by the swingarm
//     (shaft/hub-motor anti-squat). The chain now pulls the rear sprocket toward the countershaft
//     sprocket along the tight run (top on drive, bottom on overrun), the frame takes the
//     reaction at the countershaft tangent point, and the swingarm gets its share of the rotor
//     term. Anti-squat therefore follows the real 916 pivot/sprocket geometry.
//  4. Aerodynamics (absent in the legacy): drag + lift at a centre of pressure that follows the
//     rider posture (tuck / upright / hang-off), with the rider's share of frontal area.
//  5. Rider feet-down support at walking pace so a stopped bike is held up by the rider's legs
//     instead of toppling (bounded torque: a big lean still falls over).
(function (global) {
  "use strict";
  if (global.__LUCID_CORE_CHASSIS__) return;
  const CORE = global.LUCID_CORE;
  if (!CORE || !global.DUCATI_V5_API || typeof free === "undefined") {
    console.warn("LUCID core chassis: prerequisites missing");
    return;
  }
  global.__LUCID_CORE_CHASSIS__ = true;
  const FP = Object.getPrototypeOf(free);
  const RT = CORE.realtime;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

  const CH = (CORE.chassis = {
    enabled: true,
    implicitWheelSpin: true,
    impulseJointLimits: true,
    suspension: {
      enabled: true,
      fork: {
        // Showa 43 mm USD (916): two legs, air gap ~110 mm above the oil at full compression
        legs: 2, displacedAreaM2: 1.452e-3, minAirVolumeM3: 1.55e-4, polytropic: 1.25, atmPa: 101325,
        lockLengthM: 0.022, lockDampingNs: 7000, // hydraulic bottoming cone, compression only
        stopLengthM: 0.008, stopK1: 3.0e5, stopK3: 4.0e10, stopDampingNs: 2500, // elastomer + metal stop
        topOutLengthM: 0.012, topOutK: 5.0e4, topOutDampingNs: 800, // rebound (top-out) spring
      },
      rear: {
        // bump rubber on the shock shaft, expressed at the wheel (legacy rear force convention)
        bumpStartM: 0.100, bumpLengthM: 0.030, bumpK1: 6.0e4, bumpK3: 7.0e8, bumpDampingNs: 1500,
      },
    },
    chain: { enabled: true },
    aero: {
      enabled: true, rho: 1.2, windMps: [0, 0, 0],
      CdAUpright: 0.46, CdATuck: 0.30, ClAUpright: 0.05, ClATuck: 0.03, hangDragGain: 0.08,
      copUprightBody: [0, -0.1, 0.38], copTuckBody: [0, 0.0, 0.26], copHangLateralM: 0.14,
      posture: { tuck: 0.3, hang: 0 }, // written by the rider layer
    },
    feetDown: { enabled: true, fullBelowMps: 0.8, noneAboveMps: 2.0, kNmPerRad: 4000, cNmsPerRad: 900, maxNm: 450 },
    // the 916 carries a frame-mounted hydraulic steering damper; the legacy model only had head
    // bearing damping (1.2 N m s/rad), which leaves the wobble mode lightly damped
    steeringDamper: { enabled: true, cNmsPerRad: 7 },
    // rear-lift mitigation for the V1.21 ABS (slip-only ABS lets a full-lever stop flip the bike
    // once the front tire can exceed the stoppie threshold): trims the front pressure command
    // while the rear wheel is unloaded, like production IMU-less RLM
    abs: { rearLiftMitigation: true, lightFraction: 0.1, releasePerS: 4, recoverPerS: 1.5, minFactor: 0.25 },
    last: {},
  });

  // ------------------------------------------------------------------ 1. implicit wheel spin
  // The legacy wheel integrator is wrapped by the V1.21 powertrain (brake pressure, drive torque)
  // and by the 20-layer rolling-resistance hook, so the chain is kept: for the duration of the
  // call the wheel inertia seen by the legacy Coulomb/hold update is the implicit inertia
  //   Ie = I + dt * lever * dFx/domega
  // which turns the explicit spin update into the linearised backward-Euler one.
  function spinStiffness(F, T, K, tire) {
    if (!T || !T.force || !T.contactPoint) return 0;
    const fwd = T.frame?.fwd || v5qrot(F.q, V5_Y), spin = v5mul(v5norm(K.axleW), -1), r = v5sub(T.contactPoint, K.hubW);
    const lever = v5dot(v5cross(r, fwd), spin); // ~ -loaded radius
    return Math.max(0, -lever * (tire?.out?.dFxdOmega || 0));
  }
  const prevWheels = FP._integrateWheels;
  const rlm = { factor: 1, nrStatic: 0 };
  function withRearLiftMitigation(F, dt, fn) {
    const cmd = global.DUCATI_ADVANCED_POWERTRAIN?.states?.free?.command, A = CH.abs;
    if (!CH.enabled || !A?.rearLiftMitigation || !cmd || !cmd.absEnabled) return fn();
    const NR = F.tr?.loadN;
    if (!(rlm.nrStatic > 0)) rlm.nrStatic = Math.max(800, NR || 1500);
    const light = Number.isFinite(NR) && NR < A.lightFraction * rlm.nrStatic && (cmd.frontBrakeBar || 0) > 2;
    rlm.factor = light ? Math.max(A.minFactor, rlm.factor - A.releasePerS * dt) : Math.min(1, rlm.factor + A.recoverPerS * dt);
    CH.last.rlm = { factor: rlm.factor, active: rlm.factor < 0.999 };
    if (rlm.factor >= 0.999) return fn();
    const save = cmd.frontBrakeBar;
    cmd.frontBrakeBar = save * rlm.factor;
    try {
      return fn();
    } finally {
      cmd.frontBrakeBar = save;
    }
  }
  CH.resetRlm = () => { rlm.factor = 1; rlm.nrStatic = 0; };
  const prevReset = FP.reset;
  FP.reset = function (...args) {
    const r = prevReset.apply(this, args);
    rlm.factor = 1;
    rlm.nrStatic = Math.max(800, this.tr?.loadN || 1500); // settled static rear load
    return r;
  };
  FP._integrateWheels = function (dt) {
    if (!CH.enabled || !CH.implicitWheelSpin || RT?.tireModel !== "REALTIME") return withRearLiftMitigation(this, dt, () => prevWheels.call(this, dt));
    const S = this.S, IF = S.IwF, IR = S.IwR, tires = CORE.tires;
    const kf = spinStiffness(this, this.tf, this.FK, tires.front), kr = spinStiffness(this, this.tr, this.RK, tires.rear);
    let r;
    S.IwF = IF + dt * kf;
    S.IwR = IR + dt * kr;
    try {
      r = withRearLiftMitigation(this, dt, () => prevWheels.call(this, dt));
    } finally {
      S.IwF = IF;
      S.IwR = IR;
    }
    if (this.wheelDyn) {
      this.wheelDyn.implicitTireSpinStiffnessNmsPerRad = { front: kf, rear: kr };
      this.wheelDyn.implicitInertiaKgM2 = { front: IF + dt * kf, rear: IR + dt * kr };
    }
    return r;
  };

  // ------------------------------------------------------------------ 2. suspension end of travel
  function forkAirN(x, S, P) {
    const end = S.travelFHard, V = P.minAirVolumeM3 + P.displacedAreaM2 * Math.max(0, end - x);
    const V0 = P.minAirVolumeM3 + P.displacedAreaM2 * end;
    return P.legs * P.atmPa * (Math.pow(V0 / V, P.polytropic) - 1) * P.displacedAreaM2;
  }
  const prevSusp = FP._suspensionForces;
  FP._suspensionForces = function () {
    const su = prevSusp.call(this);
    if (!CH.enabled || !CH.suspension.enabled) return su;
    const S = this.S, P = CH.suspension.fork, R = CH.suspension.rear;
    const x = this.forkTravel, v = this.forkRate, end = S.travelFHard;
    // fork: replace the legacy bump term; the air spring is referenced to static sag so the
    // calibrated preload (ride height) is unchanged
    const air = forkAirN(x, S, P) - forkAirN(S.sagF, S, P);
    const sl = clamp((x - (end - P.lockLengthM)) / P.lockLengthM, 0, 1), lock = v > 0 ? P.lockDampingNs * sl * sl * v : 0;
    const e = x - (end - P.stopLengthM);
    let stop = 0;
    if (e > 0) stop = Math.max(0, P.stopK1 * e + P.stopK3 * e * e * e + P.stopDampingNs * Math.min(1, e / P.stopLengthM) * v);
    const t = P.topOutLengthM - x;
    let top = 0;
    if (t > 0) top = Math.max(0, P.topOutK * Math.min(t, P.topOutLengthM) - P.topOutDampingNs * Math.min(1, t / P.topOutLengthM) * v);
    const front = su.frontForceN - (su.frontBumpN || 0) + air + lock + stop - top;
    // rear bump rubber (wheel-travel coordinates)
    const xr = su.rearTravelM, vr = su.rearVelMps, er = xr - R.bumpStartM;
    let bump = 0;
    if (er > 0) bump = Math.max(0, R.bumpK1 * er + R.bumpK3 * er * er * er + R.bumpDampingNs * Math.min(1, er / R.bumpLengthM) * vr);
    const rear = su.rearForceN - (su.rearBumpN || 0) + bump;
    su.legacyFrontBumpN = su.frontBumpN;
    su.legacyRearBumpN = su.rearBumpN;
    su.frontAirN = air;
    su.frontLockN = lock;
    su.frontStopN = stop;
    su.frontTopOutN = top;
    su.frontBumpN = air + lock + stop;
    su.frontForceN = front;
    su.rearBumpN = bump;
    su.rearForceN = rear;
    su.endOfTravelModel = "lucid.core.chassis.v1";
    return su;
  };

  // ------------------------------------------------------------------ generalized wrench helpers
  function addBodyForce(F, Q, force, pointW) {
    Q[0] += force[0];
    Q[1] += force[1];
    Q[2] += force[2];
    const tb = v5qinvrot(F.q, v5cross(v5sub(pointW, F.p), force));
    Q[3] += tb[0];
    Q[4] += tb[1];
    Q[5] += tb[2];
  }
  function addBodyMoment(F, Q, momentW) {
    const mb = v5qinvrot(F.q, momentW);
    Q[3] += mb[0];
    Q[4] += mb[1];
    Q[5] += mb[2];
  }

  // ------------------------------------------------------------------ 3. chain force routing
  function chainWrench(F, Q) {
    const Td = F.controls?.rearDriveTorqueNm || 0, out = { active: false };
    CH.last.chain = out;
    if (!CH.chain.enabled || Math.abs(Td) < 1e-6 || typeof dyn === "undefined") return;
    const DS = dyn.S, RK = F.RK, x = typeof chainX === "number" ? chainX : 0;
    const r1 = DS.frontSprocketRadius, r2 = DS.rearSprocketRadius;
    const C1 = v5add(F.p, v5qrot(F.q, [x, DS.countershaftY, DS.countershaftZFromBody]));
    const C2 = v5add(RK.hubW, v5mul(v5norm(RK.axleW), x));
    const ex = v5qrot(F.q, V5_X), ez = v5qrot(F.q, V5_UP);
    const d = v5sub(C1, C2), L = v5len(d);
    if (L < 0.2) return;
    const u = v5mul(d, 1 / L);
    let n = v5norm(v5cross(ex, u));
    if (v5dot(n, ez) < 0) n = v5mul(n, -1);
    const sb = clamp((r2 - r1) / L, -0.9, 0.9), cb = Math.sqrt(1 - sb * sb), drive = Td > 0;
    // external tangent: unit normal N with N.(C1-C2) = r2 - r1, on the tight side
    const N = v5add(v5mul(u, sb), v5mul(n, drive ? cb : -cb));
    const P2 = v5add(C2, v5mul(N, r2)), P1 = v5add(C1, v5mul(N, r1));
    const dir = v5norm(v5sub(P1, P2)), Fc = Math.abs(Td) / r2, Fv = v5mul(dir, Fc);
    // chain pull on the rear sprocket: acts on the wheel carrier (swingarm) at the tooth; its
    // moment about the hub equals the drive torque, which replaces the swingarm-reacted torque
    // implied by the legacy tire-moment mapping
    F._addExternalForce(Q, Fv, P2, RK, "rear");
    // reaction on the engine cases at the countershaft sprocket tangent point
    addBodyForce(F, Q, v5mul(Fv, -1), P1);
    Object.assign(out, { active: true, run: drive ? "top" : "bottom", tensionN: Fc, dirW: dir, rearToothW: P2, frontToothW: P1 });
  }
  function rotorSwingarmShare(F, Q) {
    // the rear wheel's spin angular momentum lives on the swingarm: its rate belongs to the
    // swingarm coordinate too (the legacy applies it to the main body only)
    const wd = F.wheelDyn;
    if (!wd || !F.RK) return;
    const spin = wd.spinAxisRearWorld || v5mul(v5norm(F.RK.axleW), -1);
    Q[8] -= F.S.IwR * (wd.omegaDotR || 0) * v5dot(spin, F.RK.axisW);
  }

  // ------------------------------------------------------------------ 4. aerodynamics
  function aeroWrench(F, Q) {
    const A = CH.aero, out = { active: false };
    CH.last.aero = out;
    if (!A.enabled) return;
    const tuck = clamp(A.posture?.tuck ?? 0.3, 0, 1), hang = clamp(A.posture?.hang ?? 0, -1, 1);
    const copB = [
      lerp(A.copUprightBody[0], A.copTuckBody[0], tuck) + hang * A.copHangLateralM,
      lerp(A.copUprightBody[1], A.copTuckBody[1], tuck),
      lerp(A.copUprightBody[2], A.copTuckBody[2], tuck),
    ];
    const cop = v5add(F.p, v5qrot(F.q, copB)), wW = v5qrot(F.q, F.w);
    const vcop = v5add(F.v, v5cross(wW, v5sub(cop, F.p)));
    const va = v5sub(vcop, A.windMps || [0, 0, 0]), V = v5len(va);
    if (V < 0.5) return;
    const qd = 0.5 * A.rho * V * V;
    const CdA = lerp(A.CdAUpright, A.CdATuck, tuck) * (1 + A.hangDragGain * Math.abs(hang));
    const ClA = lerp(A.ClAUpright, A.ClATuck, tuck);
    const drag = v5mul(va, (-qd * CdA) / V), lift = [0, 0, qd * ClA];
    const Ft = v5add(drag, lift);
    addBodyForce(F, Q, Ft, cop);
    Object.assign(out, { active: true, airspeedMps: V, dragN: qd * CdA, liftN: qd * ClA, CdA, ClA, copW: cop, copBody: copB });
  }

  // ------------------------------------------------------------------ 5. rider feet-down support
  function feetDownWrench(F, Q) {
    const C = CH.feetDown, out = { active: false, weight: 0 };
    CH.last.feetDown = out;
    const SD = CH.steeringDamper;
    if (SD?.enabled) Q[6] -= SD.cNmsPerRad * (F.steerRate || 0);
    if (!C.enabled) return;
    const speed = Math.hypot(F.v[0], F.v[1]);
    const w = 1 - smooth01((speed - C.fullBelowMps) / Math.max(1e-3, C.noneAboveMps - C.fullBelowMps));
    if (w <= 0) return;
    const fw = v5qrot(F.q, V5_Y), h = v5norm([fw[0], fw[1], 0]);
    const roll = v5bodyAngles(F.q).rollRad, rollRate = v5dot(v5qrot(F.q, F.w), h);
    const tau = clamp(-(C.kNmPerRad * roll + C.cNmsPerRad * rollRate) * w, -C.maxNm, C.maxNm);
    addBodyMoment(F, Q, v5mul(h, tau));
    Object.assign(out, { active: true, weight: w, torqueNm: tau });
  }

  CH.wrenches = [chainWrench, rotorSwingarmShare, aeroWrench, feetDownWrench];
  // extension points (rider body layer): optional mass-matrix provider, gravity mass of the
  // sprung body, callbacks after the chassis state has been advanced
  CH.massMatrix = null;
  CH.sprungGravityMassKg = null;
  CH.postIntegrate = [];
  CH.addBodyForce = addBodyForce;
  CH.addBodyMoment = addBodyMoment;

  // ------------------------------------------------------------------ coupled integrator
  function solveUnit(M, k) {
    const e = new Array(9).fill(0);
    e[k] = 1;
    return v5solveDense(M, e).x;
  }
  function jointLimitImpulses(F, u, M, dt) {
    const S = F.S, lim = S.steerLimitDeg * DEG, hits = [];
    const specs = [
      [7, F.forkTravel, 0, S.travelFHard],
      [8, F.rearAngle, -15 * DEG - 0.02, 10 * DEG + 0.02],
      [6, F.steer, -lim - 0.03, lim + 0.03],
    ];
    for (let pass = 0; pass < 2; pass++) {
      for (const [k, x, lo, hi] of specs) {
        const xn = x + u[k] * dt;
        let target = null;
        if (xn > hi && u[k] > 0) target = Math.max(0, (hi - x) / dt);
        else if (xn < lo && u[k] < 0) target = Math.min(0, (lo - x) / dt);
        if (target === null) continue;
        const col = solveUnit(M, k), lam = (target - u[k]) / Math.max(1e-12, col[k]);
        for (let i = 0; i < 9; i++) u[i] += col[i] * lam;
        if (pass === 0) hits.push({ dof: k, impulse: lam });
      }
    }
    return hits;
  }
  const legacyCoupled = FP._integrateCoupled;
  FP._integrateCoupled = function (dt) {
    if (!CH.enabled) return legacyCoupled.call(this, dt);
    const S = this.S, su = this._suspensionForces(), mb = CH.massMatrix ? CH.massMatrix(this) : this._massMatrixAndBias(), Q = Array(9).fill(0);
    const gF = [0, 0, -S.mUnsprungF * S.g], gR = [0, 0, -S.mUnsprungR * S.g];
    Q[2] -= (CH.sprungGravityMassKg ? CH.sprungGravityMassKg(this) : S.mSprung) * S.g;
    this._addExternalForce(Q, this.tf.force, this.tf.contactPoint, this.FK, "front");
    this._addExternalForce(Q, this.tr.force, this.tr.contactPoint, this.RK, "rear");
    this._addExternalMoment(Q, this.tf.aligningMomentWorld, this.FK, "front");
    this._addExternalMoment(Q, this.tr.aligningMomentWorld, this.RK, "rear");
    this._addExternalForce(Q, gF, this.FK.hubW, this.FK, "front");
    this._addExternalForce(Q, gR, this.RK.hubW, this.RK, "rear");
    Q[7] -= su.frontForceN;
    const dzd = v5cross(V5_X, this.RK.rFromPivotBody)[2];
    Q[8] += -su.rearForceN * dzd - S.swingPivotDamping * this.rearRate;
    const lim = S.steerLimitDeg * DEG;
    let stop = 0;
    if (this.steer < -lim) stop = -S.steerStopK * (this.steer + lim) - S.steerStopC * this.steerRate;
    if (this.steer > lim) stop = -S.steerStopK * (this.steer - lim) - S.steerStopC * this.steerRate;
    const userSteerTau = this.controls.userSteerTorqueNm || 0;
    const steerDampTau = -S.steerDamping * (S.steerDampingScale ?? 1) * this.steerRate;
    const steerFricTau = -S.steerFriction * (S.steerFrictionScale ?? 1) * v5smoothSign(this.steerRate, 0.08);
    const steerStopTau = stop, A = this._assistTorques();
    this.assistState = A;
    Q[4] += A.roll.netTorqueNm;
    Q[6] += userSteerTau + steerDampTau + steerFricTau + steerStopTau + A.steering.netTorqueNm;
    const spinFB = v5mul(v5norm(this.FK.axleBody), -1), spinRB = [-1, 0, 0];
    const Hf = v5mul(spinFB, S.IwF * this.omegaF), Hr = v5mul(spinRB, S.IwR * this.omegaR);
    const dAxisF = v5mul(v5cross(this.geom.forkAxisBody, spinFB), this.steerRate);
    const rotor = v5add(
      v5add(v5mul(spinFB, S.IwF * (this.wheelDyn?.omegaDotF || 0)), v5mul(spinRB, S.IwR * (this.wheelDyn?.omegaDotR || 0))),
      v5add(v5mul(dAxisF, S.IwF * this.omegaF), v5cross(this.w, v5add(Hf, Hr))),
    );
    for (let i = 0; i < 3; i++) Q[3 + i] -= rotor[i];
    const gyroSteerRaw = v5dot(v5cross(this.w, Hf), this.geom.forkAxisBody), gyroSteer = gyroSteerRaw * (S.gyroSteerScale ?? 1);
    Q[6] -= gyroSteer;
    const Qlegacy = Q.slice();
    for (const fn of CH.wrenches) fn(this, Q, dt);
    const rhs = Q.map((x, i) => x - mb.C[i]), sol = v5solveDense(mb.M, rhs), a = sol.x;
    this.energy.rollAssistWorkJ = (this.energy.rollAssistWorkJ || 0) + A.roll.netTorqueNm * this.w[1] * dt;
    this.energy.steerAssistWorkJ = (this.energy.steerAssistWorkJ || 0) + A.steering.netTorqueNm * this.steerRate * dt;
    this.energy.rollAssistDampingJ = (this.energy.rollAssistDampingJ || 0) + Math.max(0, -A.roll.dampingTorqueNm * this.w[1]) * dt;
    this.energy.steerAssistDampingJ = (this.energy.steerAssistDampingJ || 0) + Math.max(0, -A.steering.dampingTorqueNm * this.steerRate) * dt;
    const u = [this.v[0], this.v[1], this.v[2], this.w[0], this.w[1], this.w[2], this.steerRate, this.forkRate, this.rearRate];
    for (let i = 0; i < 9; i++) u[i] += a[i] * dt;
    const hits = CH.impulseJointLimits ? jointLimitImpulses(this, u, mb.M, dt) : [];
    this.v = [u[0], u[1], u[2]];
    this.w = [u[3], u[4], u[5]];
    this.steerRate = u[6];
    this.forkRate = u[7];
    this.rearRate = u[8];
    this.steer += this.steerRate * dt;
    this.forkTravel += this.forkRate * dt;
    this.rearAngle += this.rearRate * dt;
    // positional safety (drift only; velocities were already made consistent by the impulses)
    if (this.forkTravel < 0) { this.forkTravel = 0; if (this.forkRate < 0) this.forkRate = 0; }
    if (this.forkTravel > S.travelFHard) { this.forkTravel = S.travelFHard; if (this.forkRate > 0) this.forkRate = 0; }
    if (this.steer < -lim - 0.03) { this.steer = -lim - 0.03; if (this.steerRate < 0) this.steerRate = 0; }
    if (this.steer > lim + 0.03) { this.steer = lim + 0.03; if (this.steerRate > 0) this.steerRate = 0; }
    const amin = -15 * DEG, amax = 10 * DEG;
    if (this.rearAngle < amin - 0.02) { this.rearAngle = amin - 0.02; if (this.rearRate < 0) this.rearRate = 0; }
    if (this.rearAngle > amax + 0.02) { this.rearAngle = amax + 0.02; if (this.rearRate > 0) this.rearRate = 0; }
    this.p = v5add(this.p, v5mul(this.v, dt));
    this.q = v5qstep(this.q, this.w, dt);
    for (const fn of CH.postIntegrate) fn(this, dt);
    const tireLever = v5axisMoment(this.FK.pivotW, this.tf.contactPoint, this.tf.force, this.FK.axisW);
    const alignSteer = v5dot(this.tf.aligningMomentWorld || [0, 0, 0], this.FK.axisW), tireSteer = tireLever + alignSteer;
    this.internal = {
      forkAccelMps2: a[7], rearAccelRadS2: a[8], steerAccelRadS2: a[6], steerTorqueTireNm: tireSteer, steerTorqueTireLeverNm: tireLever,
      steerTorqueAligningNm: alignSteer, steerTorqueGyroNm: gyroSteer, steerTorqueGyroRawNm: gyroSteerRaw, steerTorqueUserNm: userSteerTau,
      steerTorqueDampingNm: steerDampTau, steerTorqueFrictionNm: steerFricTau, steerTorqueStopNm: steerStopTau,
      steerTorqueAssistNm: A.steering.netTorqueNm, rollTorqueAssistNm: A.roll.netTorqueNm, steerTorqueNetNm: Q[6], rollTorqueNetNm: Q[4], ...su,
    };
    this.coupled = {
      schema: "lucid.core.coupled-mass.v1 (V5.5 + chain/aero/feet-down wrenches + impulse joint limits)",
      generalizedAccel: a.slice(), generalizedForce: Q.slice(), legacyGeneralizedForce: Qlegacy, biasGeneralized: mb.C.slice(),
      massMatrixDiag: mb.M.map((r, i) => r[i]), massMatrixSymmetryError: mb.symmetryError, solveConditionProxy: sol.conditionProxy,
      minPivot: sol.minPivot, maxPivot: sol.maxPivot, baseAccelWorld: a.slice(0, 3), angularAccelBody: a.slice(3, 6), rotorMomentumRateBodyNm: rotor,
      frontPointMassKg: S.mUnsprungF, rearPointMassKg: S.mUnsprungR, jointLimitImpulses: hits,
    };
    CH.last.jointLimits = hits;
  };

  // ------------------------------------------------------------------ telemetry
  const prevCompute = FP.compute;
  FP.compute = function () {
    const M = prevCompute.call(this);
    if (M && !this.__rttLite && CH.enabled) {
      M.chassis = {
        schema: "lucid.core.chassis.v1",
        chain: CH.last.chain || null, aero: CH.last.aero || null, feetDown: CH.last.feetDown || null, jointLimitImpulses: CH.last.jointLimits || [],
        suspension: this.internal
          ? { frontAirN: this.internal.frontAirN, frontLockN: this.internal.frontLockN, frontStopN: this.internal.frontStopN, frontTopOutN: this.internal.frontTopOutN, rearBumpN: this.internal.rearBumpN }
          : null,
        wheelSpin: this.wheelDyn ? { implicitInertiaKgM2: this.wheelDyn.implicitInertiaKgM2 || null } : null,
      };
    }
    return M;
  };

  CORE.setChassis = function (patch = {}) {
    for (const [k, v] of Object.entries(patch)) {
      if (v && typeof v === "object" && !Array.isArray(v) && CH[k] && typeof CH[k] === "object") Object.assign(CH[k], v);
      else CH[k] = v;
    }
    return CH;
  };
  global.__LUCID_CORE_CHASSIS_READY__ = true;
})(typeof window !== "undefined" ? window : globalThis);
