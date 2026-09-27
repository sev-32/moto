// LUCID MOTO core · the rider's muscles (R1.5 musculotendon layer)
// ------------------------------------------------------------------------------------------
// The 84 musculotendon proxies of the LUCID Biomechanical Causal Rig (R1.5, lucid_bcr.muscles) on
// the physical rider's skeleton (46_rider_biomech.js). Each muscle is a polyline whose points are
// carried by her Semantic51 joints and were fitted to her mesh in the package; a follow point turns
// with only a fraction of its joint (the patella rides 0.55 of knee flexion, a hip-wrap point 0.5 of
// the hip). Every step, from the body's link frames:
//   * musculotendon length, its rate, and the moment arm about every hinge it spans, by virtual
//     work (exact for the polyline; r = -dL/dq, tau = r F) - lucid_bcr.muscles.MuscleSystem
//   * MuJoCo's muscle, as the package compiles it (PhysicsBody(muscles=True)): force =
//     a Fmax FL(l) FV(v) (+ a passive term, off: fpmax 1e-6), the fibre calibration of
//     physbody._calibrate_lengthrange (a muscle's fibre is at its optimal length in the rest pose)
//   * MuJoCo's activation dynamics (10 ms (0.5 + 1.5 a) rising, 40 ms / (0.5 + 1.5 a) falling;
//     Euler; actearly: a step's force uses the activation reached in that step), so the activations
//     one step can reach are an exact box and the excitation that reaches a planned activation is
//     known (lucid_bcr.neuro: reachable_activation / excitation)
//   * allocation: the muscle activations whose joint torques come closest to the torques asked
//     for (least squares, each hinge's error in units of its strength), inside the reachable box,
//     with the least activation (sum a^2, the static-optimisation criterion) sharing the load
// Parity with the package (proxy paths and moment arms; MuJoCo's muscle functions) is a unit test
// (tests/rider_muscles.test.mjs, tests/fixtures/lucid_muscle_parity.json).
// Asset: assets/character/lucid_muscles_r1_5.json (tools/character/extract_muscles.py).
// Pure JS (no browser APIs) so it runs in the unit tests.
(function (global) {
  "use strict";
  const ASSET = /*@@MUSCLE_ASSET@@*/ null;

  // ------------------------------------------------------------------ rotations (scipy semantics)
  function rotvecToMatrix(x, y, z) {
    const ang = Math.hypot(x, y, z), a2 = ang * ang;
    const s = ang <= 1e-3 ? 0.5 - a2 / 48 + (a2 * a2) / 3840 : Math.sin(ang / 2) / ang;
    const qx = x * s, qy = y * s, qz = z * s, w = Math.cos(ang / 2);
    const x2 = qx * qx, y2 = qy * qy, z2 = qz * qz, w2 = w * w;
    return [
      x2 - y2 - z2 + w2, 2 * (qx * qy - qz * w), 2 * (qx * qz + qy * w),
      2 * (qx * qy + qz * w), -x2 + y2 - z2 + w2, 2 * (qy * qz - qx * w),
      2 * (qx * qz - qy * w), 2 * (qy * qz + qx * w), -x2 - y2 + z2 + w2,
    ];
  }
  function matrixToRotvec(m) {
    const t = m[0] + m[4] + m[8], dec = [m[0], m[4], m[8], t];
    let c = 0;
    for (let k = 1; k < 4; k++) if (dec[k] > dec[c]) c = k;
    let q;
    if (c !== 3) {
      const i = c, j = (i + 1) % 3, k = (j + 1) % 3, M = (r, s) => m[3 * r + s];
      q = [0, 0, 0, 0];
      q[i] = 1 - dec[3] + 2 * M(i, i); q[j] = M(j, i) + M(i, j); q[k] = M(k, i) + M(i, k); q[3] = M(k, j) - M(j, k);
    } else q = [m[7] - m[5], m[2] - m[6], m[3] - m[1], 1 + t];
    const nq = Math.hypot(q[0], q[1], q[2], q[3]);
    let [x, y, z, w] = [q[0] / nq, q[1] / nq, q[2] / nq, q[3] / nq];
    if (w < 0) { x = -x; y = -y; z = -z; w = -w; }
    const ang = 2 * Math.atan2(Math.hypot(x, y, z), w), a2 = ang * ang;
    const s = ang <= 1e-3 ? 2 + a2 / 12 + (7 * a2 * a2) / 2880 : ang / Math.sin(ang / 2);
    return [x * s, y * s, z * s];
  }

  // ------------------------------------------------------------------ MuJoCo muscle functions
  // (engine_util_misc.c: mju_muscleGainLength, mju_muscleGain, mju_muscleBias, mju_muscleDynamics)
  function gainLength(L, lmin, lmax) {
    if (L < lmin || L > lmax) return 0;
    const a = 0.5 * (lmin + 1), b = 0.5 * (1 + lmax);
    if (L <= a) { const x = (L - lmin) / Math.max(1e-15, a - lmin); return 0.5 * x * x; }
    if (L <= 1) { const x = (1 - L) / Math.max(1e-15, 1 - a); return 1 - 0.5 * x * x; }
    if (L <= b) { const x = (L - 1) / Math.max(1e-15, b - 1); return 1 - 0.5 * x * x; }
    const x = (lmax - L) / Math.max(1e-15, lmax - b);
    return 0.5 * x * x;
  }
  function gainVelocity(V, fvmax) {
    const y = fvmax - 1;
    if (V <= -1) return 0;
    if (V <= 0) return (V + 1) * (V + 1);
    if (V <= y) return fvmax - ((y - V) * (y - V)) / Math.max(1e-15, y);
    return fvmax;
  }
  // tension (N, >= 0) per unit activation and passive tension: MuJoCo's gain and bias with the sign
  // turned (MuJoCo's actuator force is negative in tension)
  function muscleGain(len, vel, lr, prm) {
    const L0 = (lr[1] - lr[0]) / Math.max(1e-15, prm[1] - prm[0]);
    const L = prm[0] + (len - lr[0]) / Math.max(1e-15, L0), V = vel / Math.max(1e-15, L0 * prm[6]);
    return prm[2] * gainLength(L, prm[4], prm[5]) * gainVelocity(V, prm[8]);
  }
  // d(gain)/d(velocity) (N per m/s): the fibres' force-velocity slope, the muscle's own damping
  function muscleGainDv(len, vel, lr, prm) {
    const L0 = (lr[1] - lr[0]) / Math.max(1e-15, prm[1] - prm[0]);
    const L = prm[0] + (len - lr[0]) / Math.max(1e-15, L0), s = Math.max(1e-15, L0 * prm[6]), V = vel / s, y = prm[8] - 1;
    const dFV = V <= -1 ? 0 : V <= 0 ? 2 * (V + 1) : V <= y ? (2 * (y - V)) / Math.max(1e-15, y) : 0;
    return (prm[2] * gainLength(L, prm[4], prm[5]) * dFV) / s;
  }
  function muscleBias(len, lr, prm) {
    const L0 = (lr[1] - lr[0]) / Math.max(1e-15, prm[1] - prm[0]);
    const L = prm[0] + (len - lr[0]) / Math.max(1e-15, L0), b = 0.5 * (1 + prm[5]);
    if (L <= 1) return 0;
    if (L <= b) { const x = (L - 1) / Math.max(1e-15, b - 1); return prm[2] * prm[7] * 0.5 * x * x; }
    const x = (L - b) / Math.max(1e-15, b - 1);
    return prm[2] * prm[7] * (0.5 + x);
  }
  // da/dt for excitation u at activation a (tausmooth 0: hard switch on the sign of u - a)
  function muscleDynamics(u, a, tauAct = 0.01, tauDeact = 0.04) {
    const uc = Math.min(1, Math.max(0, u)), ac = Math.min(1, Math.max(0, a));
    const tau = uc - a > 0 ? tauAct * (0.5 + 1.5 * ac) : tauDeact / (0.5 + 1.5 * ac);
    return (uc - a) / Math.max(1e-15, tau);
  }

  // ------------------------------------------------------------------ the muscle layer on a body
  // model: 46's buildModel() (links with parent / joint / axis, linkOf: joint -> the link carrying
  // its segment); body: 45's articulated body (Rw, ow, qd after kinematics()).
  function createMuscles(asset, model, body) {
    asset = asset || ASSET;
    if (!asset) throw Error("LUCID muscles: no asset");
    const D = asset.muscleDefaults, defs = asset.muscles, n = defs.length, links = model.links, NL = links.length;
    const par = links.map((l) => l.parent);
    const isAnc = (a, l) => { for (let x = l; x >= 0; x = par[x]) if (x === a) return true; return false; };
    const hingeCap = new Float64Array(NL); // strength scale per hinge (N m): the rider's torque capacity
    for (const h of model.hinges) hingeCap[h.link] = h.tmax;
    const mus = defs.map((d) => {
      const pts = d.points.map((p) => {
        const cl = model.linkOf[p.carrier];
        if (cl == null) throw Error(`LUCID muscles: ${d.id}: no link for ${p.carrier}`);
        const o = { link: cl, joint: p.carrier, local: Float64Array.from(p.local) };
        if (p.follow) {
          const pl = model.linkOf[p.follow.parent];
          if (pl == null) throw Error(`LUCID muscles: ${d.id}: no link for ${p.follow.parent}`);
          o.follow = { link: pl, frac: p.follow.frac };
        }
        return o;
      });
      // hinges the path spans: those that move its points unequally (a hinge carrying all of them
      // rigidly, or none, leaves the length unchanged). Weight of a point for a hinge: 1 if the hinge
      // is on the chain carrying it, the follow fraction for its own joint's hinges, else 0.
      const span = [];
      for (let h = 1; h < NL; h++) {
        const w = new Float64Array(pts.length);
        let any = false, same = true;
        pts.forEach((p, k) => {
          w[k] = !isAnc(h, p.link) ? 0 : p.follow && links[h].joint === p.joint ? p.follow.frac : 1;
          if (w[k]) any = true;
          if (w[k] !== w[0]) same = false;
        });
        if (any && !same) span.push({ h, w });
      }
      const prm = [d.range[0], d.range[1], d.fmax, 200, D.lmin, D.lmax, d.vmax, D.fpmax, D.fvmax];
      return { id: d.id, group: d.group, fmax: d.fmax, pts, span, lr: d.lengthRange, prm, P: new Float64Array(3 * pts.length), r: new Float64Array(span.length) };
    });
    // hinge -> muscles that span it (for the allocation's normal equations)
    const byHinge = Array.from({ length: NL }, () => []);
    mus.forEach((m, i) => m.span.forEach((s, k) => byHinge[s.h].push({ i, k })));
    const spanned = new Uint8Array(NL);
    for (let h = 1; h < NL; h++) spanned[h] = byHinge[h].length ? 1 : 0;

    const M = {
      n, ids: mus.map((m) => m.id), muscles: mus, byHinge, spanned, hingeCap,
      len: new Float64Array(n), vel: new Float64Array(n), gain: new Float64Array(n), gainDv: new Float64Array(n), bias: new Float64Array(n),
      act: new Float64Array(n).fill(D.tone ?? 0.01), u: new Float64Array(n).fill(D.tone ?? 0.01), F: new Float64Array(n),
      aDes: new Float64Array(n), lo: new Float64Array(n), hi: new Float64Array(n),
      tauAct: D.tauAct, tauDeact: D.tauDeact,
    };
    const u3 = [0, 0, 0];
    // geometry at the body's current kinematics(): points, lengths, moment arms, velocities
    M.geometry = function () {
      const Rw = body.Rw, ow = body.ow;
      for (let i = 0; i < n; i++) {
        const m = mus[i], P = m.P, K = m.pts.length;
        for (let k = 0; k < K; k++) {
          const p = m.pts[k], x = p.local, o = ow[p.link];
          let R = Rw[p.link];
          if (p.follow) {
            // rotation relative to the parent, scaled (scipy rotvec), applied in the parent's frame
            const A = Rw[p.follow.link], C = R, f = p.follow.frac;
            const rel = [0, 0, 0, 0, 0, 0, 0, 0, 0];
            for (let r = 0; r < 3; r++) for (let s = 0; s < 3; s++) rel[3 * r + s] = A[r] * C[s] + A[3 + r] * C[3 + s] + A[6 + r] * C[6 + s];
            const rv = matrixToRotvec(rel), F = rotvecToMatrix(f * rv[0], f * rv[1], f * rv[2]);
            R = [0, 0, 0, 0, 0, 0, 0, 0, 0];
            for (let r = 0; r < 3; r++) for (let s = 0; s < 3; s++) R[3 * r + s] = A[3 * r] * F[s] + A[3 * r + 1] * F[3 + s] + A[3 * r + 2] * F[6 + s];
          }
          P[3 * k] = o[0] + R[0] * x[0] + R[1] * x[1] + R[2] * x[2];
          P[3 * k + 1] = o[1] + R[3] * x[0] + R[4] * x[1] + R[5] * x[2];
          P[3 * k + 2] = o[2] + R[6] * x[0] + R[7] * x[1] + R[8] * x[2];
        }
        let L = 0;
        for (let k = 0; k + 1 < K; k++) L += Math.hypot(P[3 * k + 3] - P[3 * k], P[3 * k + 4] - P[3 * k + 1], P[3 * k + 5] - P[3 * k + 2]);
        M.len[i] = L;
        // r_h = a_h . sum_k [w_k (p_k - c) x u_k - w_k+1 (p_k+1 - c) x u_k]
        let v = 0;
        for (let s = 0; s < m.span.length; s++) {
          const { h, w } = m.span[s], c = ow[h], R = Rw[h], ax = links[h].axis;
          const a0 = R[0] * ax[0] + R[1] * ax[1] + R[2] * ax[2], a1 = R[3] * ax[0] + R[4] * ax[1] + R[5] * ax[2], a2 = R[6] * ax[0] + R[7] * ax[1] + R[8] * ax[2];
          let rx = 0, ry = 0, rz = 0;
          for (let k = 0; k + 1 < K; k++) {
            const wk = w[k], wn = w[k + 1];
            if (!wk && !wn) continue;
            const dx = P[3 * k + 3] - P[3 * k], dy = P[3 * k + 4] - P[3 * k + 1], dz = P[3 * k + 5] - P[3 * k + 2], dl = Math.hypot(dx, dy, dz) || 1e-12;
            u3[0] = dx / dl; u3[1] = dy / dl; u3[2] = dz / dl;
            const px = wk * (P[3 * k] - c[0]) - wn * (P[3 * k + 3] - c[0]);
            const py = wk * (P[3 * k + 1] - c[1]) - wn * (P[3 * k + 4] - c[1]);
            const pz = wk * (P[3 * k + 2] - c[2]) - wn * (P[3 * k + 5] - c[2]);
            rx += py * u3[2] - pz * u3[1]; ry += pz * u3[0] - px * u3[2]; rz += px * u3[1] - py * u3[0];
          }
          const r = rx * a0 + ry * a1 + rz * a2;
          m.r[s] = r;
          v -= r * body.qd[h];
        }
        M.vel[i] = v;
      }
    };
    // force-length-velocity at the current geometry: tension per unit activation (gain) and passive (bias)
    M.muscleState = function () {
      for (let i = 0; i < n; i++) {
        const m = mus[i];
        M.gain[i] = muscleGain(M.len[i], M.vel[i], m.lr, m.prm);
        M.gainDv[i] = muscleGainDv(M.len[i], M.vel[i], m.lr, m.prm);
        M.bias[i] = muscleBias(M.len[i], m.lr, m.prm);
      }
    };
    M.update = function () { M.geometry(); M.muscleState(); };
    // activations one step of dt can reach (Euler, from the current activation)
    M.reachable = function (dt) {
      for (let i = 0; i < n; i++) {
        const a = Math.min(1, Math.max(0, M.act[i])), ta = M.tauAct * (0.5 + 1.5 * a), td = M.tauDeact / (0.5 + 1.5 * a);
        M.lo[i] = Math.max(0, M.act[i] - (dt * M.act[i]) / td);
        M.hi[i] = Math.min(1, M.act[i] + (dt * (1 - M.act[i])) / ta);
      }
    };
    // excitation whose one-step activation is aDes
    M.excitation = function (aDes, dt) {
      for (let i = 0; i < n; i++) {
        const a = Math.min(1, Math.max(0, M.act[i])), tau = aDes[i] > M.act[i] ? M.tauAct * (0.5 + 1.5 * a) : M.tauDeact / (0.5 + 1.5 * a);
        M.u[i] = Math.min(1, Math.max(0, M.act[i] + ((aDes[i] - M.act[i]) * tau) / dt));
      }
    };
    // one step of the activation dynamics (the force of this step then uses the new activation)
    M.stepActivation = function (dt) {
      for (let i = 0; i < n; i++) M.act[i] = Math.min(1, Math.max(0, M.act[i] + dt * muscleDynamics(M.u[i], M.act[i], M.tauAct, M.tauDeact)));
    };
    // tensions and the joint torques they make (added to tau, per link)
    M.forces = function (tau) {
      for (let i = 0; i < n; i++) {
        const F = M.act[i] * M.gain[i] + M.bias[i], m = mus[i];
        M.F[i] = F;
        if (tau) for (let s = 0; s < m.span.length; s++) tau[m.span[s].h] += m.r[s] * F;
      }
    };
    // the muscles' damping on each hinge (N m s): sum over the muscles spanning it of r^2 a dgain/dv -
    // their force-velocity slope at the present activation (for an implicit step, as MuJoCo's
    // implicitfast integrator takes an actuator's velocity derivative)
    M.damping = function (out) {
      out.fill(0);
      for (let i = 0; i < n; i++) {
        const m = mus[i], c = M.act[i] * M.gainDv[i];
        if (c) for (let s = 0; s < m.span.length; s++) out[m.span[s].h] += m.r[s] * m.r[s] * c;
      }
      return out;
    };
    // ---- allocation: activations a in [lo, hi] minimising
    //   sum_h w_h (tauDes_h - sum_i r_hi (a_i gain_i + bias_i))^2 + reg sum_i (a_i - tone_i)^2
    // (w_h = 1 / cap_h^2 unless given) by projected Gauss-Seidel on the normal equations, warm-started
    // from the last plan. Returns the torque it achieves per hinge in out.tau.
    const Q = new Float64Array(n * n), g = new Float64Array(n), B = mus.map((m) => new Float64Array(m.span.length));
    M.allocate = function (tauDes, opt = {}) {
      const reg = opt.reg ?? 0.02, sweeps = opt.sweeps ?? 12, tone = opt.tone ?? 0.01, W = opt.w;
      Q.fill(0);
      for (let i = 0; i < n; i++) {
        g[i] = reg * (opt.toneOf ? opt.toneOf[i] : tone);
        Q[i * n + i] = reg;
        const m = mus[i];
        for (let s = 0; s < m.span.length; s++) B[i][s] = m.r[s] * M.gain[i];
      }
      for (let h = 1; h < NL; h++) {
        const list = byHinge[h];
        if (!list.length) continue;
        const cap = hingeCap[h] || 1, wh = W ? W[h] : 1 / (cap * cap);
        if (!wh) continue;
        let t = tauDes[h];
        for (const { i, k } of list) t -= mus[i].r[k] * M.bias[i];
        for (let x = 0; x < list.length; x++) {
          const { i, k } = list[x], bi = B[i][k];
          g[i] += wh * bi * t;
          for (let y = 0; y < list.length; y++) { const { i: j, k: kk } = list[y]; Q[i * n + j] += wh * bi * B[j][kk]; }
        }
      }
      const a = M.aDes;
      for (let i = 0; i < n; i++) a[i] = Math.min(M.hi[i], Math.max(M.lo[i], opt.warm ? opt.warm[i] : a[i]));
      for (let it = 0; it < sweeps; it++) {
        let moved = 0;
        for (let i = 0; i < n; i++) {
          const d = Q[i * n + i];
          if (d <= 0) continue;
          let s = g[i];
          for (let j = 0; j < n; j++) if (j !== i) s -= Q[i * n + j] * a[j];
          const x = Math.min(M.hi[i], Math.max(M.lo[i], s / d));
          moved = Math.max(moved, Math.abs(x - a[i]));
          a[i] = x;
        }
        if (moved < 1e-6) break;
      }
      return a;
    };
    // the torque per hinge that activations a would give now (for the residual)
    M.torqueOf = function (a, out) {
      out.fill(0);
      for (let i = 0; i < n; i++) {
        const m = mus[i], F = a[i] * M.gain[i] + M.bias[i];
        for (let s = 0; s < m.span.length; s++) out[m.span[s].h] += m.r[s] * F;
      }
      return out;
    };
    return M;
  }

  const api = { createMuscles, asset: ASSET, gainLength, gainVelocity, muscleGain, muscleGainDv, muscleBias, muscleDynamics, rotvecToMatrix, matrixToRotvec };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.LUCID_MUSCLES = api;
})(typeof window !== "undefined" ? window : globalThis);
