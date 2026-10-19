// The LUCID Clothing Engine (vendored, unchanged) on her body, for Node tools and tests: her
// canonical skin -> the engine's body (the Human Engine layout and frame), the wardrobe set up as
// the engine's outfit qualification sets it up, and the riding cut. The game layer
// (src/core/47_rider_wardrobe.js) does the same with the same settings.
import fs from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const V = path.join(ROOT, "src/vendor/lucid-clothing/labs/human-engine");
const M26 = path.join(V, "clothing-safe/m26/source/public/src/clothing");
export const mods = {
  ...(await import(path.join(M26, "garmentAsset.js"))),
  ...(await import(path.join(M26, "watertightBodyProxy.js"))),
  ...(await import(path.join(M26, "jeansDetailRuntime.js"))),
  ...(await import(path.join(V, "clothing-engine/r1/src/wardrobeRuntime.js"))),
};
await import(path.join(ROOT, "src/core/44_lucid_character.js"));
const { installHangers } = await import(path.join(ROOT, "src/core/clothing/hangers.js"));
const { makeBra } = await import(path.join(ROOT, "src/core/clothing/bra.js"));
const { installStretch } = await import(path.join(ROOT, "src/core/clothing/stretch.js"));
const { roundInnerEdges } = await import(path.join(ROOT, "src/core/clothing/layeredge.js"));
const { decodeMap, bakeFabric } = await import(path.join(ROOT, "src/core/clothing/fabricmap.js"));
export const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const b64 = (s, T) => { const b = Buffer.from(s, "base64"); return new T(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const CLOTHING = path.join(ROOT, "assets/character/clothing");

// the engine's own outfit qualification settings (verifyOutfitMotionR1.mjs) - but for the layer
// coupling's inner visual envelope, 5 mm, not 11.5 (as the game: src/core/47_rider_wardrobe.js)
export const OUTFIT = {
  jeans: { stretch: 0.9, selfCollision: true, retention: true, iterations: 14, collisionPasses: 2, collisionPolishPasses: 2, postContactIterations: 2, skinFrictionStatic: 0.64, skinFrictionDynamic: 0.48, safetyFullEvery: 1,
    pantsOccupancy: true, pantsOccupancyScale: 1.0, pantsOccupancyMaxCorrectionM: 0.01, pantsContainment: true, pantsContainmentMarginM: 0.0015, pantsContainmentMaxCorrectionM: 0.012, pantsContainmentPasses: 3, pantsContainmentStrength: 0.92, pantsContainmentCouplingPasses: 2 },
  shirt: { selfCollision: true, iterations: 13, collisionPasses: 2, collisionPolishPasses: 2, postContactIterations: 2, skinFrictionStatic: 0.58, skinFrictionDynamic: 0.42, safetyFullEvery: 1 },
  layer: { gapM: 0.003, innerVisualEnvelopeM: 0.005, maxDistanceM: 0.035, maxCorrectionM: 0.008, passes: 3, frictionStatic: 0.42, frictionDynamic: 0.3 },
};

export function character() {
  return globalThis.LUCID_CHARACTER.createLucidCharacter(read(path.join(ROOT, "assets/character/lucid_female_v4_2.json")));
}

// her body in the engine: a 15,602-vertex gather of her skin (Skin78), in the engine's frame - at her
// bust, the smooth cups of her bra (bra: false, her bare skin)
export function engineBody(ch, { bra = true } = {}) {
  const AD = read(path.join(CLOTHING, "lucid_body_adapter_v1.json"));
  const heToSkin = b64(AD.heToSkin78_u16_b64, Uint16Array), indices = Uint32Array.from(b64(AD.indices_u16_b64, Uint16Array)), NH = heToSkin.length, F = ch.faces;
  // her bra as her clothes feel it (src/core/clothing/bra.js): the contact surface at her bust smoothed
  const cups = bra ? makeBra(ch) : null, heOf = Array.from({ length: ch.nv }, () => []);
  for (let i = 0; i < NH; i++) heOf[heToSkin[i]].push(i);
  const wear = (P) => { if (!cups) return P; cups.apply((v, out, o) => { const k = 3 * heOf[v][0]; out[o] = P[k]; out[o + 1] = P[k + 1]; out[o + 2] = P[k + 2]; }, (v, x, y, z) => { for (const i of heOf[v]) { P[3 * i] = x; P[3 * i + 1] = y; P[3 * i + 2] = z; } }); return P; };
  const N = new Float64Array(ch.nv * 3);
  function normals(X) {
    N.fill(0);
    for (let f = 0; f < F.length; f += 3) {
      const a = 3 * F[f], b = 3 * F[f + 1], c = 3 * F[f + 2];
      const ux = X[b] - X[a], uy = X[b + 1] - X[a + 1], uz = X[b + 2] - X[a + 2], vx = X[c] - X[a], vy = X[c + 1] - X[a + 1], vz = X[c + 2] - X[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const p of [a, b, c]) { N[p] += nx; N[p + 1] += ny; N[p + 2] += nz; }
    }
    for (let i = 0; i < N.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1; N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; }
  }
  return {
    NH, indices, heToSkin, cups,
    // rest (the master frame turned half a turn about +Y): where the garments were made
    bind() {
      const P = new Float32Array(NH * 3), PN = new Float32Array(NH * 3), X = ch.vrest;
      normals(X);
      for (let i = 0; i < NH; i++) { const s = 3 * heToSkin[i], o = 3 * i; P[o] = -X[s]; P[o + 1] = X[s + 1]; P[o + 2] = -X[s + 2]; PN[o] = -N[s]; PN[o + 1] = N[s + 1]; PN[o + 2] = -N[s + 2]; }
      return { P: wear(P), N: PN };
    },
    // a posed skin in world coordinates (z up) -> the engine frame (x' = -x, y' = z, z' = y) about `origin`
    gather(X, origin = [0, 0, 0], P = new Float32Array(NH * 3), PN = new Float32Array(NH * 3)) {
      normals(X);
      for (let i = 0; i < NH; i++) {
        const s = 3 * heToSkin[i], k = 3 * i;
        P[k] = -(X[s] - origin[0]); P[k + 1] = X[s + 2] - origin[2]; P[k + 2] = X[s + 1] - origin[1];
        PN[k] = -N[s]; PN[k + 1] = N[s + 2]; PN[k + 2] = N[s + 1];
      }
      return { P: wear(P), N: PN };
    },
  };
}

// her skin in a pose (Semantic51 commands, placement rotation), world coordinates, translation-free
export function skinWorld(ch, commands, R) {
  return ch.lbs(ch.clusterTransforms(ch.compile(commands, { validate: false, placement: { R, t: [0, 0, 0] } })));
}
// a placement turned about world z so her forward faces world +Y
export function headingFree(R) {
  const f = [-R[2], -R[5]], yaw = Math.atan2(f[0], f[1]), c = Math.cos(yaw), s = Math.sin(yaw), Z = [c, -s, 0, s, c, 0, 0, 0, 1];
  return [0, 1, 2].flatMap((r) => [0, 1, 2].map((k) => Z[3 * r] * R[k] + Z[3 * r + 1] * R[3 + k] + Z[3 * r + 2] * R[6 + k]));
}

// the wardrobe on her rest body; garments: ids of {jeans, shirt}; assetFiles: other garment files (in
// assets/character/clothing) for them; hangers: the shirt's long-range attachments (as in the game)
// fabric: the jeans' fabric map baked in (src/core/clothing/fabricmap.js) - true for the build's
// default (lucid_moto_jeans_fabric_v1.json, as the game), a decoded map, or false
export function buildWardrobe(body, { garments = ["jeans", "shirt"], settings = {}, authoring = null, assetFiles = {}, hangers = true, roundEdges = true, fabric = true } = {}) {
  const { decodeGarmentAsset, WatertightBodyProxy, WardrobeRuntime } = mods;
  const bind = body.bind();
  const proxy = new WatertightBodyProxy(read(path.join(CLOTHING, "body_watertight_proxy_alpha4.json")));
  proxy.updateFromBody(bind.P, 1 / 120);
  const files = { shirt: "lucid_moto_tshirt_v1.json", jeans: "lucid_human_native_jeans_v1.json", ...assetFiles };
  const assets = { shirt: decodeGarmentAsset(read(path.resolve(CLOTHING, files.shirt))), jeans: decodeGarmentAsset(read(path.resolve(CLOTHING, files.jeans))) };
  if (authoring) authoring(assets);
  const fabricFile = path.join(CLOTHING, "lucid_moto_jeans_fabric_v1.json");
  if (fabric && (typeof fabric === "object" || fs.existsSync(fabricFile))) bakeFabric(assets.jeans, typeof fabric === "object" ? fabric : decodeMap(read(fabricFile), assets.jeans));
  const W = new WardrobeRuntime({ bodyIndices: body.indices, bodyPositions: bind.P, bodyNormals: bind.N, bodyPrevPositions: bind.P, bodySafetyProxy: proxy });
  const g = {};
  if (garments.includes("jeans")) g.jeans = W.addGarment("jeans", assets.jeans, { layer: 10, solverSettings: { ...OUTFIT.jeans, ...(settings.jeans || {}) } });
  if (garments.includes("shirt")) g.shirt = W.addGarment("shirt", assets.shirt, { layer: 20, solverSettings: { ...OUTFIT.shirt, ...(settings.shirt || {}) } });
  // (the shirt hangs from its neckline: long-range attachments and its ring - src/core/clothing/hangers.js)
  if (g.shirt && hangers) installHangers(g.shirt.solver, typeof hangers === "object" ? hangers : {});
  const layer = g.jeans && g.shirt ? W.coupleLayers("jeans", "shirt", { ...OUTFIT.layer, ...(settings.layer || {}) }) : null;
  // (the jeans' open edges rounded for the coupling: src/core/clothing/layeredge.js)
  if (layer && roundEdges) roundInnerEdges(layer);
  if (layer) layer.settings.enabled = false;
  return { W, g, layer, proxy, assets, bind };
}

// the riding cut (lucid_riding_cut_v1.json): every edge and bend of a pattern at least as long as the cut
export function applyRidingCut(solver, cut) {
  if (!cut) return 0;
  const dec = (s) => b64(s, Float32Array);
  let n = 0;
  for (const [pairsKey, rests, key] of [["edges", ["edgeRest", "edgeRestAuthored"], "edgeRest_f32_b64"], ["bends", ["bendRest", "bendRestAuthored"], "bendRest_f32_b64"]]) {
    if (!cut[key]) continue;
    const c = dec(cut[key]);
    if (c.length !== solver[pairsKey].length / 2) throw Error(`riding cut ${key}: ${c.length} entries for ${solver[pairsKey].length / 2} ${pairsKey}`);
    for (const r of rests) { const a = solver[r]; if (!a) continue; for (let i = 0; i < c.length; i++) if (c[i] > a[i]) { a[i] = c[i]; n++; } }
  }
  return n;
}
export const ridingCutAsset = () => { const p = path.join(CLOTHING, "lucid_riding_cut_v1.json"); return fs.existsSync(p) ? read(p) : null; };
// the riding cut as the game wears it: stretch denim (src/core/clothing/stretch.js) - the pattern's
// lengths standing, stretching towards the cut's where her pose asks, a firm waistband
export function wearRidingCut(solver, cut, opts = {}) { return cut ? installStretch(solver, cut, b64, opts) : null; }
