// What every method adaptor needs from the physical rider (src/core/44-48): the loaded body, and the
// measurements the gate reads. The harness is the unit tests' (tests/lib), so the gym and the tests
// stand her up the same way.
import { character, surfaces, BIO, stubBike } from "../../tests/lib/rider-harness.mjs";
await import("../../src/core/48_rider_onfoot.js");
await import("../../src/core/46_rider_wbc.js");
export { character, surfaces, BIO, stubBike };
export const OF = globalThis.LUCID_RIDER_ONFOOT, WBC = globalThis.LUCID_RIDER_WBC;
export const DEG = Math.PI / 180;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export function newRider() {
  const R = BIO.createRider(character, surfaces), G = OF.install(R);
  return { R, G, b: R.body };
}
// angle of a link's up axis from the world's (deg)
export const tiltDeg = (b, li) => Math.acos(clamp(b.Rw[li][7], -1, 1)) / DEG;
// angle between two links' up axes (deg): the head against the thorax is R584's criterion
export const relDeg = (b, la, lb) => Math.acos(clamp(b.Rw[la][1] * b.Rw[lb][1] + b.Rw[la][4] * b.Rw[lb][4] + b.Rw[la][7] * b.Rw[lb][7], -1, 1)) / DEG;
// small random offsets of every joint angle: a start that is never exactly the nominal one
export function perturbJoints(b, rng, stdDeg = 0.3, maxDeg = 1) {
  for (let i = 0; i < b.q.length; i++) b.q[i] += clamp(rng.normal() * stdDeg, -maxDeg, maxDeg) * DEG;
}
// what the ground bears through anything but her soles and feet (N)
export function bodyContactN(R, footLinks) {
  let s = 0;
  for (const sp of R.spheres) if (sp.ground.on && sp.kind !== "sole" && !footLinks.has(sp.link)) s += Math.max(0, sp.ground.F[2]);
  return s;
}
export const comVel = (b) => { const t = b.totals(); return { com: t.com, v: [t.P[0] / t.mass, t.P[1] / t.mass, t.P[2] / t.mass] }; };
export const pelvisYaw = (b) => { const f = [-b.R[2], -b.R[5], -b.R[8]]; return Math.atan2(-f[0], f[1]); }; // pelvis forward is model -z
export function nonFinite(b) { return !b.q.every(Number.isFinite) || !Number.isFinite(b.p[2]); }
// which soles bear her weight (more than 5 N on any of the sole's contacts)
export function feetOn(R) {
  const on = { L: false, R: false };
  for (const sp of R.spheres) if (sp.kind === "sole" && sp.ground.on && sp.ground.F[2] > 5) on[sp.side] = true;
  return on;
}
