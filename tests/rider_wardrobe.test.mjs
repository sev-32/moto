// Her clothes (src/core/47_rider_wardrobe.js): the LUCID Clothing Engine, vendored unchanged, on her
// Skin78 through the body adapter - checked here without a browser.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ROOT, read, mods, character, engineBody, buildWardrobe, skinWorld, headingFree, wearRidingCut, ridingCutAsset } from "../tools/clothing/engine.mjs";
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

test("dressed seated on the 916 (riding cut, stretch denim): the clothes settle on her - finite, outside her body, strain bounded", () => {
  const poses = read(path.join(ROOT, "tests/fixtures/rider_poses.json"));
  const { W, g, layer, proxy } = buildWardrobe(body);
  const cut = ridingCutAsset();
  assert.ok(cut, "riding cut asset");
  const X = wearRidingCut(g.jeans.solver, cut.garments.jeans);
  assert.ok(X.pairs[0].max.filter((m) => m > 1).length > 1000, "edges the cut lets stretch");
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
  assert.ok(m.garments.shirt.shellP95Strain < 0.35, "shirt p95 " + m.garments.shirt.shellP95Strain);
  assert.ok(m.garments.jeans.shellP95Strain < 0.35, "jeans p95 " + m.garments.jeans.shellP95Strain);
  assert.equal(layer.audit().behind, 0, "shirt behind the jeans");
});

test("the game's bundle of our clothing modules (hangers, bra) evaluates and exports them", () => {
  const spec = read(path.join(ROOT, "src/core/layers.json")).layers.find((l) => l.id === "rider-wardrobe");
  const b = spec.bundle["/*@@MOTO_CLOTHING@@*/ null"];
  const M = new Function("return " + bundleModules(path.join(ROOT, b.root), b.entries).code)();
  for (const n of ["installHangers", "necklineOf", "hemOf"]) assert.equal(typeof M["hangers.js"][n], "function", n);
  assert.equal(typeof M["bra.js"].makeBra, "function");
  assert.equal(typeof M["stretch.js"].installStretch, "function");
  assert.equal(typeof M["layeredge.js"].roundInnerEdges, "function");
  for (const n of ["bakeFabric", "decodeMap", "encodeMap", "garmentGeometry", "flatToRest", "denimCreases"]) assert.equal(typeof M["fabricmap.js"][n], "function", n);
});

test("her bra as her clothes feel it: both tips found and smoothed in, nothing beyond the cups moved", () => {
  const bare = engineBody(ch, { bra: false }).bind().P, worn = body.bind().P;
  assert.equal(body.cups.tips.length, 2);
  const at = (P, i) => [P[3 * i], P[3 * i + 1], P[3 * i + 2]];
  for (const t of body.cups.tips) {
    const he = body.heToSkin.indexOf(t), a = at(bare, he), w = at(worn, he);
    // (her front is the engine's +z: smoothed in, the tip moves back)
    assert.ok(a[2] - w[2] > 0.005, `tip ${t} in by ${((a[2] - w[2]) * 1000).toFixed(1)} mm`);
  }
  const tipsAt = body.cups.tips.map((t) => [-ch.vrest[3 * t], ch.vrest[3 * t + 1], -ch.vrest[3 * t + 2]]);
  let moved = 0;
  for (let i = 0; i < body.NH; i++) {
    const p = at(bare, i), d = Math.min(...tipsAt.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])));
    if (d > 0.046 && Math.hypot(...p.map((x, k) => x - worn[3 * i + k])) > 1e-9) moved++;
  }
  assert.equal(moved, 0, "vertices moved beyond the cups");
});

test("the LUCID MOTO shirt hangs from its neckline on her rest body: it neither slides nor opens", () => {
  const { W, g } = buildWardrobe(body, { garments: ["shirt"] });
  const sv = g.shirt.solver, ring = Array.from(sv.hangers.anchors), b = body.bind();
  const neck = () => { let y = 0, L = 0; for (let j = 0; j < ring.length; j++) { const p = 3 * ring[j], q = 3 * ring[(j + 1) % ring.length]; y += sv.pos[p + 1] / ring.length; L += Math.hypot(sv.pos[q] - sv.pos[p], sv.pos[q + 1] - sv.pos[p + 1], sv.pos[q + 2] - sv.pos[p + 2]); } return { y, L }; };
  const n0 = neck();
  for (let i = 0; i < 120; i++) { W.setBodySurface(b.P, b.N, b.P, 1 / 120); W.stepFrame(1 / 120); }
  const n1 = neck();
  // (the lab's shirt, without the hangers, slid 2.3 cm and opened 6.7 % in 1/3 s)
  assert.ok(n0.y - n1.y < 0.015, `neckline down ${((n0.y - n1.y) * 100).toFixed(1)} cm`);
  assert.ok(n1.L / n0.L - 1 < 0.03, `neckline opened ${((n1.L / n0.L - 1) * 100).toFixed(1)} %`);
  assert.equal(g.shirt.solver.metrics().finite, true);
});

test("the LUCID MOTO shirt fits her: girths over hers within a fitted tee's ease, as it hangs over her jeans", async () => {
  const { tape, skinRest } = await import("../tools/clothing/measure.mjs");
  const { W, g, layer } = buildWardrobe(body);
  wearRidingCut(g.jeans.solver, ridingCutAsset().garments.jeans);
  const b = body.bind();
  for (let i = 0; i < 120; i++) { if (i === 12) layer.settings.enabled = true; W.setBodySurface(b.P, b.N, b.P, 1 / 120); W.stepFrame(1 / 120); }
  const sv = g.shirt.solver, rows = tape({ skin: skinRest(ch), gPos: sv.pos, gIdx: sv.indices, gComp: sv.componentIds });
  const ease = (y) => rows.find((r) => Math.abs(r.y - y) < 0.005)?.ease;
  // CANDIDATE bounds, as measured (docs/CLOTHING.md): the lab's shirt carried 11-26 cm here
  for (const y of [0.98, 1.0, 1.1, 1.14]) { const e = ease(y); assert.ok(e != null && e >= 2.8 && e <= 15, `ease at ${y} m: ${e} cm`); }
  assert.equal(layer.audit().behind, 0, "shirt behind the jeans");
});

test("her groom: 369 clumps of 12 nodes from her hair cards, in her master frame on her head", () => {
  const G = read(path.join(ROOT, "assets/character/hair/lucid_hair_guides_v1.json"));
  assert.equal(G.clumps.length, 369);
  const head = ch.joints.rest[ch.joints.names.indexOf("Head")];
  for (const c of G.clumps) {
    assert.equal(c.nodes.length, 12);
    const r = c.nodes[0];
    assert.ok(Math.hypot(r[0] - head[0], r[1] - head[1], r[2] - head[2]) < 0.2, "root on her head");
    assert.ok(c.width > 0);
  }
});

test("the T-shirt template: its lab size rebuilds the lab's shirt - the same shell, triangles, edges, bends and collar", async () => {
  const { buildTshirt, SIZES } = await import("../tools/clothing/tshirt-template.mjs");
  const G = buildTshirt(structuredClone(SIZES.lab), { ch });
  const lab = mods.decodeGarmentAsset(read(path.join(ROOT, "assets/character/clothing/lucid_human_native_tshirt_v1.json")));
  assert.equal(G.ns, lab.meta.shellVertexCount);
  assert.equal(G.indices.length, lab.indices.length);
  assert.equal(G.edges.length, lab.edges.length);
  assert.equal(G.bends.length, lab.bends.length);
  assert.equal(G.ring, lab.meta.collar.ringCount);
  // her shirt is that template at her size: the asset in the build is what the template makes
  const T = structuredClone(SIZES.fitted), F = buildTshirt(T, { ch }), A = mods.decodeGarmentAsset(read(path.join(ROOT, "assets/character/clothing/lucid_moto_tshirt_v1.json")));
  assert.equal(A.positions.length, F.pos.length);
  let max = 0; for (let i = 0; i < F.pos.length; i++) max = Math.max(max, Math.abs(A.positions[i] - F.pos[i]));
  assert.ok(max < 1e-6, "her shirt is the fitted template's: " + max);
});

test("stretch denim: standing, the jeans are their pattern but for a firm waistband; seated, they stretch towards the cut, never past it", () => {
  const poses = read(path.join(ROOT, "tests/fixtures/rider_poses.json"));
  const { W, g } = buildWardrobe(body, { garments: ["jeans"] });
  const S = g.jeans.solver, cut = ridingCutAsset().garments.jeans, X = wearRidingCut(S, cut), [E] = X.pairs;
  const base = E.base[0];
  assert.ok(X.waist.length >= 40 && X.bandVertices > X.waist.length, "the waistband");
  let band = 0, other = 0;
  for (let i = 0; i < base.length; i++) { if (E.band[i]) { band++; assert.ok(Math.abs(S.edgeRest[i] - base[i] * (1 - 0.03)) < 1e-9); } else if (Math.abs(S.edgeRest[i] - base[i]) > 1e-12) other++; }
  assert.ok(band > 100); assert.equal(other, 0, "standing: the pattern's lengths");
  const p = poses.postures.seated, b = body.gather(skinWorld(ch, p.commands, headingFree(p.placement.R)));
  for (let k = 0; k < 30; k++) W.setBodySurface(b.P, b.N, b.P, 1 / 120);
  let longer = 0, past = 0;
  for (let i = 0; i < base.length; i++) { if (E.band[i]) continue; if (S.edgeRest[i] > base[i] * 1.01) longer++; if (S.edgeRest[i] > base[i] * E.max[i] * (1 + 1e-6)) past++; }
  assert.ok(longer > 200, "seated: " + longer + " edges stretched");
  assert.equal(past, 0, "never past the cut");
});

test("the jeans' open edges, rounded for the layer coupling: nothing behind the jeans is measured differently", async () => {
  const { DynamicTriangleBVH } = await import(path.join(VENDOR, "labs/human-engine/clothing-safe/m26/source/public/src/clothing/dynamicBvh.js"));
  const { layer, g } = buildWardrobe(body);
  assert.ok(layer.roundedEdges && layer.roundedEdges.edges > 40, "the jeans' open edges");
  const J = g.jeans.solver, s = g.shirt.solver;
  J.syncRender(); J.computeNormals(); layer.bvh.refit(J.renderPositions, J.renderNormals);
  const plain = new DynamicTriangleBVH(J.indices, J.renderPositions); plain.refit(J.renderPositions, J.renderNormals);
  let behind = 0, rounded = 0;
  // shirt points and points pushed through the jeans: wherever the engine's own measure says behind,
  // the rounded measure says the same
  for (const i of layer.candidateIds) for (const t of [0, -0.02]) {
    const h0 = plain.closestPoint(s.pos[3 * i], s.pos[3 * i + 1], s.pos[3 * i + 2], 0.035); if (!h0) continue;
    const q = [s.pos[3 * i] + h0.nx * t, s.pos[3 * i + 1] + h0.ny * t, s.pos[3 * i + 2] + h0.nz * t];
    const a = plain.closestPoint(...q, 0.035), b = layer.bvh.closestPoint(...q, 0.035); if (!a) continue;
    if (a.signed < 0) { behind++; assert.equal(b.signed, a.signed); } else { assert.ok(b.signed >= a.signed - 1e-12); if (b.signed > a.signed + 1e-9) rounded++; }
  }
  assert.ok(behind > 100 && rounded > 0, `behind ${behind}, rounded ${rounded}`);
});

test("her jeans' fabric map: worn denim's creases on their flats, baked into the engine's fabric fields where they run, and nowhere else", async () => {
  const F = await import("../src/core/clothing/fabricmap.js");
  const dec = () => mods.decodeGarmentAsset(read(path.join(ROOT, "assets/character/clothing/lucid_human_native_jeans_v1.json")));
  const json = read(path.join(ROOT, "assets/character/clothing/lucid_moto_jeans_fabric_v1.json")), map = F.decodeMap(json, dec());
  assert.ok(map.creases.length >= 20, map.creases.length + " creases");
  for (const k of ["whisker", "honeycomb", "knee", "stack"]) assert.ok(map.creases.some((c) => c.name.startsWith(k)), k);
  // round trip
  const again = F.decodeMap(JSON.parse(JSON.stringify(F.encodeMap(map))), dec());
  assert.deepEqual(again.creases, map.creases);
  for (const k of Object.keys(F.CHANNELS)) assert.deepEqual(Array.from(again.channels[k]), Array.from(map.channels[k]));
  // baked: only bends near a crease are folded (their rest scale at most creaseDepth shorter), the rest untouched
  const A = dec(), B = dec(), r = F.bakeFabric(B, map), geo = F.garmentGeometry(A), lines = F.creasePolylines(geo, map);
  assert.ok(r.folded > 300 && r.creaseLines === map.creases.length);
  let folded = 0;
  for (let k = 0; k < A.bendRestScale.length; k++) {
    const s = B.bendRestScale[k] / A.bendRestScale[k];
    assert.ok(s <= 1 + 1e-6 && s >= 1 - map.creaseDepth - 1e-6, "bend rest scale " + s);
    if (s < 1 - 1e-6) {
      folded++;
      const h = geo.hinge.get(geo.K(A.bends[2 * k], A.bends[2 * k + 1])), p = [0, 1, 2].map((d) => 0.5 * (A.positions[3 * h[0] + d] + A.positions[3 * h[1] + d]));
      const near = Math.min(...lines.flatMap((L) => L.pts.map((q) => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]))));
      assert.ok(near < 0.08, "a folded hinge " + near.toFixed(3) + " m from any crease");
    }
  }
  assert.equal(folded, r.folded);
  // tension: an edge between points painted 0.9 is cut 10% shorter than the lab's own
  const T = F.blankMap(A, "jeans"); T.channels.tension.fill(0.9); const C = dec(); F.bakeFabric(C, T);
  for (let e = 0; e < C.edgeRestScale.length; e += 97) assert.ok(Math.abs(C.edgeRestScale[e] / A.edgeRestScale[e] - 0.9) < 1e-6);
});

