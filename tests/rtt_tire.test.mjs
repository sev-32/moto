// Regression tests for the real-time tire (RTT). Targets are literature ranges for sport
// motorcycle tires (see docs/PHYSICS.md); tolerances keep the calibrated behaviour locked.
import test from "node:test";
import assert from "node:assert/strict";
import { makeTire, steady } from "./lib/rtt-harness.mjs";

const D = Math.PI / 180;
const within = (x, lo, hi, what) => assert.ok(x >= lo && x <= hi, `${what}: ${x} not in [${lo}, ${hi}]`);

for (const which of ["front", "rear"]) {
  test(`${which}: tread geometry is symmetric and round`, () => {
    const t = makeTire(which);
    within(Math.abs(t.g.touchHeight(0.3) - t.g.touchHeight(-0.3)), 0, 1e-9, "left/right touch height");
    within(t.g.touchHeight(0), t.g.R0 - 1e-6, t.g.R0 + 1e-3, "crown touch height ~ R0");
    within(t.g.edgeCamberRad / D, 45, 70, "tread edge camber");
  });

  test(`${which}: vertical stiffness and patch area at nominal load`, () => {
    const t = makeTire(which), L = t.P.nominalLoadN;
    const h = t.hubHeightForLoad(L, 0), h2 = t.hubHeightForLoad(L * 1.02, 0);
    within((0.02 * L) / (h - h2) / 1000, 130, 320, "vertical stiffness kN/m");
    const A = t.geometry(h, 0).A;
    within(A * 1e4, 40, 75, "patch area cm^2");
    // load = (inflation + carcass) * area
    within(L / A / 1e5, 2.0, 3.2, "mean contact pressure bar");
  });

  test(`${which}: cornering, camber and slip stiffness`, () => {
    const t = makeTire(which);
    const a = steady(t, { alphaDeg: 0.25, load: t.P.nominalLoadN });
    within(a.Fy / (0.25 * D) / a.Fz, 11, 15, "cornering stiffness /Fz");
    within(a.pneumaticTrailM * 1000, 10, 35, "pneumatic trail mm");
    const g = steady(t, { gamma: 2 * D, load: t.P.nominalLoadN });
    within(g.Fy / (2 * D) / g.Fz, 0.75, 1.1, "camber stiffness /Fz");
    assert.ok(g.Fy > 0, "camber thrust must push toward the lean side");
    const k = steady(t, { kappa: 0.01, load: t.P.nominalLoadN });
    within(k.Fx / 0.01 / k.Fz, 14, 24, "slip stiffness /Fz");
  });

  test(`${which}: friction saturation, locked wheel and combined slip`, () => {
    const t = makeTire(which), mu = t.P.mu;
    const peak = Math.max(...[-0.08, -0.12, -0.16, -0.2].map((k) => -steady(t, { kappa: k }).Fx / 1400));
    within(peak, 0.8 * mu, 1.02 * mu, "braking peak Fx/Fz");
    const lock = -steady(t, { kappa: -1, V: 25 }).Fx / 1400;
    within(lock / peak, 0.7, 0.95, "locked / peak");
    const c = steady(t, { alphaDeg: 5, kappa: -0.15 });
    within(Math.hypot(c.Fx, c.Fy) / c.Fz, 0.7 * mu, 1.05 * mu, "combined force inside friction ellipse");
  });

  test(`${which}: relaxation length`, () => {
    const t = makeTire(which);
    const V = 20, dt = 1 / 2000, h = t.hubHeightForLoad(1400, 0), Vy = -V * Math.tan(1 * D);
    const fin = steady(t, { alphaDeg: 1 }).Fy;
    t.reset();
    let Re = t.g.touchHeight(0), s63 = null;
    for (let i = 0; i < 400; i++) Re = t.step({ dt, h, hDot: 0, gamma: 0, Vx: V, Vy: 0, yawRate: 0, omega: V / Re }).effectiveRadiusM;
    for (let i = 0; i < 4000 && s63 === null; i++) if (t.step({ dt, h, hDot: 0, gamma: 0, Vx: V, Vy, yawRate: 0, omega: V / Re }).Fy >= 0.632 * fin) s63 = (i + 1) * dt * V;
    within(s63, 0.08, 0.3, "relaxation length m");
  });

  test(`${which}: standstill contact is stable and holds without drift`, () => {
    const t = makeTire(which), h = t.hubHeightForLoad(1400, 0);
    let o;
    for (let i = 0; i < 2000; i++) o = t.step({ dt: 1 / 540, h, hDot: 0, gamma: 0, Vx: i < 20 ? 0.02 : 0, Vy: i < 20 ? 0.02 : 0, yawRate: 0, omega: 0 });
    assert.ok(Number.isFinite(o.Fx) && Number.isFinite(o.Fy), "finite");
    within(Math.abs(o.Fx) + Math.abs(o.Fy), 0, 0.6 * 1400, "bounded static friction");
    assert.equal(o.slidingFraction, 0, "no sliding at rest");
  });

  test(`${which}: airborne tire produces no force and resets`, () => {
    const t = makeTire(which);
    steady(t, { alphaDeg: 3 });
    const o = t.step({ dt: 1 / 540, h: 0.5, hDot: 0.5, gamma: 0, Vx: 20, Vy: -1, yawRate: 0, omega: 60 });
    assert.equal(o.Fz, 0);
    assert.equal(o.Fx, 0);
    assert.equal(o.Fy, 0);
  });

  test(`${which}: cost per step is real-time friendly`, () => {
    const t = makeTire(which), h = t.hubHeightForLoad(1400, 0.4), n = 50000, t0 = performance.now();
    for (let i = 0; i < n; i++) t.step({ dt: 1 / 540, h, hDot: 0, gamma: 0.4, Vx: 30, Vy: -0.3, yawRate: 0.2, omega: 30 / 0.29 });
    within(((performance.now() - t0) / n) * 1000, 0, 60, "us per step");
  });
}
