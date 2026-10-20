// LUCID MOTO core · her whole-body muscle control on her feet (R1.5 lucid_bcr.neuro, ported)
// ------------------------------------------------------------------------------------------
// Standing and stepping on her muscles: no joint motors, no pose servos, no balance assist. Every
// control tick she senses her body (joint angles and rates, where her soles touch the ground, her
// centre of mass and its velocity, the orientation of her pelvis, chest and head) and solves ONE
// bounded least-squares problem whose unknowns are
//   a     the activations of her muscles (the 56 of her legs, trunk and neck; her arms hang on their
//         tissue and resting tone - R1.5 relaxed_arms), each inside what it can reach this tick
//   beta  the ground's push at each sole contact, as non-negative weights on the edges of its
//         friction pyramid
// subject to her own equations of motion (45: M zdd + h = [0; tau]; the muscles' moment arms and
// force-length-velocity state from 46_rider_muscles; her passive joint tissue; the step's implicit
// damping), with the objectives of a person standing (R1.5 neuro.py:389-486): soles that do not
// slide or sink, planted feet flat, her centre of mass over her feet (the capture-point law: the
// centre of pressure it asks for kept inside her support), little whole-body spin, pelvis / chest /
// head at their intended orientation, joints near the intended posture (weak), a swing foot on its
// path, and as little muscle effort as will do. This is the muscle-level whole-body QP of Lee, Park,
// Kwon & Lee (2014, "Locomotion control for many-muscle humanoids") as the R1.5 package writes it;
// its parameters are the package's lab-tuned ones (fitted/neuro_stance_v2.json; CANDIDATE, not
// owner-approved). The output is excitation; the body's forward dynamics decides what happens.
// Differences from the package, declared: the task accelerations carry their velocity-product terms
// (J-dot z, from 45's RNEA - the package leaves them out), the inertia the QP sees includes the
// implicit damping this body's integrator applies (45's armature), and the contacts are her plantar
// soles (46's "plantar" foot model: soft-tissue contact elements over her own sole, the ground's
// springs implicit over the step) rather than MuJoCo's near-rigid contacts. Driving, she stands on that
// model and with the declared CANDIDATE muscle geometry (muscle_candidates: BioRig R585's head-nod
// sternocleidomastoids); 46 switches both back when she stops. The rest, each where it is written: a
// planted sole's flat follows where its pads lay it while they bear broadly (soleFullFrac); the
// height of her centre of mass held over the feet that support her; on one foot, the pelvis, chest,
// spine and legs held where she stood as the foot came up (reanchor_*), the free leg held at its
// joints (hold_leg), her standing parameters but a firmer neck (single_overrides, from lift-off), her
// legs' posture rows at full strength through the weight shift (leg_posture_scale); a stepping foot
// aimed across as well as along at her capture point; the QP solved on unit-diagonal variables.
// Pure JS (no browser APIs) so it runs in the unit tests.
(function (global) {
  "use strict";
  const DEG = Math.PI / 180;

  // R1.5 lucid_bcr/fitted/neuro_stance_v2.json "params" (the package's names; _y = vertical)
  const PARAMS = {
    com_kp: 18.37907586023939, com_kd: 18.121275777352754, com_kp_y: 60.0, com_kd_y: 14.0, w_com: 195.21911889780336,
    capture_k: 1.0, cop_margin: 0.012,
    w_foot_flat: 30.0, foot_flat_kp: 200.0, foot_flat_kd: 30.0,
    w_angmom: 19.797175676553195, angmom_k: 36.309599310610196,
    ori_kp: 178.8998071861497, ori_kd: 73.97008990019361, head_ori_scale: 0.5,
    w_pelvis: 3.100613043566992, w_thorax: 1.7139290814022807, w_head: 1.0,
    q_kp: 24.156123162151882, q_kd: 3.5230207701298486,
    w_post: 0.5187569455168679, w_post_arm: 0.05, w_post_neck: 0.5488212798078712, w_post_trunk: 2.0, w_post_girdle: 0.29917503961992103,
    w_contact: 10.334790169623314, contact_kd: 50.5558219961494, mu: 0.8, w_force: 0.00010696891182958582,
    w_act: 0.16977259685514123, tone: 0.01, control_dt: 0.01, relaxed_arms: true, arm_tone: 0.01,
    swing_kp: 400.0, swing_kd: 40.0, w_swing: 20.0, swing_ori_kp: 200.0, swing_ori_kd: 28.0, swing_leg_posture_scale: 0.1,
    fatigue: true,
    // (this port) the task accelerations' velocity-product terms in; the step's implicit damping in
    // the inertia the plan sees
    // (and the declared CANDIDATE muscle geometry it drives with - 46_rider_muscles CANDIDATES: the
    // sternocleidomastoids as head-nod antagonists, BioRig R585; without, a push forward flips her head)
    muscle_candidates: ["scmNodAntagonist"],
    drift: true, implicitInertia: true, contact_margin: 0.004, soleSettleS: 0.05, soleFullFrac: 0.6, contact_rows: "foot", cop_min_cap: 0.05, dcm_ff: 0, hull_max: 6, head_axes: [1, 1, 1], joint_armature: 0,
  };
  // R1.5's parameters on one foot (lucid_bcr/fitted/agility_single_v1.json "single_overrides", CANDIDATE) -
  // fitted on MuJoCo's near-rigid feet; on her soft soles, stiffer posture and orientation holds than her
  // standing ones saturate her trunk's and neck's muscles and she falls in the single-leg hold. Kept for
  // reference: agility { single_overrides: PACKAGE_SINGLE, single_from: "shift" } runs the package's
  const PACKAGE_SINGLE = {
    com_kp: 5.616026177816835, com_kd: 3.8609813185877275, w_com: 149.58755302053882, ori_kp: 274.4112618502181, ori_kd: 142.63846691618633,
    head_ori_scale: 1.0198182376161198, w_pelvis: 3.692690693719037, w_thorax: 2.537219133824893, w_head: 6.2644428638529766,
    w_angmom: 7.375066453793215, angmom_k: 7.490306984924407, q_kp: 146.63913329104128, q_kd: 13.43725378036352, w_post: 1.5061571184105433,
    w_post_trunk: 2.0545731405148104, w_post_neck: 6.659973585286406, w_contact: 2271.6197094242784, contact_kd: 59.82066123063514,
    w_swing: 31.69991147815781, swing_kp: 279.9118992751573, swing_kd: 28.574048947164968, w_act: 0.5519534874094937,
    capture_k: 1.1847807820721448, cop_margin: 0.007637385634238301, w_foot_flat: 5.774771484469889, foot_flat_kp: 62.072676091435355,
    foot_flat_kd: 15.412438795426032,
  };
  // R1.5 lucid_bcr/agility.py AgilityParams, as fitted in lucid_bcr/fitted/agility_single_v1.json (its
  // "agility" block, CANDIDATE): the support state machine's timings, thresholds and the controller's
  // parameters on one foot. This port's own terms, declared: blend_s (the one-foot parameters fade in and
  // out over it, not switched at a state change - R1.5's handoff: "context switch at touchdown"),
  // land_ramp_s (a landing foot's force cap ramps in over it), reanchor_land (both legs' intended posture
  // re-anchored at touchdown, as R1.5 re-anchors the stance leg at lift-off). And this port's values,
  // declared (measured: tests/rider_wbc.test.mjs, docs/PHYSICS.md):
  //   leg_posture_scale  her legs' posture rows at full strength through the weight shift (the package:
  //                      0.297 - on her soft soles a sideways sway of legs, pelvis and both feet rolling on
  //                      their pads then grows, and she falls in the shift)
  //   single_overrides   on one foot her standing parameters, but for a firmer neck (w_post_neck 1.5; the
  //                      package's own, PACKAGE_SINGLE, above)
  //   single_from        engaged as the foot lifts ("lift"; the package: "shift", as the shift begins)
  //   hold_leg           the free leg held at its joints where they are as it comes up ("joint"; the
  //                      package: "foot", a foot target following her pelvis - leg and pelvis then drive
  //                      each other, the free hip swinging +-7 deg, and she falls in the hold)
  const AGILITY = {
    step_trigger_m: 0.01, shift_time: 0.14, shift_time_voluntary: 0.5518191617571635, unload_frac: 0.12, unload_frac_voluntary: 0.03,
    unload_time: 0.29280249609608416, lift_margin: 0.008081395934923873, swing_time: 0.36, lift_height: 0.06, hold_height: 0.13591409142295227,
    step_margin: 0.06, max_step: 0.55, min_step: 0.12, lat_margin: 0.03, min_width: 0.1, max_width: 0.45, land_force_frac: 0.15, settle_time: 0.3, lat_inner: 0.0,
    leg_posture_scale: 1, sag_scale_shift: 0.15, reactive: true,
    single_overrides: { w_post_neck: 1.5 }, single_from: "lift", hold_leg: "joint",
    use_single_overrides: true, blend_s: 0.15, land_ramp_s: 0.08, reanchor_land: true, reanchor_trunk: true, reanchor_spine: true, unload_com_margin: 0.01, shift_wait_s: 2.0, shift_along: 0,
  };
  const minjerk = (p0, p1, s) => {
    s = s < 0 ? 0 : s > 1 ? 1 : s;
    const k = 10 * s ** 3 - 15 * s ** 4 + 6 * s ** 5, kd = 30 * s ** 2 - 60 * s ** 3 + 30 * s ** 4, kdd = 60 * s - 180 * s ** 2 + 120 * s ** 3;
    return [p0.map((v, i) => v + (p1[i] - v) * k), p0.map((v, i) => (p1[i] - v) * kd), p0.map((v, i) => (p1[i] - v) * kdd)];
  };
  // R1.5 neuro.py ARM_KEYS / ARM_MUSCLES
  const ARM_HINGE = /(Shoulder|Clavicle|Elbow|Forearm|Wrist)\./;
  const ARM_MUSCLE = /biceps|brachialis|triceps|deltoid|pectoralis|latissimus|forearm_|brachioradialis|supraspinatus|infraspinatus|subscapularis/;

  // ------------------------------------------------------------------ small dense helpers
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const mv = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
  const mtv = (m, v) => [m[0] * v[0] + m[3] * v[1] + m[6] * v[2], m[1] * v[0] + m[4] * v[1] + m[7] * v[2], m[2] * v[0] + m[5] * v[1] + m[8] * v[2]];
  const mm = (a, b) => { const o = new Array(9); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[3 * r + c] = a[3 * r] * b[c] + a[3 * r + 1] * b[3 + c] + a[3 * r + 2] * b[6 + c]; return o; };
  const mt = (a) => [a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]];
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  function logSO3(R) {
    const c = clamp((R[0] + R[4] + R[8] - 1) / 2, -1, 1), th = Math.acos(c);
    const v = [R[7] - R[5], R[2] - R[6], R[3] - R[1]];
    if (th < 1e-6) return scl(v, 0.5);
    if (Math.PI - th < 1e-4) {
      // (near pi: the axis from the symmetric part)
      const xx = Math.sqrt(Math.max(0, (R[0] + 1) / 2)), yy = Math.sqrt(Math.max(0, (R[4] + 1) / 2)), zz = Math.sqrt(Math.max(0, (R[8] + 1) / 2));
      const ax = xx >= yy && xx >= zz ? [xx, (R[1] + R[3]) / (4 * xx), (R[2] + R[6]) / (4 * xx)] : yy >= zz ? [(R[1] + R[3]) / (4 * yy), yy, (R[5] + R[7]) / (4 * yy)] : [(R[2] + R[6]) / (4 * zz), (R[5] + R[7]) / (4 * zz), zz];
      return scl(unit(ax), th);
    }
    return scl(v, th / (2 * Math.sin(th)));
  }
  function expSO3(w) {
    const th = len(w);
    if (th < 1e-12) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const [x, y, z] = scl(w, 1 / th), c = Math.cos(th), s = Math.sin(th), t = 1 - c;
    return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
  }
  const Rz = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
  // Cholesky in place (lower triangle of the n x n row-major A); false if not positive definite
  function cholesky(A, n) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let s = A[i * n + j];
        for (let k = 0; k < j; k++) s -= A[i * n + k] * A[j * n + k];
        if (i === j) { if (s <= 0) return false; A[i * n + i] = Math.sqrt(s); }
        else A[i * n + j] = s / A[j * n + j];
      }
    }
    return true;
  }
  // solve L L^T x = b for the columns of X (n x m row-major, in place)
  function cholSolveCols(Lc, n, X, m) {
    for (let i = 0; i < n; i++) {
      const li = i * n, xi = i * m, d = Lc[li + i];
      for (let k = 0; k < i; k++) { const l = Lc[li + k]; if (!l) continue; const xk = k * m; for (let c = 0; c < m; c++) X[xi + c] -= l * X[xk + c]; }
      for (let c = 0; c < m; c++) X[xi + c] /= d;
    }
    for (let i = n - 1; i >= 0; i--) {
      const xi = i * m, d = Lc[i * n + i];
      for (let k = i + 1; k < n; k++) { const l = Lc[k * n + i]; if (!l) continue; const xk = k * m; for (let c = 0; c < m; c++) X[xi + c] -= l * X[xk + c]; }
      for (let c = 0; c < m; c++) X[xi + c] /= d;
    }
  }
  // nearest point to p (2-D) inside the convex polygon of pts shrunk by margin (R1.5 clamp_to_polygon)
  function hull2(P) {
    const pts = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (pts.length < 3) return pts;
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    return lo.slice(0, -1).concat(up.slice(0, -1)); // counter-clockwise
  }
  // indices of the convex hull of 2-D points, counter-clockwise
  function hullIdx(P) {
    const idx = P.map((_, i) => i).sort((a, b) => P[a][0] - P[b][0] || P[a][1] - P[b][1]);
    if (idx.length < 3) return idx;
    const cr = (o, a, b) => (P[a][0] - P[o][0]) * (P[b][1] - P[o][1]) - (P[a][1] - P[o][1]) * (P[b][0] - P[o][0]);
    const lo = [], up = [];
    for (const i of idx) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], i) <= 0) lo.pop(); lo.push(i); }
    for (let k = idx.length - 1; k >= 0; k--) { const i = idx[k]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], i) <= 0) up.pop(); up.push(i); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  // area of the convex hull of 2-D points
  function hullArea(P) {
    const V = hull2(P);
    let A = 0;
    for (let i = 0; i < V.length; i++) { const a = V[i], c = V[(i + 1) % V.length]; A += a[0] * c[1] - c[0] * a[1]; }
    return Math.abs(A) / 2;
  }
  function clampToPolygon(p, P, margin) {
    const V0 = hull2(P);
    if (V0.length < 3) return V0.length ? V0.reduce((a, q) => [a[0] + q[0] / V0.length, a[1] + q[1] / V0.length], [0, 0]) : p;
    const c = V0.reduce((a, q) => [a[0] + q[0] / V0.length, a[1] + q[1] / V0.length], [0, 0]);
    const V = V0.map((q) => { const d = [q[0] - c[0], q[1] - c[1]], l = Math.hypot(d[0], d[1]); const s = Math.max(l - margin, 1e-4) / Math.max(l, 1e-9); return [c[0] + d[0] * s, c[1] + d[1] * s]; });
    let inside = true;
    for (let i = 0; i < V.length; i++) { const a = V[i], b = V[(i + 1) % V.length]; if ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) < 0) { inside = false; break; } }
    if (inside) return p;
    let best = null, bd = Infinity;
    for (let i = 0; i < V.length; i++) {
      const a = V[i], b = V[(i + 1) % V.length], ab = [b[0] - a[0], b[1] - a[1]], t = clamp(((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / Math.max(1e-12, ab[0] * ab[0] + ab[1] * ab[1]), 0, 1);
      const q = [a[0] + t * ab[0], a[1] + t * ab[1]], d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (d < bd) { bd = d; best = q; }
    }
    return best;
  }

  // ------------------------------------------------------------------ the controller
  // R: 46's rider (R.body, R.muscles.M, R.spheres, R.foot, R.internal); its drive is installed in
  // 46's servoTorques (R.wbc.driving) and 48's foot mode.
  function create(R, opts = {}) {
    const MBL = global.LUCID_MULTIBODY, b = R.body, I = R.internal, H = I.H, MU = R.muscles.M;
    if (!MU) throw Error("LUCID WBC: her muscles are required");
    // (her plantar soles - 46's footRef.plantar: the model of her feet she stands on under her own
    // muscles, R.setFootModel - their elements and reference points, whichever stands while she is not)
    const nz = b.nz, NH = H.length, foot = R.footRef ? R.footRef.plantar : R.foot, linkOf = R.model.linkOf;
    const soles = R.soles ? R.soles.plantar : R.spheres.filter((s2) => s2.kind === "sole");
    const p = Object.assign({}, PARAMS, opts.params || {});
    const W = { p, on: !!opts.on, driving: false, last: {}, stats: {}, support: { L: true, R: true }, forceCap: { L: Infinity, R: Infinity }, swing: null, comGoal: null, comAxisScale: [1, 1, 1], legPostureScale: 1, heading: 0 };
    // ---- who is in the plan: her muscles (arms relaxed: at tone, a load), her hinges' posture rows
    const isArm = MU.ids.map((id) => ARM_MUSCLE.test(id));
    let free = [], fixed = [];
    const setMuscles = () => {
      free = []; fixed = [];
      const keep = p.free_arm_muscles ? new RegExp(p.free_arm_muscles) : null;
      for (let i = 0; i < MU.n; i++) (p.relaxed_arms && isArm[i] && !(keep && keep.test(MU.ids[i])) ? fixed : free).push(i);
    };
    setMuscles();
    const hingeW = (h) => {
      const id = h.id;
      if (/Clavicle\./.test(id)) return p.w_post_girdle;
      if (ARM_HINGE.test(id)) return p.relaxed_arms ? 0 : p.w_post_arm;
      if (/^(neck|head)/.test(id)) return p.w_post_neck;
      if (/^spine/.test(id)) return p.w_post_trunk;
      return p.w_post;
    };
    const legRow = { L: H.map((h) => /^left(Hip|Knee|Ankle)\./.test(h.id)), R: H.map((h) => /^right(Hip|Knee|Ankle)\./.test(h.id)) };
    const ORI = [["pelvis", linkOf.Hip, "w_pelvis"], ["thorax", linkOf.Spine02, "w_thorax"], ["head", linkOf.Head, "w_head"]];
    // ---- the intended posture: joint angles, world orientations of pelvis / chest / head, and her
    // feet's flat (R1.5: captured from the standing pose; here re-anchored by the caller - setPosture)
    const qStar = new Float64Array(b.n), qStar0 = new Float64Array(b.n), Rstar = {}, Rstar0 = {}, soleUp = {};
    let heading0 = 0;
    // (relaxed arms: her shoulder girdle's intended angle is where its passive tissue carries the
    // hanging arm - R1.5's standing pose was a settled one - not the pose's own: held at the pose's,
    // the upper trapezius lifts the arm and her neck's flexors and extensors co-contract against its
    // pull on the neck. Newton on hold(q) = passive(q) per girdle hinge, the rest of the body as posed)
    // (the arm hanging relaxed too: its own passive equilibrium - a posed arm past its range, as
    // the standing pose's -62 deg abduction is past the shoulder's -40, hangs where its stop holds it)
    const GIRDLE = H.map((h, i) => (ARM_HINGE.test(h.id) ? i : -1)).filter((i) => i >= 0);
    function girdleRest(q) {
      const save = Float64Array.from(b.q), out = Float64Array.from(q);
      b.q.set(q);
      for (let it = 0; it < 60; it++) {
        b.kinematics(); b.clearForces(); b.applyGravity();
        const hold = b.inverseDynamicsStatic(false);
        let moved = 0;
        for (const i of GIRDLE) {
          const h = H[i], li = h.link, pp = h.passive, qq = b.q[li];
          const ea = Math.exp(-clamp((qq - h.lo) / pp.w, -12, 30)), eb = Math.exp(-clamp((h.hi - qq) / pp.w, -12, 30));
          const tp = -pp.k * (qq - pp.q0) + pp.A * (ea - eb), kp = pp.k + (pp.A / pp.w) * (ea + eb);
          const dq = clamp((tp - hold[li]) / kp, -0.05, 0.05);
          b.q[li] = qq + dq; moved = Math.max(moved, Math.abs(dq));
        }
        if (moved < 1e-5) break;
      }
      for (const i of GIRDLE) out[H[i].link] = b.q[H[i].link];
      b.q.set(save); b.kinematics(); b.clearForces();
      W.armRest = out;
      return out;
    }
    W.soleUp = soleUp;
    W.setPosture = (q = b.q, heading = W.heading) => {
      qStar.set(p.relaxed_arms ? girdleRest(q) : q);
      qStar0.set(qStar);
      for (const [k, li] of ORI) Rstar[k] = b.Rw[li].slice();
      Object.assign(Rstar0, Rstar);
      heading0 = heading;
      W.heading = heading;
      // a sole's up (link coordinates): the normal of the plane its pads rest on - their lowest
      // points, least squares - turned to the ground's side (R1.5 held the settled foot's orientation;
      // here the pads' plane is that settled orientation: her pads' bottoms are not level in the
      // foot's frame, ball-medial to mid-lateral 3.5 mm, so standing flat on them the foot rolls ~4 deg)
      for (const S of ["L", "R"]) soleUp[S] = padPlaneUp(S, mtv(b.Rw[foot[S].link], [0, 0, 1]));
      // (each sole's whole pad outline, flat: what a sole resting on a broad patch is measured against)
      // (in the plane of its pads - the foot's own frame, however it lies now)
      for (const S of ["L", "R"]) {
        const u = soleUp[S], e1 = unit(Math.abs(u[0]) < 0.9 ? cross(u, [1, 0, 0]) : cross(u, [0, 0, 1])), e2 = cross(u, e1);
        soleArea[S] = hullArea(soles.filter((s2) => s2.side === S).map((s2) => [dot(s2.c, e1), dot(s2.c, e2)]));
      }
    };
    const soleArea = { L: 0, R: 0 };
    function padPlaneUp(S, u0) {
      const P = soles.filter((s) => s.side === S).map((s) => sub(s.c, scl(u0, s.r)));
      const c = scl(P.reduce((a, q) => add(a, q), [0, 0, 0]), 1 / P.length);
      const C = [0, 0, 0, 0, 0, 0, 0, 0, 0];
      for (const q of P) { const d = sub(q, c); for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) C[3 * r + k] += d[r] * d[k]; }
      // (smallest eigenvector: inverse iteration on C + eps I from u0)
      let n = u0.slice();
      for (let it = 0; it < 50; it++) {
        const A = C.map((v, k) => v + (k % 4 === 0 ? 1e-9 : 0));
        const det = A[0] * (A[4] * A[8] - A[5] * A[7]) - A[1] * (A[3] * A[8] - A[5] * A[6]) + A[2] * (A[3] * A[7] - A[4] * A[6]);
        if (Math.abs(det) < 1e-30) break;
        const inv = [A[4] * A[8] - A[5] * A[7], A[2] * A[7] - A[1] * A[8], A[1] * A[5] - A[2] * A[4], A[5] * A[6] - A[3] * A[8], A[0] * A[8] - A[2] * A[6], A[2] * A[3] - A[0] * A[5], A[3] * A[7] - A[4] * A[6], A[1] * A[6] - A[0] * A[7], A[0] * A[4] - A[1] * A[3]].map((v) => v / det);
        n = unit(mv(inv, n));
      }
      return dot(n, u0) < 0 ? scl(n, -1) : n;
    }
    // ---- the COM target: where it is now relative to her feet, at this height (R1.5)
    // (the feet that support her: a lifted foot carries no part of the target - its height with it, the
    // centre of mass would rise as the foot does)
    const feetCenter = () => {
      let c = [0, 0, 0], n = 0;
      for (const S of ["L", "R"]) {
        if (W.support[S] !== true) continue;
        c = add(c, add(b.toWorld(foot[S].link, foot[S].ball), b.toWorld(foot[S].link, foot[S].heel))); n += 2;
      }
      return n ? scl(c, 1 / n) : c;
    };
    // (its height too is held over her feet - they sink with the pads they stand on: the package
    // held an absolute height captured with MuJoCo's feet already settled; here a height captured
    // before the pads take her weight would sit their compression out of reach)
    W.setComTargetFromCurrent = () => {
      const mo = b.momentum(b.massMatrix());
      W.comOffset = sub(mo.com, feetCenter());
      W.comHeight = mo.com[2];
    };
    const currentComTarget = () => add(feetCenter(), W.comOffset);

    // ---- workspace
    const MAXC = 16, NE = 4, maxVar = MU.n + MAXC * NE;
    const Mt = new Float64Array(nz * nz), hB = new Float64Array(nz), rhs0 = new Float64Array(nz), zd = new Float64Array(nz);
    const P = new Float64Array(nz * (maxVar + 1)); // [M^-1 B | M^-1 Jc^T G | M^-1 rhs0], row-major
    const J3 = new Float64Array(3 * nz), J3b = new Float64Array(3 * nz);
    const Q = new Float64Array(maxVar * maxVar), g = new Float64Array(maxVar), row = new Float64Array(maxVar + 1);
    const warm = new Float64Array(maxVar);
    let tick = 0, acc = 0, lastKey = "";
    const lastStatus = new Map(), lastX = new Map(), sphereId = new Map(soles.map((s2, i) => [s2, i]));
    const fat = () => (p.fatigue && R.fatigue?.cap && (R.priors.fatigue?.on ?? true) ? R.fatigue.cap : null);

    // the plan: one control tick. dtPhys: the body's step; dtc: how long this plan's excitation holds
    function control(dtPhys, dtc, first) {
      const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
      // h with every external force on her now (gravity, her other contacts - the foot's skin
      // spheres, a hand on something - as she feels them: known loads), less the pads the plan
      // chooses the forces of (added back below, once the contact set is known)
      const M = b.massMatrix(), mo = b.momentum(M), h = b.biasForces(hB, { gravity: false, fext: true }), na = free.length;
      const R0 = b.R, m = mo.mass;
      for (let k = 0; k < 6; k++) zd[k] = b.vb[k];
      for (let i = 1; i < b.n; i++) zd[5 + i] = b.qd[i];
      // the inertia the step moves (its implicit damping and stiffness in: 45's armature)
      Mt.set(M);
      if (p.implicitInertia) for (let i = 1; i < b.n; i++) Mt[(5 + i) * nz + 5 + i] += b.armature[i] + R.wbcMuscleArm[i];
      // generalized force with no activation and no ground: passive tissue (b.tau, set by 46), the
      // relaxed muscles' present pull, the muscles' passive force - less h
      for (let k = 0; k < nz; k++) rhs0[k] = -h[k];
      for (let i = 1; i < b.n; i++) rhs0[5 + i] += b.tau[i];
      for (let i = 0; i < MU.n; i++) {
        const mu_ = MU.muscles[i], Fb = MU.bias[i] + (fixedSet[i] ? MU.act[i] * MU.gain[i] : 0);
        if (Fb) for (let s = 0; s < mu_.span.length; s++) rhs0[5 + mu_.span[s].h] += mu_.r[s] * Fb;
      }
      // ---- contacts: her soles on the ground (sides the plan supports)
      // (a pad within contact_margin of the ground is in the plan - MuJoCo's contact margin: a sole
      // rocking on its pads keeps its support in the plan; the point is the pad's nearest to the ground)
      const all = [], gr = R.lastGround;
      for (const s of soles) {
        if (W.support[s.side] === false) continue;
        if (s.ground.on && s.ground.x) { all.push({ s, x: s.ground.x.slice(), n: s.ground.n ? s.ground.n.slice() : [0, 0, 1], side: s.side, link: s.link }); continue; }
        if (!gr || !(p.contact_margin > 0)) continue;
        const cw = b.toWorld(s.link, s.c), gz = gr.height(cw[0], cw[1]), gn = gr.normal ? gr.normal(cw[0], cw[1]) : [0, 0, 1];
        const gap = (cw[0] * gn[0] + cw[1] * gn[1] + (cw[2] - gz) * gn[2]) - s.r;
        if (gap < p.contact_margin) all.push({ s, x: sub(cw, scl(gn, s.r)), n: gn, side: s.side, link: s.link });
      }
      for (const c of all) {
        c.J = Float64Array.from(b.pointJacobian(c.link, c.x, J3));
        // (a planned element's present push is not a known load: h without it, J^T F added back)
        if (c.s.ground.on) { const F = c.s.ground.F; for (let k = 0; k < nz; k++) rhs0[k] -= c.J[k] * F[0] + c.J[nz + k] * F[1] + c.J[2 * nz + k] * F[2]; }
      }
      // (the plan's ground forces: at each sole's support-polygon corners - the convex hull of its
      // elements on the ground, thinned to hull_max corners keeping the most area - whose friction
      // cones span every wrench the whole flat sole can bear: Caron, Pham & Nakamura 2015)
      const cons = [];
      for (const S of ["L", "R"]) {
        const fs = all.filter((c) => c.side === S);
        if (fs.length <= 3) { cons.push(...fs); continue; }
        let V = hullIdx(fs.map((c) => [c.x[0], c.x[1]]));
        while (V.length > p.hull_max) {
          let worst = 0, wa = Infinity;
          for (let i = 0; i < V.length; i++) {
            const a = fs[V[(i + V.length - 1) % V.length]].x, c = fs[V[i]].x, d = fs[V[(i + 1) % V.length]].x;
            const ar = Math.abs((c[0] - a[0]) * (d[1] - a[1]) - (c[1] - a[1]) * (d[0] - a[0]));
            if (ar < wa) { wa = ar; worst = i; }
          }
          V.splice(worst, 1);
        }
        for (const i of V) cons.push(fs[i]);
      }
      const nc = cons.length, nb = NE * nc, nv = na + nb, mu = Math.min(p.mu, ...cons.map((c) => (c.s.ground.on ? c.s.ground.mu ?? p.mu : p.mu))), sq = Math.sqrt(1 + mu * mu);
      for (const c of cons) {
        const t1 = unit(Math.abs(c.n[0]) < 0.9 ? cross(c.n, [1, 0, 0]) : cross(c.n, [0, 1, 0])), t2 = cross(c.n, t1);
        c.E = [add(c.n, scl(t1, mu)), sub(c.n, scl(t1, mu)), add(c.n, scl(t2, mu)), sub(c.n, scl(t2, mu))].map((e) => scl(e, 1 / sq));
      }
      // ---- P = M^-1 [B | Jc^T G | rhs0]
      const cols = nv + 1;
      P.fill(0, 0, nz * cols);
      for (let k = 0; k < na; k++) {
        const i = free[k], mu_ = MU.muscles[i], gi = MU.gain[i];
        for (let s = 0; s < mu_.span.length; s++) P[(5 + mu_.span[s].h) * cols + k] += mu_.r[s] * gi;
      }
      for (let ci = 0; ci < nc; ci++) {
        const c = cons[ci];
        for (let e = 0; e < NE; e++) {
          const E = c.E[e], col = na + NE * ci + e;
          for (let k = 0; k < nz; k++) { const v = c.J[k] * E[0] + c.J[nz + k] * E[1] + c.J[2 * nz + k] * E[2]; if (v) P[k * cols + col] = v; }
        }
      }
      for (let k = 0; k < nz; k++) P[k * cols + nv] = rhs0[k];
      const tA = typeof performance !== "undefined" ? performance.now() : Date.now();
      if (!cholesky(Mt, nz)) { W.last.error = "mass matrix not positive definite"; return false; }
      cholSolveCols(Mt, nz, P, cols);
      const tB = typeof performance !== "undefined" ? performance.now() : Date.now();
      // ---- tasks: rows w (J [Pa Pb] x) = w (target - drift - J z0), accumulated straight into the
      // normal equations (Q = A^T A, g = A^T b)
      Q.fill(0, 0, nv * nv); g.fill(0, 0, nv);
      // (diagnostics - W.debug: every row kept, for the cost breakdown and the gradients)
      const costRows = W.debug || W.gradOf ? [] : null;
      const accRow = (w, target, name) => {
        const bv = w * (target - row[nv]);
        for (let c = 0; c < nv; c++) row[c] *= w;
        // (Q += row^T row, upper triangle; g += row bv)
        for (let i = 0; i < nv; i++) {
          const ri = row[i];
          if (ri === 0) continue;
          g[i] += ri * bv;
          let qi = i * nv + i;
          for (let j = i; j < nv; j++, qi++) Q[qi] += ri * row[j];
        }
        if (costRows) costRows.push([name, Float64Array.from(row.subarray(0, nv)), bv]);
      };
      const addRow = (Jr, target, w, name) => {
        // Jr: dense nz row (Float64Array view or array)
        row.fill(0, 0, cols);
        for (let k = 0; k < nz; k++) { const j = Jr[k]; if (!j) continue; const pk = k * cols; for (let c = 0; c < cols; c++) row[c] += j * P[pk + c]; }
        accRow(w, target, name);
      };
      // (a row on one coordinate: that row of P)
      const addUnitRow = (k, target, w, name) => { const pk = k * cols; for (let c = 0; c < cols; c++) row[c] = P[pk + c]; accRow(w, target, name); };
      const rowOf = (J, r) => J.subarray(r * nz, (r + 1) * nz);
      const Jz = (J, r) => { let s = 0; for (let k = 0; k < nz; k++) s += J[r * nz + k] * zd[k]; return s; };
      // contacts: the point's acceleration = -kd x its velocity (no slip, no sink). A foot's points
      // are on one rigid link: their rows sum to six (exactly, but for a constant) - the foot's
      // spatial acceleration s = [w'; a_O] against the least-squares fit of the points' targets,
      // weighted by sum_i G_i^T G_i (G_i = [-[r_i]x, I]: point i's acceleration from s)
      for (const S of ["L", "R"]) {
        if (W.support[S] !== true) continue;
        const pts = all.filter((c) => c.side === S);
        if (!pts.length) continue;
        if (p.contact_rows === "point" || pts.length < 3) {
          for (const c of pts) {
            const dr = p.drift ? b.pointDrift(c.link, c.x) : [0, 0, 0];
            for (let r = 0; r < 3; r++) addRow(rowOf(c.J, r), -p.contact_kd * Jz(c.J, r) - dr[r], p.w_contact, "contact:" + c.s.side + c.s.at + "xyz"[r]);
          }
          continue;
        }
        const li = pts[0].link, O = b.ow[li], Js = new Float64Array(6 * nz);
        Js.set(b.angularJacobian(li, J3), 0); Js.set(b.pointJacobian(li, O, J3), 3 * nz);
        const A6 = new Float64Array(36), b6 = new Float64Array(6);
        for (const c of pts) {
          const r = sub(c.x, O), dr = p.drift ? b.pointDrift(c.link, c.x) : [0, 0, 0];
          const t = [0, 1, 2].map((k) => -p.contact_kd * Jz(c.J, k) - dr[k]);
          // G = [-[r]x, I]: rows k: [-(rx)_k0, -(rx)_k1, -(rx)_k2, e_k]
          const rx = [0, -r[2], r[1], r[2], 0, -r[0], -r[1], r[0], 0];
          const G = [0, 1, 2].map((k) => [-rx[3 * k], -rx[3 * k + 1], -rx[3 * k + 2], k === 0 ? 1 : 0, k === 1 ? 1 : 0, k === 2 ? 1 : 0]);
          for (let m = 0; m < 6; m++) { for (let n2 = 0; n2 < 6; n2++) A6[6 * m + n2] += G[0][m] * G[0][n2] + G[1][m] * G[1][n2] + G[2][m] * G[2][n2]; b6[m] += G[0][m] * t[0] + G[1][m] * t[1] + G[2][m] * t[2]; }
        }
        if (!cholesky(A6, 6)) continue;
        // rows L^T Js, targets L^-1 b6
        const tg = new Float64Array(6);
        for (let m = 0; m < 6; m++) { let v = b6[m]; for (let k = 0; k < m; k++) v -= A6[6 * m + k] * tg[k]; tg[m] = v / A6[6 * m + m]; }
        const Jr = new Float64Array(nz);
        for (let k = 0; k < 6; k++) {
          Jr.fill(0);
          for (let m = k; m < 6; m++) { const l = A6[6 * m + k]; if (!l) continue; for (let z = 0; z < nz; z++) Jr[z] += l * Js[m * nz + z]; }
          addRow(Jr, tg[k], p.w_contact, "contact:" + S + k);
        }
      }
      // planted feet flat: a sole's up held along the ground's normal (yaw free). Its up is the foot's
      // own resting one - settling (soleSettleS) towards the foot's present up while heel and both
      // balls bear, held while it is rolled off them (R1.5 held the settled foot's orientation)
      if (p.w_foot_flat > 0) for (const S of ["L", "R"]) {
        if (W.support[S] !== true || !all.some((c) => c.side === S)) continue;
        const li = foot[S].link, fs = all.filter((c) => c.side === S), nG = unit(fs.reduce((a, c) => add(a, c.n), [0, 0, 0]));
        // (the sole resting on a broad patch of its pads - their outline at least soleFullFrac of the
        // whole sole's: its pads hold it, and tilt it as the pressure moves across them, so its rest
        // follows where it lies; on a narrowing patch - rolling onto an edge - the rest is held)
        const full = hullArea(fs.map((c) => [c.x[0], c.x[1]])) >= p.soleFullFrac * soleArea[S];
        W.soleFull = W.soleFull || {}; W.soleFull[S] = full;
        if (full && p.soleSettleS > 0) { const now = mtv(b.Rw[li], nG), k = Math.min(1, dtc / p.soleSettleS); soleUp[S] = unit(add(scl(soleUp[S], 1 - k), scl(now, k))); }
        const up = mv(b.Rw[li], soleUp[S]);
        const ax = cross(up, nG), sn = len(ax), err = sn > 1e-9 ? scl(ax, Math.atan2(sn, dot(up, nG)) / sn) : [0, 0, 0];
        const Jw = b.angularJacobian(li, J3), dr = p.drift ? b.angularDrift(li) : [0, 0, 0];
        for (let r = 0; r < 3; r++) addRow(rowOf(Jw, r), p.foot_flat_kp * err[r] - p.foot_flat_kd * Jz(Jw, r) - dr[r], p.w_foot_flat, "foot_flat:" + S + "xyz"[r]);
      }
      // centre of mass: J_com = R0 M[3:6, :] / m; its drift from h's base rows (R0 h_lin / m + g)
      const Jc = J3b;
      for (let r = 0; r < 3; r++) for (let k = 0; k < nz; k++) Jc[r * nz + k] = (R0[3 * r] * M[3 * nz + k] + R0[3 * r + 1] * M[4 * nz + k] + R0[3 * r + 2] * M[5 * nz + k]) / m;
      // (the centre of mass's drift: the velocity products' share of the momentum rate - h's base
      // rows less the external forces in it)
      let comDrift = [0, 0, 0];
      if (p.drift) {
        let Fe = [0, 0, 0];
        for (let i = 0; i < b.n; i++) { const f = b.fext[i]; Fe = add(Fe, mv(b.Rw[i], [f[3], f[4], f[5]])); }
        const hl = mv(R0, [h[3], h[4], h[5]]);
        comDrift = [(hl[0] + Fe[0]) / m, (hl[1] + Fe[1]) / m, (hl[2] + Fe[2]) / m];
      }
      const com = mo.com, vcom = mo.vcom;
      if (W.comOffset == null) W.setComTargetFromCurrent();
      let accC, eC, pstar = null;
      // (the support the centre of pressure may use: feet the plan supports and may load - a foot whose
      // force cap has been ramped down cannot take the pressure)
      const sup = all.filter((c) => W.support[c.side] === true && !((W.forceCap[c.side] ?? Infinity) < p.cop_min_cap * I.bodyWeightN));
      if (p.capture_k > 0 && nc) {
        const goal = W.comGoal ? W.comGoal.p : currentComTarget();
        const w0 = Math.sqrt(9.81 / Math.max(com[2] - groundUnder(com), 0.3));
        const xi = [com[0] + vcom[0] / w0, com[1] + vcom[1] / w0];
        // the capture point tracked (Hof 2005; with a moving goal, its own capture point
        // xi_d = g + g'/w0 and that one's rate - Englsberger 2015): p* = xi + k (xi - xi_d) - xi_d' / w0
        const ff = p.dcm_ff, gv = scl(W.comGoal?.v || [0, 0, 0], ff), ga = scl(W.comGoal?.a || [0, 0, 0], ff);
        const xd = [goal[0] + gv[0] / w0, goal[1] + gv[1] / w0], xdd = [gv[0] + ga[0] / w0, gv[1] + ga[1] / w0];
        pstar = [xi[0] + p.capture_k * (xi[0] - xd[0]) - xdd[0] / w0, xi[1] + p.capture_k * (xi[1] - xd[1]) - xdd[1] / w0];
        if (sup.length >= 3) pstar = clampToPolygon(pstar, sup.map((c) => [c.x[0], c.x[1]]), p.cop_margin);
        eC = [0, 0, currentComTarget()[2] - com[2]];
        accC = [w0 * w0 * (com[0] - pstar[0]), w0 * w0 * (com[1] - pstar[1]), p.com_kp_y * eC[2] - p.com_kd_y * vcom[2]];
        W.last.xi = xi;
      } else if (W.comGoal) {
        const G = W.comGoal;
        eC = [G.p[0] - com[0], G.p[1] - com[1], (G.p[2] ?? currentComTarget()[2]) - com[2]];
        accC = [(G.a?.[0] || 0) + p.com_kp * eC[0] + p.com_kd * ((G.v?.[0] || 0) - vcom[0]), (G.a?.[1] || 0) + p.com_kp * eC[1] + p.com_kd * ((G.v?.[1] || 0) - vcom[1]), p.com_kp_y * eC[2] - p.com_kd_y * vcom[2]];
      } else {
        eC = sub(currentComTarget(), com);
        accC = [p.com_kp * eC[0] - p.com_kd * vcom[0], p.com_kp * eC[1] - p.com_kd * vcom[1], p.com_kp_y * eC[2] - p.com_kd_y * vcom[2]];
      }
      for (let r = 0; r < 3; r++) addRow(rowOf(Jc, r), accC[r] - comDrift[r], p.w_com * W.comAxisScale[r], "com");
      // whole-body angular momentum about the centre of mass damped (A_G = R0 (M[0:3] - [cb]x M[3:6]))
      let Lc = null;
      if (p.w_angmom > 0) {
        const cb = mo.cb, A = J3;
        for (let r = 0; r < 3; r++) {
          // (row r of M[0:3] - skew(cb) M[3:6], base coords)
          for (let k = 0; k < nz; k++) {
            const m3 = M[3 * nz + k], m4 = M[4 * nz + k], m5 = M[5 * nz + k];
            const sk = r === 0 ? -cb[2] * m4 + cb[1] * m5 : r === 1 ? cb[2] * m3 - cb[0] * m5 : -cb[1] * m3 + cb[0] * m4;
            J3b[r * nz + k] = M[r * nz + k] - sk;
          }
        }
        for (let r = 0; r < 3; r++) for (let k = 0; k < nz; k++) A[r * nz + k] = R0[3 * r] * J3b[k] + R0[3 * r + 1] * J3b[nz + k] + R0[3 * r + 2] * J3b[2 * nz + k];
        Lc = mo.L;
        for (let r = 0; r < 3; r++) addRow(rowOf(A, r), -p.angmom_k * Lc[r], p.w_angmom, "angmom");
      }
      // pelvis, chest, head: world orientation (yawed with her heading)
      const Ry = Rz(W.heading - heading0);
      const oriErr = {};
      for (const [k, li, wk] of ORI) {
        const tgt = mm(Ry, W.oriTarget?.[k] || Rstar[k]), err = logSO3(mm(tgt, mt(b.Rw[li])));
        const Jw = b.angularJacobian(li, J3), dr = p.drift ? b.angularDrift(li) : [0, 0, 0], kk = k === "head" ? p.head_ori_scale : 1;
        oriErr[k] = len(err) / DEG;
        const ax = k === "head" ? p.head_axes : null;
        for (let r = 0; r < 3; r++) addRow(rowOf(Jw, r), kk * p.ori_kp * err[r] - Math.sqrt(kk) * p.ori_kd * Jz(Jw, r) - dr[r], p[wk] * (ax ? ax[r] : 1), "ori_" + k);
      }
      // swing foot: its origin and orientation on the step's path
      const postScale = new Float64Array(NH).fill(1);
      for (let i = 0; i < NH; i++) if (legRow.L[i] || legRow.R[i]) postScale[i] = W.legPostureScale;
      if (W.swing) {
        const sw = W.swing, li = foot[sw.side].link, x = b.ow[li];
        const Jp = Float64Array.from(b.pointJacobian(li, x, J3)), dr = p.drift ? b.pointDrift(li, x) : [0, 0, 0];
        for (let r = 0; r < 3; r++) addRow(rowOf(Jp, r), (sw.acc?.[r] || 0) + p.swing_kp * (sw.pos[r] - x[r]) + p.swing_kd * ((sw.vel?.[r] || 0) - Jz(Jp, r)) - dr[r], p.w_swing, "swing_pos");
        const Jw = b.angularJacobian(li, J3), drw = p.drift ? b.angularDrift(li) : [0, 0, 0], err = logSO3(mm(sw.R, mt(b.Rw[li])));
        for (let r = 0; r < 3; r++) addRow(rowOf(Jw, r), p.swing_ori_kp * err[r] - p.swing_ori_kd * Jz(Jw, r) - drw[r], p.w_swing * 0.5, "swing_ori");
        for (let i = 0; i < NH; i++) if (legRow[sw.side][i]) postScale[i] *= p.swing_leg_posture_scale;
      }
      // posture (weak): each hinge's acceleration towards its intended angle
      for (let i = 0; i < NH; i++) {
        const w = hingeW(H[i]) * postScale[i];
        if (!w) continue;
        const li = H[i].link;
        addUnitRow(5 + li, p.q_kp * (qStar[li] - b.q[li]) - p.q_kd * b.qd[li], w, "posture:" + H[i].id);
      }
      // effort (a towards tone) and force regularisation: diagonal
      const sa = p.w_act, sf = p.w_force;
      for (let k = 0; k < na; k++) { Q[k * nv + k] += sa; g[k] += sa * p.tone; }
      for (let j = na; j < nv; j++) Q[j * nv + j] += sf;
      for (let i = 0; i < nv; i++) { Q[i * nv + i] += 1e-9; for (let j = i + 1; j < nv; j++) Q[j * nv + i] = Q[i * nv + j]; }
      // ---- bounds: what each muscle reaches over this plan's interval (R1.5 "interval"), fatigue;
      // a foot's force cap shared by its points
      const lo = new Float64Array(nv), hi = new Float64Array(nv), fc = fat();
      for (let k = 0; k < na; k++) {
        const i = free[k], a = clamp(MU.act[i], 0, 1), ta = MU.tauAct * (0.5 + 1.5 * a), td = MU.tauDeact / (0.5 + 1.5 * a);
        let l = first ? 0 : a * Math.exp(-dtc / td), u = first ? 1 : 1 + (a - 1) * Math.exp(-dtc / ta);
        if (fc) u = Math.min(u, Math.max(fc[i], l));
        if (W.capOverride && W.capOverride[MU.ids[i]] != null) { u = Math.min(u, W.capOverride[MU.ids[i]]); l = Math.min(l, u); }
        lo[k] = l; hi[k] = Math.max(u, l + 1e-7);
      }
      const npts = { L: 0, R: 0 };
      for (const c of cons) npts[c.side]++;
      for (let ci = 0; ci < nc; ci++) { const S = cons[ci].side, cap = (W.forceCap[S] ?? Infinity) * sq / (NE * Math.max(1, npts[S])); for (let e = 0; e < NE; e++) hi[na + NE * ci + e] = Math.max(cap, 1e-7); }
      const tC = typeof performance !== "undefined" ? performance.now() : Date.now();
      // ---- solve on y = x - lo in [0, hi - lo]: g' = g - Q lo
      const gy = new Float64Array(nv), ub = new Float64Array(nv), y = new Float64Array(nv);
      for (let i = 0; i < nv; i++) { let s = g[i]; for (let j = 0; j < nv; j++) s -= Q[i * nv + j] * lo[j]; gy[i] = s; ub[i] = hi[i] - lo[i]; }
      // (warm start: last tick's solution and its active set - a variable at a bound then starts at
      // that bound now, the reachable box having moved under it; a pad new to the plan starts free)
      const vkey = (j) => (j < na ? "m" + free[j] : "c" + sphereId.get(cons[((j - na) / NE) | 0].s) + "." + ((j - na) % NE));
      for (let j = 0; j < nv; j++) {
        const st = lastStatus.get(vkey(j));
        if (st === 0) y[j] = 0;
        else if (st === 2) y[j] = ub[j];
        else if (st === 1) y[j] = clamp(lastX.get(vkey(j)) - lo[j], 1e-9, ub[j] - 1e-9 > 1e-9 ? ub[j] - 1e-9 : ub[j]);
        else y[j] = j < na ? clamp(MU.act[free[j]] - lo[j], 0, ub[j]) : Math.min(ub[j], 50);
      }
      // (solved on variables scaled to a unit diagonal - Jacobi: an activation and a force in newtons
      // under weights from 1e-4 to 1e3 otherwise leave the active set's Cholesky without the digits
      // to converge; the optimum is the same)
      const dsc = new Float64Array(nv);
      for (let i = 0; i < nv; i++) dsc[i] = 1 / Math.sqrt(Math.max(Q[i * nv + i], 1e-300));
      for (let i = 0; i < nv; i++) {
        const di = dsc[i];
        for (let j = 0; j < nv; j++) Q[i * nv + j] *= di * dsc[j];
        gy[i] *= di; ub[i] /= di; y[i] /= di;
      }
      const res = MBL.boundedLSQ(Q.subarray(0, nv * nv), gy, nv, y, ub, 6 * nv + 40);
      for (let i = 0; i < nv; i++) { const di = dsc[i]; res.x[i] *= di; ub[i] *= di; gy[i] /= di; for (let j = 0; j < nv; j++) Q[i * nv + j] /= di * dsc[j]; }
      lastStatus.clear(); lastX.clear();
      for (let j = 0; j < nv; j++) { const k = vkey(j), v = res.x[j]; lastStatus.set(k, v <= 1e-12 ? 0 : v >= ub[j] - 1e-12 ? 2 : 1); lastX.set(k, lo[j] + v); }
      const tD = typeof performance !== "undefined" ? performance.now() : Date.now();
      W.prof = W.prof || { pre: 0, chol: 0, rows: 0, qp: 0, post: 0, n: 0 };
      W.prof.pre += tA - t0; W.prof.chol += tB - tA; W.prof.rows += tC - tB; W.prof.qp += tD - tC; W.prof.n++;
      if (W.checkKKT) {
        // optimality: free variables' gradient ~ 0, at a lower bound >= 0, at an upper bound <= 0
        let worst = 0, wi = -1;
        for (let i = 0; i < nv; i++) {
          let gr = -gy[i];
          for (let j = 0; j < nv; j++) gr += Q[i * nv + j] * res.x[j];
          const atLo = res.x[i] <= 1e-12, atHi = res.x[i] >= ub[i] - 1e-12, v = atLo ? Math.max(0, -gr) : atHi ? Math.max(0, gr) : Math.abs(gr);
          if (v > worst) { worst = v; wi = i; }
        }
        W.last.kkt = { worst, wi, iters: res.iters };
      }
      const x = new Float64Array(nv);
      for (let i = 0; i < nv; i++) { x[i] = clamp(lo[i] + res.x[i], lo[i], hi[i]); warm[i] = x[i]; }
      // ---- the activations she will reach, the excitation that reaches them
      const aDes = MU.aDes;
      for (let k = 0; k < na; k++) aDes[free[k]] = x[k];
      for (const i of fixed) aDes[i] = p.arm_tone;
      if (first) { MU.act.set(aDes); MU.u.set(aDes); }
      else excitationInterval(aDes, dtc);
      // ---- what the plan expects (telemetry, checks)
      const zdd = new Float64Array(nz);
      for (let k = 0; k < nz; k++) { let s = P[k * cols + nv]; for (let c = 0; c < nv; c++) s += P[k * cols + c] * x[c]; zdd[k] = s; }
      let grf = [0, 0, 0];
      const grfSide = { L: 0, R: 0 }, grfFoot = { L: [0, 0, 0], R: [0, 0, 0] }, momFoot = { L: [0, 0, 0], R: [0, 0, 0] };
      for (let ci = 0; ci < nc; ci++) {
        let f = [0, 0, 0];
        for (let e = 0; e < NE; e++) f = add(f, scl(cons[ci].E[e], x[na + NE * ci + e]));
        const S = cons[ci].side, an = b.ow[foot[S].link];
        grfFoot[S] = add(grfFoot[S], f); momFoot[S] = add(momFoot[S], cross(sub(cons[ci].x, an), f));
      }
      for (let ci = 0; ci < nc; ci++) for (let e = 0; e < NE; e++) { const v = x[na + NE * ci + e]; if (v) { grf = add(grf, scl(cons[ci].E[e], v)); grfSide[cons[ci].side] += v * cons[ci].E[e][2]; } }
      const cost = {};
      if (W.gradOf) {
        // per task, d(cost)/dx_k for the asked variables (muscle ids): which task wants them where they are
        W.gradLast = {};
        for (const id of W.gradOf) {
          const k = free.indexOf(MU.ids.indexOf(id));
          if (k < 0) continue;
          const gt = {};
          for (const [nm, rw, bv] of costRows) { let r = -bv; for (let i = 0; i < nv; i++) r += rw[i] * x[i]; const key = nm.split(":")[0]; gt[key] = (gt[key] || 0) + 2 * r * rw[k]; }
          gt.effort = 2 * p.w_act * (x[k] - p.tone);
          W.gradLast[id] = { x: x[k], lo: lo[k], hi: hi[k], g: gt };
        }
      }
      const costDetail = {};
      if (costRows) for (const [nm, rw, bv] of costRows) {
        let s = -bv; for (let i = 0; i < nv; i++) s += rw[i] * x[i];
        const k = nm.split(":")[0];
        cost[k] = (cost[k] || 0) + s * s;
        if (k !== nm) costDetail[nm.slice(k.length + 1)] = s * s;
      }

      let amax = 0, a2 = 0;
      for (let k = 0; k < na; k++) { amax = Math.max(amax, x[k]); a2 += x[k] * x[k]; }
      const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
      // (for checks: the planned forces at each planned contact point)
      W.planForces = cons.map((c, ci) => { let f = [0, 0, 0]; for (let e = 0; e < NE; e++) f = add(f, scl(c.E[e], x[na + NE * ci + e])); return { link: c.link, x: c.x, F: f, pad: c.s }; });
      W.last = { kkt: W.last.kkt, com, vcom, comErr: eC, pstar, L: Lc, contacts: nc, grf, grfSide, grfFoot, momFoot, zdd, cost, costDetail, oriErrDeg: oriErr, aMax: amax, meanA2: a2 / Math.max(1, na), iters: res.iters, ms: t1 - t0, nv };
      W.stats.ticks = (W.stats.ticks || 0) + 1; W.stats.msSum = (W.stats.msSum || 0) + (t1 - t0); W.stats.msMax = Math.max(W.stats.msMax || 0, t1 - t0);
      return true;
    }
    const fixedSet = new Uint8Array(MU.n);
    const refreshFixed = () => { fixedSet.fill(0); for (const i of fixed) fixedSet[i] = 1; };
    refreshFixed();
    const groundUnder = (x) => (R.lastGround ? R.lastGround.height(x[0], x[1]) : 0);
    // excitation whose activation over the interval dtc is aDes (R1.5 neuro.excitation, "interval")
    function excitationInterval(aDes, dtc) {
      for (let i = 0; i < MU.n; i++) {
        const a = clamp(MU.act[i], 0, 1), up = aDes[i] > MU.act[i];
        const tau = up ? MU.tauAct * (0.5 + 1.5 * a) : MU.tauDeact / (0.5 + 1.5 * a), e = Math.exp(-dtc / tau);
        MU.u[i] = clamp((aDes[i] - MU.act[i] * e) / Math.max(1 - e, 1e-9), 0, 1);
      }
    }
    // ---- the drive, every body step (46's servoTorques hands over to it while W.driving): her
    // muscles' geometry and force-length-velocity state, a plan every control tick, the activation
    // step, their forces and damping into the joints (b.tau already holds her passive tissue, and
    // b.armature its implicit part)
    R.wbcMuscleArm = new Float64Array(b.n);
    const damp = new Float64Array(b.n), tauM = new Float64Array(b.n);
    W.drive = (dt) => {
      MU.geometry(); MU.muscleState();
      MU.damping(damp);
      for (let i = 0; i < b.n; i++) R.wbcMuscleArm[i] = damp[i] * dt;
      const K = Math.max(1, Math.round(p.control_dt / dt));
      // (taking over - placed, or from another drive - she is already holding the posture she is in:
      // the first plan over the whole activation range, reached at once; it waits for her soles to
      // bear on the ground)
      // (her soles at the ground: every pad within the contact margin of it)
      const gr = R.lastGround;
      let near = 0;
      for (const s of soles) {
        if (s.ground.on) { near++; continue; }
        if (!gr) continue;
        const cw = b.toWorld(s.link, s.c);
        if (cw[2] - s.r - gr.height(cw[0], cw[1]) < p.contact_margin) near++;
      }
      const onGround = near >= 6;
      if (W.snap && onGround) {
        W.snap = false; tick = 0; lastKey = "";
        if (W.comOffset == null) W.setComTargetFromCurrent();
        control(dt, K * dt, true);
      } else if (!W.snap && tick % K === 0) { if (W.fsmOn) F.step(K * dt); control(dt, K * dt, false); }
      tick++;
      MU.stepActivation(dt);
      const fc = fat();
      if (fc) for (let i = 0; i < MU.n; i++) if (MU.act[i] > fc[i]) MU.act[i] = fc[i];
      tauM.fill(0);
      MU.forces(tauM);
      MU.damping(damp);
      for (let i = 1; i < b.n; i++) { b.tau[i] += tauM[i]; b.armature[i] += damp[i] * dt; }
      W.tauMus = tauM;
    };
    // ------------------------------------------------------------ the support state machine
    // (R1.5 lucid_bcr/agility.py SupportFSM): which feet support her, where her centre of mass and a
    // free foot go - each change triggered by what she senses (a foot's load, its contact, her capture
    // point), the clock only bounding a phase. Muscles stay the only actuators.
    //   double  both feet; COM held over them; reactive step if the capture point leaves the feet
    //   shift   both feet; COM over the stance foot, then the other unloaded (its force cap ramped down)
    //   swing   one foot; the free foot on a minimum-jerk path with a lift, re-aimed at the capture point
    //   hold    one foot; the free foot held up relative to the pelvis (single-leg stance)
    //   land    touched down: both feet; COM goal re-anchored inside the new base of support
    const A = Object.assign({}, AGILITY, opts.agility || {});
    const base = Object.assign({}, p), g0 = 9.81;
    const F = (W.fsm = { A, state: "double", t: 0, tState: 0, plan: null, mode: null, request: null, log: [], blend: 0, lastMargin: 0 });
    // each sole's patch in the foot's frame: its pads' lowest points (the support centre does not chase
    // the edge of a rolling foot)
    const soleLocal = {};
    for (const S of ["L", "R"]) soleLocal[S] = soles.filter((s2) => s2.side === S).map((s2) => sub(s2.c, scl(mtv(b.Rw[foot[S].link], [0, 0, 1]), s2.r)));
    const footLoad = () => { const L = { L: 0, R: 0 }; for (const s2 of R.spheres) if (s2.ground.on && (s2.link === foot.L.link || s2.link === foot.R.link)) L[s2.link === foot.L.link ? "L" : "R"] += Math.max(0, s2.ground.F[2]); return L; };
    const footPoints = (S, tol = 0.006) => {
      const gr = R.lastGround, out = [];
      for (const s2 of soles) {
        if (s2.side !== S) continue;
        const cw = b.toWorld(s2.link, s2.c), gz = gr ? gr.height(cw[0], cw[1]) : 0;
        if (cw[2] - s2.r - gz < tol) out.push([cw[0], cw[1]]);
      }
      return out;
    };
    const footLow = (S) => { let lo = Infinity; const gr = R.lastGround; for (const s2 of R.spheres.filter((x) => x.kind !== "sole").concat(soles)) if (s2.link === foot[S].link) { const cw = b.toWorld(s2.link, s2.c); lo = Math.min(lo, cw[2] - s2.r - (gr ? gr.height(cw[0], cw[1]) : 0)); } return lo; };
    const centre = (S) => { const P = soleLocal[S], li = foot[S].link; let c = [0, 0, 0]; for (const q of P) c = add(c, b.toWorld(li, q)); c = scl(c, 1 / P.length); c[2] = R.lastGround ? R.lastGround.height(c[0], c[1]) : 0; return c; };
    // signed distance of a point inside the convex hull of P (+ inside)
    function margin(pt, P) {
      const V = hull2(P);
      if (V.length < 3) return -Infinity;
      let m = Infinity;
      for (let i = 0; i < V.length; i++) { const a = V[i], c = V[(i + 1) % V.length], ab = [c[0] - a[0], c[1] - a[1]], l = Math.hypot(ab[0], ab[1]) || 1; m = Math.min(m, (ab[0] * (pt[1] - a[1]) - ab[1] * (pt[0] - a[0])) / l); }
      return m;
    }
    const capture = () => { const mo = b.momentum(b.massMatrix()), gz = R.lastGround ? R.lastGround.height(mo.com[0], mo.com[1]) : 0, w0 = Math.sqrt(g0 / Math.max(mo.com[2] - gz, 0.3)); return { com: mo.com, v: mo.vcom, xi: [mo.com[0] + mo.vcom[0] / w0, mo.com[1] + mo.vcom[1] / w0], w0 }; };
    const fwdOf = () => [-Math.sin(W.heading), Math.cos(W.heading), 0], latOf = () => [Math.cos(W.heading), Math.sin(W.heading), 0];
    const enter = (st) => { F.log.push([+F.t.toFixed(3), F.state, st]); F.state = st; F.tState = 0; };
    const legLinks = H.filter((h) => /^(left|right)(Hip|Knee|Ankle)\./.test(h.id)).map((h) => h.link);
    const reanchorLegs = () => { for (const li of legLinks) qStar[li] = b.q[li]; };
    // (pelvis and chest: on one foot, the orientation she stands in as the foot comes up - a pelvis a few
    // degrees off level is how a person stands on one leg; held to the two-footed one, her trunk's
    // muscles spend themselves against her contacts and her posture to level it. Back to the standing
    // ones on two feet)
    const spineLinks = H.filter((h) => /^(spine|neck|head)/.test(h.id)).map((h) => h.link);
    const reanchorTrunk = (on) => {
      for (const [k, li] of ORI) {
        if (k === "head") continue;
        Rstar[k] = on ? mm(mt(Rz(W.heading - heading0)), b.Rw[li]) : Rstar0[k].slice();
      }
      // (and the spine's and neck's intended angles with them: held to the two-footed ones, the posture
      // rows pull the trunk back from the orientation now intended for it)
      if (A.reanchor_spine) for (const li of spineLinks) qStar[li] = on ? b.q[li] : qStar0[li];
    };
    W.requestSingleLeg = (stance) => { F.request = ["single", stance]; };
    F.debug = { footPoints, margin, centre, hull2 };
    W.requestStep = (swing, delta) => { F.request = ["step", swing, delta]; };
    W.requestDouble = () => { F.request = ["down"]; };
    function startShift(stance, T, sagScale, cap) {
      const other = stance === "L" ? "R" : "L", sc = centre(stance), oc = centre(other);
      let inward = sub(oc, sc); inward[2] = 0; inward = unit(inward);
      let goal = add(sc, scl(inward, A.lat_inner));
      // across the feet, and along the stance foot by shift_along of the way to its middle (R1.5 moved it
      // across only - its place along the feet already balanced on MuJoCo's full footprint; her tripod
      // sole narrows to the one heel pad, and her standing COM is only ~5 cm ahead of it)
      const fw = fwdOf(); goal = sub(goal, scl(fw, (1 - A.shift_along) * dot(sub(goal, cap.com), fw)));
      goal[2] = cap.com[2];
      F.plan = { stance, swing: other, com0: cap.com.slice(), goal, T };
      W.comAxisScale = [1, 1, 1];
      if (sagScale !== 1) { const ax = Math.abs(fw[0]) > Math.abs(fw[1]) ? 0 : 1; W.comAxisScale[ax] = sagScale; }
      W.legPostureScale = A.leg_posture_scale;
    }
    // where the free foot lands: at her capture point as it will be at touchdown (the stance foot's
    // pressure holding still meanwhile), past it by step_margin along her heading; across, outside it
    // by lat_margin on the free foot's own side (Hof 2008: the foot lands just outside the extrapolated
    // centre of mass), the step's width kept between min_width and max_width of the stance foot
    function swingTarget(cap, remaining) {
      const pl = F.plan, cop = centre(pl.stance), e = Math.exp(cap.w0 * Math.max(remaining, 0));
      const xiTd = [cop[0] + (cap.xi[0] - cop[0]) * e, cop[1] + (cap.xi[1] - cop[1]) * e, 0];
      const cur = F.state !== "swing" ? centre(pl.swing) : pl.centreAtLift, fw = fwdOf(), lat = latOf();
      let sag = dot(sub(xiTd, cur), fw);
      sag += Math.sign(sag || 1) * A.step_margin;
      sag = Math.sign(sag || 1) * clamp(Math.abs(sag), A.min_step, A.max_step);
      const side = Math.sign(dot(sub(cur, cop), lat)) || 1;
      const want = side * clamp(side * (dot(sub(xiTd, cop), lat) + side * A.lat_margin), A.min_width, A.max_width);
      return add(pl.foot0, add(scl(fw, sag), scl(lat, want - dot(sub(cur, cop), lat))));
    }
    F.step = (dt) => {
      F.t += dt; F.tState += dt;
      const cap = capture(), load = footLoad(), bw = I.bodyWeightN;
      // (the one-foot parameters fade in on one foot, out on two)
      if (A.use_single_overrides) {
        const want = (A.single_from === "lift" ? F.state === "swing" : F.state === "shift" || F.state === "swing") || F.state === "hold" ? 1 : 0;
        F.blend = clamp(F.blend + Math.sign(want - F.blend) * Math.min(Math.abs(want - F.blend), dt / A.blend_s), 0, 1);
        for (const k in A.single_overrides) p[k] = base[k] + F.blend * (A.single_overrides[k] - base[k]);
      }
      if (F.state === "double") {
        W.support = { L: true, R: true }; W.swing = null; W.comGoal = null; W.comAxisScale = [1, 1, 1]; W.legPostureScale = 1;
        W.forceCap = { L: Infinity, R: Infinity };
        const mg = margin(cap.xi, footPoints("L").concat(footPoints("R")));
        F.lastMargin = mg;
        if (F.request) {
          const rq = F.request; F.request = null;
          if (rq[0] === "single") { F.mode = "single"; startShift(rq[1], A.shift_time_voluntary, 1, cap); enter("shift"); }
          else if (rq[0] === "step") { F.mode = "step_voluntary"; startShift(rq[1] === "L" ? "R" : "L", A.shift_time_voluntary * 0.6, 1, cap); F.plan.delta = rq[2]; enter("shift"); }
        } else if (A.reactive && mg < -A.step_trigger_m) {
          // her capture point has left her feet: step with the less loaded foot
          const sw = load.L < load.R ? "L" : "R";
          F.mode = "step_reactive"; startShift(sw === "L" ? "R" : "L", A.shift_time, A.sag_scale_shift, cap); enter("shift");
        }
        return;
      }
      if (F.state === "shift") {
        const pl = F.plan, s = F.tState / pl.T;
        let [gp, gv, ga] = minjerk(pl.com0, pl.goal, s);
        gv = scl(gv, 1 / pl.T); ga = scl(ga, 1 / (pl.T * pl.T));
        if (F.mode === "step_reactive") {
          // across: towards the stance foot; along: her momentum carries on (weak task)
          const fw = fwdOf(), along = dot(sub(cap.com, gp), fw);
          gp = add(gp, scl(fw, along)); gv = add(gv, scl(fw, dot(cap.v, fw) - dot(gv, fw))); ga = sub(ga, scl(fw, dot(ga, fw)));
        }
        W.comGoal = { p: gp, v: gv, a: ga };
        const unloaded = load[pl.swing] < (F.mode === "step_reactive" ? A.unload_frac : A.unload_frac_voluntary) * bw;
        let ready, giveUp;
        if (F.mode === "step_reactive") { ready = unloaded && s > 0.3; giveUp = s >= 2.5 && !unloaded; }
        else {
          // voluntary: shift first, then take the weight off the foot deliberately; lift once unloaded with
          // her capture point inside the stance sole
          // (unloading starts once the shift has had its time AND her centre of mass stands over the
          // stance sole - sensed, not by the clock alone: unloaded with the COM still inside of that foot,
          // she falls towards the foot that can no longer take her weight)
          const sole = footPoints(pl.stance), comIn = margin([cap.com[0], cap.com[1]], sole);
          pl.comMargin = comIn;
          if (pl.tUnload == null && F.tState >= pl.T && comIn >= A.unload_com_margin) pl.tUnload = F.tState;
          const tu = pl.tUnload == null ? -1 : F.tState - pl.tUnload;
          if (tu >= 0) {
            if (pl.cap0 == null) pl.cap0 = Math.max(load[pl.swing], 0.05 * bw);
            W.forceCap = { [pl.stance]: Infinity, [pl.swing]: pl.cap0 * Math.max(0, 1 - tu / A.unload_time) };
          }
          pl.liftMargin = margin(cap.xi, footPoints(pl.stance));
          ready = unloaded && tu >= 0 && pl.liftMargin >= A.lift_margin;
          giveUp = (tu > A.unload_time + 1.5 && !ready) || (pl.tUnload == null && F.tState > pl.T + A.shift_wait_s);
        }
        if (giveUp) { W.forceCap = { L: Infinity, R: Infinity }; enter("double"); return; }
        if (ready) {
          const sw = pl.swing, li = foot[sw].link;
          pl.foot0 = b.ow[li].slice(); pl.R = b.Rw[li].slice(); pl.centreAtLift = centre(sw);
          W.support = { [pl.stance]: true, [sw]: "release" };
          W.forceCap = { [pl.stance]: Infinity, [sw]: 0 };
          // the stance leg's (both legs') intended posture becomes where they are, at full weight again; on
          // one straight leg her COM sits lower than on two: the height it has now
          reanchorLegs(); W.legPostureScale = 1;
          if (A.reanchor_trunk) reanchorTrunk(true);
          W.comOffset = sub(cap.com, feetCenter()); W.comOffset[0] = W.comOffset[0]; // (height kept relative to the feet)
          if (F.mode === "single") { pl.target = pl.foot0.slice(); pl.Tsw = 0.9; pl.height = A.hold_height; }
          else if (F.mode === "step_voluntary") { pl.target = add(pl.foot0, add(scl(latOf(), pl.delta[0]), scl(fwdOf(), pl.delta[1]))); pl.Tsw = A.swing_time * 1.3; pl.height = A.lift_height; }
          else { pl.Tsw = A.swing_time; pl.height = A.lift_height; pl.target = swingTarget(cap, pl.Tsw); }
          enter("swing");
        }
        return;
      }
      if (F.state === "swing" || F.state === "hold") {
        const pl = F.plan, sw = pl.swing;
        W.support = { [pl.stance]: true, [sw]: "release" };
        if (F.state === "hold") {
          // the lifted foot held from the hip: it goes where the pelvis goes, turned with her heading -
          // not rolled or pitched with the pelvis (R1.5 held it in the pelvis's frame: a pelvis rolling
          // towards the free side then swings the held leg out with it, and the leg's reaction rolls it
          // further)
          const Rh = Rz(W.heading), ph = b.ow[0], li = foot[sw].link;
          if (!pl.holdRel) {
            pl.holdRel = mtv(Rh, sub(b.ow[li], ph)); pl.holdRrel = mm(mt(Rh), b.Rw[li]);
            // (held at its joints instead: the free leg's intended posture where it is as it comes up)
            if (A.hold_leg === "joint") for (const h of H) if (h.id.startsWith(sw === "L" ? "left" : "right") && /(Hip|Knee|Ankle)\./.test(h.id)) qStar[h.link] = b.q[h.link];
          }
          W.swing = A.hold_leg === "joint" ? null : { side: sw, pos: add(ph, mv(Rh, pl.holdRel)), vel: b.pointVelocity(0, [0, 0, 0]), acc: [0, 0, 0], R: mm(Rh, pl.holdRrel) };
          W.comGoal = { p: pl.goal, v: [0, 0, 0], a: [0, 0, 0] }; W.comAxisScale = [1, 1, 1];
          if (F.request && F.request[0] === "down") { F.request = null; pl.target = add(pl.foot0, [0, 0, -0.01]); pl.Tsw = 0.6; pl.height = 0; F.mode = "down"; enter("swing"); }
          return;
        }
        const s = F.tState / pl.Tsw;
        if (F.mode === "step_reactive" && s < 0.7) pl.target = swingTarget(cap, pl.Tsw - F.tState);
        let [ph, vh, ah] = minjerk(pl.foot0, pl.target, s);
        vh = scl(vh, 1 / pl.Tsw); ah = scl(ah, 1 / (pl.Tsw * pl.Tsw));
        let pos, vel, acc;
        if (F.mode === "single") {
          const lift = pl.height * minjerk([0], [1], s)[0][0];
          pos = add(ph, [0, 0, lift]); vel = vh; acc = ah;
          if (s >= 1) { enter("hold"); }
        } else {
          const ss = clamp(s, 0, 1), Hh = pl.height;
          pos = add(ph, [0, 0, Hh * Math.sin(Math.PI * ss) - 0.006 * ss]);
          vel = add(vh, [0, 0, (Hh * Math.PI * Math.cos(Math.PI * ss)) / pl.Tsw]);
          acc = add(ah, [0, 0, (-Hh * Math.PI * Math.PI * Math.sin(Math.PI * ss)) / (pl.Tsw * pl.Tsw)]);
          const touched = load[sw] > A.land_force_frac * bw || (s > 0.6 && footLow(sw) < 0.001);
          if ((s > 0.55 && touched) || s >= 1.35) { W.swing = null; W.support = { L: true, R: true }; pl.landCap0 = load[sw]; enter("land"); return; }
        }
        W.swing = { side: sw, pos, vel, acc, R: pl.R };
        if (F.mode === "step_reactive") {
          // during a reactive step: her momentum carries on (weak along), across over the stance foot
          const fw = fwdOf(), gp = add(cap.com, scl(latOf(), dot(sub(pl.goal, cap.com), latOf())));
          W.comGoal = { p: gp, v: scl(fw, dot(cap.v, fw)), a: [0, 0, 0] };
          const ax = Math.abs(fw[0]) > Math.abs(fw[1]) ? 0 : 1; W.comAxisScale = [1, 1, 1]; W.comAxisScale[ax] = 0.05;
        } else { W.comGoal = { p: pl.goal, v: [0, 0, 0], a: [0, 0, 0] }; W.comAxisScale = [1, 1, 1]; }
        return;
      }
      if (F.state === "land") {
        const pl = F.plan;
        W.support = { L: true, R: true }; W.swing = null;
        // (the landing foot's force cap ramps in: it takes her weight over land_ramp_s, not at once)
        const r = A.land_ramp_s > 0 ? clamp(F.tState / A.land_ramp_s, 0, 1) : 1;
        W.forceCap = { [pl.stance]: Infinity, [pl.swing]: r >= 1 ? Infinity : Math.max(pl.landCap0 || 0, 0.05 * bw) + r * bw };
        if (F.tState <= dt * 1.5) { F.landCom0 = cap.com.slice(); F.landGoal = scl(add(centre("L"), centre("R")), 0.5); F.landGoal[2] = cap.com[2]; if (A.reanchor_land) reanchorLegs(); if (A.reanchor_trunk) reanchorTrunk(false); }
        const s = F.tState / A.settle_time;
        let [gp, gv, ga] = minjerk(F.landCom0, F.landGoal, s);
        W.comGoal = { p: gp, v: scl(gv, 1 / A.settle_time), a: scl(ga, 1 / (A.settle_time * A.settle_time)) }; W.comAxisScale = [1, 1, 1];
        if (s >= 1) {
          W.comGoal = null;
          const off = sub(F.landGoal, feetCenter());
          W.comOffset = [off[0], off[1], W.comOffset[2]];
          enter("double");
        }
      }
    };
    W.reset = () => { lastStatus.clear(); lastX.clear(); W.snap = true; W.comOffset = null; W.swing = null; W.comGoal = null; W.support = { L: true, R: true }; W.forceCap = { L: Infinity, R: Infinity }; warm.fill(0); };
    W.setParams = (q) => { Object.assign(p, q); setMuscles(); refreshFixed(); };
    W.control = control;
    W.qStar = qStar;
    W.helpers = { logSO3, expSO3, Rz, clampToPolygon, feetCenter, currentComTarget: () => currentComTarget() };
    W.reset();
    R.wbc = W;
    return W;
  }

  const api = { create, PARAMS, AGILITY, PACKAGE_SINGLE };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.LUCID_RIDER_WBC = api;
})(typeof window !== "undefined" ? window : globalThis);
