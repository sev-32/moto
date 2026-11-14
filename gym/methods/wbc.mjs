// Method "wbc": her muscles alone - the whole-body muscle controller (src/core/46_rider_wbc.js, R1.5
// lucid_bcr.neuro, ported). No joint motors, no pose servos, no balance assist.
import { newRider, stubBike, WBC, perturbJoints, tiltDeg, relDeg, bodyContactN, comVel, nonFinite, feetOn } from "../core/body.mjs";

export default {
  id: "wbc",
  title: "Muscles: whole-body QP (46_rider_wbc)",
  drive: "muscles",
  assists: "none",
  supports: ["stand", "hold", "step", "walkTo"],
  create({ world, rng, mods = {} }) {
    const { R, G, b } = newRider(), bk = stubBike();
    bk.p = [500, 500, 0.64]; // (far away on the ground: no contact, and nothing for her gaze to look up at)
    G.placeStanding([0, 0, 0], 0);
    const W = WBC.create(R, { params: mods.params });
    W.setPosture(b.q, 0);
    R.modes.foot = () => { G.com = b.totals().com; }; // (48's own foot mode plans nothing: the controller holds her)
    W.reset(); W.driving = true; W.fsmOn = true;
    perturbJoints(b, rng, mods.jointStdDeg ?? 0.3, 1); // (after the posture reference is taken: she starts a little off it)
    const L = R.model.linkOf, feet = new Set([R.foot.L.link, R.foot.R.link]);
    const M = R.muscles?.M;
    let a2 = 0, a2n = 0;
    return {
      command(c) {
        if (c.cmd === "stand") return;
        if (c.cmd === "hold") W.requestSingleLeg(c.foot);
        else if (c.cmd === "step") W.requestStep(c.foot, [c.across || 0, c.along || 0]);
        else if (c.cmd === "walkTo") { const step = c.stepLen || 0.25; W.requestWalk({ n: Math.max(1, Math.round(c.along / step)), step: [step, 0] }); }
        else throw new Error(`wbc: no command ${c.cmd}`);
      },
      // pushes: [{ part, F:[x,y,z] }] in newtons, at the centre of the named link
      step(dt, pushes) {
        R.forces(bk, world.ground, dt);
        if (pushes) for (const p of pushes) { const li = L[p.part]; b.applyForce(li, p.F, b.toWorld(li, b.links[li].com)); }
        R.integrate(dt);
        if (M && !nonFinite(b)) { let s = 0; for (const a of M.act) s += a * a; a2 += s / M.n; a2n++; }
      },
      observe() {
        const cv = comVel(b), fin = !nonFinite(b);
        return {
          finite: fin, pelvisZ: b.p[2], headDeg: fin ? tiltDeg(b, L.Head) : null, headRelDeg: fin ? relDeg(b, L.Head, L.Spine02) : null,
          bodyN: fin ? bodyContactN(R, feet) : 0, feetOn: fin ? feetOn(R) : { L: false, R: false }, support: ({ double: "double", hold: "single" })[W.fsm.state] || "moving",
          com: cv.com, comV: cv.v, pelvis: b.p.slice(), foot: { L: b.ow[R.foot.L.link].slice(), R: b.ow[R.foot.R.link].slice() },
        };
      },
      metrics() {
        const swings = W.fsm.log.filter((e) => e[2] === "swing" || e[2] === "wss").length;
        return { steps: swings, effort: a2n ? a2 / a2n : null, assists: { declared: "none", used: 0 }, fsm: W.fsm.log.map((e) => `${e[0]}:${e[2]}`).join(">") };
      },
    };
  },
};
