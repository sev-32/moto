// LUCID MOTO core · LUCID character: canonical female-skin-v4.2 deformation path
// ------------------------------------------------------------------------------------------
// Browser port of the canonical path of the LUCID Biomechanical Causal Rig (R1.5):
//   Semantic51 commands --(semantic-articulation-compiler.v2 rules)--> P, G (51 joints)
//   --(canonical helper-cluster rules)--> 78 rigid cluster transforms
//   --(Skin78 LBS, raw weights / per-vertex sum)--> 14,164 vertices
// in float64, rule for rule after lucid_bcr/semantic.py, drivers.py (profile "canonical") and
// skinning.py (LBS). The declared hand layer (42 sign-probed finger/thumb axes and the grip
// synergies of anatomy.HandLayer) supplies extra local rotations on finger joints only.
// Parity with the Python reference is a unit test (tests/lucid_character.test.mjs).
//
// Contract kept from the package: the causal system moves the model and never the skin. No
// weight, helper rule or deformer is changed; callers only pass Semantic51 commands (hard
// ranges enforced), hand-layer DOFs and a world placement. Nothing writes P/G directly.
//
// Asset: assets/character/lucid_female_v4_2.json (tools/character/extract_lucid.py; inputs
// verified against the package's source locks, Skin78 sha256 88b6cacd…).
(function (global) {
  "use strict";

  // ------------------------------------------------------------------ small float64 linear algebra
  const I3 = () => [1, 0, 0, 0, 1, 0, 0, 0, 1]; // row-major 3x3
  const mm = (a, b) => [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6], a[0] * b[1] + a[1] * b[4] + a[2] * b[7], a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6], a[3] * b[1] + a[4] * b[4] + a[5] * b[7], a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6], a[6] * b[1] + a[7] * b[4] + a[8] * b[7], a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ];
  const mt = (a) => [a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]];
  const mv = (a, v) => [a[0] * v[0] + a[1] * v[1] + a[2] * v[2], a[3] * v[0] + a[4] * v[1] + a[5] * v[2], a[6] * v[0] + a[7] * v[1] + a[8] * v[2]];
  const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const unit = (v) => { const n = Math.hypot(v[0], v[1], v[2]) + 1e-12; return [v[0] / n, v[1] / n, v[2] / n]; };

  // scipy Rotation.from_rotvec(...).as_matrix()
  function rotvecToMatrix(rv) {
    const ang = Math.hypot(rv[0], rv[1], rv[2]);
    const a2 = ang * ang;
    const s = ang <= 1e-3 ? 0.5 - a2 / 48 + (a2 * a2) / 3840 : Math.sin(ang / 2) / ang;
    const x = rv[0] * s, y = rv[1] * s, z = rv[2] * s, w = Math.cos(ang / 2);
    return quatToMatrix(x, y, z, w);
  }
  // scipy Rotation.as_matrix (same expression, no renormalisation)
  function quatToMatrix(x, y, z, w) {
    const x2 = x * x, y2 = y * y, z2 = z * z, w2 = w * w, xy = x * y, zw = z * w, xz = x * z, yw = y * w, yz = y * z, xw = x * w;
    return [
      x2 - y2 - z2 + w2, 2 * (xy - zw), 2 * (xz + yw),
      2 * (xy + zw), -x2 + y2 - z2 + w2, 2 * (yz - xw),
      2 * (xz - yw), 2 * (yz + xw), -x2 - y2 + z2 + w2,
    ];
  }
  // scipy Rotation.from_matrix (Markley) -> quaternion [x, y, z, w]
  function matrixToQuat(m) {
    const t = m[0] + m[4] + m[8], dec = [m[0], m[4], m[8], t];
    let c = 0;
    for (let k = 1; k < 4; k++) if (dec[k] > dec[c]) c = k;
    let q;
    if (c !== 3) {
      const i = c, j = (i + 1) % 3, k = (j + 1) % 3, M = (r, s) => m[3 * r + s];
      q = [0, 0, 0, 0];
      q[i] = 1 - dec[3] + 2 * M(i, i);
      q[j] = M(j, i) + M(i, j);
      q[k] = M(k, i) + M(i, k);
      q[3] = M(k, j) - M(j, k);
    } else {
      q = [m[7] - m[5], m[2] - m[6], m[3] - m[1], 1 + t];
    }
    const n = Math.hypot(q[0], q[1], q[2], q[3]);
    return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
  }
  // scipy Rotation.as_rotvec
  function matrixToRotvec(m) {
    let [x, y, z, w] = matrixToQuat(m);
    if (w < 0) { x = -x; y = -y; z = -z; w = -w; }
    const ang = 2 * Math.atan2(Math.hypot(x, y, z), w), a2 = ang * ang;
    const s = ang <= 1e-3 ? 2 + a2 / 12 + (7 * a2 * a2) / 2880 : ang / Math.sin(ang / 2);
    return [x * s, y * s, z * s];
  }
  const localRotation = (axis, deg) => { const u = unit(axis), r = (deg * Math.PI) / 180; return rotvecToMatrix([u[0] * r, u[1] * r, u[2] * r]); };
  const slerpM = (A, B, t) => { const rv = matrixToRotvec(mm(mt(A), B)); return mm(A, rotvecToMatrix([rv[0] * t, rv[1] * t, rv[2] * t])); };

  function decode(f) {
    const bin = typeof atob === "function" ? atob(f.b64) : Buffer.from(f.b64, "base64").toString("binary");
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const T = { float64: Float64Array, float32: Float32Array, int32: Int32Array, uint16: Uint16Array, uint8: Uint8Array }[f.dtype];
    return new T(u8.buffer);
  }

  // ------------------------------------------------------------------ the character
  function createLucidCharacter(asset) {
    const names = asset.joints.names, parents = asset.joints.parents, restFlat = decode(asset.joints.rest);
    const NJ = names.length, TI = Object.fromEntries(names.map((n, i) => [n, i]));
    const B = names.map((_, i) => [restFlat[3 * i], restFlat[3 * i + 1], restFlat[3 * i + 2]]);
    const BD = Object.fromEntries(names.map((n, i) => [n, B[i]]));
    const DEFS = asset.dofs.map((d, order) => ({ ...d, order }));
    const DEF = Object.fromEntries(DEFS.map((d) => [d.id, d]));

    // ---------------- Semantic51 compiler (semantic.py)
    function validate(cmds) {
      for (const [k, v] of Object.entries(cmds)) {
        const d = DEF[k];
        if (!d) throw Error(JSON.stringify({ status: "BLOCKED_UNSUPPORTED_DOF", unsupported: [k] }));
        if (!Number.isFinite(v)) throw Error(JSON.stringify({ status: "ERROR", error: `${k} must be finite` }));
        if (v < d.min - 1e-9 || v > d.max + 1e-9)
          throw Error(JSON.stringify({ status: "BLOCKED_VALIDATION", reason: "DOF_OUTSIDE_HARD_RANGE", dof: k, requestedDeg: v, hardRangeDeg: [d.min, d.max] }));
      }
      return cmds;
    }
    // realization: hard ranges enforced (the rig never emits an unlawful command)
    function clampToRange(cmds, report) {
      const out = {};
      for (const [k, v] of Object.entries(cmds)) {
        const d = DEF[k];
        if (!d) continue;
        const c = v < d.min ? d.min : v > d.max ? d.max : v;
        if (report && c !== v) report[k] = v - c;
        out[k] = c;
      }
      return out;
    }
    const physicalTwist = (side, deg) => deg * (side === "L" ? -1 : 1);
    function localRotations(cmds) {
      const Rl = names.map(I3), twists = {};
      for (const d of DEFS) {
        if (!(d.id in cmds)) continue;
        const v = cmds[d.id];
        if (d.family === "distributed_twist") {
          const side = d.id.startsWith("left") ? "L" : "R", phys = physicalTwist(side, v);
          twists[side] = phys;
          const j = TI[`${side}_Hand`];
          Rl[j] = mm(Rl[j], localRotation(d.axis, phys));
        } else {
          const j = TI[d.joint];
          Rl[j] = mm(Rl[j], localRotation(d.axis, v));
        }
      }
      return { Rl, twists };
    }
    function forward(Rl, rootTranslation) {
      const P = new Array(NJ), G = new Array(NJ);
      for (let i = 0; i < NJ; i++) {
        const p = parents[i];
        if (p < 0) {
          P[i] = rootTranslation ? vadd(B[i], rootTranslation) : B[i].slice();
          G[i] = Rl[i];
        } else {
          P[i] = vadd(P[p], mv(G[p], vsub(B[i], B[p])));
          G[i] = mm(G[p], Rl[i]);
        }
      }
      return { P, G };
    }
    function compile(commands, opts = {}) {
      const cmds = opts.validate === false ? commands : validate(commands);
      const { Rl, twists } = localRotations(cmds);
      if (opts.extraLocal) for (const [jn, R] of Object.entries(opts.extraLocal)) { const j = TI[jn]; Rl[j] = mm(Rl[j], R); }
      let { P, G } = forward(Rl, opts.rootTranslation);
      if (opts.placement) {
        const Rw = opts.placement.R, t = opts.placement.t, b = B[0];
        P = P.map((x) => vadd(vadd(mv(Rw, vsub(x, b)), b), t));
        G = G.map((g) => mm(Rw, g));
      }
      return { P, G, Rlocal: Rl, twist: twists, commands: cmds };
    }

    // ---------------- canonical helper-cluster rules (drivers.py, profile "canonical")
    const CN = asset.clusters.names, pivFlat = decode(asset.clusters.pivots), NC = CN.length;
    const PIV = CN.map((_, c) => [pivFlat[3 * c], pivFlat[3 * c + 1], pivFlat[3 * c + 2]]);
    const FING = ["Index", "Mid", "Pinky", "Ring", "Thumb"];
    // resolve each cluster's rule once (same decision sequence as ClusterDrivers._canonical)
    const RULES = CN.map((name) => {
      const direct = (j) => ({ kind: "direct", j: TI[j] });
      const carried = (j) => ({ kind: "carried", j: TI[j] }); // G[j], P[j] + G[j](bp - B[j])
      if (name === "Pelvis") return direct("Hip");
      if (name === "Waist") return { kind: "slerpCarried", a: TI.Hip, b: TI.Spine01, t: 0.5, at: TI.Hip };
      if (name === "Spine01" || name === "Spine02" || name === "NeckTwist01" || name === "Head") return direct(name);
      if (name === "NeckTwist02") return { kind: "slerpCarried", a: TI.NeckTwist01, b: TI.Head, t: 0.55, at: TI.NeckTwist01 };
      if (name === "JawRoot") return carried("Head");
      if (name.includes("Breast") || name.includes("RibsTwist")) return { kind: "slerpCarried", a: TI.Spine02, b: TI[`${name[0]}_Clavicle`], t: 0.25, at: TI.Spine02 };
      const s = name.length > 2 && name[1] === "_" ? name[0] : null;
      if (s === "L" || s === "R") {
        if (name === `${s}_Clavicle`) return direct(name);
        if (name.includes("UpperarmTwist")) return carried(`${s}_Upperarm`);
        if (name === `${s}_ElbowShareBone`) return { kind: "slerpAt", a: TI[`${s}_Upperarm`], b: TI[`${s}_Forearm`], t: 0.35, at: TI[`${s}_Forearm`] };
        if (name.includes("ForearmTwist")) return { kind: "forearmTwist", side: s, frac: name.endsWith("01") ? 0.34 : 0.72, j: TI[`${s}_Forearm`], hand: TI[`${s}_Hand`] };
        if (name === `${s}_Hand`) return direct(name);
        if (name in TI && FING.some((f) => name.startsWith(`${s}_${f}`))) return direct(name);
        if (name.includes("ThighTwist")) return carried(`${s}_Thigh`);
        if (name === `${s}_KneeShareBone`) return { kind: "slerpAt", a: TI[`${s}_Thigh`], b: TI[`${s}_Calf`], t: 0.45, at: TI[`${s}_Calf`] };
        if (name.includes("CalfTwist")) return carried(`${s}_Calf`);
        if (name === `${s}_Foot`) return direct(name);
        if (name.includes("Toe1")) return { kind: "toe", toe: TI[`${s}_ToeBase`], foot: TI[`${s}_Foot`] };
      }
      throw Error("no canonical rule for cluster " + name);
    });
    function clusterTransforms(pose, D = new Float64Array(NC * 9), T = new Float64Array(NC * 3)) {
      const { P, G } = pose, tw = pose.twist || {};
      for (let c = 0; c < NC; c++) {
        const r = RULES[c], bp = PIV[c];
        let Dc, pc;
        switch (r.kind) {
          case "direct": Dc = G[r.j]; pc = P[r.j]; break;
          case "carried": Dc = G[r.j]; pc = vadd(P[r.j], mv(G[r.j], vsub(bp, B[r.j]))); break;
          case "slerpCarried": Dc = slerpM(G[r.a], G[r.b], r.t); pc = vadd(P[r.at], mv(G[r.at], vsub(bp, B[r.at]))); break;
          case "slerpAt": Dc = slerpM(G[r.a], G[r.b], r.t); pc = P[r.at]; break;
          case "forearmTwist": {
            const phys = tw[r.side] || 0, axis = vsub(P[r.hand], P[r.j]);
            Dc = mm(localRotation(axis, phys * r.frac), G[r.j]);
            pc = vadd(P[r.j], mv(Dc, vsub(bp, B[r.j])));
            break;
          }
          case "toe": Dc = G[r.toe]; pc = vadd(P[r.foot], mv(G[r.foot], vsub(bp, B[r.foot]))); break;
        }
        const t = vsub(pc, mv(Dc, bp));
        for (let k = 0; k < 9; k++) D[9 * c + k] = Dc[k];
        T[3 * c] = t[0]; T[3 * c + 1] = t[1]; T[3 * c + 2] = t[2];
      }
      return { D, T };
    }

    // ---------------- Skin78 LBS (skinning.py Skinner.lbs)
    const V0 = decode(asset.mesh.vrest), NV = V0.length / 3, FACES = decode(asset.mesh.faces);
    const WP = decode(asset.weights.indptr), WI = decode(asset.weights.indices), WD = decode(asset.weights.data);
    const WSUM = new Float64Array(NV);
    for (let v = 0; v < NV; v++) { let s = 0; for (let k = WP[v]; k < WP[v + 1]; k++) s += WD[k]; WSUM[v] = s; }
    function lbs(ct, out = new Float64Array(NV * 3)) {
      const { D, T } = ct;
      for (let v = 0; v < NV; v++) {
        const x = V0[3 * v], y = V0[3 * v + 1], z = V0[3 * v + 2];
        let ox = 0, oy = 0, oz = 0;
        for (let k = WP[v]; k < WP[v + 1]; k++) {
          const c = WI[k], w = WD[k], d = 9 * c, t = 3 * c;
          ox += w * (D[d] * x + D[d + 1] * y + D[d + 2] * z + T[t]);
          oy += w * (D[d + 3] * x + D[d + 4] * y + D[d + 5] * z + T[t + 1]);
          oz += w * (D[d + 6] * x + D[d + 7] * y + D[d + 8] * z + T[t + 2]);
        }
        const s = 1 / Math.max(WSUM[v], 1e-12);
        out[3 * v] = ox * s; out[3 * v + 1] = oy * s; out[3 * v + 2] = oz * s;
      }
      return out;
    }

    // ---------------- declared hand layer (anatomy.HandLayer)
    const HD = Object.fromEntries(asset.hand.dofs.map((d) => [d.id, d]));
    const HAND_ORDER = { thumb1: ["opposition", "abductionAdduction", "flexionExtension"], other: ["flexionExtension", "spread"] };
    function handLocalRotations(handDofs) {
      const per = {};
      for (const [id, val] of Object.entries(handDofs)) {
        const d = HD[id];
        if (!d) throw Error("BLOCKED_UNSUPPORTED_HAND_DOF " + id);
        (per[d.joint] ||= []).push([d.dof, d.axis, +val]);
      }
      const out = {};
      for (const [j, rows] of Object.entries(per)) {
        let R = I3();
        for (const nm of j.endsWith("Thumb1") ? HAND_ORDER.thumb1 : HAND_ORDER.other)
          for (const [dof, ax, v] of rows) if (dof === nm && v !== 0) R = mm(R, localRotation(ax, v));
        out[j] = R;
      }
      return out;
    }
    const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
    function handSynergy(side, spec) {
      const S = side === "left" ? "L" : "R", out = {}, per = { ...(spec.fingerCurl || {}) }, curl = spec.curl;
      if (spec.profile) {
        const prof = asset.hand.grips[spec.profile], base = spec.profileGain ?? 1;
        for (const [F, key] of [["Index", "index"], ["Mid", "middle"], ["Ring", "ring"], ["Pinky", "pinky"], ["Thumb", "thumb"]])
          if (!(F in per)) per[F] = Math.min(1, base * prof.sourceActivity01[key] * prof.multipliers[key]);
      }
      for (const F of ["Index", "Mid", "Ring", "Pinky"]) {
        let c = F in per ? per[F] : curl;
        if (c == null) continue;
        c = clamp01(c);
        const mcp = c * HD[`${S}_${F}1.flexionExtension`].comfortHi * 0.95, pip = c * HD[`${S}_${F}2.flexionExtension`].comfortHi;
        out[`${S}_${F}1.flexionExtension`] = mcp;
        out[`${S}_${F}2.flexionExtension`] = pip;
        out[`${S}_${F}3.flexionExtension`] = Math.min(HD[`${S}_${F}3.flexionExtension`].hi, 0.67 * pip);
      }
      if (spec.spread != null) {
        const w = { Index: 0.7, Mid: 0.05, Ring: 0.35, Pinky: 0.75 };
        for (const F of ["Index", "Mid", "Ring", "Pinky"]) {
          const d = HD[`${S}_${F}1.spread`], v = (spec.spread * w[F] * d.comfortHi) / 0.75;
          out[`${S}_${F}1.spread`] = v < d.lo ? d.lo : v > d.hi ? d.hi : v;
        }
      }
      const opp = spec.thumbOpposition, tc = "Thumb" in per ? per.Thumb : spec.thumbCurl;
      if (opp != null || tc != null) {
        const o = clamp01(opp != null ? opp : tc || 0), t = clamp01(tc != null ? tc : o);
        out[`${S}_Thumb1.opposition`] = o * HD[`${S}_Thumb1.opposition`].comfortHi;
        out[`${S}_Thumb1.abductionAdduction`] = o * 0.5 * HD[`${S}_Thumb1.abductionAdduction`].comfortHi;
        out[`${S}_Thumb1.flexionExtension`] = t * 0.5 * HD[`${S}_Thumb1.flexionExtension`].comfortHi;
        out[`${S}_Thumb2.flexionExtension`] = t * HD[`${S}_Thumb2.flexionExtension`].comfortHi;
        out[`${S}_Thumb3.flexionExtension`] = t * HD[`${S}_Thumb3.flexionExtension`].comfortHi;
      }
      Object.assign(out, spec.dofs || {});
      return out;
    }

    return {
      schema: asset.schema, source: asset.source, frame: asset.frame,
      joints: { names, parents, rest: B, index: TI }, dofs: DEFS, dof: DEF, maxVelocityDegS: asset.maxVelocityDegS || {},
      clusters: { names: CN, pivots: PIV }, nv: NV, faces: FACES, vrest: V0, weights: { indptr: WP, indices: WI, data: WD, sum: WSUM },
      physical: asset.physical, contactRegions: Object.fromEntries(Object.entries(asset.contactRegions || {}).map(([k, v]) => [k, decode(v)])),
      hand: { dofs: HD, synergy: handSynergy, localRotations: handLocalRotations, grips: asset.hand.grips },
      validate, clampToRange, compile, localRotations, forward, clusterTransforms, lbs,
      math: { mm, mt, mv, unit, localRotation, rotvecToMatrix, matrixToRotvec, matrixToQuat, quatToMatrix, slerpM },
    };
  }

  const api = { createLucidCharacter };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.LUCID_CHARACTER = api;
  // in the build the asset is inlined here; the unit test calls createLucidCharacter itself
  const ASSET = /*@@LUCID_ASSET@@*/ null;
  if (ASSET && global.LUCID_CORE) {
    try {
      global.LUCID_CORE.character = createLucidCharacter(ASSET);
      global.__LUCID_CORE_CHARACTER_READY__ = true;
    } catch (e) {
      console.error("LUCID character failed to load", e);
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
