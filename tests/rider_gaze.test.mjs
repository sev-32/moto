// Where she looks (R.gaze, 46_rider_biomech.js; on foot 48_rider_onfoot.js): the head carries its
// share of the gaze, turning at most a head saccade's rate. Riding, she looks through a turn - at the
// road ahead on the arc her bike is taking; on foot, at the path ahead of her, and when she is told a
// new way her head turns there before her body does. Bands are sanity bounds, not measurements.
import test from "node:test";
import assert from "node:assert/strict";
import { character, surfaces, BIO, stubBike } from "./lib/rider-harness.mjs";
await import("../src/core/48_rider_onfoot.js");
const OF = globalThis.LUCID_RIDER_ONFOOT, dt = 1 / 540, DEG = Math.PI / 180;
const turnOf = (R) => {
  // (her head's turn on her chest: the neck's and the head's axial rotation, + to her left)
  const HI = R.internal.hingeIndex, H = R.internal.H, q = (id) => R.body.q[H[HI[id]].link];
  return (q("neck.axialRotation") + q("head.turn")) / DEG;
};

// a steady 0.8 g left turn at 15 m/s on the stub (as rider_biomech's): her mean head turn on her
// neck over the last 1.5 s, and her gaze
// (R.priors is the layer's shared prior table: an override is put back after the run)
function steadyTurn(gazeOverride) {
  const R = BIO.createRider(character, surfaces), h = R.helpers, bk = stubBike(), b = R.body;
  const saved = { ...R.priors.gaze };
  if (gazeOverride) Object.assign(R.priors.gaze, gazeOverride);
  try { return steadyTurnRun(R, h, bk, b); } finally { Object.assign(R.priors.gaze, saved); }
}
function steadyTurnRun(R, h, bk, b) {
  const g = 0.8, V = 15, rad = (V * V) / (g * 9.81), w = V / rad, ph = Math.atan(g);
  const Rz = (a) => [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1];
  const Ry = (a) => [Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)];
  const pose = (t) => { const th = w * t, Rw = h.mm(Rz(th), Ry(-ph)), r0 = h.mv(Rz(th), [rad, 0, 0]), up = h.mv(Rw, [0, 0, 0.64]); return { p: [-rad + r0[0] + up[0], r0[1] + up[1], r0[2] + up[2]], R: Rw }; };
  const set = (t) => { const a = pose(t), c = pose(t + dt); bk.p = a.p; bk.R = a.R; bk.v = h.scl(h.sub(c.p, a.p), 1 / dt); bk.w = h.scl(h.logSO3(h.mm(c.R, h.mt(a.R))), 1 / dt); };
  const S = BIO.presettle(R);
  set(0);
  b.p = h.add(bk.p, h.mv(bk.R, S.rel.p)); b.R = h.mm(bk.R, S.rel.R); b.q.set(S.rel.q); R.qT.set(S.rel.qT); b.kinematics(); R.matchVelocity(bk);
  let sum = 0, n = 0;
  for (let t = 0; t <= 3; t += dt) {
    set(t); R.forces(bk, null, dt);
    if (t > 1.5) { sum += turnOf(R); n++; }
    R.integrate(dt);
  }
  return { turn: sum / n, gaze: R.telemetry.gaze };
}

test("riding a steady 0.8 g left turn at 15 m/s: she looks through it - her head turned into the turn on her neck", () => {
  const on = steadyTurn(), off = steadyTurn({ headShare: 0, pitchShare: 0 });
  assert.ok(on.gaze.what.startsWith("road") && on.gaze.yawDeg > 20 && on.gaze.yawDeg < 40, `gaze ${JSON.stringify(on.gaze)}`);
  // (her neck already twists keeping her head towards the horizon on the leaned bike: the look's own
  // share is the difference)
  const look = on.turn - off.turn;
  assert.ok(look > 8 && look < 32, `head turned ${look.toFixed(1)} deg further into the turn by her look (${on.turn.toFixed(1)} vs ${off.turn.toFixed(1)} deg)`);
});

test("on foot: walking she looks at the path ahead; told to go left she turns her head there before her body", () => {
  const R = BIO.createRider(character, surfaces), G = OF.install(R), bk = stubBike();
  bk.p = [0, 0, 100]; bk.slip = { rearDeg: 0, frontDeg: 0 };
  const ground = { height: () => 0, normal: () => [0, 0, 1], grip: () => 1 };
  G.placeStanding([0, 0, 0], 0);
  let walkPitch = null, headLead = null, fell = null;
  const psiOf = () => { const f = R.helpers.mv(R.body.R, [0, 0, -1]); return Math.atan2(-f[0], f[1]); };
  let psi0 = null;
  for (let t = 0; t <= 5; t += dt) {
    G.setIntent(t > 1 && t < 3.5 ? [0, 1] : t >= 3.5 ? [-1, 0] : [0, 0]);
    R.forces(bk, ground, dt); R.integrate(dt);
    if (fell == null && R.plan.mode === "fallen") fell = t;
    if (t > 3 && t < 3.4) walkPitch = R.telemetry.gaze.pitchDeg;
    if (t >= 3.5 && psi0 == null) psi0 = psiOf();
    // (0.25 s after the new way: her head has turned towards it more than her pelvis has)
    if (t >= 3.75 && headLead == null) headLead = { head: turnOf(R), pelvis: (psiOf() - psi0) / DEG };
  }
  assert.equal(fell, null);
  assert.ok(walkPitch > 15 && walkPitch < 35, `looking ${walkPitch} deg down at the path`);
  assert.ok(headLead.head > 20 && headLead.head > headLead.pelvis, `0.25 s in: head ${headLead.head.toFixed(1)} deg, pelvis ${headLead.pelvis.toFixed(1)} deg`);
});
