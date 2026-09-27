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
    const hipDofs = { L: R.chains.legL.filter((i) => /Hip\./.test(H[i].id)), R: R.chains.legR.filter((i) => /Hip\./.test(H[i].id)) };
    const kneeDofs = { L: R.chains.legL.filter((i) => /Knee\./.test(H[i].id)), R: R.chains.legR.filter((i) => /Knee\./.test(H[i].id)) };
    const footDofs = { L: R.chains.legL.filter((i) => /Ankle\./.test(H[i].id)), R: R.chains.legR.filter((i) => /Ankle\./.test(H[i].id)) };
    const wristDofs = { L: R.chains.armL.filter((i) => /(Wrist|Forearm)\./.test(H[i].id)), R: R.chains.armR.filter((i) => /(Wrist|Forearm)\./.test(H[i].id)) };

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
      restMps: 0.25, restS: 0.6, dazeS: 0.8, dazePerKN: 0.6, dazeMaxS: 4, reachBikeM: 2.0, // come to rest, a daze growing with the impact on head / trunk (s per kN), then up; F acts within this of the bike's seat (she walks there herself)
      reactS: 0.15, protectMps: 0.5, protectMaxS: 4, protectTone: 0.35, // protective reactions: after her reaction time, while moving, at this share of her gains
      fallZ: 0.55, fallTiltDeg: 55, // on her feet: pelvis this low or trunk this tilted - she is down
      goToMps: 0.8, goToTurnRate: 1.5, gripCloseM: 0.06, scriptMaxN: 300, scriptMaxNm: 150, barsRate: 1.2, barsGain: 400, barsMaxNm: 60, regripS: 3, liftMidDeg: 35, liftK: 8000, liftC: 1500, liftMaxNm: 1200, swingKneeTone: 0.35, swingAnkleTone: 0.15, scriptAnkleTone: 0.35, gripWristTone: 0.3, holdLeanDeg: -2, holdPushK: 1.2, holdPushC: 0.25, holdPushMaxM: 0.08, holdK: 15000, holdC: 2500, holdAssistMaxNm: 450, // walking herself to a spot (speed, turning standing); a hand this near its grip closes on it; the getting-on / off assist (declared); her hands turning the bars straight (rad/s, N m per rad/s of rate error per s, N m); after getting on, a hand closes on its grip once there (s); lifting the bike: the roll it is held at while she steps in (deg), the declared lift assist (N m/rad, N m s/rad, N m); tone (share of the servo's gains) of a swung leg's knee and ankle, of an ankle on the ground in a motion at the bike, and of a wrist whose hand holds a grip; holding the bike up while getting on / off: the lean she keeps it at (deg, - = onto her side, its left), her hand's push into the bar (m per rad of lean error, m per rad/s, at most m), the declared residual (N m/rad, N m s/rad, at most N m)
      all4H: 0.5, squatH: 0.55, tuckPitchDeg: 30, tuckFwdM: 0.06, riseS: 1.2, getUpTolM: 0.08, // pelvis on hands and knees; the squat (hands down) over the feet: height, trunk pitch above horizontal, ahead of the feet; rising // pelvis over the ground on hands and knees / half-kneeling; a phase's pose reached within
      getUpK: 900, getUpC: 110, getUpMaxNm: 200, getUpKp: 2500, getUpCp: 400, getUpMaxN: 150, // get-up assist (declared): torque and force on the pelvis towards the phase's pose
      // the load path at the bike (on / off): her balance through her contacts (centre of mass 1/s^2, 1/s, at most m/s^2; pelvis orientation kg m^2 x 1/s^2, 1/s); planned every lpEveryS; her lean into what she pushes (1/s, at most m) with lpOuterShare of the pressure towards the outer foot; her own hold on the bike's lean (N m/rad, N m s/rad)
      standDeg: -10, scriptIkHz: 135, clearM: 0.015, swingClearM: 0.03, trunkClearM: 0.012, // motions at the bike: posture solved at this rate; limbs / trunk kept this clear of the bike (m)
      braceStartDeg: 3, braceSpanDeg: 4, braceHipM: 0.14, letGoDeg: 20, stepAwayS: 1.2, stepNearBikeM: 0.3, scriptDownM: 0.25, scriptDownS: 0.3, liftLostM: 0.3, liftLostS: 0.5, // holding the bike up, it tipping towards her past braceStartDeg (+ braceSpanDeg to full) of the lean she keeps it at: her hip into it, her pelvis up to braceHipM further over (m); past letGoDeg she lets it go and steps away from it for stepAwayS; walking, a swinging foot this near the bike keeps its leg clear of it (m); a motion is over when her pelvis is this far under its planned height this long (m, s), a lift when a hand is this far from its point of the bike this long
      loadPath: true, lpK: 25, lpC: 10, lpAmax: 2.5, lpKz: 36, lpCz: 12, lpAzMax: 3, lpI: 8, lpKr: 36, lpCr: 12, lpEveryS: 1 / 135, lpLeanRate: 3, lpLeanMaxM: 0.2, lpForeMaxM: 0.15, lpForeDeadM: 0.05, lpOuterShare: 0.7, holdHerK: 3000, holdHerC: 400,
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
    // (at the bike, reaching for its bars and tank, arms too: a neutral wrist, the forearm half
    // turned, the shoulder not wound up - gentle, so a hand reaches without the IK parking the
    // wrist or shoulder at the end of its range)
    const PREF_BIKE = { ...PREF_FOOT };
    for (const [id, deg, w] of [
      ["leftWrist.flexionExtension", 0, 0.3], ["rightWrist.flexionExtension", 0, 0.3], ["leftWrist.radialUlnarDeviation", 0, 0.3], ["rightWrist.radialUlnarDeviation", 0, 0.3],
      ["leftForearm.pronationSupination", 20, 0.05], ["rightForearm.pronationSupination", 20, 0.05], ["leftShoulder.axialRotation", 0, 0.03], ["rightShoulder.axialRotation", 0, 0.03],
    ]) if (id in I.hingeIndex) PREF_BIKE[hi(id)] = [deg * DEG, w];

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
      if (G.hold) { G.hold.active = false; G.hold.pushM = 0; }
      // (on her feet her hands are free)
      for (const S of ["L", "R"]) { const gr = R.grips[S]; if (gr.held) { gr.held = false; gr.F = [0, 0, 0]; gr.T = [0, 0, 0]; } }
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
    function plan(dtp, bk = null) {
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
        // (a foot swinging near the bike - walking round it lying on its side, stepping out from
        // beside it - carries its leg clear of it: its knee and shin over, not into, its edge)
        if (t.swing && bk?.R && I.SURF.sdf(I.toBikeFrame(bk, t.p)) < P.stepNearBikeM) I.solveClear(tasks, legDofs[S], 2, bk, 2, 3, P.clearM, PREF_FOOT, false);
        else I.ikSolve(ikb, tasks, legDofs[S], PREF_FOOT, 2);
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
      // (walking herself somewhere - a goal: there, then facing its heading, then its callback)
      // (through its waypoints - the next once within 0.25 m of this one - and the last stretch,
      // strafeM, sidestepping with her facing the goal's heading)
      if (G.goal) {
        const gl = G.goal;
        gl.t += dt;
        while (gl.path.length > 1 && len(sub(flat(gl.path[0]), flat(G.com))) < 0.25) gl.path.shift();
        const last = gl.path.length === 1, d = sub(flat(gl.path[0]), flat(G.com)), dist = len(d);
        G.strafe = last && dist < gl.strafeM;
        if (G.strafe) G.heading = angWrap(G.heading + clamp(angWrap(gl.psi - G.heading), -P.turnRateStand * dt, P.turnRateStand * dt));
        // (close enough: near it and still for a moment)
        gl.near = last && dist < gl.tol + 0.1 && Math.hypot(G.vcom[0], G.vcom[1]) < 0.15 ? (gl.near || 0) + dt : 0;
        if ((!last || dist > gl.tol) && gl.near < 0.6) G.vDes = scl(d, (last ? Math.min(G.strafe ? P.goToMps * 0.6 : P.goToMps, 1.0 * dist) : P.goToMps) / Math.max(1e-6, dist)).slice(0, 2);
        else {
          G.vDes = [0, 0];
          const e = Math.abs(angWrap(gl.psi - G.heading)), vc = Math.hypot(G.vcom[0], G.vcom[1]);
          if (!G.strafe && e > 0.05) G.heading = angWrap(G.heading + clamp(angWrap(gl.psi - G.heading), -P.turnRateStand * dt, P.turnRateStand * dt));
          if (e < 12 * DEG && vc < 0.15 && G.phase === "double" && !G.shiftTo) { G.goal = null; G.strafe = false; gl.then?.(); return; }
        }
        if (gl.t > gl.maxS) { G.goal = null; G.strafe = false; gl.fail?.(); return; }
      }
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
      const sp = Math.hypot(G.vCmd[0], G.vCmd[1]), want = n > 0.05 ? Math.atan2(-vd[0], vd[1]) : G.goal && len(sub(flat(G.goal.p), flat(G.com))) <= G.goal.tol ? G.goal.psi : null;
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
      const hTarget = sp2 > 0.15 ? dir : want ?? G.heading, hRate = sp2 > 0.15 ? P.turnRate : G.goal ? P.goToTurnRate : P.turnRateStand;
      G.heading = angWrap(G.heading + clamp(angWrap(hTarget - G.heading), -hRate * dt, hRate * dt));
      // (never more than headingLeadDeg ahead of her feet: they turn her)
      const a = footYaw("L"), feet = a + angWrap(footYaw("R") - a) / 2;
      G.heading = angWrap(clampYaw(G.heading, feet, P.headingLeadDeg * DEG));
    }

    // ---- off the bike: what she does next
    // fallen: protective reactions while she goes down and slides - after her reaction time the
    // arms go out towards where she falls (forward: both forward, elbows soft; sideways: that arm
    // out; backwards: tucked across the chest), chin tucked, legs gathered; sliding on the ground,
    // arms in by her chest - at protectTone of her gains, then limp (46) once slow. At rest she
    // lies for a daze that grows with how hard her head and trunk hit the ground, then gets up.
    const limp = R.modes.fallen;
    G.rest = 0; G.impact = 0;
    const headSph = R.spheres.filter((s) => s.seg === "Head" || s.seg === "NeckTwist01");
    const trunkSph = R.spheres.filter((s) => s.seg === "Spine01" || s.seg === "Spine02" || s.seg === "Hip");
    const setQ = (id, deg) => { if (id in I.hingeIndex) { const li = lk(id); R.qT[li] = deg * DEG; R.qdT[li] = 0; } };
    const protectDofs = [...R.chains.armL, ...R.chains.armR, ...R.chains.neck, ...legDofs.L, ...legDofs.R];
    function protect() {
      const vb = mtv(b.R, G.vcom), hv = Math.hypot(vb[0], vb[2]); // (her frame: x her right, y head-ward, z her back)
      const lying = b.p[2] - groundZ(b.p[0], b.p[1]) < 0.3, fwd = -vb[2], side = vb[0];
      let arms;
      if (lying && hv > 0.8) arms = "in";
      else if (hv < 0.3 || fwd > Math.abs(side)) arms = "forward";
      else if (-fwd > Math.abs(side)) arms = "tuck";
      else arms = side > 0 ? "right" : "left";
      G.protectArms = arms;
      for (const [S, sgn] of [["left", -1], ["right", 1]]) {
        const out = (arms === "right" && sgn > 0) || (arms === "left" && sgn < 0);
        const pose = arms === "forward" ? [80, -25, 25] : arms === "in" ? [30, -70, 100] : arms === "tuck" ? [45, -65, 115] : out ? [20, 10, 20] : [45, -65, 110];
        setQ(S + "Shoulder.flexionExtension", pose[0]); setQ(S + "Shoulder.abductionAdduction", pose[1]); setQ(S + "Elbow.flexionExtension", pose[2]);
        setQ(S + "Shoulder.axialRotation", 0);
        setQ(S + "Hip.flexionExtension", 25); setQ(S + "Knee.flexionExtension", 40);
      }
      setQ("neck.flexionExtension", 25); setQ("head.nod", 10);
      for (const i of protectDofs) R.servoScale[i] = P.protectTone;
    }
    R.modes.fallen = (bk, dt) => {
      limp(bk, dt);
      measure();
      const sp = Math.hypot(G.vcom[0], G.vcom[1], G.vcom[2]);
      // how hard she hits (the ground's push on her head, and a share of her trunk's)
      let fh = 0, ft = 0;
      for (const s of headSph) if (s.ground.on) fh += len(s.ground.F);
      for (const s of trunkSph) if (s.ground.on) ft += len(s.ground.F);
      G.impact = Math.max(G.impact, fh + 0.25 * ft);
      if (PL.modeS > P.reactS && sp > P.protectMps && PL.modeS < P.protectMaxS) protect();
      G.rest = sp < P.restMps ? G.rest + dt : 0;
      G.daze = clamp(P.dazeS + (P.dazePerKN * G.impact) / 1000, P.dazeS, P.dazeMaxS);
      if (G.rest > P.restS && PL.modeS > G.daze && G.autoGetUp !== false) G.startGetUp();
    };
    // (a new fall starts a new impact record)
    const fall0 = R.fall;
    R.fall = (cause) => { G.impact = 0; fall0(cause); };
    // ---- getting up. From lying she rolls face down, pushes up onto hands and knees, plants her
    // toes and lifts her knees so her hips go back and up over her feet (a deep squat, hands still
    // down), then rises (the on-foot balance holding her). Each phase is a posture solved on the ground (hands,
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
    G.goTo = (p, psi, then, fail = null, tol = 0.1, maxS = 12, via = [], strafeM = 0) => { G.goal = { p, psi, then, fail, tol, maxS, t: 0, path: [...via, p], strafeM }; };
    // ---- motions at the bike (getting on and off): keyframes in the bike's frame (x its right,
    // y its forward, z up from the ground under it; its roll taken out - she works with the bike
    // as it would stand upright) - pelvis position and pitch / roll, feet (a swinging foot through
    // a via point), hands (on a grip, or a point). Between keyframes the pose moves smoothly; legs
    // and arms are solved by IK from the planned pelvis. The feet on the ground carry her share of
    // her weight (load; J^T F), a hand that reaches its grip closes on it (the grip's own contact
    // then holds her to the bars), the seat carries her once she sits, and a declared assist (force
    // and torque on the pelvis towards the planned pose, capped at scriptMaxN / scriptMaxNm) carries
    // the rest - reported in stats (scriptN).
    const SC = (G.script = { name: null, keys: null, i: 0, t: 0, from: null, onDone: null, done: false, stats: { Nsum: 0, Tsum: 0, n: 0, maxN: 0 } });
    const bikeYaw = (bk) => { const f = [bk.R[1], bk.R[4], 0]; return Math.atan2(-f[0], f[1]); };
    // bike frame (upright, at the ground) <-> world
    // (at the ground under its tyres: its origin - 0.65 m up its own up axis from where they touch
    // the ground - taken back down that axis: leaning on its side stand or lying on its side, where
    // it would stand upright)
    // (sheared with its lean: a point at height z moves across by z tan(lean), so what is placed
    // by the bike - over its seat, beside its tail - leans with it while the ground stays the
    // ground; lying on its side, not)
    const bikeFrame = (bk) => {
      const yaw = bikeYaw(bk), up = [bk.R[2], bk.R[5], bk.R[8]], gz = groundZ(bk.p[0], bk.p[1]), roll = I.uprightFrame(bk, 0).roll;
      return { yaw, Ry: Rz(yaw), o: [bk.p[0] - up[0] * 0.65, bk.p[1] - up[1] * 0.65, gz], shear: Math.abs(roll) < 30 * DEG ? Math.tan(roll) : 0 };
    };
    const toW = (F, v) => add(F.o, mv(F.Ry, [v[0] + v[2] * (F.shear || 0), v[1], v[2]])), toB = (F, x) => { const w = mtv(F.Ry, sub(x, F.o)); return [w[0] - w[2] * (F.shear || 0), w[1], w[2]]; };
    // pelvis orientation in the bike frame from pitch (forward +) and roll (right side down +)
    const pelvisB = (k) => mm(hp.expRV([0, (k.rollDeg || 0) * DEG, 0]), mm(Rz((k.yawDeg || 0) * DEG), pelvisR(0, (k.pitchDeg || 0) * DEG)));
    const slerpR = (R0, R1, s) => mm(hp.expRV(scl(logSO3(mm(R1, mt(R0))), s)), R0);
    // (frozen: the frame fixed where it is at the start - lifting, the bike moves under her hands)
    function startScript(name, keys, bk, onDone, onFail = null, frame = null) {
      const F = frame || bikeFrame(bk);
      SC.frame = frame;
      // (where she is now: the first keyframe starts from here)
      const up = mv(b.Rw[R.model.linkOf.Spine02], [0, 1, 0]);
      const from = { pelvis: toB(F, b.p), R: mm(mt(F.Ry), b.R), feet: {}, hands: {}, chest: Math.atan2(len(flat(up)), up[2]) / DEG, yaw: angWrap(headingOfBody() - F.yaw) / DEG };
      for (const S of ["L", "R"]) { from.feet[S] = toB(F, ballW(S)); from.hands[S] = toB(F, b.toWorld(hand[S].link, hand[S].p)); }
      Object.assign(SC, { name, keys, i: 0, t: 0, onDone, onFail, from, done: false, failed: null, downS: 0, lostS: 0, prev: from, handFix: { L: [0, 0, 0], R: [0, 0, 0] }, footFix: { L: [0, 0, 0], R: [0, 0, 0] } });
      Object.assign(G.loadPathState, { acc: 1, cT: null, vT: [0, 0, 0], lean: [0, 0], p: null });
      R.loadPath.forces = []; R.loadPath.key = "";
      if (G.effort.run) G.effort.last = G.effort.run;
      G.effort.run = { name, T: 0, g: {}, keys: {} };
      for (let i = 0; i < L.length; i++) { R.qT[i] = b.q[i]; R.qdT[i] = 0; }
      PL.mode = "script"; PL.modeS = 0; PL.ff = "custom";
      keys[0].onStart?.();
    }
    // seated after getting on: the riding controller (46) takes her on from here - stopped, her left
    // foot down holding the bike up, her hands on the grips
    // (a hand that has not closed on its grip does so once it gets there - for regripS)
    G.toRide = (bk) => {
      R.resetControl();
      Object.assign(PL, { feetDown: 1, feetDownWant: 1, footSide: "L", gFilt: [0, 0, -9.81], gFF: [0, 0, -9.81] });
      G.regripS = P.regripS;
      if (bk) regrip(bk);
      SC.keys = null; G.goal = null; G.scriptT = null; G.barsStraight = false; G.hold.active = false; G.hold.pushM = 0;
    };
    function regrip(bk) {
      for (const S of ["L", "R"]) {
        const gr = R.grips[S];
        gr.reach = !gr.held && G.regripS > 0;
        if (!gr.held && len(sub(b.toWorld(hand[S].link, hand[S].p), R.gripWorld(bk, S).c)) < P.gripCloseM) { R.closeGrip(bk, S); gr.reach = false; }
      }
    }
    // (riding: the planner of 46, then that)
    const ridePlanner = R.planner;
    if (ridePlanner) R.planner = (R2, bk, dt) => { ridePlanner(R2, bk, dt); if (!PL.fallen && G.regripS > 0 && bk?.p) { G.regripS -= dt; regrip(bk); } else if (R.grips.L.reach || R.grips.R.reach) R.grips.L.reach = R.grips.R.reach = false; };
    // a keyframe's end pose (bike frame) given the one before it
    function keyEnd(k, prev, bk) {
      const e = { pelvis: k.pelvis ? k.pelvis.slice() : prev.pelvis, R: k.pitchDeg != null || k.rollDeg != null || k.yawDeg != null ? pelvisB(k) : prev.R, feet: {}, hands: {}, knees: k.knees ? { ...k.knees } : null, chest: k.chestPitchDeg ?? k.pitchDeg ?? prev.chest, yaw: k.yawDeg ?? prev.yaw ?? 0, twist: k.twistDeg ?? prev.twist ?? 0 };
      // (a shift from where the pelvis was: pelvisIn)
      if (k.pelvisIn) e.pelvis = add(prev.pelvis, k.pelvisIn);
      // (a step: her weight over the foot that stays first - the pelvis over its ball, a little
      // behind it)
      if (k.over) { const f = prev.feet[k.over]; e.pelvis = [f[0] + (k.over === "L" ? 0.03 : -0.03), f[1] - 0.06, k.pelvisZ ?? prev.pelvis[2]]; }
      for (const S of ["L", "R"]) {
        const f = k.feet?.[S];
        e.feet[S] = f && f !== "keep" ? f.slice() : prev.feet[S];
        const hd = k.hands?.[S];
        const Fk = SC.frame || bikeFrame(bk);
        e.hands[S] = hd === "grip" ? toB(Fk, R.gripWorld(bk, S).c) : hd?.bike ? toB(Fk, I.bikeToWorld(bk, hd.bike)) : hd ? hd.slice() : prev.hands[S];
      }
      return e;
    }
    function scriptTargets(bk) {
      const k = SC.keys[SC.i], F = SC.frame || bikeFrame(bk), s = smooth01(clamp(SC.t / k.T, 0, 1));
      const A0 = SC.prev, A1 = keyEnd(k, A0, bk);
      SC.end = A1;
      const pr = slerpR(A0.R, A1.R, s), chest = lerp(A0.chest ?? 0, A1.chest ?? 0, s), yaw = (A0.yaw ?? 0) + angWrap(((A1.yaw ?? 0) - (A0.yaw ?? 0)) * DEG) / DEG * s, twist = lerp(A0.twist ?? 0, A1.twist ?? 0, s);
      const out = { pelvis: { p: toW(F, lerp3(A0.pelvis, A1.pelvis, s)), R: mm(F.Ry, pr) }, feet: {}, knees: {}, hands: {}, grip: k.grip || {}, stance: k.stance || ["L", "R"], load: k.load ?? 1, clear: k.clear || [], kneeW: k.kneeW ?? 40, fix: k.fix, seatBlend: k.seatQ ? s : 0, fwd: fwdOf(F.yaw + yaw * DEG) };
      // (leaning into what she pushes: the load path's offset of her pelvis over the ground)
      if (P.loadPath) { const ln = G.loadPathState.lean; out.pelvis.p = [out.pelvis.p[0] + ln[0], out.pelvis.p[1] + ln[1], out.pelvis.p[2]]; }
      // (the chest level across whatever the pelvis's roll, the head a little less pitched than it;
      // both turned with her, and the chest twisted towards what her hands hold - twistDeg, + to her
      // left)
      out.chestR = mm(F.Ry, pelvisR((yaw + twist) * DEG, chest * DEG)); out.headR = mm(F.Ry, pelvisR((yaw + 0.5 * twist) * DEG, 0.5 * chest * DEG - 5 * DEG));
      // (through a via point halfway: a quadratic curve with its control point set so)
      const path = (a, c, via) => (via ? add(add(scl(a, (1 - s) * (1 - s)), scl(sub(scl(via, 2), scl(add(a, c), 0.5)), 2 * s * (1 - s))), scl(c, s * s)) : lerp3(a, c, s));
      for (const S of ["L", "R"]) {
        out.feet[S] = toW(F, path(A0.feet[S], A1.feet[S], k.via?.[S]));
        // (a knee target moves from where the knee was at the keyframe's start)
        if (k.knees?.[S]) { const k0 = A0.knees?.[S] ?? toB(F, b.toWorld(R.model.linkOf[S + "_Calf"], [0, 0, 0])); if (!A0.knees) A0.knees = {}; A0.knees[S] = k0; out.knees[S] = toW(F, lerp3(k0, k.knees[S], s)); }
        const hd = k.hands?.[S];
        out.hands[S] = hd === "grip" && s >= 1 ? R.gripWorld(bk, S).c : toW(F, path(A0.hands[S], A1.hands[S], k.handVia?.[S]));
        if (hd === null) out.hands[S] = null;
      }
      return out;
    }
    R.modes.script = (bk, dt) => {
      if (!bk?.p || !SC.keys) { G.enterFoot(); return; }
      SC.t += dt;
      const k = SC.keys[SC.i];
      const T = scriptTargets(bk);
      G.scriptT = T;
      measure();
      // posture (at scriptIkHz; the joint targets held between): legs from the planned pelvis to the
      // feet, arms to the hands, trunk after the pelvis. At the bike her limbs and trunk are kept
      // clear of it (clearM, trunk trunkClearM): what she does not mean to touch, she does not push
      SC.ikAcc = (SC.ikAcc || 0) + dt;
      const doIK = SC.ikAcc >= 1 / P.scriptIkHz || !SC.tones, ikDt = SC.ikAcc;
      if (doIK) SC.ikAcc = 0;
      const tones = doIK ? [] : SC.tones;
      if (doIK) ikb.q.set(b.q), (ikb.p = T.pelvis.p.slice()), (ikb.R = T.pelvis.R.slice()), ikb.kinematics();
      for (const S of doIK ? ["L", "R"] : []) {
        const onGround = T.stance.includes(S), sw = k.swing?.[S];
        if (sw && T.knees[S]) {
          // a leg swung over the bike: the hip does it (with the pelvis's side tilt) - its three joints
          // solved to point the thigh at the knee target, turned so the lower leg trails towards the
          // foot hint; the knee folded to an easy angle at part tone, the ankle loose near neutral
          const sd = S === "L" ? "left" : "right", kf = lk(sd + "Knee.flexionExtension");
          ikb.q[kf] = (sw.kneeDeg ?? 70) * DEG;
          for (const i of kneeDofs[S].concat(footDofs[S])) if (H[i].link !== kf) ikb.q[H[i].link] = /dorsiPlantar/.test(H[i].id) ? -10 * DEG : 0;
          ikb.kinematics();
          const swTasks = [{ type: "pos", link: R.model.linkOf[S + "_Calf"], local: [0, 0, 0], target: T.knees[S], w: 100 }, { type: "pos", link: foot[S].link, local: foot[S].ball, target: T.feet[S], w: sw.footW ?? 8 }];
          I.solveClear(swTasks, hipDofs[S], 4, bk, 3, 3, P.swingClearM, PREF_FOOT, false, 0.08);
          for (const i of legDofs[S]) { const li = H[i].link; R.qT[li] = ikb.q[li]; R.qdT[li] = 0; }
          tones.push([kneeDofs[S], sw.kneeTone ?? P.swingKneeTone], [footDofs[S], sw.ankleTone ?? P.swingAnkleTone]);
          continue;
        }
        if (onGround) tones.push([footDofs[S], P.scriptAnkleTone]);
        // (on the ground: flat, turning onto the ball of the foot as the leg reaches full stretch)
        const hj = ikb.toWorld(R.model.linkOf[S + "_Thigh"], [0, 0, 0]), reach = len(sub(T.feet[S], hj));
        const flatW = onGround ? 2 * (1 - smooth01((reach - 0.8) / 0.08)) : 0;
        // (a foot in the air, like a reaching hand, is corrected for where it actually is)
        const fc = SC.footFix[S];
        if (!onGround && T.fix?.[S]) { const e = sub(T.feet[S], ballW(S)); for (let k = 0; k < 3; k++) fc[k] = clamp(fc[k] + e[k] * 4 * ikDt, -0.08, 0.08); } else fc.fill(0);
        // (a foot planted on the ground keeps pointing the way it points - the ground holds it; the
        // leg is not twisted to re-aim it)
        const fdir = onGround && footLoad(S) > 20 ? flat(mv(b.Rw[foot[S].link], foot[S].forward)) : null;
        const tasks = [{ type: "pos", link: foot[S].link, local: foot[S].ball, target: add(T.feet[S], fc), w: 100 }, { type: "dir", link: foot[S].link, local: foot[S].forward, target: fdir && len(fdir) > 0.3 ? unit(fdir) : T.fwd, w: 1 }];
        if (flatW > 0.05) tasks.push({ type: "dir", link: foot[S].link, local: [0, 1, 0], target: [0, 0, 1], w: flatW });
        // (a knee drawn towards a pole point: over the bike, not under its seat)
        if (T.knees[S]) tasks.push({ type: "pos", link: R.model.linkOf[S + "_Calf"], local: [0, 0, 0], target: T.knees[S], w: T.kneeW });
        const kl = I.kneeLink[S];
        if (ikb.q[kl] < I.KNEE_SEED) ikb.q[kl] = I.KNEE_SEED;
        // (a leg in the air is kept clear of the bike's surfaces - one going over it by more; a leg she
        // stands on is where it is: bent away from the bike it would not carry her)
        if (onGround && !T.clear.includes(S)) I.ikSolve(ikb, tasks, legDofs[S], PREF_FOOT, 3);
        else I.solveClear(tasks, legDofs[S], 3, bk, 2, 3, T.clear.includes(S) ? 0.03 : P.clearM, PREF_FOOT, false);
        for (const i of legDofs[S]) { const li = H[i].link; R.qT[li] = ikb.q[li]; R.qdT[li] = 0; }
      }
      if (doIK) SC.tones = tones;
      // trunk: the chest pitched as planned and level across, the head up looking ahead (with the load
      // path from the pelvis as it is - the chest keeps its orientation in the world whatever the
      // pelvis does - and then her arms from the trunk as it is: her hands reach the bars from
      // wherever her shoulders are, so their servos do not push or pull the bar by how far her body
      // is from its plan)
      const trunkSet = R.chains.spine.concat(R.chains.neck);
      if (doIK) {
        if (P.loadPath) { ikb.p = b.p.slice(); ikb.R = b.R.slice(); for (const i of trunkSet) ikb.q[H[i].link] = b.q[H[i].link]; }
        else { ikb.p = T.pelvis.p.slice(); ikb.R = T.pelvis.R.slice(); }
        ikb.kinematics();
        I.solveClear([{ type: "rot", link: R.model.linkOf.Spine02, target: T.chestR, w: 1 }], R.chains.spine, 3, bk, 2, 3, P.trunkClearM, PREF_FOOT, false);
        I.ikSolve(ikb, [{ type: "rot", link: R.model.linkOf.Head, target: T.headR, w: 1 }], R.chains.neck, PREF_FOOT, 2);
        for (const i of trunkSet) { R.qT[H[i].link] = ikb.q[H[i].link]; R.qdT[H[i].link] = 0; }
        if (P.loadPath) for (const i of trunkSet) ikb.q[H[i].link] = b.q[H[i].link];
        ikb.kinematics();
      }
      for (const S of ["L", "R"]) {
        const gr = R.grips[S];
        if (!T.grip[S] && gr.held) { gr.held = false; gr.F = [0, 0, 0]; gr.T = [0, 0, 0]; }
        // (a hand on its grip goes where the grip is; reaching, she corrects for where her hand
        // actually is - what she sees - so that it arrives; holding the bike up, her left hand
        // pushes into the bar across it)
        let tgt = gr.held ? R.gripWorld(bk, S).c : T.hands[S];
        if (S === "L" && gr.held && G.hold.active && !P.loadPath) {
          const err = bikeRoll(bk) - G.hold.target, push = clamp(-(P.holdPushK * err + P.holdPushC * bikeRollRate(bk)), -P.holdPushMaxM, P.holdPushMaxM);
          G.hold.pushM = push; G.hold.stats.pushSum += Math.abs(push) * dt; G.hold.stats.maxPushM = Math.max(G.hold.stats.maxPushM, Math.abs(push));
          tgt = add(tgt, scl(unit([bk.R[0], bk.R[3], 0]), push));
        }
        if (tgt && doIK) {
          const hw = b.toWorld(hand[S].link, hand[S].p), e = sub(tgt, hw), hc = SC.handFix[S];
          if (!gr.held && len(e) < 0.2) { for (let k = 0; k < 3; k++) hc[k] = clamp(hc[k] + e[k] * 4 * ikDt, -0.1, 0.1); } else hc.fill(0);
          // (a hand at a grip turned to it - the bar across the palm, as in 46's riding solve; on the
          // bike elsewhere, the palm onto it)
          const htasks = [{ type: "pos", link: hand[S].link, local: hand[S].p, target: add(tgt, hc), w: 100 }];
          if (T.grip[S] || gr.held) { const gw = R.gripWorld(bk, S); htasks.push({ type: "dir", link: hand[S].link, local: hand[S].axis, target: gw.a, w: 2 }, { type: "dir", link: hand[S].link, local: hand[S].volar, target: mv(bk.R, unit([0, 0.35, -1])), w: 0.4 }); }
          else htasks.push({ type: "dir", link: hand[S].link, local: hand[S].volar, target: k.palm?.[S] === "in" ? scl(mv(bk.R, [1, 0, 0]), -Math.sign(toB(bikeFrame(bk), tgt)[0]) || 1) : [0, 0, -1], w: 0.5 });
          // (from within the arm's ranges: an arm that hung beside her rests past its shoulder's range -
          // its passive rest - and a solve started there stays there)
          for (const i of armDofs[S]) { const hh = H[i]; ikb.q[hh.link] = clamp(ikb.q[hh.link], hh.lo, hh.hi); }
          ikb.kinematics();
          I.ikSolve(ikb, htasks, armDofs[S], PREF_BIKE, 4);
          for (const i of armDofs[S]) { const li = H[i].link; R.qT[li] = ikb.q[li]; R.qdT[li] = 0; }
        }
        // (a hand at its grip closes on it)
        if (tgt && T.grip[S] && !gr.held && len(sub(b.toWorld(hand[S].link, hand[S].p), R.gripWorld(bk, S).c)) < P.gripCloseM) R.closeGrip(bk, S);
        if (tgt) continue;
        {
          // (a free hand hangs)
          const sd = S === "L" ? "left" : "right";
          for (const [id, deg] of [["Shoulder.flexionExtension", 0], ["Shoulder.abductionAdduction", -62], ["Shoulder.axialRotation", 0], ["Elbow.flexionExtension", 15]]) if (sd + id in I.hingeIndex) { const li = lk(sd + id); R.qT[li] = deg * DEG; R.qdT[li] = 0; }
        }
      }
      // (sitting down onto the bike: her trunk, head and arms go over into the riding pose she was
      // pre-settled in - 46 - which has her hands on the grips; seatPose from whoever set her up)
      if (doIK && T.seatBlend > 0 && G.seatPose?.q) for (const i of R.chains.spine.concat(R.chains.neck, armDofs.L, armDofs.R)) { const li = H[i].link; R.qT[li] = lerp(R.qT[li], G.seatPose.q[li], T.seatBlend); }
      // (holding the bike: the lean she keeps it at, from where it was at the keyframe's start)
      if (k.holdDeg != null) {
        if (SC.holdFrom == null) SC.holdFrom = G.hold.active ? G.hold.target : bikeRoll(bk);
        G.hold.active = true;
        G.hold.target = lerp(SC.holdFrom, k.holdDeg * DEG, smooth01(clamp(SC.t / Math.max(0.2, k.T), 0, 1)));
      } else if (k.hold === false) G.hold.active = false;
      // (the bike tipping away from what she holds it at while her leg is over it: she gives up
      // the swing - below)
      const bikeErr = G.hold.active ? Math.abs(bikeRoll(bk) - G.hold.target) : 0;
      SC.bike = { rollDeg: bikeRoll(bk) / DEG, targetDeg: G.hold.target / DEG, errDeg: bikeErr / DEG, rateDegS: bikeRollRate(bk) / DEG };
      // (lifting the bike: the roll she asks for, from where it was at the keyframe's start)
      // (liftTo: towards the roll she lifts it from, lying on that side; liftRoll: a roll of its own -
      // over onto its side stand, which is on its left)
      if (k.liftTo != null || k.liftRoll != null) { if (SC.liftFrom == null) SC.liftFrom = G.lift.target; G.lift.target = lerp(SC.liftFrom, k.liftRoll != null ? k.liftRoll * DEG : G.lift.side * k.liftTo * DEG, smooth01(clamp(SC.t / k.T, 0, 1))); }
      // (her hand on - or at - the left grip: she turns the bars straight; parked, they stand at full
      // lock with the grip against the tank. Applied by the bike's owner of the steering: the
      // browser layer, as a capped torque; barsStraight says so)
      G.barsStraight = R.grips.L.held || len(sub(b.toWorld(hand.L.link, hand.L.p), R.gripWorld(bk, "L").c)) < 0.45;
      R.activation = 0.5; R.servoScale.fill(1);
      // (part tone where the joint is only carried along: a swung leg's knee and ankle, a foot on the
      // ground - its ankle placing the pressure, not holding an angle - and a hand on a grip, whose
      // wrist the grip holds)
      for (const [dofs, tone] of tones) for (const i of dofs) R.servoScale[i] = tone;
      for (const S of ["L", "R"]) if (R.grips[S].held) for (const i of wristDofs[S]) R.servoScale[i] = P.gripWristTone;
      R.tauVF.fill(0);
      if (P.loadPath) loadPathStep(bk, T, k, dt);
      else {
        // the feet on the ground carry her share of her weight
        const vp = b.pointVelocity(pelvis, [0, 0, 0]);
        const Fz = T.load * clamp(m * g + P.kz * (T.pelvis.p[2] - b.p[2]) - P.cz * vp[2], 0, 2 * m * g);
        const st = T.stance.filter((S) => footLoad(S) > 20 || T.stance.length === 1);
        const holding = R.grips.L.held || R.grips.R.held;
        for (const S of st) { const pw = copPoint(S, holding ? footMid(S) : G.com), F = [0, 0, Fz / st.length]; for (const { li, j } of I.Jcol(foot[S].link, pw, legDofs[S])) R.tauVF[li] -= dot(j, F); }
        I.feedForward(b.gravity);
        for (const S of st) for (const i of legDofs[S]) R.tauFF[H[i].link] = 0;
      }
      PL.ff = "custom";
      // next keyframe once this one's time is up and its pose reached (pelvis and a swinging foot
      // within reachM) - she waits for it up to waitS more, then gives up (on her feet, or down);
      // the last keyframe's pose is held until whoever started the motion takes her on
      if (k.watchBike && G.hold.active && bikeErr > k.watchBike * DEG && !SC.done) { SC.t = Math.max(SC.t, k.T + (k.waitS ?? 0.8)); SC.tipped = true; }
      // (down: her pelvis well under where the motion has it for a moment - she has fallen, and the
      // motion is over; she lets go, and gets up once at rest. Lifting the bike: a hand that has
      // lost its point of the bike for a moment - she lets go of it, and it goes back down)
      SC.downS = T.pelvis.p[2] - b.p[2] > P.scriptDownM ? SC.downS + dt : 0;
      // (the bike past saving, falling towards her: she lets it go and steps away from it)
      const tipNow = G.hold.active ? G.hold.target - bikeRoll(bk) : 0;
      if (G.hold.active && tipNow > P.letGoDeg * DEG && !SC.done) {
        const onFail = SC.onFail, F0 = SC.frame || bikeFrame(bk), away = mv(F0.Ry, [-1, 0, 0]);
        SC.failed = { name: SC.name, key: SC.i, letGo: true };
        SC.keys = null; G.hold.active = false; LPS.lean = [0, 0]; LPS.brace = 0;
        for (const S of ["L", "R"]) R.grips[S].held = false;
        onFail ? onFail() : G.enterFoot();
        if (PL.mode === "foot") G.stepAway = { dir: [away[0], away[1]], t: P.stepAwayS };
        return;
      }
      SC.lostS = (k.liftTo != null || k.liftRoll != null) && ["L", "R"].some((S) => k.hands?.[S]?.bike && T.hands[S] && len(sub(b.toWorld(hand[S].link, hand[S].p), T.hands[S])) > P.liftLostM) ? SC.lostS + dt : 0;
      if ((SC.downS > P.scriptDownS || SC.lostS > P.liftLostS) && !SC.done) {
        const down = SC.downS > P.scriptDownS, onFail = SC.onFail;
        SC.failed = { name: SC.name, key: SC.i, down, lostBike: !down };
        G.lift.active = false; G.hold.active = false;
        for (const S of ["L", "R"]) R.grips[S].held = false;
        if (down) { SC.keys = null; onFail ? onFail() : G.enterFoot(); G.toRagdoll("motion"); return; }
        // (the bike lost: she lets go of it and stands up between her feet)
        const Fk = SC.frame || bikeFrame(bk), mid = toB(Fk, scl(add(footMid("L"), footMid("R")), 0.5));
        startScript("recover", [
          { T: 0.9, pelvis: [mid[0], mid[1], P.hipH], yawDeg: k.yawDeg ?? 0, pitchDeg: 0, chestPitchDeg: 0, hands: { L: null, R: null }, stance: ["L", "R"], lean: false },
        ], bk, () => { G.enterFoot(); onFail?.(); }, () => { G.enterFoot(); onFail?.(); }, SC.frame);
        return;
      }
      if (SC.t >= k.T && !SC.done) {
        const eP = len(sub(T.pelvis.p, b.p)), sw = ["L", "R"].filter((S) => k.feet?.[S] && !T.stance.includes(S));
        const eF = Math.max(0, ...sw.map((S) => (k.swing?.[S] && T.knees[S] ? len(sub(T.knees[S], b.toWorld(R.model.linkOf[S + "_Calf"], [0, 0, 0]))) : len(sub(T.feet[S], ballW(S))))));
        // (and a hand sent to its grip holding it; and - waitBike - the bike steady at the lean she
        // holds it at: she knows it is balanced before she stands on one foot and swings)
        const gripsOk = ["L", "R"].every((S) => !(k.hands?.[S] === "grip" && T.grip[S]) || R.grips[S].held);
        const bikeOk = (!k.waitBike || (bikeErr < k.waitBike.tolDeg * DEG && Math.abs(bikeRollRate(bk)) < k.waitBike.rateDegS * DEG)) && (!k.waitRoll || (Math.abs(bikeRoll(bk) - k.waitRoll.deg * DEG) < k.waitRoll.tolDeg * DEG && Math.abs(bikeRollRate(bk)) < k.waitRoll.rateDegS * DEG));
        SC.err = { pelvis: eP, foot: eF, grips: gripsOk, bike: bikeOk };
        if ((eP < (k.reachM ?? 0.08) && eF < (k.reachM ?? 0.08) + 0.02 && gripsOk && bikeOk) || SC.t >= k.T + (k.waitS ?? 0.8)) {
          if (SC.t >= k.T + (k.waitS ?? 0.8) && (k.mustReach || SC.tipped || (k.waitBike && !bikeOk) || (k.needGrip && !gripsOk))) {
            SC.failed = { name: SC.name, key: SC.i, pelvis: eP, foot: eF, bike: SC.bike, tipped: !!SC.tipped };
            SC.tipped = false;
            const onFail = SC.onFail, swung = ["L", "R"].find((S) => k.swing?.[S]);
            // (a leg caught on its way over: she puts it back down beside the foot she stands on,
            // lets go and stands - then the player can try again)
            // (the swing played back: the knee back down behind her, then the foot to the ground)
            if (swung && SC.name === "dismount") {
              // (getting off: the leg back onto its peg and her seat back on the seat - the riding
              // controller takes her on, stopped with her left foot down; the stand stays down)
              startScript("recover", [
                { T: 0.7, pelvis: [-0.06, -0.3, 0.92], pitchDeg: 18, rollDeg: -4, chestPitchDeg: 35, feet: { R: PEG_R }, knees: { R: KNEE_R }, swing: { R: { kneeDeg: 100, footW: 2 } }, stance: ["L"], grip: { L: true }, lean: false },
                { T: 0.5, pelvis: [-0.06, -0.3, 0.92], pitchDeg: 18, rollDeg: -4, chestPitchDeg: 42, seatQ: true, feet: { R: PEG_R }, fix: { R: true }, stance: ["L"], load: 0, grip: { L: true }, lean: false },
              ], bk, () => { G.toRide(bk); onFail?.(); }, () => { G.toRide(bk); onFail?.(); }, SC.frame);
              return;
            }
            if (swung) {
              const st = other(swung), f = SC.end.feet[st] || toB(SC.frame || bikeFrame(bk), ballW(st)), side = swung === "R" ? 1 : -1;
              startScript("recover", [
                { T: 0.6, pitchDeg: 45, rollDeg: -side * 10, chestPitchDeg: 45, feet: { [swung]: [f[0] + side * 0.2, f[1] - 0.66, 0.84] }, knees: { [swung]: [f[0] + side * 0.2, f[1] - 0.45, 0.6] }, swing: { [swung]: { kneeDeg: 95 } }, stance: [st], grip: { L: true } },
                { T: 0.6, pitchDeg: 15, rollDeg: 0, chestPitchDeg: 15, twistDeg: 0, feet: { [swung]: [f[0] + side * 0.17, f[1] - 0.06, 0] }, via: { [swung]: [f[0] + side * 0.2, f[1] - 0.3, 0.3] }, fix: { [swung]: true }, stance: [st], grip: { L: true } },
                { T: 0.4, pitchDeg: 0, chestPitchDeg: 0, hands: { L: null, R: null }, stance: ["L", "R"], hold: false, onStart: () => { G.hold.active = false; } },
              ], bk, () => { G.enterFoot(); onFail?.(); }, () => { G.enterFoot(); onFail?.(); }, SC.frame);
              return;
            }
            SC.keys = null; onFail ? onFail() : G.enterFoot(); return;
          }
          if (SC.i + 1 < SC.keys.length) {
            SC.prev = SC.end; SC.i++; SC.t = 0; SC.liftFrom = null; SC.holdFrom = null; SC.handFix = { L: [0, 0, 0], R: [0, 0, 0] };
            // (freeze: from here her places are fixed on the ground, whatever the bike does - it goes
            // onto its stand)
            if (SC.keys[SC.i].freeze && !SC.frame) SC.frame = bikeFrame(bk);
            SC.keys[SC.i].onStart?.();
          }
          else { SC.done = true; SC.onDone?.(); }
        }
      }
    };
    // ---- the load path at the bike (46 loadPlan): her contacts - feet on the ground, hands on the
    // bars, a palm on the tank, a hip against the seat, the seat under her - carry her and hold the
    // bike, with the least joint effort; the joint torques that carry those forces are her
    // feed-forward. Her balance asks the contacts for the net force that brings her centre of mass
    // to where her planned posture puts it (lpK, lpC; at most lpAmax) and the moment that turns her
    // pelvis to its planned orientation (lpI x (lpKr, lpCr)); holding the bike up, they must also
    // give it the roll moment that holds it at the lean she keeps it at (its weight's moment about
    // its tyre line, and holdHerK / holdHerC on the lean error and rate). Standing she leans into
    // that push: her centre of mass goes as far towards the bike from where her feet press
    // (supportPoint) as balances what her hands and hip do (lean, at lpLeanRate, at most
    // lpLeanMaxM) - her legs then stand along the push, the outer one taking most of it
    // (lpOuterShare of the pressure towards it). Declared priors.
    const LPS = (G.loadPathState = { acc: 1, cT: null, vT: [0, 0, 0], lean: [0, 0], p: null });
    function supportPoint(T, k) {
      const on = T.stance.filter((S) => footLoad(S) > 20);
      if (!on.length) return null;
      if (k.over && on.includes(k.over)) return footMid(k.over);
      if (on.length === 1) return footMid(on[0]);
      // (two feet: towards the one further out from the bike while she holds it)
      const Fb = SC.frame || bikeFrame(G.bk), xL = Math.abs(toB(Fb, footMid("L"))[0]), xR = Math.abs(toB(Fb, footMid("R"))[0]);
      const out = xL > xR ? "L" : "R", share = G.hold.active || R.grips.L.held || R.grips.R.held ? P.lpOuterShare : 0.5;
      return add(footMid(other(out)), scl(sub(footMid(out), footMid(other(out))), share));
    }
    function loadPathStep(bk, T, k, dt) {
      G.bk = bk;
      // where her planned posture puts her centre of mass (her joint targets from the planned pelvis)
      ikb.p = T.pelvis.p.slice(); ikb.R = T.pelvis.R.slice(); ikb.q.set(R.qT); ikb.kinematics();
      const cT = I.comOf(ikb);
      if (LPS.cT) { const v = scl(sub(cT, LPS.cT), 1 / dt); LPS.vT = add(LPS.vT, scl(sub(v, LPS.vT), Math.min(1, dt / 0.05))); }
      LPS.cT = cT;
      // (horizontally no faster than her feet can push her - her pressure moving within them - the
      // rest would be asked of her hands; up and down her legs push easily)
      const aDes = [0, 1, 2].map((i) => i < 2 ? clamp(P.lpK * (cT[i] - G.com[i]) + P.lpC * (LPS.vT[i] - G.vcom[i]), -P.lpAmax, P.lpAmax) : clamp(P.lpKz * (cT[i] - G.com[i]) + P.lpCz * (LPS.vT[i] - G.vcom[i]), -P.lpAzMax, P.lpAzMax));
      const eR = logSO3(mm(T.pelvis.R, mt(b.R))), wP = mv(b.R, [b.vb[0], b.vb[1], b.vb[2]]);
      const Ld = [0, 1, 2].map((i) => P.lpI * (P.lpKr * eR[i] - P.lpCr * wP[i]));
      // (what her contacts must do to the bike about its tyre line: holding it up, the moment that holds
      // it at the lean she keeps it at; not holding it - on its stand, or lifted by the lift - none:
      // her balance is not taken from rolling the bike)
      const phi = bikeRoll(bk), rate = bikeRollRate(bk), Fb = SC.frame || bikeFrame(bk);
      const bikeRow = { M: G.hold.active ? -(PL.holdBikeKg * g * PL.holdBikeComH * Math.sin(phi) + P.holdHerK * (phi - G.hold.target) + P.holdHerC * rate) : 0, o: Fb.o, h: unit([bk.R[1], bk.R[4], 0]) };
      LPS.acc += dt;
      if (LPS.acc >= P.lpEveryS || !R.loadPath.forces.length) {
        LPS.acc = 0;
        R.loadPlan({ feet: T.stance, bike: true, aDes, LdotDes: Ld, bikeRow });
        // (leaning into the push that holds the bike up: holding it by its bars from where she stands,
        // her weight's moment about her feet balances what the bike needs - m g lean = its roll moment,
        // her hands pushing at about the height of its tyre line's lever. From the bike's need, not
        // from the forces planned or met: what she rests on or bumps into would feed back into it.
        // Across the bike only; standing - not while she moves onto its seat)
        const p = k.lean !== false ? supportPoint(T, k) : null;
        LPS.p = p;
        const F = SC.frame || bikeFrame(bk), ax = mv(F.Ry, [1, 0, 0]), fw = mv(F.Ry, [0, 1, 0]);
        const rate = Math.min(1, P.lpLeanRate * P.lpEveryS), cur = dot([LPS.lean[0], LPS.lean[1], 0], ax);
        // (and her centre of mass over where her feet press - whatever her trunk leans: her feet carry
        // her, not the bars or the bike - fore and aft, and across the bike too when she is not
        // holding it up or reaching for its bars)
        const toFeet = (v, axis) => { const e = dot(sub(p, cT), axis), eD = e > P.lpForeDeadM ? e - P.lpForeDeadM : e < -P.lpForeDeadM ? e + P.lpForeDeadM : 0; return clamp(v + eD * rate, -P.lpForeMaxM, P.lpForeMaxM); };
        // (reaching for a grip she leans out to it: not pulled back over her feet across the bike)
        const reaching = ["L", "R"].some((S) => k.hands?.[S] === "grip" && !R.grips[S].held);
        // (tipping towards her past what her hands hold - she braces her hip against it: her pelvis
        // over into it until the hip rests on its flank, and her legs take it through her hip)
        const tip = G.hold.active ? G.hold.target - phi : 0;
        LPS.brace = smooth01((tip / DEG - P.braceStartDeg) / P.braceSpanDeg);
        const want = clamp(bikeRow.M / (m * g), 0, P.lpLeanMaxM) + LPS.brace * P.braceHipM;
        const next = p && G.hold.active ? cur + (want - cur) * Math.min(1, rate * (1 + 3 * LPS.brace)) : p && !reaching ? toFeet(cur, ax) : cur - cur * rate;
        let fore = dot([LPS.lean[0], LPS.lean[1], 0], fw);
        fore = p ? toFeet(fore, fw) : fore - fore * rate;
        LPS.lean = [ax[0] * next + fw[0] * fore, ax[1] * next + fw[1] * fore];
      }
      R.loadFeedForward(b.gravity);
    }
    function scriptAssist(T) {
      let F, Tq, at = b.p;
      const lo = R.loadPath.out;
      if (P.loadPath && lo) {
        // with the load path: only what her contacts cannot give her balance (the plan's shortfall on
        // the net force and the moment about her centre of mass), capped - zero when her posture
        // lets her contacts carry her
        F = scl(lo.netErrF, -1); Tq = scl(lo.netErrM, -1); at = G.com;
      } else {
        const e = logSO3(mm(T.pelvis.R, mt(b.R))), w = mv(b.R, [b.vb[0], b.vb[1], b.vb[2]]);
        Tq = sub(scl(e, P.getUpK), scl(w, P.getUpC));
        const vp = b.pointVelocity(pelvis, [0, 0, 0]);
        F = sub(scl(sub(T.pelvis.p, b.p), P.getUpKp), scl(vp, P.getUpCp));
      }
      const tl = len(Tq); if (tl > P.scriptMaxNm) Tq = scl(Tq, P.scriptMaxNm / tl);
      const fl = len(F); if (fl > P.scriptMaxN) F = scl(F, P.scriptMaxN / fl);
      const Tl = mtv(b.Rw[pelvis], Tq), fe = b.fext[pelvis]; fe[0] += Tl[0]; fe[1] += Tl[1]; fe[2] += Tl[2];
      b.applyForce(pelvis, F, at);
      const st = SC.stats; st.Nsum += len(F) * (PL.lastDt || 0); st.Tsum += len(Tq) * (PL.lastDt || 0); st.n += PL.lastDt || 0; st.maxN = Math.max(st.maxN, len(F));
      G.stats.scriptN = len(F); G.stats.scriptNm = len(Tq);
    }
    const lerp3 = (a, c, s) => [lerp(a[0], c[0], s), lerp(a[1], c[1], s), lerp(a[2], c[2], s)];
    // (916 geometry, bike frame at the ground, measured from its rider surfaces: the tank top by the
    // seat, the seat with her pelvis on it (pre-settled, slid towards the planted foot as she sits
    // stopped), the right peg, her left foot on the ground where she holds the bike up (46: footGroundX
    // out, footGroundDy ahead of the peg); a foot passes over the seat at 1.0 m (the seat top 0.8 m)
    const TANK = [-0.04, 0.0, 0.99], TANK_B = [-0.04, 0.0, 0.35], SEATED = [-0.04, -0.31, 0.905], PEG_R = [0.22, -0.36, 0.43], FOOT_L = [-0.27, -0.26, 0], KNEE_R = [0.235, -0.02, 0.64];
    // the two leg-overs as data - the swung (right) leg's knee and foot and the pelvis at each key
    // (bike frame at the ground: +x its right, +y forward), the start pose each is found from and
    // where it ends. Found offline with this leg's own hip reach and ranges against the 916's
    // envelope, and checked or searched again from this data by tools/swing-path.mjs
    //   mount: from beside the tank on her left foot (stance), holding the bike up (grip / balance: the
    //     left hand on its grip, her centre of mass over the standing foot)
    //   dismount: off the seat over the bike resting on its side stand (bikeRollDeg), her seat on the
    //     seat's edge, the left foot down
    const SWING_ON = {
      start: { pelvis: [-0.44, -0.16, 0.87], pitch: 30, roll: 0, chest: 30, twist: -15, knee: [-0.36, -0.24, 0.44], kneeDeg: 20, footOff: [-0.01, -0.05, -0.44] },
      stance: [-0.46, -0.05, 0], bikeRollDeg: P.holdLeanDeg, grip: true, balance: true,
      keys: [
        { T: 0.6, pelvis: [-0.396, -0.227, 0.896], pitch: 63, roll: -18, chest: 42, twist: -15, knee: [-0.449, -0.588, 0.67], kneeDeg: 46, footOff: [-0.111, -0.255, 0.132] },
        { T: 0.5, pelvis: [-0.312, -0.089, 0.95], pitch: 58, roll: -42, chest: 39, twist: -15, knee: [-0.201, -0.539, 1.042], kneeDeg: 66, footOff: [-0.022, -0.314, 0.113], must: true },
        { T: 0.5, pelvis: [-0.351, -0.114, 0.95], pitch: 31, roll: -47, chest: 45, twist: -15, knee: [0.029, -0.425, 0.992], kneeDeg: 48, footOff: [0.121, -0.382, 0.257], must: true },
        { T: 0.45, pelvis: [-0.331, -0.249, 0.936], pitch: 49, roll: -48, chest: 45, twist: -10, knee: [0.144, -0.403, 1.025], kneeDeg: 50, footOff: [-0.049, -0.25, 0.047] },
      ],
      final: { T: 0.5, pelvis: [-0.08, -0.27, 0.95], pitch: 35, roll: -10, chest: 40, twist: -5, knee: [0.24, -0.2, 0.72], kneeDeg: 80, footOff: [0.06, -0.25, -0.2] },
    };
    const SWING_OFF = {
      start: { pelvis: [-0.06, -0.3, 0.92], pitch: 18, roll: -4, chest: 35, twist: 0, knee: [0.235, -0.02, 0.64], kneeDeg: 100, footOff: [-0.015, -0.34, -0.21] },
      stance: [-0.3, -0.28, 0], bikeRollDeg: -10, grip: false, balance: false,
      keys: [
        { T: 0.7, pelvis: [-0.08, -0.349, 0.885], pitch: 32, roll: -48, chest: 27, twist: -5, knee: [0.44, -0.456, 0.923], kneeDeg: 46, footOff: [0.088, -0.492, 0.281] },
        { T: 0.6, pelvis: [-0.235, -0.222, 0.903], pitch: 62, roll: -41, chest: 30, twist: -10, knee: [0.051, -0.629, 1.059], kneeDeg: 58, footOff: [-0.088, -0.343, 0.067], must: true, reachM: 0.12 },
        { T: 0.6, pelvis: [-0.24, -0.267, 0.856], pitch: 74, roll: -48, chest: 45, twist: -15, knee: [-0.251, -0.725, 0.984], kneeDeg: 77, footOff: [-0.022, -0.119, 0.258], reachM: 0.12 },
      ],
      final: { T: 0.6, pelvis: [-0.3, -0.26, 0.87], pitch: 20, roll: 0, chest: 20, twist: -10, knee: [-0.36, -0.46, 0.46], kneeDeg: 30, footOff: [-0.08, -0.05, -0.46] },
    };
    G.swingPaths = { mount: SWING_ON, dismount: SWING_OFF };
    // a key of a leg-over as a script keyframe: the right leg swung (hip-driven, the knee eased to
    // kneeDeg), standing on the left
    const swingKey = (k, extra) => ({
      T: k.T, pelvis: k.pelvis, pitchDeg: k.pitch, rollDeg: k.roll, chestPitchDeg: k.chest, twistDeg: k.twist,
      knees: { R: k.knee }, feet: { R: add(k.knee, k.footOff) }, swing: { R: { kneeDeg: k.kneeDeg, footW: 2 } }, stance: ["L"],
      ...(k.must ? { mustReach: true } : {}), ...(k.reachM ? { reachM: k.reachM } : {}), ...extra,
    });
    // a way to a point beside the bike that goes round it, not through it: the bike (with her
    // half-width) a box in its frame, the way through its corners where it must
    const BOX = { xMin: -0.62, xMax: 0.62, yMin: -1.35, yMax: 1.25 };
    function around(F, fromW, to, box = BOX) {
      const inBox = (p) => p[0] > box.xMin && p[0] < box.xMax && p[1] > box.yMin && p[1] < box.yMax;
      const clearSeg = (p, q) => { for (let i = 1; i < 16; i++) if (inBox(lerp3(p, q, i / 16))) return false; return true; };
      const out = [];
      let p = toB(F, fromW);
      p[2] = 0;
      if (inBox(p)) { p = [p[0] < (box.xMin + box.xMax) / 2 ? box.xMin - 0.15 : box.xMax + 0.15, p[1], 0]; out.push(p); }
      if (!clearSeg(p, to)) {
        const C = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => [sx < 0 ? box.xMin - 0.1 : box.xMax + 0.1, sy < 0 ? box.yMin - 0.1 : box.yMax + 0.1, 0]);
        const d2 = (u, v) => len(sub(u, v));
        let best = null;
        for (const c of C) if (clearSeg(p, c) && clearSeg(c, to)) { const d = d2(p, c) + d2(c, to); if (!best || d < best.d) best = { d, via: [c] }; }
        for (let i = 0; i < 4; i++) for (const j of [(i + 1) % 4, (i + 3) % 4]) if (clearSeg(p, C[i]) && clearSeg(C[j], to)) { const d = d2(p, C[i]) + d2(C[i], C[j]) + d2(C[j], to); if (!best || d < best.d) best = { d, via: [C[i], C[j]] }; }
        if (best) out.push(...best.via);
      }
      return out.map((v) => toW(F, v));
    }
    // where she stands to get on: beside the tank on its left, facing forward (her centre of mass),
    // come to from out to its left (sidestepping in the last of it); on its side stand the bike
    // leans towards her, and the spot is taken out with it (a point beside it at her hip height)
    G.mountSpot = (bk) => {
      const F = bikeFrame(bk), at = (v) => { const w = I.bikeToWorld(bk, v); return toB(F, [w[0], w[1], F.o[2]]); };
      const sp = at([-0.36, -0.04, 0.26]), ap = at([-0.82, -0.1, 0.26]);
      return { p: toW(F, [sp[0], sp[1], 0]), psi: F.yaw, approach: [ap[0], ap[1], 0] };
    };
    // getting on from the left: she takes the left grip and puts her right hand on the tank, leans
    // over the tank and swings her right leg back and up, over the seat and down its other side,
    // moves onto the seat, puts her right foot on its peg and her left foot where it holds the
    // bike up, and takes the right grip
    G.startMount = (bk, onSeated, onGrip, onFail) => {
      const spot = G.mountSpot(bk), F = bikeFrame(bk), A = toW(F, spot.approach);
      G.goTo(spot.p, spot.psi, () => startScript("mount", [
        // (the bars, and the bike off its stand - held upright - and a step in to it)
        { T: 0.7, pelvisIn: [0.05, 0.05, -0.02], pitchDeg: 36, twistDeg: -20, hands: { L: "grip", R: { bike: TANK_B } }, handVia: { R: [-0.3, -0.04, 1.1] }, grip: { L: true }, waitS: 2.5, needGrip: true },
        { T: 0.7, pelvis: [-0.42, -0.12, 0.85], pitchDeg: 25, grip: { L: true }, holdDeg: P.holdLeanDeg, onStart: onGrip, reachM: 0.12 },
        // (her feet where the leg over starts from, wherever her walk left them: the left beside the
        // tank, then the right back beside the swingarm, where the bike is narrow - by the engine and
        // the fairing a knee there would press into them. Her weight over the foot that stays first,
        // the pelvis kept off the seat)
        { T: 0.35, over: "R", pelvisZ: 0.85, stance: ["L", "R"], grip: { L: true }, reachM: 0.06, waitS: 0.6 },
        { T: 0.45, feet: { L: [-0.46, -0.05, 0] }, via: { L: [-0.54, -0.02, 0.08] }, fix: { L: true }, stance: ["R"], grip: { L: true }, reachM: 0.1 },
        { T: 0.35, over: "L", pelvisZ: 0.85, stance: ["L", "R"], grip: { L: true }, reachM: 0.06, waitS: 0.6 },
        { T: 0.45, feet: { R: [-0.4, -0.28, 0] }, via: { R: [-0.45, -0.2, 0.08] }, fix: { R: true }, stance: ["L"], grip: { L: true }, reachM: 0.1 },
        // (her weight over her left foot - where it came to beside the tank - on both feet, the bike
        // steady at the lean she holds it at: now she can stand on one foot)
        { T: 0.4, over: "L", pelvisZ: 0.87, pitchDeg: 30, twistDeg: -20, stance: ["L", "R"], grip: { L: true }, reachM: 0.06, waitBike: { tolDeg: 2.5, rateDegS: 6 }, waitS: 2 },
        // (the leg over - the hip and the pelvis's side tilt do it, the knee easy, the ankle loose: the
        // knee back and out, up behind her beside the tail, across over the seat's middle as the
        // pelvis tilts right side up, and on past its far edge before it comes down. A path found
        // offline with this leg's own hip reach and ranges, clear of the 916's envelope by 1-3 cm
        // standing still: tools and numbers in docs/PHYSICS.md)
        ...SWING_ON.keys.map((k) => swingKey(k, { grip: { L: true }, watchBike: 8, lean: false })),
        swingKey(SWING_ON.final, { load: 0.4, grip: { L: true }, watchBike: 8, lean: false }),
        // (onto the seat, the right foot to its peg: her weight on the seat, the riding controller
        // (46) takes her on - it puts her left foot down to balance the bike, and her right hand
        // closes on its grip when it gets there)
        { T: 0.6, pelvis: [-0.06, -0.3, 0.92], pitchDeg: 18, rollDeg: -4, chestPitchDeg: 42, twistDeg: 0, holdDeg: -2, feet: { L: [-0.3, -0.22, 0.06], R: PEG_R }, via: { R: [0.25, -0.34, 0.56] }, fix: { R: true }, knees: { R: KNEE_R }, kneeW: 20, seatQ: true, stance: [], load: 0, grip: { L: true }, lean: false },
      ], bk, () => onSeated?.(), onFail), () => G.enterFoot(), 0.12, 20, [...around(F, G.com, spot.approach), A], 0.55);
    };
    // getting off to the left, stopped with her left foot down: the right hand to the tank, up off
    // the seat onto her left leg, the right leg up the bike's right side, over the tail and seat
    // and down behind her left foot, then the left foot a step out and her hand off the bar - the
    // way on, backwards
    // getting off to the left, stopped with her left foot down: the side stand first (onStand) - seated,
    // her left foot on the ground, she lets the bike lean over onto it - then, the bike standing on its
    // own, her right hand from its grip to the tank, up off the seat onto her left leg as her right leg
    // goes back over the tail and down behind her left foot, and a step away. (The leg over: a path
    // found offline over the bike leaning on its stand - the hip and the pelvis's side tilt, the knee
    // easy, her seat on the seat's edge - clear of the envelope by 1.8 cm standing still:
    // tools/swing-path.mjs)
    G.startDismount = (bk, onOff, onStand) => {
      PL.fallen = true; PL.ff = "custom";
      for (const S of ["L", "R"]) { const gr = R.grips[S]; if (!gr.held) { gr.held = true; gr.overloadS = 0; gr.twist0 = null; } }
      G.hold.active = false;
      startScript("dismount", [
        // (the stand down: seated, she lets the bike lean over onto it and waits till it rests there)
        { T: 1.0, pelvis: [-0.06, -0.3, 0.92], pitchDeg: 18, rollDeg: -4, chestPitchDeg: 35, stance: ["L"], load: 0, grip: { L: true, R: true }, lean: false, waitRoll: { deg: P.standDeg, tolDeg: 2, rateDegS: 6 }, waitS: 2, onStart: () => onStand?.() },
        { T: 0.5, pelvis: [-0.06, -0.3, 0.92], pitchDeg: 18, rollDeg: -4, chestPitchDeg: 35, hands: { R: TANK }, handVia: { R: [0.14, 0.22, 1.08] }, stance: ["L"], load: 0, grip: { L: true }, lean: false },
        ...SWING_OFF.keys.map((k) => swingKey(k, { grip: { L: true }, lean: false })),
        swingKey(SWING_OFF.final, { grip: { L: true }, lean: false }),
        // (the right foot down behind the left, her hands off the bike, and up straight between her
        // feet: from here she is on her feet - the walking controller has her, and steps her clear)
        { T: 0.45, pelvis: [-0.34, -0.33, 0.86], pitchDeg: 12, chestPitchDeg: 12, feet: { R: [-0.46, -0.46, 0] }, fix: { R: true }, hands: { R: null }, stance: ["L"], grip: { L: true }, lean: false },
        { T: 0.5, pelvis: [-0.4, -0.37, 0.88], pitchDeg: 0, chestPitchDeg: 0, twistDeg: 0, hands: { L: null, R: null }, stance: ["L", "R"], freeze: true, lean: false },
      ], bk, () => { G.enterFoot(bikeYaw(bk)); onOff?.(); }, () => { onOff?.(); });
    };
    // ---- holding the bike up while she gets on or off. She keeps it leaning a little onto her side
    // (holdDeg, - = towards its left, where she stands) - her standing leg is on that side - with her
    // hands on the bars: her left hand pushes the bar across, out of the way of the lean error and
    // its rate (the hand's target moved into the bar by up to holdPushMaxM): her arm's servos make
    // that push within their strength and the grip carries it into the bike, her legs bracing her
    // against it. What her arm does not, a declared residual - a roll moment on the bike towards the
    // lean, capped at holdAssistMaxNm and reported - holds; past that it falls. G.hold says what she
    // asks for; the owner of the bike's dynamics applies the residual.
    G.hold = { active: false, target: 0, pushM: 0, Nm: 0, stats: { NmSum: 0, n: 0, maxNm: 0, pushSum: 0, maxPushM: 0 } };
    const bikeRoll = (bk) => I.uprightFrame(bk, 0).roll;
    const bikeRollRate = (bk) => (bk.w ? dot(bk.w, [bk.R[1], bk.R[4], bk.R[7]]) : 0);
    // the force at a point of the bike (world) that turns it about its tyre line with the roll moment
    // tau (+ = towards its right); its tyre line through tl0 along its heading
    G.rollForceAt = (bk, x, tau, tl0) => {
      const fw = [bk.R[1], bk.R[4], 0], hh = unit(len(fw) > 1e-6 ? fw : [0, 1, 0]);
      const o = tl0 || bikeFrame(bk).o;
      let r = sub(x, o);
      r = sub(r, scl(hh, dot(r, hh)));
      return scl(cross(scl(hh, tau), r), 1 / Math.max(0.05, dot(r, r)));
    };

    // ---- lifting the bike off its side. She walks round to its upper side and faces it, squats
    // and takes hold of it (the front hand at the tank's top edge, the rear at the seat's rear edge -
    // points of the bike, followed as it moves), rises as it comes up to liftMidDeg, steps in,
    // pushes it upright and lets it down onto its side stand. The bike is raised by a declared
    // lift assist - a roll moment on it towards the roll she asks for (G.lift.target), capped at
    // liftMaxNm and reported (G.lift.stats); applied by the bike's owner (the browser layer), not
    // by her hands' forces, and never called her strength.
    G.lift = { active: false, side: -1, target: 0, stats: { NmSum: 0, n: 0, maxNm: 0 } };
    G.liftSide = (bk) => (I.uprightFrame(bk, 0).roll > 0 ? 1 : -1);
    // (the bike lying, with her half-width: a box from its wheels to its top edge)
    const liftBox = (sd) => (sd < 0 ? { xMin: -1.25, xMax: 0.65, yMin: -1.45, yMax: 1.35 } : { xMin: -0.65, xMax: 1.25, yMin: -1.45, yMax: 1.35 });
    // (pivotW: where the bike's tyres meet the ground, if its owner knows - the line it will turn
    // about; else estimated from its pose)
    G.startLift = (bk, onStand, onUp, onFail, pivotW = null) => {
      const sd = G.liftSide(bk), F = bikeFrame(bk), M = (v) => [-sd * v[0], v[1], v[2]];
      if (pivotW) F.o = [pivotW[0], pivotW[1], F.o[2]];
      F.shear = 0;
      // (her hands on the bike's upper side as it lies - its tank's top edge and the seat's rear edge:
      // points of the bike, so on its side away from the ground, -sd)
      const Fh = sd < 0 ? "L" : "R", Rh = other(Fh), TOP = [-sd * 0.15, -0.05, 0.24], SEATP = [-sd * 0.13, -0.45, 0.2];
      const hands = { [Fh]: { bike: TOP }, [Rh]: { bike: SEATP } }, yawDeg = 90 * sd, psi = F.yaw + (sd * Math.PI) / 2;
      const spot = toW(F, M([-1.2, -0.15, 0])), A = toW(F, M([-1.65, -0.15, 0]));
      G.goTo(spot, psi, () => startScript("lift", [
        { T: 1.0, pelvis: M([-1.15, -0.15, 0.4]), yawDeg, pitchDeg: 60, chestPitchDeg: 70, hands, reachM: 0.1, waitS: 1.0 },
        { T: 1.4, pelvis: M([-1.05, -0.15, 0.7]), yawDeg, pitchDeg: 35, chestPitchDeg: 45, hands, liftTo: P.liftMidDeg, onStart: () => { Object.assign(G.lift, { active: true, side: sd, target: I.uprightFrame(bk, 0).roll }); onUp?.(); } },
        { T: 0.35, over: Fh, pelvisZ: 0.72, yawDeg, pitchDeg: 30, hands, liftTo: P.liftMidDeg, reachM: 0.06, waitS: 0.6 },
        { T: 0.45, feet: { [Rh]: M([-0.92, -0.26, 0]) }, via: { [Rh]: M([-1.05, -0.26, 0.08]) }, stance: [Fh], yawDeg, pitchDeg: 30, hands, liftTo: P.liftMidDeg, reachM: 0.1 },
        { T: 0.35, over: Rh, pelvisZ: 0.74, yawDeg, pitchDeg: 30, hands, liftTo: P.liftMidDeg, reachM: 0.06, waitS: 0.6 },
        { T: 0.45, feet: { [Fh]: M([-0.9, -0.04, 0]) }, via: { [Fh]: M([-1.03, -0.04, 0.08]) }, stance: [Rh], yawDeg, pitchDeg: 30, hands, liftTo: P.liftMidDeg, reachM: 0.1 },
        // (up; then over to lean on its side stand - on its left. Lying on its right, it goes over
        // away from her: she lets go as it passes upright and stands back into balance - leaning on
        // it she would follow it down; from its left it comes towards her and she eases it onto the
        // stand with her hands)
        { T: 0.9, pelvis: M([-0.68, -0.15, 0.85]), yawDeg, pitchDeg: 20, chestPitchDeg: 25, hands, liftRoll: 0 },
        { T: 0.6, pelvis: M([-0.76, -0.15, 0.86]), yawDeg, pitchDeg: 10, chestPitchDeg: 12, hands: sd < 0 ? hands : { L: null, R: null }, liftRoll: P.standDeg + 2 },
        { T: 0.6, pelvis: M([-0.8, -0.15, 0.86]), yawDeg, pitchDeg: 10, chestPitchDeg: 10, hands: sd < 0 ? hands : { L: null, R: null }, onStart: () => { G.lift.active = false; onStand?.(); } },
        { T: 0.5, pelvis: M([-0.88, -0.15, 0.885]), yawDeg, pitchDeg: 0, chestPitchDeg: 0, hands: { L: null, R: null } },
      ], bk, () => { G.lift.active = false; G.enterFoot(psi); }, () => { G.lift.active = false; onFail?.(); }, F), () => { onFail?.(); G.enterFoot(); }, 0.12, 25, [...around(F, G.com, M([-1.65, -0.15, 0]), liftBox(sd)), A], 0);
      // (the points she holds, for the owner of the bike's dynamics: where the lift acts)
      G.lift.points = [TOP, SEATP];
    };
    // what F does next to the bike (bk: the bike adapter; null in tests without one)
    G.action = (bk) => {
      if (!bk || !bk.p || PL.mode !== "foot" || G.goal) return null;
      const seat = I.bikeToWorld(bk, [0, -0.3, 0.0]), d = Math.hypot(seat[0] - G.com[0], seat[1] - G.com[1]);
      const roll = Math.abs(I.uprightFrame(bk, 0).roll);
      if (d > P.reachBikeM) return null;
      return roll > 30 * DEG ? "lift" : "mount";
    };
    // ---- the mode
    // tripped: down she goes (limp, as in a crash), and gets up again once at rest
    G.toRagdoll = (cause = "tripped") => {
      PL.mode = "fallen"; PL.modeS = 0; PL.ff = "none"; PL.fallCause = cause; G.rest = 0; G.impact = 0;
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
      // (having let the bike go, she steps away from it as it falls)
      if (G.stepAway) { G.vDes = scl(G.stepAway.dir, 0.9); G.stepAway.t -= dt; if (G.stepAway.t <= 0) G.stepAway = null; }
      steer(dt);
      gait(dt);
      G.ikAcc += dt;
      if (G.ikAcc >= 1 / 270 || PL.modeS <= dt) { plan(G.ikAcc, bk); G.ikAcc = 0; }
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
    // ---- joint effort and range, off the bike: for each joint group, the servo's active torque as
    // a share of that joint's capacity (tmax - the R1.5 torque ledger) and whether a joint of it is
    // in the stiff end of its range (within its passive stop's width of a limit). An awkward motion
    // - a muscle near its capacity, a joint driven into its end stop - shows here. Live (G.effort.now),
    // per scripted motion and keyframe (G.effort.run, G.effort.last), and riding, per how hard she
    // corners and whether she hangs off (G.effort.ride).
    const GROUPS = { hipL: /^leftHip/, hipR: /^rightHip/, kneeL: /^leftKnee/, kneeR: /^rightKnee/, ankleL: /^leftAnkle/, ankleR: /^rightAnkle/, spine: /^spine/, neck: /^(neck|head)/, armL: /^left(Clavicle|Shoulder|Elbow|Forearm|Wrist)/, armR: /^right(Clavicle|Shoulder|Elbow|Forearm|Wrist)/ };
    const groupOf = H.map((h) => Object.keys(GROUPS).find((gk) => GROUPS[gk].test(h.id)) || null);
    G.effort = { now: {}, run: null, last: null };
    const passiveT = (h, q, qd) => { const pp = h.passive, a = clamp((q - h.lo) / pp.w, -12, 30), c = clamp((h.hi - q) / pp.w, -12, 30); return -pp.k * (q - pp.q0) + pp.A * (Math.exp(-a) - Math.exp(-c)) - pp.d * qd; };
    function effortSample(dt) {
      const now = {};
      for (let i = 0; i < NH; i++) {
        const gk = groupOf[i];
        if (!gk) continue;
        const h = H[i], li = h.link, q = b.q[li], e = Math.abs(b.tau[li] - passiveT(h, q, b.qd[li])) / h.tmax, lim = Math.min(q - h.lo, h.hi - q) < h.passive.w;
        const o = now[gk] || (now[gk] = { e: 0, dof: null, lim: false, limDof: null });
        if (e > o.e) { o.e = e; o.dof = h.id; }
        if (lim && !o.lim) { o.lim = true; o.limDof = h.id; }
      }
      G.effort.now = now;
      // (riding: per how hard she corners - the sustained sideways acceleration she feels, 46's
      // filtered felt gravity - and whether she hangs off)
      if (!PL.fallen) {
        const gf = PL.gFilt || [0, 0, -g], latG = Math.hypot(gf[0], gf[1]) / g, hang = Math.abs(PL.posture?.hang || 0);
        const key = (latG < 0.3 ? "straight" : latG < 0.8 ? "turn" : "hard turn") + (hang > 0.5 ? ", hung off" : "");
        const ride = G.effort.ride || (G.effort.ride = { name: "ride", T: 0, g: {}, keys: {} });
        accEffort(ride, now, dt); accEffort(ride.keys[key] || (ride.keys[key] = { T: 0, g: {} }), now, dt);
        return;
      }
      const run = G.effort.run;
      if (!run || PL.mode !== "script") return;
      accEffort(run, now, dt);
      const key = SC.keys ? SC.i : -1;
      accEffort(run.keys[key] || (run.keys[key] = { T: 0, g: {}, swing: SC.keys?.[SC.i]?.swing ? Object.keys(SC.keys[SC.i].swing) : null }), now, dt);
    }
    function accEffort(A, now, dt) { A.T += dt; for (const gk in now) { const o = now[gk], a = A.g[gk] || (A.g[gk] = { eSum: 0, e2Sum: 0, peak: 0, peakDof: null, limS: 0, limDofs: {} }); a.eSum += o.e * dt; a.e2Sum += o.e * o.e * dt; if (o.e > a.peak) { a.peak = o.e; a.peakDof = o.dof; } if (o.lim) { a.limS += dt; a.limDofs[o.limDof] = (a.limDofs[o.limDof] || 0) + dt; } } }
    // a summary: per group mean and peak effort (share of capacity) and the share of time in the
    // stiff end of its range
    G.effortSummary = (A) => {
      if (!A || !A.T) return null;
      const out = {};
      for (const gk in A.g) { const a = A.g[gk]; out[gk] = { mean: a.eSum / A.T, rms: Math.sqrt(a.e2Sum / A.T), peak: a.peak, peakDof: a.peakDof, limPct: (100 * a.limS) / A.T, limDof: Object.keys(a.limDofs).sort((x, y) => a.limDofs[y] - a.limDofs[x])[0] || null }; }
      return out;
    };
    const forces0 = R.forces;
    R.forces = function (bk, ground, dt) { const r = forces0.call(this, bk, ground, dt); effortSample(dt); return r; };
    const post = R.postContacts;
    R.postContacts = (bk, dt, reactions) => {
      if (PL.mode === "foot") assist();
      else if (PL.mode === "getup" && G.getUpT) getUpAssist(G.getUpT);
      else if (PL.mode === "script" && G.scriptT) scriptAssist(G.scriptT);
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
        const b = R.body, chest = b.toWorld(R.model.linkOf.Spine02, [0, 0, 0]), lying = PL.mode !== "foot" && PL.mode !== "script";
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
        // off the bike: the bike's own controls released - its throttle shut, the clutch out, the
        // front brake held while she holds it, lifts it or it stands; its rear brake held throughout,
        // standing in for a bike left in gear with its engine stopped (its rear wheel does not spin
        // freely: after a crash it would otherwise keep the spin it had and drive the bike off as
        // she lifts it onto its tyres)
        const cmd = global.DUCATI_ADVANCED_POWERTRAIN?.states?.free?.command;
        if (cmd) Object.assign(cmd, { throttle: 0, clutch: 0, frontBrakeBar: PL.sideStand || PL.holdingBike || G.lift.active || G.hold.active ? 20 : 0, rearBrakeBar: 20 });
        const st = D?.getElementById("freeSteer");
        if (st) st.value = "0";
        // (getting on / off with her hand on the left grip she turns the bars straight: stopped, the
        // front tyre's scrub holds them - she pushes harder until they turn, at a steady rate, and
        // eases off as they come straight; the torque about the steering axis capped at barsMaxNm)
        if (PL.mode === "script" && G.barsStraight) {
          const st0 = free.steer || 0, wDes = -Math.sign(st0) * Math.min(G.P.barsRate, 4 * Math.abs(st0));
          G.barsNm = clamp((G.barsNm || 0) + G.P.barsGain * (wDes - (free.steerRate || 0)) * dt, -G.P.barsMaxNm, G.P.barsMaxNm);
        } else G.barsNm = 0;
        free.controls.userSteerTorqueNm = G.barsNm;
        if (PL.mode === "foot") {
          // camera-relative: forward is where the camera looks
          const yaw = CAM.yaw ?? cam.yaw, fw = [-Math.sin(yaw), -Math.cos(yaw)], rt = [-Math.cos(yaw), Math.sin(yaw)];
          const K = UI.keys, mx = (K.r ? 1 : 0) - (K.l ? 1 : 0) + pad.x, my = (K.f ? 1 : 0) - (K.b ? 1 : 0) - pad.y;
          const n = Math.min(1, Math.hypot(mx, my)), run = !!K.run || pad.run > 0.5;
          const sp = n * (run ? G.P.runMps : G.P.walkMps);
          const dir = n > 0.05 ? [(fw[0] * my + rt[0] * mx) / Math.hypot(mx, my), (fw[1] * my + rt[1] * mx) / Math.hypot(mx, my)] : [0, 0];
          // (the stick while she walks herself to the bike: the player takes over)
          if (G.goal && n > 0.3) { G.goal = null; G.strafe = false; }
          if (!G.goal) G.setIntent([dir[0] * sp, dir[1] * sp], run);
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
    // getting off (stopped): she holds the bike upright while she climbs off, then puts it on its
    // side stand; getting on: she takes it off its stand (upright, held) once she has the bar, and
    // once seated the riding controller (46) has her
    G.seatPose = BIO.presettle?.rel || null;
    function dismount() {
      PL.holdingBike = false; PL.sideStand = false;
      G.startDismount(BIO.bikeAdapter(), () => { PL.sideStand = true; }, () => { PL.sideStand = true; });
      CAM.yaw = null;
    }
    function mount() {
      G.startMount(BIO.bikeAdapter(), () => { G.toRide(BIO.bikeAdapter()); },
        () => { PL.holdingBike = false; PL.sideStand = false; },
        () => { PL.holdingBike = false; PL.sideStand = true; G.enterFoot(); });
    }
    // lifting it off its side: her motion (48 core) and the declared lift assist - a roll moment on
    // the bike about its heading towards the roll she asks for, capped at liftMaxNm - then its
    // side stand
    // holding the bike up while she gets on or off (48 core: G.hold): her arm's push reaches the
    // bike through her grip; the declared residual - a roll moment towards the lean she keeps it at,
    // capped at holdAssistMaxNm - here
    function riderHoldWrench(F, Q) {
      const Hd = G.hold, LP = G.P;
      if (!Hd.active || !BIO.active || F !== free) { Hd.Nm = 0; return; }
      const fw = v5qrot(F.q, V5_Y), hh = v5norm([fw[0], fw[1], 0]);
      const roll = v5bodyAngles(F.q).rollRad, rollRate = v5dot(v5qrot(F.q, F.w), hh);
      const tau = clamp(-(LP.holdK * (roll - Hd.target) + LP.holdC * rollRate), -LP.holdAssistMaxNm, LP.holdAssistMaxNm);
      CH.addBodyMoment(F, Q, v5mul(hh, tau));
      const dts = F.S?.dt || 1 / 540, st = Hd.stats;
      Hd.Nm = tau; st.NmSum += Math.abs(tau) * dts; st.n += dts; st.maxNm = Math.max(st.maxNm, Math.abs(tau));
    }
    // (the bike turns about where its tyres meet the ground: under its wheel hubs)
    const groundZ = (x, y) => (CORE.realtime?.road ? CORE.realtime.road.height(x, y) : 0);
    // (where each tyre touches: its hub less its radius down the bike's up axis - under the hub only
    // when upright; lying on its side, a wheel radius across)
    const tyreLine = (F) => {
      const a = F.FK?.hubW, c = F.RK?.hubW;
      if (!a || !c) return null;
      const up = v5qrot(F.q, V5_UP), ta = v5sub(a, v5mul(up, F.S?.rF ?? 0.3)), tc = v5sub(c, v5mul(up, F.S?.rR ?? 0.31));
      return [[ta[0], ta[1], groundZ(ta[0], ta[1])], [tc[0], tc[1], groundZ(tc[0], tc[1])]];
    };
    function lift() {
      const tl = tyreLine(free);
      G.startLift(BIO.bikeAdapter(), () => { PL.sideStand = true; }, null, null, tl ? hp.scl(hp.add(tl[0], tl[1]), 0.5) : null);
    }
    // the declared lift assist: a roll moment on the bike about its heading towards the roll she
    // asks for, capped at liftMaxNm - her lift, supplied, not her strength
    const CH = CORE.chassis;
    if (CH?.wrenches && typeof v5bodyAngles === "function") {
      CH.wrenches.push(riderHoldWrench);
      CH.wrenches.push(function riderLiftWrench(F, Q) {
        const Lf = G.lift, LP = G.P;
        if (!Lf.active || !BIO.active || F !== free) { Lf.Nm = 0; return; }
        const fw = v5qrot(F.q, V5_Y), hh = v5norm([fw[0], fw[1], 0]);
        const roll = v5bodyAngles(F.q).rollRad, rollRate = v5dot(v5qrot(F.q, F.w), hh);
        const tau = clamp(-(LP.liftK * (roll - Lf.target) + LP.liftC * rollRate), -LP.liftMaxNm, LP.liftMaxNm);
        // (a roll moment on the bike, not a force: a force square to it at her hands carried much of
        // its weight off its tyres and pushed it sideways - part way up it slid out of her hands)
        CH.addBodyMoment(F, Q, v5mul(hh, tau));
        const dts = F.S?.dt || 1 / 540, st = Lf.stats;
        Lf.Nm = tau; st.NmSum += Math.abs(tau) * dts; st.n += dts; st.maxNm = Math.max(st.maxNm, Math.abs(tau));
      });
    }
    // the action prompt (what F / X does now)
    function prompt() {
      let txt = "";
      if (BIO.active && BIO.placed && isRide()) {
        if (!PL.fallen) txt = bikeSpeed() < 0.6 ? "F / X  get off" : "";
        else if (PL.mode === "foot") { const a = G.action(BIO.bikeAdapter?.()); txt = a === "lift" ? "F / X  lift the bike" : a === "mount" ? "F / X  get on" : ""; }
        else if (PL.mode !== "script") txt = "R  reset";
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
    // ---- telemetry (next to 46's riderBio): what she is doing off the bike, the declared assists,
    // and her joints' effort and range use - live and for the last motion at the bike
    const effortRnd = (o) => (o ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { effortPct: Math.round(100 * (v.e ?? v.mean ?? 0)), peakPct: v.peak != null ? Math.round(100 * v.peak) : undefined, limitPct: v.limPct != null ? Math.round(v.limPct) : undefined, joint: v.dof ?? v.peakDof ?? undefined }])) : null);
    if (typeof free.compute === "function") {
      const cmp0 = free.compute;
      free.compute = function (...a) {
        const M = cmp0.apply(this, a);
        if (M?.riderBio && !PL.fallen && G.effort.ride) M.riderBio.effort = { now: effortRnd(G.effort.now), ride: Object.fromEntries(Object.entries(G.effort.ride.keys).map(([k, A]) => [k, { seconds: +A.T.toFixed(1), groups: effortRnd(G.effortSummary(A)) }])) };
        if (M?.riderBio && PL.fallen) {
          const rnd = (o) => (o ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { effortPct: Math.round(100 * (v.e ?? v.mean ?? 0)), peakPct: v.peak != null ? Math.round(100 * v.peak) : undefined, atLimit: v.lim ?? undefined, limitPct: v.limPct != null ? Math.round(v.limPct) : undefined, joint: v.dof ?? v.peakDof ?? undefined, limitJoint: v.limDof ?? undefined }])) : null);
          M.riderBio.onFoot = {
            mode: PL.mode, motion: PL.mode === "script" ? { name: G.script.name, key: G.script.i } : null, walkingTo: !!G.goal,
            assist: { balanceNm: G.stats.assistNm || 0, catchN: G.stats.catchN || 0, getUpN: G.stats.getUpN || 0, motionN: G.stats.scriptN || 0, liftNm: G.lift.Nm || 0, holdNm: G.hold.Nm || 0, holdPushM: G.hold.pushM || 0 }, bike: PL.mode === "script" ? G.script.bike || null : null,
            effort: rnd(G.effort.now), lastMotion: G.effort.last || G.effort.run ? { name: (G.effort.run || G.effort.last).name, groups: rnd(G.effortSummary(G.effort.run || G.effort.last)) } : null,
          };
        }
        return M;
      };
    }
    // a reset puts her back on the bike (46) with the stand up
    CORE.chassis?.onReset?.push(() => { PL.sideStand = false; PL.holdingBike = false; CAM.yaw = null; });
    G.frame = frame;
    return G;
  }

  const api = { install, installBrowser };
  global.LUCID_RIDER_ONFOOT = api;
  if (global.LUCID_CORE?.riderBio?.rider) installBrowser(global.LUCID_CORE);
})(typeof window !== "undefined" ? window : globalThis);
