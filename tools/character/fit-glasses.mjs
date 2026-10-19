#!/usr/bin/env node
// Her sunglasses, fitted to her face (LUCID MOTO, CANDIDATE): the "Sunglasses" model by martn00
// (Sketchfab, CC-BY-4.0) put on her rest head - the frame on the bridge of her nose, its lenses at
// her eyes, each temple opened at its hinge and lengthened to rest on the root of her ear, its tip
// curving down behind it - and written in her head's frame (offsets from her rest Head joint, her
// master frame's axes), to be carried by her head as she moves.
//
//   python3 -I tools/character/extract_glb.py <sunglasses.glb> <raw.json> --skip Plane.001_0
//   node tools/character/fit-glasses.mjs <raw.json> [--scale 0.0208] [--tilt 8] [--out FILE]
//
// The model's own frame (as exported): width along y (+-3.1 units), up along -x, its front +z, the
// temples straight back along -z from hinges at y +-3.063, x -0.305, z -0.27 to their ends at z
// -3.592; translucent tips beyond. Her landmarks from her rest skin (master frame: +y up, -z her
// front): the dip of her nose's bridge on her midline (between the tip of her nose and her brow),
// her ears (her skin standing out past her cranium), her head's half-width along the temples' way.
import fs from "node:fs";
import path from "node:path";
import { ROOT, character } from "../clothing/engine.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); return i < 0 ? d : args[i + 1]; };
const RAW = args[0], S = Number(opt("scale", 0.0208)), TILT = Number(opt("tilt", 8)) * Math.PI / 180;
const OUT = path.resolve(opt("out", path.join(ROOT, "assets/character/accessories/lucid_sunglasses_v1.json")));
if (!RAW) throw Error("usage: fit-glasses.mjs <raw.json from extract_glb.py>");
const raw = JSON.parse(fs.readFileSync(RAW, "utf8"));
const ch = character(), X = ch.vrest, nv = ch.nv, head = ch.joints.rest[ch.joints.names.indexOf("Head")];

// ---- her landmarks
const near = (f) => { const o = []; for (let v = 0; v < nv; v++) if (f(X[3 * v], X[3 * v + 1], X[3 * v + 2])) o.push(v); return o; };
// her face's midline profile: the most forward point (least z) at each height
const profile = [];
for (let y = 1.46; y <= 1.6; y += 0.0025) { let z = Infinity; for (const v of near((x, yy) => Math.abs(x) < 0.004 && Math.abs(yy - y) < 0.00125)) z = Math.min(z, X[3 * v + 2]); if (z < Infinity) profile.push([y, z]); }
const tip = profile.reduce((a, p) => (p[1] < a[1] ? p : a)), brow = profile.filter((p) => p[0] > tip[0] + 0.03).reduce((a, p) => (p[1] < a[1] ? p : a));
const nasion = profile.filter((p) => p[0] > tip[0] && p[0] < brow[0]).reduce((a, p) => (p[1] > a[1] ? p : a));
const eyeY = nasion[0] - 0.004;
// her ears: skin standing out past her cranium; their top, and its front
const ear = {};
for (const s of [1, -1]) {
  const e = near((x, y) => x * s > 0.082 && y > 1.44 && y < 1.6), top = Math.max(...e.map((v) => X[3 * v + 1])), band = e.filter((v) => X[3 * v + 1] > top - 0.008);
  ear[s] = { top, front: Math.min(...band.map((v) => X[3 * v + 2])) };
}
// her head's half-width on one side near (y, z): her cranium's, not her ear's (the temple rests on
// her head where her ear joins it, not on the rim of her ear)
const halfWidth = (s, y, z, r = 0.006) => { let m = 0; for (const v of near((x, yy, zz) => x * s > 0 && x * s < 0.082 && Math.abs(yy - y) < r && Math.abs(zz - z) < r)) m = Math.max(m, X[3 * v] * s); return m; };

// ---- the frame on her face: the model's frame to her master frame (proper rotation: its width
// along her -x, its up (-x) along her +y, its front (+z) along her -z), tilted (the lenses' lower
// rims towards her cheeks), its lens centre at her eyes 6 mm before the bridge of her nose
const lens = raw.meshes.find((m) => m.material === "Glass").positions;
let lx0 = Infinity, lx1 = -Infinity, lz = 0; for (let i = 0; i < lens.length; i += 3) { lx0 = Math.min(lx0, lens[i]); lx1 = Math.max(lx1, lens[i]); lz += lens[i + 2]; }
const g0 = [(lx0 + lx1) / 2, 0, lz / (lens.length / 3)];
const rot = (g) => [-g[1], -g[0], -g[2]]; // (model axes to hers)
const tilt = (p) => { const c = Math.cos(-TILT), s = Math.sin(-TILT); return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c]; };
const T = [0, eyeY, nasion[1] - 0.006];
const place = (g) => { const q = tilt(rot([(g[0] - g0[0]) * S, (g[1] - g0[1]) * S, (g[2] - g0[2]) * S])); return [T[0] + q[0], T[1] + q[1], T[2] + q[2]]; };
const placeDir = (g) => tilt(rot(g));

// ---- the temples: each opened at its hinge and lengthened to rest on her ear's root (2.5 mm off
// her head there, 3 mm above the ear's top), its tip carried rigidly with the bar's end
const HINGE = { x: -0.305, y: 3.063, z: -0.27 }, END_Z = -3.592;
const unit = (a) => { const l = Math.hypot(...a) || 1; return a.map((x) => x / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function rotBetween(a, b) { // the rotation taking unit a to unit b (Rodrigues), as a function
  const v = cross(a, b), c = a[0] * b[0] + a[1] * b[1] + a[2] * b[2], s = Math.hypot(...v);
  if (s < 1e-9) return (p) => p.slice();
  const k = v.map((x) => x / s), th = Math.atan2(s, c), ct = Math.cos(th), st = Math.sin(th);
  return (p) => { const kd = k[0] * p[0] + k[1] * p[1] + k[2] * p[2], kx = cross(k, p); return [0, 1, 2].map((i) => p[i] * ct + kx[i] * st + k[i] * kd * (1 - ct)); };
}
const temples = {};
for (const gs of [1, -1]) {
  const h = place([HINGE.x, gs * HINGE.y, HINGE.z]), side = Math.sign(h[0]); // (her side the hinge is on)
  const e = ear[side], target = [side * (halfWidth(side, e.top + 0.003, e.front) + 0.0025), e.top + 0.003, e.front];
  const b0 = unit(placeDir([0, 0, END_Z - HINGE.z])), d = [target[0] - h[0], target[1] - h[1], target[2] - h[2]], L = Math.hypot(...d);
  temples[gs] = { hinge: h, end: target, Q: rotBetween(b0, unit(d)), lengthen: L / (S * Math.abs(END_Z - HINGE.z)), side };
}
const templeOf = (g) => (g[2] < -1 ? temples[Math.sign(g[1]) || 1] : null); // (the bars' ends and the tips beyond them)
function fit(g) {
  const t = templeOf(g);
  if (!t) return place(g);
  // offset from the bar's end, in her axes (unscaled lengthwise: the tip keeps its shape), turned with the temple
  const o = placeDir([(g[0] - HINGE.x) * S, (g[1] - Math.sign(g[1]) * HINGE.y) * S, (g[2] - END_Z) * S]), q = t.Q(o);
  return [t.end[0] + q[0], t.end[1] + q[1], t.end[2] + q[2]];
}

// ---- the parts, placed; normals from the placed triangles (their split vertices keep hard edges)
function normals(P, I) {
  const N = new Float64Array(P.length);
  for (let f = 0; f < I.length; f += 3) {
    const a = 3 * I[f], b = 3 * I[f + 1], c = 3 * I[f + 2], u = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], v = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]], n = cross(u, v);
    for (const p of [a, b, c]) for (let k = 0; k < 3; k++) N[p + k] += n[k];
  }
  for (let i = 0; i < N.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1; N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; }
  return N;
}
const MAT = { Metal: { kind: "metal", color: null }, Glass: { kind: "lens", color: null }, plastic: { kind: "plastic", color: null } };
const parts = [];
let minClear = Infinity, where = null;
const skinNear = (p) => { let best = Infinity; for (let v = 0; v < nv; v++) { const dx = X[3 * v] - p[0], dy = X[3 * v + 1] - p[1], dz = X[3 * v + 2] - p[2], d = dx * dx + dy * dy + dz * dz; if (d < best) best = d; } return Math.sqrt(best); };
for (const m of raw.meshes) {
  const G = m.positions, P = new Float64Array(G.length);
  for (let i = 0; i < G.length; i += 3) { const p = fit([G[i], G[i + 1], G[i + 2]]); P.set(p, i); }
  for (let i = 0; i < P.length; i += 9) { const c = skinNear([P[i], P[i + 1], P[i + 2]]); if (c < minClear) { minClear = c; where = [m.material, P[i], P[i + 1], P[i + 2]]; } }
  const N = normals(P, m.indices), rel = Float32Array.from(P, (x, i) => x - head[i % 3]);
  const pbr = m.pbr || {}, col = pbr.baseColorFactor || [1, 1, 1, 1];
  parts.push({ name: m.node, material: { name: m.material, kind: (MAT[m.material] || { kind: "plastic" }).kind, baseColor: col.slice(0, 3), alpha: col[3] ?? 1, roughness: pbr.roughnessFactor ?? 0.5, blend: m.alphaMode === "BLEND" },
    positions_f32_b64: Buffer.from(rel.buffer).toString("base64"), normals_f32_b64: Buffer.from(Float32Array.from(N).buffer).toString("base64"), indices_u32_b64: Buffer.from(Uint32Array.from(m.indices).buffer).toString("base64") });
}
const out = {
  schema: "lucid-moto.accessory.v1", status: "CANDIDATE", id: "lucid_sunglasses_v1", carriedBy: "Head",
  frame: "her master frame's axes (+y up, -z her front), metres, offsets from her rest Head joint",
  attribution: { title: raw.asset?.extras?.title, author: raw.asset?.extras?.author, license: raw.asset?.extras?.license, source: raw.asset?.extras?.source, changes: "converted to plain arrays; the backdrop plane and the light removed; scaled, placed and its temples opened and lengthened to fit her head (tools/character/fit-glasses.mjs)" },
  fit: { scale: S, tiltDeg: TILT * 180 / Math.PI, nasion: nasion.map((v) => +v.toFixed(4)), eyeY: +eyeY.toFixed(4), ears: ear, temples: Object.fromEntries(Object.entries(temples).map(([k, t]) => [k, { side: t.side, lengthen: +t.lengthen.toFixed(3), hinge: t.hinge.map((v) => +v.toFixed(4)), end: t.end.map((v) => +v.toFixed(4)) }])), minClearanceM: +minClear.toFixed(4), nearestPart: where?.[0] },
  parts,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(JSON.stringify({ ...out.fit, file: path.relative(ROOT, OUT), bytes: fs.statSync(OUT).size }));
