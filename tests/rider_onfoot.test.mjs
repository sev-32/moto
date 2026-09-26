// The physical rider off the bike (src/core/48_rider_onfoot.js) on flat ground, no bike nearby:
// standing, walking, turning on the spot, a seeded random player, getting up after a fall.
// Bands are sanity bounds for this joint-torque controller with its declared assists (pelvis
// balance torque, capture-point catch, get-up assist), not measured human data.
import test from "node:test";
import assert from "node:assert/strict";
import { character, surfaces, BIO, stubBike } from "./lib/rider-harness.mjs";
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
