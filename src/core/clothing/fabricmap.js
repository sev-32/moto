// Fabric maps (LUCID MOTO, CANDIDATE): heatmaps painted on a garment - its tension, stretch,
// thickness, bend, skin friction, damping and drawn wrinkles - and creases pressed into it, baked to
// the clothing engine's fabric-field channels (the garment's per-vertex, per-edge and per-bend
// arrays the M26/R1 solver reads) as the lab's own authoring schema has it
// (`authoring.fabricMaps`, lucid.fabric.authoring.v1: paint on the garment's 2D panels, bake to
// per-vertex / per-edge arrays; the runtime samples the baked arrays without touching the character
// files). The lab's painted maps are not in the handoff, only their bake; a map here multiplies it.
// Shared by the game (bundled: src/core/47_rider_wardrobe.js, the fabric lab 49_fabric_lab.js) and
// the Node tools (tools/clothing/fabric-map.mjs).
//
// A map (`lucid-moto.fabric-map.v1`):
//   channels - per shell vertex of the garment;
//   creases  - strokes, each with a width and a depth: denim's set creases (whiskers at the lap,
//              honeycombs behind the knees, stacking at the hem).
// Painted on the garment's flats: its front and its back seen square on (x, y of its rest frame: +x
// her left, +y up), as a designer draws a pair of jeans - not on its UV layout, whose panels overlap
// at the crotch (a stroke there lands on the wrong piece). A stroke lies on the garment's front or
// back surface under it.
// Baked:
//   tension   -> edge rest scale (each edge: its ends' mean; < 1 the fabric is cut tighter there)
//   stretch   -> vertex stretch scale (stretch stiffness)   thickness -> vertex thickness scale
//   bend      -> vertex bend scale                           friction  -> skin friction (both)
//   damping   -> vertex damping scale                        wrinkle   -> wrinkle amplitude (drawn)
//   creases   -> the bends whose hinge runs along a crease, near it: their rest length shorter (the
//                cloth is pre-folded there, as a set crease is) and their bend stiffness lower (a
//                worn hinge); and the crease bias channel. The mesh is coarse (2-3 cm triangles):
//                the physics carries a crease as a fold line; the drawn crease (its relief and the
//                fading on its ridge) is the shader's, from the strokes themselves.

export const CHANNELS = {
  tension: { def: 1, min: 0.85, max: 1.15, label: "tension: cut tighter (< 1) or looser (> 1)" },
  stretch: { def: 1, min: 0.45, max: 2.5, label: "stretch stiffness" },
  thickness: { def: 1, min: 0.5, max: 2.5, label: "thickness (contact and drawn)" },
  bend: { def: 1, min: 0.35, max: 3, label: "bend stiffness" },
  friction: { def: 1, min: 0.5, max: 1.6, label: "skin friction" },
  damping: { def: 1, min: 0.5, max: 2, label: "damping" },
  wrinkle: { def: 1, min: 0, max: 3, label: "wrinkle amplitude (drawn)" },
};
export const SCHEMA = "lucid-moto.fabric-map.v1";

// ---------------------------------------------------------------- the garment's panels
// its shell: rest positions, UVs, triangles, each vertex's UV tangent frame (dP/du, dP/dv), and the
// hinge (shared edge) of each bend
export function garmentGeometry(asset) {
  const n = asset.meta?.shellVertexCount ?? asset.positions.length / 3, P = asset.positions, U = asset.uvs, I = asset.indices;
  if (!U || U.length < 2 * n) throw Error("fabric map: the garment has no UV layout");
  const tris = []; for (let f = 0; f < I.length; f += 3) if (I[f] < n && I[f + 1] < n && I[f + 2] < n) tris.push(I[f], I[f + 1], I[f + 2]);
  const T = new Float64Array(3 * n), B = new Float64Array(3 * n);
  for (let f = 0; f < tris.length; f += 3) {
    const a = tris[f], b = tris[f + 1], c = tris[f + 2];
    const e1 = [0, 1, 2].map((k) => P[3 * b + k] - P[3 * a + k]), e2 = [0, 1, 2].map((k) => P[3 * c + k] - P[3 * a + k]);
    const du1 = U[2 * b] - U[2 * a], dv1 = U[2 * b + 1] - U[2 * a + 1], du2 = U[2 * c] - U[2 * a], dv2 = U[2 * c + 1] - U[2 * a + 1], det = du1 * dv2 - du2 * dv1;
    if (Math.abs(det) < 1e-12) continue;
    const r = 1 / det;
    for (const v of [a, b, c]) for (let k = 0; k < 3; k++) { T[3 * v + k] += (e1[k] * dv2 - e2[k] * dv1) * r; B[3 * v + k] += (e2[k] * du1 - e1[k] * du2) * r; }
  }
  // (metres per UV unit at each vertex, along u and v: the panels' scale)
  const su = new Float64Array(n), sv = new Float64Array(n);
  for (let v = 0; v < n; v++) {
    const t = Math.hypot(T[3 * v], T[3 * v + 1], T[3 * v + 2]) || 1, b = Math.hypot(B[3 * v], B[3 * v + 1], B[3 * v + 2]) || 1;
    for (let k = 0; k < 3; k++) { T[3 * v + k] /= t; B[3 * v + k] /= b; }
    su[v] = t; sv[v] = b;
  }
  // bends' hinges: across each interior edge, the two vertices facing each other
  const K = (a, b) => (a < b ? a * 1048576 + b : b * 1048576 + a), opp = new Map(), hinge = new Map();
  for (let f = 0; f < I.length; f += 3) for (let k = 0; k < 3; k++) { const a = I[f + k], b = I[f + (k + 1) % 3], o = I[f + (k + 2) % 3], key = K(a, b); (opp.get(key) || opp.set(key, []).get(key)).push(o); }
  for (const [key, os] of opp) if (os.length === 2) hinge.set(K(os[0], os[1]), [Math.floor(key / 1048576), key % 1048576]);
  // a grid over the UV layout, for finding the triangle under a point of a panel
  const G = 32, grid = Array.from({ length: G * G }, () => []);
  for (let f = 0; f < tris.length; f += 3) {
    let u0 = 1, u1 = 0, v0 = 1, v1 = 0;
    for (let k = 0; k < 3; k++) { const v = tris[f + k]; u0 = Math.min(u0, U[2 * v]); u1 = Math.max(u1, U[2 * v]); v0 = Math.min(v0, U[2 * v + 1]); v1 = Math.max(v1, U[2 * v + 1]); }
    for (let gx = Math.max(0, Math.floor(u0 * G)); gx <= Math.min(G - 1, Math.floor(u1 * G)); gx++) for (let gy = Math.max(0, Math.floor(v0 * G)); gy <= Math.min(G - 1, Math.floor(v1 * G)); gy++) grid[gy * G + gx].push(f);
  }
  return { n, P, U, tris: Uint32Array.from(tris), T, B, su, sv, hinge, K, grid, G };
}

// the point of the garment under a point (u, v) of its panels: { f, w: barycentrics, p: rest position } or null
export function uvToRest(geo, u, v) {
  const { U, P, tris, grid, G } = geo, cell = grid[Math.min(G - 1, Math.max(0, Math.floor(v * G))) * G + Math.min(G - 1, Math.max(0, Math.floor(u * G)))];
  for (const f of cell) {
    const a = tris[f], b = tris[f + 1], c = tris[f + 2];
    const x1 = U[2 * a], y1 = U[2 * a + 1], x2 = U[2 * b], y2 = U[2 * b + 1], x3 = U[2 * c], y3 = U[2 * c + 1];
    const d = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3); if (Math.abs(d) < 1e-14) continue;
    const l1 = ((y2 - y3) * (u - x3) + (x3 - x2) * (v - y3)) / d, l2 = ((y3 - y1) * (u - x3) + (x1 - x3) * (v - y3)) / d, l3 = 1 - l1 - l2;
    if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
    return { f, w: [l1, l2, l3], p: [0, 1, 2].map((k) => l1 * P[3 * a + k] + l2 * P[3 * b + k] + l3 * P[3 * c + k]) };
  }
  return null;
}
// a point near the garment (its rest frame) to its panels: the closest triangle's (u, v)
export function restToUV(geo, p) {
  const { P, U, tris } = geo;
  let best = Infinity, out = null;
  for (let f = 0; f < tris.length; f += 3) {
    const a = 3 * tris[f], b = 3 * tris[f + 1], c = 3 * tris[f + 2];
    const cx = (P[a] + P[b] + P[c]) / 3 - p[0], cy = (P[a + 1] + P[b + 1] + P[c + 1]) / 3 - p[1], cz = (P[a + 2] + P[b + 2] + P[c + 2]) / 3 - p[2], d = cx * cx + cy * cy + cz * cz;
    if (d < best) { best = d; out = f; }
  }
  if (out == null) return null;
  // (barycentrics of p projected on that triangle, clamped into it)
  const ia = tris[out], ib = tris[out + 1], ic = tris[out + 2], A = [0, 1, 2].map((k) => P[3 * ia + k]), e1 = [0, 1, 2].map((k) => P[3 * ib + k] - A[k]), e2 = [0, 1, 2].map((k) => P[3 * ic + k] - A[k]), q = [0, 1, 2].map((k) => p[k] - A[k]);
  const d11 = e1[0] * e1[0] + e1[1] * e1[1] + e1[2] * e1[2], d12 = e1[0] * e2[0] + e1[1] * e2[1] + e1[2] * e2[2], d22 = e2[0] * e2[0] + e2[1] * e2[1] + e2[2] * e2[2];
  const q1 = q[0] * e1[0] + q[1] * e1[1] + q[2] * e1[2], q2 = q[0] * e2[0] + q[1] * e2[1] + q[2] * e2[2], den = d11 * d22 - d12 * d12 || 1;
  let s = (d22 * q1 - d12 * q2) / den, t = (d11 * q2 - d12 * q1) / den;
  s = Math.max(0, s); t = Math.max(0, t); const sum = s + t; if (sum > 1) { s /= sum; t /= sum; }
  return [U[2 * ia] * (1 - s - t) + U[2 * ib] * s + U[2 * ic] * t, U[2 * ia + 1] * (1 - s - t) + U[2 * ib + 1] * s + U[2 * ic + 1] * t];
}

// ---------------------------------------------------------------- maps
export function blankMap(asset, garment = "jeans") {
  const n = asset.meta?.shellVertexCount ?? asset.positions.length / 3, channels = {};
  for (const [k, c] of Object.entries(CHANNELS)) channels[k] = new Float32Array(n).fill(c.def);
  return { schema: SCHEMA, garment, vertices: n, channels, creases: [], creaseDepth: 0.08 };
}
const toB64 = (a) => { const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength); if (typeof Buffer !== "undefined") return Buffer.from(u).toString("base64"); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = (s) => { let u; if (typeof Buffer !== "undefined") { const b = Buffer.from(s, "base64"); u = new Uint8Array(b.buffer, b.byteOffset, b.byteLength); } else { const r = atob(s); u = new Uint8Array(r.length); for (let i = 0; i < r.length; i++) u[i] = r.charCodeAt(i); } return new Float32Array(u.slice().buffer); };
// (only the channels painted away from their default are written)
export function encodeMap(map, meta = {}) {
  const channels = {};
  for (const [k, a] of Object.entries(map.channels)) if (a.some((x) => Math.abs(x - CHANNELS[k].def) > 1e-6)) channels[k] = toB64(a);
  return { schema: SCHEMA, status: "CANDIDATE", ...meta, garment: map.garment, vertices: map.vertices, creaseDepth: map.creaseDepth, channels_f32_b64: channels, creases: map.creases.map((c) => ({ ...c, xy: c.xy.map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)]) })) };
}
export function decodeMap(json, asset) {
  const d = typeof json === "string" ? JSON.parse(json) : json;
  if (d.schema !== SCHEMA) throw Error(`fabric map: schema ${d.schema}`);
  const m = blankMap(asset, d.garment);
  if (d.vertices !== m.vertices) throw Error(`fabric map: ${d.vertices} vertices for a garment of ${m.vertices}`);
  for (const [k, s] of Object.entries(d.channels_f32_b64 || {})) if (m.channels[k]) { const a = fromB64(s); if (a.length !== m.vertices) throw Error(`fabric map ${k}: ${a.length}`); m.channels[k] = a; }
  m.creases = (d.creases || []).map((c) => ({ name: c.name || "", side: c.side < 0 ? -1 : 1, xy: c.xy.map((p) => [+p[0], +p[1]]), widthM: +c.widthM || 0.006, depth: Math.max(0, Math.min(1, +c.depth || 0)) }));
  m.creaseDepth = d.creaseDepth ?? 0.08;
  m.meta = { name: d.name, notes: d.notes };
  return m;
}

// ---------------------------------------------------------------- the flats
// the garment's surface under a point (x, y) of its front (side +1) or back (-1) flat: its rest
// position there (the triangle nearest the viewer that covers it), or null
export function flatToRest(geo, x, y, side) {
  const { P, tris } = geo, grid = geo.flatGrid || (geo.flatGrid = flatGrid(geo));
  const cell = grid.cells[grid.at(x, y)] || [];
  let best = null, bz = -Infinity;
  for (const f of cell) {
    const a = 3 * tris[f], b = 3 * tris[f + 1], c = 3 * tris[f + 2];
    const x1 = P[a], y1 = P[a + 1], x2 = P[b], y2 = P[b + 1], x3 = P[c], y3 = P[c + 1];
    const d = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3); if (Math.abs(d) < 1e-14) continue;
    const l1 = ((y2 - y3) * (x - x3) + (x3 - x2) * (y - y3)) / d, l2 = ((y3 - y1) * (x - x3) + (x1 - x3) * (y - y3)) / d, l3 = 1 - l1 - l2;
    if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
    const z = l1 * P[a + 2] + l2 * P[b + 2] + l3 * P[c + 2];
    if (z * side > bz) { bz = z * side; best = [x, y, z]; }
  }
  return best;
}
function flatGrid(geo) {
  const { P, tris } = geo, G = 64;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let v = 0; v < geo.n; v++) { x0 = Math.min(x0, P[3 * v]); x1 = Math.max(x1, P[3 * v]); y0 = Math.min(y0, P[3 * v + 1]); y1 = Math.max(y1, P[3 * v + 1]); }
  const sx = (x1 - x0) / G || 1, sy = (y1 - y0) / G || 1, at = (x, y) => Math.min(G - 1, Math.max(0, Math.floor((y - y0) / sy))) * G + Math.min(G - 1, Math.max(0, Math.floor((x - x0) / sx)));
  const cells = Array.from({ length: G * G }, () => []);
  for (let f = 0; f < tris.length; f += 3) {
    const xs = [0, 1, 2].map((k) => P[3 * tris[f + k]]), ys = [0, 1, 2].map((k) => P[3 * tris[f + k] + 1]);
    const gx0 = Math.max(0, Math.floor((Math.min(...xs) - x0) / sx)), gx1 = Math.min(G - 1, Math.floor((Math.max(...xs) - x0) / sx)), gy0 = Math.max(0, Math.floor((Math.min(...ys) - y0) / sy)), gy1 = Math.min(G - 1, Math.floor((Math.max(...ys) - y0) / sy));
    for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) cells[gy * G + gx].push(f);
  }
  return { cells, at, bounds: [x0, x1, y0, y1] };
}
export const flatBounds = (geo) => (geo.flatGrid || (geo.flatGrid = flatGrid(geo))).bounds;
// which flat each vertex is seen on: +1 its front, -1 its back (by its normal at rest)
export function vertexSides(geo) {
  const { n, P, tris } = geo, nz = new Float64Array(n);
  for (let f = 0; f < tris.length; f += 3) {
    const a = 3 * tris[f], b = 3 * tris[f + 1], c = 3 * tris[f + 2];
    nz[tris[f]] += (P[b] - P[a]) * (P[c + 1] - P[a + 1]) - (P[b + 1] - P[a + 1]) * (P[c] - P[a]);
    nz[tris[f + 1]] += (P[b] - P[a]) * (P[c + 1] - P[a + 1]) - (P[b + 1] - P[a + 1]) * (P[c] - P[a]);
    nz[tris[f + 2]] += (P[b] - P[a]) * (P[c + 1] - P[a + 1]) - (P[b + 1] - P[a + 1]) * (P[c] - P[a]);
  }
  return Int8Array.from(nz, (z, v) => (z >= 0 ? 1 : -1) * (geo.outward || 1));
}

// ---------------------------------------------------------------- creases
// each stroke on the garment (its rest frame): a polyline sampled every 5 mm on the flat, laid on the
// garment's surface on that side; its width and depth
export function creasePolylines(geo, map) {
  const out = [];
  for (const c of map.creases) {
    const pts = [];
    for (let i = 0; i + 1 < c.xy.length; i++) {
      const [x0, y0] = c.xy[i], [x1, y1] = c.xy[i + 1], steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.005));
      for (let s = 0; s <= steps; s++) { if (i > 0 && s === 0) continue; const t = s / steps, p = flatToRest(geo, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, c.side); if (p) pts.push(p); }
    }
    if (pts.length >= 2) out.push({ name: c.name, side: c.side, pts, widthM: c.widthM, depth: c.depth });
  }
  return out;
}
// per vertex: how strongly a crease runs there (0..1), and along which way (its rest frame); `reachM`
// how far from the line the coarse mesh's fold reaches (about an edge)
export function creaseField(geo, lines, { reachM = 0.02 } = {}) {
  const { n, P } = geo, s = new Float32Array(n), dir = new Float32Array(3 * n);
  for (const L of lines) {
    const w = Math.max(L.widthM, reachM);
    for (let v = 0; v < n; v++) {
      const p = [P[3 * v], P[3 * v + 1], P[3 * v + 2]];
      let best = Infinity, bd = null;
      for (let i = 0; i + 1 < L.pts.length; i++) {
        const a = L.pts[i], b = L.pts[i + 1], ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1e-12;
        const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / l2)), d = Math.hypot(p[0] - a[0] - ab[0] * t, p[1] - a[1] - ab[1] * t, p[2] - a[2] - ab[2] * t);
        if (d < best) { best = d; bd = ab; }
      }
      const k = L.depth * Math.exp(-((best / w) ** 2));
      if (k > s[v]) { s[v] = k; const l = Math.hypot(...bd) || 1; dir[3 * v] = bd[0] / l; dir[3 * v + 1] = bd[1] / l; dir[3 * v + 2] = bd[2] / l; }
    }
  }
  return { strength: s, dir };
}

// ---------------------------------------------------------------- the bake
// into a decoded garment asset (garmentAsset.js's decodeGarmentAsset), before the engine is built on
// it: its own fabric-field arrays multiplied by the map's (made where the asset has none)
export function bakeFabric(asset, map, { reachM = 0.02 } = {}) {
  const geo = garmentGeometry(asset), { n } = geo, C = map.channels, E = asset.edges, Bd = asset.bends;
  const nv = asset.positions.length / 3, ne = E.length / 2, nb = Bd.length / 2;
  const ensure = (key, len, def) => (asset[key] && asset[key].length === len ? asset[key] : (asset[key] = new Float32Array(len).fill(def)));
  const vmul = (key, ch) => { const a = ensure(key, nv, 1); for (let v = 0; v < n; v++) a[v] *= C[ch][v]; };
  vmul("vertexStretchScale", "stretch"); vmul("vertexThicknessScale", "thickness"); vmul("vertexBendScale", "bend");
  vmul("vertexSkinFrictionStatic", "friction"); vmul("vertexSkinFrictionDynamic", "friction"); vmul("vertexDampingScale", "damping");
  vmul("vertexWrinkleAmplitude", "wrinkle");
  // (the skin friction channels are the friction coefficients themselves where the lab baked them)
  const er = ensure("edgeRestScale", ne, 1);
  for (let k = 0; k < ne; k++) { const a = E[2 * k], b = E[2 * k + 1]; if (a < n && b < n) er[k] *= 0.5 * (C.tension[a] + C.tension[b]); }
  // creases: the bends whose hinge runs along a crease line, near it
  const lines = creasePolylines(geo, map), field = creaseField(geo, lines, { reachM });
  const br = ensure("bendRestScale", nb, 1), bs = ensure("bendStiffnessScale", nb, 1), cb = ensure("vertexCreaseBias", nv, 1);
  let folded = 0;
  for (let k = 0; k < nb; k++) {
    const o1 = Bd[2 * k], o2 = Bd[2 * k + 1], h = geo.hinge.get(geo.K(o1, o2));
    if (!h || h[0] >= n || h[1] >= n) continue;
    const [a, b] = h, c = 0.5 * (field.strength[a] + field.strength[b]); if (c < 1e-3) continue;
    const P = asset.positions, hx = P[3 * b] - P[3 * a], hy = P[3 * b + 1] - P[3 * a + 1], hz = P[3 * b + 2] - P[3 * a + 2], hl = Math.hypot(hx, hy, hz) || 1;
    const d = [field.dir[3 * a] + field.dir[3 * b], field.dir[3 * a + 1] + field.dir[3 * b + 1], field.dir[3 * a + 2] + field.dir[3 * b + 2]], dl = Math.hypot(...d) || 1;
    const al = ((hx * d[0] + hy * d[1] + hz * d[2]) / (hl * dl)) ** 2, f = c * al; if (f < 1e-3) continue;
    br[k] *= 1 - map.creaseDepth * f; bs[k] *= 1 - 0.5 * f; folded++;
  }
  for (let v = 0; v < n; v++) cb[v] *= 1 - 0.06 * field.strength[v];
  return { folded, creaseLines: lines.length, creasedVertices: Array.from(field.strength).filter((x) => x > 0.05).length, lines };
}

// ---------------------------------------------------------------- denim, worn: the default creases
// Set creases of a pair of jeans worn a while, as lines on her rest body (engine frame: +y up, +z her
// front, +x her left), turned into strokes on the garment's panels: whiskers fanning from the crotch
// to the hips across the lap, honeycombs behind the knees, a crease across the front of each knee,
// stacking above the hems. Positions from her joints (hips, knees, ankles). CANDIDATE.
export function denimCreases(asset, { hip = [0.0885, 0.8775], knee = [0.08, 0.464], hemY = 0.136 } = {}) {
  const out = [], L = (sx) => (sx > 0 ? "L" : "R");
  for (const sx of [1, -1]) {
    // whiskers: from beside the crotch out and up towards the hip, a fan of five across the lap
    for (let i = 0; i < 5; i++) {
      const y0 = hip[1] - 0.085 - 0.013 * i, x0 = sx * (0.03 + 0.004 * i), x1 = sx * (0.125 + 0.008 * i), y1 = y0 + 0.04 - 0.005 * i;
      out.push({ name: `whisker ${L(sx)}${i + 1}`, side: 1, xy: [[x0, y0], [(x0 + x1) / 2, y0 + 0.024 - 0.003 * i], [x1, y1]], widthM: 0.005, depth: 0.85 - 0.1 * i });
    }
    // honeycombs: behind the knee, three shallow V's
    for (let i = 0; i < 3; i++) {
      const y = knee[1] + 0.012 + 0.022 * i, xc = sx * knee[0];
      out.push({ name: `honeycomb ${L(sx)}${i + 1}`, side: -1, xy: [[xc - 0.045, y + 0.008], [xc, y - 0.004], [xc + 0.045, y + 0.008]], widthM: 0.006, depth: 0.8 - 0.15 * i });
    }
    // the front of the knee: one crease across it
    out.push({ name: `knee ${L(sx)}`, side: 1, xy: [[sx * knee[0] - 0.05, knee[1] + 0.035], [sx * knee[0] + 0.05, knee[1] + 0.03]], widthM: 0.007, depth: 0.5 });
    // stacking: two rings' worth above the hem, front and back
    for (const side of [1, -1]) for (let i = 0; i < 2; i++) {
      const y = hemY + 0.035 + 0.03 * i, xc = sx * 0.075;
      out.push({ name: `stack ${L(sx)}${side > 0 ? "f" : "b"}${i + 1}`, side, xy: [[xc - 0.05, y], [xc, y + 0.006 * side], [xc + 0.05, y]], widthM: 0.006, depth: 0.55 - 0.15 * i });
    }
  }
  return out;
}
