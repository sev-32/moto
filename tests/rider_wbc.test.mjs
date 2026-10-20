// Her whole-body muscle control on her feet (src/core/46_rider_wbc.js - R1.5 lucid_bcr.neuro, ported):
// she stands on her own muscles - no motors, no pose servos, no balance assist - on her plantar soles
// (46's "plantar" foot model), each control tick one bounded least-squares plan over her muscles'
// activations and the ground's push. Quiet stance and chest pushes, as R1.5's stance receipts measure
// them; standing on one foot, either foot (R1.5's single-leg receipt); the plan's optimality; what the
// drive engages while it drives and hands back when it stops. Bands are sanity bounds around this
// controller's measured behaviour (quiet stance: centre of mass within ~3 mm, head within ~3 deg; a
// 100 N chest push in each direction kept without a step; on one foot 3.7 s of 7, pelvis within ~8 deg,
// chest ~21 deg, head back within ~2 deg), not measured human data.
import test from "node:test";
import assert from "node:assert/strict";
import { character, surfaces, BIO, stubBike } from "./lib/rider-harness.mjs";
await import("../src/core/48_rider_onfoot.js");
await import("../src/core/46_rider_wbc.js");
const OF = globalThis.LUCID_RIDER_ONFOOT, WBC = globalThis.LUCID_RIDER_WBC, dt = 1 / 540, DEG = Math.PI / 180;
const ground = { height: () => 0, normal: () => [0, 0, 1], grip: () => 1 };

// stand her on her muscles for T s; each(t, R, W) observes after every step, push(t) adds a force
function onMuscles(T, { push, each, params, fsm } = {}) {
  const R = BIO.createRider(character, surfaces), G = OF.install(R), b = R.body;
  const bk = stubBike(); bk.p = [0, 0, 100];
  G.placeStanding([0, 0, 0], 0);
  const W = WBC.create(R, { params });
  W.setPosture(b.q, 0);
  // (48's own foot mode plans nothing: the controller holds her)
  R.modes.foot = () => { G.com = b.totals().com; };
  W.reset(); W.driving = true; W.fsmOn = !!fsm;
  const tilt = (li) => { const up = [b.Rw[li][1], b.Rw[li][4], b.Rw[li][7]]; return Math.acos(Math.max(-1, Math.min(1, up[2]))) / DEG; };
  const o = { R, G, W, b, finite: true, fell: null, comEx: 0, headMax: 0, a2Late: 0, nLate: 0, tilt };
  let com0 = null;
  for (let t = 0; t <= T; t += dt) {
    R.forces(bk, ground, dt);
    if (push && t >= push.t && t < push.t + push.dur) b.applyForce(R.model.linkOf.Spine02, push.F, b.toWorld(R.model.linkOf.Spine02, b.links[R.model.linkOf.Spine02].com));
    R.integrate(dt);
    if (!b.q.every(Number.isFinite)) { o.finite = false; break; }
    if (o.fell == null && b.p[2] < 0.6) o.fell = t;
    const c = b.totals().com;
    if (t > 0.5) {
      com0 ||= c;
      o.comEx = Math.max(o.comEx, Math.hypot(c[0] - com0[0], c[1] - com0[1]));
      o.headMax = Math.max(o.headMax, tilt(R.model.linkOf.Head));
      if (t > 1.5) { let s = 0; for (const a of R.muscles.M.act) s += a * a; o.a2Late += s / R.muscles.M.n; o.nLate++; }
    }
    each?.(t, R, W, o, G);
  }
  o.headEnd = tilt(R.model.linkOf.Head);
  return o;
}

test("on her own muscles: quiet stance for 2.5 s on her plantar soles - centre of mass within 6 mm, head within 6 deg, little effort", () => {
  let model = null, cands = null, assisted = false;
  // (48's balance assist - its pelvis torque - stands down under her own muscles)
  const o = onMuscles(2.5, { each: (t, R, W, o_, G) => { if (t > 0.2 && model == null) { model = R.footModel; cands = R.muscles.M.candidates.slice(); } if (G.stats.assistNm) assisted = true; } });
  assert.ok(o.finite && o.fell == null, `fell at ${o.fell}`);
  // (she stands on her plantar soles, with the controller's declared muscle geometry)
  assert.equal(model, "plantar");
  assert.deepEqual(cands, ["scmNodAntagonist"]);
  assert.ok(!assisted);
  assert.ok(o.comEx < 0.006, `centre of mass ${(1000 * o.comEx).toFixed(1)} mm`);
  assert.ok(o.headMax < 6, `head ${o.headMax.toFixed(1)} deg`);
  const a2 = o.a2Late / Math.max(1, o.nLate);
  assert.ok(a2 < 0.03, `mean squared activation ${a2.toFixed(4)}`);
  // (her weight on her soles: the ground bears what she weighs)
  let Fz = 0; for (const s of o.R.spheres) if (s.ground.on) Fz += s.ground.F[2];
  assert.ok(Math.abs(Fz - o.R.internal.bodyWeightN) < 0.05 * o.R.internal.bodyWeightN, `ground ${Fz.toFixed(0)} N, her weight ${o.R.internal.bodyWeightN.toFixed(0)} N`);
});

for (const [name, F] of [["forward", [0, 80, 0]], ["to her left", [-80, 0, 0]]]) {
  test(`pushed at her chest (80 N ${name} for 0.1 s): she keeps her feet on her muscles alone, her head back within 10 deg`, () => {
    const o = onMuscles(2.6, { push: { t: 0.8, dur: 0.1, F } });
    assert.ok(o.finite && o.fell == null, `fell at ${o.fell}`);
    assert.ok(o.headEnd < 10, `head ${o.headEnd.toFixed(1)} deg at the end`);
    // (no step: her feet where they stood)
    for (const S of ["L", "R"]) assert.ok(o.R.feel.feet[S].N > 100, `${S} foot bears ${o.R.feel.feet[S].N.toFixed(0)} N`);
  });
}

for (const side of ["L", "R"]) {
  const other = side === "L" ? "R" : "L";
  test(`on one foot (her ${side === "L" ? "left" : "right"}): asked at 1 s, she shifts onto it, lifts the other foot and holds it up - pelvis within 10 deg, chest 25, her head back within 8 deg`, () => {
    let up = 0, pel = 0, chest = 0;
    const o = onMuscles(7, {
      fsm: true,
      each: (t, R, W, o_) => {
        if (Math.abs(t - 1) < dt / 2) W.requestSingleLeg(side);
        if (W.fsm.state !== "hold") return;
        if (!R.spheres.some((s) => s.kind === "sole" && s.side === other && s.ground.on)) up += dt;
        pel = Math.max(pel, o_.tilt(0)); chest = Math.max(chest, o_.tilt(R.model.linkOf.Spine02));
      },
    });
    assert.ok(o.finite && o.fell == null, `fell at ${o.fell}`);
    assert.deepEqual(o.W.fsm.log.map((e) => e[2]), ["shift", "swing", "hold"]);
    assert.ok(up > 3, `on one foot ${up.toFixed(2)} s`);
    assert.ok(pel < 10, `pelvis ${pel.toFixed(1)} deg`);
    assert.ok(chest < 25, `chest ${chest.toFixed(1)} deg`);
    assert.ok(o.headEnd < 8, `head ${o.headEnd.toFixed(1)} deg at the end`);
  });
}

test("the plan: each tick's bounded least squares is solved to optimality, inside every muscle's reachable activations", () => {
  let worst = 0, ticks = 0, inside = true;
  onMuscles(1.2, {
    each: (t, R, W) => {
      if (W.stats.ticks !== ticks) {
        ticks = W.stats.ticks;
        if (W.last.kkt) worst = Math.max(worst, W.last.kkt.worst);
        const M = R.muscles.M;
        for (let i = 0; i < M.n; i++) if (!(M.act[i] >= -1e-9 && M.act[i] <= 1 + 1e-9)) inside = false;
      }
      W.checkKKT = true;
    },
  });
  assert.ok(ticks > 50, `${ticks} plans`);
  assert.ok(worst < 1e-3, `KKT residual ${worst.toExponential(2)}`);
  assert.ok(inside);
});

test("stopping: the drive hands her back - the tripod soles and the package's muscle geometry for the other drives", () => {
  const o = onMuscles(0.6);
  assert.equal(o.R.footModel, "plantar");
  o.W.driving = false;
  o.R.forces(stubBike(), ground, dt);
  assert.equal(o.R.footModel, "tripod");
  assert.deepEqual(o.R.muscles.M.candidates, []);
  // (only the standing model's soles in her spheres)
  const soles = o.R.spheres.filter((s) => s.kind === "sole");
  assert.ok(soles.length > 0 && soles.every((s) => s.model === "tripod"));
});
