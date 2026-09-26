// LUCID MOTO core · the physical rider off the bike: on her feet (stand, walk, run, turn)
// ------------------------------------------------------------------------------------------
// The same articulated body, contacts and joint-torque servos as riding (46_rider_biomech.js);
// this layer plans for them when she is off the bike (R.plan.fallen, R.plan.mode):
//   * foot  - standing, walking, running and turning where the player steers her
// Balance: foot placement from her centre of mass (a Raibert / capture-point step target), her
// weight and speed through the stance legs (virtual-model forces, tau = J^T F), the pelvis's
// orientation through the stance hip servos (legs solved from the planned pelvis orientation),
// plus one declared balance assist: a spring-damper torque on the pelvis towards upright and her
// heading, capped (assistMaxNm), not a muscle - reported in stats.
// Joint-torque servos (motor-driven), not muscle-driven. Every gain and timing here is a declared
// prior, not measured on her.
(function (global) {
  "use strict";
  const DEG = Math.PI / 180;

  function install(R) {
    if (R.onFoot) return R.onFoot;
    const I = R.internal, PL = R.plan, hp = R.helpers, b = R.body, ikb = I.ikb, H = I.H, L = I.L;
    const { add, sub, scl, dot, cross, len, unit, mv, mtv, mm, mt, clamp, lerp, smooth01, Rx, Rz, logSO3 } = hp;
    const NH = H.length, foot = R.foot, hand = R.hand, pelvis = 0, m = I.riderMassKg, g = 9.81;
    const hi = (id) => I.hingeIndex[id], lk = (id) => H[I.hingeIndex[id]].link;
    // model frame (y up, -z forward) -> world, facing +y
    const A = [1, 0, 0, 0, 0, -1, 0, 1, 0];
    const fwdOf = (psi) => [-Math.sin(psi), Math.cos(psi), 0], rightOf = (psi) => [Math.cos(psi), Math.sin(psi), 0];
    const flat = (v) => [v[0], v[1], 0];
    const legDofs = { L: R.chains.legL, R: R.chains.legR };
    const armDofs = { L: R.chains.armL, R: R.chains.armR };
    const ankleDofs = { L: R.chains.legL.filter((i) => /Ankle\.(dorsiPlantarflexion|inversionEversion)/.test(H[i].id)), R: R.chains.legR.filter((i) => /Ankle\.(dorsiPlantarflexion|inversionEversion)/.test(H[i].id)) };

    // ---- declared priors
    const P = {
      hipH: 0.885, hipDropWalk: 0.035, hipDropRun: 0.03, // pelvis over the ground standing (rest 0.907 m, knees soft); lower walking / running
      stepHalfW: 0.085, // each foot this far out from her line of travel
      walkMps: 1.4, runMps: 3.4, accel: 1.8, decel: 2.8, turnRate: 2.5, turnRateStand: 1.0, latAccMax: 2.0, reverseDeg: 100, pelvisYawMaxDeg: 40, stepYawMaxDeg: 70, headingLeadDeg: 100,
      stepS: { walk: 0.52, run: 0.34 }, dsFrac: { walk: 0.18, run: 0 }, swingH: { walk: 0.07, run: 0.11 },
      standMargin: 0.06, latMinM: 0.02, speedK: 0.15, minSepM: 0.12, // reactive step once her capture point leaves the feet by standMargin; step-placement speed feedback (s)
      ankleStanceGain: 0.12, swingHoriz: 0.95, shiftMaxS: 0.35, reachWalk: 0.55, reachRun: 0.75, // a foot on the ground: its ankle servo this soft (the pressure control drives it); swing path; weight shift at most
      // pelvis height (N/m, N s/m); capture point to the middle of the feet standing (1/s); speed
      // moving (1/s)
      kz: 4000, cz: 700, dcmK: 2.5, kv: 2.5,
      assistK: 800, assistC: 90, assistYawK: 300, assistYawC: 40, assistMaxNm: 120,
      catchR: 0.3, catchR2: 0.15, catchRperMps: 0.12, catchK: 1.5, catchMaxN: 500, // capture-point catch beyond a step's reach (m single / m past the feet standing, x m w^2, N; declared assist)
      armSwingDeg: { walk: 16, run: 32 }, elbowDeg: { walk: 18, run: 85 }, leanDeg: { walk: 3, run: 9 },
      restMps: 0.25, restS: 0.6, dazeS: 1.5, reachBikeM: 1.3, // come to rest, a moment on the ground, then up; F acts within this of the bike's seat
      fallZ: 0.55, fallTiltDeg: 55, // on her feet: pelvis this low or trunk this tilted - she is down
      all4H: 0.5, squatH: 0.55, tuckPitchDeg: 30, tuckFwdM: 0.06, riseS: 1.2, getUpTolM: 0.08, // pelvis on hands and knees; the squat (hands down) over the feet: height, trunk pitch above horizontal, ahead of the feet; rising // pelvis over the ground on hands and knees / half-kneeling; a phase's pose reached within
      getUpK: 900, getUpC: 110, getUpMaxNm: 200, getUpKp: 2500, getUpCp: 400, getUpMaxN: 150, // get-up assist (declared): torque and force on the pelvis towards the phase's pose
    };
    const G = {
      P, heading: 0, vDes: [0, 0], vCmd: [0, 0], run: false, strafe: false,
      phase: "double", stance: "L", t: 0, stepT: 0.5,
      feet: { L: { plant: null, fwd: null, from: null, to: null }, R: { plant: null, fwd: null, from: null, to: null } },
      com: [0, 0, 0], vcom: [0, 0, 0], ikAcc: 0,
      stats: { assistNm: 0, assistRms: 0, steps: 0, maxTilt: 0 },
    };
    R.onFoot = G;

    // IK preferences on foot (degrees, weight): a natural stance
    const PREF_FOOT = {};
    for (const [id, deg, w] of [
      ["leftHip.flexionExtension", 5, 0.01], ["rightHip.flexionExtension", 5, 0.01], ["leftHip.abductionAdduction", 0, 0.05], ["rightHip.abductionAdduction", 0, 0.05],
      ["leftHip.axialRotation", 0, 0.2], ["rightHip.axialRotation", 0, 0.2], ["leftKnee.flexionExtension", 12, 0.01], ["rightKnee.flexionExtension", 12, 0.01],
      ["leftKnee.axialRotation", 0, 0.5], ["rightKnee.axialRotation", 0, 0.5], ["leftAnkle.dorsiPlantarflexion", 0, 0.02], ["rightAnkle.dorsiPlantarflexion", 0, 0.02],
      ["leftAnkle.inversionEversion", 0, 0.1], ["rightAnkle.inversionEversion", 0, 0.1], ["leftAnkle.axialRotation", 0, 0.3], ["rightAnkle.axialRotation", 0, 0.3],
      ["spine01.flexionExtension", 0, 0.01], ["spine02.flexionExtension", 0, 0.01], ["spine01.lateralBend", 0, 0.02], ["spine02.lateralBend", 0, 0.02],
      ["spine01.axialRotation", 0, 0.02], ["spine02.axialRotation", 0, 0.02], ["neck.flexionExtension", 0, 0.05], ["head.nod", 0, 0.05],
      ["neck.lateralBend", 0, 0.05], ["head.tilt", 0, 0.05], ["neck.axialRotation", 0, 0.05], ["head.turn", 0, 0.05],
    ]) if (id in I.hingeIndex) PREF_FOOT[hi(id)] = [deg * DEG, w];

    const pelvisR = (psi, pitch = 0) => mm(Rz(psi), mm(Rx(-pitch), A));
    // hip joint to the sole, leg straight (rest pose)
    const legLen = R.model.B[R.model.TI.L_Thigh][1];
    // pelvis height for her speed: lower walking faster and running (longer steps need it)
    const hipHeight = () => {
      const v = Math.hypot(G.vCmd[0], G.vCmd[1]), h = P.hipH - P.hipDropWalk * smooth01(v / P.walkMps) - (G.run ? P.hipDropRun * smooth01((v - P.walkMps) / (P.runMps - P.walkMps)) : 0);
      return G.rise ? lerp(G.rise.h0, h, riseS()) : h;
    };
    // rising from a squat (after getting up): pelvis height and forward pitch ramp to standing
    const riseS = () => (G.rise ? smooth01(G.rise.t / G.rise.dur) : 1);
    const risePitch = () => (G.rise ? G.rise.pitch0 * (1 - riseS()) : 0);
    const ballW = (S) => b.toWorld(foot[S].link, foot[S].ball);
    const heelW = (S) => b.toWorld(foot[S].link, foot[S].heel);
    const footLoad = (S) => I.footOnGroundN(S);
    const other = (S) => (S === "L" ? "R" : "L");
    const groundZ = (x, y) => (R.lastGround ? R.lastGround.height(x, y) : 0);

    // ---- placing her standing (tests, dismounting): rest pose, arms down, knees soft
    function standingPose() {
      const q = new Float64Array(L.length);
      const set = (id, deg) => { if (id in I.hingeIndex) q[lk(id)] = deg * DEG; };
      for (const S of ["left", "right"]) {
        set(S + "Shoulder.abductionAdduction", -62); set(S + "Elbow.flexionExtension", 15);
        set(S + "Hip.flexionExtension", 5); set(S + "Knee.flexionExtension", 12); set(S + "Ankle.dorsiPlantarflexion", 7);
      }
      return q;
    }
    G.placeStanding = (pos, psi = 0) => {
      b.q.set(standingPose());
      b.R = pelvisR(psi);
      b.p = [pos[0], pos[1], (pos[2] ?? 0) + 1];
      b.kinematics();
      let zmin = 1e9;
      for (const s of R.spheres) if (s.kind === "sole") zmin = Math.min(zmin, b.toWorld(s.link, s.c)[2] - s.r);
      b.p = [pos[0], pos[1], b.p[2] - zmin + (pos[2] ?? 0) + 0.001];
      b.kinematics();
      // her centre of mass over the middle of her feet: she leans forward at the ankles (the whole
      // body turning about them) until it is
      for (let it = 0; it < 3; it++) {
        const mid = scl(["L", "R"].reduce((a, S) => add(a, add(flat(ballW(S)), flat(heelW(S)))), [0, 0, 0]), 0.25), c = I.comWorld();
        const fw = fwdOf(psi), d = dot(sub(mid, flat(c)), fw), an = b.toWorld(foot.L.link, [0, 0, 0]), zc = c[2] - an[2], th = Math.atan2(d, zc);
        b.R = mm(hp.expRV(scl(rightOf(psi), -th)), b.R); // the body turns forward about the ankles...
        for (const S of ["left", "right"]) b.q[lk(S + "Ankle.dorsiPlantarflexion")] += th; // ...the feet stay flat
        b.kinematics();
        // (the feet back where they were: the body turned about the ankles)
        const an2 = b.toWorld(foot.L.link, [0, 0, 0]);
        b.p = add(b.p, sub(an, an2));
        b.kinematics();
      }
      zmin = 1e9;
      for (const s of R.spheres) if (s.kind === "sole") zmin = Math.min(zmin, b.toWorld(s.link, s.c)[2] - s.r);
      b.p = [b.p[0], b.p[1], b.p[2] - zmin + (pos[2] ?? 0) + 0.001];
      b.vb = [0, 0, 0, 0, 0, 0]; b.qd.fill(0);
      b.kinematics();
      for (const s of R.spheres) { s.bike.on = s.peg.on = s.ground.on = false; s.bike.anchor = s.peg.anchor = s.ground.anchor = null; }
      for (const S of ["L", "R"]) { const gr = R.grips[S]; gr.held = false; gr.F = [0, 0, 0]; gr.T = [0, 0, 0]; }
      for (let i = 0; i < L.length; i++) { R.qT[i] = b.q[i]; R.qdT[i] = 0; }
      Object.assign(PL, { fallen: true, fallenS: 0, mode: "foot", modeS: 0, ff: "custom", holdingBike: false });
      G.enterFoot(psi);
    };
    G.enterFoot = (psi, rise = null) => {
      G.rise = rise;
      G.heading = psi ?? headingOfBody();
      G.vDes = [0, 0]; G.vCmd = [0, 0]; G.phase = "double"; G.t = 0;
      for (const S of ["L", "R"]) { const F = G.feet[S]; F.plant = ballW(S); F.fwd = fwdOf(G.heading); F.from = F.to = null; }
      R.tauVF.fill(0); R.qdT.fill(0);
      R.servoScale.fill(1);
      R.activation = 0.5;
      G.planned = false; G.shiftTo = null; G.lastSwingEnd = false;
      PL.mode = "foot"; PL.modeS = 0; PL.ff = "custom";
    };
    function headingOfBody() {
      const f = mv(b.R, [0, 0, -1]); // the pelvis's forward (model -z)
      return Math.atan2(-f[0], f[1]);
    }

    // ---- per-step state
    function measure() {
      const T = R.totals();
      G.com = T.com; G.vcom = scl(T.P, 1 / T.mass);
    }

    // ---- the gait: which foot is on the ground, where the other one goes
    // Standing: both feet. To step she first moves her weight over the foot that stays (shiftTo),
    // then lifts the other (swing) and sets it down where her capture point (DCM) will be, offset
    // for the speed she wants; on touchdown that foot takes the weight for the next step.
    const footMid = (S) => scl(add(flat(ballW(S)), flat(heelW(S))), 0.5);
    // turning is stepping: the pelvis faces at most pelvisYawMaxDeg away from the foot (feet) it
    // stands on, and each step sets the foot down turned at most stepYawMaxDeg further
    const yawOf = (f) => Math.atan2(-f[0], f[1]);
    const footYaw = (S) => yawOf(G.feet[S].fwd || fwdOf(G.heading));
    const clampYaw = (psi, about, max) => about + clamp(angWrap(psi - about), -max, max);
    function pelvisYaw() {
      if (G.phase === "single") return clampYaw(G.heading, footYaw(G.stance), P.pelvisYawMaxDeg * DEG);
      const a = footYaw("L"), mid = a + angWrap(footYaw("R") - a) / 2;
      return clampYaw(G.heading, mid, P.pelvisYawMaxDeg * DEG);
    }
    const stepYaw = () => clampYaw(G.heading, footYaw(G.stance), P.stepYawMaxDeg * DEG);
    const omega = () => Math.sqrt(g / Math.max(0.5, G.com[2] - groundZ(G.com[0], G.com[1])));
    const dcm = () => add(flat(G.com), scl(flat(G.vcom), 1 / omega()));
    function gait(dt) {
      const run = G.run, Ts = run ? P.stepS.run : P.stepS.walk, ds = run ? P.dsFrac.run : P.dsFrac.walk;
      const speed = Math.hypot(G.vCmd[0], G.vCmd[1]), vc = Math.hypot(G.vcom[0], G.vcom[1]);
      G.t += dt;
      if (G.phase === "double") {
        const xi = dcm(), sup = supportCheck(xi);
        const fdir = (S) => Math.atan2(-G.feet[S].fwd[0], G.feet[S].fwd[1]);
        const turn = Math.abs(angWrap(G.heading - fdir("L"))) > 20 * DEG || Math.abs(angWrap(G.heading - fdir("R"))) > 20 * DEG;
        if (!G.shiftTo && (speed > 0.05 || turn || !sup.inside)) {
          // the foot that stays: the one on the far side from where she is going / falling
          const dir = speed > 0.05 ? [G.vCmd[0], G.vCmd[1], 0] : sub(xi, sup.c);
          const pz = pelvisYaw(), rt = rightOf(pz), lat = dot(dir, rt), fwd = dot(dir, fwdOf(pz));
          let st;
          const dn = Math.hypot(lat, fwd) || 1;
          if (Math.abs(lat) > 0.1 * dn) st = lat > 0 ? "L" : "R"; // going (partly) right: stand on the left, step right
          else { const lead = dot(sub(footMid("L"), footMid("R")), fwdOf(pz)) * Math.sign(fwd || 1); st = Math.abs(lead) > 0.03 ? (lead > 0 ? "L" : "R") : footLoad("L") > footLoad("R") ? "L" : "R"; } // the leading (else the loaded) foot
          G.shiftTo = st; G.t = 0;
        }
        if (G.shiftTo) {
          // her capture point brought to just inside the foot that stays (towards the one that will
          // step), then she lifts the other. Outside that foot instead (away from the stepping
          // side), it is that foot that steps; beyond the other foot, that one steps now (a catch).
          // (measured across her line: from the foot that stays towards the other, square to where
          // her pelvis faces - whichever way the feet point mid-turn)
          let st = G.shiftTo;
          const o = dcmOffsets();
          if (across(xi, st) < -0.04 && across(xi, other(st)) > across(xi, st)) { st = G.shiftTo = other(st); }
          const sw = other(st), e = across(xi, st) - o.lat, beyond = across(xi, sw) < 0;
          const share = footLoad(st) / Math.max(1, footLoad("L") + footLoad("R"));
          if (beyond || (e > -0.015 && share > 0.5) || (G.t > P.shiftMaxS && e > -0.015)) { startSwing(sw, Ts * (1 - ds)); G.shiftTo = null; }
        }
      } else {
        const sw = other(G.stance), F = G.feet[sw];
        const touched = G.t > 0.5 * G.stepT && footLoad(sw) > 60;
        if (touched || G.t >= G.stepT * 1.25) {
          if (F.to) { const e = len(sub(flat(ballW(sw)), flat(F.to))); G.stats.landErr = e; G.stats.landErrSum = (G.stats.landErrSum || 0) + e; G.stats.landN = (G.stats.landN || 0) + 1; }
          F.plant = ballW(sw); F.fwd = fwdOf(G.stepPsi ?? G.heading); F.from = F.to = null;
          G.stats.steps++;
          G.phase = "double"; G.t = 0; G.lastSwingEnd = true;
          // still moving (or not yet at rest): the landed foot takes the weight next
          // (told to stop, facing where she should and her capture point within her feet: she stands)
          const xi = dcm(), sup = supportCheck(xi);
          const turning = Math.abs(angWrap(G.heading - footYaw("L"))) > 20 * DEG || Math.abs(angWrap(G.heading - footYaw("R"))) > 20 * DEG;
          if (speed > 0.05 || !sup.inside || turning) G.shiftTo = sw;
          else { G.shiftTo = null; G.lastSwingEnd = false; }
        }
      }
    }
    function startSwing(sw, T) {
      G.phase = "single"; G.stance = other(sw); G.t = 0; G.stepT = T;
      const F = G.feet[sw];
      F.from = ballW(sw); F.plant = null;
    }
    const angWrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    function supportCheck(cp) {
      // the support: both feet (ball and heel of each), inflated by standMargin
      const pts = ["L", "R"].flatMap((S) => [ballW(S), heelW(S)]);
      const c = scl(pts.reduce((a, p) => add(a, flat(p)), [0, 0, 0]), 1 / pts.length);
      const pz = pelvisYaw(), fw = fwdOf(pz), rt = rightOf(pz);
      let fmin = 1e9, fmax = -1e9, rmin = 1e9, rmax = -1e9;
      for (const p of pts) { const d = sub(flat(p), c); fmin = Math.min(fmin, dot(d, fw)); fmax = Math.max(fmax, dot(d, fw)); rmin = Math.min(rmin, dot(d, rt)); rmax = Math.max(rmax, dot(d, rt)); }
      const d = sub(flat(cp), c), df = dot(d, fw), dr = dot(d, rt), mg = P.standMargin;
      const inside = df > fmin - mg && df < fmax + mg && dr > rmin - mg && dr < rmax + mg;
      return { inside, side: dr < 0 ? "L" : "R", c };
    }

    // steady-gait offsets of the capture point from the foot that carries her: ahead by
    // l / (e^wT - 1) for steps of length l = v T, inside by W / (e^wT + 1) (at least latMinM)
    function dcmOffsets() {
      const w0 = omega(), Tn = G.run ? P.stepS.run : P.stepS.walk, e = Math.exp(w0 * Tn);
      return { fwd: scl([G.vCmd[0], G.vCmd[1], 0], Tn / (e - 1)), lat: Math.max(P.latMinM, (2 * P.stepHalfW) / (e + 1)) };
    }
    // across her line: the unit vector from foot S towards the other, square to her pelvis's
    // forward; across(x, S) = how far x is from foot S that way
    function acrossDir(S) {
      const fw = fwdOf(pelvisYaw()), d = sub(footMid(other(S)), footMid(S)), u = sub(d, scl(fw, dot(d, fw))), n = len(u);
      return n > 0.03 ? scl(u, 1 / n) : scl(rightOf(pelvisYaw()), S === "L" ? 1 : -1);
    }
    const across = (x, S) => dot(sub(flat(x), footMid(S)), acrossDir(S));
    function shiftTarget(st) {
      const o = dcmOffsets();
      return add(add(footMid(st), scl(acrossDir(st), o.lat)), o.fwd);
    }
    // ---- where the swing foot lands: her capture point at touchdown (the DCM diverging from the
    // stance foot's pressure), less the offset that keeps her going at the speed she wants
    // (l / (e^wT - 1) for steps of length l), and out to its side by the lateral offset of steady
    // steps of the planned width (W / (e^wT + 1))
    function landingTarget(sw) {
      const w0 = omega(), tl = Math.max(0, G.stepT - G.t), Tn = G.run ? P.stepS.run : P.stepS.walk;
      const xi = dcm(), pst = footMid(G.stance);
      const xiTd = add(pst, scl(sub(xi, pst), Math.exp(w0 * tl)));
      const psiS = stepYaw(), pz = pelvisYaw();
      G.stepPsi = psiS;
      // (her pelvis's frame: the one her legs work in, whichever way the feet point mid-turn)
      const fw = fwdOf(pz), rt = rightOf(pz), side = sw === "L" ? -1 : 1;
      const o = dcmOffsets();
      let p = add(sub(xiTd, o.fwd), scl(rt, side * o.lat));
      // (speed feedback along where she faces: slower than wanted, the foot lands shorter - her
      // capture point further ahead of it - and she speeds up; faster, longer. Sideways the capture
      // point alone places it.)
      p = sub(p, scl(fw, dot(sub([G.vCmd[0], G.vCmd[1], 0], flat(G.vcom)), fw) * P.speedK));
      // (never across or onto the stance foot)
      const st = footMid(G.stance), acr = dot(sub(p, st), rt) * side;
      if (acr < P.minSepM) p = add(p, scl(rt, side * (P.minSepM - acr)));
      // (within a leg's reach of her hip joint)
      const hj = b.toWorld(R.model.linkOf[sw + "_Thigh"], [0, 0, 0]), maxR = G.run ? P.reachRun : P.reachWalk;
      const hjf = add(flat(hj), scl(fw, 0.08)), d = sub(p, hjf), dl = len(d);
      if (dl > maxR) p = add(hjf, scl(d, maxR / dl));
      // the ball of the foot, not its middle
      p = add(p, scl(fwdOf(psiS), 0.08));
      p[2] = groundZ(p[0], p[1]);
      return p;
    }

    // ---- the swing foot's path: horizontally from lift-off to the landing spot (smoothstep, there
    // by swingHoriz of the swing), up by the swing height and down onto the ground - 15 mm into
    // it, so it lands on time - at its end. Position and velocity (world).
    function swingPath(F, run) {
      const s = clamp(G.t / G.stepT, 0, 1), dsdt = 1 / G.stepT, h = run ? P.swingH.run : P.swingH.walk;
      const sh = clamp(s / P.swingHoriz, 0, 1), e = sh * sh * (3 - 2 * sh), de = sh < 1 ? (6 * sh * (1 - sh)) / P.swingHoriz : 0;
      const d = sub(F.to, F.from), p = add(F.from, scl(d, e)), v = scl(d, de * dsdt);
      const u = Math.min(1, s / 0.9), w = clamp((s - 0.7) / 0.3, 0, 1);
      p[2] = lerp(F.from[2], F.to[2], e) + h * Math.sin(Math.PI * u) - 0.015 * w * w * (3 - 2 * w);
      v[2] = d[2] * de * dsdt + (s < 0.9 ? (h * Math.PI * Math.cos(Math.PI * u)) / 0.9 : 0) * dsdt - (s > 0.7 ? (0.015 * 6 * w * (1 - w)) / 0.3 : 0) * dsdt;
      return { p, v };
    }
    // ---- targets and joint set-points
    function plan(dtp) {
      const run = G.run, psi = pelvisYaw();
      G.psiP = psi;
      const lean = (run ? P.leanDeg.run : P.leanDeg.walk) * smooth01(Math.hypot(G.vCmd[0], G.vCmd[1]) / P.walkMps);
      const rp = risePitch(), Rp = pelvisR(psi, rp), Rc = pelvisR(psi, lean * DEG + 0.6 * rp), Rh = pelvisR(psi, -2 * DEG + 0.3 * rp);
      // legs: stance from the planned pelvis orientation at its planned height (the servos hold
      // them there); swing from the pelvis as it is, the foot where it is sent
      // (standing still the pelvis is planned where her centre of mass is over the middle of her
      // feet - the ankles then hold her there; moving, from where it is)
      let base = [b.p[0], b.p[1], groundZ(b.p[0], b.p[1]) + hipHeight()];
      if (G.phase === "double" && Math.hypot(G.vCmd[0], G.vCmd[1]) < 0.05) {
        const c = scl(["L", "R"].reduce((a, S) => add(a, add(flat(ballW(S)), flat(heelW(S)))), [0, 0, 0]), 0.25);
        base = add(base, flat(sub(c, G.com)));
      }
      ikb.q.set(b.q);
      const feetT = {};
      for (const S of ["L", "R"]) {
        const F = G.feet[S];
        if (F.from) {
          F.to = landingTarget(S);
          feetT[S] = { p: swingPath(F, run).p, fwd: fwdOf(G.stepPsi ?? psi), swing: true };
        } else feetT[S] = { p: F.plant, fwd: F.fwd || fwdOf(psi), swing: false };
      }
      for (const S of ["L", "R"]) {
        const t = feetT[S];
        ikb.p = t.swing ? b.p.slice() : base; ikb.R = t.swing ? b.R.slice() : Rp;
        const kl = I.kneeLink[S];
        if (ikb.q[kl] < I.KNEE_SEED) ikb.q[kl] = I.KNEE_SEED;
        ikb.kinematics();
        const tasks = [
          { type: "pos", link: foot[S].link, local: foot[S].ball, target: t.p, w: 100 },
          { type: "dir", link: foot[S].link, local: foot[S].forward, target: t.fwd, w: 1 },
          { type: "dir", link: foot[S].link, local: [0, 1, 0], target: [0, 0, 1], w: 2 },
        ];
        I.ikSolve(ikb, tasks, legDofs[S], PREF_FOOT, 2);
      }
      // trunk and head (from the pelvis as it is)
      ikb.p = b.p.slice(); ikb.R = b.R.slice(); ikb.kinematics();
      I.ikSolve(ikb, [{ type: "rot", link: R.model.linkOf.Spine02, target: Rc, w: 1 }], R.chains.spine, PREF_FOOT, 2);
      I.ikSolve(ikb, [{ type: "rot", link: R.model.linkOf.Head, target: Rh, w: 1 }], R.chains.neck, PREF_FOOT, 2);
      // targets and their rates (the servos' damping works about the planned motion, not
      // against it: a swinging leg held to zero joint speed lags its path and overshoots)
      const ikSet = legDofs.L.concat(legDofs.R, R.chains.spine, R.chains.neck);
      for (const i of ikSet) {
        const li = H[i].link, q1 = ikb.q[li];
        const rate = dtp > 0 && G.planned ? clamp((q1 - R.qT[li]) / dtp, -12, 12) : 0;
        R.qdT[li] += (rate - R.qdT[li]) * 0.5;
        R.qT[li] = q1;
      }
      G.planned = true;
      // arms: hanging, swinging against the legs
      const sw = G.phase === "single" ? (G.stance === "L" ? 1 : -1) * Math.sin(Math.PI * clamp(G.t / G.stepT, 0, 1)) : 0;
      const amp = (run ? P.armSwingDeg.run : P.armSwingDeg.walk) * smooth01(Math.hypot(G.vcom[0], G.vcom[1]) / 0.8);
      const elbow = lerp(P.elbowDeg.walk, P.elbowDeg.run, run ? smooth01(Math.hypot(G.vcom[0], G.vcom[1]) / 2) : 0);
      for (const [S, s] of [["left", 1], ["right", -1]]) {
        const set = (id, deg) => { if (id in I.hingeIndex) R.qT[lk(id)] = deg * DEG; };
        set(S + "Shoulder.flexionExtension", s * sw * amp + (G.rise ? 55 * (1 - riseS()) : 0)); // (rising, arms forward)
        set(S + "Shoulder.abductionAdduction", -62); set(S + "Shoulder.axialRotation", 0);
        set(S + "Elbow.flexionExtension", elbow + (run ? 0 : 6 * Math.max(0, s * sw)));
        set(S + "Clavicle.protractionRetraction", 0); set(S + "Clavicle.elevationDepression", 0);
      }
      for (const S of ["L", "R"]) for (const i of armDofs[S]) R.qdT[H[i].link] = 0;
    }

    // ---- stance legs carry her: weight + height, and speed / balance, as forces through the feet
    function support() {
      R.tauVF.fill(0);
      const stance = G.phase === "double" ? ["L", "R"] : [G.stance];
      const zg = groundZ(b.p[0], b.p[1]), vp = b.pointVelocity(pelvis, [0, 0, 0]);
      let Fz = m * g + P.kz * (zg + hipHeight() - b.p[2]) - P.cz * vp[2];
      Fz = clamp(Fz, 0, 2.5 * m * g);
      // where her feet should press (the centre of pressure): the ground's push on her points from
      // there at her centre of mass (an inverted pendulum: no moment about it), and moves it by
      // g (x - p) / z. Standing, the capture point is steered to the middle of her feet; moving,
      // the pressure goes behind her centre of mass to speed up, ahead of it to slow down.
      const zc = Math.max(0.5, G.com[2] - groundZ(G.com[0], G.com[1])), w0 = Math.sqrt(g / zc);
      const xi = add(flat(G.com), scl(flat(G.vcom), 1 / w0));
      let pDes;
      const vd = [G.vCmd[0], G.vCmd[1], 0];
      if (G.phase === "double" && G.shiftTo) {
        // moving her weight over the foot that stays: its capture point steered there
        pDes = add(xi, scl(sub(xi, shiftTarget(G.shiftTo)), P.dcmK * 1.5 / w0));
      } else if (G.phase === "double") {
        const c = scl(["L", "R"].reduce((a, S) => add(a, add(flat(ballW(S)), flat(heelW(S)))), [0, 0, 0]), 0.25);
        pDes = add(xi, scl(sub(xi, c), P.dcmK / w0));
      } else {
        // one foot: pressure in its middle, moved behind / ahead to speed up / slow down
        const a = scl(sub(vd, flat(G.vcom)), P.kv);
        pDes = sub(footMid(G.stance), scl(a, zc / g));
      }
      G.pSt = G.phase === "single" ? copPoint(G.stance, pDes) : null;
      G.pDes = pDes;
      const loaded = stance.filter((S) => footLoad(S) > 20 || stance.length === 1);
      if (!loaded.length) return;
      // two feet: the vertical force split so that their pressures add up at pDes as far as they can
      let wts = [1];
      if (loaded.length === 2) {
        const cL = copPoint("L", pDes), cR = copPoint("R", pDes), d = sub(flat(cR), flat(cL)), dd = dot(d, d);
        const a = dd > 1e-6 ? clamp(dot(sub(pDes, flat(cL)), d) / dd, 0.05, 0.95) : 0.5;
        wts = [1 - a, a];
      }
      loaded.forEach((S, k) => {
        const pw = copPoint(S, pDes), Fzk = Fz * wts[k], r = sub(G.com, pw);
        const F = [(Fzk * r[0]) / zc, (Fzk * r[1]) / zc, Fzk];
        for (const { li, j } of I.Jcol(foot[S].link, pw, legDofs[S])) R.tauVF[li] -= dot(j, F);
      });
    }

    // the point of foot S's sole nearest to (above/below) x: heel to toe along the foot, within
    // its width
    function copPoint(S, x) {
      const hl = heelW(S), tp = b.toWorld(foot[S].link, foot[S].toe), ax = sub(tp, hl), Lf = len(ax), fw = scl(ax, 1 / Math.max(1e-6, Lf));
      const up = mv(b.Rw[foot[S].link], [0, 1, 0]), rt = unit(cross(fw, up));
      const d = sub(x, hl), a = clamp(dot(d, fw), 0.01, Lf - 0.01), r = clamp(dot(d, rt), -0.025, 0.025);
      return add(hl, add(scl(fw, a), scl(rt, r)));
    }
    // ---- gravity feed-forward: arms, trunk, head and a swinging leg (base held); a stance leg
    // is carried from the ground (support), not held up from the pelvis
    function feedForward() {
      I.feedForward(b.gravity);
      const stance = G.phase === "double" ? ["L", "R"] : [G.stance];
      for (const S of stance) for (const i of legDofs[S]) R.tauFF[H[i].link] = 0;
    }

    // ---- the declared balance assist (applied after the contacts, on the pelvis)
    function assist() {
      const Rd = pelvisR(G.psiP ?? G.heading, risePitch()), e = logSO3(mm(Rd, mt(b.R))), w = mv(b.R, [b.vb[0], b.vb[1], b.vb[2]]);
      let T = [P.assistK * e[0] - P.assistC * w[0], P.assistK * e[1] - P.assistC * w[1], P.assistYawK * e[2] - P.assistYawC * w[2]];
      const tl = len(T);
      if (tl > P.assistMaxNm) T = scl(T, P.assistMaxNm / tl);
      const Tl = mtv(b.Rw[pelvis], T), fe = b.fext[pelvis];
      fe[0] += Tl[0]; fe[1] += Tl[1]; fe[2] += Tl[2];
      // and a catch: once her capture point is further from the foot she stands on (the middle of
      // both, standing) than a step can reach (catchR), a force through her centre of mass holds
      // it there (m w^2 per metre beyond, capped at catchMaxN) - a spotter's hand; nothing within
      // (measured from the foot she stands on; standing, from the segment between her feet)
      const w0 = omega(), xi = dcm(), a0 = G.phase === "single" ? footMid(G.stance) : footMid("L"), a1 = footMid("R");
      const seg = G.phase === "single" ? [0, 0, 0] : sub(a1, a0);
      const sl = dot(seg, seg), u = sl > 1e-6 ? clamp(dot(sub(xi, a0), seg) / sl, 0, 1) : 0, p0 = add(a0, scl(seg, u));
      const rS = (G.phase === "single" ? P.catchR : P.catchR2) + P.catchRperMps * Math.hypot(G.vCmd[0], G.vCmd[1]);
      const dx = sub(xi, p0), dl = len(dx), ex = dl - rS;
      let Fc = [0, 0, 0];
      if (ex > 0 && P.catchMaxN > 0) {
        Fc = scl(dx, (-m * w0 * w0 * P.catchK * ex) / dl);
        const fc = len(Fc);
        if (fc > P.catchMaxN) Fc = scl(Fc, P.catchMaxN / fc);
        b.applyForce(pelvis, Fc, G.com);
      }
      G.stats.catchN = len(Fc);
      G.stats.catchSq = (G.stats.catchSq || 0) + len(Fc) ** 2 * (PL.lastDt || 0);
      G.stats.catchS = (G.stats.catchS || 0) + (len(Fc) > 1 ? PL.lastDt || 0 : 0);
      const st = G.stats, a = len(T);
      st.assistErr = e;
      st.assistNm = a; st.assistRms = Math.sqrt(st.assistRms * st.assistRms * 0.995 + a * a * 0.005);
      const up = mv(b.Rw[R.model.linkOf.Spine02], [0, 1, 0]);
      st.tiltDeg = Math.acos(clamp(up[2], -1, 1)) / DEG;
      st.maxTilt = Math.max(st.maxTilt, st.tiltDeg);
    }

    // ---- the player's (or a test's) intent: velocity in the world, run
    G.setIntent = (v, run = false) => { G.vDes = [v[0], v[1]]; G.run = !!run; };
    function steer(dt) {
      const vmax = G.run ? P.runMps : P.walkMps;
      let vd = G.vDes.slice();
      const n = Math.min(vmax, Math.hypot(vd[0], vd[1]));
      if (G.strafe) {
        // (sidestepping with her facing held by the caller: the velocity as told, ramped)
        const t = n > 0.05 ? [vd[0] * n / Math.hypot(vd[0], vd[1]), vd[1] * n / Math.hypot(vd[0], vd[1])] : [0, 0];
        const dv = [t[0] - G.vCmd[0], t[1] - G.vCmd[1]], dn = Math.hypot(dv[0], dv[1]), rate = P.accel * dt;
        G.vCmd = dn > rate ? [G.vCmd[0] + dv[0] * rate / dn, G.vCmd[1] + dv[1] * rate / dn] : t;
        return;
      }
      // her velocity's direction turns towards where she is sent no faster than her legs can take
      // sideways (latAccMax / speed); told to go the other way she slows down first. Her heading
      // follows her velocity; standing, she turns on the spot towards where she is sent.
      const sp = Math.hypot(G.vCmd[0], G.vCmd[1]), want = n > 0.05 ? Math.atan2(-vd[0], vd[1]) : null;
      let dir = sp > 0.02 ? Math.atan2(-G.vCmd[0], G.vCmd[1]) : want ?? G.heading;
      let target = n;
      if (want != null) {
        const e = angWrap(want - dir);
        if (Math.abs(e) > P.reverseDeg * DEG && sp > 0.15) target = 0; // the other way: slow down first
        else {
          const rate = sp > 0.15 ? Math.min(P.turnRate, P.latAccMax / sp) : Math.PI * 4;
          dir = angWrap(dir + clamp(e, -rate * dt, rate * dt));
          // (from standing she first faces roughly where she goes)
          const face = Math.abs(angWrap(want - G.heading));
          if (sp < 0.15 && face > 45 * DEG) target = 0;
        }
      } else target = 0;
      const ds = target > sp ? P.accel * dt : P.decel * dt, sp2 = clamp(target, sp - ds, sp + ds);
      G.vCmd = scl(fwdOf(dir), sp2).slice(0, 2);
      // heading: along her velocity when going; towards the stick when (nearly) standing
      const hTarget = sp2 > 0.15 ? dir : want ?? G.heading, hRate = sp2 > 0.15 ? P.turnRate : P.turnRateStand;
      G.heading = angWrap(G.heading + clamp(angWrap(hTarget - G.heading), -hRate * dt, hRate * dt));
      // (never more than headingLeadDeg ahead of her feet: they turn her)
      const a = footYaw("L"), feet = a + angWrap(footYaw("R") - a) / 2;
      G.heading = angWrap(clampYaw(G.heading, feet, P.headingLeadDeg * DEG));
    }

    // ---- off the bike: what she does next
    // fallen: limp (46) until she has come to rest (her centre of mass slower than restMps for
    // restS) and a moment more (dazeS); then she gets up
    const limp = R.modes.fallen;
    G.rest = 0;
    R.modes.fallen = (bk, dt) => {
      limp(bk, dt);
      measure();
      G.rest = Math.hypot(G.vcom[0], G.vcom[1], G.vcom[2]) < P.restMps ? G.rest + dt : 0;
      if (G.rest > P.restS && PL.modeS > P.dazeS && G.autoGetUp !== false) G.startGetUp();
    };
    // ---- getting up. From lying she rolls face down, pushes up onto hands and knees, brings her
    // right foot forward under her (half-kneeling), raises her trunk and stands up over that
    // foot, then brings the other alongside. Each phase is a posture solved on the ground (hands,
    // knees, feet where they push) held by her servos; the limbs on the ground push the pelvis
    // and chest towards the phase's pose (virtual-model forces through them, tau = J^T F); a
    // declared get-up assist (capped force and torque on the pelvis, getUpMaxN / getUpMaxNm)
    // carries the rest - reported in stats (getUpN).
    const GU = (G.getUp = { phase: null, t: 0, long: [0, 1, 0], p0: null, feet: null, hands: null, stats: { Nsum: 0, Tsum: 0, n: 0 } });
    // body axes (world): long = her pelvis's head-ward axis, belly = the way her front faces
    const longAx = () => mv(b.R, [0, 1, 0]), bellyAx = () => mv(b.R, [0, 0, -1]);
    // pelvis orientation with its head-ward axis along u and its front facing f (both unit, square)
    const frameOf = (u, f) => { const z = scl(f, -1), x = cross(u, z); return [x[0], u[0], z[0], x[1], u[1], z[1], x[2], u[2], z[2]]; };
    G.startGetUp = () => {
      const ln = flat(longAx()), l = len(ln) > 0.2 ? unit(ln) : fwdOf(headingOfBody());
      Object.assign(GU, { phase: bellyAx()[2] < -0.6 ? "all4" : "roll", t: 0, long: l, p0: flat(b.p), feet: null, hands: null });
      for (let i = 0; i < L.length; i++) { R.qT[i] = b.q[i]; R.qdT[i] = 0; }
      PL.mode = "getup"; PL.modeS = 0; PL.ff = "custom";
    };
    const legSet = (S) => legDofs[S], armSet = (S) => armDofs[S];
    function solveLimb(dofs, tasks, iters = 3) { I.ikSolve(ikb, tasks, dofs, PREF_FOOT, iters); for (const i of dofs) { const li = H[i].link; R.qT[li] = ikb.q[li]; R.qdT[li] = 0; } }
    function getUpTargets() {
      // the phase's pelvis pose and the limbs' places on the ground
      const u = GU.long, gz = groundZ(b.p[0], b.p[1]), rt = unit(cross(u, [0, 0, 1])), up = [0, 0, 1];
      const shoulder = (S) => b.toWorld(R.model.linkOf[S + "_Upperarm"], [0, 0, 0]), hipJ = (S) => b.toWorld(R.model.linkOf[S + "_Thigh"], [0, 0, 0]);
      let T = null;
      if (GU.phase === "roll") T = { R: frameOf(u, [0, 0, -1]), p: [b.p[0], b.p[1], gz + 0.14], hands: null, knees: null, arms: "side" };
      else if (GU.phase === "all4") {
        const pp = [GU.p0[0], GU.p0[1], gz + P.all4H];
        T = { R: frameOf(u, [0, 0, -1]), p: pp, hands: { L: add(flat(shoulder("L")), [0, 0, gz + 0.025]), R: add(flat(shoulder("R")), [0, 0, gz + 0.025]) } };
        T.knees = { L: add(flat(hipJ("L")), [0, 0, gz + 0.05]), R: add(flat(hipJ("R")), [0, 0, gz + 0.05]) };
        T.feet = { L: add(sub(T.knees.L, scl(u, 0.38)), [0, 0, -0.02]), R: add(sub(T.knees.R, scl(u, 0.38)), [0, 0, -0.02]) };
      } else if (GU.phase === "tuck") {
        // toes planted where they are, knees up: the hips go back and up over the feet, the hands
        // still down ahead - a deep squat leaning forward onto them
        if (!GU.feet) GU.feet = { L: ballW("L"), R: ballW("R") };
        if (!GU.hands) GU.hands = { L: b.toWorld(hand.L.link, hand.L.p), R: b.toWorld(hand.R.link, hand.R.p) };
        const beta = P.tuckPitchDeg * DEG, hw = unit(add(scl(u, Math.cos(beta)), scl(up, Math.sin(beta)))), bl = unit(sub(scl(u, Math.sin(beta)), scl(up, Math.cos(beta))));
        const over = add(scl(add(flat(GU.feet.L), flat(GU.feet.R)), 0.5), scl(u, P.tuckFwdM));
        T = { R: frameOf(hw, bl), p: add(over, [0, 0, gz + P.squatH]), hands: GU.hands, feet: { L: GU.feet.L, R: GU.feet.R }, flatFeet: smooth01(GU.t / 0.8) };
      }
      return T;
    }
    function getUpPlan(T) {
      // posture: legs / arms from the planned pelvis pose to their places on the ground
      ikb.q.set(b.q); ikb.p = T.p.slice(); ikb.R = T.R.slice(); ikb.kinematics();
      for (const S of ["L", "R"]) {
        const tasks = [];
        if (T.knees?.[S]) tasks.push({ type: "pos", link: R.model.linkOf[S + "_Calf"], local: [0, 0, 0], target: T.knees[S], w: 60 });
        if (T.feet?.[S]) tasks.push({ type: "pos", link: foot[S].link, local: foot[S].ball, target: T.feet[S], w: 60 });
        if (T.feet?.[S] && !T.knees?.[S]) tasks.push({ type: "dir", link: foot[S].link, local: [0, 1, 0], target: [0, 0, 1], w: 2 * (T.flatFeet ?? 1) }, { type: "dir", link: foot[S].link, local: foot[S].forward, target: GU.long, w: 1 });
        if (tasks.length) solveLimb(legSet(S), tasks);
        else for (const i of legSet(S)) { const li = H[i].link; R.qT[li] = (H[i].id.includes("Knee.flex") ? 40 : H[i].id.includes("Hip.flex") ? 30 : 0) * DEG; }
        if (T.hands?.[S]) solveLimb(armSet(S), [{ type: "pos", link: hand[S].link, local: hand[S].p, target: T.hands[S], w: 60 }]);
        else for (const [id, deg] of [["Shoulder.flexionExtension", GU.phase === "roll" ? 0 : 10], ["Shoulder.abductionAdduction", -60], ["Shoulder.axialRotation", 0], ["Elbow.flexionExtension", 25]]) { const k = (S === "L" ? "left" : "right") + id; if (k in I.hingeIndex) R.qT[lk(k)] = deg * DEG; }
      }
      for (const i of R.chains.spine.concat(R.chains.neck)) R.qT[H[i].link] = 0;
    }
    // the limbs on the ground push the pelvis (knees, feet) and chest (hands) towards the pose
    function getUpSupport(T) {
      R.tauVF.fill(0);
      const gz = groundZ(b.p[0], b.p[1]), vp = b.pointVelocity(pelvis, [0, 0, 0]);
      const Fz = clamp(m * g * 0.85 + P.kz * (T.p[2] - b.p[2]) - P.cz * vp[2], 0, 2 * m * g);
      const contacts = [];
      for (const S of ["L", "R"]) {
        if (T.knees?.[S]) contacts.push({ link: R.model.linkOf[S + "_Calf"], pt: b.toWorld(R.model.linkOf[S + "_Calf"], [0, 0, 0]), dofs: legSet(S), w: 0.3 });
        else if (T.feet?.[S]) contacts.push({ link: foot[S].link, pt: ballW(S), dofs: legSet(S), w: T.hands ? 0.35 : 0.45 });
        if (T.hands?.[S]) contacts.push({ link: hand[S].link, pt: b.toWorld(hand[S].link, hand[S].p), dofs: armSet(S), w: 0.2 });
      }
      const wsum = contacts.reduce((a, c) => a + c.w, 0);
      for (const c of contacts) { const F = [0, 0, (Fz * c.w) / wsum]; for (const { li, j } of I.Jcol(c.link, c.pt, c.dofs)) R.tauVF[li] -= dot(j, F); }
      I.feedForward(b.gravity);
      for (const c of contacts) for (const i of c.dofs) R.tauFF[H[i].link] = 0;
    }
    function getUpAssist(T) {
      const e = logSO3(mm(T.R, mt(b.R))), w = mv(b.R, [b.vb[0], b.vb[1], b.vb[2]]);
      let Tq = sub(scl(e, P.getUpK), scl(w, P.getUpC));
      const tl = len(Tq); if (tl > P.getUpMaxNm) Tq = scl(Tq, P.getUpMaxNm / tl);
      const vp = b.pointVelocity(pelvis, [0, 0, 0]);
      let F = sub(scl(sub(T.p, b.p), P.getUpKp), scl(vp, P.getUpCp));
      const fl = len(F); if (fl > P.getUpMaxN) F = scl(F, P.getUpMaxN / fl);
      const Tl = mtv(b.Rw[pelvis], Tq), fe = b.fext[pelvis]; fe[0] += Tl[0]; fe[1] += Tl[1]; fe[2] += Tl[2];
      b.applyForce(pelvis, F, b.p);
      const st = GU.stats; st.Nsum += len(F) * (PL.lastDt || 0); st.Tsum += len(Tq) * (PL.lastDt || 0); st.n += PL.lastDt || 0;
      G.stats.getUpN = len(F); G.stats.getUpNm = len(Tq);
    }
    const PHASES = { roll: { next: "all4", minS: 0.4, maxS: 2.0 }, all4: { next: "tuck", minS: 0.8, maxS: 2.5 }, tuck: { next: "foot", minS: 0.8, maxS: 2.5 } };
    R.modes.getup = (bk, dt) => {
      GU.t += dt;
      const T = getUpTargets();
      G.getUpT = T;
      getUpPlan(T);
      R.activation = 0.5;
      R.servoScale.fill(clamp(GU.t / 0.3, 0.25, 1));
      getUpSupport(T);
      PL.ff = "custom";
      // done with this phase: its pose reached (pelvis within getUpTolM, orientation within 20 deg) or its time up
      const ph = PHASES[GU.phase], eP = len(sub(T.p, b.p)), eR = len(logSO3(mm(T.R, mt(b.R))));
      const reached = eP < P.getUpTolM && eR < 20 * DEG && (GU.phase !== "roll" || bellyAx()[2] < -0.6);
      if ((GU.t > ph.minS && reached) || GU.t > ph.maxS) {
        if (ph.next === "foot") {
          // up from the squat: her feet planted where they are, the pelvis rising and pitching
          // back to standing over riseS (the on-foot balance holds her)
          const lg = longAx(), pitch0 = Math.atan2(len(flat(lg)), lg[2]);
          G.enterFoot(Math.atan2(-GU.long[0], GU.long[1]), { t: 0, dur: P.riseS, h0: b.p[2] - groundZ(b.p[0], b.p[1]), pitch0 });
          return;
        }
        GU.phase = ph.next; GU.t = 0;
        if (GU.phase === "all4") GU.p0 = flat(b.p);
        if (GU.phase === "tuck") { GU.feet = null; GU.hands = null; }
      }
    };
    // what F does next to the bike (bk: the bike adapter; null in tests without one)
    G.action = (bk) => {
      if (!bk || !bk.p || PL.mode !== "foot") return null;
      const seat = I.bikeToWorld(bk, [0, -0.3, 0.0]), d = Math.hypot(seat[0] - G.com[0], seat[1] - G.com[1]);
      const roll = Math.abs(I.uprightFrame(bk, 0).roll);
      if (d > P.reachBikeM) return null;
      return roll > 30 * DEG ? "lift" : "mount";
    };
    // ---- the mode
    // tripped: down she goes (limp, as in a crash), and gets up again once at rest
    G.toRagdoll = (cause = "tripped") => {
      PL.mode = "fallen"; PL.modeS = 0; PL.ff = "none"; PL.fallCause = cause; G.rest = 0;
      for (let i = 0; i < L.length; i++) { R.qT[i] = b.q[i]; R.qdT[i] = 0; }
      R.tauVF.fill(0); R.servoScale.fill(PL.fallTone);
    };
    R.modes.foot = (bk, dt) => {
      // (down: the pelvis well below where it is planned - rising from a squat it starts low - or
      // the trunk tipped past the planned lean)
      const zNow = b.p[2] - groundZ(b.p[0], b.p[1]), zMin = Math.min(P.fallZ, hipHeight() - 0.2), tMax = P.fallTiltDeg + risePitch() / DEG;
      if (zNow < zMin || (G.stats.tiltDeg || 0) > tMax) { G.toRagdoll(); R.modes.fallen(bk, dt); return; }
      if (G.interact) {
        G.interact = false;
        const act = G.action(bk);
        if (act === "mount") G.request = "mount";
        else if (act === "lift") G.request = "lift";
      }
      measure();
      if (G.rise) { G.rise.t += dt; G.vDes = [0, 0]; if (G.rise.t > G.rise.dur + 0.2) G.rise = null; }
      steer(dt);
      gait(dt);
      G.ikAcc += dt;
      if (G.ikAcc >= 1 / 270 || PL.modeS <= dt) { plan(G.ikAcc); G.ikAcc = 0; }
      R.activation = 0.5;
      R.servoScale.fill(1);
      for (const S of ["L", "R"]) for (const i of armDofs[S]) R.servoScale[i] = 0.6;
      // a foot on the ground: its ankle is not held at an angle - its torque is what puts the
      // centre of pressure where support() wants it (the foot is kept flat by the ground)
      for (const S of G.phase === "double" ? ["L", "R"] : [G.stance]) for (const i of ankleDofs[S]) R.servoScale[i] = P.ankleStanceGain;
      support();
      feedForward();
      PL.ff = "custom";
    };
    const post = R.postContacts;
    R.postContacts = (bk, dt, reactions) => {
      if (PL.mode === "foot") assist();
      else if (PL.mode === "getup" && G.getUpT) getUpAssist(G.getUpT);
      if (post) post(bk, dt, reactions);
    };
    return G;
  }

  // ------------------------------------------------------------------ browser
  // Off the bike the player steers her: WASD / arrows / left stick relative to the camera, Shift
  // or the right trigger to run, F / pad X to act (get off when stopped, lift a fallen bike, get
  // on). The camera follows her (drag / right stick to orbit, wheel to zoom), the bike's own
  // controls are left alone (throttle shut, clutch in, steering free; the front brake held while
  // it stands on its side stand).
  function installBrowser(CORE) {
    const BIO = CORE?.riderBio, R = BIO?.rider;
    if (!R || typeof free === "undefined") return null;
    const G = install(R), PL = R.plan, hp = R.helpers, D = global.document;
    const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
    const isRide = () => String(global.__LUCID_ACTIVE_PAGE__ || "") === "RIDE";
    const off = () => BIO.active && BIO.placed && PL.fallen;
    const UI = (G.ui = { keys: {}, interact: false, padPrev: [], prompt: null });
    const KEYS = { KeyW: "f", ArrowUp: "f", KeyS: "b", ArrowDown: "b", KeyA: "l", ArrowLeft: "l", KeyD: "r", ArrowRight: "r", ShiftLeft: "run", ShiftRight: "run" };
    const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(String(e.target?.tagName || "").toUpperCase());
    global.addEventListener?.("keydown", (e) => {
      if (!isRide() || typing(e)) return;
      const k = KEYS[e.code];
      if (k) UI.keys[k] = true;
      if (e.code === "KeyF" && !e.repeat) UI.interact = true;
    });
    global.addEventListener?.("keyup", (e) => { const k = KEYS[e.code]; if (k) UI.keys[k] = false; });
    global.addEventListener?.("blur", () => { UI.keys = {}; });

    // ---- the camera that follows her (off the bike)
    const CAM = (G.cam = { yaw: null, pitch: 0.32, zoom: 1, target: null, drag: null, lastMs: 0 });
    const cvs = D?.getElementById("gl") || D?.querySelector("canvas");
    cvs?.addEventListener("pointerdown", (e) => { if (off() && isRide()) CAM.drag = { x: e.clientX, y: e.clientY }; });
    global.addEventListener?.("pointermove", (e) => {
      if (!CAM.drag || !off()) return;
      CAM.yaw = (CAM.yaw ?? 0) - (e.clientX - CAM.drag.x) * 0.006;
      CAM.pitch = clamp(CAM.pitch + (e.clientY - CAM.drag.y) * 0.004, 0.03, 1.2);
      CAM.drag = { x: e.clientX, y: e.clientY };
    });
    global.addEventListener?.("pointerup", () => { CAM.drag = null; });
    cvs?.addEventListener("wheel", (e) => { if (off() && isRide()) CAM.zoom = clamp(CAM.zoom * Math.exp(e.deltaY * 0.001), 0.45, 3); }, { passive: true });
    if (typeof updateFreeCamera === "function" && typeof cam !== "undefined") {
      const baseCam = updateFreeCamera;
      updateFreeCamera = function () {
        if (!(off() && isRide())) { CAM.yaw = null; return baseCam(); }
        const now = performance.now(), dt = Math.min(0.05, Math.max(0.001, (now - (CAM.lastMs || now)) / 1000));
        CAM.lastMs = now;
        const b = R.body, chest = b.toWorld(R.model.linkOf.Spine02, [0, 0, 0]), lying = PL.mode !== "foot";
        const tgt = lying ? [b.p[0], b.p[1], b.p[2] + 0.25] : [chest[0], chest[1], chest[2] + 0.1];
        if (CAM.yaw == null) { CAM.yaw = cam.yaw; CAM.target = cam.target.slice(); }
        // (walking she draws the camera round behind her, slowly; the player's orbit otherwise)
        const v = Math.hypot(G.vcom[0], G.vcom[1]);
        if (!lying && v > 0.3 && !CAM.drag) {
          const f = [-Math.sin(G.heading), Math.cos(G.heading)], behind = Math.atan2(-f[0], -f[1]);
          const d = Math.atan2(Math.sin(behind - CAM.yaw), Math.cos(behind - CAM.yaw));
          CAM.yaw += d * Math.min(1, dt * 0.6 * Math.min(1, v / 1.2));
        }
        const k = 1 - Math.exp(-dt / 0.12);
        for (let i = 0; i < 3; i++) CAM.target[i] += (tgt[i] - CAM.target[i]) * k;
        cam.yaw = CAM.yaw; cam.pitch = CAM.pitch; cam.target = CAM.target.slice();
        cam.dist = (lying ? 3.4 : G.run && v > 1.8 ? 3.6 : 3.0) * CAM.zoom;
        global.__LUCID_RIDE_CAMERA_UP__ = [0, 0, 1];
        global.__LUCID_RIDE_FOV__ = 55;
      };
    }

    // ---- per frame (after the ride input pre-step): her intent, the bike left alone
    let gp = null;
    function readPad() {
      try { gp = [...(navigator.getGamepads?.() || [])].find(Boolean) || null; } catch (_) { gp = null; }
      if (!gp) return { x: 0, y: 0, cx: 0, cy: 0, run: 0, act: false };
      const dz = (x) => (Math.abs(x) < 0.15 ? 0 : x), btn = (i) => !!gp.buttons?.[i]?.pressed;
      const act = btn(2) && !UI.padPrev[2];
      UI.padPrev = (gp.buttons || []).map((x) => !!x.pressed);
      return { x: dz(gp.axes?.[0] || 0), y: dz(gp.axes?.[1] || 0), cx: dz(gp.axes?.[2] || 0), cy: dz(gp.axes?.[3] || 0), run: gp.buttons?.[7]?.value || 0, act };
    }
    function bikeSpeed() { return Math.hypot(free.v[0], free.v[1]); }
    function frame(dt) {
      if (!BIO.active || !BIO.placed) { UI.interact = false; return; }
      const pad = readPad();
      if (pad.act) UI.interact = true;
      if (!PL.fallen) {
        // riding: stopped, F gets her off (the side stand down)
        if (UI.interact && bikeSpeed() < 0.6) G.request = "dismount";
        UI.interact = false;
      } else {
        // off the bike: the bike's own controls released
        const cmd = global.DUCATI_ADVANCED_POWERTRAIN?.states?.free?.command;
        if (cmd) Object.assign(cmd, { throttle: 0, clutch: 0, frontBrakeBar: PL.sideStand || PL.holdingBike ? 20 : 0, rearBrakeBar: 0 });
        const st = D?.getElementById("freeSteer");
        if (st) st.value = "0";
        free.controls.userSteerTorqueNm = 0;
        if (PL.mode === "foot") {
          // camera-relative: forward is where the camera looks
          const yaw = CAM.yaw ?? cam.yaw, fw = [-Math.sin(yaw), -Math.cos(yaw)], rt = [-Math.cos(yaw), Math.sin(yaw)];
          const K = UI.keys, mx = (K.r ? 1 : 0) - (K.l ? 1 : 0) + pad.x, my = (K.f ? 1 : 0) - (K.b ? 1 : 0) - pad.y;
          const n = Math.min(1, Math.hypot(mx, my)), run = !!K.run || pad.run > 0.5;
          const sp = n * (run ? G.P.runMps : G.P.walkMps);
          const dir = n > 0.05 ? [(fw[0] * my + rt[0] * mx) / Math.hypot(mx, my), (fw[1] * my + rt[1] * mx) / Math.hypot(mx, my)] : [0, 0];
          G.setIntent([dir[0] * sp, dir[1] * sp], run);
          if (UI.interact) G.interact = true;
        } else G.setIntent([0, 0]);
        UI.interact = false;
        if (pad.cx || pad.cy) { CAM.yaw = (CAM.yaw ?? cam.yaw) - pad.cx * dt * 2.2; CAM.pitch = clamp(CAM.pitch + pad.cy * dt * 1.2, 0.03, 1.2); }
      }
      // requests from her modes (outside the physics step)
      const req = G.request; G.request = null;
      if (req === "dismount") dismount();
      else if (req === "mount") mount();
      else if (req === "lift") lift();
      prompt();
    }
    // (first versions: getting off sets her standing on the bike's left, the stand down; getting on
    // seats her - to be replaced by the stepping-off / leg-over motions)
    function dismount() {
      const q = free.q, f = v5qrot(q, V5_Y), r = v5qrot(q, V5_X);
      const fh = v5norm([f[0], f[1], 0]), rh = v5norm([r[0], r[1], 0]);
      const seat = v5add(free.p, v5mul(fh, -0.25)), p = v5add(seat, v5mul(rh, -0.62));
      const gz = CORE.realtime?.road ? CORE.realtime.road.height(p[0], p[1]) : 0;
      free.v = [0, 0, 0]; free.w = [0, 0, 0];
      PL.sideStand = true;
      G.placeStanding([p[0], p[1], gz], Math.atan2(-fh[0], fh[1]));
      CAM.yaw = null;
    }
    function mount() {
      // (she rocks it upright off its side stand as she takes it)
      const f = v5qrot(free.q, V5_Y), fh = v5norm([f[0], f[1], 0]);
      free.q = v5qaxis(V5_UP, Math.atan2(-fh[0], fh[1])); free.w = [0, 0, 0];
      PL.sideStand = false;
      BIO.place();
    }
    function lift() {
      // (first version: the bike is set upright on its side stand where it lies)
      const q = free.q, f = v5qrot(q, V5_Y), fh = v5norm([f[0], f[1], 0]), yaw = Math.atan2(-fh[0], fh[1]);
      free.q = v5qaxis(V5_UP, yaw); free.v = [0, 0, 0]; free.w = [0, 0, 0];
      free.p = [free.p[0], free.p[1], free.p[2] + 0.35];
      PL.sideStand = true;
    }
    // the action prompt (what F / X does now)
    function prompt() {
      let txt = "";
      if (BIO.active && BIO.placed && isRide()) {
        if (!PL.fallen) txt = bikeSpeed() < 0.6 ? "F / X  get off" : "";
        else if (PL.mode === "foot") { const a = G.action(BIO.bikeAdapter?.()); txt = a === "lift" ? "F / X  lift the bike" : a === "mount" ? "F / X  get on" : ""; }
        else txt = "R  reset";
      }
      if (txt === UI.promptTxt) return;
      UI.promptTxt = txt;
      if (!UI.prompt && D) {
        const host = D.getElementById("gl")?.parentElement;
        if (!host) return;
        UI.prompt = D.createElement("div");
        UI.prompt.id = "lucidOnFootPrompt";
        UI.prompt.style.cssText = "position:absolute;left:50%;bottom:64px;transform:translateX(-50%);z-index:131;font:12px ui-monospace,monospace;color:#e8eef4;background:rgba(10,14,20,.72);border:1px solid #3d4a58;border-radius:6px;padding:5px 10px;pointer-events:none;display:none";
        host.appendChild(UI.prompt);
      }
      if (UI.prompt) { UI.prompt.textContent = txt; UI.prompt.style.display = txt ? "block" : "none"; }
    }
    const basePre = global.__LUCID_RIDE_PRESTEP__;
    let lastPre = performance.now();
    global.__LUCID_RIDE_PRESTEP__ = function (...a) {
      const r = typeof basePre === "function" ? basePre.apply(this, a) : undefined;
      const now = performance.now(), dt = Math.min(0.05, (now - lastPre) / 1000);
      lastPre = now;
      try { frame(dt); } catch (e) { G.error = String(e?.message || e); }
      return r;
    };
    // a reset puts her back on the bike (46) with the stand up
    CORE.chassis?.onReset?.push(() => { PL.sideStand = false; PL.holdingBike = false; CAM.yaw = null; });
    G.frame = frame;
    return G;
  }

  const api = { install, installBrowser };
  global.LUCID_RIDER_ONFOOT = api;
  if (global.LUCID_CORE?.riderBio?.rider) installBrowser(global.LUCID_CORE);
})(typeof window !== "undefined" ? window : globalThis);
