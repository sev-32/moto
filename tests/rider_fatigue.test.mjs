// Her fatigue (PRIORS.fatigue, 46_rider_biomech.js): a three-compartment pool of motor units per
// muscle and per hand's grip (3CC-r). The model checks are exact consequences of its equations (the
// endurance time of a sustained load, recovery at rest); the ride is a steady 0.8 g turn held for a
// long time (fatigue time run 300x: 4 s is 20 minutes) - bands are sanity bounds, not measurements.
import test from "node:test";
import assert from "node:assert/strict";
import { character, surfaces, BIO, stubBike } from "./lib/rider-harness.mjs";
const dt = 1 / 540, P = BIO.PRIORS.fatigue;

// a pool held at load TL until it can no longer make it (its unfatigued share under TL)
function endurance(F, TL, h = 0.01) {
  const s = { MA: 0, MF: 0, MR: 1 };
  for (let t = 0; t < 3600; t += h) {
    BIO.fatigueStep(s, TL, F, P.R, 15, h, P);
    if (1 - s.MF < TL) return t;
  }
  return Infinity;
}

test("3CC-r: held at half its strength a pool fails when its fatigued share reaches the other half - the shoulder's pool long before the ankle's", () => {
  // (the active share settles on the load in a fraction of a second; then dMF/dt = F TL - R MF, and
  // it fails at MF = 1 - TL: t = -ln(1 - R (1 - TL) / (F TL)) / R)
  const TL = 0.5, analytic = (F) => -Math.log(1 - (P.R * (1 - TL)) / (F * TL)) / P.R;
  const sh = endurance(P.F.shoulder, TL), an = endurance(P.F.ankle, TL);
  assert.ok(Math.abs(sh / analytic(P.F.shoulder) - 1) < 0.03, `shoulder ${sh.toFixed(1)} s vs ${analytic(P.F.shoulder).toFixed(1)} s`);
  assert.ok(Math.abs(an / analytic(P.F.ankle) - 1) < 0.03, `ankle ${an.toFixed(1)} s vs ${analytic(P.F.ankle).toFixed(1)} s`);
  assert.ok(sh < an / 2, `shoulder ${sh.toFixed(0)} s, ankle ${an.toFixed(0)} s`);
});

test("3CC-r: at rest the fatigued units recover r times faster than while it works", () => {
  const tired = () => { const s = { MA: 0, MF: 0, MR: 1 }; for (let t = 0; t < 60; t += 0.01) BIO.fatigueStep(s, 0.6, P.F.other, P.R, 15, 0.01, P); return s; };
  const rest = tired(), work = tired(), MF0 = rest.MF;
  // (a minute at rest, against a minute holding a light 10 % - past restA, so no rest multiplier)
  for (let t = 0; t < 60; t += 0.01) { BIO.fatigueStep(rest, 0, P.F.other, P.R, 15, 0.01, P); BIO.fatigueStep(work, 0.1, P.F.other, P.R, 15, 0.01, P); }
  assert.ok(MF0 > 0.2, `fatigued ${MF0.toFixed(3)}`);
  assert.ok(Math.abs(rest.MF / MF0 - Math.exp(-15 * P.R * 60)) < 0.02, `rest: ${(rest.MF / MF0).toFixed(3)} of it left, e^-rRt ${Math.exp(-15 * P.R * 60).toFixed(3)}`);
  assert.ok(work.MF > 0.9 * MF0, `working lightly: ${(work.MF / MF0).toFixed(3)} of it left`);
});

// a steady 0.8 g left turn at 15 m/s on the stub (as rider_biomech's), fatigue time x timeScale
function turn(timeScale, T) {
  const R = BIO.createRider(character, surfaces), h = R.helpers, bk = stubBike(), b = R.body;
  const save = { ...R.priors.fatigue };
  R.priors.fatigue.timeScale = timeScale;
  try {
    const g = 0.8, V = 15, rad = (V * V) / (g * 9.81), w = V / rad, ph = Math.atan(g);
    const Rz = (a) => [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1];
    const Ry = (a) => [Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)];
    const pose = (t) => { const th = w * t, Rw = h.mm(Rz(th), Ry(-ph)), r0 = h.mv(Rz(th), [rad, 0, 0]), up = h.mv(Rw, [0, 0, 0.64]); return { p: [-rad + r0[0] + up[0], r0[1] + up[1], r0[2] + up[2]], R: Rw }; };
    const set = (t) => { const a = pose(t), c = pose(t + dt); bk.p = a.p; bk.R = a.R; bk.v = h.scl(h.sub(c.p, a.p), 1 / dt); bk.w = h.scl(h.logSO3(h.mm(c.R, h.mt(a.R))), 1 / dt); };
    const S = BIO.presettle(R);
    set(0);
    b.p = h.add(bk.p, h.mv(bk.R, S.rel.p)); b.R = h.mm(bk.R, S.rel.R); b.q.set(S.rel.q); R.qT.set(S.rel.qT); b.kinematics(); R.matchVelocity(bk);
    let over = 0;
    for (let t = 0; t <= T; t += dt) {
      set(t);
      R.forces(bk, null, dt);
      // (no muscle more active than its unfatigued units allow - the cap as it stood this step)
      const M = R.muscles.M, c = R.fatigue.cap;
      for (let i = 0; i < M.n; i++) over = Math.max(over, M.act[i] - c[i]);
      R.integrate(dt);
      if (!b.q.every(Number.isFinite)) return { R, finite: false };
    }
    return { R, finite: true, over, pel: h.mtv(bk.R, h.sub(b.p, bk.p)), fat: R.telemetry.fatigue };
  } finally {
    Object.assign(R.priors.fatigue, save);
  }
}

test("riding a 0.8 g turn for 20 minutes (fatigue time x300): her working muscles tire, none is asked past what it has left, she stays on", () => {
  const fresh = turn(1, 1), tired = turn(300, 4);
  assert.ok(fresh.finite && tired.finite);
  // (a second of it at real time costs her working muscles little)
  assert.ok(fresh.fat.weakest[1] > 0.95, `after 1 s: ${JSON.stringify(fresh.fat)}`);
  // (twenty minutes of it: the regions that hold her in the turn have lost much of their strength)
  const reg = tired.fat.regions;
  assert.ok(reg.neck < 0.7 && reg.trunk < 0.8 && reg.legs < 0.9, `after 20 min: ${JSON.stringify(tired.fat)}`);
  assert.ok(tired.over < 0.01, `activation past its cap by ${tired.over.toFixed(4)}`);
  // (still seated: pelvis in the seat pocket)
  const [x, y, z] = tired.pel;
  assert.ok(Math.abs(x) < 0.05 && y > -0.36 && y < -0.24 && z > 0.2 && z < 0.3, `pelvis ${tired.pel.map((v) => v.toFixed(3))}`);
  // (placed afresh she is rested)
  tired.R.fatigue.reset();
  assert.ok(tired.R.fatigue.cap.every((c) => c === 1) && tired.R.gripStrength("L") === BIO.PRIORS.gripStrengthN);
});
