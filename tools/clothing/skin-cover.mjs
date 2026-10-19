#!/usr/bin/env node
// Her skin under her clothes: which Skin78 triangles a garment covers well inside its openings, so
// the renderer can leave them out while she wears it (no skin poking through cloth where her LBS
// bulges at a raised shoulder, a bent knee). CANDIDATE, declared margins.
//
// For each skin vertex at rest (in the engine frame), the garment is found along its normal (a
// segment out to 6 cm, the engine's own BVH); the vertex is covered if the cloth it meets is at
// least the margin of every opening away from it, measured along the cloth (shortest paths over
// the garment's edges from each opening's boundary loop). A skin triangle is hidden when all three
// of its vertices are covered. Margins are wide where the cloth slides on her when she rides (the
// shirt's hem rides up as she leans to the bars, the jeans' waist goes down at the back and their
// hems up her shins) and narrow at the cuffs and the collar.
//
//   node tools/clothing/skin-cover.mjs -> assets/character/clothing/lucid_skin_cover_v1.json
import fs from "node:fs";
import path from "node:path";
import { ROOT, read, character, engineBody, mods } from "./engine.mjs";

const MARGINS = { shirt: { neck: 0.025, hem: 0.1, cuff: 0.02 }, jeans: { waist: 0.07, ankle: 0.22 } };
const V = path.join(ROOT, "src/vendor/lucid-clothing/labs/human-engine/clothing-safe/m26/source/public/src/clothing");
const { DynamicTriangleBVH } = await import(path.join(V, "dynamicBvh.js"));
const ch = character(), body = engineBody(ch), bind = body.bind();
// her skin at rest in the engine frame, per Skin78 vertex
const NV = ch.nv, X = new Float64Array(NV * 3), XN = new Float64Array(NV * 3);
for (let i = 0; i < body.NH; i++) { const s = body.heToSkin[i]; for (let k = 0; k < 3; k++) { X[3 * s + k] = bind.P[3 * i + k]; XN[3 * s + k] = bind.N[3 * i + k]; } }
const out = { schema: "lucid-moto.skin-cover.v1", status: "CANDIDATE", margins: MARGINS, rule: "a Skin78 triangle is hidden under a garment when all its vertices meet that garment within 6 cm along their normal at least the margin of every opening away from the opening (shortest path over the garment's edges)", garments: {} };
for (const [id, file] of [["shirt", "lucid_moto_tshirt_v1.json"], ["jeans", "lucid_human_native_jeans_v1.json"]]) {
  const G = mods.decodeGarmentAsset(read(path.join(ROOT, "assets/character/clothing", file)));
  const P = G.positions, I = G.indices, n = P.length / 3;
  // the garment's openings: its boundary loops (edges of one triangle), named by where they are
  const edgeUse = new Map(), key = (a, b) => (a < b ? a * 1e6 + b : b * 1e6 + a);
  for (let f = 0; f < I.length; f += 3) for (let k = 0; k < 3; k++) { const kk = key(I[f + k], I[f + (k + 1) % 3]); edgeUse.set(kk, (edgeUse.get(kk) || 0) + 1); }
  const adj = Array.from({ length: n }, () => []), badj = Array.from({ length: n }, () => []);
  for (const [kk, c] of edgeUse) {
    const a = Math.floor(kk / 1e6), b = kk % 1e6, L = Math.hypot(P[3 * a] - P[3 * b], P[3 * a + 1] - P[3 * b + 1], P[3 * a + 2] - P[3 * b + 2]);
    adj[a].push([b, L]); adj[b].push([a, L]);
    if (c === 1) { badj[a].push(b); badj[b].push(a); }
  }
  const loop = new Int32Array(n).fill(-1), loops = [];
  for (let v = 0; v < n; v++) {
    if (!badj[v].length || loop[v] >= 0) continue;
    const ids = [], st = [v]; loop[v] = loops.length;
    while (st.length) { const a = st.pop(); ids.push(a); for (const b of badj[a]) if (loop[b] < 0) { loop[b] = loops.length; st.push(b); } }
    const c = [0, 0, 0]; for (const a of ids) for (let k = 0; k < 3; k++) c[k] += P[3 * a + k] / ids.length;
    loops.push({ ids, c });
  }
  const big = loops.filter((l) => l.ids.length >= 8).sort((a, b) => b.c[1] - a.c[1]);
  const role = new Map();
  if (id === "shirt") { role.set(big[0], "neck"); const rest = big.slice(1).sort((a, b) => a.c[1] - b.c[1]); role.set(rest[0], "hem"); for (const l of rest.slice(1)) role.set(l, "cuff"); }
  else { role.set(big[0], "waist"); for (const l of big.slice(1)) role.set(l, "ankle"); }
  // distance along the cloth past every opening's margin (Dijkstra from all openings at once)
  const d = new Float64Array(n).fill(Infinity), heap = [];
  const push = (v, dv) => { heap.push([dv, v]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  for (const [l, r] of role) for (const v of l.ids) { const dv = -MARGINS[id][r]; if (dv < d[v]) { d[v] = dv; push(v, dv); } }
  while (heap.length) { const [dv, v] = pop(); if (dv > d[v]) continue; for (const [u, L] of adj[v]) if (dv + L < d[u]) { d[u] = dv + L; push(u, dv + L); } }
  // the garment's BVH (the engine's own) and, for each skin vertex, the cloth over it
  const N = new Float32Array(P.length), bvh = new DynamicTriangleBVH(I, P, { leafSize: 10 });
  bvh.refit(P, N, P, 1 / 60);
  const covered = new Uint8Array(NV);
  for (let s = 0; s < NV; s++) {
    const x = X[3 * s], y = X[3 * s + 1], z = X[3 * s + 2], nx = XN[3 * s], ny = XN[3 * s + 1], nz = XN[3 * s + 2];
    const h = bvh.sweepSegment(x - 0.002 * nx, y - 0.002 * ny, z - 0.002 * nz, x + 0.06 * nx, y + 0.06 * ny, z + 0.06 * nz);
    if (!h) continue;
    const a = I[3 * h.ti], b = I[3 * h.ti + 1], c = I[3 * h.ti + 2];
    if (h.u * d[a] + h.v * d[b] + h.w * d[c] >= 0 && Math.min(d[a], d[b], d[c]) > -0.01) covered[s] = 1;
  }
  const F = ch.faces, hide = new Uint8Array(F.length / 3);
  let nh = 0;
  for (let f = 0; f < hide.length; f++) if (covered[F[3 * f]] && covered[F[3 * f + 1]] && covered[F[3 * f + 2]]) { hide[f] = 1; nh++; }
  out.garments[id] = { openings: [...role].map(([l, r]) => ({ role: r, vertices: l.ids.length, centreY: +l.c[1].toFixed(3) })), hiddenTriangles: nh, hidden_u8_b64: Buffer.from(hide.buffer).toString("base64") };
  console.log(id, JSON.stringify({ openings: out.garments[id].openings, coveredSkinVertices: covered.reduce((a, b) => a + b, 0), hiddenTriangles: nh }));
}
const dst = path.join(ROOT, "assets/character/clothing/lucid_skin_cover_v1.json");
fs.writeFileSync(dst, JSON.stringify(out));
console.log("wrote", path.relative(ROOT, dst));
