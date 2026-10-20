// Her feet (src/core/46_rider_biomech.js), two models of her sole on her own skin - the package's
// plantar contact region (contactRegions.leftFoot / rightFoot): an anatomical tripod (pads at the
// heel, the balls of the big and little toes and the outer midfoot) and a padded plantar surface
// (contact elements by region: heel, outer midfoot, the balls either side of the forefoot's middle,
// the toes) - the toes on a flap hinged at her toe joint either way;
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
  assert.equal(R.footModel, "tripod");
  for (const S of ["L", "R"]) {
    const ft = R.foot[S], pads = R.spheres.filter((s) => s.kind === "sole" && s.model === "tripod" && s.side === S);
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

test("her feet: a padded plantar surface on her own sole - heel, outer midfoot, the balls either side, the toes on a flap", () => {
  const R = BIO.createRider(character, surfaces), PL = R.priors.plantar;
  for (const S of ["L", "R"]) {
    const ft = R.footRef.plantar[S], els = R.soles.plantar.filter((s) => s.side === S);
    const by = {};
    for (const e of els) (by[e.at] || (by[e.at] = [])).push(e);
    assert.deepEqual(Object.keys(by).sort(), ["ballLat", "ballMed", "hallux", "heel", "midLat", "toes"]);
    assert.ok(els.length >= 40, `${S} ${els.length} plantar elements`);
    for (const k in by) assert.ok(by[k].length >= 2, `${S} ${k}: ${by[k].length} elements`);
    // (each region's pad shared by its elements: the regions' scales as declared)
    const sumA = (ks) => ks.reduce((a, k) => a + by[k].reduce((b, e) => b + e.A, 0), 0);
    assert.ok(Math.abs(sumA(["heel"]) - PL.heel.A) < 1e-9 && Math.abs(sumA(["ballMed", "ballLat"]) - PL.ball.A) < 1e-9 && Math.abs(sumA(["midLat"]) - PL.mid.A) < 1e-9 && Math.abs(sumA(["hallux", "toes"]) - PL.toe.A) < 1e-9);
    const fwd = (c) => c[0] * ft.forward[0] + c[1] * ft.forward[1] + c[2] * ft.forward[2], med = (c) => c[0] * ft.med[0];
    const cen = (k) => [0, 1, 2].map((i) => by[k].reduce((a, e) => a + e.c[i], 0) / by[k].length);
    // (heel behind the midfoot, the midfoot behind the balls, the balls behind the toe joint, the
    // toes ahead of it; the little toe's side outside the big toe's)
    const toeJoint = fwd(ft.toes.pivot);
    assert.ok(fwd(cen("heel")) < fwd(cen("midLat")) && fwd(cen("midLat")) < fwd(cen("ballLat")) && fwd(cen("ballMed")) < toeJoint + 0.01 && toeJoint < fwd(cen("hallux")));
    assert.ok(med(cen("ballMed")) - med(cen("ballLat")) > 0.03, `forefoot width ${(med(cen("ballMed")) - med(cen("ballLat"))).toFixed(3)} m`);
    assert.ok(med(cen("hallux")) > med(cen("toes")));
    assert.ok(by.hallux.every((e) => e.toe) && by.toes.every((e) => e.toe) && !by.heel.some((e) => e.toe) && !by.ballMed.some((e) => e.toe));
    // (each element's bottom on her rest sole: within plantarMaxM of its lowest point, the heel's and
    // the balls' lowest a few mm)
    for (const e of els) assert.ok(e.c[1] - e.r - ft.soleY < PL.plantarMaxM + 1e-9, `${e.at} ${(1000 * (e.c[1] - e.r - ft.soleY)).toFixed(1)} mm up`);
    for (const k of ["heel", "ballMed", "ballLat"]) assert.ok(Math.min(...by[k].map((e) => e.c[1] - e.r - ft.soleY)) < 0.004, `${k} lowest ${(1000 * Math.min(...by[k].map((e) => e.c[1] - e.r - ft.soleY))).toFixed(1)} mm`);
    // (what stands on a peg: between the two balls)
    assert.ok(Math.abs(fwd(ft.ball) - (fwd(cen("ballMed")) + fwd(cen("ballLat"))) / 2) < 1e-9);
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

// In her shoes (tools/character/fit-shoes.mjs' contact data, as the game has her): each point of her
// sole on the tread below it, her toe pads turning with the shoe's forefoot about its flex line
// against the rubber's bending stiffness, the shoes' mass on her feet.
test("in her shoes: her pads on the tread, her toes turning about the sole's flex line, the shoes' mass on her feet", async () => {
  const fs = await import("node:fs"), path = await import("node:path");
  const shoes = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "../assets/character/accessories/lucid_vans_v1_contact.json"), "utf8"));
  const bare = BIO.createRider(character, surfaces, { shoes: null }), shod = BIO.createRider(character, surfaces, { shoes });
  assert.equal(shod.shoes, shoes);
  for (const S of ["L", "R"]) {
    const b = bare.foot[S], s = shod.foot[S], sh = shoes.sides[S];
    // (her sole stands the outsole and insole higher: 11-16 mm, the tread's own shape)
    const lift = b.soleY - s.soleY;
    assert.ok(lift > 0.011 && lift < 0.016, `${S}: in her shoes her sole stands ${(lift * 1000).toFixed(1)} mm up`);
    for (const at of ["heel", "ballMed", "ballLat"]) {
      const pb = bare.spheres.find((q) => q.kind === "sole" && q.side === S && q.at === at), ps = shod.spheres.find((q) => q.kind === "sole" && q.side === S && q.at === at);
      assert.ok(pb.c[1] - ps.c[1] > 0.009, `${S} ${at}: on the tread`);
    }
    // (her toe pads turn about the shoe's flex line, below her toe joint, against its sole too)
    const an = character.joints.rest[character.joints.names.indexOf(S + "_Foot")];
    assert.deepEqual(s.toes.pivot.map((x) => +x.toFixed(6)), sh.flexPoint.map((x, k) => +(x - an[k]).toFixed(6)));
    assert.ok(s.toes.pivot[1] < b.toes.pivot[1] - 0.015, "the flex line below her toe joint");
    assert.equal(s.toes.soleK, shoes.soleBend.NmPerRad);
    assert.equal(b.toes.soleK, 0);
    // (each shoe's mass on her foot)
    const mb = bare.model.links[b.link].mass, ms = shod.model.links[s.link].mass;
    assert.ok(Math.abs(ms - mb - sh.massKg) < 1e-9);
  }
  assert.ok(Math.abs(shod.model.totalMass - bare.model.totalMass - shoes.sides.L.massKg - shoes.sides.R.massKg) < 1e-9);
});
