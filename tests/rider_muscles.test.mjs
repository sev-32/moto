// The rider's muscles (src/core/46_rider_muscles.js) against the R1.5 package: the 84 proxy paths,
// their lengths and moment arms on her skeleton at lawful poses (lucid_bcr.muscles), and MuJoCo's
// muscle functions (tests/fixtures/lucid_muscle_parity.json, tools/character/extract_muscles.py).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, character, BIO, MB } from "./lib/rider-harness.mjs";

await import(path.join(ROOT, "src/core/46_rider_muscles.js"));
const MU = globalThis.LUCID_MUSCLES;
const asset = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/character/lucid_muscles_r1_5.json"), "utf8"));
const fx = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/lucid_muscle_parity.json"), "utf8"));
const DEG = Math.PI / 180;

function setup() {
  const model = BIO.buildModel(character);
  const body = MB.createArticulatedBody(model.spec);
  const M = MU.createMuscles(asset, model, body);
  const linkOfDof = Object.fromEntries(model.hinges.map((h) => [h.id, h.link]));
  const pose = (cmds) => {
    body.p = fx.restRootPosition.slice(); body.R = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    body.q.fill(0); body.qd.fill(0);
    for (const [id, deg] of Object.entries(cmds)) body.q[linkOfDof[id]] = deg * DEG;
    body.kinematics();
    M.update();
  };
  return { model, body, M, linkOfDof, pose };
}

test("the R1.5 muscles (84) with the triceps as the candidate split (88): every carrier a joint of her body", () => {
  const { M } = setup();
  assert.equal(M.n, 88);
  assert.deepEqual(M.ids, fx.ids);
  assert.equal(fx.r15Ids.length, 84);
  const cand = M.ids.filter((id) => !fx.r15Ids.includes(id));
  assert.deepEqual(cand.sort(), ["left_triceps_lateral", "left_triceps_long", "left_triceps_medial", "right_triceps_lateral", "right_triceps_long", "right_triceps_medial"]);
  for (const mu of asset.muscles) assert.equal(mu.status === "R1.5", fx.r15Ids.includes(mu.id), mu.id);
  assert.equal(fx.hinges.length, 46);
});

test("paths, lengths and moment arms match the package's proxies (MuscleSystem on her mesh) at lawful poses", () => {
  const { M, pose, linkOfDof } = setup();
  let worstP = 0, worstL = 0, worstR = 0, pairs = 0, worstMj = 0;
  for (const p of fx.poses) {
    pose(p.commands);
    for (let i = 0; i < M.n; i++) {
      const P = M.muscles[i].P, ref = p.points[i];
      for (let k = 0; k < ref.length; k++) worstP = Math.max(worstP, Math.abs(P[k] - ref[k]));
      worstL = Math.max(worstL, Math.abs(M.len[i] - p.lengths[i]));
      // every hinge the package says the path spans, and no other
      const mine = new Map(M.muscles[i].span.map((s, k) => [s.h, M.muscles[i].r[k]]));
      for (const [hid, [rp, rmj]] of Object.entries(p.hingeMomentArms[M.ids[i]])) {
        const r = mine.get(linkOfDof[hid]) ?? 0;
        worstR = Math.max(worstR, Math.abs(r - rp));
        if (rmj != null) worstMj = Math.max(worstMj, Math.abs(r - rmj));
        pairs++;
      }
      for (const [h, r] of mine) {
        const hid = Object.keys(linkOfDof).find((k) => linkOfDof[k] === h);
        if (!(hid in p.hingeMomentArms[M.ids[i]])) assert.ok(Math.abs(r) < 1e-9, `${M.ids[i]} spans ${hid} (${r}) where the package has no arm`);
      }
    }
  }
  console.log(`   ${fx.poses.length} poses, ${pairs} muscle-hinge pairs: points ${(worstP * 1e3).toExponential(2)} mm, lengths ${(worstL * 1e3).toExponential(2)} mm, arms ${(worstR * 1e3).toExponential(2)} mm off the package's proxies (MuJoCo body: up to ${(worstMj * 100).toFixed(2)} cm, its wraps)`);
  assert.ok(worstP < 1e-9, `points ${worstP}`);
  assert.ok(worstL < 1e-9, `lengths ${worstL}`);
  assert.ok(worstR < 1e-9, `moment arms ${worstR}`);
});

test("moment arms are -dL/dq of the paths (finite differences, hinges without follow points)", () => {
  const { M, body, pose, model } = setup();
  const p = fx.poses[3];
  pose(p.commands);
  const L0 = Float64Array.from(M.len), arms = M.muscles.map((m) => new Map(m.span.map((s, k) => [s.h, m.r[k]])));
  let worst = 0;
  for (const h of model.hinges) {
    const e = 1e-6;
    body.q[h.link] += e; body.kinematics(); M.update();
    for (let i = 0; i < M.n; i++) {
      const hasFollow = M.muscles[i].pts.some((pt) => pt.follow && model.links[h.link].joint === pt.joint);
      if (hasFollow) continue; // the package's follow rule is a first-order weight, not a derivative
      const fd = -(M.len[i] - L0[i]) / e, r = arms[i].get(h.link) ?? 0;
      worst = Math.max(worst, Math.abs(fd - r));
    }
    body.q[h.link] -= e;
  }
  assert.ok(worst < 1e-6, `worst |r + dL/dq| ${worst}`);
});

test("MuJoCo's muscle gain, passive force and activation dynamics", () => {
  let worst = 0;
  for (const m of fx.flv) {
    const mu = asset.muscles.find((x) => x.id === m.id);
    for (const [L, V, gain, bias] of m.rows) {
      // (MuJoCo's signs: tension negative)
      worst = Math.max(worst, Math.abs(MU.muscleGain(L, V, mu.lengthRange, m.gainprm) + gain) / mu.fmax);
      worst = Math.max(worst, Math.abs(MU.muscleBias(L, mu.lengthRange, m.gainprm) + bias) / mu.fmax);
    }
  }
  assert.ok(worst < 1e-10, `gain/bias ${worst}`); // (inputs stored to 13 significant digits)
  let wd = 0;
  for (const [u, a, adot] of fx.activationDynamics) wd = Math.max(wd, Math.abs(MU.muscleDynamics(u, a) - adot));
  assert.ok(wd < 1e-9, `activation dynamics ${wd}`);
});

test("rest pose: every fibre at its optimal length (normalised length 1)", () => {
  const { M, pose } = setup();
  pose({});
  for (let i = 0; i < M.n; i++) {
    const m = M.muscles[i], L0 = (m.lr[1] - m.lr[0]) / (m.prm[1] - m.prm[0]), Ln = m.prm[0] + (M.len[i] - m.lr[0]) / L0;
    assert.ok(Math.abs(Ln - 1) < 1e-9, `${m.id} ${Ln}`);
    assert.ok(Math.abs(M.gain[i] - m.prm[2]) < 1e-6 * m.prm[2], `${m.id} gain ${M.gain[i]}`);
  }
});

test("activation: the excitation planned for a reachable activation reaches it in one step", () => {
  const { M, pose } = setup();
  pose(fx.poses[2].commands);
  const dt = 1 / 540;
  M.act.forEach((_, i) => (M.act[i] = (i % 10) / 10));
  M.reachable(dt);
  const want = Float64Array.from(M.act, (a, i) => M.lo[i] + ((i * 7) % 11) / 10 * (M.hi[i] - M.lo[i]));
  M.excitation(want, dt);
  M.stepActivation(dt);
  for (let i = 0; i < M.n; i++) assert.ok(Math.abs(M.act[i] - want[i]) < 1e-12, `${M.ids[i]} ${M.act[i]} vs ${want[i]}`);
});

test("allocation: a torque the muscles can make is made, inside the reachable box", () => {
  const { M, pose, body } = setup();
  pose(fx.poses[5].commands);
  M.act.fill(0.2);
  const dt = 0.05; // (a long step: a wide box)
  M.reachable(dt);
  const aTrue = Float64Array.from({ length: M.n }, (_, i) => M.lo[i] + ((i * 37) % 17) / 16 * (M.hi[i] - M.lo[i]));
  const tau = new Float64Array(body.n);
  M.torqueOf(aTrue, tau);
  M.aDes.fill(0.2);
  const a = M.allocate(tau, { reg: 1e-6, sweeps: 4000 });
  const got = new Float64Array(body.n);
  M.torqueOf(a, got);
  let worst = 0;
  for (let h = 1; h < body.n; h++) if (M.spanned[h]) worst = Math.max(worst, Math.abs(got[h] - tau[h]) / M.hingeCap[h]);
  for (let i = 0; i < M.n; i++) assert.ok(a[i] >= M.lo[i] - 1e-12 && a[i] <= M.hi[i] + 1e-12);
  assert.ok(worst < 0.01, `worst hinge error ${(worst * 100).toFixed(2)} % of capacity`);
});
