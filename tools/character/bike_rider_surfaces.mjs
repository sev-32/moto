// Bike surfaces the rider physically touches, from the actual Ducati 916 GLB.
//
//   node tools/character/bike_rider_surfaces.mjs
//     -> assets/bike/ducati916_rider_surfaces.json
//
// * signed distance field (2 cm nodes, mm, int8) of the chassis-fixed envelope (tank, seat, tail,
//   fairings, screen, frame, engine, exhaust...) around the rider zone, outside positive; see
//   "envelope solid" below. Excluded: parts that move relative to the chassis (steering assembly,
//   wheels, swingarm, shock, chain) and the footpeg mesh (the pegs are exact cylinders).
// * footpegs: cylinders fitted to the peg mesh (ChassisControlHardware_22) and its mirror
// * grips: the V1.28.5.1 mesh-derived grip cylinders (PCA of the BlackRubber vertices), read
//   from the legacy contact authority (src/legacy/21_rider_contacts_v12851.js)
// Frame: V5 body coordinates (X right, Y forward, Z up) about the V5 body origin at the neutral
// pose, i.e. the V1.28.5.1 rootMap applied to the GLB minus the neutral origin [0, 0, 0.64].
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const GLB = path.join(ROOT, "assets/models/ducati916.glb");
const LEGACY = path.join(ROOT, "src/legacy/21_rider_contacts_v12851.js");
const OUT = path.join(ROOT, "assets/bike/ducati916_rider_surfaces.json");
const NEUTRAL_ORIGIN = [0, 0, 0.64]; // V1.28.5.2 neutralV5BodyOriginM
const CELL = 0.02, LO = [-0.36, -1.06, -0.56], HI = [0.36, 0.86, 0.52], CLAMP_MM = [-60, 120];

const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const buf = fs.readFileSync(GLB), legacySrc = fs.readFileSync(LEGACY, "utf8");
const jl = buf.readUInt32LE(12), J = JSON.parse(buf.slice(20, 20 + jl).toString()), BIN = 20 + jl + 8;

// ------------------------------------------------------------------ legacy contact authority (rootMap, affordances)
function legacyConst(name) {
  // the legacy script declares its authorities as single-line JSON literals: const NAME={...};
  const line = legacySrc.split("\n").find((l) => l.startsWith(`const ${name}=`));
  if (!line) throw Error("legacy authority missing: " + name);
  return JSON.parse(line.slice(line.indexOf("=") + 1).replace(/;\s*$/, ""));
}
function findDeep(o, k) {
  if (!o || typeof o !== "object") return null;
  if (k in o) return o[k];
  for (const v of Object.values(o)) { const r = findDeep(v, k); if (r) return r; }
  return null;
}
const CONTACTS = legacyConst("AFF");
const rootMap = findDeep(CONTACTS, "rootMap");
if (!Array.isArray(rootMap) || rootMap.length !== 16) throw Error("rootMap not found in the legacy contact authority");
const AFF = findDeep(CONTACTS, "affordances");
const toBody = ([x, y, z]) => {
  const m = rootMap; // column-major
  return [m[0] * x + m[4] * y + m[8] * z + m[12] - NEUTRAL_ORIGIN[0], m[1] * x + m[5] * y + m[9] * z + m[13] - NEUTRAL_ORIGIN[1], m[2] * x + m[6] * y + m[10] * z + m[14] - NEUTRAL_ORIGIN[2]];
};
const affBody = (p) => [p[0] - NEUTRAL_ORIGIN[0], p[1] - NEUTRAL_ORIGIN[1], p[2] - NEUTRAL_ORIGIN[2]];

// ------------------------------------------------------------------ GLB scene graph
const parent = {};
J.nodes.forEach((n, i) => (n.children || []).forEach((c) => (parent[c] = i)));
function local(n) {
  if (n.matrix) return n.matrix;
  const t = n.translation || [0, 0, 0], r = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1], [x, y, z, w] = r;
  const R = [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)];
  return [R[0] * s[0], R[1] * s[0], R[2] * s[0], 0, R[3] * s[1], R[4] * s[1], R[5] * s[1], 0, R[6] * s[2], R[7] * s[2], R[8] * s[2], 0, t[0], t[1], t[2], 1];
}
const mul4 = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
function worldOf(i) { let M = local(J.nodes[i]); for (let p = parent[i]; p != null; p = parent[p]) M = mul4(local(J.nodes[p]), M); return M; }
const ancestors = (i) => { const a = []; for (let p = parent[i]; p != null; p = parent[p]) a.push(J.nodes[p].name); return a; };
const xf = (M, v) => [0, 1, 2].map((r) => M[r] * v[0] + M[4 + r] * v[1] + M[8 + r] * v[2] + M[12 + r]);
function accessor(ai) {
  const a = J.accessors[ai], bv = J.bufferViews[a.bufferView], off = BIN + (bv.byteOffset || 0) + (a.byteOffset || 0);
  const nc = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type], size = { 5126: 4, 5125: 4, 5123: 2, 5121: 1 }[a.componentType], st = bv.byteStride || nc * size;
  const rd = { 5126: (o) => buf.readFloatLE(o), 5125: (o) => buf.readUInt32LE(o), 5123: (o) => buf.readUInt16LE(o), 5121: (o) => buf.readUInt8(o) }[a.componentType];
  const out = [];
  for (let k = 0; k < a.count; k++) { const e = []; for (let c = 0; c < nc; c++) e.push(rd(off + k * st + c * size)); out.push(nc === 1 ? e[0] : e); }
  return out;
}
const MOVING = /SteeringPivot|SwingarmPivot|FrontWheelSpin|RearWheelSpin|RearShockAssembly/;
const EXCLUDE = /^(DriveChain|ChassisControlHardware_22)$/; // chain moves; the peg is an exact cylinder
const tris = [], used = [];
const pegVerts = [];
J.nodes.forEach((n, i) => {
  if (n.mesh == null) return;
  const M = worldOf(i);
  if (n.name === "ChassisControlHardware_22") {
    for (const p of J.meshes[n.mesh].primitives) pegVerts.push(...accessor(p.attributes.POSITION).map((v) => toBody(xf(M, v))));
    return;
  }
  if (ancestors(i).some((a) => MOVING.test(a)) || EXCLUDE.test(n.name)) return;
  let count = 0;
  for (const p of J.meshes[n.mesh].primitives) {
    if ((p.mode ?? 4) !== 4) continue;
    const P = accessor(p.attributes.POSITION).map((v) => toBody(xf(M, v)));
    const I = p.indices != null ? accessor(p.indices) : P.map((_, k) => k);
    for (let k = 0; k + 2 < I.length; k += 3) {
      const a = P[I[k]], b = P[I[k + 1]], c = P[I[k + 2]];
      const lo = [0, 1, 2].map((d) => Math.min(a[d], b[d], c[d])), hi = [0, 1, 2].map((d) => Math.max(a[d], b[d], c[d]));
      if ([0, 1, 2].some((d) => hi[d] < LO[d] - 0.15 || lo[d] > HI[d] + 0.15)) continue;
      tris.push({ a, b, c, mesh: n.name });
      count++;
    }
  }
  if (count) used.push({ node: n.name, triangles: count });
});

// ------------------------------------------------------------------ envelope solid + signed distance
// The bodywork is a set of open shells (tank, seat, tail and fairings have no bottoms) around a
// clutter of thin parts (frame tubes, engine, headers, mufflers, fasteners): neither mesh normals
// nor ray parity give a dependable inside. The rider only ever meets the outer envelope, so the
// solid is the envelope seen from above and from both sides (a visual hull):
//   solid(p) = z < top(x, y)  and  left(y, z) < x < right(y, z)
// with top/left/right the highest / outermost surface point of any chassis-fixed mesh in each
// 5 mm cell. Concavities hidden from all three views are filled (they are narrower than a limb
// anyway). Signed distance: exact Euclidean distance transform of the 5 mm voxel solid
// (Felzenszwalb-Huttenlocher), sampled on the 2 cm field nodes.
const VOX = 0.005, VD = [0, 1, 2].map((d) => Math.round((HI[d] - LO[d]) / VOX) + 1), [VX, VY, VZ] = VD;
const top = new Float32Array(VX * VY).fill(-Infinity), right = new Float32Array(VY * VZ).fill(-Infinity), left = new Float32Array(VY * VZ).fill(Infinity);
let samples = 0;
const cellOf = (x, d) => Math.round((x - LO[d]) / VOX);
for (const t of tris) {
  const e1 = [t.b[0] - t.a[0], t.b[1] - t.a[1], t.b[2] - t.a[2]], e2 = [t.c[0] - t.a[0], t.c[1] - t.a[1], t.c[2] - t.a[2]];
  const n = Math.max(1, Math.ceil(Math.max(Math.hypot(...e1), Math.hypot(...e2), Math.hypot(e1[0] - e2[0], e1[1] - e2[1], e1[2] - e2[2])) / (VOX / 2)));
  for (let i = 0; i <= n; i++)
    for (let j = 0; i + j <= n; j++) {
      const u = i / n, v = j / n, p = [t.a[0] + u * e1[0] + v * e2[0], t.a[1] + u * e1[1] + v * e2[1], t.a[2] + u * e1[2] + v * e2[2]];
      const ix = cellOf(p[0], 0), iy = cellOf(p[1], 1), iz = cellOf(p[2], 2);
      samples++;
      if (iy < 0 || iy >= VY) continue;
      if (ix >= 0 && ix < VX) { const c = ix + VX * iy; if (p[2] > top[c]) top[c] = p[2]; }
      if (iz >= 0 && iz < VZ) { const c = iy + VY * iz; if (p[0] > right[c]) right[c] = p[0]; if (p[0] < left[c]) left[c] = p[0]; }
    }
}
const NVOX = VX * VY * VZ, solid = new Uint8Array(NVOX);
let solidCount = 0;
for (let k = 0; k < VZ; k++) {
  const z = LO[2] + k * VOX;
  for (let j = 0; j < VY; j++) {
    const rr = right[j + VY * k], ll = left[j + VY * k];
    if (!(rr > ll)) continue;
    for (let i = 0; i < VX; i++) {
      const x = LO[0] + i * VOX;
      if (x > ll && x < rr && z < top[i + VX * j]) { solid[i + VX * (j + VY * k)] = 1; solidCount++; }
    }
  }
}
// squared EDT along one axis for every line (in voxel units)
const BIG = 1e10;
function edtPass(D, axis) {
  const dimsV = VD, n = dimsV[axis], strides = [1, VX, VX * VY], st = strides[axis];
  const others = [0, 1, 2].filter((d) => d !== axis), f = new Float64Array(n), out = new Float64Array(n), vv = new Int32Array(n), zz = new Float64Array(n + 1);
  for (let a = 0; a < dimsV[others[0]]; a++)
    for (let b = 0; b < dimsV[others[1]]; b++) {
      const base = a * strides[others[0]] + b * strides[others[1]];
      for (let q = 0; q < n; q++) f[q] = D[base + q * st];
      let k = 0;
      vv[0] = 0; zz[0] = -Infinity; zz[1] = Infinity;
      for (let q = 1; q < n; q++) {
        let sx = (f[q] + q * q - (f[vv[k]] + vv[k] * vv[k])) / (2 * q - 2 * vv[k]);
        while (sx <= zz[k]) { k--; sx = (f[q] + q * q - (f[vv[k]] + vv[k] * vv[k])) / (2 * q - 2 * vv[k]); }
        k++; vv[k] = q; zz[k] = sx; zz[k + 1] = Infinity;
      }
      k = 0;
      for (let q = 0; q < n; q++) { while (zz[k + 1] < q) k++; out[q] = (q - vv[k]) * (q - vv[k]) + f[vv[k]]; }
      for (let q = 0; q < n; q++) D[base + q * st] = out[q];
    }
}
function edt(feature) {
  const D = new Float64Array(NVOX);
  for (let i = 0; i < NVOX; i++) D[i] = feature(i) ? 0 : BIG;
  edtPass(D, 0); edtPass(D, 1); edtPass(D, 2);
  return D;
}
let t0 = Date.now();
const dOut = edt((i) => solid[i] === 1), dIn = edt((i) => solid[i] === 0);
// signed distance of a voxel centre to the solid boundary (half-voxel corrected), metres
const sdVox = (i) => (solid[i] ? -(Math.sqrt(dIn[i]) - 0.5) * VOX : (Math.sqrt(dOut[i]) - 0.5) * VOX);
const dims = [0, 1, 2].map((d) => Math.round((HI[d] - LO[d]) / CELL) + 1);
const field = new Int8Array(dims[0] * dims[1] * dims[2]);
const R = Math.round(CELL / VOX);
for (let k = 0; k < dims[2]; k++)
  for (let j = 0; j < dims[1]; j++)
    for (let i = 0; i < dims[0]; i++) {
      const vi = Math.min(VX - 1, i * R), vj = Math.min(VY - 1, j * R), vk = Math.min(VZ - 1, k * R);
      const mm = Math.round(sdVox(vi + VX * (vj + VY * vk)) * 1000);
      field[i + dims[0] * (j + dims[1] * k)] = Math.max(CLAMP_MM[0], Math.min(CLAMP_MM[1], mm));
    }
const buildS = (Date.now() - t0) / 1000;
// accuracy of the 2 cm trilinear field against the 5 mm solid near its surface
function sample(p) {
  const f = [0, 1, 2].map((d) => (p[d] - LO[d]) / CELL), i0 = f.map(Math.floor), t = f.map((x, d) => x - i0[d]);
  let s2 = 0;
  for (let c = 0; c < 8; c++) {
    const o = [c & 1, (c >> 1) & 1, (c >> 2) & 1], idx = [0, 1, 2].map((d) => Math.min(dims[d] - 1, Math.max(0, i0[d] + o[d])));
    const w = o.reduce((acc, b2, d) => acc * (b2 ? t[d] : 1 - t[d]), 1);
    s2 += w * field[idx[0] + dims[0] * (idx[1] + dims[1] * idx[2])];
  }
  return s2 / 1000;
}
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const errs = [];
for (let n = 0; errs.length < 20000 && n < 2e6; n++) {
  const vi = Math.floor(rnd() * VX), vj = Math.floor(rnd() * VY), vk = Math.floor(rnd() * VZ), d = sdVox(vi + VX * (vj + VY * vk));
  if (d < -0.02 || d > 0.06) continue;
  errs.push(Math.abs(sample([LO[0] + vi * VOX, LO[1] + vj * VOX, LO[2] + vk * VOX]) - d));
}
errs.sort((a2, b2) => a2 - b2);
const pct = (q) => +(errs[Math.floor(q * (errs.length - 1))] * 1000).toFixed(2);

// ------------------------------------------------------------------ pegs (cylinder along the peg's principal axis)
function pca(P) {
  const m = [0, 1, 2].map((d) => P.reduce((a, p) => a + p[d], 0) / P.length), C = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const p of P) for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) C[3 * r + c] += (p[r] - m[r]) * (p[c] - m[c]);
  let v = [1, 0, 0];
  for (let it = 0; it < 100; it++) { const w = [0, 1, 2].map((r) => C[3 * r] * v[0] + C[3 * r + 1] * v[1] + C[3 * r + 2] * v[2]), l = Math.hypot(...w); v = w.map((x) => x / l); }
  if (v[0] < 0) v = v.map((x) => -x);
  return { m, v };
}
const { m: pc, v: pax } = pca(pegVerts);
const proj = pegVerts.map((p) => (p[0] - pc[0]) * pax[0] + (p[1] - pc[1]) * pax[1] + (p[2] - pc[2]) * pax[2]);
const radial = pegVerts.map((p, k) => Math.hypot(p[0] - pc[0] - proj[k] * pax[0], p[1] - pc[1] - proj[k] * pax[1], p[2] - pc[2] - proj[k] * pax[2])).sort((a, b) => a - b);
const tmin = Math.min(...proj), tmax = Math.max(...proj), pr = radial[Math.floor(radial.length * 0.5)];
const r6 = (v) => v.map((x) => +x.toFixed(6));
const pegRight = { a: r6(pc.map((c, d) => c + tmin * pax[d])), b: r6(pc.map((c, d) => c + tmax * pax[d])), radiusM: +pr.toFixed(4) };
const mirror = (p) => [-p[0], p[1], p[2]];
const pegLeft = { a: r6(mirror(pegRight.a)), b: r6(mirror(pegRight.b)), radiusM: pegRight.radiusM };

// ------------------------------------------------------------------ grips + reference contact points (legacy authority, body frame)
function grip(name) {
  const g = AFF[name].geometry;
  return { center: r6(affBody(g.centerM)), axis: r6(g.axis), tMinM: +g.tMinM.toFixed(5), tMaxM: +g.tMaxM.toFixed(5), radiusM: +g.radiusMedianM.toFixed(5) };
}
const refs = {};
for (const [k, a] of Object.entries(AFF)) {
  const g = a.geometry || {};
  if (g.pointM) refs[k] = { point: r6(affBody(g.pointM)), normal: g.normal ? r6(g.normal) : null, type: a.type, roles: a.roles };
}
const toB64 = (ta) => Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength).toString("base64");
const out = {
  schema: "lucid-moto.bike.rider-surfaces.v1",
  source: { glb: path.relative(ROOT, GLB), glbSha256: sha(buf), contactAuthority: path.relative(ROOT, LEGACY), contactAuthoritySha256: sha(Buffer.from(legacySrc)), rootMap, neutralOriginM: NEUTRAL_ORIGIN },
  frame: "V5 body: X right, Y forward, Z up; origin = V5 body origin at the neutral pose (GLB -> rootMap -> minus neutral origin)",
  sdf: {
    originM: LO, cellM: CELL, dims, dtype: "int8", unitM: 0.001, clampMm: CLAMP_MM, sign: "outside positive",
    solid: "visual hull of the chassis-fixed meshes from above and both sides (5 mm), exact EDT",
    meshes: used, triangles: tris.length, surfaceSamples: samples, solidVoxels: solidCount, buildS,
    trilinearVsVoxelMm: { samples: errs.length, band: "-20..60 mm", p50: pct(0.5), p95: pct(0.95), max: pct(1) },
    b64: toB64(field),
  },
  pegs: { left: pegLeft, right: pegRight, source: "ChassisControlHardware_22 (right) PCA cylinder; left = mirror (V1.28.5.1 BIKE_SYMMETRY)" },
  grips: { left: grip("leftGrip.mainGrab"), right: grip("rightGrip.mainGrab"), source: "V1.28.5.1 affordances: BlackRubber PCA cylinders" },
  references: refs,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`rider surfaces -> ${path.relative(ROOT, OUT)}: ${tris.length} triangles from ${used.length} meshes, field ${dims.join("x")} (${(field.length / 1024).toFixed(0)} KiB), EDT ${buildS}s`);
console.log("2 cm trilinear vs 5 mm solid (mm):", out.sdf.trilinearVsVoxelMm, "pegs:", JSON.stringify(out.pegs.right), "grips:", JSON.stringify(out.grips.left));
console.log("references:", Object.keys(refs).join(", "));
