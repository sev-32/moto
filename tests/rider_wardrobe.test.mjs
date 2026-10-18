// Her clothes (src/core/47_rider_wardrobe.js): the LUCID Clothing Engine, vendored unchanged, on her
// Skin78 through the body adapter - checked here without a browser.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ROOT, read, character, engineBody, buildWardrobe, skinWorld, headingFree, applyRidingCut, ridingCutAsset } from "../tools/clothing/engine.mjs";
import { bundleModules } from "../tools/bundle-modules.mjs";

const VENDOR = path.join(ROOT, "src/vendor/lucid-clothing");
const ch = character(), body = engineBody(ch);

test("vendored clothing engine sources are byte-for-byte the handoff's", () => {
  const man = read(path.join(VENDOR, "MANIFEST.json"));
  assert.ok(Object.keys(man.files).length >= 12);
  for (const [f, sha] of Object.entries(man.files)) assert.equal(crypto.createHash("sha256").update(fs.readFileSync(path.join(VENDOR, f))).digest("hex"), sha, f);
});

test("the engine's body is her Skin78: the gather covers her skin and keeps every triangle, in order", () => {
  assert.equal(body.NH, 15602);
  assert.equal(body.indices.length, ch.faces.length);
  for (let i = 0; i < body.indices.length; i++) if (body.heToSkin[body.indices[i]] !== ch.faces[i]) assert.fail(`triangle ${(i / 3) | 0} differs`);
  // rest: the half turn of her master frame (x, y, z) -> (-x, y, -z)
  const b = body.bind(), i = 1234, s = 3 * body.heToSkin[i];
  assert.deepEqual([b.P[3 * i], b.P[3 * i + 1], b.P[3 * i + 2]].map((v) => +v.toFixed(5)), [-ch.vrest[s], ch.vrest[s + 1], -ch.vrest[s + 2]].map((v) => +v.toFixed(5)));
});

test("the build's bundle of the vendored modules evaluates and exports the wardrobe", () => {
  const spec = read(path.join(ROOT, "src/core/layers.json")).layers.find((l) => l.id === "rider-wardrobe");
  const [b] = Object.values(spec.bundle);
  const M = new Function("return " + bundleModules(path.join(ROOT, b.root), b.entries).code)();
  const has = (name) => Object.values(M).some((m) => typeof m[name] === "function");
  for (const n of ["WardrobeRuntime", "LucidClothSolverV2", "LucidClothSolver", "WatertightBodyProxy", "decodeGarmentAsset", "JeansDetailRuntime", "ClothRenderSupermesh"]) assert.ok(has(n), n);
});

test("dressed seated on the 916 (riding cut): the clothes settle on her - finite, outside her body, strain bounded", () => {
  const poses = read(path.join(ROOT, "tests/fixtures/rider_poses.json"));
  const { W, g, layer, proxy } = buildWardrobe(body);
  const cut = ridingCutAsset();
  assert.ok(cut, "riding cut asset");
  assert.ok(applyRidingCut(g.jeans.solver, cut.garments.jeans) > 1000);
  const p = poses.postures.seated, b = body.gather(skinWorld(ch, p.commands, headingFree(p.placement.R)));
  W.setBodySurface(b.P, b.N, b.P, 1 / 120);
  for (const gg of W.garments) gg.solver.reanchorToCurrentBody({ safetyPasses: 4 });
  for (let i = 0; i < 12; i++) { W.setBodySurface(b.P, b.N, b.P, 1 / 120); W.stepFrame(1 / 120); }
  layer.settings.enabled = true;
  for (let i = 0; i < 8; i++) { W.setBodySurface(b.P, b.N, b.P, 1 / 120); W.stepFrame(1 / 120); }
  const m = W.metrics();
  for (const id of ["jeans", "shirt"]) {
    const s = g[id].solver;
    assert.ok(m.garments[id].finite, id + " finite");
    assert.equal(proxy.auditPoints(s.pos, { start: 0, end: s.shellVertexCount }).inside, 0, id + " inside her body");
  }
  // CANDIDATE bounds, as measured (tools/clothing/ride-cloth.mjs): the knee pit at 120 deg keeps the
  // jeans' p99 near 100 % - the engine's documented deep-knee case
  assert.ok(m.garments.shirt.shellP95Strain < 0.3, "shirt p95 " + m.garments.shirt.shellP95Strain);
  assert.ok(m.garments.jeans.shellP95Strain < 0.35, "jeans p95 " + m.garments.jeans.shellP95Strain);
  assert.equal(layer.audit().behind, 0, "shirt behind the jeans");
});
