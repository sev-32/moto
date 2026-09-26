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
