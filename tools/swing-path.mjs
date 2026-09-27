#!/usr/bin/env node
// The leg-overs - getting on and off the 916 from its left - checked, or searched for again.
// Both are data in the motion code (src/core/48_rider_onfoot.js: G.swingPaths): the pelvis, the
// swung right leg's knee and foot and the chest at each key, the pose each starts from and where it
// ends, in the bike frame at the ground (+x its right, +y forward, sheared with its lean as the
// motion places them). This tool reads that data, so what it checks is what the game runs.
//
//   node tools/swing-path.mjs check  mount|dismount [--roll deg] [--steps n] [--verbose]
//   node tools/swing-path.mjs search mount|dismount [--seed n] [--iters n] [--roll deg]
//
// Along the path (each key reached from the last with the motion's smoothstep, `steps` poses per
// key, each IK warm-started from the last), the leg as the motion solves it - hip only: the knee
// folded to kneeDeg, the ankle near neutral, the hip's three joints taking the knee to its target
// and the foot towards its own - against the rider's own collision spheres and the 916's envelope:
//   clearance  the swung leg's knee, calf and foot spheres (and, apart, the thigh's) to the envelope
//   reach      how far the knee misses its target; hip joints within 3 deg of a limit
//   standing   the left leg from the same pelvis to its foot on the ground: its reach, its hip's range
//   balance    (mount) her centre of mass over the standing foot - allowed 5 cm either way of a
//              point 5 cm towards the bike from the foot's middle, where she leans on the bars
//   grip       (mount) her left hand on its grip with the chest and arms as the motion holds them
// `search` hill-climbs the keys (their pelvis, pitch, roll, knee, knee angle, chest and foot) on
// those, inside declared bounds, and prints the best as data lines for 48. Kinematic: no forces, no
// dynamics - the game's run (tests/rider_onfoot.test.mjs, tests/browser) says whether she makes it.
import { character, surfaces, BIO, stubBike } from "../tests/lib/rider-harness.mjs";
await import("../src/core/48_rider_onfoot.js");

const args = process.argv.slice(2);
const cmd = args[0], which = args[1];
const opt = (name, dflt) => { const i = args.indexOf("--" + name); return i < 0 ? dflt : args[i + 1] === undefined || args[i + 1].startsWith("--") ? true : args[i + 1]; };
if (!["check", "search"].includes(cmd) || !["mount", "dismount"].includes(which)) {
  console.error("usage: node tools/swing-path.mjs check|search mount|dismount [--roll deg] [--steps n] [--verbose] [--seed n] [--iters n]");
  process.exit(2);
}
const R = BIO.createRider(character, surfaces), G = globalThis.LUCID_RIDER_ONFOOT.install(R), h = R.helpers, I = R.internal, ikb = I.ikb, H = I.H;
G.placeStanding([0, 0, 0], 0);
const path0 = G.swingPaths[which];
const DEG = Math.PI / 180, A = [1, 0, 0, 0, 0, -1, 0, 1, 0];
const STEPS = +opt("steps", 7), ROLL = +opt("roll", path0.bikeRollDeg);
// search bounds (declared): where the pelvis may go - getting on it stays off the seat, beside the
// bike; getting off its seat stays on the seat's edge, over the bike on its stand
const BOUNDS = {
  mount: { x: [-0.44, -0.2], y: [-0.26, -0.05], z: [0.84, 0.97] },
  dismount: { x: [-0.24, -0.08], y: [-0.36, -0.05], z: [0.84, 0.92] },
}[which];

// the bike leaning ROLL deg (+ to its right) about its tyre line, as the stub bikes of the Node
// harness stand it (its origin 0.65 m up its own up axis); targets are sheared with the lean as the
// motion's bike frame shears them (48: bikeFrame)
const bk = stubBike();
{
  const c = Math.cos(ROLL * DEG), s = Math.sin(ROLL * DEG);
  bk.R = [c, 0, s, 0, 1, 0, -s, 0, c]; bk.p = [0.65 * s, 0, 0.65 * c];
}
const SH = Math.abs(ROLL) < 30 ? Math.tan(ROLL * DEG) : 0;
const W = (v) => [v[0] + v[2] * SH, v[1], v[2]];
// the motion's pelvis and chest orientations (48: pelvisB, chestR): roll about y after yaw after pitch
const pelvisR = (pitch, roll, yaw = 0) => h.mm(h.expRV([0, roll * DEG, 0]), h.mm(h.Rz(yaw * DEG), h.mm(h.Rx(-pitch * DEG), A)));
const chestR = (pitch, twist) => h.mm(h.Rz(twist * DEG), h.mm(h.Rx(-pitch * DEG), A));
const legR = R.chains.legR, legL = R.chains.legL, hipR = legR.filter((i) => /Hip\./.test(H[i].id));
const kneeR = H[I.hingeIndex["rightKnee.flexionExtension"]].link, kneeL = H[I.hingeIndex["leftKnee.flexionExtension"]].link;
const swungSph = R.spheres.filter((s) => ["R_Thigh", "R_Calf", "R_Foot"].includes(s.seg));
const isThigh = (s) => s.seg === "R_Thigh" && !s.at;
const nearLimit = (i, deg) => { const hh = H[i], q = ikb.q[hh.link]; return Math.min(q - hh.lo, hh.hi - q) < deg * DEG; };
const TANK = [-0.04, 0, 0.99];

// one pose of the path
function pose(k, warm, stance) {
  ikb.q.set(warm || R.body.q);
  ikb.p = W(k.pelvis); ikb.R = pelvisR(k.pitch, k.roll);
  ikb.q[kneeR] = k.kneeDeg * DEG;
  for (const i of legR) if (!/Hip\./.test(H[i].id) && H[i].link !== kneeR) ikb.q[H[i].link] = /dorsiPlantar/.test(H[i].id) ? -10 * DEG : 0;
  ikb.kinematics();
  const knee = W(k.knee), foot = W(h.add(k.knee, k.footOff));
  const tasks = [{ type: "pos", link: R.model.linkOf.R_Calf, local: [0, 0, 0], target: knee, w: 100 }, { type: "pos", link: R.foot.R.link, local: R.foot.R.ball, target: foot, w: 2 }];
  for (let it = 0; it < 3; it++) I.ikSolve(ikb, tasks, hipR, {}, 6);
  const out = { err: h.len(h.sub(ikb.toWorld(R.model.linkOf.R_Calf, [0, 0, 0]), knee)), low: 9, lowAt: "", thigh: 9, hipLim: hipR.filter((i) => nearLimit(i, 3)).length };
  for (const s of swungSph) {
    const d = I.SURF.sdf(I.toBikeFrame(bk, ikb.toWorld(s.link, s.c))) - s.r;
    if (isThigh(s)) out.thigh = Math.min(out.thigh, d);
    else if (d < out.low) { out.low = d; out.lowAt = s.seg + (s.at ? ":" + s.at : ""); }
  }
  if (stance) {
    // the standing leg from the same pelvis to its foot, flat on the ground
    if (ikb.q[kneeL] < 0.15) ikb.q[kneeL] = 0.15;
    for (let it = 0; it < 3; it++) I.ikSolve(ikb, [{ type: "pos", link: R.foot.L.link, local: R.foot.L.ball, target: stance, w: 100 }, { type: "dir", link: R.foot.L.link, local: [0, 1, 0], target: [0, 0, 1], w: 1 }], legL, {}, 6);
    out.stErr = h.len(h.sub(ikb.toWorld(R.foot.L.link, R.foot.L.ball), stance));
    out.stLim = legL.filter((i) => /Hip\./.test(H[i].id) && nearLimit(i, 2)).length;
    // the trunk and arms as the motion holds them: the chest pitched and twisted, the left hand on
    // its grip, the right on the tank
    for (const i of R.chains.armL.concat(R.chains.armR)) { const hh = H[i]; ikb.q[hh.link] = Math.min(hh.hi, Math.max(hh.lo, ikb.q[hh.link])); }
    ikb.kinematics();
    I.ikSolve(ikb, [{ type: "rot", link: R.model.linkOf.Spine02, target: chestR(k.chest, k.twist), w: 1 }], R.chains.spine, {}, 6);
    const gL = R.gripWorld(bk, "L").c;
    I.ikSolve(ikb, [{ type: "pos", link: R.hand.L.link, local: R.hand.L.p, target: gL, w: 100 }], R.chains.armL, {}, 8);
    I.ikSolve(ikb, [{ type: "pos", link: R.hand.R.link, local: R.hand.R.p, target: W(TANK), w: 100 }], R.chains.armR, {}, 8);
    out.gripErr = h.len(h.sub(ikb.toWorld(R.hand.L.link, R.hand.L.p), gL));
    const com = I.comOf(ikb), fm = h.scl(h.add(ikb.toWorld(R.foot.L.link, R.foot.L.ball), ikb.toWorld(R.foot.L.link, R.foot.L.heel)), 0.5);
    out.comOff = Math.max(Math.abs(com[0] - (fm[0] + 0.05)) - 0.05, Math.abs(com[1] - fm[1]) - 0.05);
  }
  out.q = Float64Array.from(ikb.q);
  return out;
}
const lerpA = (a, c, s) => a.map((x, i) => x + (c[i] - x) * s);
const lerpN = (a, c, s) => a + (c - a) * s;
const between = (a, c, s) => ({ pelvis: lerpA(a.pelvis, c.pelvis, s), pitch: lerpN(a.pitch, c.pitch, s), roll: lerpN(a.roll, c.roll, s), chest: lerpN(a.chest, c.chest, s), twist: lerpN(a.twist, c.twist, s), knee: lerpA(a.knee, c.knee, s), kneeDeg: lerpN(a.kneeDeg, c.kneeDeg, s), footOff: lerpA(a.footOff, c.footOff, s) });
// the whole path, worst of each measure
function evaluate(keys, verbose = false) {
  const stance = path0.stance, all = [...keys, path0.final];
  const r = { low: 9, lowAt: "", thigh: 9, err: 0, hipLim: 0, stErr: 0, stLim: 0, comOff: -9, gripErr: 0 };
  let prev = path0.start, warm = null;
  all.forEach((k, ki) => {
    const fin = ki === all.length - 1;
    for (let st = 1; st <= STEPS; st++) {
      const s = st / STEPS, sm = s * s * (3 - 2 * s);
      const o = pose(between(prev, k, sm), warm, fin ? null : stance);
      warm = o.q;
      if (o.low < r.low) { r.low = o.low; r.lowAt = `${o.lowAt} (key ${ki + 1}${fin ? " final" : ""}, step ${st})`; }
      r.thigh = Math.min(r.thigh, o.thigh); r.hipLim += o.hipLim ? 1 : 0;
      if (!fin) {
        r.err = Math.max(r.err, o.err); r.stErr = Math.max(r.stErr, o.stErr); r.stLim += o.stLim;
        r.comOff = Math.max(r.comOff, o.comOff); r.gripErr = Math.max(r.gripErr, o.gripErr);
      }
      if (verbose) console.log(`  key ${ki + 1}${fin ? "f" : " "} step ${st}: clear knee/calf/foot ${cm(o.low)} (${o.lowAt}) thigh ${cm(o.thigh)} | knee off ${cm(o.err)} hip-limit ${o.hipLim}` + (fin ? "" : ` | standing ${cm(o.stErr)} lim ${o.stLim} | com ${cm(o.comOff)} grip ${cm(o.gripErr)}`));
    }
    prev = k;
  });
  return r;
}
const cm = (x) => `${(100 * x).toFixed(1)} cm`;
// the search's score: clearance of the knee, calf and foot up to 3 cm, then penalties (declared
// weights): the thigh into the envelope (getting on only - getting off, the thigh slides off the
// seat), the knee missing its target past 3 cm, the standing foot past 2 cm, hip joints at a limit,
// her weight off her standing foot and her hand off its grip (getting on, where they hold the bike)
const score = (r) => Math.min(r.low, 0.03) + (path0.balance ? 0.3 * Math.min(r.thigh, 0) : 0) - 3 * Math.max(0, r.err - 0.03) - 0.001 * r.hipLim - 2 * Math.max(0, r.stErr - 0.02) - 0.002 * r.stLim - (path0.balance ? Math.max(0, r.comOff) : 0) - (path0.grip ? Math.max(0, r.gripErr - 0.03) : 0);
function report(r) {
  console.log(`${which}: ${path0.keys.length} keys and the last, ${STEPS} poses each, the bike leaning ${ROLL} deg`);
  console.log(`  clearance to the envelope: knee, calf and foot ${cm(r.low)} at worst - ${r.lowAt}; the thigh ${cm(r.thigh)}`);
  console.log(`  the knee off its target ${cm(r.err)} at worst; poses with a hip joint within 3 deg of its limit: ${r.hipLim}`);
  console.log(`  the standing leg: its foot off its spot ${cm(r.stErr)} at worst; hip joints within 2 deg of a limit (pose-joints): ${r.stLim}`);
  if (path0.balance) console.log(`  balance: her centre of mass past its allowance over the standing foot by ${cm(r.comOff)} at worst (<= 0: inside)`);
  if (path0.grip) console.log(`  grip: her left hand off its grip by ${cm(r.gripErr)} at worst`);
  console.log(`  score ${score(r).toFixed(4)}`);
}

if (cmd === "check") {
  report(evaluate(path0.keys, !!opt("verbose", false)));
} else {
  let seed = +opt("seed", 1) >>> 0;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const gauss = () => { let s = 0; for (let i = 0; i < 6; i++) s += rnd(); return s - 3; };
  const cl = (x, [lo, hi]) => Math.min(hi, Math.max(lo, x));
  let keys = path0.keys.map((k) => ({ ...k })), cur = evaluate(keys), sc = score(cur);
  report(cur);
  const N = +opt("iters", 300);
  for (let it = 0; it < N; it++) {
    const cand = keys.map((k) => ({ ...k, pelvis: k.pelvis.slice(), knee: k.knee.slice(), footOff: k.footOff.slice() }));
    const k = cand[Math.floor(rnd() * cand.length)], a = 0.03;
    k.pelvis = [cl(k.pelvis[0] + gauss() * a, BOUNDS.x), cl(k.pelvis[1] + gauss() * a, BOUNDS.y), cl(k.pelvis[2] + gauss() * a * 0.5, BOUNDS.z)];
    k.pitch = cl(k.pitch + gauss() * 6, [20, 75]); k.roll = cl(k.roll + gauss() * 6, [-48, 0]);
    k.knee = k.knee.map((x) => x + gauss() * a); k.kneeDeg = cl(k.kneeDeg + gauss() * 8, [30, 110]);
    k.chest = cl(k.chest + gauss() * 5, [10, 70]); k.footOff = k.footOff.map((x) => x + gauss() * 0.04);
    const r = evaluate(cand), s = score(r);
    if (s > sc) { keys = cand; cur = r; sc = s; console.log(`  it ${it}: score ${s.toFixed(4)}, knee/calf/foot ${cm(r.low)}, thigh ${cm(r.thigh)}, knee off ${cm(r.err)}`); }
  }
  report(cur);
  const f = (v) => `[${v.map((x) => +x.toFixed(3)).join(", ")}]`;
  console.log("keys (48_rider_onfoot.js, G.swingPaths." + which + ".keys):");
  for (const k of keys) {
    const extra = (k.must ? ", must: true" : "") + (k.reachM ? `, reachM: ${k.reachM}` : "");
    console.log(`  { T: ${k.T}, pelvis: ${f(k.pelvis)}, pitch: ${Math.round(k.pitch)}, roll: ${Math.round(k.roll)}, chest: ${Math.round(k.chest)}, twist: ${k.twist}, knee: ${f(k.knee)}, kneeDeg: ${Math.round(k.kneeDeg)}, footOff: ${f(k.footOff)}${extra} },`);
  }
}
