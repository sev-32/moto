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
  // Hot paths (kinematics, ABA, RNEA) work on preallocated typed arrays: no allocation per step.
  function createArticulatedBody(spec) {
    const L = spec.links, n = L.length;
    const I = L.map((l) => rigidInertia(l.mass || 0, l.com || [0, 0, 0], l.inertia || [0, 0, 0, 0, 0, 0, 0, 0, 0]));
    const AX = L.map((l) => Float64Array.from(l.axis || [0, 0, 0])), OFF = L.map((l) => Float64Array.from(l.offset || [0, 0, 0]));
    const PAR = Int32Array.from(L.map((l) => (l.parent == null ? -1 : l.parent)));
    const f9 = () => Float64Array.of(1, 0, 0, 0, 1, 0, 0, 0, 1), f6 = () => new Float64Array(6), f3 = () => new Float64Array(3);
    const S = {
      n, links: L,
      // base (link 0): world position of its origin, orientation (world <- link), spatial velocity in link coords
      p: [0, 0, 0], R: [1, 0, 0, 0, 1, 0, 0, 0, 1], vb: [0, 0, 0, 0, 0, 0],
      q: new Float64Array(n), qd: new Float64Array(n), qdd: new Float64Array(n), ab: [0, 0, 0, 0, 0, 0],
      tau: new Float64Array(n), armature: new Float64Array(n),
      // articulated inertia about each hinge at the last aba() (kg m^2, armature excluded): the
      // inertia a torque at that hinge moves, the rest of the tree free
      Dart: new Float64Array(n),
      // per-link world state (updated by kinematics())
      Rw: L.map(f9), ow: L.map(f3), v: L.map(f6), E: L.map(f9), fext: L.map(f6),
      gravity: [0, 0, -9.81],
      fixedBase: !!spec.fixedBase, // base held (tests, kinematically driven bases)
      limitFailsafe: spec.limitFailsafe ?? 0, // rad beyond lo/hi before positions are clamped (null: never)
    };
    const Rj = new Float64Array(9);
    // kinematics: link transforms, world poses and spatial velocities (link coords)
    function kinematics() {
      const R0 = S.R, p0 = S.p, vb = S.vb, Rw0 = S.Rw[0], ow0 = S.ow[0], v0 = S.v[0];
      for (let k = 0; k < 9; k++) Rw0[k] = R0[k];
      ow0[0] = p0[0]; ow0[1] = p0[1]; ow0[2] = p0[2];
      for (let k = 0; k < 6; k++) v0[k] = vb[k];
      for (let i = 1; i < n; i++) {
        const P = PAR[i], a = AX[i], r = OFF[i], th = S.q[i];
        // Rj: child axes in parent coords (axis-angle), E = Rj^T
        const cth = Math.cos(th), sth = Math.sin(th), t = 1 - cth, x = a[0], y = a[1], z = a[2];
        Rj[0] = t * x * x + cth; Rj[1] = t * x * y - sth * z; Rj[2] = t * x * z + sth * y;
        Rj[3] = t * x * y + sth * z; Rj[4] = t * y * y + cth; Rj[5] = t * y * z - sth * x;
        Rj[6] = t * x * z - sth * y; Rj[7] = t * y * z + sth * x; Rj[8] = t * z * z + cth;
        const E = S.E[i];
        E[0] = Rj[0]; E[1] = Rj[3]; E[2] = Rj[6]; E[3] = Rj[1]; E[4] = Rj[4]; E[5] = Rj[7]; E[6] = Rj[2]; E[7] = Rj[5]; E[8] = Rj[8];
        const RP = S.Rw[P], RW = S.Rw[i];
        for (let r0 = 0; r0 < 3; r0++) {
          const a0 = RP[3 * r0], a1 = RP[3 * r0 + 1], a2 = RP[3 * r0 + 2];
          RW[3 * r0] = a0 * Rj[0] + a1 * Rj[3] + a2 * Rj[6];
          RW[3 * r0 + 1] = a0 * Rj[1] + a1 * Rj[4] + a2 * Rj[7];
          RW[3 * r0 + 2] = a0 * Rj[2] + a1 * Rj[5] + a2 * Rj[8];
        }
        const oP = S.ow[P], oI = S.ow[i];
        oI[0] = oP[0] + RP[0] * r[0] + RP[1] * r[1] + RP[2] * r[2];
        oI[1] = oP[1] + RP[3] * r[0] + RP[4] * r[1] + RP[5] * r[2];
        oI[2] = oP[2] + RP[6] * r[0] + RP[7] * r[1] + RP[8] * r[2];
        // v_i = X v_P + S qd with X v = [E w; E (v - r x w)]
        const vP = S.v[P], vI = S.v[i], wx = vP[0], wy = vP[1], wz = vP[2];
        const tx = vP[3] - (r[1] * wz - r[2] * wy), ty = vP[4] - (r[2] * wx - r[0] * wz), tz = vP[5] - (r[0] * wy - r[1] * wx), qd = S.qd[i];
        vI[0] = E[0] * wx + E[1] * wy + E[2] * wz + a[0] * qd;
        vI[1] = E[3] * wx + E[4] * wy + E[5] * wz + a[1] * qd;
        vI[2] = E[6] * wx + E[7] * wy + E[8] * wz + a[2] * qd;
        vI[3] = E[0] * tx + E[1] * ty + E[2] * tz;
        vI[4] = E[3] * tx + E[4] * ty + E[5] * tz;
        vI[5] = E[6] * tx + E[7] * ty + E[8] * tz;
      }
    }
    // world velocity of a point given in link-local coordinates
    function pointVelocity(i, xl) {
      const v = S.v[i], c = cross([v[0], v[1], v[2]], xl);
      return mv(S.Rw[i], [v[3] + c[0], v[4] + c[1], v[5] + c[2]]);
    }
    const toWorld = (i, xl) => { const R = S.Rw[i], o = S.ow[i]; return [o[0] + R[0] * xl[0] + R[1] * xl[1] + R[2] * xl[2], o[1] + R[3] * xl[0] + R[4] * xl[1] + R[5] * xl[2], o[2] + R[6] * xl[0] + R[7] * xl[1] + R[8] * xl[2]]; };
    const toLocal = (i, xw) => mtv(S.Rw[i], [xw[0] - S.ow[i][0], xw[1] - S.ow[i][1], xw[2] - S.ow[i][2]]);
    function clearForces() { for (const f of S.fext) f.fill(0); }
    // world force F at world point x on link i (accumulated in link coords, about the link origin)
    function applyForce(i, F, x) {
      const R = S.Rw[i], o = S.ow[i];
      const Fx = R[0] * F[0] + R[3] * F[1] + R[6] * F[2], Fy = R[1] * F[0] + R[4] * F[1] + R[7] * F[2], Fz = R[2] * F[0] + R[5] * F[1] + R[8] * F[2];
      const dx = x[0] - o[0], dy = x[1] - o[1], dz = x[2] - o[2];
      const lx = R[0] * dx + R[3] * dy + R[6] * dz, ly = R[1] * dx + R[4] * dy + R[7] * dz, lz = R[2] * dx + R[5] * dy + R[8] * dz;
      const f = S.fext[i];
      f[0] += ly * Fz - lz * Fy; f[1] += lz * Fx - lx * Fz; f[2] += lx * Fy - ly * Fx; f[3] += Fx; f[4] += Fy; f[5] += Fz;
    }
    function applyGravity() {
      const g = S.gravity;
      for (let i = 0; i < n; i++) { const m = L[i].mass; if (m) applyForce(i, [m * g[0], m * g[1], m * g[2]], toWorld(i, L[i].com)); }
    }
    // ---- allocation-free spatial kernels
    const IA = L.map(() => new Float64Array(36)), pA = L.map(f6), U = L.map(f6), c = L.map(f6), acc = L.map(f6);
    const D = new Float64Array(n), u = new Float64Array(n), Iaa = new Float64Array(36), pa = f6(), t6 = f6();
    const bA = new Float64Array(9), bB = new Float64Array(9), bC = new Float64Array(9), t9 = new Float64Array(9), t9b = new Float64Array(9);
    // v x* (I v) - fext  -> out (bias force of link i)
    function biasForce(i, out) {
      const Ii = I[i], v = S.v[i], fe = S.fext[i];
      for (let r = 0; r < 6; r++) { let s = 0; for (let k = 0; k < 6; k++) s += Ii[6 * r + k] * v[k]; t6[r] = s; }
      const wx = v[0], wy = v[1], wz = v[2], vx = v[3], vy = v[4], vz = v[5];
      const nx = t6[0], ny = t6[1], nz = t6[2], fx = t6[3], fy = t6[4], fz = t6[5];
      out[0] = wy * nz - wz * ny + vy * fz - vz * fy - fe[0];
      out[1] = wz * nx - wx * nz + vz * fx - vx * fz - fe[1];
      out[2] = wx * ny - wy * nx + vx * fy - vy * fx - fe[2];
      out[3] = wy * fz - wz * fy - fe[3];
      out[4] = wz * fx - wx * fz - fe[4];
      out[5] = wx * fy - wy * fx - fe[5];
    }
    // Ip += X^T Ic X, X = rot(E) * trans(r) (child <- parent)
    function addXtIX(Ip, Ic, E, r) {
      // rotate blocks: A' = E^T A E etc.
      const rotBlock = (ro, co, out) => {
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { let s = 0; for (let k = 0; k < 3; k++) s += Ic[6 * (ro + i) + co + k] * E[3 * k + j]; t9[3 * i + j] = s; }
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { let s = 0; for (let k = 0; k < 3; k++) s += E[3 * k + i] * t9[3 * k + j]; out[3 * i + j] = s; }
      };
      rotBlock(0, 0, bA); rotBlock(0, 3, bB); rotBlock(3, 3, bC);
      const r0 = r[0], r1 = r[1], r2 = r[2];
      // rx*B^T, B*rx, rx*C, rx*C*rx, C*rx with rx = skew(r)
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) {
          // rx row i: [0,-r2,r1],[r2,0,-r0],[-r1,r0,0]
          const rxi0 = i === 0 ? 0 : i === 1 ? r2 : -r1, rxi1 = i === 0 ? -r2 : i === 1 ? 0 : r0, rxi2 = i === 0 ? r1 : i === 1 ? -r0 : 0;
          const rxj0 = j === 0 ? 0 : j === 1 ? r2 : -r1, rxj1 = j === 0 ? -r2 : j === 1 ? 0 : r0, rxj2 = j === 0 ? r1 : j === 1 ? -r0 : 0; // row j of rx
          // (rx B^T)_ij = sum_k rx_ik B_jk
          const rxBt = rxi0 * bB[3 * j] + rxi1 * bB[3 * j + 1] + rxi2 * bB[3 * j + 2];
          // (B rx)_ij = sum_k B_ik rx_kj ; rx_kj = -rx_jk
          const Brx = -(bB[3 * i] * rxj0 + bB[3 * i + 1] * rxj1 + bB[3 * i + 2] * rxj2);
          const rxC = rxi0 * bC[j] + rxi1 * bC[3 + j] + rxi2 * bC[6 + j];
          const Crx = -(bC[3 * i] * rxj0 + bC[3 * i + 1] * rxj1 + bC[3 * i + 2] * rxj2);
          t9b[3 * i + j] = rxC; // keep rx*C for rx*C*rx
          Ip[6 * i + j] += bA[3 * i + j] + rxBt - Brx;
          Ip[6 * i + 3 + j] += bB[3 * i + j] + rxC;
          Ip[6 * (3 + i) + j] += bB[3 * j + i] - Crx;
          Ip[6 * (3 + i) + 3 + j] += bC[3 * i + j];
        }
      // - rx*C*rx term of the angular block
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) {
          const rxj0 = j === 0 ? 0 : j === 1 ? r2 : -r1, rxj1 = j === 0 ? -r2 : j === 1 ? 0 : r0, rxj2 = j === 0 ? r1 : j === 1 ? -r0 : 0;
          const v = -(t9b[3 * i] * rxj0 + t9b[3 * i + 1] * rxj1 + t9b[3 * i + 2] * rxj2); // (rxC rx)_ij
          Ip[6 * i + j] -= v;
        }
    }
    // f_parent += X^T f  = [E^T n + r x E^T f; E^T f]
    function addXtF(fp, E, r, f) {
      const nx = E[0] * f[0] + E[3] * f[1] + E[6] * f[2], ny = E[1] * f[0] + E[4] * f[1] + E[7] * f[2], nz = E[2] * f[0] + E[5] * f[1] + E[8] * f[2];
      const fx = E[0] * f[3] + E[3] * f[4] + E[6] * f[5], fy = E[1] * f[3] + E[4] * f[4] + E[7] * f[5], fz = E[2] * f[3] + E[5] * f[4] + E[8] * f[5];
      fp[0] += nx + r[1] * fz - r[2] * fy; fp[1] += ny + r[2] * fx - r[0] * fz; fp[2] += nz + r[0] * fy - r[1] * fx;
      fp[3] += fx; fp[4] += fy; fp[5] += fz;
    }
    // out = X m (parent motion -> child) = [E w; E (v - r x w)]
    function xMot(E, r, m, out) {
      const wx = m[0], wy = m[1], wz = m[2], tx = m[3] - (r[1] * wz - r[2] * wy), ty = m[4] - (r[2] * wx - r[0] * wz), tz = m[5] - (r[0] * wy - r[1] * wx);
      out[0] = E[0] * wx + E[1] * wy + E[2] * wz; out[1] = E[3] * wx + E[4] * wy + E[5] * wz; out[2] = E[6] * wx + E[7] * wy + E[8] * wz;
      out[3] = E[0] * tx + E[1] * ty + E[2] * tz; out[4] = E[3] * tx + E[4] * ty + E[5] * tz; out[5] = E[6] * tx + E[7] * ty + E[8] * tz;
    }
    // articulated-body algorithm: base acceleration + qdd from tau, fext, armature
    function aba() {
      for (let i = 0; i < n; i++) {
        IA[i].set(I[i]);
        biasForce(i, pA[i]);
        if (i > 0) {
          const v = S.v[i], a = AX[i], qd = S.qd[i], mx = a[0] * qd, my = a[1] * qd, mz = a[2] * qd, ci = c[i];
          ci[0] = v[1] * mz - v[2] * my; ci[1] = v[2] * mx - v[0] * mz; ci[2] = v[0] * my - v[1] * mx;
          ci[3] = v[4] * mz - v[5] * my; ci[4] = v[5] * mx - v[3] * mz; ci[5] = v[3] * my - v[4] * mx;
        }
      }
      for (let i = n - 1; i >= 1; i--) {
        const a = AX[i], Ia = IA[i], Ui = U[i], pAi = pA[i], ci = c[i];
        for (let r = 0; r < 6; r++) Ui[r] = Ia[6 * r] * a[0] + Ia[6 * r + 1] * a[1] + Ia[6 * r + 2] * a[2];
        const Di = a[0] * Ui[0] + a[1] * Ui[1] + a[2] * Ui[2] + S.armature[i];
        D[i] = Di;
        S.Dart[i] = Di - S.armature[i];
        const ui = S.tau[i] - (a[0] * pAi[0] + a[1] * pAi[1] + a[2] * pAi[2]);
        u[i] = ui;
        const inv = 1 / Di;
        for (let r = 0; r < 6; r++) { const ur = Ui[r] * inv; for (let k = 0; k < 6; k++) Iaa[6 * r + k] = Ia[6 * r + k] - ur * Ui[k]; }
        for (let r = 0; r < 6; r++) { let s = pAi[r] + Ui[r] * ui * inv; for (let k = 0; k < 6; k++) s += Iaa[6 * r + k] * ci[k]; pa[r] = s; }
        const P = PAR[i];
        addXtIX(IA[P], Iaa, S.E[i], OFF[i]);
        addXtF(pA[P], S.E[i], OFF[i], pa);
      }
      const a0 = acc[0];
      if (S.fixedBase) a0.fill(0);
      else { const x = solve6(IA[0], [-pA[0][0], -pA[0][1], -pA[0][2], -pA[0][3], -pA[0][4], -pA[0][5]]); for (let k = 0; k < 6; k++) a0[k] = x[k]; }
      S.ab = Array.from(a0);
      for (let i = 1; i < n; i++) {
        const P = PAR[i], a = AX[i], ai = acc[i], Ui = U[i], ci = c[i];
        xMot(S.E[i], OFF[i], acc[P], ai);
        for (let k = 0; k < 6; k++) ai[k] += ci[k];
        let s = 0;
        for (let k = 0; k < 6; k++) s += Ui[k] * ai[k];
        const qdd = (u[i] - s) / D[i];
        S.qdd[i] = qdd;
        ai[0] += a[0] * qdd; ai[1] += a[1] * qdd; ai[2] += a[2] * qdd;
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
      // hinge ranges are the caller's business (limit torques inside the dynamics); a position
      // clamp here would remove motion without its constraint force. Only a wide failsafe stays.
      const fs = S.limitFailsafe;
      for (let i = 1; i < n; i++) {
        S.q[i] += dt * S.qd[i];
        const l = L[i];
        if (fs == null) continue;
        if (l.lo != null && S.q[i] < l.lo - fs) { S.q[i] = l.lo - fs; if (S.qd[i] < 0) S.qd[i] = 0; }
        if (l.hi != null && S.q[i] > l.hi + fs) { S.q[i] = l.hi + fs; if (S.qd[i] > 0) S.qd[i] = 0; }
      }
    }
    // RNEA with the base held (a0 = 0), qdd = 0: joint torques that balance gravity (if applied)
    // and the current external forces at the current configuration and velocities
    const fR = L.map(f6), tauOut = new Float64Array(n);
    function inverseDynamicsStatic(withVelocity = false) {
      for (let i = 0; i < n; i++) {
        const f = fR[i], fe = S.fext[i];
        if (withVelocity) biasForce(i, f);
        else for (let k = 0; k < 6; k++) f[k] = -fe[k];
      }
      for (let i = n - 1; i >= 1; i--) {
        const a = AX[i], f = fR[i];
        tauOut[i] = a[0] * f[0] + a[1] * f[1] + a[2] * f[2];
        addXtF(fR[PAR[i]], S.E[i], OFF[i], f);
      }
      S.baseResidual = Array.from(fR[0]); // what the base would have to receive to stay put
      return tauOut;
    }
    // ---- whole-body contact forces (inverse statics). The forces the contacts should carry so that
    // (1) together they give the body the net force and moment asked for (its balance), (2) they
    // meet extra task rows (e.g. the roll moment on a bike held up by a hand), and (3) the joints
    // need the least effort to carry them from contact to contact:
    //   minimise  sum_i w_i (tau_i / cap_i)^2,  tau = tau0 - sum_c J_c^T f_c
    // (tau0: the joint torques with no contact force - holding the limbs up against gravity, base
    // held; J_c: the point Jacobian at the contact) plus a little of each force. A contact's force is
    // a nonnegative combination of its directions (a friction pyramid for a contact that can only
    // push, the six axis directions for a hand that holds on, each capped), so it is a bounded
    // least-squares problem, solved exactly on its normal equations by a primal active-set method
    // (Lawson-Hanson), warm-started from the last solution.
    //   spec: { contacts: [{ link, x: world point, dirs: [unit world vectors], ub?: N per direction }],
    //           tau0: per link, cap: per link (0 = not a hinge row), wJoint?: per link,
    //           net: { F, M, about, wF, wM, lenM }, rows?: [{ coef(ci, dir) -> number, target, w, scale }],
    //           scale: N (forces are solved as multiples of it), reg, warm?: beta (same layout) }
    const ancestors = [];
    const ancestorsOf = (l) => { if (!ancestors[l]) { const a = []; for (let x = l; x > 0; x = PAR[x]) a.push(x); ancestors[l] = a; } return ancestors[l]; };
    function contactForcePlan(spec) {
      const C = spec.contacts, sc = spec.scale || 1, net = spec.net, rows = spec.rows || [];
      const cols = [];
      for (let ci = 0; ci < C.length; ci++) for (const d of C[ci].dirs) cols.push({ ci, d, ub: C[ci].ub != null ? C[ci].ub / sc : Infinity });
      const nv = cols.length, hingeRow = new Int32Array(n).fill(-1);
      let nr = 6 + rows.length;
      for (let i = 1; i < n; i++) if (spec.cap[i] > 0) hingeRow[i] = nr++;
      // A (rows x nv, weights folded in as sqrt(w)) and b; the joint rows sparse per column
      const lenM = net.lenM || 0.1, sF = Math.sqrt(net.wF ?? 1e4), sM = Math.sqrt(net.wM ?? 1e4);
      const dense = new Float64Array((6 + rows.length) * nv), b = new Float64Array(nr), sparse = new Array(nv);
      const about = net.about;
      for (let k = 0; k < 3; k++) { b[k] = (sF * net.F[k]) / sc; b[3 + k] = (sM * net.M[k]) / (sc * lenM); }
      rows.forEach((r, k) => { b[6 + k] = (Math.sqrt(r.w) * r.target) / (r.scale || sc); });
      const wJ = spec.wJoint;
      for (let i = 1; i < n; i++) if (hingeRow[i] >= 0) b[hingeRow[i]] = (-Math.sqrt(wJ ? wJ[i] : 1) * spec.tau0[i]) / spec.cap[i];
      for (let j = 0; j < nv; j++) {
        const { ci, d } = cols[j], c = C[ci], x = c.x, r = [x[0] - about[0], x[1] - about[1], x[2] - about[2]], m = cross(r, d);
        for (let k = 0; k < 3; k++) { dense[k * nv + j] = sF * d[k]; dense[(3 + k) * nv + j] = (sM * m[k]) / lenM; }
        rows.forEach((rw, k) => { dense[(6 + k) * nv + j] = (Math.sqrt(rw.w) * rw.coef(ci, d) * sc) / (rw.scale || sc); });
        const sp = [];
        for (const li of ancestorsOf(c.link)) {
          const hr = hingeRow[li];
          if (hr < 0) continue;
          const R = S.Rw[li], a = AX[li], aw = [R[0] * a[0] + R[1] * a[1] + R[2] * a[2], R[3] * a[0] + R[4] * a[1] + R[5] * a[2], R[6] * a[0] + R[7] * a[1] + R[8] * a[2]];
          const o = S.ow[li], J = cross(aw, [x[0] - o[0], x[1] - o[1], x[2] - o[2]]);
          sp.push(hr, (-Math.sqrt(wJ ? wJ[li] : 1) * dot(J, d) * sc) / spec.cap[li]);
        }
        sparse[j] = sp;
      }
      // normal equations Q = A^T A + reg I, g = A^T b
      const Q = new Float64Array(nv * nv), g = new Float64Array(nv), nd = 6 + rows.length, reg = spec.reg ?? 1e-3;
      for (let r = 0; r < nd; r++) {
        const row = r * nv, br = b[r];
        for (let j = 0; j < nv; j++) {
          const aj = dense[row + j];
          if (!aj) continue;
          g[j] += aj * br;
          for (let k = j; k < nv; k++) { const ak = dense[row + k]; if (ak) Q[j * nv + k] += aj * ak; }
        }
      }
      const byRow = new Map();
      for (let j = 0; j < nv; j++) { const sp = sparse[j]; for (let t = 0; t < sp.length; t += 2) { let l = byRow.get(sp[t]); if (!l) byRow.set(sp[t], (l = [])); l.push(j, sp[t + 1]); } }
      for (const [r, l] of byRow) {
        const br = b[r];
        for (let s = 0; s < l.length; s += 2) {
          const j = l[s], aj = l[s + 1];
          g[j] += aj * br;
          for (let t = 0; t < l.length; t += 2) { const k = l[t]; if (k >= j) Q[j * nv + k] += aj * l[t + 1]; }
        }
      }
      for (let j = 0; j < nv; j++) { Q[j * nv + j] += reg; for (let k = j + 1; k < nv; k++) Q[k * nv + j] = Q[j * nv + k]; }
      const ub = Float64Array.from(cols, (c) => c.ub);
      const x0 = new Float64Array(nv);
      if (spec.warm && spec.warm.length === nv) for (let j = 0; j < nv; j++) x0[j] = Math.min(ub[j], Math.max(0, spec.warm[j] / sc));
      const res = boundedLSQ(Q, g, nv, x0, ub, 4 * nv + 20);
      // forces per contact, the joint torques they need, what they achieve
      const f = C.map(() => [0, 0, 0]), beta = new Float64Array(nv);
      for (let j = 0; j < nv; j++) { const v = res.x[j] * sc; beta[j] = v; if (!v) continue; const fc = f[cols[j].ci], d = cols[j].d; fc[0] += v * d[0]; fc[1] += v * d[1]; fc[2] += v * d[2]; }
      const tau = Float64Array.from(spec.tau0), netF = [0, 0, 0], netM = [0, 0, 0];
      for (let ci = 0; ci < C.length; ci++) {
        const fc = f[ci], x = C[ci].x;
        if (!fc[0] && !fc[1] && !fc[2]) continue;
        for (let k = 0; k < 3; k++) netF[k] += fc[k];
        const m = cross([x[0] - about[0], x[1] - about[1], x[2] - about[2]], fc);
        for (let k = 0; k < 3; k++) netM[k] += m[k];
        for (const li of ancestorsOf(C[ci].link)) {
          const R = S.Rw[li], a = AX[li], aw = [R[0] * a[0] + R[1] * a[1] + R[2] * a[2], R[3] * a[0] + R[4] * a[1] + R[5] * a[2], R[6] * a[0] + R[7] * a[1] + R[8] * a[2]];
          const o = S.ow[li];
          tau[li] -= dot(cross(aw, [x[0] - o[0], x[1] - o[1], x[2] - o[2]]), fc);
        }
      }
      const rowsOut = rows.map((rw) => { let v = 0; for (let j = 0; j < nv; j++) if (beta[j]) v += rw.coef(cols[j].ci, cols[j].d) * beta[j]; return v; });
      return { beta, f, tau, netF, netM, rowsOut, iters: res.iters, nv };
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
    return Object.assign(S, { kinematics, pointVelocity, toWorld, toLocal, clearForces, applyForce, applyGravity, aba, integrate, inverseDynamicsStatic, totals, contactForcePlan });
  }

  // min 1/2 x'Qx - g'x subject to 0 <= x <= ub (Q symmetric positive definite, n x n row-major):
  // primal active set (Lawson-Hanson with upper bounds). Each pass solves the free variables'
  // equations (Cholesky) with the others at their bounds; a solution outside the box is stepped
  // towards only until the first variable reaches its bound, which then joins the bound set; with
  // the free ones inside, the bound variable whose gradient most wants to leave its bound is freed.
  // Warm start: x (feasible after clipping). Returns { x, iters }.
  function boundedLSQ(Q, g, n, x, ub, maxIter) {
    const st = new Uint8Array(n); // 0 at 0, 1 free, 2 at ub
    for (let j = 0; j < n; j++) { x[j] = Math.min(ub[j], Math.max(0, x[j])); st[j] = x[j] <= 0 ? 0 : x[j] >= ub[j] ? 2 : 1; }
    const grad = new Float64Array(n);
    let it = 0, freed = -1;
    for (; it < maxIter; it++) {
      const F = [];
      for (let j = 0; j < n; j++) if (st[j] === 1) F.push(j);
      if (F.length) {
        const m = F.length, L = new Float64Array(m * m), rhs = new Float64Array(m);
        for (let a = 0; a < m; a++) {
          const ja = F[a];
          let s = g[ja];
          for (let k = 0; k < n; k++) if (st[k] !== 1 && x[k]) s -= Q[ja * n + k] * x[k];
          rhs[a] = s;
          for (let c = 0; c <= a; c++) L[a * m + c] = Q[ja * n + F[c]];
        }
        // Cholesky in place (lower), then solve
        let ok = true;
        for (let a = 0; a < m && ok; a++) {
          for (let c = 0; c <= a; c++) {
            let s = L[a * m + c];
            for (let k = 0; k < c; k++) s -= L[a * m + k] * L[c * m + k];
            if (a === c) { if (s <= 1e-14) { ok = false; break; } L[a * m + a] = Math.sqrt(s); }
            else L[a * m + c] = s / L[c * m + c];
          }
        }
        if (!ok) break;
        const z = rhs;
        for (let a = 0; a < m; a++) { let s = z[a]; for (let k = 0; k < a; k++) s -= L[a * m + k] * z[k]; z[a] = s / L[a * m + a]; }
        for (let a = m - 1; a >= 0; a--) { let s = z[a]; for (let k = a + 1; k < m; k++) s -= L[k * m + a] * z[k]; z[a] = s / L[a * m + a]; }
        // inside the box? else step towards it until the first bound
        let alpha = 1, block = -1, blockTo = 0;
        for (let a = 0; a < m; a++) {
          const j = F[a], zj = z[a];
          if (zj < 0) { const t = x[j] / (x[j] - zj); if (t < alpha) { alpha = t; block = j; blockTo = 0; } }
          else if (zj > ub[j]) { const t = (ub[j] - x[j]) / (zj - x[j]); if (t < alpha) { alpha = t; block = j; blockTo = 2; } }
        }
        // (the variable just freed blocking at once: rounding - it stays where it was; done)
        if (block >= 0 && block === freed && alpha < 1e-12) { st[block] = blockTo; break; }
        for (let a = 0; a < m; a++) { const j = F[a]; x[j] += alpha * (z[a] - x[j]); }
        freed = -1;
        if (block >= 0) { st[block] = blockTo; x[block] = blockTo === 0 ? 0 : ub[block]; continue; }
      }
      // optimality of the bound variables
      let worst = -1, wv = 1e-9;
      for (let j = 0; j < n; j++) {
        if (st[j] === 1) continue;
        let s = -g[j];
        for (let k = 0; k < n; k++) if (x[k]) s += Q[j * n + k] * x[k];
        grad[j] = s;
        const v = st[j] === 0 ? -s : s; // at 0 it wants up if the gradient is negative; at ub, down if positive
        if (v > wv) { wv = v; worst = j; }
      }
      if (worst < 0) break;
      st[worst] = 1; freed = worst;
    }
    return { x, iters: it };
  }

  const api = { createArticulatedBody, boundedLSQ, math: { cross, dot, mv, mtv, mm, mt, axisAngle, expSO3, orthonormalize } };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.LUCID_MULTIBODY = api;
})(typeof window !== "undefined" ? window : globalThis);
