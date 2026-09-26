// LUCID MOTO core · articulated-body dynamics for the rider (Featherstone ABA)
// ------------------------------------------------------------------------------------------
// Reduced-coordinate rigid multibody: a floating base (6 DOF) and a tree of revolute joints.
// The rider built on it (46_…) uses exactly the Semantic51 DOFs as its hinges, in compiler
// order and about the compiler's axes, so the physical state *is* a set of Semantic51 commands
// (the render path compiles it through the canonical skin, it never poses bones directly).
//
//   * articulated-body algorithm in body coordinates (Featherstone, RBDA ch. 7): O(n),
//     exact joint constraints, no drift
//   * joint servos integrated stably (implicit PD / "stable PD": the servo's damping and
//     stiffness enter the joint's articulated inertia as dt*kd + dt^2*kp)
//   * external forces at world points (contacts, gravity at each COM), joint torques
//   * RNEA with the base held for feed-forward (gravity + contact load) compensation
//   * semi-implicit Euler; hinge limits as a positional safety after the step
// Pure JS (no browser APIs) so it runs in the unit tests.
(function (global) {
  "use strict";

  // ------------------------------------------------------------------ 3-vector / 3x3 helpers (row-major)
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const mv = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
  const mtv = (m, v) => [m[0] * v[0] + m[3] * v[1] + m[6] * v[2], m[1] * v[0] + m[4] * v[1] + m[7] * v[2], m[2] * v[0] + m[5] * v[1] + m[8] * v[2]];
  const mm = (a, b) => [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6], a[0] * b[1] + a[1] * b[4] + a[2] * b[7], a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6], a[3] * b[1] + a[4] * b[4] + a[5] * b[7], a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6], a[6] * b[1] + a[7] * b[4] + a[8] * b[7], a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ];
  const mt = (a) => [a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]];
  function axisAngle(a, th) {
    const c = Math.cos(th), s = Math.sin(th), t = 1 - c, [x, y, z] = a;
    return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
  }
  function expSO3(w, dt) {
    const th = Math.hypot(w[0], w[1], w[2]) * dt;
    if (th < 1e-12) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const n = Math.hypot(w[0], w[1], w[2]);
    return axisAngle([w[0] / n, w[1] / n, w[2] / n], th);
  }
  function orthonormalize(R) {
    let x = [R[0], R[3], R[6]], y = [R[1], R[4], R[7]];
    const nx = Math.hypot(...x);
    x = x.map((v) => v / nx);
    const d = dot(x, y);
    y = [y[0] - d * x[0], y[1] - d * x[1], y[2] - d * x[2]];
    const ny = Math.hypot(...y);
    y = y.map((v) => v / ny);
    const z = cross(x, y);
    return [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
  }

  // ------------------------------------------------------------------ 6x6 spatial helpers (Float64Array(36), row-major)
  // motion vector [w; v], force vector [n; f]
  function rigidInertia(m, c, Ic, out = new Float64Array(36)) {
    // [[Ic + m cx cx^T, m cx], [m cx^T, m 1]]  with cx = skew(c)
    const [x, y, z] = c;
    const cx = [0, -z, y, z, 0, -x, -y, x, 0];
    const A = [
      Ic[0] + m * (y * y + z * z), Ic[1] - m * x * y, Ic[2] - m * x * z,
      Ic[3] - m * x * y, Ic[4] + m * (x * x + z * z), Ic[5] - m * y * z,
      Ic[6] - m * x * z, Ic[7] - m * y * z, Ic[8] + m * (x * x + y * y),
    ];
    out.fill(0);
    for (let r = 0; r < 3; r++)
      for (let k = 0; k < 3; k++) {
        out[6 * r + k] = A[3 * r + k];
        out[6 * r + 3 + k] = m * cx[3 * r + k];
        out[6 * (3 + r) + k] = m * cx[3 * k + r]; // (m cx)^T
      }
    out[21] = m; out[28] = m; out[35] = m;
    return out;
  }
  // I_p += X^T I X, with X = rot(E) * trans(r): child coords from parent coords (E: child<-parent)
  const tmpA = new Float64Array(9), tmpB = new Float64Array(9), tmpC = new Float64Array(9);
  function addTransformedInertia(Ip, Ic, E, r) {
    // rotate blocks: A' = E^T A E, B' = E^T B E, C' = E^T C E
    const blk = (I, ro, co, out) => {
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) out[3 * i + j] = I[6 * (ro + i) + co + j];
      return out;
    };
    const rot = (M) => mm(mt(E), mm(M, E));
    const A = rot(blk(Ic, 0, 0, tmpA)), B = rot(blk(Ic, 0, 3, tmpB)), C = rot(blk(Ic, 3, 3, tmpC));
    const rx = [0, -r[2], r[1], r[2], 0, -r[0], -r[1], r[0], 0];
    const rxB = mm(rx, mt(B)), Brx = mm(B, rx), rxC = mm(rx, C), rxCrx = mm(rxC, rx), Crx = mm(C, rx);
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        Ip[6 * i + j] += A[3 * i + j] + rxB[3 * i + j] - Brx[3 * i + j] - rxCrx[3 * i + j];
        Ip[6 * i + 3 + j] += B[3 * i + j] + rxC[3 * i + j];
        Ip[6 * (3 + i) + j] += B[3 * j + i] - Crx[3 * i + j];
        Ip[6 * (3 + i) + 3 + j] += C[3 * i + j];
      }
  }
  // motion transform parent -> child: [E w; E (v - r x w)]
  function xMotion(E, r, m) {
    const w = [m[0], m[1], m[2]], v = [m[3], m[4], m[5]], rw = cross(r, w);
    const a = mv(E, w), b = mv(E, [v[0] - rw[0], v[1] - rw[1], v[2] - rw[2]]);
    return [a[0], a[1], a[2], b[0], b[1], b[2]];
  }
  // force transform child -> parent: [E^T n + r x E^T f; E^T f]
  function xForceT(E, r, f) {
    const n = mtv(E, [f[0], f[1], f[2]]), ff = mtv(E, [f[3], f[4], f[5]]), rf = cross(r, ff);
    return [n[0] + rf[0], n[1] + rf[1], n[2] + rf[2], ff[0], ff[1], ff[2]];
  }
  const crossM = (v, m) => { // v x_m m
    const w = [v[0], v[1], v[2]], vv = [v[3], v[4], v[5]], a = cross(w, [m[0], m[1], m[2]]), b = cross(w, [m[3], m[4], m[5]]), c = cross(vv, [m[0], m[1], m[2]]);
    return [a[0], a[1], a[2], b[0] + c[0], b[1] + c[1], b[2] + c[2]];
  };
  const crossF = (v, f) => { // v x* f
    const w = [v[0], v[1], v[2]], vv = [v[3], v[4], v[5]], n = [f[0], f[1], f[2]], ff = [f[3], f[4], f[5]];
    const a = cross(w, n), b = cross(vv, ff), c = cross(w, ff);
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2], c[0], c[1], c[2]];
  };
  const I6v = (I, v) => { const o = [0, 0, 0, 0, 0, 0]; for (let i = 0; i < 6; i++) { let s = 0; for (let j = 0; j < 6; j++) s += I[6 * i + j] * v[j]; o[i] = s; } return o; };
  function solve6(Min, b) { // Gaussian elimination with partial pivoting
    const M = Array.from(Min), x = b.slice();
    for (let c = 0; c < 6; c++) {
      let p = c;
      for (let r = c + 1; r < 6; r++) if (Math.abs(M[6 * r + c]) > Math.abs(M[6 * p + c])) p = r;
      if (p !== c) { for (let k = 0; k < 6; k++) [M[6 * c + k], M[6 * p + k]] = [M[6 * p + k], M[6 * c + k]]; [x[c], x[p]] = [x[p], x[c]]; }
      const d = M[6 * c + c];
      for (let r = c + 1; r < 6; r++) {
        const f = M[6 * r + c] / d;
        if (!f) continue;
        for (let k = c; k < 6; k++) M[6 * r + k] -= f * M[6 * c + k];
        x[r] -= f * x[c];
      }
    }
    for (let c = 5; c >= 0; c--) {
      let s = x[c];
      for (let k = c + 1; k < 6; k++) s -= M[6 * c + k] * x[k];
      x[c] = s / M[6 * c + c];
    }
    return x;
  }

  // ------------------------------------------------------------------ the articulated body
  // spec.links[i] = { name, parent (-1 for the base = link 0), axis (hinge, unit, link frame),
  //                   offset (joint origin in the parent link frame), mass, com, inertia (3x3 at com),
  //                   lo, hi (rad, optional), dof (id, optional) }
  function createArticulatedBody(spec) {
    const L = spec.links, n = L.length;
    const I = L.map((l) => rigidInertia(l.mass || 0, l.com || [0, 0, 0], l.inertia || [0, 0, 0, 0, 0, 0, 0, 0, 0]));
    const S = {
      n, links: L,
      // base (link 0): world position of its origin, orientation (world <- link), spatial velocity in link coords
      p: [0, 0, 0], R: [1, 0, 0, 0, 1, 0, 0, 0, 1], vb: [0, 0, 0, 0, 0, 0],
      q: new Float64Array(n), qd: new Float64Array(n), qdd: new Float64Array(n), ab: [0, 0, 0, 0, 0, 0],
      tau: new Float64Array(n), armature: new Float64Array(n),
      // per-link world state (updated by kinematics())
      Rw: L.map(() => [1, 0, 0, 0, 1, 0, 0, 0, 1]), ow: L.map(() => [0, 0, 0]), v: L.map(() => [0, 0, 0, 0, 0, 0]),
      E: L.map(() => [1, 0, 0, 0, 1, 0, 0, 0, 1]), fext: L.map(() => [0, 0, 0, 0, 0, 0]),
      gravity: [0, 0, -9.81],
      fixedBase: !!spec.fixedBase, // base held (tests, kinematically driven bases)
    };
    // kinematics: link transforms, world poses and spatial velocities (link coords)
    function kinematics() {
      for (let i = 0; i < n; i++) {
        const l = L[i];
        if (i === 0) { S.Rw[0] = S.R; S.ow[0] = S.p; S.v[0] = S.vb; S.E[0] = [1, 0, 0, 0, 1, 0, 0, 0, 1]; continue; }
        const P = l.parent, Rj = axisAngle(l.axis, S.q[i]); // child axes in parent coords
        S.E[i] = mt(Rj);
        S.Rw[i] = mm(S.Rw[P], Rj);
        const o = mv(S.Rw[P], l.offset);
        S.ow[i] = [S.ow[P][0] + o[0], S.ow[P][1] + o[1], S.ow[P][2] + o[2]];
        const vp = xMotion(S.E[i], l.offset, S.v[P]), qd = S.qd[i];
        S.v[i] = [vp[0] + l.axis[0] * qd, vp[1] + l.axis[1] * qd, vp[2] + l.axis[2] * qd, vp[3], vp[4], vp[5]];
      }
    }
    // world velocity of a point given in link-local coordinates
    function pointVelocity(i, xl) {
      const v = S.v[i], w = [v[0], v[1], v[2]], c = cross(w, xl);
      return mv(S.Rw[i], [v[3] + c[0], v[4] + c[1], v[5] + c[2]]);
    }
    const toWorld = (i, xl) => { const r = mv(S.Rw[i], xl); return [S.ow[i][0] + r[0], S.ow[i][1] + r[1], S.ow[i][2] + r[2]]; };
    const toLocal = (i, xw) => mtv(S.Rw[i], [xw[0] - S.ow[i][0], xw[1] - S.ow[i][1], xw[2] - S.ow[i][2]]);
    function clearForces() { for (const f of S.fext) f.fill(0); }
    // world force F at world point x on link i (accumulated in link coords, about the link origin)
    function applyForce(i, F, x) {
      const Fl = mtv(S.Rw[i], F), xl = toLocal(i, x), nl = cross(xl, Fl), f = S.fext[i];
      f[0] += nl[0]; f[1] += nl[1]; f[2] += nl[2]; f[3] += Fl[0]; f[4] += Fl[1]; f[5] += Fl[2];
    }
    function applyGravity() {
      for (let i = 0; i < n; i++) if (L[i].mass) applyForce(i, [L[i].mass * S.gravity[0], L[i].mass * S.gravity[1], L[i].mass * S.gravity[2]], toWorld(i, L[i].com));
    }
    // articulated-body algorithm: base acceleration + qdd from tau, fext, armature
    const IA = L.map(() => new Float64Array(36)), pA = L.map(() => [0, 0, 0, 0, 0, 0]), U = L.map(() => [0, 0, 0, 0, 0, 0]);
    const D = new Float64Array(n), u = new Float64Array(n), c = L.map(() => [0, 0, 0, 0, 0, 0]);
    function aba() {
      for (let i = 0; i < n; i++) {
        IA[i].set(I[i]);
        const vi = S.v[i], Iv = I6v(I[i], vi), b = crossF(vi, Iv), fe = S.fext[i];
        pA[i] = [b[0] - fe[0], b[1] - fe[1], b[2] - fe[2], b[3] - fe[3], b[4] - fe[4], b[5] - fe[5]];
        if (i > 0) { const a = L[i].axis, qd = S.qd[i]; c[i] = crossM(vi, [a[0] * qd, a[1] * qd, a[2] * qd, 0, 0, 0]); }
      }
      for (let i = n - 1; i >= 1; i--) {
        const a = L[i].axis, Ia = IA[i];
        const Ui = U[i];
        for (let r = 0; r < 6; r++) Ui[r] = Ia[6 * r] * a[0] + Ia[6 * r + 1] * a[1] + Ia[6 * r + 2] * a[2];
        D[i] = a[0] * Ui[0] + a[1] * Ui[1] + a[2] * Ui[2] + S.armature[i];
        u[i] = S.tau[i] - (a[0] * pA[i][0] + a[1] * pA[i][1] + a[2] * pA[i][2]);
        const Iaa = new Float64Array(36);
        for (let r = 0; r < 6; r++) for (let k = 0; k < 6; k++) Iaa[6 * r + k] = Ia[6 * r + k] - (Ui[r] * Ui[k]) / D[i];
        const Ic = I6v(Iaa, c[i]), pa = pA[i].map((x, k) => x + Ic[k] + (Ui[k] * u[i]) / D[i]);
        const P = L[i].parent;
        addTransformedInertia(IA[P], Iaa, S.E[i], L[i].offset);
        const pp = xForceT(S.E[i], L[i].offset, pa);
        for (let k = 0; k < 6; k++) pA[P][k] += pp[k];
      }
      const a0 = S.fixedBase ? [0, 0, 0, 0, 0, 0] : solve6(IA[0], pA[0].map((x) => -x));
      S.ab = a0;
      const acc = L.map(() => null);
      acc[0] = a0;
      for (let i = 1; i < n; i++) {
        const P = L[i].parent, a = L[i].axis, ap = xMotion(S.E[i], L[i].offset, acc[P]);
        const ai = [ap[0] + c[i][0], ap[1] + c[i][1], ap[2] + c[i][2], ap[3] + c[i][3], ap[4] + c[i][4], ap[5] + c[i][5]];
        const Ui = U[i];
        let s = 0;
        for (let k = 0; k < 6; k++) s += Ui[k] * ai[k];
        const qdd = (u[i] - s) / D[i];
        S.qdd[i] = qdd;
        ai[0] += a[0] * qdd; ai[1] += a[1] * qdd; ai[2] += a[2] * qdd;
        acc[i] = ai;
      }
      S.acc = acc;
    }
    // semi-implicit Euler
    function integrate(dt) {
      if (!S.fixedBase) for (let k = 0; k < 6; k++) S.vb[k] += dt * S.ab[k];
      for (let i = 1; i < n; i++) S.qd[i] += dt * S.qdd[i];
      const w = [S.vb[0], S.vb[1], S.vb[2]], vl = [S.vb[3], S.vb[4], S.vb[5]], vw = mv(S.R, vl);
      S.p = [S.p[0] + dt * vw[0], S.p[1] + dt * vw[1], S.p[2] + dt * vw[2]];
      S.R = orthonormalize(mm(S.R, expSO3(w, dt)));
      for (let i = 1; i < n; i++) {
        S.q[i] += dt * S.qd[i];
        const l = L[i];
        if (l.lo != null && S.q[i] < l.lo) { S.q[i] = l.lo; if (S.qd[i] < 0) S.qd[i] = 0; }
        if (l.hi != null && S.q[i] > l.hi) { S.q[i] = l.hi; if (S.qd[i] > 0) S.qd[i] = 0; }
      }
    }
    // RNEA with the base held (a0 = 0), qdd = 0: joint torques that balance gravity (if applied)
    // and the current external forces at the current configuration and velocities
    function inverseDynamicsStatic(withVelocity = false) {
      const f = L.map(() => null), out = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const vi = withVelocity ? S.v[i] : [0, 0, 0, 0, 0, 0];
        const b = withVelocity ? crossF(vi, I6v(I[i], vi)) : [0, 0, 0, 0, 0, 0], fe = S.fext[i];
        f[i] = [b[0] - fe[0], b[1] - fe[1], b[2] - fe[2], b[3] - fe[3], b[4] - fe[4], b[5] - fe[5]];
      }
      for (let i = n - 1; i >= 1; i--) {
        const a = L[i].axis;
        out[i] = a[0] * f[i][0] + a[1] * f[i][1] + a[2] * f[i][2];
        const P = L[i].parent, fp = xForceT(S.E[i], L[i].offset, f[i]);
        for (let k = 0; k < 6; k++) f[P][k] += fp[k];
      }
      S.baseResidual = f[0]; // what the base would have to receive to stay put
      return out;
    }
    // totals for checks: linear/angular momentum about the world origin, kinetic energy, COM
    function totals() {
      let m = 0, com = [0, 0, 0], P = [0, 0, 0], Hh = [0, 0, 0], T = 0;
      for (let i = 0; i < n; i++) {
        const l = L[i];
        if (!l.mass) continue;
        const cw = toWorld(i, l.com), vw = pointVelocity(i, l.com), w = mv(S.Rw[i], [S.v[i][0], S.v[i][1], S.v[i][2]]);
        const Iw = mm(S.Rw[i], mm(l.inertia, mt(S.Rw[i]))), Iww = mv(Iw, w);
        m += l.mass;
        for (let k = 0; k < 3; k++) { com[k] += l.mass * cw[k]; P[k] += l.mass * vw[k]; }
        const rxp = cross(cw, vw);
        for (let k = 0; k < 3; k++) Hh[k] += l.mass * rxp[k] + Iww[k];
        T += 0.5 * l.mass * dot(vw, vw) + 0.5 * dot(w, Iww);
      }
      return { mass: m, com: com.map((x) => x / m), P, H: Hh, T };
    }
    return Object.assign(S, { kinematics, pointVelocity, toWorld, toLocal, clearForces, applyForce, applyGravity, aba, integrate, inverseDynamicsStatic, totals });
  }

  const api = { createArticulatedBody, math: { cross, dot, mv, mtv, mm, mt, axisAngle, expSO3, orthonormalize } };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.LUCID_MULTIBODY = api;
})(typeof window !== "undefined" ? window : globalThis);
