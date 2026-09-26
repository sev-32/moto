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
