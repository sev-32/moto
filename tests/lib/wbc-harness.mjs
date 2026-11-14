// The whole-body muscle controller (src/core/46_rider_wbc.js) driving her on flat ground, for the tests
// (tests/rider_wbc*.test.mjs) and the lab tools: stand her on her own muscles - no motors, no pose
// servos, no balance assist - and run her for T s. Moved out of tests/rider_wbc.test.mjs unchanged.
import { character, surfaces, BIO, stubBike } from "./rider-harness.mjs";
await import("../../src/core/48_rider_onfoot.js");
await import("../../src/core/46_rider_wbc.js");
export const OF = globalThis.LUCID_RIDER_ONFOOT, WBC = globalThis.LUCID_RIDER_WBC;
export const dt = 1 / 540, DEG = Math.PI / 180;
export const ground = { height: () => 0, normal: () => [0, 0, 1], grip: () => 1 };

// stand her on her muscles for T s; each(t, R, W, o, G) observes after every step, push(t) adds a force
export function onMuscles(T, { push, each, params, fsm } = {}) {
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
