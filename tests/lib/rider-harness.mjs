// Node harness for the physical rider: loads the character, the 916 rider surfaces and the rider
// core, and supplies a stub bike (kinematically driven rigid body with the V5 steering geometry).
import fs from "node:fs";
import path from "node:path";
export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
await import(path.join(ROOT, "src/core/44_lucid_character.js"));
await import(path.join(ROOT, "src/core/45_rider_multibody.js"));
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
