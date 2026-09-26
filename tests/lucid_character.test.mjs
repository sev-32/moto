// Parity of the browser port of the canonical LUCID skin path (src/core/44_lucid_character.js)
// with the Python reference of the LUCID Biomechanical Causal Rig R1.5 (fixtures written by
// tools/character/extract_lucid.py from the package's own compiler, drivers and LBS).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
await import(path.join(ROOT, "src/core/44_lucid_character.js"));
const asset = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/character/lucid_female_v4_2.json"), "utf8"));
const fx = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/lucid_parity.json"), "utf8"));
const C = globalThis.LUCID_CHARACTER.createLucidCharacter(asset);
const maxAbs = (a, b) => a.reduce((m, x, i) => Math.max(m, Math.abs(x - b[i])), 0);
const TOL = 1e-9;

test("asset is the source-locked canonical skin", () => {
  assert.equal(asset.source.skinSha256, "88b6cacd2f7ad7fad0c5c9d9c731afcbc1388e09c5f0e817d181a62f11844a10");
  assert.equal(fx.skinSha256, asset.source.skinSha256);
  assert.equal(C.nv, 14164);
  assert.equal(C.faces.length / 3, 28092);
  assert.equal(C.clusters.names.length, 78);
  assert.equal(C.dofs.length, 51);
  assert.equal(C.joints.names.length, 51);
  assert.ok(Math.abs(C.physical.totalMassKg - 75) < 1e-9);
});

fx.poses.forEach((pose, n) => {
  test(`pose ${n}: compile, cluster transforms and LBS match the Python reference (< ${TOL} m)`, () => {
    const extraLocal = Object.keys(pose.hand).length ? C.hand.localRotations(pose.hand) : undefined;
    const placement = pose.placement ? { R: pose.placement.R.flat(), t: pose.placement.t } : undefined;
    const P = C.compile(pose.commands, { extraLocal, placement });
    assert.ok(maxAbs(P.P.flat(), pose.P.flat()) < TOL, "joint positions");
    assert.ok(maxAbs(P.G.flat(), pose.G.flat()) < TOL, "joint rotations");
    const ct = C.clusterTransforms(P);
    assert.ok(maxAbs(Array.from(ct.D), pose.D.flat()) < TOL, "cluster rotations");
    assert.ok(maxAbs(Array.from(ct.T), pose.T.flat()) < TOL, "cluster translations");
    const X = C.lbs(ct);
    const sample = pose.sampleIdx.flatMap((i) => [X[3 * i], X[3 * i + 1], X[3 * i + 2]]);
    assert.ok(maxAbs(sample, pose.sampleX.flat()) < TOL, "sampled vertices");
    const sum = [0, 0, 0];
    let am = 0;
    for (let i = 0; i < X.length; i++) { sum[i % 3] += X[i]; am = Math.max(am, Math.abs(X[i])); }
    assert.ok(maxAbs(sum, pose.sum) < 1e-7, "vertex sum (all 14,164 vertices)");
    assert.ok(Math.abs(am - pose.absMax) < TOL, "vertex extent");
  });
});

test("hard ranges block direct commands; realization clamps and reports", () => {
  assert.throws(() => C.compile({ "leftKnee.flexionExtension": 150 }), /DOF_OUTSIDE_HARD_RANGE/);
  assert.throws(() => C.compile({ "nope.dof": 1 }), /BLOCKED_UNSUPPORTED_DOF/);
  const rep = {};
  const c = C.clampToRange({ "leftKnee.flexionExtension": 150, "rightKnee.flexionExtension": 30 }, rep);
  assert.equal(c["leftKnee.flexionExtension"], 140);
  assert.equal(rep["leftKnee.flexionExtension"], 10);
});

test("rest pose reproduces VREST exactly", () => {
  const X = C.lbs(C.clusterTransforms(C.compile({})));
  assert.ok(maxAbs(Array.from(X), Array.from(C.vrest)) < 1e-12);
});
