// Articulated-body dynamics used by the rider (src/core/45_rider_multibody.js).
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
await import(path.join(ROOT, "src/core/45_rider_multibody.js"));
const { createArticulatedBody } = globalThis.LUCID_MULTIBODY;
const box = (m, a, b, c) => [(m * (b * b + c * c)) / 12, 0, 0, 0, (m * (a * a + c * c)) / 12, 0, 0, 0, (m * (a * a + b * b)) / 12];
const unit = (v) => { const n = Math.hypot(...v); return v.map((x) => x / n); };

function chain(fixedBase) {
  // a floating torso with two 3-hinge "limbs" (like the rider's joints)
  const links = [{ name: "base", parent: -1, mass: 10, com: [0, 0, 0.1], inertia: box(10, 0.3, 0.2, 0.4) }];
  const addLimb = (side) => {
    let parent = 0;
    const axes = [[1, 0, 0], [0, 1, 0], unit([0.1, 0.2, 1])];
    axes.forEach((a, k) => {
      const last = k === 2;
      links.push({ name: `${side}${k}`, parent, axis: a, offset: k === 0 ? [side * 0.2, 0, 0.2] : [0, 0, 0], mass: last ? 3 : 0, com: last ? [0, 0, -0.2] : [0, 0, 0], inertia: last ? box(3, 0.08, 0.08, 0.4) : [0, 0, 0, 0, 0, 0, 0, 0, 0] });
      parent = links.length - 1;
    });
    links.push({ name: `${side}knee`, parent, axis: [1, 0, 0], offset: [0, 0, -0.4], mass: 2, com: [0, 0, -0.2], inertia: box(2, 0.06, 0.06, 0.4) });
  };
  addLimb(1);
  addLimb(-1);
  return createArticulatedBody({ links, fixedBase });
}

test("free-floating articulated body: momentum and energy conserved (first-order convergence)", () => {
  const run = (dt) => {
    const B = chain(false);
    B.gravity = [0, 0, 0];
    B.vb = [0.3, -0.5, 0.8, 0.2, 0.1, -0.3];
    for (let i = 1; i < B.n; i++) { B.q[i] = 0.3 * Math.sin(i); B.qd[i] = 1.5 * Math.cos(2 * i); }
    B.kinematics();
    const t0 = B.totals();
    for (let s = 0; s < Math.round(0.5 / dt); s++) { B.kinematics(); B.clearForces(); B.aba(); B.integrate(dt); }
    B.kinematics();
    const t1 = B.totals(), rel = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / Math.hypot(...a);
    return { P: rel(t0.P, t1.P), H: rel(t0.H, t1.H), T: Math.abs(t1.T - t0.T) / t0.T };
  };
  const a = run(4e-5), b = run(2e-5);
  for (const k of ["P", "H", "T"]) {
    assert.ok(b[k] < 1e-3, `${k} drift ${b[k]}`);
    const order = a[k] / b[k];
    assert.ok(order > 1.8 && order < 2.2, `${k}: halving dt should halve the drift (ratio ${order})`);
  }
});

test("compound pendulum period matches 2*pi*sqrt(I_pivot / (m g l))", () => {
  const m = 2, l = 0.5, Ic = box(m, 0.05, 0.05, 0.3);
  const B = createArticulatedBody({ fixedBase: true, links: [{ parent: -1, mass: 0 }, { parent: 0, axis: [1, 0, 0], offset: [0, 0, 0], mass: m, com: [0, 0, -l], inertia: Ic }] });
  B.q[1] = 0.05;
  const dt = 1e-4;
  let t = 0, last = B.q[1], crossings = [];
  while (crossings.length < 3 && t < 10) {
    B.kinematics(); B.clearForces(); B.applyGravity(); B.aba(); B.integrate(dt); t += dt;
    if (last > 0 && B.q[1] <= 0) crossings.push(t);
    last = B.q[1];
  }
  const T = (crossings[2] - crossings[1]);
  const Ip = Ic[0] + m * l * l, T0 = 2 * Math.PI * Math.sqrt(Ip / (m * 9.81 * l));
  assert.ok(Math.abs(T - T0) / T0 < 2e-3, `period ${T} vs ${T0}`);
});

test("RNEA feed-forward holds a posture under gravity (qdd ~ 0)", () => {
  const B = chain(true);
  for (let i = 1; i < B.n; i++) B.q[i] = 0.4 * Math.sin(3 * i);
  B.kinematics(); B.clearForces(); B.applyGravity();
  const tau = B.inverseDynamicsStatic();
  B.tau.set(tau);
  B.aba();
  let mx = 0;
  for (let i = 1; i < B.n; i++) mx = Math.max(mx, Math.abs(B.qdd[i]));
  assert.ok(mx < 1e-9, `max |qdd| ${mx}`);
});

test("stable PD: stiff servo on a light segment stays bounded at the rider time step", () => {
  const B = createArticulatedBody({ fixedBase: true, links: [{ parent: -1 }, { parent: 0, axis: [0, 1, 0], offset: [0, 0, 0], mass: 0.7, com: [0.08, 0, 0], inertia: box(0.7, 0.13, 0.08, 0.1) }] });
  const kp = 400, kd = 20, dt = 1 / 540;
  B.q[1] = 0.6;
  for (let s = 0; s < 2000; s++) {
    B.kinematics(); B.clearForces();
    B.armature[1] = kd * dt + kp * dt * dt;
    B.tau[1] = -kp * (B.q[1] + dt * B.qd[1]) - kd * B.qd[1];
    B.aba(); B.integrate(dt);
  }
  assert.ok(Math.abs(B.q[1]) < 1e-3 && Number.isFinite(B.q[1]), `settled at ${B.q[1]}`);
});

test("joint-space equations: CRBA mass matrix and RNEA bias agree with ABA; Jacobians, drifts and momentum agree with the kinematics", () => {
  const B = chain(false), nz = B.nz, n = B.n;
  B.R = [0.36, 0.48, -0.8, -0.8, 0.6, 0, 0.48, 0.64, 0.6];
  B.p = [0.2, -0.1, 0.9];
  B.vb = [0.4, -0.7, 0.5, 0.3, -0.2, 0.6];
  for (let i = 1; i < n; i++) { B.q[i] = 0.5 * Math.sin(1.7 * i); B.qd[i] = 2 * Math.cos(1.3 * i); B.tau[i] = 3 * Math.sin(0.9 * i + 1); }
  B.kinematics(); B.clearForces(); B.applyGravity();
  B.applyForce(4, [12, -5, 30], B.toWorld(4, [0.02, 0.01, -0.3]));
  B.aba();
  const zdd = new Float64Array(nz);
  for (let k = 0; k < 6; k++) zdd[k] = B.ab[k];
  for (let i = 1; i < n; i++) zdd[5 + i] = B.qdd[i];
  const M = Float64Array.from(B.massMatrix()), h = Float64Array.from(B.biasForces(undefined, { gravity: false, fext: true }));
  let asym = 0, res = 0, scale = 0;
  for (let r = 0; r < nz; r++) {
    for (let c = 0; c < nz; c++) asym = Math.max(asym, Math.abs(M[r * nz + c] - M[c * nz + r]));
    let s = h[r];
    for (let c = 0; c < nz; c++) s += M[r * nz + c] * zdd[c];
    const rhs = r < 6 ? 0 : B.tau[r - 5];
    res = Math.max(res, Math.abs(s - rhs)); scale = Math.max(scale, Math.abs(rhs), Math.abs(h[r]));
  }
  assert.ok(asym < 1e-12, `M symmetric (${asym})`);
  assert.ok(res < 1e-9 * scale, `M zdd + h = [0; tau] (residual ${res}, scale ${scale})`);
  // gravity as a base acceleration, the other forces left out: the same less J^T of what was applied
  B.clearForces(); B.applyGravity();
  const hg = B.biasForces(undefined, { gravity: false, fext: true }), hg2 = Float64Array.from(B.biasForces(undefined, { gravity: true }));
  let dg = 0;
  for (let r = 0; r < nz; r++) dg = Math.max(dg, Math.abs(hg[r] - hg2[r]));
  assert.ok(dg < 1e-9, `gravity as base acceleration (${dg})`);
  // Jacobians against the kinematics' velocities
  const z = new Float64Array(nz);
  for (let k = 0; k < 6; k++) z[k] = B.vb[k];
  for (let i = 1; i < n; i++) z[5 + i] = B.qd[i];
  const J = new Float64Array(3 * nz), mul = (J, v) => [0, 1, 2].map((r) => { let s = 0; for (let c = 0; c < nz; c++) s += J[r * nz + c] * v[c]; return s; });
  const xl = [0.03, -0.02, -0.25], li = n - 1, xw = B.toWorld(li, xl);
  const vJ = mul(B.pointJacobian(li, xw, J), z), vK = B.pointVelocity(li, xl);
  assert.ok(Math.hypot(vJ[0] - vK[0], vJ[1] - vK[1], vJ[2] - vK[2]) < 1e-12, "point Jacobian");
  const wJ = mul(B.angularJacobian(li, J), z), wl = B.v[li], R = B.Rw[li];
  const wK = [0, 1, 2].map((r) => R[3 * r] * wl[0] + R[3 * r + 1] * wl[1] + R[3 * r + 2] * wl[2]);
  assert.ok(Math.hypot(wJ[0] - wK[0], wJ[1] - wK[1], wJ[2] - wK[2]) < 1e-12, "angular Jacobian");
  // momentum rows: centre of mass, its velocity, angular momentum about it
  const T = B.totals(), mo = B.momentum(M);
  assert.ok(Math.abs(mo.mass - T.mass) < 1e-12, "mass");
  assert.ok(Math.hypot(...mo.com.map((x, k) => x - T.com[k])) < 1e-12, "centre of mass");
  assert.ok(Math.hypot(...mo.vcom.map((x, k) => x - T.P[k] / T.mass)) < 1e-12, "its velocity");
  const cP = [T.com[1] * T.P[2] - T.com[2] * T.P[1], T.com[2] * T.P[0] - T.com[0] * T.P[2], T.com[0] * T.P[1] - T.com[1] * T.P[0]];
  assert.ok(Math.hypot(...mo.L.map((x, k) => x - (T.H[k] - cP[k]))) < 1e-10, "centroidal angular momentum");
  // drifts: J zdd + drift is the material point's acceleration (finite difference of its velocity)
  B.clearForces(); B.applyGravity(); B.aba();
  for (let k = 0; k < 6; k++) zdd[k] = B.ab[k];
  for (let i = 1; i < n; i++) zdd[5 + i] = B.qdd[i];
  B.biasForces(undefined, { gravity: true });
  const aP = mul(B.pointJacobian(li, xw, J), zdd).map((x, k) => x + B.pointDrift(li, xw)[k]);
  const aW = mul(B.angularJacobian(li, J), zdd).map((x, k) => x + B.angularDrift(li)[k]);
  const dt = 1e-7, v0 = B.pointVelocity(li, xl), w0 = wK;
  B.integrate(dt); B.kinematics();
  const v1 = B.pointVelocity(li, xl), R1 = B.Rw[li], wl1 = B.v[li], w1 = [0, 1, 2].map((r) => R1[3 * r] * wl1[0] + R1[3 * r + 1] * wl1[1] + R1[3 * r + 2] * wl1[2]);
  const fdP = v1.map((x, k) => (x - v0[k]) / dt), fdW = w1.map((x, k) => (x - w0[k]) / dt);
  assert.ok(Math.hypot(...aP.map((x, k) => x - fdP[k])) < 1e-4 * Math.hypot(...fdP) + 1e-5, `point acceleration ${aP} vs ${fdP}`);
  assert.ok(Math.hypot(...aW.map((x, k) => x - fdW[k])) < 1e-4 * Math.hypot(...fdW) + 1e-5, `angular acceleration ${aW} vs ${fdW}`);
});

test("implicit point inertia: an added isotropic point mass moves the body as that mass rigidly attached", () => {
  const mk = (extra) => {
    const links = [{ name: "base", parent: -1, mass: 10, com: [0, 0, 0.1], inertia: box(10, 0.3, 0.2, 0.4) }, { name: "arm", parent: 0, axis: [1, 0, 0], offset: [0.1, 0, 0.2], mass: extra ? 2.5 : 2, com: extra ? [0, 0.04, -0.24] : [0, 0, -0.2], inertia: box(2, 0.06, 0.06, 0.4) }];
    if (extra) {
      // (2 kg at [0, 0, -0.2] and 0.5 kg at [0, 0.2, -0.4]: the combined inertia about the combined COM)
      const c = [0, 0.04, -0.24], p1 = [0, 0, -0.2], p2 = [0, 0.2, -0.4], I0 = box(2, 0.06, 0.06, 0.4);
      const pm = (m, p) => { const d = [p[0] - c[0], p[1] - c[1], p[2] - c[2]], dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2]; return [0, 1, 2].flatMap((r) => [0, 1, 2].map((k) => m * ((r === k ? dd : 0) - d[r] * d[k]))); };
      links[1].inertia = I0.map((v, k) => v + pm(2, p1)[k] + pm(0.5, p2)[k]);
    }
    return createArticulatedBody({ links });
  };
  const A = mk(false), B = mk(true);
  for (const S of [A, B]) { S.R = [0.36, 0.48, -0.8, -0.8, 0.6, 0, 0.48, 0.64, 0.6]; S.p = [0.2, -0.1, 0.9]; S.vb = [0, 0, 0, 0, 0, 0]; S.q[1] = 0.4; S.qd[1] = 0; S.tau[1] = 1.5; S.kinematics(); S.clearForces(); }
  // A: the 0.5 kg as an implicit point inertia (no velocity, no gravity: only the acceleration couples)
  A.addPointInertia(1, A.toWorld(1, [0, 0.2, -0.4]), [0.5, 0, 0, 0, 0.5, 0, 0, 0, 0.5]);
  A.aba(); B.aba();
  assert.ok(Math.abs(A.qdd[1] - B.qdd[1]) < 1e-10 * Math.abs(B.qdd[1]) + 1e-12, `qdd ${A.qdd[1]} vs ${B.qdd[1]}`);
  for (let k = 0; k < 6; k++) assert.ok(Math.abs(A.ab[k] - B.ab[k]) < 1e-10, `ab[${k}] ${A.ab[k]} vs ${B.ab[k]}`);
  A.clearForces();
  assert.equal(A.hasAdd[1], 0, "cleared with the forces");
});
