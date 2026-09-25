// LUCID MOTO core · rider body (biomechanical coupling)
// ------------------------------------------------------------------------------------------
// Until now the rider's weight entered the V5 multibody as a rigid point mass at a fixed seated
// centre of mass (V1.28.5.2 COM_COUPLED); hang-off, tuck and weight shifts only moved the drawn
// mesh (the V1.28.7 bridge computed a diagnostic "shadow" wrench). This layer makes the rider a
// physical part of the machine:
//   * segment masses come from the V1.28.5.2 mass authority (12 segments, 75.3 kg)
//   * shanks+feet (pegs) and forearms+hands (bars) stay rigid on the bike
//   * pelvis+thighs (seat) and torso+head+upper arms are sprung masses held by posture servos:
//       pelvis <-> bike      seat/knees/pegs          (vertical ~6 Hz seated resonance)
//       torso  <-> pelvis    spine muscle tone
//       torso  <-> bars      arms (bracing under braking, pulling under drive)
//     every servo force acts equal-and-opposite on the bike at the seat (pegs when standing) and
//     the grips, so moving the body moves the machine (body steering, counter-lean on hang-off,
//     weight transfer for wheelies/stoppies, sway under braking)
//   * posture targets: hang-off (lateral slide + lean-in), fore/aft slide, tuck / sit-up, stand
//     on the pegs; auto posture follows lateral g / speed / braking like a sport rider, manual
//     keys override (J/L hang, I tuck, K weight back, U stand, O auto on/off; d-pad on a pad)
//   * drives the legacy rider pose (V1.28.6.2 corner balance hang, V1.28.5.3 seat/posture grid)
//     and the aero posture (drag area / centre of pressure) in the chassis layer.
(function (global) {
  "use strict";
  if (global.__LUCID_CORE_RIDER__) return;
  const CORE = global.LUCID_CORE, CH = CORE?.chassis;
  if (!CH || !global.DUCATI_V5_API || typeof free === "undefined") {
    console.warn("LUCID core rider: prerequisites missing");
    return;
  }
  global.__LUCID_CORE_RIDER__ = true;
  const FP = Object.getPrototypeOf(free);
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const DEGR = Math.PI / 180;
  const add = v5add, sub = v5sub, mul = v5mul, cross = v5cross, qrot = v5qrot, qinv = v5qinvrot;
  const had = (a, b) => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
  const clampv = (v, lim) => [clamp(v[0], -lim[0], lim[0]), clamp(v[1], -lim[1], lim[1]), clamp(v[2], -lim[2], lim[2])];
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const smooth01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

  // ------------------------------------------------------------------ configuration
  const CFG = {
    hangLatM: 0.17, leanInDeg: 24, foreAftM: 0.08, standUpM: 0.18, tuckDeg: 28, sitUpDeg: 18,
    // servo stiffness [lateral, longitudinal, vertical] (N/m) and damping ratios
    pelvisK: [14000, 18000, 40000], pelvisZeta: [0.7, 0.7, 0.5], pelvisLimitN: [1600, 2200, 5000],
    spineK: [7000, 8000, 20000], spineZeta: [0.5, 0.5, 0.5], spineLimitN: [1500, 2500, 3500],
    armsK: [1500, 5000, 2500], armsZeta: [0.4, 0.5, 0.4], armsLimitN: [900, 1800, 1200],
    spineWeightShare: 0.8, // torso weight carried by the spine (rest by the arms on the bars)
    rates: { hang: 1.8, foreAft: 2.0, tuck: 2.0, stand: 2.5 }, // posture change rates (1/s)
    // auto rider: commits to a body position from *filtered* lateral g and lean (a rider sets up
    // for the corner and holds it; reacting to instantaneous yaw rate pumps the weave mode)
    auto: { enabled: true, style: 0.75, hangStartG: 0.2, hangFullG: 0.95, filterS: 1.2, minLeanDeg: 4, tuckStartMps: 33, tuckFullMps: 55, sitUpDecelG: 0.55, sitUpMinMps: 30 },
    visualHz: 30,
    // Rider COM source. SEGMENTS: the V1.28.5.2 segment table (pelvis on the seat, forearms on the
    // grips, shanks on the pegs - consistent with the bike's reaction sites; rider COM 0.104 m
    // behind the V5 body origin). LIVE_MESH: translate pelvis+torso so the rider COM matches the
    // COM V1.28.5.3 computes from the skinned mesh (0.258 m behind; what the legacy COM_COUPLED
    // physics used at runtime). The two differ by ~15 cm; SEGMENTS is the default until the new
    // character rig provides measured segment frames.
    comSource: "SEGMENTS",
  };

  // ------------------------------------------------------------------ segment model
  const FALLBACK_SEGMENTS = {
    pelvis: { massKg: 11.32, comM: [0, -0.325, 0.907] }, left_thigh: { massKg: 7.97, comM: [-0.206, -0.176, 0.777] }, right_thigh: { massKg: 7.97, comM: [0.202, -0.175, 0.777] },
    abdomen: { massKg: 9.89, comM: [0, -0.199, 0.991] }, thorax: { massKg: 14.03, comM: [0, -0.027, 1.094] }, neck_head: { massKg: 6.46, comM: [0, 0.21, 1.194] },
    left_upper_arm: { massKg: 2.23, comM: [-0.201, 0.116, 1.048] }, right_upper_arm: { massKg: 2.23, comM: [0.201, 0.116, 1.049] },
    left_shank_foot: { massKg: 4.86, comM: [-0.283, -0.263, 0.421] }, right_shank_foot: { massKg: 4.86, comM: [0.283, -0.264, 0.423] },
    left_forearm_hand: { massKg: 1.75, comM: [-0.237, 0.475, 0.875] }, right_forearm_hand: { massKg: 1.75, comM: [0.234, 0.476, 0.877] },
  };
  const GROUPS = {
    pelvis: ["pelvis", "left_thigh", "right_thigh"],
    upper: ["abdomen", "thorax", "neck_head", "left_upper_arm", "right_upper_arm"],
    feet: ["left_shank_foot", "right_shank_foot"],
    hands: ["left_forearm_hand", "right_forearm_hand"],
  };
  let liveComAtBoot = null;
  function captureLiveCom() {
    // V1.28.5.3 overwrites mass.comOffsetBodyM from the skinned pose; take it once, before this
    // layer starts posing the rider
    if (liveComAtBoot || !global.__LUCID_V12853_READY__) return;
    const c = global.LUCID_RIDER_DYNAMICS_V12852?.mass?.comOffsetBodyM;
    if (Array.isArray(c) && c.every(Number.isFinite)) liveComAtBoot = c.slice();
  }
  function buildModel() {
    captureLiveCom();
    const live = liveComAtBoot;
    const M = global.LUCID_RIDER_DYNAMICS_V12852?.mass, segs = M?.segmentMassProperties || FALLBACK_SEGMENTS;
    const origin = M?.neutralV5BodyOriginM || [0, 0, 0.64];
    const g = {};
    for (const [name, list] of Object.entries(GROUPS)) {
      let m = 0;
      const c = [0, 0, 0];
      for (const n of list) {
        const s = segs[n];
        if (!s) continue;
        const mm = +s.massKg || 0;
        m += mm;
        for (let k = 0; k < 3; k++) c[k] += mm * (s.comM[k] - origin[k]);
      }
      g[name] = { m, r: c.map((x) => x / Math.max(1e-9, m)) };
    }
    if (CFG.comSource === "LIVE_MESH" && live) {
      // shift the sprung groups (pelvis, torso) so the total rider COM matches the live mesh COM;
      // hands stay on the grips and feet on the pegs
      const tot = Object.values(g).reduce((a, x) => a + x.m, 0), sprung = g.pelvis.m + g.upper.m;
      const com = [0, 1, 2].map((i) => Object.values(g).reduce((a, x) => a + x.m * x.r[i], 0) / tot);
      const sh = [0, 1, 2].map((i) => ((live[i] - com[i]) * tot) / sprung);
      for (const k of ["pelvis", "upper"]) g[k].r = add(g[k].r, sh);
    }
    const RS = global.LUCID_RIDER_DYNAMICS_V12852?.reactionSites?.sites || {};
    const site = (a, b, fb) => {
      const pa = RS[a]?.pointM, pb = RS[b]?.pointM;
      if (!pa || !pb) return fb;
      return [0.5 * (pa[0] + pb[0]) - origin[0], 0.5 * (pa[1] + pb[1]) - origin[1], 0.5 * (pa[2] + pb[2]) - origin[2]];
    };
    return {
      groups: g,
      totalKg: Object.values(g).reduce((a, x) => a + x.m, 0),
      sites: {
        seat: site("seat.left", "seat.right", [0, -0.334, 0.152]),
        peg: site("peg.left", "peg.right", [0, -0.368, -0.24]),
        grip: site("grip.left", "grip.right", [0, 0.398, 0.255]),
      },
    };
  }

  // ------------------------------------------------------------------ state
  const R = (CORE.rider = {
    active: true,
    config: CFG,
    model: buildModel(),
    posture: { hang: 0, foreAft: 0, tuck: 0, stand: 0 }, // current (rate limited)
    target: { hang: 0, foreAft: 0, tuck: 0, stand: 0 }, // what the rider is doing (auto or manual)
    manual: { hang: null, foreAft: null, tuck: null, stand: null },
    pelvis: { m: 0, x: [0, 0, 0], v: [0, 0, 0] },
    upper: { m: 0, x: [0, 0, 0], v: [0, 0, 0] },
    initialized: false,
    forces: {},
    telemetry: {},
  });
  function syncMasses() {
    R.model = buildModel();
    R.pelvis.m = R.model.groups.pelvis.m;
    R.upper.m = R.model.groups.upper.m;
    R.rigid = [R.model.groups.feet, R.model.groups.hands];
  }
  syncMasses();
  const bikeSprungKg = (F) => Math.max(60, F.S.mSprung - R.model.totalKg);

  // ------------------------------------------------------------------ posture targets
  function targets() {
    const P = R.posture, G = R.model.groups;
    const pel = [
      G.pelvis.r[0] + P.hang * CFG.hangLatM,
      G.pelvis.r[1] + P.foreAft * CFG.foreAftM + P.stand * 0.03,
      G.pelvis.r[2] + P.stand * CFG.standUpM - Math.abs(P.hang) * 0.015,
    ];
    let V = sub(G.upper.r, G.pelvis.r);
    // tuck (+) folds the torso forward/down about the hips, sit-up (-) brings it back
    const a = (P.tuck >= 0 ? P.tuck * CFG.tuckDeg : P.tuck * CFG.sitUpDeg) * DEGR;
    V = [V[0], V[1] * Math.cos(a) + V[2] * Math.sin(a), -V[1] * Math.sin(a) + V[2] * Math.cos(a)];
    // lean-in: the torso and head go further inside than the pelvis
    const b = P.hang * CFG.leanInDeg * DEGR * (1 - 0.5 * P.stand);
    V = [V[0] * Math.cos(b) + V[2] * Math.sin(b), V[1], -V[0] * Math.sin(b) + V[2] * Math.cos(b)];
    return { pel, V, up: add(pel, V) };
  }
  const zetaC = (k, z, m) => k.map((kk, i) => 2 * z[i] * Math.sqrt(kk * m));

  // ------------------------------------------------------------------ coupling wrench + integration
  function riderWrench(F, Q) {
    if (!R.active) return;
    const q = F.q, p = F.p, ww = qrot(q, F.w), g = F.S.g, T = targets();
    const pelT = add(p, qrot(q, T.pel)), upT = add(p, qrot(q, T.up));
    const vAt = (pt) => add(F.v, cross(ww, sub(pt, p)));
    if (F.__lucidSettling || !R.initialized) {
      R.pelvis.x = pelT; R.pelvis.v = vAt(pelT);
      R.upper.x = upT; R.upper.v = vAt(upT);
      R.initialized = true;
    }
    const mp = R.pelvis.m, mu = R.upper.m, ws = CFG.spineWeightShare;
    // pelvis <-> bike (seat / knees / pegs)
    const Kp = CFG.pelvisK, Cp = zetaC(Kp, CFG.pelvisZeta, mp);
    const ep = qinv(q, sub(pelT, R.pelvis.x)), evp = qinv(q, sub(vAt(pelT), R.pelvis.v));
    const Fp = add(qrot(q, clampv(add(had(Kp, ep), had(Cp, evp)), CFG.pelvisLimitN)), [0, 0, (mp + ws * mu) * g]);
    // torso <-> pelvis (spine)
    const Ks = CFG.spineK, Cs = zetaC(Ks, CFG.spineZeta, mu), Vw = qrot(q, T.V);
    const es = qinv(q, sub(add(R.pelvis.x, Vw), R.upper.x)), evs = qinv(q, sub(add(R.pelvis.v, cross(ww, Vw)), R.upper.v));
    const Fs = add(qrot(q, clampv(add(had(Ks, es), had(Cs, evs)), CFG.spineLimitN)), [0, 0, ws * mu * g]);
    // torso <-> bars (arms)
    const Ka = CFG.armsK, Ca = zetaC(Ka, CFG.armsZeta, mu);
    const ea = qinv(q, sub(upT, R.upper.x)), eva = qinv(q, sub(vAt(upT), R.upper.v));
    const Fa = add(qrot(q, clampv(add(had(Ka, ea), had(Ca, eva)), CFG.armsLimitN)), [0, 0, (1 - ws) * mu * g]);
    R.forces = { pelvis: sub(Fp, Fs), upper: add(Fs, Fa), seat: Fp, spine: Fs, arms: Fa };
    // Reactions on the machine. A servo force between a rider mass and the bike is a joint
    // (seat/thighs/knees, arms), not a central spring: the bike takes the force *and* the joint
    // couple, i.e. the force acting at the rider mass's own position. That is what makes the
    // rider's weight act on the line through where the rider actually is (hang-off moments),
    // and it conserves angular momentum. The spine is internal to the rider; its couple
    // (torso held by hip torque) is passed to the bike through the pelvis and thighs.
    CH.addBodyForce(F, Q, mul(Fp, -1), R.pelvis.x);
    CH.addBodyForce(F, Q, mul(Fa, -1), R.upper.x);
    CH.addBodyMoment(F, Q, mul(cross(sub(R.upper.x, R.pelvis.x), Fs), -1));
    for (const part of R.rigid) CH.addBodyForce(F, Q, [0, 0, -part.m * g], add(p, qrot(q, part.r)));
  }
  function riderIntegrate(F, dt) {
    if (!R.active) return;
    const g = F.S.g;
    for (const [b, f] of [[R.pelvis, R.forces.pelvis], [R.upper, R.forces.upper]]) {
      if (!f) continue;
      b.v = add(b.v, mul([f[0], f[1], f[2] - b.m * g], dt / b.m));
      b.x = add(b.x, mul(b.v, dt));
    }
    updatePosture(F, dt);
  }

  // ------------------------------------------------------------------ mass matrix (bike + rigid rider parts)
  function addRigidPoint(F, mb, m, r) {
    const q = F.q, J = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((row) => row.concat([0, 0, 0, 0, 0, 0]));
    const axes = [V5_X, V5_Y, V5_UP];
    for (let j = 0; j < 3; j++) {
      const c = qrot(q, cross(axes[j], r));
      for (let k = 0; k < 3; k++) J[k][3 + j] = c[k];
    }
    for (let i = 0; i < 9; i++)
      for (let j = 0; j < 9; j++) {
        let s = 0;
        for (let k = 0; k < 3; k++) s += J[k][i] * J[k][j];
        mb.M[i][j] += m * s;
      }
    const b = qrot(q, cross(F.w, cross(F.w, r)));
    for (let i = 0; i < 9; i++) mb.C[i] += m * (J[0][i] * b[0] + J[1][i] * b[1] + J[2][i] * b[2]);
  }
  const baseMass = FP._massMatrixAndBias; // V5 bike model (the V1.28.5.2 rider patch lives on the instance)
  CH.massMatrix = function (F) {
    if (!R.active) return F._massMatrixAndBias();
    const S = F.S, save = S.mSprung;
    S.mSprung = bikeSprungKg(F);
    let mb;
    try {
      mb = baseMass.call(F);
    } finally {
      S.mSprung = save;
    }
    for (const part of R.rigid) addRigidPoint(F, mb, part.m, part.r);
    mb.riderCoupling = { mode: "LUCID_RIDER_BODY", sprungBikeKg: bikeSprungKg(F), rigidRiderKg: R.rigid.reduce((a, x) => a + x.m, 0) };
    return mb;
  };
  CH.sprungGravityMassKg = (F) => (R.active ? bikeSprungKg(F) : F.S.mSprung);
  CH.wrenches.push(riderWrench);
  CH.postIntegrate.push(riderIntegrate);

  // ------------------------------------------------------------------ posture: auto rider + manual input
  const keys = { hangL: false, hangR: false, tuck: false, back: false, stand: false };
  let lastAccel = { t: 0, v: 0, decelG: 0 };
  const filt = { latG: 0, roll: 0 };
  function autoTargets(F, dt) {
    const A = CFG.auto, t = { hang: 0, foreAft: 0, tuck: 0, stand: 0 };
    const fw = qrot(F.q, V5_Y), h = v5norm([fw[0], fw[1], 0]), V = v5dot(F.v, h), ww = qrot(F.q, F.w);
    const a = Math.min(1, dt / A.filterS);
    filt.latG += ((V * ww[2]) / F.S.g - filt.latG) * a;
    filt.roll += (v5bodyAngles(F.q).rollRad - filt.roll) * a;
    if (!A.enabled) return t;
    const side = Math.abs(filt.roll) > A.minLeanDeg * DEGR ? Math.sign(filt.roll) : 0;
    t.hang = side * A.style * smooth01((Math.abs(filt.latG) - A.hangStartG) / (A.hangFullG - A.hangStartG));
    t.tuck = (1 - Math.abs(t.hang)) * smooth01((V - A.tuckStartMps) / (A.tuckFullMps - A.tuckStartMps));
    // aero braking: sit up at the start of a hard stop from high speed only
    if (lastAccel.decelG > A.sitUpDecelG && V > A.sitUpMinMps)
      t.tuck = Math.min(t.tuck, -0.5 * smooth01((lastAccel.decelG - A.sitUpDecelG) / 0.4) * smooth01((V - A.sitUpMinMps) / 15));
    return t;
  }
  function updatePosture(F, dt) {
    const fw = qrot(F.q, V5_Y), h = v5norm([fw[0], fw[1], 0]), V = v5dot(F.v, h);
    if (lastAccel.t > 0) lastAccel.decelG += ((-(V - lastAccel.v) / dt / F.S.g) - lastAccel.decelG) * Math.min(1, dt / 0.12);
    lastAccel.t = 1;
    lastAccel.v = V;
    const auto = autoTargets(F, dt), man = R.manual;
    const kHang = (keys.hangR ? 1 : 0) - (keys.hangL ? 1 : 0), pad = readPad();
    const manualHang = kHang || pad.hang ? clamp(kHang + pad.hang, -1, 1) : man.hang;
    const manualTuck = keys.tuck || pad.tuck > 0 ? 1 : keys.back || pad.tuck < 0 ? -0.6 : man.tuck;
    const manualFore = keys.back || pad.tuck < 0 ? -1 : man.foreAft;
    R.target.hang = manualHang ?? auto.hang;
    R.target.tuck = manualTuck ?? auto.tuck;
    R.target.foreAft = manualFore ?? auto.foreAft;
    R.target.stand = keys.stand ? 1 : man.stand ?? auto.stand;
    for (const k of ["hang", "foreAft", "tuck", "stand"]) {
      const r = CFG.rates[k] * dt;
      R.posture[k] += clamp(R.target[k] - R.posture[k], -r, r);
    }
    CH.aero.posture = { tuck: clamp(0.35 + 0.65 * R.posture.tuck, 0, 1), hang: R.posture.hang };
  }
  let padPrev = { hang: 0, tuck: 0 }, padT = 0;
  function readPad() {
    if (global.__LUCID_ACTIVE_PAGE__ !== "RIDE") return { hang: 0, tuck: 0 };
    const now = performance.now();
    if (now - padT < 16) return padPrev; // poll at display rate, not per physics step
    padT = now;
    let gp = null;
    try {
      gp = [...(navigator.getGamepads?.() || [])].find(Boolean);
    } catch (_) {}
    if (!gp) return (padPrev = { hang: 0, tuck: 0 });
    const b = (i) => !!gp.buttons?.[i]?.pressed;
    const out = { hang: (b(15) ? 1 : 0) - (b(14) ? 1 : 0), tuck: (b(12) ? 1 : 0) - (b(13) ? 1 : 0) };
    padPrev = out;
    return out;
  }
  const KEYMAP = { KeyJ: "hangL", KeyL: "hangR", KeyI: "tuck", KeyK: "back", KeyU: "stand" };
  function onKey(e, down) {
    if (global.__LUCID_ACTIVE_PAGE__ !== "RIDE") return;
    const tag = (e.target?.tagName || "").toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (e.code === "KeyO" && down && !e.repeat) {
      CFG.auto.enabled = !CFG.auto.enabled;
      return;
    }
    const k = KEYMAP[e.code];
    if (k) keys[k] = down;
  }
  global.addEventListener?.("keydown", (e) => onKey(e, true));
  global.addEventListener?.("keyup", (e) => onKey(e, false));
  global.addEventListener?.("blur", () => { for (const k of Object.keys(keys)) keys[k] = false; });

  // ------------------------------------------------------------------ drive the legacy rider pose
  let visualAcc = 0, lastHang = 0, fullHangDelta = null;
  function driveVisuals(F, dt) {
    visualAcc += dt;
    if (visualAcc < 1 / CFG.visualHz) return;
    const h = visualAcc;
    visualAcc = 0;
    try {
      const C = global.LUCID_CORNER_BALANCE_V12862, RC = global.LUCID_RIDER_CONTROL_V12853;
      if (C?.setDynamicHangState) {
        if (fullHangDelta === null) fullHangDelta = Math.abs(C.surfaceComDelta?.(1)?.[0] || 0.12) || 0.12;
        // rider COM lateral offset (bike frame) from the physical body -> visual hang value
        const q = F.q, G = R.model.groups;
        const xp = qinv(q, sub(R.pelvis.x, F.p)), xu = qinv(q, sub(R.upper.x, F.p));
        const dx = (R.pelvis.m * (xp[0] - G.pelvis.r[0]) + R.upper.m * (xu[0] - G.upper.r[0])) / R.model.totalKg;
        const hv = clamp(dx / fullHangDelta, -1, 1);
        C.setExternalDynamicsDrive?.(true);
        C.setDynamicHangState(hv, (hv - lastHang) / h);
        lastHang = hv;
      }
      if (RC?.controls) {
        RC.controls.seatForeAft = clamp(R.posture.foreAft, -1, 1);
        RC.controls.posture = clamp(-R.posture.tuck, -1, 1);
      }
    } catch (_) {}
  }
  CH.postIntegrate.push((F, dt) => { if (R.active && !F.__rttLite) driveVisuals(F, dt); else if (R.active) visualAcc += dt; });

  // ------------------------------------------------------------------ reset + telemetry + API
  const prevReset = FP.reset;
  FP.reset = function (...args) {
    syncMasses(); // the mass authority boots after the core layers; pick it up on every reset
    R.initialized = false;
    for (const k of Object.keys(R.posture)) R.posture[k] = 0;
    lastAccel = { t: 0, v: 0, decelG: 0 };
    filt.latG = 0;
    filt.roll = 0;
    return prevReset.apply(this, args);
  };
  const prevCompute = FP.compute;
  FP.compute = function () {
    const M = prevCompute.call(this);
    if (M && !this.__rttLite && R.active && R.initialized) {
      const q = this.q, G = R.model.groups;
      const xp = qinv(q, sub(R.pelvis.x, this.p)), xu = qinv(q, sub(R.upper.x, this.p));
      const com = add(mul(xp, R.pelvis.m), mul(xu, R.upper.m));
      for (const part of R.rigid) for (let k = 0; k < 3; k++) com[k] += part.m * part.r[k];
      M.rider = {
        schema: "lucid.core.rider-body.v1", massKg: R.model.totalKg, posture: { ...R.posture }, target: { ...R.target }, auto: CFG.auto.enabled,
        pelvisOffsetM: sub(xp, G.pelvis.r), upperOffsetM: sub(xu, G.upper.r), comBodyM: mul(com, 1 / R.model.totalKg),
        seatForceN: qinv(q, R.forces.seat || [0, 0, 0]), armsForceN: qinv(q, R.forces.arms || [0, 0, 0]),
      };
    }
    return M;
  };
  R.setPosture = (patch = {}) => {
    for (const k of Object.keys(R.manual)) if (k in patch) R.manual[k] = patch[k] === null ? null : clamp(+patch[k], k === "stand" ? 0 : -1, 1);
    return { ...R.manual };
  };
  R.setAuto = (on) => (CFG.auto.enabled = !!on);
  R.setActive = (on) => {
    R.active = !!on;
    R.initialized = false;
    return R.active;
  };
  R.rebuild = (comSource) => {
    if (comSource) CFG.comSource = comSource;
    syncMasses();
    R.initialized = false;
    return { comSource: CFG.comSource, groups: R.model.groups, liveComAtBoot };
  };
  R.state = () => ({ posture: { ...R.posture }, target: { ...R.target }, manual: { ...R.manual }, auto: CFG.auto.enabled, pelvis: { ...R.pelvis }, upper: { ...R.upper } });
  global.__LUCID_CORE_RIDER_READY__ = true;
})(typeof window !== "undefined" ? window : globalThis);
