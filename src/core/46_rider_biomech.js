// LUCID MOTO core · physical rider: the LUCID character as an articulated body on the 916
// ------------------------------------------------------------------------------------------
// The rider is a rigid multibody (45_rider_multibody.js) whose hinges ARE the Semantic51 DOFs of
// the canonical female-skin-v4.2 rig: same joints, axes, composition order and hard ranges
// (pelvis orientation is the floating base, toes are not simulated). Its state therefore is a
// set of Semantic51 commands + a placement, which the render path compiles through the canonical
// skin (47_…); nothing poses bones or writes P/G directly.
//
//   * mass: the R1.5 17-body physical profile (75 kg, "explicit 75 kg normalization, not
//     measured"), clavicles 0.05 kg each taken from the chest (as physbody.py)
//   * collision: spheres fitted inside her own skin, per physical segment (segment points as
//     physbody._segment_points: dominant Skin78 cluster, purity filter, proximal trims)
//   * actuation: JOINT TORQUES (servo motors), torque-limited. This is a motor-driven body, not
//     the R1.5 muscle-driven body. Lower-body limits = the R1.5 capacity ledger; trunk/neck
//     gains = physbody STANCE; arm gains/limits and all contact parameters are declared
//     engineering priors (see PRIORS), not measurements
//   * passive tissue: the R1.5 passive priors (k, d, end-range exponential) on every hinge
//   * contacts: soft-tissue spheres against the 916 envelope (signed distance field from the
//     GLB), footpeg cylinders, a grip attachment per hand (bilateral, strength-limited), the
//     ground; anchored Coulomb friction (sticks without creep, slides at mu N)
//   * control: planner (posture intent, apparent vertical, reactions) -> damped least-squares IK
//     on the Semantic51 chains -> stable-PD servos + gravity/inertial feed-forward (RNEA)
// Pure JS core (runs in the Node tests with a stub bike); the browser coupling to the V5 bike
// is at the end of the file.
(function (global) {
  "use strict";
  const MB = global.LUCID_MULTIBODY;
  if (!MB) { console.warn("LUCID rider biomech: multibody engine missing"); return; }
  const { cross, dot, mv, mtv, mm, mt, axisAngle } = MB.math;
  const DEG = Math.PI / 180;
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const I3 = () => [1, 0, 0, 0, 1, 0, 0, 0, 1];
  function logSO3(R) {
    const c = clamp((R[0] + R[4] + R[8] - 1) / 2, -1, 1), th = Math.acos(c);
    const v = [R[7] - R[5], R[2] - R[6], R[3] - R[1]];
    if (th < 1e-7) return scl(v, 0.5);
    if (Math.PI - th < 1e-4) { // near pi: axis from the symmetric part
      const d = [R[0], R[4], R[8]], k = d.indexOf(Math.max(...d)), a = [0, 0, 0];
      a[k] = Math.sqrt(Math.max(0, (d[k] + 1) / 2));
      for (let j = 0; j < 3; j++) if (j !== k) a[j] = (R[3 * k + j] + R[3 * j + k]) / (4 * a[k]);
      return scl(unit(a), th);
    }
    return scl(v, th / (2 * Math.sin(th)));
  }
  const expRV = (rv) => { const th = len(rv); return th < 1e-12 ? I3() : axisAngle(scl(rv, 1 / th), th); };
  const Rx = (a) => axisAngle([1, 0, 0], a), Ry = (a) => axisAngle([0, 1, 0], a), Rz = (a) => axisAngle([0, 0, 1], a);

  // ------------------------------------------------------------------ declared priors
  // Engineering priors (not measured on her); the R1.5 values are quoted where they exist.
  const PRIORS = {
    // servo gains [kp Nm/rad, kd Nms/rad, limit Nm] per joint family. Trunk, neck, head, hip,
    // knee, ankle kp/kd = physbody STANCE (ankle non-dorsi x0.4); lower-body limits = the R1.5
    // capacity ledger (asset torqueLimitNm) where it exists. Arms/clavicles have no R1.5 active
    // torque (relaxed in quiet stance): values below are priors for a female rider holding bars.
    gains: {
      Spine01: [900, 60, 150], Spine02: [700, 45, 150], NeckTwist01: [120, 8, 40], Head: [50, 3, 20],
      Thigh: [1400, 90, 180], Calf: [1400, 80, 180], Foot: [1600, 90, 150],
      Clavicle: [160, 6, 40], Upperarm: [160, 9, 50], Forearm: [90, 4.5, 40], Hand: [25, 0.8, 10],
    },
    pronationGain: [14, 0.4, 7],
    // contacts
    tissueK: 1.6e5, // N/m per metre of sphere radius (r = 5 cm -> 8 kN/m)
    tissueTau: 0.025, // s: damping = k * tau
    // the front of the pelvis between the thighs (perineum, lower abdomen) has no bone under it
    // the way the ischial tuberosities do: softer contact (x tissueK)
    softTissueScale: 0.35,
    pegK: 6e4, pegC: 380, gripK: 2.5e4, gripC: 150, gripRotK: 30, gripRotC: 0.6, gripTwistK: 12, gripStrengthN: 450,
    mu: { seat: 0.6, bike: 0.45, peg: 1.0, ground: 0.55, sole: 0.8 },
    clavicleMassKg: 0.05, // physbody.py CLAVICLE_MASS, taken from the chest
  };
  // physbody.py tables
  const PARTS = { Spine02: 10, Spine01: 6, Hip: 8, Head: 3, NeckTwist01: 2, Clavicle: 0, Upperarm: 4, Forearm: 3, Hand: 2, Thigh: 5, Calf: 4, Foot: 4 };
  const TRIM = { Upperarm: 0.22, Forearm: 0.06, Thigh: 0.14, Calf: 0.06 };
  const PASSIVE = { // physbody.passive_prior: k Nm/rad, d Nms/rad, A Nm, w rad, q0 deg
    Spine01: [40, 2, 20], Spine02: [40, 2, 20], NeckTwist01: [6, 0.4, 4], Head: [3, 0.2, 2], Clavicle: [40, 1, 15],
    Upperarm: [1, 0.4, 3], Forearm: [0.8, 0.15, 2, 0.12, 15], Hand: [0.6, 0.05, 1], Thigh: [10, 1.5, 15], Calf: [5, 1, 15], Foot: [5, 0.6, 8],
  };
  const PHYS = ["Hip", "Spine01", "Spine02", "NeckTwist01", "Head", "L_Clavicle", "L_Upperarm", "L_Forearm", "L_Hand", "R_Clavicle", "R_Upperarm", "R_Forearm", "R_Hand", "L_Thigh", "L_Calf", "L_Foot", "R_Thigh", "R_Calf", "R_Foot"];
  const baseName = (j) => (j[1] === "_" ? j.slice(2) : j);
  function segmentOfCluster(name) { // physbody.segment_of_cluster, toes folded into the foot
    if (name === "Pelvis" || name === "Waist") return "Hip";
    if (name === "Spine01") return "Spine01";
    if (name === "Spine02" || name.includes("Breast") || name.includes("RibsTwist")) return "Spine02";
    if (name.startsWith("NeckTwist")) return "NeckTwist01";
    if (name === "Head" || name === "JawRoot") return "Head";
    const S = name.slice(0, 2);
    if (name.includes("ShareBone")) return null;
    if (name.includes("UpperarmTwist")) return S + "Upperarm";
    if (name.includes("ForearmTwist")) return S + "Forearm";
    if (name.includes("ThighTwist")) return S + "Thigh";
    if (name.includes("CalfTwist")) return S + "Calf";
    if (name.includes("Toe1")) return S + "Foot";
    return name; // Clavicle, Hand, finger phalanges (not physical segments here), Foot
  }

  // ------------------------------------------------------------------ model
  function buildModel(ch) {
    const names = ch.joints.names, parents = ch.joints.parents, B = ch.joints.rest, TI = ch.joints.index;
    const bodyOf = Object.fromEntries(ch.physical.bodies.map((b) => [b.joint, b]));
    const links = [], linkOf = {}, hinges = [];
    const hb = bodyOf.Hip;
    links.push({ name: "Hip", joint: "Hip", parent: -1, axis: [0, 0, 0], offset: [0, 0, 0], mass: hb.massKg, com: sub(hb.comWorldRestM, B[TI.Hip]), inertia: hb.inertiaAtComKgM2.slice() });
    linkOf.Hip = 0;
    for (const j of PHYS.slice(1)) {
      const side = j[1] === "_" ? j[0] : null, base = baseName(j), pj = names[parents[TI[j]]];
      let dofs;
      if (base === "Hand") dofs = ch.dofs.filter((d) => (d.family === "distributed_twist" && d.id.startsWith(side === "L" ? "left" : "right")) || (d.joint === j && d.family !== "distributed_twist"));
      else dofs = ch.dofs.filter((d) => d.joint === j && d.family !== "distributed_twist" && d.family !== "root_orientation");
      dofs.sort((a, b) => a.order - b.order);
      let parent = linkOf[pj];
      dofs.forEach((d, k) => {
        const twist = d.family === "distributed_twist", sign = twist && side === "L" ? -1 : 1; // physical twist = semantic x (-1 L, +1 R)
        const g = twist ? PRIORS.pronationGain : PRIORS.gains[base];
        let [kp, kd, tmax] = g;
        if (base === "Foot" && !d.id.endsWith("dorsiPlantarflexion")) { kp *= 0.4; kd *= 0.4; tmax = 50; } // physbody stance_gain
        if (Number.isFinite(d.torqueLimitNm)) tmax = d.torqueLimitNm; // R1.5 capacity ledger
        const P = PASSIVE[base] || [1, 0.1, 1];
        const passive = { k: P[0], d: P[1], A: P[2], w: P[3] ?? 0.12, q0: (d.id.endsWith("Shoulder.abductionAdduction") ? -55 : P[4] ?? 0) * DEG };
        links.push({
          name: d.id, joint: j, parent, axis: scl(unit(d.axis), sign), offset: k === 0 ? sub(B[TI[j]], B[TI[pj]]) : [0, 0, 0],
          mass: 0, com: [0, 0, 0], inertia: [0, 0, 0, 0, 0, 0, 0, 0, 0], lo: d.min * DEG, hi: d.max * DEG, dof: d.id,
        });
        parent = links.length - 1;
        hinges.push({ link: parent, id: d.id, joint: j, base, kp, kd, tmax, passive, lo: d.min * DEG, hi: d.max * DEG, vmax: (ch.maxVelocityDegS?.[d.id] || 300) * DEG });
      });
      const last = links[parent];
      if (base === "Clavicle") {
        const ua = B[TI[side + "_Upperarm"]], m = PRIORS.clavicleMassKg, L = len(sub(ua, B[TI[j]]));
        last.mass = m; last.com = scl(sub(ua, B[TI[j]]), 0.5); last.inertia = [(m * L * L) / 12 + 1e-6, 0, 0, 0, (m * L * L) / 12 + 1e-6, 0, 0, 0, (m * L * L) / 12 + 1e-6];
      } else {
        const b = bodyOf[j];
        let m = b.massKg, I = b.inertiaAtComKgM2.slice();
        if (j === "Spine02") { const f = (m - 2 * PRIORS.clavicleMassKg) / m; m *= f; I = I.map((x) => x * f); }
        last.mass = m; last.com = sub(b.comWorldRestM, B[TI[j]]); last.inertia = I;
      }
      linkOf[j] = parent;
    }
    const spec = { links };
    return { spec, links, linkOf, hinges, B, TI, names, totalMass: links.reduce((s, l) => s + l.mass, 0) };
  }

  // segment skin points (physbody._segment_points) and collision spheres fitted inside them
  function segmentPoints(ch) {
    const { indptr, indices, data, sum } = ch.weights, V = ch.vrest, NV = ch.nv, B = ch.joints.rest, TI = ch.joints.index;
    const segOf = ch.clusters.names.map(segmentOfCluster), out = {};
    for (let v = 0; v < NV; v++) {
      let dom = -1, wmax = 0;
      for (let k = indptr[v]; k < indptr[v + 1]; k++) if (data[k] > wmax) { wmax = data[k]; dom = indices[k]; }
      const s = sum[v] || 1, seg = segOf[dom];
      if (!seg || !PHYS.includes(seg) || wmax / s < 0.5) continue;
      let foreign = 0;
      for (let k = indptr[v]; k < indptr[v + 1]; k++) if (segOf[indices[k]] !== seg) foreign += data[k];
      // physbody's purity rule (blend webs are soft folding skin, not rigid collision surfaces);
      // the lumbar skin is blended everywhere, so it keeps every vertex it dominates. The sitting
      // surface (buttocks/gluteal fold) is added separately from the skin in the seated pose.
      if (foreign / s >= (seg === "Spine01" ? 0.5 : 0.05)) continue;
      const P = [V[3 * v], V[3 * v + 1], V[3 * v + 2]], base = baseName(seg);
      if (TRIM[base]) {
        const child = { Upperarm: "Forearm", Forearm: "Hand", Thigh: "Calf", Calf: "Foot" }[base], j0 = B[TI[seg]], j1 = B[TI[seg.slice(0, 2) + child]];
        const ax = sub(j1, j0), L = len(ax);
        if (dot(sub(P, j0), ax) / L < TRIM[base] * L) continue;
      }
      (out[seg] ||= []).push(P);
    }
    return out;
  }
  function pca(P) {
    const n = P.length, c = [0, 0, 0];
    for (const p of P) for (let k = 0; k < 3; k++) c[k] += p[k] / n;
    const C = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (const p of P) { const d = sub(p, c); for (let r = 0; r < 3; r++) for (let s = 0; s < 3; s++) C[3 * r + s] += (d[r] * d[s]) / n; }
    // Jacobi eigen-decomposition (3x3 symmetric)
    let A = C.slice(), Vv = I3();
    for (let sweep = 0; sweep < 30; sweep++) {
      for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
        const apq = A[3 * p + q];
        if (Math.abs(apq) < 1e-15) continue;
        const th = (A[3 * q + q] - A[3 * p + p]) / (2 * apq), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), cs = 1 / Math.sqrt(t * t + 1), sn = t * cs;
        const G = I3(); G[3 * p + p] = cs; G[3 * q + q] = cs; G[3 * p + q] = sn; G[3 * q + p] = -sn;
        A = mm(mt(G), mm(A, G)); Vv = mm(Vv, G);
      }
    }
    const ev = [0, 1, 2].map((i) => ({ l: A[4 * i], v: [Vv[i], Vv[3 + i], Vv[6 + i]] })).sort((a, b) => b.l - a.l);
    return { c, ev };
  }
  // spheres on the segment's medial axis/plane, radius = distance to the nearest skin point,
  // greedy coverage of the skin points
  function fitSpheres(P, k, frontal = false) {
    if (!k || P.length < 12) return [];
    const { c, ev } = pca(P);
    // trunk segments: medial surface = the frontal plane (lateral x vertical), whatever PCA says
    // about a squat point band; limbs: the principal axis
    const e1 = frontal ? [1, 0, 0] : ev[0].v, e2 = frontal ? [0, 1, 0] : ev[1].v, elong = !frontal && ev[0].l > 4 * ev[1].l;
    const proj = (p, e) => dot(sub(p, c), e);
    const r1 = P.map((p) => proj(p, e1)), r2 = P.map((p) => proj(p, e2));
    const lo1 = Math.min(...r1) * 0.9, hi1 = Math.max(...r1) * 0.9, lo2 = Math.min(...r2) * 0.8, hi2 = Math.max(...r2) * 0.8;
    const cands = [], step = 0.01;
    for (let a = lo1; a <= hi1; a += step)
      if (elong) cands.push(add(c, scl(e1, a)));
      else for (let b = lo2; b <= hi2; b += step) cands.push(add(add(c, scl(e1, a)), scl(e2, b)));
    const rad = cands.map((x) => { let m = Infinity; for (const p of P) { const d = len(sub(p, x)); if (d < m) m = d; } return m; });
    const covered = new Uint8Array(P.length), out = [];
    for (let it = 0; it < k; it++) {
      let best = -1, bestScore = 0;
      for (let i = 0; i < cands.length; i++) {
        if (rad[i] < 0.012) continue;
        let s = 0;
        const lim = rad[i] * 1.25;
        for (let j = 0; j < P.length; j++) if (!covered[j] && len(sub(P[j], cands[i])) <= lim) s++;
        if (s > bestScore) { bestScore = s; best = i; }
      }
      if (best < 0) break;
      out.push({ c: cands[best], r: rad[best] });
      const lim = rad[best] * 1.25;
      for (let j = 0; j < P.length; j++) if (len(sub(P[j], cands[best])) <= lim) covered[j] = 1;
    }
    return out;
  }

  // ------------------------------------------------------------------ bike surfaces
  function decodeInt8(b64) {
    const bin = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
    const a = new Int8Array(bin.length);
    for (let i = 0; i < bin.length; i++) a[i] = (bin.charCodeAt(i) << 24) >> 24;
    return a;
  }
  function createSurfaces(S) {
    const F = S.sdf, f = decodeInt8(F.b64), [NX, NY, NZ] = F.dims, LO = F.originM, C = F.cellM, far = F.clampMm[1] / 1000;
    // signed distance (m) + gradient (analytic trilinear) at a bike-frame point
    function sdf(p, g) {
      const x = (p[0] - LO[0]) / C, y = (p[1] - LO[1]) / C, z = (p[2] - LO[2]) / C;
      if (x < 0 || y < 0 || z < 0 || x >= NX - 1 || y >= NY - 1 || z >= NZ - 1) { if (g) { g[0] = 0; g[1] = 0; g[2] = 1; } return far; }
      const i = x | 0, j = y | 0, k = z | 0, tx = x - i, ty = y - j, tz = z - k, n0 = i + NX * (j + NY * k);
      const c000 = f[n0], c100 = f[n0 + 1], c010 = f[n0 + NX], c110 = f[n0 + NX + 1];
      const n1 = n0 + NX * NY, c001 = f[n1], c101 = f[n1 + 1], c011 = f[n1 + NX], c111 = f[n1 + NX + 1];
      const c00 = c000 + (c100 - c000) * tx, c10 = c010 + (c110 - c010) * tx, c01 = c001 + (c101 - c001) * tx, c11 = c011 + (c111 - c011) * tx;
      const c0 = c00 + (c10 - c00) * ty, c1 = c01 + (c11 - c01) * ty;
      if (g) {
        const dx0 = (c100 - c000) * (1 - ty) + (c110 - c010) * ty, dx1 = (c101 - c001) * (1 - ty) + (c111 - c011) * ty;
        g[0] = dx0 * (1 - tz) + dx1 * tz;
        g[1] = (c10 - c00) * (1 - tz) + (c11 - c01) * tz;
        g[2] = c1 - c0;
        const l = Math.hypot(g[0], g[1], g[2]) || 1;
        g[0] /= l; g[1] /= l; g[2] /= l;
      }
      return (c0 + (c1 - c0) * tz) / 1000;
    }
    return { sdf, pegs: S.pegs, grips: S.grips, references: S.references, raw: S };
  }

  // ------------------------------------------------------------------ the rider
  function createRider(ch, surfacesJson, opts = {}) {
    const M = buildModel(ch);
    M.spec.limitFailsafe = 0.35; // rad past the hard range: only a numerical failsafe, the passive stops act first
    const body = MB.createArticulatedBody(M.spec), ikb = MB.createArticulatedBody(M.spec);
    const SURF = createSurfaces(surfacesJson), L = M.links, H = M.hinges, NH = H.length, TI = M.TI, B = M.B;
    const hingeOfLink = new Int32Array(L.length).fill(-1);
    H.forEach((h, i) => (hingeOfLink[h.link] = i));
    const hingeIndex = Object.fromEntries(H.map((h, i) => [h.id, i]));
    // character <-> bike frames: bike body X right, Y forward, Z up; M2B maps master (rest) axes
    // onto the bike's (anatomical right/forward/up from the character's frame note)
    const Fr = ch.frame, right = scl(Fr.left, -1);
    const M2B = [right[0], right[1], right[2], Fr.forward[0], Fr.forward[1], Fr.forward[2], Fr.up[0], Fr.up[1], Fr.up[2]];

    // ---- collision spheres (link-local = master offsets from the joint)
    const segPts = segmentPoints(ch), spheres = [];
    for (const j of PHYS) {
      const pts = segPts[j] || [], k = PARTS[baseName(j)] ?? 0;
      for (const s of fitSpheres(pts, k, ["Hip", "Spine01", "Spine02"].includes(j))) {
        const sp = { link: M.linkOf[j], seg: j, c: sub(s.c, B[TI[j]]), r: s.r, kind: "body" };
        if (baseName(j) === "Thigh") { const kj = sub(B[TI[j.slice(0, 2) + "Calf"]], B[TI[j]]); sp.proximal = dot(sp.c, kj) / dot(kj, kj) < 0.6; }
        spheres.push(sp);
      }
    }
    // knees (the blend region the segment filter leaves out, and the tank-grip contact): a sphere
    // at the knee joint, radius = median horizontal distance of the skin within +-3 cm of it
    for (const S of ["L", "R"]) {
      const kj = B[TI[S + "_Calf"]], V = ch.vrest, d = [];
      for (let v = 0; v < ch.nv; v++) {
        const p = [V[3 * v], V[3 * v + 1], V[3 * v + 2]];
        if (Math.abs(p[1] - kj[1]) < 0.03 && Math.hypot(p[0] - kj[0], p[2] - kj[2]) < 0.09) d.push(Math.hypot(p[0] - kj[0], p[2] - kj[2]));
      }
      d.sort((a, b) => a - b);
      if (d.length > 8) spheres.push({ link: M.linkOf[S + "_Calf"], seg: S + "_Calf", c: [0, 0, 0], r: d[d.length >> 1] * 0.95, kind: "body", at: "knee" });
    }
    // hand grip frame: bar across the palm between the MCP line and the wrist, volar side
    const hand = {};
    for (const S of ["L", "R"]) {
      const wr = B[TI[S + "_Hand"]], ix = B[TI[S + "_Index1"]], pk = B[TI[S + "_Pinky1"]], mid = scl(add(ix, pk), 0.5);
      const axis = unit(sub(pk, ix)), along = unit(sub(mid, wr));
      let volar = unit(cross(along, axis));
      const thumb = sub(B[TI[S + "_Thumb1"]], wr);
      if (dot(volar, thumb) < 0) volar = scl(volar, -1); // the thumb sits on the palm side of the MCP line
      const grip = add(add(scl(mid, 0.7), scl(wr, 0.3)), scl(volar, 0.03));
      hand[S] = { link: M.linkOf[S + "_Hand"], p: sub(grip, wr), axis, volar };
      spheres.push({ link: M.linkOf[S + "_Hand"], seg: S + "_Hand", c: sub(grip, wr), r: 0.022, kind: "palm" });
    }
    // foot soles: a row of sole spheres from the heel to the toe tips on her rest sole plane (the
    // ground in the rest pose), ball = under the MTP joints; the sole's extent comes from the
    // foot segment's skin points
    const foot = {};
    for (const S of ["L", "R"]) {
      const an = B[TI[S + "_Foot"]], mtp = B[TI[S + "_ToeBase"]], fp = segPts[S + "_Foot"] || [[0, 0, 0]];
      const soleY = Math.min(...fp.map((p) => p[1]));
      const ball = [mtp[0], soleY, mtp[2]], zs = fp.map((p) => p[2]), heelZ = Math.max(...zs), toeZ = Math.min(...zs);
      const heel = [an[0], soleY, heelZ - 0.02], toe = [mtp[0] + 0.3 * (mtp[0] - an[0]), soleY, toeZ + 0.018];
      const rs = 0.018;
      foot[S] = { link: M.linkOf[S + "_Foot"], ball: sub(ball, an), heel: sub(heel, an), toe: sub(toe, an), forward: unit(sub(ball, heel)) };
      const row = [["heel", heel], ["mid", add(scl(heel, 0.45), scl(ball, 0.55))], ["ball", ball], ["toe", toe]];
      for (const [at, pt] of row) spheres.push({ link: M.linkOf[S + "_Foot"], seg: S + "_Foot", c: sub(add(pt, [0, rs, 0]), an), r: rs, kind: "sole", at });
    }
    function mkSphere(s) {
      s.k = s.kind === "sole" ? PRIORS.pegK : PRIORS.tissueK * s.r * (s.at === "front" ? PRIORS.softTissueScale : 1);
      s.cN = s.kind === "sole" ? PRIORS.pegC : s.k * PRIORS.tissueTau;
      s.bike = { on: false, anchor: null, F: [0, 0, 0], x: null, n: null, pen: 0, where: "" };
      s.ground = { on: false, anchor: null, F: [0, 0, 0] };
      s.peg = { on: false, anchor: null, F: [0, 0, 0], side: null };
      return s;
    }
    for (const s of spheres) mkSphere(s);

    // ---- state
    const R = {
      model: M, body, ikb, spheres, hand, foot, surfaces: SURF, M2B, priors: PRIORS,
      qT: new Float64Array(L.length), qdT: new Float64Array(L.length), tauFF: new Float64Array(L.length), tauVF: new Float64Array(L.length),
      activation: 0.5, servo: true, time: 0,
      grips: { L: mkGrip("L"), R: mkGrip("R") },
      last: { forces: [], bikeWrench: null },
      telemetry: {},
    };
    function mkGrip(S) {
      const g = S === "L" ? SURF.grips.left : SURF.grips.right;
      return { side: S, held: true, want: true, geom: g, tOff: 0, F: [0, 0, 0], T: [0, 0, 0], overloadS: 0, twist0: null };
    }

    // ---- bike-frame helpers (the bike adapter supplies p, R (world<-body), v, w (world), steer, steerRate, pivot, axis)
    const toBikeFrame = (bk, xw) => mtv(bk.R, sub(xw, bk.p));
    const bikeToWorld = (bk, xb) => add(bk.p, mv(bk.R, xb));
    const bikePointVel = (bk, xw) => add(bk.v, cross(bk.w, sub(xw, bk.p)));
    // grip centre / axis on the steered bars (body frame): rotate about the steering axis by the steer angle
    function gripBody(bk, g) {
      const Rs = axisAngle(bk.axis, bk.steer), c = add(bk.pivot, mv(Rs, sub(g.geom.center, bk.pivot)));
      return { c, a: mv(Rs, g.geom.axis), Rs };
    }
    function steerPointVel(bk, xw) { // world velocity of a point fixed to the steered bars
      const aw = mv(bk.R, bk.axis), pw = bikeToWorld(bk, bk.pivot);
      return add(bikePointVel(bk, xw), scl(cross(aw, sub(xw, pw)), bk.steerRate));
    }

    // ------------------------------------------------------------------ placement (initial pose)
    function setBase(b, pos, Rw) { b.p = pos.slice(); b.R = Rw.slice(); }
    // pelvis pose on the bike from posture parameters (bike frame): Hip-joint position + orientation
    R.pelvisPoseBike = (P = {}) => {
      const pitch = (P.pelvisPitchDeg ?? 18) * DEG, roll = (P.pelvisRollDeg ?? 0) * DEG, yaw = (P.pelvisYawDeg ?? 0) * DEG;
      const Rb = mm(Rz(yaw), mm(Ry(roll), mm(Rx(-pitch), M2B)));
      const pos = [P.x ?? 0, P.y ?? -0.3, P.z ?? 0.245];
      return { pos, R: Rb };
    };

    // ------------------------------------------------------------------ damped least-squares IK
    // tasks: {type:"pos", link, local, target(world), w} | {type:"dir", link, local(dir), target(world dir), w}
    //        | {type:"rot", link, target(world R), w}; dofs: hinge indices; pref: hinge -> [q, weight]
    function ikSolve(b, tasks, dofs, pref, iters = 6, mu = 1e-4, prefScale = 1) {
      const n = dofs.length, locked = new Uint8Array(n);
      // objective: weighted task error + preference penalty (what the step minimises)
      const cost = () => {
        let c = 0;
        for (const t of tasks) {
          if (t.type === "pos") { const e = sub(t.target, b.toWorld(t.link, t.local)); c += t.w * dot(e, e); }
          else if (t.type === "dir") { const e = cross(mv(b.Rw[t.link], t.local), t.target); c += t.w * dot(e, e); }
          else { const e = logSO3(mm(t.target, mt(b.Rw[t.link]))); c += t.w * dot(e, e); }
        }
        if (pref) for (let i = 0; i < n; i++) { const pr = pref[dofs[i]]; if (pr) { const d = b.q[H[dofs[i]].link] - pr[0]; c += prefScale * pr[1] * d * d; } }
        return c;
      };
      b.kinematics();
      let c0 = cost();
      const q0 = new Float64Array(n);
      for (let it = 0; it < iters; it++) {
        const rows = [], errs = [], ws = [];
        for (const t of tasks) {
          if (t.type === "pos") {
            const x = b.toWorld(t.link, t.local), e = sub(t.target, x);
            for (let a = 0; a < 3; a++) { rows.push({ t, a, x }); errs.push(e[a]); ws.push(t.w); }
          } else if (t.type === "dir") {
            const u = mv(b.Rw[t.link], t.local), e = cross(u, t.target);
            for (let a = 0; a < 3; a++) { rows.push({ t, a, u, rot: true }); errs.push(e[a]); ws.push(t.w); }
          } else {
            const e = logSO3(mm(t.target, mt(b.Rw[t.link])));
            for (let a = 0; a < 3; a++) { rows.push({ t, a, rot: true }); errs.push(e[a]); ws.push(t.w); }
          }
        }
        const m = rows.length, Jm = new Float64Array(m * n);
        for (let c = 0; c < n; c++) {
          const h = H[dofs[c]], li = h.link, aw = mv(b.Rw[li], L[li].axis), o = b.ow[li];
          for (let r = 0; r < m; r++) {
            const row = rows[r];
            if (!isAncestor(li, row.t.link)) continue;
            let v;
            if (row.u) v = aw[row.a] - dot(aw, row.u) * row.u[row.a]; // rotation about u does not move u
            else if (row.rot) v = aw[row.a];
            else v = cross(aw, sub(row.x, o))[row.a];
            Jm[r * n + c] = v;
          }
        }
        let dq = null;
        // active set: a joint at a limit that the step pushes further out is taken out and the
        // step recomputed (twice at most)
        locked.fill(0);
        for (let pass = 0; pass < 3; pass++) {
          const A = new Float64Array(n * n), g = new Float64Array(n);
          for (let r = 0; r < m; r++) for (let i = 0; i < n; i++) {
            const ji = locked[i] ? 0 : Jm[r * n + i];
            if (!ji) continue;
            g[i] += ji * ws[r] * errs[r];
            for (let k = 0; k < n; k++) if (!locked[k]) A[i * n + k] += ji * ws[r] * Jm[r * n + k];
          }
          for (let i = 0; i < n; i++) {
            const li = H[dofs[i]].link, pr = pref?.[dofs[i]];
            A[i * n + i] += mu + (locked[i] ? 1 : 0);
            if (pr && !locked[i]) { A[i * n + i] += prefScale * pr[1]; g[i] += prefScale * pr[1] * (pr[0] - b.q[li]); }
          }
          dq = solveSym(A, g, n);
          let changed = false;
          for (let i = 0; i < n; i++) {
            if (locked[i]) { dq[i] = 0; continue; }
            const h = H[dofs[i]], q = b.q[h.link];
            if ((q >= h.hi - 1e-6 && dq[i] > 0) || (q <= h.lo + 1e-6 && dq[i] < 0)) { locked[i] = 1; changed = true; }
          }
          if (!changed) break;
        }
        let maxStep = 0;
        for (let i = 0; i < n; i++) maxStep = Math.max(maxStep, Math.abs(dq[i]));
        let s = maxStep > 0.35 ? 0.35 / maxStep : 1;
        for (let i = 0; i < n; i++) q0[i] = b.q[H[dofs[i]].link];
        // backtracking: accept the step only if the objective goes down
        let ok = false;
        for (let ls = 0; ls < 5 && !ok; ls++, s *= 0.5) {
          for (let i = 0; i < n; i++) { const h = H[dofs[i]]; b.q[h.link] = clamp(q0[i] + dq[i] * s, h.lo, h.hi); }
          b.kinematics();
          const c1 = cost();
          if (c1 <= c0) { c0 = c1; ok = true; }
        }
        if (!ok) { for (let i = 0; i < n; i++) b.q[H[dofs[i]].link] = q0[i]; b.kinematics(); break; }
      }
      b.kinematics();
    }
    // ancestor test on the link tree (link a moves link t?)
    const ancestorCache = new Map();
    function isAncestor(a, t) {
      const key = a * 4096 + t;
      let r = ancestorCache.get(key);
      if (r === undefined) { r = false; for (let x = t; x >= 0; x = L[x].parent) if (x === a) { r = true; break; } ancestorCache.set(key, r); }
      return r;
    }
    function solveSym(A, b, n) { // Gaussian elimination with partial pivoting
      const M2 = Float64Array.from(A), x = Float64Array.from(b);
      for (let c = 0; c < n; c++) {
        let p = c;
        for (let r = c + 1; r < n; r++) if (Math.abs(M2[r * n + c]) > Math.abs(M2[p * n + c])) p = r;
        if (p !== c) { for (let k = 0; k < n; k++) { const t = M2[c * n + k]; M2[c * n + k] = M2[p * n + k]; M2[p * n + k] = t; } const t = x[c]; x[c] = x[p]; x[p] = t; }
        const d = M2[c * n + c] || 1e-12;
        for (let r = c + 1; r < n; r++) { const f = M2[r * n + c] / d; if (!f) continue; for (let k = c; k < n; k++) M2[r * n + k] -= f * M2[c * n + k]; x[r] -= f * x[c]; }
      }
      for (let c = n - 1; c >= 0; c--) { let s = x[c]; for (let k = c + 1; k < n; k++) s -= M2[c * n + k] * x[k]; x[c] = s / (M2[c * n + c] || 1e-12); }
      return x;
    }
    const chain = (prefixes) => H.map((h, i) => (prefixes.some((p) => h.joint === p) ? i : -1)).filter((i) => i >= 0);
    const CH = {
      spine: chain(["Spine01", "Spine02"]), neck: chain(["NeckTwist01", "Head"]),
      armL: chain(["L_Clavicle", "L_Upperarm", "L_Forearm", "L_Hand"]), armR: chain(["R_Clavicle", "R_Upperarm", "R_Forearm", "R_Hand"]),
      legL: chain(["L_Thigh", "L_Calf", "L_Foot"]), legR: chain(["R_Thigh", "R_Calf", "R_Foot"]),
    };
    R.chains = CH;
    // knee flexion and ankle dorsiflexion are what would prop the pelvis up off the seat: relaxed
    // when seated. The hips stay at stance gain (they hold the pelvis's orientation against the
    // thighs), as do the other leg hinges (they clamp the bike sideways with the knees)
    const legHinges = CH.legL.concat(CH.legR).filter((i) => /Knee\.flexionExtension|Ankle\.dorsiPlantarflexion/.test(H[i].id));
    const hipSideHinges = CH.legL.concat(CH.legR).filter((i) => /Hip\.(abductionAdduction|axialRotation)/.test(H[i].id));
    // her upper body (trunk, head, arms): what the spine carries above the pelvis
    const upperKg = L.reduce((m, l, i) => m + (isAncestor(H[CH.spine[0]].link, i) ? l.mass : 0), 0);
    const bodyWeightN = L.reduce((m, l) => m + l.mass, 0) * 9.81;
    // preferred (comfortable riding) joint angles for the IK regularisation, degrees
    const PREF = {
      // trunk: the chest target is exact, preferences only split it between the two joints
      "spine01.flexionExtension": [14, 0.01], "spine02.flexionExtension": [14, 0.01], "spine01.lateralBend": [0, 0.01], "spine02.lateralBend": [0, 0.01],
      "spine01.axialRotation": [0, 0.02], "spine02.axialRotation": [0, 0.02], "neck.axialRotation": [0, 0.05], "head.turn": [0, 0.05],
      "neck.flexionExtension": [-20, 0.05], "head.nod": [-10, 0.05], "neck.lateralBend": [0, 0.05], "head.tilt": [0, 0.05],
      "leftClavicle.protractionRetraction": [12, 0.08], "rightClavicle.protractionRetraction": [12, 0.08], "leftClavicle.elevationDepression": [0, 0.3], "rightClavicle.elevationDepression": [0, 0.3],
      // shoulder axial rotation is the one Semantic51 pair whose right axis is the plain mirror of
      // the left (not the negated mirror): the same anatomical rotation has opposite signs
      "leftShoulder.axialRotation": [40, 0.05], "rightShoulder.axialRotation": [-40, 0.05], "leftShoulder.abductionAdduction": [-35, 0.03], "rightShoulder.abductionAdduction": [-35, 0.03],
      "leftElbow.flexionExtension": [30, 0.02], "rightElbow.flexionExtension": [30, 0.02], "leftForearm.pronationSupination": [30, 0.05], "rightForearm.pronationSupination": [30, 0.05],
      "leftWrist.flexionExtension": [0, 0.08], "rightWrist.flexionExtension": [0, 0.08], "leftWrist.radialUlnarDeviation": [0, 0.08], "rightWrist.radialUlnarDeviation": [0, 0.08],
      "leftHip.axialRotation": [0, 0.1], "rightHip.axialRotation": [0, 0.1], "leftHip.abductionAdduction": [8, 0.02], "rightHip.abductionAdduction": [8, 0.02],
      "leftKnee.axialRotation": [0, 0.3], "rightKnee.axialRotation": [0, 0.3], "leftAnkle.axialRotation": [0, 0.2], "rightAnkle.axialRotation": [0, 0.2],
      "leftAnkle.inversionEversion": [0, 0.1], "rightAnkle.inversionEversion": [0, 0.1], "leftAnkle.dorsiPlantarflexion": [-5, 0.3], "rightAnkle.dorsiPlantarflexion": [-5, 0.3],
    };
    const prefMap = {};
    for (const [id, [deg, w]] of Object.entries(PREF)) if (id in hingeIndex) prefMap[hingeIndex[id]] = [deg * DEG, w];
    R.pref = prefMap;

    // posture solve for given world targets (pelvis pose, chest/head orientation, hand grips, feet)
    // on the IK copy; returns nothing, leaves the joint targets in ikb.q
    // starting guess for a cold solve (typical riding angles, degrees): only a seed for the
    // iterative IK, which is otherwise warm-started from its previous solution
    const SEED = {
      "leftHip.flexionExtension": 95, "rightHip.flexionExtension": 95, "leftHip.abductionAdduction": 12, "rightHip.abductionAdduction": 12,
      "leftKnee.flexionExtension": 110, "rightKnee.flexionExtension": 110, "leftAnkle.dorsiPlantarflexion": 0, "rightAnkle.dorsiPlantarflexion": 0,
      "leftShoulder.flexionExtension": 70, "rightShoulder.flexionExtension": 70, "leftShoulder.abductionAdduction": -25, "rightShoulder.abductionAdduction": -25,
      "leftElbow.flexionExtension": 25, "rightElbow.flexionExtension": 25, "spine01.flexionExtension": 12, "spine02.flexionExtension": 12,
      "leftShoulder.axialRotation": 40, "rightShoulder.axialRotation": -40,
    };
    R.seedIK = () => { ikb.q.fill(0); for (const [id, deg] of Object.entries(SEED)) if (id in hingeIndex) ikb.q[H[hingeIndex[id]].link] = deg * DEG; };
    R.seedIK();
    function solvePosture(T, iters = 1) {
      setBase(ikb, T.pelvis.p, T.pelvis.R);
      const pref = prefMap;
      if (T.chest) {
        // spine: chest orientation, split evenly between the two lumbar/thoracic joints
        solveClear([{ type: "rot", link: M.linkOf.Spine02, target: T.chest, w: 1 }], CH.spine, 5 * iters, T.bike, 3, 4, TRUNK_CLEAR);
      }
      if (T.head) ikSolve(ikb, [{ type: "rot", link: M.linkOf.Head, target: T.head, w: 1 }], CH.neck, pref, 4 * iters);
      for (const S of ["L", "R"]) {
        const tH = T.hands?.[S];
        if (tH) {
          // weights: metres vs radians (1 cm of position error ~ 10 deg of preference)
          const tasks = [{ type: "pos", link: hand[S].link, local: hand[S].p, target: tH.p, w: 100 }];
          if (tH.axis) tasks.push({ type: "dir", link: hand[S].link, local: hand[S].axis, target: tH.axis, w: 2 });
          if (tH.volar) tasks.push({ type: "dir", link: hand[S].link, local: hand[S].volar, target: tH.volar, w: 0.4 });
          solveClear(tasks, S === "L" ? CH.armL : CH.armR, 8 * iters, T.bike);
        }
        const tF = T.feet?.[S];
        if (tF) {
          const tasks = [{ type: "pos", link: foot[S].link, local: foot[S].ball, target: tF.p, w: 100 }];
          if (tF.forward) tasks.push({ type: "dir", link: foot[S].link, local: foot[S].forward, target: tF.forward, w: tF.forwardW ?? 0.3 });
          if (tF.up) tasks.push({ type: "dir", link: foot[S].link, local: [0, 1, 0], target: tF.up, w: 2 });
          if (tF.knee) tasks.push({ type: "pos", link: M.linkOf[S + "_Calf"], local: [0, 0, 0], target: tF.knee, w: 5 });
          solveClear(tasks, S === "L" ? CH.legL : CH.legR, 8 * iters, T.bike);
        }
      }
    }
    // chain solve with clearance: spheres carried by the chain that come within CLEAR of the bike
    // envelope get a task pushing them back out along the field's normal (targets that would
    // press a limb into the tank are not what a rider aims for; the contacts do the pressing)
    const CLEAR = 0.004, TRUNK_CLEAR = 0.012, SEAT_SINK = 0.008;
    const clearSets = new Map();
    function solveClear(tasks, dofs, iters, bk, passes = 3, passIters = 4, margin = CLEAR) {
      // cold solves reach the position first (preferences can hold a chain in a poor basin), then
      // settle with the preferences, directions and clearance
      if (iters > 8) ikSolve(ikb, tasks.filter((t) => t.type === "pos"), dofs, prefMap, 8, 1e-4, 0.1);
      ikSolve(ikb, tasks, dofs, prefMap, iters);
      if (!bk) return;
      let mine = clearSets.get(dofs);
      if (!mine) {
        const links = new Set(dofs.map((i) => H[i].link));
        mine = spheres.filter((s) => s.kind !== "palm" && s.kind !== "sole" && s.at !== "sit" && [...links].some((l) => isAncestor(l, s.link)));
        clearSets.set(dofs, mine);
      }
      for (let pass = 0; pass < passes; pass++) {
        const extra = [];
        for (const s of mine) {
          const cw = ikb.toWorld(s.link, s.c), g = [0, 0, 1], cb = toBikeFrame(bk, cw), d = SURF.sdf(cb, g);
          // the thighs rest on the seat: that is contact (tissue compression), not something to
          // steer away from; against the tank flanks they are kept clear
          if (s.seg.endsWith("Thigh") && cb[1] < -0.24 && g[2] > 0.5) continue;
          // only near the surface: deep inside the envelope the field's gradient points to the
          // nearest exit, which is not where a limb should go
          if (d < s.r + margin && d > s.r - 0.035) extra.push({ type: "pos", link: s.link, local: s.c, target: add(cw, scl(mv(bk.R, g), Math.min(0.02, s.r + margin - d))), w: 40 });
        }
        if (!extra.length) break;
        ikSolve(ikb, tasks.concat(extra), dofs, prefMap, passIters);
      }
    }
    R.solvePosture = solvePosture;
    R._ikSolve = ikSolve;

    // ------------------------------------------------------------------ sitting surface from the skin
    // What she sits on is her own skin under the pelvis: the buttocks and the gluteal fold, which
    // the segment purity rule leaves out (it blends Pelvis with the thigh twists). In the rest
    // pose, the lowest band of that skin behind the hip joints is the sitting surface (it rides
    // on the pelvis, like the ischial tuberosities under it): four spheres tangent to it from
    // inside, left/right x front/back.
    function addSittingSpheres() {
      const { indptr, indices, data, sum } = ch.weights, CN = ch.clusters.names, V = ch.vrest;
      const hipJ = B[TI.L_Thigh][1], root = B[TI.Hip], pts = [];
      for (let v = 0; v < ch.nv; v++) {
        let dom = -1, w = 0;
        for (let k = indptr[v]; k < indptr[v + 1]; k++) if (data[k] > w) { w = data[k]; dom = indices[k]; }
        if (CN[dom] !== "Pelvis" || w / (sum[v] || 1) < 0.3) continue;
        const p = [V[3 * v], V[3 * v + 1], V[3 * v + 2]];
        if (p[1] > hipJ || p[2] < root[2] || Math.abs(p[0]) > 0.11) continue; // below the hip joints, behind the root
        pts.push(p);
      }
      if (pts.length < 20) return 0;
      const ymin = Math.min(...pts.map((p) => p[1])), band = pts.filter((p) => p[1] < ymin + 0.03);
      const zmid = band.reduce((a, p) => a + p[2], 0) / band.length, r = 0.04;
      let n = 0;
      for (const sx of [-1, 1])
        for (const back of [false, true]) {
          const g = band.filter((p) => Math.sign(p[0] || 1) === sx && (p[2] >= zmid) === back);
          if (g.length < 3) continue;
          const c = [0, 1, 2].map((k) => g.reduce((a, p) => a + p[k], 0) / g.length);
          spheres.push(mkSphere({ link: M.linkOf.Hip, seg: "Hip", c: sub([c[0], c[1] + r, c[2]], root), r, kind: "body", at: "sit" }));
          n++;
        }
      return n;
    }

    // The front of the pelvis (lower abdomen and pubic region, what rests against the tank's rear
    // face) is the same kind of blend area. Spheres tangent from inside to her rest-pose skin along
    // the front, from the crotch up to the Spine01 joint, in three columns; each is shrunk until no
    // skin vertex lies inside it (it stays within her body).
    function addPelvisFrontSpheres() {
      const { indptr, indices, data, sum } = ch.weights, CN = ch.clusters.names, V = ch.vrest;
      const root = B[TI.Hip], top = B[TI.Spine01][1], pts = [];
      for (let v = 0; v < ch.nv; v++) {
        let dom = -1, w = 0;
        for (let k = indptr[v]; k < indptr[v + 1]; k++) if (data[k] > w) { w = data[k]; dom = indices[k]; }
        const cn = CN[dom];
        if ((cn !== "Pelvis" && cn !== "Waist") || w / (sum[v] || 1) < 0.3) continue;
        const p = [V[3 * v], V[3 * v + 1], V[3 * v + 2]];
        if (p[2] > root[2] - 0.02 || p[1] > top || Math.abs(p[0]) > 0.08) continue; // in front of the root
        pts.push(p);
      }
      if (pts.length < 20) return 0;
      const ymin = Math.min(...pts.map((p) => p[1])), made = [];
      const clearOfSkin = (c, r) => {
        for (let v = 0; v < ch.nv; v++) {
          const dx = V[3 * v] - c[0], dy = V[3 * v + 1] - c[1], dz = V[3 * v + 2] - c[2];
          if (dx * dx + dy * dy + dz * dz < (r - 0.004) * (r - 0.004)) return false;
        }
        return true;
      };
      for (let y = ymin + 0.02; y < top - 0.01; y += 0.03)
        for (const x of [-0.04, 0, 0.04]) {
          const band = pts.filter((p) => Math.abs(p[0] - x) < 0.02 && Math.abs(p[1] - y) < 0.015);
          if (band.length < 3) continue;
          const fz = Math.min(...band.map((p) => p[2]));
          for (let r = 0.05; r >= 0.02 - 1e-9; r -= 0.005) {
            const c = [x, y, fz + r];
            if (!clearOfSkin(c, r)) continue;
            if (!made.some((m) => len(sub(m.c, c)) < 0.5 * Math.min(m.r, r))) made.push({ c, r });
            break;
          }
        }
      for (const m of made) spheres.push(mkSphere({ link: M.linkOf.Hip, seg: "Hip", c: sub(m.c, root), r: m.r, kind: "body", at: "front" }));
      return made.length;
    }

    // ------------------------------------------------------------------ where she sits
    // Seat height: the sitting spheres just touch the seat (4 mm of tissue). Fore/aft: as far
    // forward as the pelvis front reaches the tank's rear face (the 916's seat pocket ends in a
    // ~17 cm step; the crotch rests against it) while the trunk keeps TRUNK_CLEAR off the tank;
    // this is also the shortest reach to the clip-ons.
    function calibrateSeat() {
      const bk0 = { p: [0, 0, 0.64], R: I3(), v: [0, 0, 0], w: [0, 0, 0], steer: 0, steerRate: 0, pivot: [0, 0.438, 0.217], axis: [0, -0.418, 0.908] };
      PL.gFilt = [0, 0, -9.81]; PL.gFF = [0, 0, -9.81];
      // pelvis spheres against the seat (field normal up) set the height, against the tank's rear
      // face (normal backwards) the fore/aft position
      const pelvis = spheres.filter((s) => s.link === M.linkOf.Hip), trunk = spheres.filter((s) => s.seg === "Spine01" || s.seg === "Spine02");
      const clearance = (set) => { let m = Infinity; for (const sp of set) m = Math.min(m, SURF.sdf(toBikeFrame(bk0, ikb.toWorld(sp.link, sp.c))) - sp.r); return m; };
      const pelvisClear = () => {
        let seat = Infinity, face = Infinity;
        for (const sp of pelvis) {
          const g = [0, 0, 1], d = SURF.sdf(toBikeFrame(bk0, ikb.toWorld(sp.link, sp.c)), g) - sp.r;
          if (g[2] >= 0.6) seat = Math.min(seat, d);
          else if (g[1] < -0.3) face = Math.min(face, d);
        }
        return [seat, face];
      };
      let log = [];
      for (let it = 0; it < 16; it++) {
        R.seedIK();
        solvePosture(planTargets(bk0), 3);
        const [cs, cp] = pelvisClear(), ct = clearance(trunk);
        log.push([PL.seatY, PL.seatZ, cs, cp, ct, PL.reachLean / DEG].map((x) => +x.toFixed(4)));
        const el = 0.5 * (ikb.q[elbowHinge[0]] + ikb.q[elbowHinge[1]]), dl = (PL.elbowPrefDeg * DEG - el) * 0.35; // reach
        const room = Math.min(cp - 0.002, ct - TRUNK_CLEAR);
        const dz = -cs - 0.004, dy = room < 0 ? room - 0.002 : Math.min(0.01, room * 0.5);
        if (Math.abs(dz) < 0.001 && Math.abs(dy) < 0.002 && Math.abs(dl) < 0.3 * DEG) break;
        PL.reachLean = clamp(PL.reachLean + dl, PL.reachLeanMaxDeg[0] * DEG, PL.reachLeanMaxDeg[1] * DEG);
        PL.seatZ += dz;
        PL.seatY = clamp(PL.seatY + dy, -0.46, -0.28);
      }
      PL.targets = null;
      return { seatY: PL.seatY, seatZ: PL.seatZ, reachLean: PL.reachLean, log };
    }

    // ------------------------------------------------------------------ servo, passive tissue, feed-forward
    // R1.5 passive tissue: tau = -k (q - q0) + A [exp(-(q-lo)/w) - exp(-(hi-q)/w)] - d qdot; the
    // end-range exponential is the joint's soft stop. Returns the torque and its stiffness (for the
    // implicit armature, so a limb driven hard into its stop stays stable).
    const passiveOut = { tau: 0, k: 0 };
    function passiveTau(h, q, qd) {
      const p = h.passive, a = clamp((q - h.lo) / p.w, -12, 30), b = clamp((h.hi - q) / p.w, -12, 30);
      const ea = Math.exp(-a), eb = Math.exp(-b);
      passiveOut.tau = -p.k * (q - p.q0) + p.A * (ea - eb) - p.d * qd;
      passiveOut.k = p.k + (p.A / p.w) * (ea + eb);
      return passiveOut;
    }
    function servoTorques(dt) {
      const b = body, act = R.activation, gain = 0.45 + 0.55 * act;
      for (let i = 0; i < NH; i++) {
        const h = H[i], li = h.link, q = b.q[li], qd = b.qd[li], P = passiveTau(h, q, qd);
        let tau = P.tau, arm = 0;
        if (R.servo && R.servoOn[i]) {
          const kp = h.kp * gain * R.servoScale[i], kd = h.kd * Math.sqrt(gain) * R.servoScale[i];
          let u = kp * (R.qT[li] - q - dt * qd) + kd * (R.qdT[li] - qd) + R.tauFF[li] + R.tauVF[li];
          const lim = h.tmax;
          if (u > lim) u = lim;
          else if (u < -lim) u = -lim;
          else arm = kd * dt + kp * dt * dt;
          tau += u;
        }
        b.tau[li] = tau;
        b.armature[li] = arm + h.passive.d * dt + P.k * dt * dt;
      }
    }
    R.servoOn = new Uint8Array(NH).fill(1);
    R.servoScale = new Float64Array(NH).fill(1);
    // feed-forward: joint torques holding every subtree against the apparent gravity with the pelvis
    // supported (RNEA, base held, no velocity terms)
    function feedForward(gApp) {
      const b = body, save = b.gravity;
      b.clearForces();
      b.gravity = gApp;
      b.applyGravity();
      // the bars' planned reaction on each hand: the arms push to produce it, the spine is
      // relieved by as much
      for (const S of ["L", "R"]) { const F = PL.handPlan[S]; if (F && R.grips[S].held) b.applyForce(hand[S].link, F, b.toWorld(hand[S].link, hand[S].p)); }
      const tau = b.inverseDynamicsStatic(false);
      b.gravity = save;
      for (let i = 0; i < L.length; i++) R.tauFF[i] = tau[i];
    }

    // ------------------------------------------------------------------ contacts
    // anchored Coulomb friction: tangential spring from the stick anchor, anchor dragged at mu N
    function frictionForce(st, x, n, vt, k, c, mu, Fn, anchorToWorld, worldToAnchor) {
      if (!st.anchor) st.anchor = worldToAnchor(x);
      const aw = anchorToWorld(st.anchor);
      let u = sub(x, aw);
      u = sub(u, scl(n, dot(u, n)));
      let Ft = sub(scl(u, -k), scl(vt, c));
      const fl = len(Ft), lim = mu * Fn;
      if (fl > lim) {
        Ft = fl > 1e-9 ? scl(Ft, lim / fl) : [0, 0, 0];
        // slide: re-anchor so that the spring alone carries the kinetic force
        st.anchor = worldToAnchor(add(x, scl(Ft, 1 / k)));
      }
      return Ft;
    }
    function applyContact(i, F, x) { body.applyForce(i, F, x); }
    const pelvisLink = M.linkOf.Hip;
    // everything the rider and the bike exert on each other this step; returns the reactions
    function contacts(bk, ground) {
      const out = [];
      const b = body;
      for (const s of spheres) {
        const cw = b.toWorld(s.link, s.c), vc = b.pointVelocity(s.link, s.c);
        // --- bike envelope (sdf in the bike frame)
        const cb = toBikeFrame(bk, cw), gb = [0, 0, 1], d = SURF.sdf(cb, gb);
        const st = s.bike;
        if (s.kind !== "sole" && d < s.r) {
          const pen = s.r - d, nw = mv(bk.R, gb), x = sub(cw, scl(nw, s.r - pen / 2));
          const vr = sub(vc, bikePointVel(bk, x)), vn = dot(vr, nw), vt = sub(vr, scl(nw, vn));
          const Fn = Math.max(0, s.k * pen - s.cN * vn);
          // (moving over on the seat, her unweighted pelvis slides: the lift-and-shift of pelvisVMC)
          const mu = cb[1] < -0.2 && cb[2] > 0.0 ? PRIORS.mu.seat * (s.link === pelvisLink ? 1 - PL.shiftSlide * (PL.shift || 0) : 1) : PRIORS.mu.bike;
          const Ft = Fn > 0 ? frictionForce(st, x, nw, vt, s.k, s.cN, mu, Fn, (a) => bikeToWorld(bk, a), (w) => toBikeFrame(bk, w)) : [0, 0, 0];
          const F = add(scl(nw, Fn), Ft);
          applyContact(s.link, F, x);
          out.push({ F: scl(F, -1), x, part: "frame" });
          st.on = true; st.F = F; st.x = x; st.pen = pen; st.where = cb[1] < -0.2 ? "seat" : cb[1] < 0.36 ? "tank" : "front";
        } else if (st.on) { st.on = false; st.anchor = null; st.F = [0, 0, 0]; st.pen = 0; }
        // --- footpegs (sole points and any leg sphere): capsule of the peg radius
        if (s.kind === "sole" || s.seg.endsWith("Foot") || s.seg.endsWith("Calf")) {
          const ps = s.peg;
          let hit = null;
          for (const side of ["left", "right"]) {
            const pg = SURF.pegs[side], ab = sub(pg.b, pg.a), t = clamp(dot(sub(cb, pg.a), ab) / dot(ab, ab), 0, 1), q = add(pg.a, scl(ab, t));
            const dv = sub(cb, q), dl = len(dv), pen = s.r + pg.radiusM - dl;
            if (pen > 0 && dl > 1e-6 && (!hit || pen > hit.pen)) hit = { pen, n: scl(dv, 1 / dl), side };
          }
          if (hit) {
            const nw = mv(bk.R, hit.n), x = sub(cw, scl(nw, s.r - hit.pen / 2));
            const vr = sub(vc, bikePointVel(bk, x)), vn = dot(vr, nw), vt = sub(vr, scl(nw, vn));
            const k = s.kind === "sole" ? PRIORS.pegK : s.k, c = s.kind === "sole" ? PRIORS.pegC : s.cN;
            const Fn = Math.max(0, k * hit.pen - c * vn);
            const mu = s.kind === "sole" ? PRIORS.mu.peg : PRIORS.mu.bike;
            const Ft = Fn > 0 ? frictionForce(ps, x, nw, vt, k, c, mu, Fn, (a) => bikeToWorld(bk, a), (w) => toBikeFrame(bk, w)) : [0, 0, 0];
            const F = add(scl(nw, Fn), Ft);
            applyContact(s.link, F, x);
            out.push({ F: scl(F, -1), x, part: "frame" });
            ps.on = true; ps.F = F; ps.side = hit.side;
          } else if (ps.on) { ps.on = false; ps.anchor = null; ps.F = [0, 0, 0]; }
        }
        // --- ground
        if (ground) {
          const gs = s.ground, gz = ground.height(cw[0], cw[1]), gn = ground.normal ? ground.normal(cw[0], cw[1]) : [0, 0, 1];
          const dz = dot(sub(cw, [cw[0], cw[1], gz]), gn), pen = s.r - dz;
          if (pen > 0) {
            const x = sub(cw, scl(gn, s.r - pen / 2)), vn = dot(vc, gn), vt = sub(vc, scl(gn, vn));
            const k = s.kind === "sole" ? PRIORS.pegK : s.k, c = s.kind === "sole" ? PRIORS.pegC : s.cN;
            const Fn = Math.max(0, k * pen - c * vn), mu = (s.kind === "sole" ? PRIORS.mu.sole : PRIORS.mu.ground) * (ground.grip ? ground.grip(cw[0], cw[1]) : 1);
            const Ft = Fn > 0 ? frictionForce(gs, x, gn, vt, k, c, mu, Fn, (a) => a, (w) => w) : [0, 0, 0];
            const F = add(scl(gn, Fn), Ft);
            applyContact(s.link, F, x);
            gs.on = true; gs.F = F;
          } else if (gs.on) { gs.on = false; gs.anchor = null; gs.F = [0, 0, 0]; }
        }
      }
      // --- grips: bilateral attachment of the palm to the grip, strength-limited
      for (const S of ["L", "R"]) {
        const g = R.grips[S], hd = hand[S];
        if (!g.held) { g.F = [0, 0, 0]; g.T = [0, 0, 0]; continue; }
        const gb = gripBody(bk, g), gc = add(gb.c, scl(gb.a, g.tOff)), cw = bikeToWorld(bk, gc), aw = mv(bk.R, gb.a);
        const pw = b.toWorld(hd.link, hd.p), vp = b.pointVelocity(hd.link, hd.p), vg = steerPointVel(bk, cw);
        const F = sub(scl(sub(cw, pw), PRIORS.gripK), scl(sub(vp, vg), PRIORS.gripC)); // on the hand
        // alignment of the hand's grasp axis with the bar (perpendicular misalignment), and a mild
        // hold about the bar (fingers wrapped)
        const ah = mv(b.Rw[hd.link], hd.axis), mis = cross(ah, aw);
        const wh = mv(b.Rw[hd.link], [b.v[hd.link][0], b.v[hd.link][1], b.v[hd.link][2]]), wb = add(bk.w, scl(mv(bk.R, bk.axis), bk.steerRate));
        const wrel = sub(wh, wb), wperp = sub(wrel, scl(aw, dot(wrel, aw)));
        let T = sub(scl(mis, PRIORS.gripRotK), scl(wperp, PRIORS.gripRotC));
        // the hand's roll about the bar is held relative to the bars (twist0: volar direction in the
        // steered-bar frame when the grip closed)
        const vol = mv(b.Rw[hd.link], hd.volar);
        if (!g.twist0) g.twist0 = mtv(gb.Rs, mtv(bk.R, vol));
        const vref = mv(bk.R, mv(gb.Rs, g.twist0)), tw = dot(cross(vol, vref), aw);
        T = add(T, scl(aw, PRIORS.gripTwistK * tw - 0.3 * dot(wrel, aw)));
        const Fm = len(F);
        g.overloadS = Fm > PRIORS.gripStrengthN ? g.overloadS + 1 : Math.max(0, g.overloadS - 1);
        if (g.overloadS > 20) { g.held = false; g.F = [0, 0, 0]; g.T = [0, 0, 0]; continue; } // the grip is torn open
        applyContact(hd.link, F, pw);
        const lh = hd.link, Tl = mtv(b.Rw[lh], T), fe = b.fext[lh];
        fe[0] += Tl[0]; fe[1] += Tl[1]; fe[2] += Tl[2];
        out.push({ F: scl(F, -1), x: cw, part: "steer" }, { T: scl(T, -1), part: "steer" });
        g.F = F; g.T = T;
      }
      return out;
    }
    R.gripWorld = (bk, S) => { const g = R.grips[S], gb = gripBody(bk, g); return { c: bikeToWorld(bk, add(gb.c, scl(gb.a, g.tOff))), a: mv(bk.R, gb.a) }; };

    // ------------------------------------------------------------------ planner (posture intent -> targets -> IK)
    // Intent (player or auto rider): hang -1..1 (right +), foreAft -1..1 (forward +), tuck -1..1
    // (sit-up -), stand 0..1. The planner turns it into targets: the pelvis relative to the seat
    // (legs carry it there), the trunk and head referenced to the world (the felt vertical, so at
    // low speed the upper body stays upright while the bike rocks under it and at speed it
    // follows the bike into the turn), hands on the grips, balls of the feet on the pegs, knees on
    // the tank. Joint targets come from the IK at plannerHz; servos track them at every step.
    const PL = (R.plan = {
      hz: 60, acc: 0, posture: { hang: 0, foreAft: 0, tuck: 0, stand: 0 }, rates: { hang: 1.8, foreAft: 2, tuck: 2, stand: 2.2 },
      seatZ: 0.239, seatY: -0.34, leanDeg: 52, pelvisPitchDeg: 8, headPitchDeg: 12,
      // reach: the trunk leans (within reachLeanMaxDeg) until the elbows keep elbowPrefDeg of bend
      // (declared prior; the 916's clip-ons are a long reach for her 0.54 m arm: seated, her
      // elbows stay nearly straight); reachLean is that correction
      elbowPrefDeg: 15, reachGain: 4, reachLean: 0, reachLeanMaxDeg: [-10, 12],
      gFilt: null, gFF: null, aFilt: [0, 0, 0], tauG: 0.6, tauFF: 0.25, lastV: null, targets: null, lookYaw: 0,
      pelvisK: [9000, 9000, 6000], pelvisC: [700, 700, 500], pelvisKr: [700, 500, 400], pelvisCr: [45, 35, 30], pegPressN: 40, vmcMaxN: 900, footK: 4000, footC: 60, footMaxN: 220, brace: 0, braceDir: 0, braceStiffen: 2,
      // hands on the clip-ons (declared priors): she leans on the bars with handSupport of her
      // upper body's felt weight (along the bike's up axis) and, braced, her arms take
      // armBraceShare of its fore/aft load; planned bar reactions enter the feed-forward
      handSupport: 0.25, armBraceShare: 1.0, braceUpN: 400, handPlan: { L: null, R: null },
      // quiet hands: feedback on her own steering torque (proportional, integral 1/s, N per hand)
      steerNeutralGain: 0.8, steerNeutralKi: 6, steerNeutralMaxN: 120,
      // seated legs are relaxed in the sagittal plane (those joint servos at a fraction of the
      // stance gains: they place the feet and knees, they do not prop the pelvis up); standing
      // legs are at full stance gain
      legGainSeated: 0.3, legGainBraced: 0.5, legBase: "actual", footLoadedTanN: 30,
      // knee grip on the tank flanks (adductors), N per knee: relaxed / added when braced
      kneeGripN: 60, kneeBraceN: 260, kneeShakeN: 220, kneeMaxN: 520, shake: 0, shakeRate: 0,
      // moving over on the seat: lift off it with the legs when the pelvis is shiftStartM..+span
      // from where she wants it (fraction of her weight taken off the seat)
      shiftStartM: 0.015, shiftSpanM: 0.03, shiftLiftFrac: 0.5, shift: 0, shiftSlide: 0.6, shiftHipGain: 0.3, shiftRates: [2.5, 1.2],
      // full hang-off: pelvis this far across the seat (the 916's seat is narrow: about half a
      // buttock off it), the trunk and head lean in further (planTargets)
      hangOffsetM: 0.09,
      // braced under braking: planned pelvis this much further forward / pitched forward
      braceForwardM: 0.02, braceForwardPitchDeg: 4,
    });
    R.intent = { hang: 0, foreAft: 0, tuck: 0, stand: 0 };
    const WUP = [0, 0, 1];
    function planTargets(bk) {
      const P = PL.posture, Rb = bk.R, W = (xb) => bikeToWorld(bk, xb);
      // pelvis (bike frame)
      const hang = P.hang, stand = P.stand;
      // braced against braking she lets herself settle forward against the tank, pelvis rolled
      // forward onto it (she does not fight to stay back: the tank, knees and arms hold her)
      const bf = PL.brace * (PL.braceDir > 0 ? 1 : 0);
      const pel = R.pelvisPoseBike({
        x: hang * PL.hangOffsetM, y: PL.seatY + P.foreAft * 0.05 + stand * 0.06 + bf * PL.braceForwardM, z: PL.seatZ + stand * 0.19 - Math.abs(hang) * 0.012,
        pelvisPitchDeg: PL.pelvisPitchDeg - stand * 14 + P.tuck * 4 + bf * PL.braceForwardPitchDeg, pelvisRollDeg: hang * 12, pelvisYawDeg: -hang * 14,
      });
      const T = { pelvis: { p: W(pel.pos), R: mm(Rb, pel.R) }, bike: bk };
      // felt vertical for posture: gravity plus the sustained turning acceleration (V x yaw rate,
      // filtered), NOT the instantaneous acceleration of the seat: a bike rocking under a rider at
      // a standstill shakes the seat but the rider keeps her trunk on the true vertical
      const up = unit(scl(PL.gFilt, -1)), ub = mtv(Rb, up), rollFelt = Math.atan2(ub[0], ub[2]);
      const wb = mtv(Rb, WUP), rollWorld = Math.atan2(wb[0], wb[2]);
      const lean = (PL.leanDeg + (P.tuck >= 0 ? P.tuck * 10 : P.tuck * 16) - stand * 22) * DEG + PL.reachLean;
      const roll = rollFelt + hang * 15 * DEG;
      T.chest = mm(Rb, mm(Rz(-hang * 10 * DEG), mm(Ry(roll), mm(Rx(-lean), M2B))));
      // head: closer to the true horizon than the trunk, eyes along the path
      const hroll = 0.55 * rollWorld + 0.45 * rollFelt + hang * 6 * DEG;
      const hpitch = (PL.headPitchDeg + P.tuck * 6 - stand * 4) * DEG;
      T.head = mm(Rb, mm(Rz(PL.lookYaw - hang * 12 * DEG), mm(Ry(hroll), mm(Rx(-hpitch), M2B))));
      T.hands = {};
      for (const S of ["L", "R"]) if (R.grips[S].held) { const g = R.gripWorld(bk, S); T.hands[S] = { p: g.c, axis: g.a, volar: mv(Rb, unit([0, 0.35, -1])) }; }
      T.feet = {};
      for (const [S, side, sx] of [["L", "left", -1], ["R", "right", 1]]) {
        const pg = SURF.pegs[side], mid = scl(add(pg.a, pg.b), 0.5), inside = sx * hang > 0;
        const ky = -0.03 + stand * 0.02, kz = 0.02 - stand * 0.1 - (inside ? Math.abs(hang) * 0.06 : 0);
        // the knee rests on the tank's flank: target = where the knee sphere meets the tank surface
        // (measured on the field); the grip itself is a force (pelvisVMC); the inside knee comes
        // off the tank when she hangs off
        let kx = kneeOnTank(sx, ky, kz) + sx * 0.005;
        if (inside) kx += sx * Math.abs(hang) * 0.12;
        T.feet[S] = { p: W([mid[0], mid[1] - 0.005, mid[2] + pg.radiusM + 0.003]), forward: mv(Rb, unit([sx * 0.2, 1, -0.15])), knee: W([kx, ky, kz]) };
      }
      return T;
    }
    const kneeSphere = spheres.find((s) => s.at === "knee");
    function kneeOnTank(sx, y, z) {
      const r = kneeSphere ? kneeSphere.r : 0.045;
      for (let x = 0.36; x > 0.05; x -= 0.002) if (SURF.sdf([sx * x, y, z]) <= r) return sx * x;
      return sx * 0.2;
    }
    // IK against the actual body: neck and arms from the actual trunk (the head keeps its world
    // target whatever the trunk does; the arms reach the grips from wherever the shoulders are),
    // spine from the actual pelvis, legs from the target pelvis (the legs carry the pelvis there)
    function solveTargets(T) {
      const b = body;
      ikb.p = b.p.slice(); ikb.R = b.R.slice();
      for (let i = 0; i < L.length; i++) ikb.q[i] = b.q[i];
      const iters = 2;
      if (T.head) ikSolve(ikb, [{ type: "rot", link: M.linkOf.Head, target: T.head, w: 1 }], CH.neck, prefMap, iters);
      for (const S of ["L", "R"]) {
        const tH = T.hands?.[S];
        if (!tH) continue;
        const tasks = [{ type: "pos", link: hand[S].link, local: hand[S].p, target: tH.p, w: 100 }, { type: "dir", link: hand[S].link, local: hand[S].axis, target: tH.axis, w: 2 }];
        if (tH.volar) tasks.push({ type: "dir", link: hand[S].link, local: hand[S].volar, target: tH.volar, w: 0.4 });
        solveClear(tasks, S === "L" ? CH.armL : CH.armR, iters, T.bike, 1, 2);
      }
      // trunk: the chest orientation, but the lower trunk keeps TRUNK_CLEAR off the tank (the belly
      // does not rest on the tank's rear; the seat carries her)
      if (T.chest) solveClear([{ type: "rot", link: M.linkOf.Spine02, target: T.chest, w: 1 }], CH.spine, 4, T.bike, 1, 3, TRUNK_CLEAR);
      // legs from the PLANNED pelvis pose: the leg servos then hold the pelvis where it should be
      // (its pitch above all: the trunk's weight would otherwise roll it forward over the thighs);
      // the task-space foot springs keep the balls of the feet on their supports whatever the
      // pelvis is doing
      // Legs from the pelvis where it is (the balls of the feet stay on their supports wherever
      // it slides: a braced rider's feet do not ride forward with her) at its PLANNED orientation:
      // the hip muscles hold the pelvis's orientation against the thighs (clamped by the seat,
      // tank and pegs). Its position is steered by forces through the knees and feet (pelvisVMC).
      {
        const pa = toBikeFrame(T.bike, b.p), pp = toBikeFrame(T.bike, T.pelvis.p);
        ikb.p = bikeToWorld(T.bike, PL.legBase === "plannedHeight" ? [pa[0], pa[1], pp[2]] : pa);
        ikb.R = T.pelvis.R.slice();
      }
      for (let i = 0; i < L.length; i++) if (!CH.spine.includes(hingeOfLink[i]) && !CH.neck.includes(hingeOfLink[i]) && !CH.armL.includes(hingeOfLink[i]) && !CH.armR.includes(hingeOfLink[i])) ikb.q[i] = b.q[i];
      for (const S of ["L", "R"]) {
        const tF = T.feet?.[S];
        if (!tF) continue;
        const tasks = [{ type: "pos", link: foot[S].link, local: foot[S].ball, target: tF.p, w: 100 }];
        if (tF.forward) tasks.push({ type: "dir", link: foot[S].link, local: foot[S].forward, target: tF.forward, w: tF.forwardW ?? 0.3 });
        if (tF.knee) tasks.push({ type: "pos", link: M.linkOf[S + "_Calf"], local: [0, 0, 0], target: tF.knee, w: 5 });
        solveClear(tasks, S === "L" ? CH.legL : CH.legR, iters, T.bike, 1, 2);
      }
      for (let i = 1; i < L.length; i++) R.qT[i] = ikb.q[i];
    }
    // Lower body (virtual-model control, nothing moves the pelvis directly):
    //  * feet: a task-space spring holds each ball of the foot on its target (tau = J^T F)
    //  * pelvis orientation: the hip servos (legs solved at the planned pelvis orientation)
    //  * pelvis position: planned vs actual (bike frame) gives a desired force Fd on the pelvis:
    //      sideways: differential knee squeeze against the tank flanks (pressing the right knee
    //        in pushes the pelvis right), the rest through the feet within the pegs' friction
    //      fore/aft: through the planted feet, within the pegs' friction
    //      vertical: only standing (the legs extend); seated, the seat carries her
    //  * knee squeeze: relaxed + braced + a clamp reflex when the bike shakes under her; the
    //    inside knee lets go when she hangs off
    //  * each supporting foot rests on its peg with about the weight of the shank and foot
    const Jcol = (link, pw, dofs) => dofs.map((i) => { const li = H[i].link, aw = mv(body.Rw[li], L[li].axis); return { li, j: cross(aw, sub(pw, body.ow[li])) }; });
    // hip hinges of each leg: the ones that move the knee (the knee's own hinges have no lever)
    const kneeDofs = { L: CH.legL.filter((i) => H[i].joint === "L_Thigh"), R: CH.legR.filter((i) => H[i].joint === "R_Thigh") };
    const kneeOut = { L: 0, R: 0 }, kneeR = spheres.find((s) => s.at === "knee")?.r ?? 0.045;
    const footLoaded = (S) => { for (const s of spheres) if (s.link === foot[S].link && ((s.peg.on && len(s.peg.F) > 30) || (s.ground.on && len(s.ground.F) > 30))) return true; return false; };
    // seated: the vertical pelvis force is only ever a pull down into the seat (when she is above
    // her planned seat height), never a lift
    const seatedPull = (Fz, ez) => (PL.posture.stand > 0.3 ? 0 : ez < 0 ? Math.max(Fz, -PL.vmcMaxN) : 0);
    function pelvisVMC(bk) {
      R.tauVF.fill(0);
      const TB = PL.targetsB;
      if (!PL.targets || !TB) return;
      const b = body, Rb = bk.R, up = mv(Rb, [0, 0, 1]);
      const eb = sub(TB.pelvis, toBikeFrame(bk, b.p)), vpb = mtv(Rb, sub(mv(b.R, [b.vb[3], b.vb[4], b.vb[5]]), bikePointVel(bk, b.p)));
      const standing = smooth01(PL.posture.stand / 0.6), stiff = 1 + PL.braceStiffen * PL.brace;
      const Fd = [0, 1, 2].map((k) => { const s = k === 1 ? 1 : stiff; return s * PL.pelvisK[k] * eb[k] - Math.sqrt(s) * PL.pelvisC[k] * vpb[k]; });
      const FzSeat = Fd[2]; // seated, only ever used as a pull down into the seat (knees)
      Fd[2] *= standing;
      // moving over on the seat (hang-off, fore/aft): seat friction pins a seated pelvis, so she
      // unweights the seat with her legs and pushes herself across through the pegs, then sits
      // back down (a rider lifts off the seat to move over)
      // (moves she makes: sideways, and fore/aft when she asks for it or is already moving over;
      // not while braced, when being pushed into the tank is not a move to make, nor while the
      // bike shakes under her and she clamps it)
      const moveErr = Math.hypot(eb[0], Math.abs(PL.posture.foreAft) > 0.05 || Math.abs(eb[0]) > PL.shiftStartM ? eb[1] : 0);
      const shiftWant = PL.posture.stand > 0.3 ? 0 : smooth01((moveErr - PL.shiftStartM) / PL.shiftSpanM) * (1 - PL.brace) * (1 - PL.shake);
      // a move is a deliberate, smooth action (not a reflex that pumps the suspension): she eases
      // into it and settles back onto the seat
      const sdt = PL.lastDt || 1 / 540;
      PL.shift = clamp(shiftWant, PL.shift - PL.shiftRates[1] * sdt, PL.shift + PL.shiftRates[0] * sdt);
      const shift = PL.shift;
      if (shift > 0) Fd[2] = Math.max(Fd[2], shift * PL.shiftLiftFrac * bodyWeightN);
      // feet on their targets
      for (const S of ["L", "R"]) {
        const tFb = TB.feet[S];
        if (!tFb) continue;
        const pw = b.toWorld(foot[S].link, foot[S].ball), vw = b.pointVelocity(foot[S].link, foot[S].ball);
        let Ff = sub(scl(sub(bikeToWorld(bk, tFb), pw), PL.footK), scl(sub(vw, bikePointVel(bk, pw)), PL.footC));
        const fl = len(Ff);
        if (fl > PL.footMaxN) Ff = scl(Ff, PL.footMaxN / fl);
        // a foot standing on its support is not dragged back to its spot along it (that would
        // push her pelvis instead): loaded, only the component across the support remains
        if (footLoaded(S)) { const Fb = mtv(Rb, Ff); Fb[1] = clamp(Fb[1], -PL.footLoadedTanN, PL.footLoadedTanN); Ff = mv(Rb, Fb); }
        for (const { li, j } of Jcol(foot[S].link, pw, S === "L" ? CH.legL : CH.legR)) R.tauVF[li] += dot(j, Ff);
      }
      // knees: squeeze and the sideways share of Fd
      const hang = PL.posture.hang;
      const N0 = (PL.kneeGripN + PL.kneeBraceN * PL.brace + PL.kneeShakeN * PL.shake) * (1 - 0.5 * PL.posture.stand);
      const off = { L: -hang > 0 ? Math.min(1, 2 * Math.abs(hang)) : 0, R: hang > 0 ? Math.min(1, 2 * Math.abs(hang)) : 0 }; // inside knee lets go
      let NL = N0 * (1 - off.L) - Fd[0] / 2, NR = N0 * (1 - off.R) + Fd[0] / 2;
      if (NL < 0) { NR -= NL; NL = 0; }
      if (NR < 0) { NL -= NR; NR = 0; }
      if (off.L >= 1) NL = 0;
      if (off.R >= 1) NR = 0;
      NL = Math.min(NL, PL.kneeMaxN); NR = Math.min(NR, PL.kneeMaxN);
      // along the flank, a gripping knee can also hold the pelvis fore/aft and pull it down into
      // the seat (never lift it): friction-limited by its squeeze
      const want = [0, Fd[1], shift > 0 ? 0 : seatedPull(FzSeat, eb[2])];
      const grippers = (NL > 1 ? 1 : 0) + (NR > 1 ? 1 : 0);
      let sideDone = 0;
      const tanDone = [0, 0, 0];
      for (const [S, N] of [["L", NL], ["R", NR]]) {
        kneeOut[S] = 0;
        if (N <= 1) continue;
        const kl = M.linkOf[S + "_Calf"], kw = b.toWorld(kl, [0, 0, 0]), d = SURF.sdf(toBikeFrame(bk, kw));
        if (d > kneeR + 0.025) continue; // only a knee on (or just off) the tank presses it
        // the squeeze is adduction: towards the bike's centre plane (not along the envelope's
        // normal, which under the tank's flanks can point up and would push her off the seat);
        // fore/aft and vertical in the flank's plane, friction-limited; the pelvis gets -Fk
        const g = [S === "L" ? -1 : 1, 0, 0];
        let t = scl(want, -1 / grippers);
        t[0] = 0;
        const touching = d < kneeR + 0.01;
        const tl = len(t), tmax = touching ? 0.8 * PRIORS.mu.bike * N : 0; // only a knee on the tank grips
        if (tl > tmax) t = tl > 1e-9 ? scl(t, tmax / tl) : [0, 0, 0];
        const Fkb = sub(t, scl(g, N));
        const Fk = mv(Rb, Fkb);
        for (const { li, j } of Jcol(kl, kw, kneeDofs[S])) R.tauVF[li] += dot(j, Fk);
        kneeOut[S] = N;
        if (touching) { sideDone += (S === "R" ? 1 : -1) * N; for (let k = 0; k < 3; k++) tanDone[k] -= t[k]; }
      }
      // the rest through the planted feet: friction-limited on the pegs (the ground, feet down)
      const legs = [];
      let Nsup = 0;
      for (const S of ["L", "R"]) {
        let n = 0, on = false;
        for (const s of spheres) if (s.link === foot[S].link) { if (s.peg.on) { on = true; n += Math.max(0, dot(s.peg.F, up)); } if (s.ground.on) { on = true; n += Math.max(0, dot(s.ground.F, up)); } }
        if (on) { legs.push(S); Nsup += n; }
      }
      if (!legs.length) { R.telemetry.vmc = { F: mv(Rb, Fd), legs: "", knees: { ...kneeOut } }; return; }
      // seated, the feet push only within the friction of what they rest with (pressing harder
      // to push her back would lift her off the seat); standing, within their whole load
      const budget = PRIORS.mu.peg * 0.8 * (standing > 0.5 || shift > 0 ? Nsup + legs.length * PL.pegPressN : legs.length * PL.pegPressN);
      let Fh = [Fd[0] - sideDone, Fd[1] - tanDone[1]];
      const hl = Math.hypot(Fh[0], Fh[1]);
      if (hl > budget) Fh = [(Fh[0] * budget) / hl, (Fh[1] * budget) / hl];
      const Fb = [Fh[0], Fh[1], Math.min(PL.vmcMaxN, Math.max(0, Fd[2]))];
      const Fw = mv(Rb, Fb);
      for (const S of legs) {
        const pw = b.toWorld(foot[S].link, foot[S].ball);
        const Fpelvis = add(scl(Fw, 1 / legs.length), scl(up, PL.pegPressN)); // the pelvis gets this; the foot pushes -that
        for (const { li, j } of Jcol(foot[S].link, pw, S === "L" ? CH.legL : CH.legR)) R.tauVF[li] -= dot(j, Fpelvis);
      }
      R.telemetry.vmc = { F: Fw, legs: legs.join(""), knees: { ...kneeOut }, want, tanDone, sideDone, Fd };
    }
    R.pelvisVMC = pelvisVMC;
    const gbFwd = (bk) => mtv(bk.R, PL.gFF)[1]; // felt load along the bike's forward axis, m/s^2
    R.planTargets = planTargets;
    R.solveTargets = solveTargets;
    // reach loop: lean the trunk (planned chest) until the IK's elbows have their preferred bend
    const elbowHinge = ["leftElbow.flexionExtension", "rightElbow.flexionExtension"].map((id) => H[hingeIndex[id]].link);
    function reach(dtp) {
      let e = 0, n = 0;
      for (const S of ["L", "R"]) if (R.grips[S].held) { e += ikb.q[elbowHinge[S === "L" ? 0 : 1]]; n++; }
      if (!n) return;
      PL.reachLean = clamp(PL.reachLean + (PL.elbowPrefDeg * DEG - e / n) * PL.reachGain * dtp, PL.reachLeanMaxDeg[0] * DEG, PL.reachLeanMaxDeg[1] * DEG);
    }
    R.reach = reach;
    R.planner = function (R_, bk, dt) {
      PL.lastDt = dt;
      // acceleration the rider's pelvis sustains (world), from its own velocity: the feed-forward
      // braces the body against sustained loads (braking, drive, cornering); transients such as
      // the bike rocking under her are left to the servos and her own inertia
      const vp = mv(body.R, [body.vb[3], body.vb[4], body.vb[5]]);
      if (PL.lastV) {
        const a = scl(sub(vp, PL.lastV), 1 / dt), k = Math.min(1, dt / 0.03);
        PL.aFilt = add(PL.aFilt, scl(sub(a, PL.aFilt), k));
      }
      PL.lastV = vp;
      const gw = sub(body.gravity, PL.aFilt);
      // sustained turning: horizontal velocity x yaw rate
      const vh = [bk.v[0], bk.v[1], 0], V = len(vh), aTurn = V > 0.5 ? scl(cross([0, 0, bk.w[2]], vh), 1) : [0, 0, 0];
      const gp = sub(body.gravity, aTurn);
      if (!PL.gFilt) { PL.gFilt = gp.slice(); PL.gFF = gw.slice(); }
      PL.gFilt = add(PL.gFilt, scl(sub(gp, PL.gFilt), Math.min(1, dt / PL.tauG)));
      PL.gFF = add(PL.gFF, scl(sub(gw, PL.gFF), Math.min(1, dt / PL.tauFF)));
      R.gApp = PL.gFF;
      // bracing: sustained deceleration (felt load forward) or drive (felt load backward)
      const gb = mtv(bk.R, PL.gFF), fwdG = gb[1] / 9.81;
      PL.brace = smooth01((Math.abs(fwdG) - 0.25) / 0.55);
      PL.braceDir = Math.sign(fwdG);
      // clamp reflex: the bike rolling quickly under her (filtered roll rate) tightens the knees
      // and raises her muscle tone
      const rollRate = Math.abs(mtv(bk.R, bk.w)[1]);
      PL.shakeRate += (rollRate - PL.shakeRate) * Math.min(1, dt / 0.3);
      PL.shake = smooth01((PL.shakeRate - 0.25) / 0.6);
      R.activation = 0.5 + 0.4 * Math.max(PL.brace, PL.shake);
      // planned bar reaction on the hands (bike axes -> world): up = leaning on the bars, back =
      // braced against braking (forward under drive)
      // The arm carries it as a strut: along the line from the grip to the shoulder (a braced
      // rider locks her arms; a push across the arm would need shoulder torque she does not
      // have), sized so its share along the needed direction is what is needed
      const held = (R.grips.L.held ? 1 : 0) + (R.grips.R.held ? 1 : 0);
      for (const S of ["L", "R"]) {
        PL.handPlan[S] = null;
        if (!R.grips[S].held) continue;
        const need = mv(bk.R, [0, (-PL.armBraceShare * PL.brace * upperKg * gb[1]) / held, (-PL.handSupport * upperKg * gb[2]) / held]);
        const nl = len(need);
        if (nl < 1) continue;
        const sh = body.toWorld(M.linkOf[S + "_Upperarm"], [0, 0, 0]), gp = body.toWorld(hand[S].link, hand[S].p), u = unit(sub(sh, gp));
        const c = dot(u, scl(need, 1 / nl));
        let mag = Math.min(nl / Math.max(0.35, c), 0.8 * PRIORS.gripStrengthN);
        // the strut must not lift her off the seat: its share along the bike's up axis stays
        // within the lean-on-the-bars support plus a braced margin
        const upB = dot(u, mv(bk.R, [0, 0, 1])), upMax = (PL.handSupport * upperKg * Math.abs(gb[2])) / held + PL.braceUpN * PL.brace;
        if (upB > 1e-3) mag = Math.min(mag, upMax / upB);
        PL.handPlan[S] = c > 0 ? scl(u, mag) : scl(need, Math.min(1, (0.3 * PRIORS.gripStrengthN) / nl));
      }
      // sagittal leg stiffness: relaxed when seated, firmer braced, full stance gain standing
      const lg = lerp(lerp(PL.legGainSeated, PL.legGainBraced, PL.brace), 1, smooth01(PL.posture.stand / 0.6));
      for (const i of legHinges) R.servoScale[i] = lg;
      // moving over on the seat, the hips let the pelvis travel sideways (their flexion still
      // holds its pitch)
      const hs = lerp(1, PL.shiftHipGain, PL.shift || 0);
      for (const i of hipSideHinges) R.servoScale[i] = hs;
      // intent, rate limited
      for (const k of ["hang", "foreAft", "tuck", "stand"]) {
        const r = PL.rates[k] * dt;
        PL.posture[k] += clamp((R.intent[k] ?? 0) - PL.posture[k], -r, r);
      }
      PL.acc += dt;
      if (PL.acc + 1e-9 >= 1 / PL.hz || !PL.targets) {
        PL.acc = 0;
        PL.targets = planTargets(bk);
        // the per-step controllers use the targets in the bike frame (the bike moves ~V/60 m
        // between plans: world-frame targets would lag it)
        const T = PL.targets;
        PL.targetsB = { pelvis: toBikeFrame(bk, T.pelvis.p), feet: {} };
        for (const S of ["L", "R"]) if (T.feet?.[S]) PL.targetsB.feet[S] = toBikeFrame(bk, T.feet[S].p);
        solveTargets(T);
        reach(1 / PL.hz);
      }
      pelvisVMC(bk);
    };

    // ------------------------------------------------------------------ quiet hands on the bars
    // Her steering intent reaches the bars through the chassis' steer input (the player's or the
    // maneuver's torque), so what her arms put about the steering axis on their own (holding on,
    // leaning on the bars, moving her body) is driven back towards zero: each hand pushes its
    // grip tangentially about the steering axis (tau = J^T F on its arm chain), sharing the
    // correction. Her hands' inertia and damping on the bars remain.
    const SN = { tauF: 0, trim: 0 };
    function steerNeutral(bk, dt) {
      const aw = mv(bk.R, bk.axis), pw = bikeToWorld(bk, bk.pivot);
      let tau = 0;
      const arms = [];
      for (const S of ["L", "R"]) {
        const g = R.grips[S];
        if (!g.held) continue;
        const cw = R.gripWorld(bk, S).c, r = sub(cw, pw), rp = sub(r, scl(aw, dot(r, aw))), d = len(rp);
        tau += dot(cross(r, scl(g.F, -1)), aw) + dot(scl(g.T, -1), aw); // what her hand does to the bar
        if (d > 0.05) arms.push({ S, t: scl(unit(cross(aw, rp)), 1 / d) }); // push per N m of torque
      }
      R.telemetry.handSteerNm = tau;
      if (!arms.length || !PL.steerNeutralGain) return;
      SN.tauF += (tau - SN.tauF) * Math.min(1, dt / 0.02);
      SN.trim = clamp(SN.trim - SN.tauF * PL.steerNeutralKi * dt, -30, 30);
      const cmd = clamp(-PL.steerNeutralGain * SN.tauF + SN.trim, -40, 40) / arms.length;
      for (const { S, t } of arms) {
        let F = scl(t, cmd);
        const fl = len(F);
        if (fl > PL.steerNeutralMaxN) F = scl(F, PL.steerNeutralMaxN / fl);
        const pwh = body.toWorld(hand[S].link, hand[S].p);
        for (const { li, j } of Jcol(hand[S].link, pwh, S === "L" ? CH.armL : CH.armR)) R.tauVF[li] += dot(j, F);
      }
    }
    R.steerNeutralState = SN;
    // controller memory back to rest (a placement or reset starts her fresh)
    R.resetControl = () => {
      SN.tauF = 0; SN.trim = 0;
      Object.assign(PL, { shift: 0, shake: 0, shakeRate: 0, brace: 0, braceDir: 0, targets: null, targetsB: null, lastV: null, aFilt: [0, 0, 0], acc: 0 });
      PL.reachLean = R.calibration?.reachLean ?? PL.reachLean;
      PL.handPlan.L = PL.handPlan.R = null;
      R.tauVF.fill(0);
      R.servoScale.fill(1);
    };

    // ------------------------------------------------------------------ step
    // forces(bike, ground, dt): contact + servo forces at the current state; returns the reactions
    // the bike must receive. integrate(dt) advances the rider with those same forces.
    R.forces = function (bk, ground, dt) {
      const b = body;
      b.kinematics();
      if (R.planner) R.planner(R, bk, dt);
      feedForward(R.gApp || b.gravity);
      b.clearForces();
      b.applyGravity();
      const reactions = contacts(bk, ground);
      steerNeutral(bk, dt);
      servoTorques(dt);
      R.last.reactions = reactions;
      return reactions;
    };
    R.integrate = function (dt) {
      body.aba();
      body.integrate(dt);
      R.time += dt;
    };

    // ------------------------------------------------------------------ Semantic51 output
    R.commands = function () {
      const cmds = {};
      for (const d of ch.dofs) cmds[d.id] = 0;
      for (let i = 0; i < NH; i++) cmds[H[i].id] = body.q[H[i].link] / DEG;
      return { commands: ch.clampToRange(cmds), placement: { R: body.R.slice(), t: sub(body.p, B[TI.Hip]) } };
    };
    R.totals = () => body.totals();
    R.setBase = (p, Rw) => setBase(body, p, Rw);
    R.copyTargetsFromIK = () => { for (let i = 0; i < L.length; i++) R.qT[i] = ikb.q[i]; };
    // move with the bike: base velocity = the bike's rigid motion at the pelvis, joints at rest
    R.matchVelocity = (bk) => {
      const b = body, w = mtv(b.R, bk.w), v = mtv(b.R, bikePointVel(bk, b.p));
      b.vb = [w[0], w[1], w[2], v[0], v[1], v[2]];
      b.qd.fill(0);
      b.kinematics();
      if (PL) { PL.lastV = null; PL.aFilt = [0, 0, 0]; }
    };
    R.snapToTargets = () => { for (let i = 0; i < L.length; i++) { body.q[i] = R.qT[i]; body.qd[i] = 0; } body.p = ikb.p.slice(); body.R = ikb.R.slice(); body.kinematics(); };
    R.helpers = { toBikeFrame, bikeToWorld, bikePointVel, gripBody, logSO3, expRV, Rx, Ry, Rz, sub, add, scl, len, unit, cross, dot, mv, mtv, mm, mt, clamp, lerp, smooth01 };
    R.sittingSpheres = addSittingSpheres();
    R.pelvisFrontSpheres = addPelvisFrontSpheres();
    R.seedIK();
    R.calibrateSeat = calibrateSeat;
    R.calibration = calibrateSeat();
    return R;
  }

  // ------------------------------------------------------------------ pre-settle on a held bike
  // Seats the rider on a bike held still (identity pose): returns her state relative to the bike
  // and the time-averaged reactions she puts on it (bike frame), so a reset can place her already
  // settled and the bike's own settle can carry her weight where she really rests.
  function presettle(R, seconds = 0.8) {
    const I = [1, 0, 0, 0, 1, 0, 0, 0, 1], bk = { p: [0, 0, 0.64], R: I, v: [0, 0, 0], w: [0, 0, 0], steer: 0, steerRate: 0, pivot: [0, 0.438, 0.217], axis: [0, -0.418, 0.908] };
    const h = R.helpers, dt = 1 / 540, n = Math.round(seconds / dt), avg = [];
    R.resetControl();
    R.plan.gFilt = [0, 0, -9.81]; R.plan.gFF = [0, 0, -9.81];
    R.seedIK();
    const T0 = R.planTargets(bk);
    for (let pass = 0; pass < 3; pass++) R.solvePosture(T0, pass ? 1 : 4);
    R.copyTargetsFromIK(); R.snapToTargets(); R.matchVelocity(bk);
    const acc = new Map();
    for (let i = 0; i < n; i++) {
      const rs = R.forces(bk, null, dt);
      R.integrate(dt);
      if (i < n / 2) continue;
      for (const r of rs) {
        const key = (r.F ? "F" : "T") + ":" + r.part + ":" + (r.x ? r.x.map((x) => Math.round(x * 50)).join(",") : "");
        let e = acc.get(key);
        if (!e) acc.set(key, (e = { part: r.part, F: r.F ? [0, 0, 0] : null, T: r.T ? [0, 0, 0] : null, x: r.x ? [0, 0, 0] : null, n: 0 }));
        if (r.F) { e.F = h.add(e.F, r.F); e.x = h.add(e.x, r.x); }
        if (r.T) e.T = h.add(e.T, r.T);
        e.n++;
      }
    }
    const m = n - Math.ceil(n / 2);
    for (const e of acc.values()) {
      const k = 1 / m, kx = 1 / e.n;
      avg.push({ part: e.part, F: e.F ? h.scl(e.F, k) : null, T: e.T ? h.scl(e.T, k) : null, x: e.x ? h.sub(h.scl(e.x, kx), bk.p) : null });
    }
    const b = R.body;
    return { rel: { p: h.sub(b.p, bk.p), R: b.R.slice(), q: Float64Array.from(b.q), qT: Float64Array.from(R.qT) }, reactions: avg, weightN: avg.reduce((a, e) => a + (e.F ? e.F[2] : 0), 0) };
  }

  const api = { createRider, buildModel, segmentPoints, fitSpheres, presettle, PRIORS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.LUCID_RIDER_BIO = api;

  // ================================================================== browser: the rider on the V5 bike
  // The rider's contact forces enter the V5 generalized forces (frame: body wrench; bars: body
  // wrench + the steering-axis moment, not the fork travel), her body integrates after the bike
  // with the same forces (action = reaction, momentum exchanged exactly). The bike's mass matrix
  // and gravity become bike-only (the V5 values lump a 75.337 kg rider: V1.28.5.2 authority).
  const SURF_JSON = /*@@RIDER_SURFACES@@*/ null;
  (function install() {
    const CORE = global.LUCID_CORE, CH = CORE?.chassis;
    if (!CH || !SURF_JSON || typeof free === "undefined" || !global.DUCATI_V5_API) return;
    if (!CORE.character) { console.warn("LUCID rider biomech: character not loaded"); return; }
    const F0 = free, FP = Object.getPrototypeOf(F0);
    let R;
    try { R = createRider(CORE.character, SURF_JSON); } catch (e) { console.error("LUCID rider biomech: build failed", e); return; }
    const SET = presettle(R);
    const h = R.helpers, DEG = Math.PI / 180;
    let DEFAULT_ON = false;
    try { const m = /[?&]rider=(bio|legacy)\b/.exec(global.location?.search || ""); if (m) DEFAULT_ON = m[1] === "bio"; } catch (_) {}
    const legacyMass = () => global.LUCID_RIDER_DYNAMICS_V12852?.mass;
    const BIO = (CORE.riderBio = {
      // off by default until the maneuver suite passes with her on the bike (setActive(true) or ?rider=bio)
      rider: R, active: DEFAULT_ON, presettle: SET, placed: false, auto: true, keys: {}, pad: { hang: 0, tuck: 0 },
      config: {
        legacyRiderKg: 75.337, // V1.28.5.2 mass authority: the rider lumped into the V5 sprung mass
        subtractRiderInertia: true, // the V5 inertiaBody is not bike-only (V1.28.5.2 note); remove her intrinsic inertia
        auto: { style: 0.75, hangStartG: 0.2, hangFullG: 0.95, filterS: 1.2, minLeanDeg: 4, tuckStartMps: 33, tuckFullMps: 55, sitUpDecelG: 0.55, sitUpMinMps: 30 },
      },
      stats: { stepMs: 0, steps: 0 },
    });
    const bk = { p: [0, 0, 0], R: [1, 0, 0, 0, 1, 0, 0, 0, 1], v: [0, 0, 0], w: [0, 0, 0], steer: 0, steerRate: 0, pivot: [0, 0, 0], axis: [0, 0, 1] };
    function adapt(F) {
      const q = F.q, ex = v5qrot(q, [1, 0, 0]), ey = v5qrot(q, [0, 1, 0]), ez = v5qrot(q, [0, 0, 1]);
      bk.R = [ex[0], ey[0], ez[0], ex[1], ey[1], ez[1], ex[2], ey[2], ez[2]];
      bk.p = F.p; bk.v = F.v; bk.w = v5qrot(q, F.w);
      bk.steer = F.steer || 0; bk.steerRate = F.steerRate || 0;
      bk.pivot = F.geom.steerPivotBody; bk.axis = F.geom.forkAxisBody;
      return bk;
    }
    const RT = CORE.realtime;
    const ground = { height: (x, y) => (RT?.road ? RT.road.height(x, y) : 0), normal: (x, y) => (RT?.road ? RT.road.normal(x, y) : [0, 0, 1]), grip: (x, y) => (RT?.road ? RT.road.mu(x, y) : 1) };
    // place her, pre-settled, on the bike as it is now (pose and rigid motion)
    function place(F) {
      adapt(F);
      const b = R.body;
      b.p = h.add(bk.p, h.mv(bk.R, SET.rel.p));
      b.R = h.mm(bk.R, SET.rel.R);
      b.q.set(SET.rel.q); R.qT.set(SET.rel.qT);
      for (const s of R.spheres) { s.bike.on = s.peg.on = s.ground.on = false; s.bike.anchor = s.peg.anchor = s.ground.anchor = null; }
      for (const S of ["L", "R"]) { const g = R.grips[S]; g.held = true; g.overloadS = 0; g.twist0 = null; }
      b.kinematics();
      R.matchVelocity(bk);
      R.resetControl();
      R.plan.gFilt = [0, 0, -9.81]; R.plan.gFF = [0, 0, -9.81];
      BIO.placed = true;
    }
    BIO.place = () => place(free);
    const apply = (F, Q, rs) => {
      const axisW = v5qrot(F.q, bk.axis), pivotW = v5add(F.p, v5qrot(F.q, bk.pivot));
      let steer = 0;
      for (const r of rs) {
        if (r.F) {
          CH.addBodyForce(F, Q, r.F, r.x);
          if (r.part === "steer") steer += v5axisMoment(pivotW, r.x, r.F, axisW);
        } else if (r.T) {
          CH.addBodyMoment(F, Q, r.T);
          if (r.part === "steer") steer += v5dot(r.T, axisW);
        }
      }
      Q[6] += steer;
      BIO.stats.steerNm = steer; // her hands' torque about the steering axis this step
    };
    function riderWrench(F, Q, dt) {
      if (!BIO.active || F.__rttReference) return;
      if (!BIO.placed || F.__lucidSettling) {
        // the bike is being settled/held by the reset: she rides along pre-settled and her
        // measured static reactions load it where she rests
        place(F);
        const rs = SET.reactions.map((e) => ({ part: e.part, F: e.F ? h.mv(bk.R, e.F) : null, T: e.T ? h.mv(bk.R, e.T) : null, x: e.x ? h.add(bk.p, h.mv(bk.R, e.x)) : null }));
        apply(F, Q, rs);
        BIO.skipIntegrate = true;
        return;
      }
      adapt(F);
      const t0 = performance.now();
      const rs = R.forces(bk, ground, dt);
      apply(F, Q, rs);
      BIO.skipIntegrate = false;
      BIO.stats.stepMs += (performance.now() - t0 - BIO.stats.stepMs) * 0.02;
    }
    function riderIntegrate(F, dt) {
      if (!BIO.active) return;
      if (BIO.skipIntegrate) { place(F); return; } // held/settling bike moved: she moves with it
      const t0 = performance.now();
      R.integrate(dt);
      BIO.stats.steps++;
      BIO.stats.integrateMs = (BIO.stats.integrateMs || 0) + (performance.now() - t0 - (BIO.stats.integrateMs || 0)) * 0.02;
      // a body that left the machine far behind (crash, teleport) is put back at the next reset
      if (!Number.isFinite(R.body.p[0]) || h.len(h.sub(R.body.p, F.p)) > 30) { BIO.placed = false; }
      intent(F, dt);
    }
    CH.wrenches.push(riderWrench);
    CH.postIntegrate.push(riderIntegrate);

    // ---- bike-only mass matrix and gravity (the legacy lumps her into the sprung body)
    const baseMass = FP._massMatrixAndBias, prevMass = CH.massMatrix, prevGrav = CH.sprungGravityMassKg;
    function riderInertiaDiag() {
      const I = legacyMass()?.inertiaAboutComKgM2;
      return BIO.config.subtractRiderInertia && Array.isArray(I) ? [I[0][0], I[1][1], I[2][2]] : [0, 0, 0];
    }
    CH.massMatrix = function (F) {
      if (!BIO.active) return prevMass ? prevMass(F) : F._massMatrixAndBias();
      const S = F.S, sm = S.mSprung, si = S.inertiaBody, Ir = riderInertiaDiag();
      S.mSprung = sm - BIO.config.legacyRiderKg;
      S.inertiaBody = [Math.max(1, si[0] - Ir[0]), Math.max(1, si[1] - Ir[1]), Math.max(1, si[2] - Ir[2])];
      let mb;
      try { mb = baseMass.call(F); } finally { S.mSprung = sm; S.inertiaBody = si; }
      mb.riderCoupling = { mode: "LUCID_RIDER_ARTICULATED", bikeSprungKg: sm - BIO.config.legacyRiderKg, riderInertiaRemoved: Ir };
      return mb;
    };
    CH.sprungGravityMassKg = (F) => (BIO.active ? F.S.mSprung - BIO.config.legacyRiderKg : prevGrav ? prevGrav(F) : F.S.mSprung);
    // the two-mass rider (40_rider_body) steps aside while she is active
    const old = CORE.rider;
    if (BIO.active && old?.setActive) old.setActive(false);

    // ---- intent: keys / pad / auto rider (same controls as 40_rider_body)
    const clamp = (x, a, b) => (x < a ? a : x > b ? b : x), smooth01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
    const KEYMAP = { KeyJ: "hangL", KeyL: "hangR", KeyI: "tuck", KeyK: "back", KeyU: "stand" };
    function onKey(e, down) {
      if (global.__LUCID_ACTIVE_PAGE__ !== "RIDE") return;
      const tag = (e.target?.tagName || "").toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.code === "KeyO" && down && !e.repeat) { BIO.auto = !BIO.auto; return; }
      const k = KEYMAP[e.code];
      if (k) BIO.keys[k] = down;
    }
    global.addEventListener?.("keydown", (e) => onKey(e, true));
    global.addEventListener?.("keyup", (e) => onKey(e, false));
    global.addEventListener?.("blur", () => { BIO.keys = {}; });
    let padT = 0;
    function readPad() {
      const now = performance.now();
      if (now - padT < 16) return BIO.pad;
      padT = now;
      let gp = null;
      try { gp = [...(navigator.getGamepads?.() || [])].find(Boolean); } catch (_) {}
      const b = (i) => !!gp?.buttons?.[i]?.pressed;
      BIO.pad = gp ? { hang: (b(15) ? 1 : 0) - (b(14) ? 1 : 0), tuck: (b(12) ? 1 : 0) - (b(13) ? 1 : 0) } : { hang: 0, tuck: 0 };
      return BIO.pad;
    }
    const filt = (BIO.filt = { latG: 0, roll: 0, decelG: 0, lastV: null });
    function intent(F, dt) {
      const A = BIO.config.auto, fw = v5qrot(F.q, V5_Y), hz = v5norm([fw[0], fw[1], 0]), V = v5dot(F.v, hz);
      const a = Math.min(1, dt / A.filterS);
      // lateral g from the rate of change of the travel direction (heading), not the body's
      // angular velocity: at 40 deg of lean the suspension's pitching would leak into that
      const hd = Math.atan2(F.v[1], F.v[0]), Vh = Math.hypot(F.v[0], F.v[1]);
      let hr = 0;
      if (filt.lastHd != null && Vh > 1) { let d = hd - filt.lastHd; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; hr = d / dt; }
      filt.lastHd = Vh > 1 ? hd : null;
      filt.latG += ((V * hr) / F.S.g - filt.latG) * a;
      filt.roll += (v5bodyAngles(F.q).rollRad - filt.roll) * a;
      if (filt.lastV != null) filt.decelG += (-(V - filt.lastV) / dt / F.S.g - filt.decelG) * Math.min(1, dt / 0.12);
      filt.lastV = V;
      const auto = { hang: 0, tuck: 0, foreAft: 0, stand: 0 };
      if (BIO.auto) {
        const side = Math.abs(filt.roll) > A.minLeanDeg * DEG ? Math.sign(filt.roll) : 0;
        auto.hang = side * A.style * smooth01((Math.abs(filt.latG) - A.hangStartG) / (A.hangFullG - A.hangStartG));
        auto.tuck = (1 - Math.abs(auto.hang)) * smooth01((V - A.tuckStartMps) / (A.tuckFullMps - A.tuckStartMps));
        if (filt.decelG > A.sitUpDecelG && V > A.sitUpMinMps) auto.tuck = Math.min(auto.tuck, -0.5 * smooth01((filt.decelG - A.sitUpDecelG) / 0.4) * smooth01((V - A.sitUpMinMps) / 15));
      }
      const K = BIO.keys, pad = global.__LUCID_ACTIVE_PAGE__ === "RIDE" ? readPad() : { hang: 0, tuck: 0 };
      const kHang = (K.hangR ? 1 : 0) - (K.hangL ? 1 : 0);
      R.intent.hang = kHang || pad.hang ? clamp(kHang + pad.hang, -1, 1) : BIO.manual?.hang ?? auto.hang;
      R.intent.tuck = K.tuck || pad.tuck > 0 ? 1 : K.back || pad.tuck < 0 ? -0.6 : BIO.manual?.tuck ?? auto.tuck;
      R.intent.foreAft = K.back || pad.tuck < 0 ? -1 : BIO.manual?.foreAft ?? auto.foreAft;
      R.intent.stand = K.stand ? 1 : BIO.manual?.stand ?? auto.stand;
      const P = R.plan.posture;
      CH.aero.posture = { tuck: clamp(0.35 + 0.65 * P.tuck, 0, 1), hang: P.hang };
    }
    BIO.setPosture = (patch = {}) => { BIO.manual = { ...(BIO.manual || {}), ...patch }; for (const k of Object.keys(BIO.manual)) if (BIO.manual[k] === null) delete BIO.manual[k]; return { ...BIO.manual }; };
    BIO.setActive = (on) => {
      BIO.active = !!on;
      BIO.placed = false;
      if (old?.setActive) old.setActive(!BIO.active);
      return BIO.active;
    };

    // ---- reset: place her again once the bike has settled
    CH.onReset.push(() => { BIO.placed = false; filt.latG = 0; filt.roll = 0; filt.decelG = 0; filt.lastV = null; filt.lastHd = null; R.plan.shift = 0; R.plan.posture = { hang: 0, foreAft: 0, tuck: 0, stand: 0 }; });

    // ---- telemetry
    const prevCompute = FP.compute;
    FP.compute = function () {
      const M = prevCompute.call(this);
      if (M && BIO.active && !this.__rttLite) {
        const sum = { seat: 0, tank: 0, front: 0, pegs: 0, ground: 0, grips: 0 };
        for (const s of R.spheres) {
          if (s.bike.on) sum[s.bike.where || "seat"] += h.len(s.bike.F);
          if (s.peg.on) sum.pegs += h.len(s.peg.F);
          if (s.ground.on) sum.ground += h.len(s.ground.F);
        }
        for (const S of ["L", "R"]) if (R.grips[S].held) sum.grips += h.len(R.grips[S].F);
        const tot = R.body.totals(), comB = h.mtv(bk.R, h.sub(tot.com, this.p));
        M.riderBio = {
          schema: "lucid.core.rider-biomech.v1", massKg: tot.mass, posture: { ...R.plan.posture }, intent: { ...R.intent }, auto: BIO.auto,
          contactsN: sum, grips: { L: R.grips.L.held, R: R.grips.R.held }, comBodyM: comB, brace: R.plan.brace, steerNm: BIO.stats.steerNm || 0, stepMs: BIO.stats.stepMs, integrateMs: BIO.stats.integrateMs,
        };
      }
      return M;
    };
    global.__LUCID_CORE_RIDER_BIO_READY__ = true;
  })();
})(typeof window !== "undefined" ? window : globalThis);
