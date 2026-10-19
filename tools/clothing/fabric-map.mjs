#!/usr/bin/env node
// Her jeans' fabric map (src/core/clothing/fabricmap.js): the default one the game wears - worn
// denim's set creases (whiskers, honeycombs, the knee, stacking) as strokes on the jeans' flats -
// and a picture of a map: the flats (front, and back seen from behind) coloured by a channel, the
// creases drawn.
//
//   node tools/clothing/fabric-map.mjs                      -> assets/character/clothing/lucid_moto_jeans_fabric_v1.json
//   node tools/clothing/fabric-map.mjs --png FILE [--map FILE] [--channel tension] [--size 360]
//   node tools/clothing/fabric-map.mjs --bake [--map FILE]  (what the bake changes: folded bends, creased points)
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { ROOT, read, mods, character } from "./engine.mjs";

const { blankMap, encodeMap, decodeMap, denimCreases, bakeFabric, garmentGeometry, flatBounds, CHANNELS } = await import(path.join(ROOT, "src/core/clothing/fabricmap.js"));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); return i < 0 ? d : args[i + 1]; };
const CLOTHING = path.join(ROOT, "assets/character/clothing"), DEFAULT = path.join(CLOTHING, "lucid_moto_jeans_fabric_v1.json");
const jeans = () => mods.decodeGarmentAsset(read(path.join(CLOTHING, "lucid_human_native_jeans_v1.json")));

// her joints in the engine frame (the creases' landmarks)
function landmarks() {
  const ch = character(), J = (nm) => { const v = ch.joints.rest[ch.joints.names.indexOf(nm)]; return [-v[0], v[1], -v[2]]; };
  const h = J("L_Thigh"), k = J("L_Calf");
  return { hip: [Math.abs(h[0]), h[1]], knee: [Math.abs(k[0]), k[1]] };
}

// a PNG of RGB pixels (no dependencies)
function png(w, h, rgb) {
  const crc = (b) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4); d.copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, 8 + d.length)), 8 + d.length); return b; };
  const raw = Buffer.alloc((3 * w + 1) * h); for (let y = 0; y < h; y++) { raw[y * (3 * w + 1)] = 0; Buffer.from(rgb.buffer, rgb.byteOffset + y * 3 * w, 3 * w).copy(raw, y * (3 * w + 1) + 1); }
  const hdr = Buffer.alloc(13); hdr.writeUInt32BE(w, 0); hdr.writeUInt32BE(h, 4); hdr[8] = 8; hdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", hdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
// the heat ramp: low (blue) - default (grey) - high (red)
export function heat(t) { const c = Math.max(-1, Math.min(1, t)), lo = [0.15, 0.35, 0.95], mid = [0.55, 0.55, 0.55], hi = [0.95, 0.25, 0.15], e = c < 0 ? lo : hi, a = Math.abs(c); return mid.map((m, k) => m + (e[k] - m) * a); }
// the flats: the garment's front (left) and back (right, seen from behind) square on, coloured by
// a channel (blue below its default, red above), its creases drawn over them in yellow
function picture(asset, map, channel, W) {
  const geo = garmentGeometry(asset), { P, tris } = geo, [x0, x1, y0, y1] = flatBounds(geo), sc = (W - 20) / (x1 - x0), H = Math.ceil((y1 - y0) * sc) + 20;
  const img = new Uint8Array(2 * W * H * 3).fill(18), zb = new Float32Array(2 * W * H).fill(-Infinity), C = map.channels[channel], spec = CHANNELS[channel];
  const val = (v) => { const x = C[v]; return x >= spec.def ? (x - spec.def) / (spec.max - spec.def || 1) : -(spec.def - x) / (spec.def - spec.min || 1); };
  const px = (x, y, side) => [side > 0 ? 10 + (x - x0) * sc : W + 10 + (x1 - x) * sc, 10 + (y1 - y) * sc];
  for (const side of [1, -1]) for (let f = 0; f < tris.length; f += 3) {
    const vs = [tris[f], tris[f + 1], tris[f + 2]], Q = vs.map((v) => px(P[3 * v], P[3 * v + 1], side)), Z = vs.map((v) => P[3 * v + 2] * side), c = vs.map((v) => heat(val(v)));
    const X = Q.map((q) => q[0]), Y = Q.map((q) => q[1]), d = (Y[1] - Y[2]) * (X[0] - X[2]) + (X[2] - X[1]) * (Y[0] - Y[2]); if (Math.abs(d) < 1e-9) continue;
    // (lit by its facing: the flats read as a shape)
    const a = 3 * vs[0], b = 3 * vs[1], cc = 3 * vs[2], nz = ((P[b] - P[a]) * (P[cc + 1] - P[a + 1]) - (P[b + 1] - P[a + 1]) * (P[cc] - P[a])) * side, nl = Math.hypot((P[b + 1] - P[a + 1]) * (P[cc + 2] - P[a + 2]) - (P[b + 2] - P[a + 2]) * (P[cc + 1] - P[a + 1]), (P[b + 2] - P[a + 2]) * (P[cc] - P[a]) - (P[b] - P[a]) * (P[cc + 2] - P[a + 2]), nz) || 1, lit = 0.55 + 0.45 * Math.abs(nz / nl);
    for (let y = Math.max(0, Math.floor(Math.min(...Y))); y <= Math.min(H - 1, Math.ceil(Math.max(...Y))); y++) for (let x = Math.max(0, Math.floor(Math.min(...X))); x <= Math.min(2 * W - 1, Math.ceil(Math.max(...X))); x++) {
      const l1 = ((Y[1] - Y[2]) * (x - X[2]) + (X[2] - X[1]) * (y - Y[2])) / d, l2 = ((Y[2] - Y[0]) * (x - X[2]) + (X[0] - X[2]) * (y - Y[2])) / d, l3 = 1 - l1 - l2;
      if (l1 < -0.01 || l2 < -0.01 || l3 < -0.01) continue;
      const z = l1 * Z[0] + l2 * Z[1] + l3 * Z[2], k = y * 2 * W + x; if (z <= zb[k]) continue; zb[k] = z;
      for (let q = 0; q < 3; q++) img[3 * k + q] = Math.round(255 * lit * (l1 * c[0][q] + l2 * c[1][q] + l3 * c[2][q]));
    }
  }
  for (const cr of map.creases) for (let i = 0; i + 1 < cr.xy.length; i++) {
    const [a0, b0] = px(...cr.xy[i], cr.side), [a1, b1] = px(...cr.xy[i + 1], cr.side), steps = Math.ceil(Math.hypot(a1 - a0, b1 - b0) * 2) + 1, r = 1 + Math.round(1.5 * cr.depth);
    for (let s = 0; s <= steps; s++) { const t = s / steps, x = Math.round(a0 + (a1 - a0) * t), y = Math.round(b0 + (b1 - b0) * t); for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (dx * dx + dy * dy > r * r) continue; const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= 2 * W || Y >= H) continue; const o = 3 * (Y * 2 * W + X); img[o] = 250; img[o + 1] = 225; img[o + 2] = 90; } }
  }
  return png(2 * W, H, img);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const asset = jeans();
  if (args.includes("--png") || args.includes("--bake")) {
    const map = decodeMap(read(path.resolve(opt("map", DEFAULT))), asset);
    if (args.includes("--bake")) { const r = bakeFabric(asset, map); delete r.lines; console.log(JSON.stringify(r)); }
    if (args.includes("--png")) { const S = Number(opt("size", 360)), file = path.resolve(opt("png")); fs.writeFileSync(file, picture(asset, map, opt("channel", "tension"), S)); console.log("wrote", file); }
  } else {
    const map = blankMap(asset, "jeans");
    map.creases = denimCreases(asset, landmarks());
    const out = encodeMap(map, { name: "lucid_moto_jeans_fabric_v1", notes: "Worn denim's set creases (whiskers at the lap, honeycombs behind the knees, a crease across each knee, stacking above the hems) as strokes on the jeans' flats (their front and back, x and y of their rest frame); other channels at their defaults (the lab's own bake). Made by tools/clothing/fabric-map.mjs; painted further in the game's fabric lab." });
    fs.writeFileSync(DEFAULT, JSON.stringify(out));
    console.log(JSON.stringify({ creases: map.creases.length, file: path.relative(ROOT, DEFAULT) }));
  }
}
