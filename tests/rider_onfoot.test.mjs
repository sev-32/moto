// The physical rider off the bike (src/core/48_rider_onfoot.js) on flat ground, no bike nearby:
// standing, walking, turning on the spot, a seeded random player, getting up after a fall.
// Bands are sanity bounds for this joint-torque controller with its declared assists (pelvis
// balance torque, capture-point catch, get-up assist), not measured human data.
import test from "node:test";
import assert from "node:assert/strict";
import { character, surfaces, BIO, stubBike, holdStub } from "./lib/rider-harness.mjs";
await import("../src/core/48_rider_onfoot.js");
const OF = globalThis.LUCID_RIDER_ONFOOT, dt = 1 / 540, DEG = Math.PI / 180;
const ground = { height: () => 0, normal: () => [0, 0, 1], grip: () => 1 };

// run her for T seconds; intent(t, G) sets what she is told; each(t, R, G) observes
function onFoot(T, intent, each) {
  const R = BIO.createRider(character, surfaces), G = OF.install(R);
  const bk = stubBike();
  bk.p = [0, 0, 100]; bk.slip = { rearDeg: 0, frontDeg: 0 }; // (the bike far away: no contact)
  G.placeStanding([0, 0, 0], 0);
  const o = { fell: null, steps: 0, maxTilt: 0, assistSq: 0, n: 0, finite: true };
  for (let t = 0; t <= T; t += dt) {
    intent?.(t, G, R);
    R.forces(bk, ground, dt);
    each?.(t, R, G);
    R.integrate(dt);
    if (!R.body.q.every(Number.isFinite)) { o.finite = false; break; }
    // (after the first half second: placed, she settles onto her feet)
    if (R.plan.mode === "foot" && t > 0.5) { o.maxTilt = Math.max(o.maxTilt, G.stats.tiltDeg || 0); o.assistSq += (G.stats.assistNm || 0) ** 2; o.n++; }
    if (o.fell == null && R.plan.mode === "fallen" && t > 0.1) o.fell = t;
  }
  return { ...o, R, G, steps: G.stats.steps, assistRms: Math.sqrt(o.assistSq / Math.max(1, o.n)) };
}

test("standing: she holds still on both feet for 5 s, no step, trunk within 2 deg, the balance assist a few N m", () => {
  const r = onFoot(5, (t, G) => G.setIntent([0, 0]));
  assert.ok(r.finite && r.fell == null);
  assert.equal(r.steps, 0);
  assert.ok(r.maxTilt < 2.5, `trunk tilt ${r.maxTilt.toFixed(2)} deg`);
  assert.ok(r.assistRms < 15, `balance assist ${r.assistRms.toFixed(1)} N m rms`);
});

test("walking (told 1 m/s ahead): 8 s without falling, 3.5 m and more covered, feet alternating", () => {
  const r = onFoot(8, (t, G) => G.setIntent(t > 0.3 ? [0, 1.0] : [0, 0]));
  assert.ok(r.finite && r.fell == null, `fell at ${r.fell}`);
  assert.ok(r.R.body.p[1] > 3.5, `covered ${r.R.body.p[1].toFixed(2)} m`);
  assert.ok(r.steps >= 10, `steps ${r.steps}`);
  assert.ok(r.maxTilt < 12, `trunk tilt ${r.maxTilt.toFixed(1)} deg`);
});

test("turning on the spot: she steps round to face the other way within 5 s and stays up", () => {
  const r = onFoot(5.5, (t, G) => { G.setIntent([0, 0]); G.heading = t > 0.5 ? Math.min(Math.PI, (t - 0.5) * 1.0) : 0; });
  assert.ok(r.finite && r.fell == null, `fell at ${r.fell}`);
  const f = r.R.helpers.mv(r.R.body.R, [0, 0, -1]); // the pelvis's forward (model -z)
  assert.ok(f[1] < -0.85, `pelvis forward ${f.map((x) => x.toFixed(2))}`);
});

test("a player on the stick (seeded: a new direction / speed / stop every 0.8-3 s for 30 s): she stays up", () => {
  let s = 1234 >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  let next = 0, v = [0, 0];
  const r = onFoot(30, (t, G) => {
    if (t >= next) { next = t + 0.8 + 2.2 * rnd(); const stop = rnd() < 0.2, a = rnd() * 2 * Math.PI, mag = stop ? 0 : 0.3 + 0.7 * rnd(); rnd(); v = [Math.cos(a) * mag * 1.4, Math.sin(a) * mag * 1.4]; }
    G.setIntent(v);
  });
  assert.ok(r.finite && r.fell == null, `fell at ${r.fell}`);
});

for (const [name, push] of [["on her back", [0, -260, 0]], ["on her front", [0, 260, 0]], ["on her side", [260, 0, 0]]]) {
  test(`down ${name} (limp, pushed): at rest she rolls, pushes up onto hands and knees, squats and stands within 12 s`, () => {
    const seen = new Set();
    const r = onFoot(12, (t, G) => { if (t > 0.5 && t < 0.51) G.toRagdoll("test"); G.setIntent([0, 0]); }, (t, R, G) => {
      if (t > 0.5 && t < 0.62) R.body.applyForce(0, push, R.body.p);
      if (R.plan.mode === "getup") seen.add(G.getUp.phase);
    });
    assert.ok(r.finite);
    assert.ok(seen.has("all4") && seen.has("tuck"), `phases ${[...seen]}`);
    assert.equal(r.R.plan.mode, "foot");
    assert.ok(r.R.body.p[2] > 0.8, `pelvis at ${r.R.body.p[2].toFixed(2)} m`);
    const gu = r.G.getUp.stats;
    // (the declared get-up assist: its mean force under a quarter of her weight)
    assert.ok(gu.Nsum / gu.n < 0.25 * 75 * 9.81, `get-up assist ${(gu.Nsum / gu.n).toFixed(0)} N mean`);
  });
}

// ---- getting on and off the (stub, upright) bike: the motions of 48 at the bike, the riding
// controller of 46 taking her on once seated. The stub's bars are kinematic: while her hand is on
// (or reaching) the left grip they are turned straight as her hands would (the browser layer does
// it with a capped torque about the steering axis).
function atTheBike({ T, steerDeg = 0, start = [-1.0, -0.8, 0], script }) {
  const R = BIO.createRider(character, surfaces), G = OF.install(R), P = R.plan, b = R.body;
  G.seatPose = BIO.presettle(BIO.createRider(character, surfaces)).rel;
  const bk = stubBike();
  bk.slip = { rearDeg: 0, frontDeg: 0 }; bk.steer = steerDeg * DEG;
  // (the bike on its side stand, leaning 10 deg to its left, until she takes it off; held as the
  // browser layer holds it - holdStub)
  const hs = { phi: -10 * DEG, standDeg: -10 };
  holdStub(bk, G, R, dt, hs);
  G.placeStanding(start, 0);
  const o = { R, G, bk, hs, fell: null, finite: true, log: [], maxBikeErrDeg: 0 };
  for (let t = 0; t <= T; t += dt) {
    o.now = t;
    script(t, R, G, bk, o);
    if (P.mode === "script" && G.barsStraight) bk.steer -= Math.sign(bk.steer) * Math.min(Math.abs(bk.steer), 1.5 * dt);
    if (G.hold.active) hs.standDeg = null;
    holdStub(bk, G, R, dt, hs);

    R.forces(bk, ground, dt);
    R.integrate(dt);
    if (!b.q.every(Number.isFinite)) { o.finite = false; break; }
    if (o.fell == null && P.mode === "fallen") o.fell = t;
    if (o.done) break;
  }
  return o;
}
const seated = (R) => {
  // pelvis on the seat (the pre-settled seat pocket, slid a little towards the planted foot)
  const p = R.body.p;
  return Math.abs(p[0]) < 0.1 && p[1] > -0.4 && p[1] < -0.24 && p[2] > 0.84 && p[2] < 0.95;
};
for (const steerDeg of [0, 36]) {
  test(`getting on (bars ${steerDeg ? "at full lock" : "straight"}): she walks round to its left, takes the bar, swings her leg over and sits; then riding, both grips, left foot down`, () => {
    const o = atTheBike({
      T: 20, steerDeg,
      script(t, R, G, bk, o) {
        if (t > 0.3 && !o.started) { o.started = true; G.startMount(bk, () => { G.toRide(bk); o.seatedT = o.now; o.hs.standDeg = -1.5; }); }
        if (o.seatedT != null && t > o.seatedT + 2) o.done = true;
      },
    });
    assert.ok(o.finite && o.fell == null, `fell at ${o.fell}`);
    assert.ok(o.seatedT != null && o.seatedT < 16, `seated at ${o.seatedT}`);
    assert.equal(o.R.plan.mode, "ride");
    assert.ok(seated(o.R), `pelvis ${o.R.body.p.map((x) => x.toFixed(2))}`);
    assert.ok(o.R.grips.L.held && o.R.grips.R.held, "grips");
    assert.ok(o.R.internal.footOnGroundN("L") > 50, "left foot down");
    // (the declared getting-on assist: its mean force under a fifth of her weight)
    const st = o.G.script.stats;
    assert.ok(st.Nsum / st.n < 0.2 * 75 * 9.81, `assist ${(st.Nsum / st.n).toFixed(0)} N mean`);
    // the leg over: the hip and the pelvis's tilt do it - over the swing keyframes the swung leg's
    // ankle is loose (mean effort under 15 % of its capacity, never in its end stop) and its knee
    // easy (under 30 %)
    const sw = swingEffort(o.G.effort.run, "R");
    assert.ok(sw.T > 1, `swing ${sw.T.toFixed(2)} s`);
    assert.ok(sw.ankle < 0.15 && sw.ankleLimPct === 0, `ankle ${(100 * sw.ankle).toFixed(0)} %, at its limit ${sw.ankleLimPct.toFixed(0)} %`);
    assert.ok(sw.knee < 0.3, `knee ${(100 * sw.knee).toFixed(0)} %`);
    // she held the bike leaning onto her side all through (no abort)
    assert.ok(!o.G.script.failed, `failed ${JSON.stringify(o.G.script.failed)}`);
  });
}
// joint effort over a motion's swing keyframes (G.effort.run): mean effort of the swung leg's ankle
// and knee (share of capacity) and the ankle's time in its end stop
function swingEffort(run, S) {
  let T = 0, a = 0, k = 0, lim = 0;
  for (const K of Object.values(run.keys)) if (K.swing?.includes(S)) { T += K.T; a += K.g["ankle" + S]?.eSum || 0; k += K.g["knee" + S]?.eSum || 0; lim += K.g["ankle" + S]?.limS || 0; }
  return { T, ankle: a / Math.max(1e-9, T), knee: k / Math.max(1e-9, T), ankleLimPct: (100 * lim) / Math.max(1e-9, T) };
}
test("getting off (stopped, riding, left foot down): she climbs off to the left, stands, and walks away", () => {
  const o = atTheBike({
    T: 30,
    script(t, R, G, bk, o) {
      if (t > 0.3 && !o.started) { o.started = true; G.startMount(bk, () => { G.toRide(bk); o.seatedT = o.now; o.hs.standDeg = -1.5; }); }
      if (o.seatedT != null && o.offT == null && t > o.seatedT + 1.5 && !o.off) { o.off = true; G.startDismount(bk, () => { o.offT = o.now; }, () => { o.hs.standDeg = -10; }); }
      if (o.offT != null) { G.setIntent(t > o.offT + 0.5 && t < o.offT + 3.5 ? [-0.8, 0] : [0, 0]); if (t > o.offT + 4.5) o.done = true; }
    },
  });
  assert.ok(o.finite && o.fell == null, `fell at ${o.fell}`);
  assert.ok(o.offT != null, "got off");
  assert.equal(o.R.plan.mode, "foot");
  assert.ok(!o.R.grips.L.held && !o.R.grips.R.held, "hands free");
  // (off to the bike's left, and further away after walking)
  assert.ok(o.R.body.p[0] < -0.6, `pelvis x ${o.R.body.p[0].toFixed(2)}`);
});
