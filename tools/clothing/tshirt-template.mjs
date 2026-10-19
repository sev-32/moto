#!/usr/bin/env node
// The T-shirt from its template: the Human Engine M26 "body-native" construction, reconstructed and
// parameterised, so the shirt is sized by its template - not made by reshaping a mesh.
//
// The lab's shirt (lucid_human_native_tshirt_v1.json) records how it was made: a continuous shell
// extracted from the Human Engine body's own topology inside bounds (`construction.extraction`),
// offset from the body by an ease (`construction.easeM`), faired ("carrier-normal minimum-clearance
// constrained Laplacian"), with a three-row rib collar sewn to its neckline. The generator is not in
// the handoff; this is it, reconstructed from the asset, and measured against it:
//   - the extraction: a body triangle is in the shirt when all three of its vertices are inside the
//     bounds - with the lab's bounds that is 4,944 triangles and 2,546 vertices (the layout's UV
//     seams welded), the lab shirt's exact counts;
//   - edges: the triangles' edges; bends: the two vertices facing each other across each interior
//     edge (the lab's 7,758 and 7,472 exactly);
//   - the collar: 38 points a ring, sewn 1 mm off the neckline, its rows 3.8 and 7.6 mm in (and 1.5,
//     2.5 mm up) - as the lab's.
// The ease and the fairing are fitted to the lab's shirt's measured clearance (see --lab).
//
//   node tools/clothing/tshirt-template.mjs [--size fitted|lab] [--set JSON] [--out FILE] [--lab]
//
//   --size lab     the lab's template (its bounds and ease) - to check the reconstruction
//   --size fitted  her fitted tee (default): see SIZES below
//   --set JSON     template fields over the size's, e.g. '{"easeM":{"torso":0.008},"hemY":0.9}'
//   --lab          compare the result with the lab's shirt (clearance from her body by region)
//
// Writes assets/character/clothing/lucid_moto_tshirt_v1.json (or --out). CANDIDATE.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ROOT, read, mods, character, engineBody } from "./engine.mjs";
const { DynamicTriangleBVH } = await import(path.join(ROOT, "src/vendor/lucid-clothing/labs/human-engine/clothing-safe/m26/source/public/src/clothing/dynamicBvh.js"));

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); return i < 0 ? d : args[i + 1]; };
const LAB_FILE = path.join(ROOT, "assets/character/clothing/lucid_human_native_tshirt_v1.json");
const JEANS_FILE = path.join(ROOT, "assets/character/clothing/lucid_human_native_jeans_v1.json");

// the template. Lengths in metres, the engine frame (her rest body: +y up, +z her front, +x her left)
export const SIZES = {
  // the lab's own (construction block of lucid_human_native_tshirt_v1.json)
  lab: {
    extraction: { hemY: 0.84, torsoHalfWidth: 0.22, cuffAbsX: 0.39, armLowerY: 1.04, neckY: 1.37, neckHalfWidth: 0.08, topY: 1.44 },
    sleeveM: null, // (the lab cuts its sleeves at |x| = cuffAbsX)
    easeM: { base: 0.012, torso: 0.014, frontChest: 0.02, hem: 0.02 },
    // where each ease applies, as measured on the lab's shirt: the front of her chest from y 1.04 to
    // 1.315 (z > 0); the hem's ease growing from her waist (y 1.07) to 6 cm above the hem
    regions: { frontChest: { y0: 1.04, y1: 1.315, z0: 0 }, hem: { fromY: 1.07, fullAboveHemM: 0.06 } },
    fairing: { iterations: 12, lambda: 0.5, minClearance: 1, sleeveMinClearance: 0.95, closingM: 0.4, closingFront: true },
    overJeansM: null, bra: false,
  },
  // her fitted tee: closer at the torso (girth ease ~ 2 pi x ease: 4.7 cm at the torso, 6-8 cm at the
  // bust and 7.5 at the waist as cut, against the lab's 13-15), the front bridging her bust, short
  // sleeves square to the arm 12 cm down it from the shoulder joint, the hem at her high hip over the
  // jeans - their clearance plus 16 mm there (the engine keeps an outer layer 8 mm off the jeans'
  // shell, its gap and the jeans' visual envelope: standing, the shirt hangs free of it), ramping out
  // over the waistband at 0.3 - made on
  // her bust as her bra shapes it; its front bridging only her tighter hollows (a 20 cm ball, the
  // lab's 40 cm: under and between her breasts), so it comes in at her waist; resting on her
  // shoulders (5.5 mm off them above 1.33 m, the engine's contact margin 4.5): cut 7.5 mm off them,
  // the whole shirt dropped 5 mm as it settled and bunched over her jeans' waistband
  fitted: {
    extraction: { hemY: 0.875, torsoHalfWidth: 0.22, cuffAbsX: 0.39, armLowerY: 1.04, neckY: 1.37, neckHalfWidth: 0.08, topY: 1.44 },
    sleeveM: 0.12,
    easeM: { base: 0.0085, torso: 0.0075, frontChest: 0.012, hem: 0.011, shoulder: 0.0055 },
    regions: { frontChest: { y0: 1.04, y1: 1.315, z0: 0 }, hem: { fromY: 1.07, fullAboveHemM: 0.06 }, shoulder: { y0: 1.33 } },
    fairing: { iterations: 12, lambda: 0.5, minClearance: 1, sleeveMinClearance: 0.95, closingM: 0.2, closingFront: true },
    overJeansM: 0.016, easeSlope: 0.3, bra: true,
  },
};

export function buildTshirt(T, { ch = character() } = {}) {
  const body = engineBody(ch, { bra: T.bra }), bind = body.bind(), P = bind.P, BN = bind.N, I = body.indices, NH = body.NH, E = T.extraction, FAIR = T.fairing, RG = T.regions;
  const HE = (v) => [-v[0], v[1], -v[2]], J = (nm) => HE(ch.joints.rest[ch.joints.names.indexOf(nm)]);
  const unit = (a) => { const l = Math.hypot(...a) || 1; return a.map((x) => x / l); };
  const arms = { 1: (() => { const S = J("L_Upperarm"), El = J("L_Forearm"); return { S, a: unit([El[0] - S[0], El[1] - S[1], El[2] - S[2]]) }; })(), [-1]: (() => { const S = J("R_Upperarm"), El = J("R_Forearm"); return { S, a: unit([El[0] - S[0], El[1] - S[1], El[2] - S[2]]) }; })() };
  // ---- the extraction: her body's triangles inside the bounds
  const inside = (i) => {
    const x = P[3 * i], ax = Math.abs(x), y = P[3 * i + 1], z = P[3 * i + 2];
    if (y < E.hemY || y > E.topY) return false;
    if (y > E.neckY && ax < E.neckHalfWidth) return false;
    if (ax <= E.torsoHalfWidth) return true;
    if (T.sleeveM == null) return ax <= E.cuffAbsX && y >= E.armLowerY;
    const { S, a } = arms[x >= 0 ? 1 : -1], t = (x - S[0]) * a[0] + (y - S[1]) * a[1] + (z - S[2]) * a[2];
    return y >= E.armLowerY - 0.1 && t <= T.sleeveM;
  };
  const tris = [];
  for (let f = 0; f < I.length; f += 3) if (inside(I[f]) && inside(I[f + 1]) && inside(I[f + 2])) tris.push(f / 3);
  // welded: one shell vertex per position (the layout splits its UV seams), in order of first use
  const wkey = (i) => `${P[3 * i].toFixed(6)},${P[3 * i + 1].toFixed(6)},${P[3 * i + 2].toFixed(6)}`, id = new Map(), src = [], copies = [];
  const shellTris = [];
  for (const t of tris) for (let k = 0; k < 3; k++) {
    const b = I[3 * t + k], w = wkey(b);
    if (!id.has(w)) { id.set(w, src.length); src.push(b); copies.push([]); }
    copies[id.get(w)].push(b); shellTris.push(id.get(w));
  }
  const ns = src.length, B = new Float64Array(ns * 3), N = new Float64Array(ns * 3);
  for (let v = 0; v < ns; v++) {
    const b = src[v]; for (let d = 0; d < 3; d++) B[3 * v + d] = P[3 * b + d];
    const n = [0, 0, 0]; for (const c of new Set(copies[v])) for (let d = 0; d < 3; d++) n[d] += BN[3 * c + d];
    const u = unit(n); for (let d = 0; d < 3; d++) N[3 * v + d] = u[d];
  }
  // components: the sleeves beyond the torso's half width (her left +x: 0, right: 4), the body 2
  const comp = new Int16Array(ns).fill(2);
  for (let v = 0; v < ns; v++) if (Math.abs(B[3 * v]) > E.torsoHalfWidth) comp[v] = B[3 * v] > 0 ? 0 : 4;
  // ---- the ease, by region: sleeves `base`, the body `torso`, the front of her chest `frontChest`
  // (bridging her bust), the last 6 cm to the hem `hem` - and over her jeans, their clearance plus
  // overJeansM where it is more
  const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  const jeansClear = T.overJeansM == null ? null : jeansClearance(body, bind);
  const ease = new Float64Array(ns), overJeans = new Uint8Array(ns);
  for (let v = 0; v < ns; v++) {
    const y = B[3 * v + 1], z = B[3 * v + 2], ax = Math.abs(B[3 * v]);
    let e = comp[v] === 2 ? T.easeM.torso : T.easeM.base;
    if (comp[v] === 2) {
      const F = RG.frontChest, H = RG.hem, hemFull = E.hemY + H.fullAboveHemM;
      if (z > F.z0 && y >= F.y0 && y <= F.y1) e = T.easeM.frontChest;
      // her shoulders, where the shirt hangs from: easeM.shoulder above shoulderY0 (blended in over
      // 6 cm below it) - made resting on them, at the engine's contact margin, it has nowhere to drop to
      if (T.easeM.shoulder != null && RG.shoulder) e += (T.easeM.shoulder - e) * smooth(RG.shoulder.y0 - 0.06, RG.shoulder.y0, y);
      e += (T.easeM.hem - e) * Math.min(1, Math.max(0, (H.fromY - y) / (H.fromY - hemFull)));
      if (jeansClear) { const j = jeansClear(src[v]); if (j != null) { e = Math.max(e, j + T.overJeansM); overJeans[v] = 1; } }
    }
    ease[v] = e;
  }
  // the ease changes no faster than easeSlope (m per m along her body): where the shirt passes
  // over her jeans' waistband it ramps out over it, rather than stepping. Over the jeans' top edge it
  // is held for jeansEdgeM first: settling (the engine's first steps, before its layer coupling is
  // on) the shirt drops a few millimetres and in onto her; made at its torso ease just above the
  // waistband, it sank to the level of the jeans' top edge, and the coupling then found it behind them
  // there and pushed it out every frame - a roll round her waist
  const adjB = Array.from({ length: ns }, () => []);
  for (let f = 0; f < shellTris.length; f += 3) for (let k = 0; k < 3; k++) { const a = shellTris[f + k], b = shellTris[f + (k + 1) % 3]; if (comp[a] !== comp[b]) continue; const l = Math.hypot(B[3 * a] - B[3 * b], B[3 * a + 1] - B[3 * b + 1], B[3 * a + 2] - B[3 * b + 2]); adjB[a].push(b, l); adjB[b].push(a, l); }
  if (T.jeansEdgeM > 0 && jeansClear) {
    // (from each point over the jeans along her body: its ease held for jeansEdgeM, then easing off)
    const d = new Float64Array(ns).fill(Infinity), src = new Float64Array(ns), heap = [];
    const push = (v, x) => { heap.push([x, v]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    for (let v = 0; v < ns; v++) if (overJeans[v]) { d[v] = 0; src[v] = ease[v]; push(v, 0); }
    while (heap.length) { const [x, v] = pop(); if (x > d[v]) continue; const L = adjB[v]; for (let j = 0; j < L.length; j += 2) { const u = L[j], y = x + L[j + 1]; if (y < d[u]) { d[u] = y; src[u] = src[v]; push(u, y); } } }
    for (let v = 0; v < ns; v++) if (!overJeans[v] && d[v] <= T.jeansEdgeM) ease[v] = Math.max(ease[v], src[v]);
  }
  if (T.easeSlope > 0) {
    for (let sweep = 0, changed = true; changed && sweep < 200; sweep++) {
      changed = false;
      for (let v = 0; v < ns; v++) { const L = adjB[v]; for (let j = 0; j < L.length; j += 2) { const e = ease[L[j]] - T.easeSlope * L[j + 1]; if (e > ease[v] + 1e-9) { ease[v] = e; changed = true; } } }
    }
  }
  // ---- offset and fair: each point out along her normal by its ease, then umbrella-smoothed, never
  // closer to her than minClearance of its ease along its carrier normal
  const X = new Float64Array(ns * 3);
  for (let v = 0; v < ns; v++) for (let d = 0; d < 3; d++) X[3 * v + d] = B[3 * v + d] + N[3 * v + d] * ease[v];
  // ---- the body bridges her hollows: a ball of radius closingM rolled over the torso, offset by its
  // ease, from outside (a morphological closing) - the cloth spans under her bust and between her
  // breasts, as a T-shirt's front does, rather than following her skin into them. The sleeves and
  // her arms take no part (the ball would web her arms to her sides).
  if (FAIR.closingM > 0) {
    const R = FAIR.closingM, tor = [], F = RG.frontChest; for (let v = 0; v < ns; v++) if (comp[v] === 2) tor.push(v);
    // (bridging her front: under her bust and between her breasts - closingFront)
    const bridged = FAIR.closingFront ? tor.filter((v) => B[3 * v + 2] > F.z0 && B[3 * v + 1] >= F.y0 - 0.04 && B[3 * v + 1] <= F.y1) : tor;
    closing(R, tor, bridged);
  }
  // ---- and her waist: a larger ball all round below waistClosingY1, from her ribs to her hips (over
  // her jeans, their clearance and the shirt's ease over them included) - the shirt spans her waist
  // as a T-shirt does, rather than stepping out over the jeans' waistband
  if (FAIR.waistClosingM > 0) {
    const tor = []; for (let v = 0; v < ns; v++) if (comp[v] === 2) tor.push(v);
    closing(FAIR.waistClosingM, tor, tor.filter((v) => B[3 * v + 1] <= FAIR.waistClosingY1));
  }
  function closing(R, tor, bridged) {
    // the ball's centres: each torso point's offset by R more, kept where it is R clear of all of them
    const Q = [];
    for (const v of tor) {
      const c = [0, 1, 2].map((d) => B[3 * v + d] + N[3 * v + d] * (ease[v] + R));
      let ok = true;
      for (const u of tor) { const l = Math.hypot(c[0] - B[3 * u], c[1] - B[3 * u + 1], c[2] - B[3 * u + 2]); if (l < (ease[u] + R) * 0.995) { ok = false; break; } }
      if (ok) Q.push(c);
    }
    for (const v of bridged) {
      let best = Infinity, q = null;
      for (const c of Q) { const l = Math.hypot(X[3 * v] - c[0], X[3 * v + 1] - c[1], X[3 * v + 2] - c[2]); if (l < best) { best = l; q = c; } }
      if (!q || best <= R) continue;
      for (let d = 0; d < 3; d++) X[3 * v + d] = q[d] + (X[3 * v + d] - q[d]) * (R / best);
    }
  }
  const nb = Array.from({ length: ns }, () => new Set()), Kt = (a, b) => (a < b ? a * 1048576 + b : b * 1048576 + a), use = new Map();
  for (let f = 0; f < shellTris.length; f += 3) for (let k = 0; k < 3; k++) { const a = shellTris[f + k], b = shellTris[f + (k + 1) % 3]; nb[a].add(b); nb[b].add(a); const key = Kt(a, b); use.set(key, (use.get(key) || 0) + 1); }
  const onEdge = new Uint8Array(ns); for (const [key, c] of use) if (c === 1) { onEdge[Math.floor(key / 1048576)] = 1; onEdge[key % 1048576] = 1; }
  const tmp = new Float64Array(ns * 3), bvh = new DynamicTriangleBVH(I, P);
  bvh.refit(P, BN);
  // (an opening's points smooth along the opening only, so it keeps its line)
  const NB = Array.from({ length: ns }, (_, v) => Int32Array.from(onEdge[v] ? [...nb[v]].filter((u) => onEdge[u]) : [...nb[v]]));
  // weights: uniform (the umbrella), or cotangent (mean-curvature flow: smoothing along her normal,
  // little sliding across her), from the surface as it is, every few steps
  const Wt = NB.map((L) => new Float64Array(L.length).fill(1));
  const cotWeights = () => {
    const w = new Map(), K = (a, b) => (a < b ? a * 1048576 + b : b * 1048576 + a);
    for (let f = 0; f < shellTris.length; f += 3) for (let k = 0; k < 3; k++) {
      const a = shellTris[f + k], b = shellTris[f + (k + 1) % 3], o = shellTris[f + (k + 2) % 3];
      const u = [0, 1, 2].map((d) => X[3 * a + d] - X[3 * o + d]), t = [0, 1, 2].map((d) => X[3 * b + d] - X[3 * o + d]);
      const dot = u[0] * t[0] + u[1] * t[1] + u[2] * t[2], cr = Math.hypot(u[1] * t[2] - u[2] * t[1], u[2] * t[0] - u[0] * t[2], u[0] * t[1] - u[1] * t[0]) || 1e-12;
      const key = K(a, b); w.set(key, (w.get(key) || 0) + 0.5 * dot / cr);
    }
    for (let v = 0; v < ns; v++) { const L = NB[v]; if (onEdge[v]) continue; for (let j = 0; j < L.length; j++) Wt[v][j] = Math.max(1e-3, w.get(K(v, L[j])) || 0); }
  };
  for (let it = 0; it < FAIR.iterations; it++) {
    if (FAIR.weights === "cotan" && it % 8 === 0) cotWeights();
    for (let v = 0; v < ns; v++) {
      const L = NB[v], wv = Wt[v];
      let sx = 0, sy = 0, sz = 0, m = 0; for (let j = 0; j < L.length; j++) { const u = L[j], c = wv[j]; sx += c * X[3 * u]; sy += c * X[3 * u + 1]; sz += c * X[3 * u + 2]; m += c; }
      m = m || 1;
      const dx = FAIR.lambda * (sx / m - X[3 * v]), dy = FAIR.lambda * (sy / m - X[3 * v + 1]), dz = FAIR.lambda * (sz / m - X[3 * v + 2]);
      // along her normal in full, across it by `tangent` (0: the cloth only lifts off her, 1: it slides too)
      const dn = dx * N[3 * v] + dy * N[3 * v + 1] + dz * N[3 * v + 2], kt = FAIR.tangent ?? 1;
      tmp[3 * v] = X[3 * v] + dn * N[3 * v] + kt * (dx - dn * N[3 * v]); tmp[3 * v + 1] = X[3 * v + 1] + dn * N[3 * v + 1] + kt * (dy - dn * N[3 * v + 1]); tmp[3 * v + 2] = X[3 * v + 2] + dn * N[3 * v + 2] + kt * (dz - dn * N[3 * v + 2]);
    }
    // the clearance along the carrier normal: from the closest point of her body (as the engine finds
    // a garment point's carrier), along her normal there
    for (let v = 0; v < ns; v++) {
      const lim = (comp[v] === 2 ? FAIR.minClearance : FAIR.sleeveMinClearance) * ease[v];
      let q = [B[3 * v], B[3 * v + 1], B[3 * v + 2]], n = [N[3 * v], N[3 * v + 1], N[3 * v + 2]];
      if (FAIR.carrier !== false) { const h = bvh.closestPoint(tmp[3 * v], tmp[3 * v + 1], tmp[3 * v + 2], 0.2); if (h) { q = [h.qx, h.qy, h.qz]; n = [h.nx, h.ny, h.nz]; } }
      let c = 0; for (let d = 0; d < 3; d++) c += (tmp[3 * v + d] - q[d]) * n[d];
      for (let d = 0; d < 3; d++) X[3 * v + d] = tmp[3 * v + d] + (c < lim ? (lim - c) * n[d] : 0);
    }
  }
  // ---- the collar: the neckline (the highest opening), 3 rows of rib sewn to it
  const loops = boundaryLoops(shellTris, ns);
  const ys = loops.map((L) => L.reduce((s, v) => s + B[3 * v + 1], 0) / L.length);
  const neck = loops[ys.indexOf(Math.max(...ys))];
  const Nk = J("NeckTwist01"), ring = neck.length, rows = [[0.001, 0], [0.0048, 0.0015], [0.0086, 0.0025]];
  const XC = new Float64Array(ring * 3 * 3);
  for (let j = 0; j < ring; j++) {
    const v = neck[j], p = [X[3 * v], X[3 * v + 1], X[3 * v + 2]], din = unit([Nk[0] - p[0], 0, Nk[2] - p[2]]);
    rows.forEach(([inM, upM], r) => { const o = 3 * (r * ring + j); XC[o] = p[0] + din[0] * inM; XC[o + 1] = p[1] + upM; XC[o + 2] = p[2] + din[2] * inM; });
  }
  const nv = ns + 3 * ring, pos = new Float32Array(nv * 3);
  pos.set(Float32Array.from(X)); pos.set(Float32Array.from(XC), ns * 3);
  const indices = shellTris.slice();
  for (let r = 0; r < 2; r++) for (let j = 0; j < ring; j++) {
    const a = ns + r * ring + j, b = ns + r * ring + ((j + 1) % ring), c = a + ring, d = b + ring;
    indices.push(a, b, c, b, d, c);
  }
  const compAll = new Int16Array(nv); compAll.set(comp); compAll.fill(6, ns);
  // edges, bends (facing vertices across each interior edge), seams (neckline <-> outer row)
  const eUse = new Map(), opp = new Map();
  for (let f = 0; f < indices.length; f += 3) for (let k = 0; k < 3; k++) { const a = indices[f + k], b = indices[f + (k + 1) % 3], o = indices[f + (k + 2) % 3], key = Kt(a, b); eUse.set(key, [a < b ? a : b, a < b ? b : a]); (opp.get(key) || opp.set(key, []).get(key)).push(o); }
  const edges = [], bends = [];
  for (const [, ab] of eUse) edges.push(ab[0], ab[1]);
  const bendSeen = new Set();
  for (const [, os] of opp) if (os.length === 2) { const k = Kt(os[0], os[1]); if (!bendSeen.has(k)) { bendSeen.add(k); bends.push(os[0], os[1]); } }
  const seams = []; for (let j = 0; j < ring; j++) seams.push(neck[j], ns + j);
  return { pos, indices: Uint32Array.from(indices), edges: Uint32Array.from(edges), bends: Uint32Array.from(bends), seams: Uint32Array.from(seams), comp: compAll, ns, ring, triangles: tris.length, ease, body: B, normals: N, src };
}

// her jeans' clearance from her at a body vertex (the lab's jeans shell, its points by nearest body
// vertex) - null where the jeans do not cover her
function jeansClearance(body, bind) {
  const J = mods.decodeGarmentAsset(read(JEANS_FILE)), jp = J.positions, nj = J.meta.shellVertexCount ?? jp.length / 3, P = bind.P, N = bind.N;
  const cell = 0.02, key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`, grid = new Map();
  for (let i = 0; i < nj; i++) { const k = key(jp[3 * i], jp[3 * i + 1], jp[3 * i + 2]); (grid.get(k) || grid.set(k, []).get(k)).push(i); }
  return (b) => {
    const x = P[3 * b], y = P[3 * b + 1], z = P[3 * b + 2], n = [N[3 * b], N[3 * b + 1], N[3 * b + 2]];
    // (the jeans' points over this one: within 1.5 cm across her normal - about their spacing)
    let best = null, bd = 0.015 * 0.015;
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
    for (let a = -3; a <= 3; a++) for (let c = -3; c <= 3; c++) for (let e = -3; e <= 3; e++) for (const i of grid.get(`${cx + a},${cy + c},${cz + e}`) || []) {
      const d = [jp[3 * i] - x, jp[3 * i + 1] - y, jp[3 * i + 2] - z], al = d[0] * n[0] + d[1] * n[1] + d[2] * n[2], off2 = d[0] ** 2 + d[1] ** 2 + d[2] ** 2 - al * al;
      if (al > -0.005 && off2 < bd) { bd = off2; best = al; }
    }
    return best == null ? null : Math.max(0, best);
  };
}
function boundaryLoops(I, n) {
  const K = (a, b) => (a < b ? a * 1048576 + b : b * 1048576 + a), use = new Map();
  for (let f = 0; f < I.length; f += 3) for (let k = 0; k < 3; k++) { const key = K(I[f + k], I[f + (k + 1) % 3]); use.set(key, (use.get(key) || 0) + 1); }
  // directed boundary edges in the triangles' winding, chained
  const next = new Map();
  for (let f = 0; f < I.length; f += 3) for (let k = 0; k < 3; k++) { const a = I[f + k], b = I[f + (k + 1) % 3]; if (use.get(K(a, b)) === 1) next.set(a, b); }
  const seen = new Set(), loops = [];
  for (const s of next.keys()) { if (seen.has(s)) continue; const L = []; let v = s; while (!seen.has(v) && next.has(v)) { seen.add(v); L.push(v); v = next.get(v); } if (L.length >= 8) loops.push(L); }
  return loops;
}

// the garment, in the engine's format (lucid.garment.runtime.v1), its making declared
export function writeAsset(G, T, file, { name = "lucid_moto_tshirt_v1", size } = {}) {
  const lab = JSON.parse(fs.readFileSync(LAB_FILE, "utf8"));
  const b64 = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString("base64");
  const nv = G.pos.length / 3, colors = new Float32Array(nv * 3).fill(1);
  const out = {
    schema: lab.schema, id: name,
    source: { ...lab.source, garment: `Fitted T-shirt (LUCID MOTO), from the body-native template (${size})`, notes: "Built by tools/clothing/tshirt-template.mjs: the Human Engine M26 body-native construction, reconstructed - her body's own topology inside the template's bounds, offset by its ease, faired with a minimum clearance, a three-row rib collar sewn to the neckline." },
    units: "m", vertexCount: nv, shellVertexCount: G.ns,
    collar: { outerStart: G.ns, ringCount: G.ring, midStart: G.ns + G.ring, innerStart: G.ns + 2 * G.ring },
    topology: { triangleCount: G.indices.length / 3, edgeCount: G.edges.length / 2, bendCount: G.bends.length / 2, seamCount: G.seams.length / 2, componentCount: 4, freeBoundaryLoops: 4, freeBoundaryRoles: ["neck", "hem", "left_cuff", "right_cuff"], componentRoles: { 0: "left_sleeve", 2: "continuous_torso", 4: "right_sleeve", 6: "three_row_rib_collar" } },
    fabric: lab.fabric,
    construction: { ...lab.construction, extraction: T.extraction, sleeveM: T.sleeveM, easeM: T.easeM, overJeansM: T.overJeansM, onBra: T.bra, regions: T.regions, fairing: `carrier-normal minimum-clearance constrained Laplacian (${T.fairing.iterations} umbrella steps of ${T.fairing.lambda}, clearance >= ${T.fairing.minClearance} of the ease, ${T.fairing.sleeveMinClearance} on the sleeves)`, template: { tool: "tools/clothing/tshirt-template.mjs", size, status: "CANDIDATE" } },
    causal: lab.causal,
    arrays: { positions_f32_b64: b64(G.pos), colors_f32_b64: b64(colors), indices_u32_b64: b64(G.indices), edges_u32_b64: b64(G.edges), bends_u32_b64: b64(G.bends), seams_u32_b64: b64(G.seams), component_ids_i16_b64: b64(G.comp) },
  };
  fs.writeFileSync(file, JSON.stringify(out));
  return out;
}

// the reconstruction against the lab's shirt: counts, and clearance from her body by region
export async function compareWithLab(file) {
  const { WatertightBodyProxy } = mods;
  const ch = character(), body = engineBody(ch, { bra: false }), bind = body.bind();
  const proxy = new WatertightBodyProxy(read(path.join(ROOT, "assets/character/clothing/body_watertight_proxy_alpha4.json")));
  proxy.updateFromBody(bind.P, 1 / 120);
  const stats = (G) => {
    const P = G.positions, C = G.componentIds, ns = G.meta.shellVertexCount, by = {};
    for (let v = 0; v < ns; v++) { const h = proxy.closestPoint(P[3 * v], P[3 * v + 1], P[3 * v + 2], 0.2); if (!h) continue; const y = P[3 * v + 1], reg = C[v] === 2 ? (y < 0.92 ? "hem" : y > 1.12 && y < 1.3 && P[3 * v + 2] > 0.02 ? "frontChest" : "torso") : "sleeves"; (by[reg] ||= []).push(Math.sqrt(h.d2)); }
    const q = (a, p) => +[...a].sort((x, y) => x - y)[Math.floor(p * (a.length - 1))].toFixed(4);
    return Object.fromEntries(Object.entries(by).map(([k, a]) => [k, { n: a.length, p10: q(a, 0.1), p50: q(a, 0.5), p90: q(a, 0.9) }]));
  };
  const lab = mods.decodeGarmentAsset(read(LAB_FILE)), ours = mods.decodeGarmentAsset(read(file));
  return { lab: { shell: lab.meta.shellVertexCount, triangles: lab.indices.length / 3, clearance: stats(lab) }, ours: { shell: ours.meta.shellVertexCount, triangles: ours.indices.length / 3, clearance: stats(ours) } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const size = opt("size", "fitted"), T = structuredClone(SIZES[size]);
  if (!T) throw Error(`size: ${Object.keys(SIZES).join(" | ")}`);
  const set = JSON.parse(opt("set", "{}"));
  for (const [k, v] of Object.entries(set)) T[k] = v && typeof v === "object" && !Array.isArray(v) && T[k] ? { ...T[k], ...v } : v;
  const G = buildTshirt(T);
  const file = path.resolve(opt("out", path.join(ROOT, "assets/character/clothing/lucid_moto_tshirt_v1.json")));
  writeAsset(G, T, file, { size });
  const hash = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").slice(0, 12);
  console.log(JSON.stringify({ size, template: T, shell: G.ns, triangles: G.indices.length / 3, edges: G.edges.length / 2, bends: G.bends.length / 2, collarRing: G.ring, file: path.relative(ROOT, file), sha256: hash }));
  if (args.includes("--lab")) console.log(JSON.stringify(await compareWithLab(file), null, 1));
}
