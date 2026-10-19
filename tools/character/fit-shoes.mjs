#!/usr/bin/env node
// Her shoes, fitted to her feet (LUCID MOTO, CANDIDATE): the "Vans shoe" model by JW (CrossFireJW)
// (Sketchfab, CC-BY-4.0), a right shoe, sized to her foot as a shoe size is (one scale for the pair:
// its length her foot's with the toe room the fit leaves) and put on her rest feet - the left one
// mirrored - and written in her master frame (+x right, +y up, -z her front, metres), with what the
// game needs to wear them: each shoe's parts by material (rubber sole, canvas and suede upper, lining,
// laces), its flex at her toe joint, a finer patch of the vamp for the canvas to crease on (simulated
// in the game), her bow's knot and laces, the shoe's shape as a distance field for the laces to lie on,
// and which of her skin is inside the shoes.
//
//   python3 -I tools/character/extract_glb.py <vans_shoe.glb> <raw.json> --jpeg 90
//   node tools/character/fit-shoes.mjs <raw.json> [--scale 0.065] [--stack 0.012] [--out FILE]
//
// The model's own frame: up +y (its tread at y 0.02-0.06), its toe +z (length 3.875 units, heel at
// z -1.574), its medial side +x (the arch's waist and the ball's forward end on that side: a right
// shoe). Inside, it is modelled as a cup at the heel (lining and insole, open at the collar) and solid
// in front of it. Her foot fits it with a sole under her (--stack: outsole and insole, declared) and
// her heel against the heel cup's lining; the fit searches the shoe's yaw and its offsets along and
// across her foot for the fewest, shallowest places where her skin would come through the shoe.
import fs from "node:fs";
import path from "node:path";
import { ROOT, character } from "../clothing/engine.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); return i < 0 ? d : args[i + 1]; };
const RAW = args[0], S = Number(opt("scale", 0.065)), STACK = Number(opt("stack", 0.012));
const OUT = path.resolve(opt("out", path.join(ROOT, "assets/character/accessories/lucid_vans_v1.json")));
if (!RAW) throw Error("usage: fit-shoes.mjs <raw.json from extract_glb.py>");
const raw = JSON.parse(fs.readFileSync(RAW, "utf8")), m = raw.meshes[0];
const P = m.positions, UV = m.uvs, I = m.indices, TAN = m.tangents, NV = P.length / 3, NT = I.length / 3;
const ch = character(), X = ch.vrest, W = ch.weights;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(...a) || 1; return a.map((x) => x / l); };
const r4 = (x) => +x.toFixed(4);

// ---- the model's parts: its vertices welded by position, its connected pieces
const wid = new Int32Array(NV), weld = new Map();
for (let v = 0; v < NV; v++) { const k = `${P[3 * v].toFixed(5)},${P[3 * v + 1].toFixed(5)},${P[3 * v + 2].toFixed(5)}`; if (!weld.has(k)) weld.set(k, weld.size); wid[v] = weld.get(k); }
const NW = weld.size;
const piece = (() => {
  const par = Int32Array.from({ length: NW }, (_, i) => i), find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  for (let f = 0; f < NT; f++) { const a = find(wid[I[3 * f]]); par[find(wid[I[3 * f + 1]])] = a; par[find(wid[I[3 * f + 2]])] = a; }
  return Int32Array.from({ length: NT }, (_, f) => find(wid[I[3 * f]]));
})();
const pieces = new Map(); for (let f = 0; f < NT; f++) { if (!pieces.has(piece[f])) pieces.set(piece[f], []); pieces.get(piece[f]).push(f); }
const bounds = (tris) => { const b = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity]; for (const f of tris) for (let c = 0; c < 3; c++) { const v = I[3 * f + c]; for (let k = 0; k < 3; k++) { b[2 * k] = Math.min(b[2 * k], P[3 * v + k]); b[2 * k + 1] = Math.max(b[2 * k + 1], P[3 * v + k]); } } return b; };
const sorted = [...pieces.values()].sort((a, b) => b.length - a.length), bodyTris = sorted[0];
// (the laces: the crossings over the tongue, and the two ends running back from the top eyelets - those
// are left out: her laces are tied in a bow in the game)
const laceEnds = sorted.slice(1).filter((t) => bounds(t)[4] < -0.3), crossings = sorted.slice(1).filter((t) => bounds(t)[4] >= -0.3);
if (laceEnds.length !== 2) throw Error(`expected the model's two lace ends, found ${laceEnds.length}`);

// ---- its materials, by UV island (the texture's own layout): the gum outsole, the foxing tape round
// it, the lining and insole inside the heel cup, the heel, the toe cap, the tongue, the rest of the upper
const REG = { outsole: 0, foxing: 1, upper: 2, heel: 3, toecap: 4, tongue: 5, lining: 6, insole: 7, lace: 8 };
const region = new Uint8Array(NT).fill(REG.upper);
{
  const par = Int32Array.from({ length: NV }, (_, i) => i), find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  for (let f = 0; f < NT; f++) { const a = find(I[3 * f]); par[find(I[3 * f + 1])] = a; par[find(I[3 * f + 2])] = a; }
  const isl = new Map(); for (const f of bodyTris) { const r = find(I[3 * f]); if (!isl.has(r)) isl.set(r, []); isl.get(r).push(f); }
  for (const tris of isl.values()) {
    const b = bounds(tris); let up = 0; for (const f of tris) { const a = 3 * I[3 * f], c = 3 * I[3 * f + 1], d = 3 * I[3 * f + 2]; up += cross([P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]], [P[d] - P[a], P[d + 1] - P[a + 1], P[d + 2] - P[a + 2]])[1]; }
    let r = REG.upper;
    if (b[3] < 0.25) r = REG.outsole; // (the tread: nothing of it above 0.25)
    else if (b[2] < 0.06) r = REG.foxing; // (from the ground up the side, all round)
    else if (b[5] < 0.3 && b[3] - b[2] < 0.2 && up > 0) r = REG.insole; // (inside the heel cup, facing up)
    else if (b[5] < 0.3 && b[2] > 0.3 && b[0] > -0.6 && b[1] < 0.5 && b[3] > 1.4 && tris.length > 300) r = REG.lining; // (the heel cup's inside)
    else if (b[5] < -0.6) r = REG.heel;
    else if (b[4] > 1.0) r = REG.toecap;
    else if (b[0] > -0.25 && b[1] < 0.4 && b[2] > 0.8) r = REG.tongue;
    for (const f of tris) region[f] = r;
  }
  for (const t of crossings) for (const f of t) region[f] = REG.lace;
}
const keep = []; for (let f = 0; f < NT; f++) if (!laceEnds.some((t) => t.includes(f))) keep.push(f);

// ---- the shoe as a solid of voxels (winding along z), its heel cup (not solid, but enclosed by it on
// both sides, behind, in front and below), and the distances to the outside of both together
const H = 0.02, X0 = -0.86, Y0 = -0.02, Z0 = -1.62, NX = 80, NY = 82, NZ = 200, NN = NX * NY * NZ;
const vid = (i, j, k) => (k * NY + j) * NX + i;
const solid = new Uint8Array(NN), cup = new Uint8Array(NN);
for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
  const x = X0 + (i + 0.5) * H, y = Y0 + (j + 0.5) * H, hits = [];
  for (const f of bodyTris) {
    const a = 3 * I[3 * f], b = 3 * I[3 * f + 1], c = 3 * I[3 * f + 2], ax = P[a], ay = P[a + 1], bx = P[b], by = P[b + 1], cx = P[c], cy = P[c + 1];
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(den) < 1e-14) continue;
    const l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / den, l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / den;
    if (l1 < 0 || l2 < 0 || l1 + l2 > 1) continue;
    hits.push([l1 * P[a + 2] + l2 * P[b + 2] + (1 - l1 - l2) * P[c + 2], (bx - ax) * (cy - ay) - (by - ay) * (cx - ax) < 0 ? 1 : -1]);
  }
  hits.sort((p, q) => p[0] - q[0]);
  for (let k = 0, w = 0, h = 0; k < NZ; k++) { const z = Z0 + (k + 0.5) * H; while (h < hits.length && hits[h][0] < z) w += hits[h++][1]; if (w > 0) solid[vid(i, j, k)] = 1; }
}
{
  const lo = new Uint8Array(NN), hi = new Uint8Array(NN), back = new Uint8Array(NN), front = new Uint8Array(NN), below = new Uint8Array(NN);
  for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) { let s = 0; for (let i = 0; i < NX; i++) { lo[vid(i, j, k)] = s; s |= solid[vid(i, j, k)]; } s = 0; for (let i = NX - 1; i >= 0; i--) { hi[vid(i, j, k)] = s; s |= solid[vid(i, j, k)]; } }
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { let s = 0; for (let k = 0; k < NZ; k++) { back[vid(i, j, k)] = s; s |= solid[vid(i, j, k)]; } s = 0; for (let k = NZ - 1; k >= 0; k--) { front[vid(i, j, k)] = s; s |= solid[vid(i, j, k)]; } }
  for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) { let s = 0; for (let j = 0; j < NY; j++) { below[vid(i, j, k)] = s; s |= solid[vid(i, j, k)]; } }
  for (let n = 0; n < NN; n++) cup[n] = !solid[n] && lo[n] && hi[n] && back[n] && front[n] && below[n] ? 1 : 0;
}
// squared distance transform (Felzenszwalb & Huttenlocher), separable, of a mask (to its zeros)
function edt(mask, dims, at) {
  const [A, B, C] = dims, D = new Float64Array(A * B * C), INF = 1e20;
  for (let n = 0; n < D.length; n++) D[n] = mask[n] ? INF : 0;
  const L = Math.max(A, B, C), f = new Float64Array(L), d = new Float64Array(L), v = new Int32Array(L), z = new Float64Array(L + 1);
  const pass = (len, get, set) => {
    for (let q = 0; q < len; q++) f[q] = get(q);
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < len; q++) { let s; for (;;) { s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); if (s <= z[k] && k > 0) k--; else break; } if (s <= z[k]) { v[0] = q; z[0] = -INF; z[1] = INF; k = 0; continue; } k++; v[k] = q; z[k] = s; z[k + 1] = INF; }
    k = 0; for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) ** 2 + f[v[k]]; }
    for (let q = 0; q < len; q++) set(q, d[q]);
  };
  for (let c = 0; c < C; c++) for (let b = 0; b < B; b++) pass(A, (q) => D[at(q, b, c)], (q, x) => { D[at(q, b, c)] = x; });
  for (let c = 0; c < C; c++) for (let a = 0; a < A; a++) pass(B, (q) => D[at(a, q, c)], (q, x) => { D[at(a, q, c)] = x; });
  for (let b = 0; b < B; b++) for (let a = 0; a < A; a++) pass(C, (q) => D[at(a, b, q)], (q, x) => { D[at(a, b, q)] = x; });
  for (let n = 0; n < D.length; n++) D[n] = Math.sqrt(D[n]);
  return D;
}
const ins = Uint8Array.from(solid, (s, n) => s | cup[n]), outs = Uint8Array.from(ins, (x) => 1 - x);
const dIn = edt(ins, [NX, NY, NZ], vid), dOut = edt(outs, [NX, NY, NZ], vid);
// her heel in its cup: how far into the lining (in each height's plane) a point is
const cup2 = new Float64Array(NN);
for (let j = 0; j < NY; j++) {
  const sl = new Uint8Array(NX * NZ); for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) sl[k * NX + i] = cup[vid(i, j, k)] ? 0 : 1;
  const D = edt(sl, [NX, NZ, 1], (a, b) => b * NX + a); for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) cup2[vid(i, j, k)] = D[k * NX + i];
}
const opening = new Uint8Array(NX * NZ); for (let n = 0; n < NN; n++) if (cup[n]) opening[Math.floor(n / (NX * NY)) * NX + (n % NX)] = 1;
const cell = (p) => [Math.floor((p[0] - X0) / H), Math.floor((p[1] - Y0) / H), Math.floor((p[2] - Z0) / H)];
const inGrid = ([i, j, k]) => i >= 0 && j >= 0 && k >= 0 && i < NX && j < NY && k < NZ;

// ---- her left foot (her feet are mirror images to 0.3 mm): the skin her foot and toe joints carry,
// below 11 cm; the back of her heel
const FOOTC = new Set(["L_Foot", "L_IndexToe1", "L_MidToe1", "L_BigToe1", "L_RingToe1", "L_PinkyToe1", "L_CalfTwist02", "L_CalfTwist01"].map((n) => ch.clusters.names.indexOf(n)));
const foot = [];
for (let v = 0; v < ch.nv; v++) { let s = 0; for (let k = W.indptr[v]; k < W.indptr[v + 1]; k++) if (FOOTC.has(W.indices[k])) s += W.data[k] / W.sum[v]; if (s > 0.5 && X[3 * v + 1] < 0.11 && X[3 * v] < -0.01) foot.push(v); }
let heelBack = null, toeTip = null;
for (const v of foot) { const p = [X[3 * v], X[3 * v + 1], X[3 * v + 2]]; if (p[1] < 0.06 && (!heelBack || p[2] > heelBack[2])) heelBack = p; if (!toeTip || p[2] < toeTip[2]) toeTip = p; }
const sole = Math.min(...foot.map((v) => X[3 * v + 1]));

// her (left) rest frame <-> the model, mirrored: model = (cx + q_x / s, cy + q_y / s, cz - q_z / s) with q her
// point from the back of her heel at her sole, turned by -yaw about +y (yaw + turns the toe outwards)
const Y_TREAD = 0.055; // (the model's tread under the heel and the ball)
function placement({ yaw, cx, cz }) {
  const cy = Y_TREAD + STACK / S, c = Math.cos(yaw), sn = Math.sin(yaw), o = [heelBack[0], sole, heelBack[2]];
  const toModel = (p) => { const px = p[0] - o[0], py = p[1] - o[1], pz = p[2] - o[2]; return [cx + (c * px - sn * pz) / S, cy + py / S, cz - (sn * px + c * pz) / S]; };
  const toHer = (g) => { const qx = (g[0] - cx) * S, qy = (g[1] - cy) * S, qz = -(g[2] - cz) * S; return [o[0] + c * qx + sn * qz, o[1] + qy, o[2] - sn * qx + c * qz]; };
  return { yaw, cx, cy, cz, toModel, toHer };
}
// her foot in the shoe: through it (her skin outside the shoe but not in its opening), and pressed into
// the heel cup's padding (her skin above the insole at the heel, more than 2.5 mm into the lining)
function assess(pl) {
  let n = 0, sum = 0, max = 0; const cl = [], where = {};
  for (const v of foot) {
    const g = pl.toModel([X[3 * v], X[3 * v + 1], X[3 * v + 2]]), q = cell(g);
    let pen = 0, kind = "";
    if (inGrid(q) && ins[vid(...q)]) { if (g[1] > 0.45 && g[2] < -0.05) { pen = cup2[vid(...q)] * H * S; kind = "heel cup"; } if (pen <= 0.0025) { cl.push(dIn[vid(...q)] * H * S); continue; } }
    else { if (q[0] >= 0 && q[0] < NX && q[2] >= 0 && q[2] < NZ && opening[q[2] * NX + q[0]]) continue; pen = inGrid(q) ? dOut[vid(...q)] * H * S : 0.05; kind = g[1] > 0.6 ? "through the top" : "through the side"; }
    n++; sum += pen; max = Math.max(max, pen); const zr = X[3 * v + 2] < -0.12 ? "toes" : X[3 * v + 2] < -0.06 ? "forefoot" : X[3 * v + 2] < 0 ? "instep" : "heel";
    const key = `${zr}, ${kind}`; where[key] = Math.max(where[key] || 0, +(pen * 1000).toFixed(1));
  }
  // the toe room: from the tip of her longest toe forwards, along the shoe, to its outside
  const g = pl.toModel(toeTip); let run = 0;
  for (;;) { const q = cell(g); if (!inGrid(q) || !ins[vid(...q)] || run > 2) break; g[2] += H / 4; run += H / 4; }
  return { n, sum, max, toeRoom: run * S, where };
}
let best = null;
for (let yd = -2; yd <= 6; yd += 0.5) for (let cx = -0.2; cx <= 0.0501; cx += 0.0125) for (let cz = -1.5; cz <= -1.2999; cz += 0.01) {
  const pl = placement({ yaw: yd * Math.PI / 180, cx, cz }), r = assess(pl);
  if (r.toeRoom < 0.008) continue; // (at least 8 mm before her toes)
  const score = r.sum * 1000 + r.max * 3000;
  if (!best || score < best.score) best = { score, pl, r };
}
if (!best) throw Error("no placement leaves her toes room at this scale");
const PL = best.pl;

// ---- the two shoes in her rest frame: the left, the model mirrored (drawn with its triangles turned
// back over); the right, the left mirrored again (x -> -x) - the model as it is
const keepIdx = keep.flatMap((f) => [I[3 * f], I[3 * f + 1], I[3 * f + 2]]), keepReg = keep.map((f) => region[f]);
const L = { pos: new Float64Array(NV * 3), nor: new Float64Array(NV * 3), tan: new Float64Array(NV * 4) };
for (let v = 0; v < NV; v++) {
  const p = PL.toHer([P[3 * v], P[3 * v + 1], P[3 * v + 2]]), o = PL.toHer([0, 0, 0]);
  L.pos.set(p, 3 * v);
  const dir = (d) => { const e = PL.toHer([d[0], d[1], d[2]]); return unit(sub(e, o)); };
  L.nor.set(dir([m.normals[3 * v], m.normals[3 * v + 1], m.normals[3 * v + 2]]), 3 * v);
  L.tan.set([...dir([TAN[4 * v], TAN[4 * v + 1], TAN[4 * v + 2]]), -TAN[4 * v + 3]], 4 * v); // (mirrored: the bitangent's sign flips)
}
const mirrorX = (A, k) => { const o = Float64Array.from(A); for (let i = 0; i < o.length; i += k) o[i] = -o[i]; return o; };
const Rt = { pos: mirrorX(L.pos, 3), nor: mirrorX(L.nor, 3), tan: (() => { const o = mirrorX(L.tan, 4); for (let i = 3; i < o.length; i += 4) o[i] = -o[i]; return o; })() };

// ---- her toe joint and the shoe's flex: the forefoot bends with her toes, about her toe joint's axis,
// through a line in the sole under the joint (flexM above the tread: the outsole's middle, declared),
// spread over flexZoneM along her foot
const J = (n) => ch.joints.rest[ch.joints.names.indexOf(n)];
const toeDof = ch.dofs.find((d) => d.joint === "L_ToeBase"), FLEX_M = 0.004, FLEX_ZONE = 0.05;
const fwdL = unit(sub(PL.toHer([0, 0, 1]), PL.toHer([0, 0, 0])));
const flexL = { point: [J("L_ToeBase")[0], sole - STACK + FLEX_M, J("L_ToeBase")[2]], axis: unit(toeDof.axis), forward: fwdL, zoneM: FLEX_ZONE };

// ---- the vamp patch: the upper's triangles over the flex (from 3 cm behind the flex line to 2.5 cm in
// front of it, more than 2 cm above her sole: where the vamp creases), each cut into n x n, its points
// welded across the model's UV seams (the canvas is one sheet), pinned where it meets the rest of the shoe
const PATCH_N = 3, inFlex = (p) => { const u = dot(sub(p, flexL.point), fwdL); return u > -0.03 && u < 0.025 && p[1] > sole + 0.02; };
const centroid = (f) => [0, 1, 2].map((k) => (L.pos[3 * I[3 * f] + k] + L.pos[3 * I[3 * f + 1] + k] + L.pos[3 * I[3 * f + 2] + k]) / 3);
const patchTris = keep.filter((f, i) => [REG.upper, REG.toecap, REG.tongue].includes(keepReg[i]) && inFlex(centroid(f)));
const keepAt = new Map(keep.map((f, i) => [f, i]));
const patch = (() => {
  // a point of the patch: on a welded vertex, on a welded edge (at i of n from its lower to higher end),
  // or inside a triangle - keyed so neighbours share it; its place: a model triangle and barycentrics
  const key = new Map(), pts = [], rv = [], rvKey = new Map(), tris = [];
  const point = (k, f, b) => { if (!key.has(k)) { key.set(k, pts.length); pts.push({ f, b }); } return key.get(k); };
  const n = PATCH_N;
  for (const f of patchTris) {
    const c = [I[3 * f], I[3 * f + 1], I[3 * f + 2]], w = c.map((v) => wid[v]);
    const at = (i, j) => { // (i + j <= n): barycentrics (1 - (i + j)/n, i/n, j/n)
      const k3 = n - i - j, b = [k3 / n, i / n, j / n];
      let k;
      if (b.filter((x) => x === 1).length === 1) k = `v${w[b.indexOf(1)]}`;
      else if (b.filter((x) => x === 0).length === 1) { const z = b.indexOf(0), e = [0, 1, 2].filter((q) => q !== z), [a0, a1] = w[e[0]] < w[e[1]] ? [e[0], e[1]] : [e[1], e[0]]; k = `e${w[a0]},${w[a1]},${Math.round(b[a1] * n)}`; }
      else k = `f${f},${i},${j}`;
      const p = point(k, f, b);
      // its render vertex: the point with the UV it has in this triangle (seams split it)
      const uv = [0, 1].map((q) => b[0] * UV[2 * c[0] + q] + b[1] * UV[2 * c[1] + q] + b[2] * UV[2 * c[2] + q]), rk = `${p},${uv[0].toFixed(5)},${uv[1].toFixed(5)}`;
      if (!rvKey.has(rk)) { rvKey.set(rk, rv.length); rv.push({ p, uv, f, b }); }
      return rvKey.get(rk);
    };
    for (let i = 0; i < n; i++) for (let j = 0; j < n - i; j++) {
      tris.push(at(i, j), at(i + 1, j), at(i, j + 1));
      if (i + j < n - 1) tris.push(at(i + 1, j), at(i + 1, j + 1), at(i, j + 1));
    }
  }
  // pinned: the points on the patch's boundary edges (a welded edge used by one patch triangle)
  const edgeUse = new Map();
  for (const f of patchTris) for (let e = 0; e < 3; e++) { const a = wid[I[3 * f + e]], b = wid[I[3 * f + (e + 1) % 3]], k = a < b ? `${a},${b}` : `${b},${a}`; edgeUse.set(k, (edgeUse.get(k) || 0) + 1); }
  const pinned = new Uint8Array(pts.length);
  for (const [k, i] of key) {
    if (k[0] === "v") { const w0 = +k.slice(1); for (const [e, c] of edgeUse) if (c === 1 && e.split(",").map(Number).includes(w0)) { pinned[i] = 1; break; } }
    else if (k[0] === "e") { const [a, b] = k.slice(1).split(",").map(Number); if (edgeUse.get(`${a},${b}`) === 1) pinned[i] = 1; }
  }
  return { pts, rv, tris, pinned };
  // (the triangles' corners as the model has them: one index list for both shoes, the left drawn flipped)
})();

// ---- her bow: knotted over the top crossing of her laces; the laces' width from the crossings, the
// tails as long as the model's own lace ends (each a flat ribbon: half its area over its width)
const area = (tris) => tris.reduce((s, f) => { const a = 3 * I[3 * f], b = 3 * I[3 * f + 1], c = 3 * I[3 * f + 2]; return s + Math.hypot(...cross([P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]])) / 2; }, 0);
const top = crossings.reduce((a, t) => (bounds(t)[3] > bounds(a)[3] ? t : a));
const laceWidth = Math.min(...crossings.map((t) => { const b = bounds(t); return b[5] - b[4]; })) * S; // (a crossing runs across the tongue: its extent along the shoe is the lace's width)
const tails = laceEnds.map((t) => area(t) / 2 / (laceWidth / S) * S);
const topB = bounds(top), knotModel = [(topB[0] + topB[1]) / 2, topB[3], (topB[4] + topB[5]) / 2];
// the knot's frame: the shoe's facing under it (the tongue and upper within 1.5 cm, outwards), along the shoe
let kn = [0, 0, 0];
for (const f of bodyTris) {
  if (![REG.tongue, REG.upper].includes(region[f])) continue;
  const a = 3 * I[3 * f], b = 3 * I[3 * f + 1], c = 3 * I[3 * f + 2], cen = [0, 1, 2].map((k) => (P[a + k] + P[b + k] + P[c + k]) / 3);
  if (Math.hypot(...sub(cen, knotModel)) > 0.015 / S) continue;
  const n = cross([P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]]);
  if (n[1] > 0) kn = kn.map((x, k) => x + n[k]); // (the outside of the throat faces up)
}
const knotL = { point: PL.toHer(knotModel), up: unit(sub(PL.toHer(kn.map((x, i) => x + knotModel[i])), PL.toHer(knotModel))), forward: fwdL };
// the lace's colour: the texture under the top crossing (the middle of its UVs: inside its island -
// looked up in the game)
let luv = [0, 0], ln = 0; for (const f of top) for (let c = 0; c < 3; c++) { const v = I[3 * f + c]; luv[0] += UV[2 * v]; luv[1] += UV[2 * v + 1]; ln++; }
luv = luv.map((x) => x / ln);

// ---- the shoe's shape for the laces to lie on: a distance field (positive outside), the model's frame,
// coarse (2.6 mm cells, 0.5 mm steps), the heel cup counted as inside (her ankle is there)
const SD = { cell: 2 * H, nx: NX / 2, ny: NY / 2, nz: NZ / 2, origin: [X0, Y0, Z0], stepM: 0.0005 };
const sdf = new Int8Array(SD.nx * SD.ny * SD.nz);
for (let k = 0; k < SD.nz; k++) for (let j = 0; j < SD.ny; j++) for (let i = 0; i < SD.nx; i++) {
  let s = 0; for (let c = 0; c < 8; c++) { const n = vid(2 * i + (c & 1), 2 * j + ((c >> 1) & 1), 2 * k + (c >> 2)); s += (ins[n] ? -dIn[n] : dOut[n]) * H * S; }
  sdf[(k * SD.ny + j) * SD.nx + i] = Math.max(-127, Math.min(127, Math.round(s / 8 / SD.stepM)));
}

// ---- her skin the shoes cover, not drawn: her toes, and a triangle each of whose corners has the shoe in front of it
// (within 25 mm out along her skin's normal: the toe room) or has come through it (the shoe within 6 mm behind it:
// her forefoot is a little wider than the shoe's inside - its canvas would give there; the shoe is
// drawn as it is made)
const hiddenSkin = [];
{
  const F = ch.faces, Nrm = new Float64Array(ch.nv * 3);
  for (let f = 0; f < F.length; f += 3) { const a = 3 * F[f], b = 3 * F[f + 1], c = 3 * F[f + 2], n = cross([X[b] - X[a], X[b + 1] - X[a + 1], X[b + 2] - X[a + 2]], [X[c] - X[a], X[c + 1] - X[a + 1], X[c + 2] - X[a + 2]]); for (const q of [a, b, c]) for (let k = 0; k < 3; k++) Nrm[q + k] += n[k]; }
  const firstHit = (pos, o, d, far) => { // (nearest t in (0, far] where o + t d meets a triangle of the shoe)
    let best = Infinity;
    for (const f of keep) {
      if (region[f] === REG.lace) continue;
      const a = 3 * I[3 * f], b = 3 * I[3 * f + 1], c = 3 * I[3 * f + 2], e1 = [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]], e2 = [pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]];
      const pv = cross(d, e2), det = dot(e1, pv); if (Math.abs(det) < 1e-14) continue;
      const tv = [o[0] - pos[a], o[1] - pos[a + 1], o[2] - pos[a + 2]], u = dot(tv, pv) / det; if (u < 0 || u > 1) continue;
      const qv = cross(tv, e1), v = dot(d, qv) / det; if (v < 0 || u + v > 1) continue;
      const t = dot(e2, qv) / det; if (t > 0 && t <= far && t < best) best = t;
    }
    return best < Infinity;
  };
  const covered = new Uint8Array(ch.nv);
  // (her toes are always in the toe box, however they bend: the skin her toe joints carry)
  const TOES = new Set(["L", "R"].flatMap((sd) => ["IndexToe1", "MidToe1", "BigToe1", "RingToe1", "PinkyToe1"].map((t) => ch.clusters.names.indexOf(`${sd}_${t}`))));
  for (let v = 0; v < ch.nv; v++) { let t = 0; for (let k = W.indptr[v]; k < W.indptr[v + 1]; k++) if (TOES.has(W.indices[k])) t += W.data[k] / W.sum[v]; if (t > 0.25) covered[v] = 1; }
  for (let v = 0; v < ch.nv; v++) {
    if (covered[v]) continue;
    const o = [X[3 * v], X[3 * v + 1], X[3 * v + 2]]; if (o[1] > 0.14 || Math.abs(o[0]) < 0.01) continue;
    const pos = o[0] < 0 ? L.pos : Rt.pos, n = unit([Nrm[3 * v], Nrm[3 * v + 1], Nrm[3 * v + 2]]);
    if (firstHit(pos, o, n, 0.025) || firstHit(pos, o, n.map((x) => -x), 0.006)) covered[v] = 1;
  }
  for (let f = 0; f < F.length / 3; f++) if (covered[F[3 * f]] && covered[F[3 * f + 1]] && covered[F[3 * f + 2]]) hiddenSkin.push(f);
}

// ---- written
const f32 = (A) => Buffer.from(Float32Array.from(A).buffer).toString("base64");
const u32 = (A) => Buffer.from(Uint32Array.from(A).buffer).toString("base64");
const img = (k) => { const im = raw.images.find((q) => q.index === m.textures[k]); return { mime: im.mimeType, b64: fs.readFileSync(path.join(path.dirname(RAW), im.file)).toString("base64") }; };
const side = (S_, sh, mirrorSide) => {
  const mx = (p) => (mirrorSide ? [-p[0], p[1], p[2]] : p);
  return {
    carriedBy: `${S_}_Foot`, toes: `${S_}_ToeBase`, mirrored: !mirrorSide, // (the left shoe is the model mirrored)
    positions_f32_b64: f32(sh.pos), normals_f32_b64: f32(sh.nor), tangents_f32_b64: f32(sh.tan),
    flex: { point: mx(flexL.point).map(r4), axis: ch.dofs.find((d) => d.joint === `${S_}_ToeBase`).axis.map(r4), forward: mx(flexL.forward).map(r4), zoneM: FLEX_ZONE },
    knot: { point: mx(knotL.point).map(r4), up: mx(knotL.up).map(r4), forward: mx(knotL.forward).map(r4) },
    // her rest frame -> the model's (for the distance field): model = A (p - o) + c, A = M / scale
    toModel: (() => { const c = Math.cos(PL.yaw), sn = Math.sin(PL.yaw), sx = mirrorSide ? -1 : 1; return { o: mx([heelBack[0], sole, heelBack[2]]).map((x) => +x.toFixed(6)), A: [[c / S * sx, 0, -sn / S], [0, 1 / S, 0], [-sn / S * sx, 0, -c / S]].map((r) => r.map((x) => +x.toFixed(6))), c: [PL.cx, PL.cy, PL.cz].map((x) => +x.toFixed(6)) }; })(),
  };
};
const out = {
  schema: "lucid-moto.shoes.v1", status: "CANDIDATE", id: "lucid_vans_v1",
  frame: "her master frame (+x right, +y up, -z her front), metres, her rest pose",
  attribution: { title: raw.asset?.extras?.title, author: raw.asset?.extras?.author, license: raw.asset?.extras?.license, source: raw.asset?.extras?.source, changes: "converted to plain arrays, textures re-encoded as JPEG; scaled to her foot, mirrored for her left foot and put on her rest feet; the model's two lace ends replaced by a bow tied in the game; the vamp over the flex cut finer for its canvas to crease on (tools/character/fit-shoes.mjs)" },
  fit: {
    scale: S, lengthM: r4(3.875 * S), soleStackM: STACK, yawDeg: +(PL.yaw * 180 / Math.PI).toFixed(2), offsets: { across: r4(PL.cx), along: r4(PL.cz), footbed: r4(PL.cy) },
    footLengthM: r4(Math.hypot(toeTip[0] - heelBack[0], toeTip[2] - heelBack[2])), toeRoomM: r4(best.r.toeRoom),
    skinThroughShoe: { points: best.r.n, maxM: r4(best.r.max), byPlaceMM: best.r.where }, hiddenSkinTriangles: hiddenSkin.length,
  },
  regions: REG,
  textures: { baseColor: img("baseColor"), orm: img("metallicRoughness"), normal: img("normal") },
  // one mesh for both shoes: its UVs, its triangles (corners in the model's order), each one's region,
  // each vertex's welded id (the vertices one position shares across the model's UV seams)
  mesh: { vertices: NV, uvs_f32_b64: f32(UV), indices_u32_b64: u32(keepIdx), regions_u8_b64: Buffer.from(Uint8Array.from(keepReg)).toString("base64"), welded_u32_b64: u32(wid) },
  // the vamp patch: which of the mesh's triangles it replaces; its points (welded: one per place on
  // the canvas), each in a mesh triangle at barycentrics (corners in the model's order), pinned or free;
  // its drawn vertices (a point and its UV) and triangles
  patch: {
    n: PATCH_N, replaces_u32_b64: u32(patchTris.map((f) => keepAt.get(f))),
    points: { tri_u32_b64: u32(patch.pts.map((q) => keepAt.get(q.f))), bary_f32_b64: f32(patch.pts.flatMap((q) => q.b)), pinned_u8_b64: Buffer.from(patch.pinned).toString("base64") },
    vertices: { point_u32_b64: u32(patch.rv.map((q) => q.p)), uv_f32_b64: f32(patch.rv.flatMap((q) => q.uv)) },
    indices_u32_b64: u32(patch.tris),
  },
  // (the laces: their width from the model's crossings, a flat lace's thickness (declared), the bow's
  // tails as long as the model's own lace ends, each loop 9.5 cm of lace (declared))
  laces: { widthM: r4(laceWidth), thicknessM: 0.0015, tailsM: tails.map(r4), loopsM: [0.095, 0.095], uv: luv.map(r4) },
  sdf: { ...SD, origin: SD.origin, int8_b64: Buffer.from(sdf.buffer).toString("base64") },
  hiddenSkin_u32_b64: u32(hiddenSkin),
  feet: { L: side("L", L, false), R: side("R", Rt, true) },
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(JSON.stringify({ ...out.fit, patch: { triangles: patchTris.length, points: patch.pts.length, pinned: patch.pinned.reduce((a, b) => a + b, 0), subTriangles: patch.tris.length / 3 }, laces: out.laces, regions: Object.fromEntries(Object.entries(REG).map(([k, r]) => [k, keepReg.filter((x) => x === r).length])), file: path.relative(ROOT, OUT), bytes: fs.statSync(OUT).size }));
