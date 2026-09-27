// Her feet (src/core/46_rider_biomech.js): an anatomical tripod on her own sole - the package's
// plantar contact region (contactRegions.leftFoot / rightFoot) - with pads at the heel, the balls of
// the big and little toes and the outer midfoot, and the toes on a flap hinged at her toe joint;
// what each sole feels (R.feel); the ankle's roll worked from that feel; the toes' elastic hold.
// Standing (48_rider_onfoot.js, joint-torque servos off the bike), her weight spreads over the
// tripod and the feet conform to the ground. Bands are sanity bounds from quiet-standing pressure
// studies (heel roughly half the load, the metatarsal heads most of the rest, the centre of pressure
// a few cm ahead of the ankle), not measurements of her.
import test from "node:test";
import assert from "node:assert/strict";
import { character, surfaces, BIO, stubBike } from "./lib/rider-harness.mjs";
await import("../src/core/48_rider_onfoot.js");
const OF = globalThis.LUCID_RIDER_ONFOOT, dt = 1 / 540, DEG = Math.PI / 180;

test("her feet: pads where her own sole is lowest - heel, the two balls, the outer border, the toes on a flap", () => {
  const R = BIO.createRider(character, surfaces);
  for (const S of ["L", "R"]) {
    const ft = R.foot[S], pads = R.spheres.filter((s) => s.kind === "sole" && s.side === S);
    const at = Object.fromEntries(pads.map((s) => [s.at, s]));
    assert.deepEqual(Object.keys(at).sort(), ["ballLat", "ballMed", "hallux", "heel", "midLat", "toes"]);
    const fwd = (s) => s.c[0] * ft.forward[0] + s.c[1] * ft.forward[1] + s.c[2] * ft.forward[2], med = (s) => s.c[0] * ft.med[0];
    // (heel behind the balls, the balls behind the toe joint, the toes ahead of it; the little
    // toe's ball on the outside and not ahead of the big toe's)
    const toeJoint = ft.toes.pivot[0] * ft.forward[0] + ft.toes.pivot[1] * ft.forward[1] + ft.toes.pivot[2] * ft.forward[2];
    assert.ok(fwd(at.heel) < fwd(at.midLat) && fwd(at.midLat) < fwd(at.ballLat) && fwd(at.ballLat) <= fwd(at.ballMed) + 1e-3 && fwd(at.ballMed) < toeJoint && toeJoint < fwd(at.hallux));
    assert.ok(med(at.ballMed) - med(at.ballLat) > 0.04, `tripod width ${(med(at.ballMed) - med(at.ballLat)).toFixed(3)} m`);
    assert.ok(at.hallux.toe && at.toes.toe && !at.heel.toe && !at.ballMed.toe);
    // (each pad's bottom on her rest sole, the outer border a few mm up: the lateral arch)
    for (const s of pads) assert.ok(s.c[1] - s.r - ft.soleY < 0.007, `${s.at} ${(1000 * (s.c[1] - s.r - ft.soleY)).toFixed(1)} mm up`);
    // (what stands on a peg: between the two metatarsal heads)
    assert.ok(Math.abs(fwd({ c: ft.ball }) - (fwd(at.ballMed) + fwd(at.ballLat)) / 2) < 1e-9);
    // (the toe joint is the asset's toe DOF, within its range)
    assert.ok(ft.toes.id.endsWith("Toe.flexionExtension") && ft.toes.lo < 0 && ft.toes.hi > 0);
  }
});

function stand(T, slopeDeg = 0) {
  const sl = slopeDeg * DEG;
  // (a cross-slope: the ground rises to her right)
  const ground = { height: (x) => Math.tan(sl) * x, normal: () => [-Math.sin(sl), 0, Math.cos(sl)], grip: () => 1 };
  const R = BIO.createRider(character, surfaces), G = OF.install(R), bk = stubBike();
  bk.p = [0, 0, 100]; bk.slip = { rearDeg: 0, frontDeg: 0 };
  G.placeStanding([0, 0, 0], 0);
  let fell = null;
  const acc = { L: null, R: null }, n = { L: 0, R: 0 };
  for (let t = 0; t <= T; t += dt) {
    G.setIntent([0, 0]);
    R.forces(bk, ground, dt);
    R.integrate(dt);
    if (fell == null && R.plan.mode === "fallen") fell = t;
    if (t > T - 1) for (const S of ["L", "R"]) {
      // (the last second, averaged)
      const f = R.feel.feet[S], up = R.helpers.mv(R.body.Rw[R.foot[S].link], R.foot[S].up), gn = ground.normal();
      const v = { N: f.N, ...f.pads, across: f.cop[0], along: f.cop[1], tilt: Math.acos(Math.min(1, up[0] * gn[0] + up[1] * gn[1] + up[2] * gn[2])) / DEG, toe: R.foot[S].toes.q / DEG };
      acc[S] = acc[S] ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, acc[S][k] + x])) : v;
      n[S]++;
    }
  }
  const mean = Object.fromEntries(["L", "R"].map((S) => [S, Object.fromEntries(Object.entries(acc[S]).map(([k, x]) => [k, x / n[S]]))]));
  return { R, fell, mean };
}

test("standing on level ground: her weight spreads over each tripod - heel about half, both balls, the pressure centred across the foot and a few cm ahead of the ankle; soles flat, toes relaxed", () => {
  const { fell, mean, R } = stand(4);
  assert.equal(fell, null);
  for (const S of ["L", "R"]) {
    const m = mean[S], ft = R.foot[S];
    assert.ok(m.N > 250 && m.N < 450, `${S} load ${m.N.toFixed(0)} N`);
    assert.ok(m.heel / m.N > 0.4 && m.heel / m.N < 0.75, `${S} heel ${((100 * m.heel) / m.N).toFixed(0)} %`);
    assert.ok(m.ballMed / m.N > 0.1 && m.ballLat / m.N > 0.1, `${S} balls ${((100 * m.ballMed) / m.N).toFixed(0)} / ${((100 * m.ballLat) / m.N).toFixed(0)} %`);
    const mid = ft.ball[0] * ft.med[0];
    assert.ok(Math.abs(m.across - mid) < 0.01, `${S} across ${(100 * m.across).toFixed(1)} cm`);
    assert.ok(m.along > 0.02 && m.along < 0.08, `${S} along ${(100 * m.along).toFixed(1)} cm`);
    assert.ok(m.tilt < 4, `${S} sole ${m.tilt.toFixed(1)} deg to the ground`);
    assert.ok(Math.abs(m.toe) < 10, `${S} toes ${m.toe.toFixed(1)} deg`);
  }
});

test("standing across a 10 deg slope: both feet lie on it (soles within 4 deg), each on its heel and both balls", () => {
  const { fell, mean } = stand(4, 10);
  assert.equal(fell, null);
  for (const S of ["L", "R"]) {
    const m = mean[S];
    assert.ok(m.tilt < 4, `${S} sole ${m.tilt.toFixed(1)} deg to the ground`);
    assert.ok(m.heel > 0.2 * m.N && m.ballMed > 0.05 * m.N && m.ballLat > 0.05 * m.N, `${S} heel ${m.heel.toFixed(0)} balls ${m.ballMed.toFixed(0)} / ${m.ballLat.toFixed(0)} of ${m.N.toFixed(0)} N`);
  }
});
