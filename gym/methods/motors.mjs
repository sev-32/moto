// Method "motors": the joint-motor controller (src/core/48_rider_onfoot.js) with its declared assists
// (a pelvis balance torque, a capture-point catch, a get-up assist). What the game walks her with today.
import { newRider, stubBike, perturbJoints, tiltDeg, relDeg, bodyContactN, comVel, nonFinite, feetOn, pelvisYaw, DEG } from "../core/body.mjs";

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export default {
  id: "motors",
  title: "Joint motors + declared assists (48_rider_onfoot)",
  drive: "motors",
  assists: "pelvis balance torque, capture-point catch, get-up force",
  supports: ["stand", "walkTo", "turn", "ragdoll"],
  create({ world, rng, mods = {} }) {
    const { R, G, b } = newRider(), bk = stubBike();
    bk.p = [500, 500, 0.64]; bk.slip = { rearDeg: 0, frontDeg: 0 }; // (the bike far away: no contact)
    G.placeStanding([0, 0, 0], 0);
    perturbJoints(b, rng, mods.jointStdDeg ?? 0.3, 1);
    const L = R.model.linkOf, feet = new Set([R.foot.L.link, R.foot.R.link]);
    let turning = null, t = 0, assistSq = 0, assistN = 0, arrived = null;
    return {
      command(c) {
        if (c.cmd === "stand") G.setIntent([0, 0]);
        else if (c.cmd === "walkTo") G.goTo([0, c.along, 0], 0, () => { arrived = t; }, null, 0.15, 14);
        else if (c.cmd === "turn") turning = { target: c.deg * DEG, rate: c.rate || 1.0 };
        else if (c.cmd === "ragdoll") G.toRagdoll("gym");
        else throw new Error(`motors: no command ${c.cmd}`);
      },
      step(dt, pushes) {
        t += dt;
        if (turning) G.heading = wrap(G.heading + Math.max(-turning.rate * dt, Math.min(turning.rate * dt, wrap(turning.target - G.heading))));
        R.forces(bk, world.ground, dt);
        if (pushes) for (const p of pushes) { const li = L[p.part]; b.applyForce(li, p.F, b.toWorld(li, b.links[li].com)); }
        R.integrate(dt);
        if (R.plan.mode === "foot" && t > 0.5) { assistSq += (G.stats.assistNm || 0) ** 2; assistN++; }
      },
      observe() {
        const cv = comVel(b), fin = !nonFinite(b);
        return {
          finite: fin, pelvisZ: b.p[2], headDeg: fin ? tiltDeg(b, L.Head) : null, headRelDeg: fin ? relDeg(b, L.Head, L.Spine02) : null,
          bodyN: fin ? bodyContactN(R, feet) : 0, feetOn: fin ? feetOn(R) : { L: false, R: false }, mode: R.plan.mode, support: R.plan.mode === "foot" ? (G.phase === "double" ? "double" : "moving") : "down",
          com: cv.com, comV: cv.v, pelvis: b.p.slice(), foot: { L: b.ow[R.foot.L.link].slice(), R: b.ow[R.foot.R.link].slice() }, yaw: pelvisYaw(b), arrived,
        };
      },
      metrics() {
        return { steps: G.stats.steps || 0, effort: null, assists: { declared: "pelvis balance torque, catch, get-up", balanceRmsNm: assistN ? Math.sqrt(assistSq / assistN) : 0, catchN: G.stats.catchN || 0, getUpN: G.stats.getUpN || 0 } };
      },
    };
  },
};
