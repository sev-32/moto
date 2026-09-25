#!/usr/bin/env node
// Print the steady-state and transient characteristics of the real-time tire (RTT).
//   node tools/characterize-tire.mjs [front|rear]
import { makeTire, steady } from "../tests/lib/rtt-harness.mjs";

const which = process.argv[2] || "front";
const t = makeTire(which);
const P = t.P, Fz0 = P.nominalLoadN, D = Math.PI / 180;
const f = (x, n = 3) => (Number.isFinite(x) ? x.toFixed(n) : String(x));
console.log(`RTT ${P.id}  profile stations ${t.g.n}  crown radius ${f(t.g.crownRadius * 1000, 1)} mm  half width ${f(t.g.halfWidth * 1000, 1)} mm  edge camber ${f(t.g.edgeCamberRad / D, 1)} deg`);

console.log("\nVERTICAL (camber 0 / 30 / 50 deg)");
for (const g of [0, 30, 50]) {
  const rows = [];
  for (const L of [500, 1000, 1400, 2000, 3000]) {
    const h = t.hubHeightForLoad(L, g * D), h2 = t.hubHeightForLoad(L * 1.02, g * D);
    const geo = t.geometry(h, g * D);
    const k = (0.02 * L) / (h - h2);
    rows.push(`${L}N: defl ${f((t.g.touchHeight(g * D) - h) * 1000, 1)}mm k ${f(k / 1000, 0)}kN/m A ${f(geo.A * 1e4, 1)}cm2 cy ${f(geo.cy * 1000, 1)}mm`);
  }
  console.log(` gamma ${g}: ` + rows.join(" | "));
}

console.log("\nLATERAL: slip angle (camber 0)");
for (const a of [0.25, 0.5, 1, 2, 4, 6, 8, 12]) {
  const o = steady(t, { alphaDeg: a });
  console.log(` alpha ${a}deg: Fy ${f(o.Fy, 0)}N  Fy/Fz ${f(o.Fy / o.Fz)}  Mz ${f(o.Mz, 1)}Nm  t_p ${f(o.pneumaticTrailM * 1000, 1)}mm  slide ${f(o.slidingFraction, 2)}`);
}
const oa = steady(t, { alphaDeg: 0.25 });
console.log(` cornering stiffness C_Fa = ${f(oa.Fy / (0.25 * D), 0)} N/rad = ${f(oa.Fy / (0.25 * D) / oa.Fz, 2)} x Fz (target ${P.corneringStiffness})`);

console.log("\nCAMBER (alpha 0)");
for (const g of [2, 5, 10, 20, 30, 40, 50]) {
  const o = steady(t, { gamma: g * D });
  console.log(` gamma ${g}deg: Fy ${f(o.Fy, 0)}N  Fy/Fz ${f(o.Fy / o.Fz)}  tan(g) ${f(Math.tan(g * D))}  Mz ${f(o.Mz, 1)}Nm  contact y ${f(o.contactLateralM * 1000, 1)}mm  slide ${f(o.slidingFraction, 2)}`);
}
const og = steady(t, { gamma: 2 * D });
console.log(` camber stiffness C_Fg = ${f(og.Fy / (2 * D) / og.Fz, 3)} x Fz /rad (target ~0.9-1.0)`);

console.log("\nLONGITUDINAL (camber 0)");
for (const k of [-0.5, -0.2, -0.12, -0.08, -0.04, -0.01, 0.01, 0.04, 0.08, 0.12, 0.2, 0.5, 1]) {
  const o = steady(t, { kappa: k });
  console.log(` kappa ${k}: Fx ${f(o.Fx, 0)}N  Fx/Fz ${f(o.Fx / o.Fz)}  slide ${f(o.slidingFraction, 2)}`);
}
const ok = steady(t, { kappa: 0.01 });
console.log(` slip stiffness C_Fk = ${f(ok.Fx / 0.01 / ok.Fz, 2)} x Fz (target ${P.longStiffness})`);

console.log("\nCOMBINED (alpha 4deg)");
for (const k of [0, 0.03, 0.06, 0.1, -0.06, -0.1]) {
  const o = steady(t, { alphaDeg: 4, kappa: k });
  console.log(` kappa ${k}: Fx/Fz ${f(o.Fx / o.Fz)}  Fy/Fz ${f(o.Fy / o.Fz)}  |F|/Fz ${f(Math.hypot(o.Fx, o.Fy) / o.Fz)}`);
}

console.log("\nRELAXATION (step alpha 0 -> 1 deg at V = 20 m/s)");
{
  t.reset();
  const V = 20, dt = 1 / 2000, h = t.hubHeightForLoad(1400, 0), Vy = -V * Math.tan(1 * D);
  let Re = t.g.touchHeight(0);
  for (let i = 0; i < 400; i++) Re = t.step({ dt, h, hDot: 0, gamma: 0, Vx: V, Vy: 0, yawRate: 0, omega: V / Re }).effectiveRadiusM;
  const fin = steady(t, { alphaDeg: 1 }).Fy;
  t.reset();
  for (let i = 0; i < 400; i++) Re = t.step({ dt, h, hDot: 0, gamma: 0, Vx: V, Vy: 0, yawRate: 0, omega: V / Re }).effectiveRadiusM;
  let s63 = null;
  for (let i = 0; i < 4000; i++) {
    const o = t.step({ dt, h, hDot: 0, gamma: 0, Vx: V, Vy, yawRate: 0, omega: V / Re });
    if (s63 === null && o.Fy >= 0.632 * fin) s63 = (i + 1) * dt * V;
  }
  console.log(` final Fy ${f(fin, 0)} N, distance to 63%: ${f(s63, 3)} m (relaxation length)`);
}

console.log("\nPERFORMANCE");
{
  const h = t.hubHeightForLoad(1400, 0.4);
  const n = 200000, t0 = performance.now();
  for (let i = 0; i < n; i++) t.step({ dt: 1 / 540, h, hDot: 0, gamma: 0.4, Vx: 30, Vy: -0.3, yawRate: 0.2, omega: 30 / 0.29 });
  console.log(` ${f(((performance.now() - t0) / n) * 1000, 2)} us per tire step`);
}
