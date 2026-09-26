// The physical LUCID rider (src/core/46_rider_biomech.js) on a kinematically driven stub bike:
// static balance, the floating trunk on a rocking bike, braking, acceleration and a steady turn.
// Bands are physical sanity bounds for this joint-torque model, not measured rider data.
import test from "node:test";
import assert from "node:assert/strict";
import { character, surfaces, BIO, stubBike } from "./lib/rider-harness.mjs";

const DEG = Math.PI / 180, dt = 1 / 540;

// run a scenario: pose(t) -> {p, R} of the bike; returns per-sample observations
function run(pose, T, { sample = 27 } = {}) {
  const R = BIO.createRider(character, surfaces);
  const h = R.helpers, bk = stubBike(), b = R.body;
  const set = (t) => {
    const a = pose(t), c = pose(t + dt);
    bk.p = a.p; bk.R = a.R;
    bk.v = h.scl(h.sub(c.p, a.p), 1 / dt);
    bk.w = h.scl(h.logSO3(h.mm(c.R, h.mt(a.R))), 1 / dt);
  };
  const S = BIO.presettle(R);
  set(0);
  b.p = h.add(bk.p, h.mv(bk.R, S.rel.p)); b.R = h.mm(bk.R, S.rel.R); b.q.set(S.rel.q); R.qT.set(S.rel.qT);
  b.kinematics(); R.matchVelocity(bk);
  const out = [];
  for (let i = 0, t = 0; t <= T; i++, t += dt) {
    set(t);
    R.forces(bk, null, dt);
    if (i % sample === 0) { // (observed with the bike and her body at the same instant)
      const pel = h.mtv(bk.R, h.sub(b.p, bk.p));
      const up = (Rm) => h.mv(Rm, [0, 1, 0]);
      const chest = up(b.Rw[R.model.linkOf.Spine02]), head = up(b.Rw[R.model.linkOf.Head]);
      let seat = 0, pegs = 0;
      for (const s of R.spheres) { if (s.bike.on) seat += h.len(s.bike.F); if (s.peg.on) pegs += h.len(s.peg.F); }
      out.push({ t, pel, chestRoll: Math.atan2(chest[0], chest[2]) / DEG, headRoll: Math.atan2(head[0], head[2]) / DEG, bikeRoll: Math.atan2(bk.R[2], bk.R[8]) / DEG, seat, pegs, grips: ["L", "R"].map((G) => (R.grips[G].held ? h.len(R.grips[G].F) : -1)), finite: b.q.every(Number.isFinite) });
    }
    R.integrate(dt);
  }
  return { R, S, out };
}
const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];

test("pre-settled on a held bike: her weight rests on the bike, seated, hands on the grips", () => {
  const R = BIO.createRider(character, surfaces), S = BIO.presettle(R);
  const mass = R.body.totals().mass;
  assert.ok(Math.abs(mass - 75) < 1e-6, `mass ${mass}`);
  // the reactions she puts on the bike carry her weight (down), within 2 %
  assert.ok(Math.abs(-S.weightN - mass * 9.81) < 0.02 * mass * 9.81, `weight ${S.weightN}`);
  // pelvis in the seat pocket, in front of the tail and behind the tank
  const [x, y, z] = S.rel.p;
  assert.ok(Math.abs(x) < 0.01 && y > -0.36 && y < -0.26 && z > 0.2 && z < 0.32, `pelvis ${S.rel.p}`);
  assert.ok(R.grips.L.held && R.grips.R.held);
  assert.ok(R.pelvisFrontSpheres > 0 && R.sittingSpheres === 4);
});

test("static: stays put for 2 s", () => {
  const { out } = run(() => ({ p: [0, 0, 0.64], R: I }), 2);
  const a = out[4], z = out.at(-1);
  assert.ok(z.finite);
  for (let k = 0; k < 3; k++) assert.ok(Math.abs(z.pel[k] - a.pel[k]) < 0.005, `drift ${a.pel} -> ${z.pel}`);
  assert.ok(Math.abs(z.chestRoll) < 1 && Math.abs(z.headRoll) < 1);
});

test("floating trunk: the bike rocks +-8 deg at 0.5 Hz under her, her trunk and head stay nearer the vertical", () => {
  const f = 0.5, A = 8 * DEG;
  const { out } = run((t) => { const ph = t < 0.5 ? 0 : A * Math.sin(2 * Math.PI * f * (t - 0.5)); return { p: [0.64 * Math.sin(ph), 0, 0.64 * Math.cos(ph)], R: [Math.cos(ph), 0, Math.sin(ph), 0, 1, 0, -Math.sin(ph), 0, Math.cos(ph)] }; }, 4.5);
  const late = out.filter((o) => o.t > 1.5);
  const amp = (k) => Math.max(...late.map((o) => Math.abs(o[k])));
  assert.ok(late.every((o) => o.finite));
  assert.ok(amp("chestRoll") < 0.85 * amp("bikeRoll"), `chest ${amp("chestRoll")} vs bike ${amp("bikeRoll")}`);
  assert.ok(amp("headRoll") < 0.5 * amp("bikeRoll"), `head ${amp("headRoll")} vs bike ${amp("bikeRoll")}`);
  assert.ok(late.every((o) => Math.abs(o.pel[0]) < 0.03), "pelvis stays on the seat centre");
  assert.ok(late.every((o) => o.grips[0] > 0 && o.grips[1] > 0), "hands on the grips");
});

test("braking 1 g to a stop: braced, she stays seated (no climb over the tank) and settles back", () => {
  const a = 9.81, v0 = 20;
  const { out } = run((t) => { const tt = Math.max(0, t - 0.5), tb = Math.min(tt, v0 / a); return { p: [0, v0 * Math.min(t, 0.5) + v0 * tb - 0.5 * a * tb * tb, 0.64], R: I }; }, 3.6);
  const base = out[4].pel;
  assert.ok(out.every((o) => o.finite));
  for (const o of out) {
    assert.ok(o.pel[1] - base[1] < 0.08, `slid forward ${o.pel[1] - base[1]} at ${o.t}`);
    assert.ok(o.pel[2] - base[2] < 0.05, `rose ${o.pel[2] - base[2]} at ${o.t}`);
    assert.ok(o.grips[0] > 0 && o.grips[1] > 0, `grip lost at ${o.t}`);
  }
  const end = out.at(-1).pel;
  assert.ok(Math.abs(end[1] - base[1]) < 0.02 && Math.abs(end[2] - base[2]) < 0.02, `after the stop ${end} vs ${base}`);
});

test("accelerating 0.8 g: holds on, stays seated", () => {
  const a = 0.8 * 9.81;
  const { out } = run((t) => { const tt = Math.max(0, t - 0.5); return { p: [0, 0.5 * a * tt * tt, 0.64], R: I }; }, 3);
  const base = out[4].pel;
  assert.ok(out.every((o) => o.finite && o.grips[0] > 0 && o.grips[1] > 0));
  for (const o of out) assert.ok(Math.hypot(o.pel[1] - base[1], o.pel[2] - base[2]) < 0.05, `moved ${o.pel} at ${o.t}`);
});

test("steady 0.8 g turn at 15 m/s: seated and steady", () => {
  const g = 0.8, V = 15, rad = (V * V) / (g * 9.81), w = V / rad, ph = Math.atan(g);
  const Rz = (a) => [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1];
  const Ry = (a) => [Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)];
  const mul = (A, B) => [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => A[3 * r] * B[c] + A[3 * r + 1] * B[3 + c] + A[3 * r + 2] * B[6 + c]));
  const mv = (A, v) => [0, 1, 2].map((r) => A[3 * r] * v[0] + A[3 * r + 1] * v[1] + A[3 * r + 2] * v[2]);
  const { out } = run((t) => { const th = w * t, Rw = mul(Rz(th), Ry(-ph)), c = [-rad, 0, 0], r0 = mv(Rz(th), [rad, 0, 0]), up = mv(Rw, [0, 0, 0.64]); return { p: [c[0] + r0[0] + up[0], c[1] + r0[1] + up[1], c[2] + r0[2] + up[2]], R: Rw }; }, 3);
  const late = out.filter((o) => o.t > 1);
  assert.ok(late.every((o) => o.finite && o.grips[0] > 0 && o.grips[1] > 0));
  const p0 = late[0].pel;
  for (const o of late) assert.ok(Math.hypot(o.pel[0] - p0[0], o.pel[1] - p0[1], o.pel[2] - p0[2]) < 0.02, `pelvis moved ${o.pel} at ${o.t}`);
});

// Stopped, moving slowly or going down at speed: a bike that can fall (1-DOF roll about its tyre
// contact line: 211 kg, centre of mass 0.52 m, gravity + her contact reactions) carried forward at V
// along the world y axis; optional tyre slip reported to her (bk.slip); the chassis' virtual
// standstill support in its speed window (full below 0.8 m/s, none above 2 m/s) at the share the
// rider layer keeps. holdS: the bike is held at its starting lean for that long.
function rollingBike({ V = 0, phi0Deg = -1, T = 4, holdS = 0, slipDeg = 0, dab = true, gravityOnly = false }) {
  const R = BIO.createRider(character, surfaces);
  R.plan.dabEnabled = dab;
  const h = R.helpers, bk = stubBike(), DEGR = Math.PI / 180;
  const mb = 211, hb = 0.52, I = 22 + mb * hb * hb, assist = 0.4;
  const ground = { height: () => 0, normal: () => [0, 0, 1], grip: () => 1 };
  let phi = phi0Deg * DEGR, dphi = 0, y = 0, contact = 0;
  const setBike = () => { bk.R = h.Ry(phi); bk.p = h.add([0, y, 0], h.mv(bk.R, [0, 0, 0.64])); bk.w = [0, dphi, 0]; bk.v = h.add([0, V, 0], h.cross(bk.w, h.sub(bk.p, [0, y, 0]))); bk.slip = { rearDeg: slipDeg, frontDeg: 0 }; };
  setBike();
  const S = BIO.presettle(R);
  R.body.p = h.add(bk.p, h.mv(bk.R, S.rel.p)); R.body.R = h.mm(bk.R, S.rel.R); R.body.q.set(S.rel.q); R.qT.set(S.rel.qT); R.body.kinematics(); R.matchVelocity(bk);
  const o = { maxRoll: 0, t45: null, t60: null, footContact: null, stanceSlip: 0, stanceS: 0, sinceLand: 0, dabMax: 0 };
  for (let i = 0, t = 0; t <= T; i++, t += dt) {
    setBike();
    const rs = R.forces(bk, ground, dt);
    let M = [0, 0, 0];
    for (const r of rs) { if (r.F) M = h.add(M, h.cross(h.sub(r.x, [0, y, 0]), r.F)); if (r.T) M = h.add(M, r.T); }
    // (as the browser coupling: the support gives way down to its share as far as her foot on the
    // ground carries load, footContactN 150 N filtered over 0.3 s, aimed at the lean onto her foot)
    const f = R.plan.feetDown <= 0 ? 0 : R.plan.feetDown >= 1 ? 1 : R.plan.feetDown * R.plan.feetDown * (3 - 2 * R.plan.feetDown);
    let load = 0;
    for (const s of R.spheres) if (s.ground.on && s.link === R.foot[R.plan.footSide].link) load += s.ground.F[2];
    contact += (Math.min(1, load / 150) - contact) * Math.min(1, dt / 0.3);
    const tgt = R.plan.feetDownWant && !R.plan.pushOff ? f * (R.plan.footSide === "R" ? 1 : -1) * R.plan.footLeanDeg * DEGR : 0;
    const w = gravityOnly ? 0 : Math.max(0, Math.min(1, 1 - (V - 0.8) / 1.2));
    const Mv = Math.max(-450, Math.min(450, -(4000 * (phi - tgt) + 900 * dphi) * w * (1 - (1 - assist) * f * contact)));
    R.integrate(dt);
    if (t >= holdS) { dphi += ((mb * 9.81 * hb * Math.sin(phi) + M[1] + Mv - 5 * dphi) / I) * dt; phi += dphi * dt; }
    y += V * dt;
    const ta = t - holdS;
    if (ta > 1) o.maxRoll = Math.max(o.maxRoll, Math.abs(phi) / DEGR);
    if (o.t45 == null && Math.abs(phi) >= 45 * DEGR) o.t45 = ta;
    if (o.t60 == null && Math.abs(phi) >= 60 * DEGR) o.t60 = ta;
    let sole = 0; for (const s of R.spheres) if (s.ground.on && s.kind === "sole") sole += s.ground.F[2];
    if (o.footContact == null && sole > 20) o.footContact = ta;
    o.dabMax = Math.max(o.dabMax, R.plan.dab);
    if (t > T - 1) { o.lateFootN = (o.lateFootN || 0) + sole * dt; o.lateS = (o.lateS || 0) + dt; }
    // a planted foot's slip on the ground (after the first 0.1 s of each stance)
    if (R.plan.footMode === "stance") {
      o.sinceLand += dt;
      if (o.sinceLand > 0.1) { const v = R.body.pointVelocity(R.foot[R.plan.footSide].link, R.foot[R.plan.footSide].ball); o.stanceSlip += Math.hypot(v[0], v[1]) * dt; o.stanceS += dt; }
    } else o.sinceLand = 0;
    if (!Number.isFinite(phi) || Math.abs(phi) > 1.2) break;
  }
  // (footN: the load her foot carries, averaged over the last second)
  return { ...o, steps: R.plan.step.steps, dabSide: R.plan.dabSide, side: R.plan.footSide, feetDown: R.plan.feetDown, footN: o.lateS ? o.lateFootN / o.lateS : 0, finite: R.body.q.every(Number.isFinite) };
}

test("creeping at 0.3 m/s: her planted foot stays on the ground and she steps as the bike rolls on", () => {
  const r = rollingBike({ V: 0.3, T: 6 });
  assert.ok(r.finite);
  assert.ok(r.steps >= 2, `steps ${r.steps}`);
  assert.ok(r.maxRoll < 6, `bike lean ${r.maxRoll.toFixed(2)} deg`);
  // (the planted foot's own motion on the ground, landing aside, is well under the bike's speed)
  assert.ok(r.stanceS > 1 && r.stanceSlip / r.stanceS < 0.5 * 0.3, `planted foot slips ${(r.stanceSlip / r.stanceS).toFixed(3)} m/s`);
});

// Going down at speed: the rear sliding (12 deg slip) while the bike, let go at 25 deg, falls under
// gravity. Her inside foot goes out and reaches the ground before the bike is down; a leg cannot
// hold a falling 211 kg bike at that lean (the fall to 60 deg takes as long with the dab, within
// 2 %). The same slide with the bike's lean held - a slide ridden through - leaves her feet on the
// pegs.
test("a low-side at 8 m/s (rear sliding, the bike falling): her inside foot reaches the ground before the bike is down", () => {
  const args = { V: 8, phi0Deg: 25, T: 1.4, holdS: 0.4, slipDeg: 12, gravityOnly: true };
  const on = rollingBike({ ...args, dab: true }), off = rollingBike({ ...args, dab: false });
  assert.ok(on.finite && off.finite);
  assert.equal(on.dabSide, "R"); // leaning right: the right foot
  assert.ok(on.footContact !== null && on.footContact < on.t60, `foot on the ground at ${on.footContact}, 60 deg at ${on.t60}`);
  assert.ok(Math.abs(on.t60 / off.t60 - 1) < 0.02, `25 -> 60 deg in ${on.t60?.toFixed(3)} s with the dab, ${off.t60?.toFixed(3)} s without`);
});

test("a rear slide ridden through at 8 m/s (the lean held at 25 deg): her feet stay on the pegs", () => {
  const r = rollingBike({ V: 8, phi0Deg: 25, T: 1, holdS: 2, slipDeg: 12, gravityOnly: true });
  assert.ok(r.finite);
  assert.ok(r.dabMax === 0 && r.footContact === null, `dab ${r.dabMax.toFixed(2)}, foot on the ground at ${r.footContact}`);
});

// Stopped: she puts a foot down on the side the bike leans to and the bike rests on it, leaning a
// little onto that leg. (On the 916 she reaches the ground on tiptoe at the end of her reach: her
// foot carries tens of newtons here, the chassis' declared virtual support the rest.)
for (const a of [-1, 1]) {
  test(`stopped, leaning ${a > 0 ? "right" : "left"} 1 deg: her ${a > 0 ? "right" : "left"} foot goes down and the bike rests on it`, () => {
    const r = rollingBike({ V: 0, phi0Deg: a, T: 4 });
    assert.ok(r.finite);
    assert.equal(r.side, a > 0 ? "R" : "L");
    assert.ok(r.feetDown > 0.99, `feet down ${r.feetDown}`);
    assert.ok(r.maxRoll < 6, `bike lean ${r.maxRoll.toFixed(2)} deg`);
    assert.ok(r.footN > 20, `her foot carries ${r.footN.toFixed(0)} N (last second)`);
  });
}
