// Node harness for the physical rider: loads the character, the 916 rider surfaces and the rider
// core, and supplies a stub bike (kinematically driven rigid body with the V5 steering geometry).
import fs from "node:fs";
import path from "node:path";
export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
await import(path.join(ROOT, "src/core/44_lucid_character.js"));
await import(path.join(ROOT, "src/core/45_rider_multibody.js"));
await import(path.join(ROOT, "src/core/46_rider_muscles.js"));
// (the browser build inlines the muscle asset into the module; here it is read from the file)
globalThis.LUCID_MUSCLES.asset = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/character/lucid_muscles_r1_5.json"), "utf8"));
await import(path.join(ROOT, "src/core/46_rider_biomech.js"));
export const asset = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/character/lucid_female_v4_2.json"), "utf8"));
export const surfaces = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/bike/ducati916_rider_surfaces.json"), "utf8"));
export const character = globalThis.LUCID_CHARACTER.createLucidCharacter(asset);
export const BIO = globalThis.LUCID_RIDER_BIO;
export const MB = globalThis.LUCID_MULTIBODY;
// V5.6.7 steering geometry (free.geom at the static pose)
export const STEER = { pivot: [0, 0.4383675230799615, 0.2167447385344473], axis: [0, -0.4181755688684205, 0.9083662221822059] };
export function stubBike(opts = {}) {
  const bk = {
    p: opts.p || [0, 0, 0.64], R: opts.R || [1, 0, 0, 0, 1, 0, 0, 0, 1], v: [0, 0, 0], w: [0, 0, 0], a: [0, 0, 0],
    steer: 0, steerRate: 0, pivot: STEER.pivot, axis: STEER.axis,
    force: [0, 0, 0], moment: [0, 0, 0], steerTorque: 0,
  };
  return bk;
}
export const flatGround = { height: () => 0, normal: () => [0, 0, 1], grip: () => 1 };
// accumulate the rider's reactions on the bike (world force, moment about the bike origin, steer torque)
export function accumulate(bk, reactions) {
  const { cross, dot, mv } = MB.math;
  let F = [0, 0, 0], Mo = [0, 0, 0], st = 0;
  const aw = mv(bk.R, bk.axis), pw = [bk.p[0] + mv(bk.R, bk.pivot)[0], bk.p[1] + mv(bk.R, bk.pivot)[1], bk.p[2] + mv(bk.R, bk.pivot)[2]];
  for (const r of reactions) {
    if (r.F) {
      F = F.map((x, i) => x + r.F[i]);
      const m = cross([r.x[0] - bk.p[0], r.x[1] - bk.p[1], r.x[2] - bk.p[2]], r.F);
      Mo = Mo.map((x, i) => x + m[i]);
      if (r.part === "steer") st += dot(cross([r.x[0] - pw[0], r.x[1] - pw[1], r.x[2] - pw[2]], r.F), aw);
    }
    if (r.T) { Mo = Mo.map((x, i) => x + r.T[i]); if (r.part === "steer") st += dot(r.T, aw); }
  }
  return { F, M: Mo, steer: st };
}
// A stub bike free to roll about its tyre line (the y axis at the ground): its weight (211 kg, its
// centre of mass 0.52 m up - 46's holdBikeKg / holdBikeComH estimates - and 20 kg m^2 of roll
// inertia about it, declared), what her contacts do to it (the reactions R.forces returns), a
// little roll damping at the tyres, its side stand (it rests on it at standDeg, leaning left, and
// cannot lean further that way while it is down; on its side it lies at lieDeg), and the same
// declared residual as the browser while she holds it (48: G.hold, P.holdK / holdC /
// holdAssistMaxNm) - reported in st.res - and lift assist while she lifts it (st.lift).
export const BIKE = { kg: 211, comH: 0.52, IcomRoll: 20, rollC: 30 };
export function rollStub(bk, G, R, dt, st, reactions) {
  const { cross } = MB.math, g = 9.81, I = BIKE.IcomRoll + BIKE.kg * BIKE.comH * BIKE.comH;
  if (st.w == null) st.w = 0;
  let M = BIKE.kg * g * BIKE.comH * Math.sin(st.phi) - BIKE.rollC * st.w, her = 0;
  for (const r of reactions || []) {
    if (r.F) her += cross(r.x, r.F)[1]; // about the y axis through the origin (the tyre line): + rolls it to +x, its right
    if (r.T) her += r.T[1];
  }
  let res = 0;
  if (G?.hold?.active) {
    const P = G.P;
    res = Math.max(-P.holdAssistMaxNm, Math.min(P.holdAssistMaxNm, -(P.holdK * (st.phi - G.hold.target) + P.holdC * st.w)));
  }
  // (lifting it off its side: the declared lift assist, as the browser's - 48: G.lift, P.liftK /
  // liftC / liftMaxNm - reported in st.lift)
  let lift = 0;
  if (G?.lift?.active) {
    const P = G.P;
    lift = Math.max(-P.liftMaxNm, Math.min(P.liftMaxNm, -(P.liftK * (st.phi - G.lift.target) + P.liftC * st.w)));
  }
  st.lift = lift; st.liftSum = (st.liftSum || 0) + Math.abs(lift) * dt;
  st.her = her; st.res = res;
  st.resSum = (st.resSum || 0) + Math.abs(res) * dt; st.herSum = (st.herSum || 0) + her * dt; st.T = (st.T || 0) + (G?.hold?.active ? dt : 0);
  st.resMax = Math.max(st.resMax || 0, Math.abs(res));
  st.w += ((M + her + res + lift) / I) * dt;
  st.phi += st.w * dt;
  if (st.standDeg != null && st.phi < (st.standDeg * Math.PI) / 180) { st.phi = (st.standDeg * Math.PI) / 180; st.w = Math.max(0, st.w); }
  // (on its side it lies on its bars, pegs and bodywork: lieDeg over)
  const lie = ((st.lieDeg ?? 86) * Math.PI) / 180;
  if (Math.abs(st.phi) > lie) { st.phi = Math.sign(st.phi) * lie; st.w = 0; }
  const c = Math.cos(st.phi), s = Math.sin(st.phi), w = st.w;
  bk.R = [c, 0, s, 0, 1, 0, -s, 0, c]; bk.p = [0.65 * s, 0, 0.65 * c]; bk.w = [0, w, 0]; bk.v = [0.65 * c * w, 0, -0.65 * s * w];
}
// the stub bike held while she gets on / off (48: G.hold): its roll follows the lean she keeps it at
// (else its side stand's, or where it is), turning about its tyre line - the chassis's dynamics, her
// arm's push through the grip and the declared residual that hold the real one are not in the Node
// harness (her arm's push still loads her: it is in her hand's target)
export function holdStub(bk, G, R, dt, st) {
  const target = G.hold?.active ? G.hold.target : st.standDeg != null ? (st.standDeg * Math.PI) / 180 : st.phi;
  const phi0 = st.phi;
  st.phi += (target - st.phi) * Math.min(1, dt / 0.3);
  const c = Math.cos(st.phi), s = Math.sin(st.phi), w = (st.phi - phi0) / dt;
  bk.R = [c, 0, s, 0, 1, 0, -s, 0, c]; bk.p = [0.65 * s, 0, 0.65 * c]; bk.w = [0, w, 0]; bk.v = [0.65 * c * w, 0, -0.65 * s * w];
}
