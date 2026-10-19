#!/usr/bin/env node
// A tailor's tape on her and on a garment: girths of her body (the tape over its hull, as a tape
// spans the hollow between the breasts) and of the garment's fabric (its section's length: the
// cloth all the way round) at the same places - horizontal slices of the torso, and slices across
// each arm along its upper arm - so a cut's ease (garment girth less hers) reads directly.
//
//   node tools/clothing/measure.mjs [--garment lucid_moto_tshirt_v1.json] [--settled]
//
//   --settled   the garment as the engine leaves it on her rest body after settling under gravity
//               (the engine's shirt settings, 120 steps at 120 Hz): the fit as worn, not as cut
import path from "node:path";
import { ROOT, read, mods, character, engineBody, buildWardrobe } from "./engine.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); return i < 0 ? d : args[i + 1]; };
const file = opt("garment", "lucid_moto_tshirt_v1.json"), settled = args.includes("--settled");

// the loops a plane cuts through a triangle mesh: crossing points on edges, chained through faces
export function sections(P, I, n, d, keepTri = null) {
  const key = (a, b) => (a < b ? a * 1048576 + b : b * 1048576 + a), pts = new Map(), links = new Map();
  const s = (i) => P[3 * i] * n[0] + P[3 * i + 1] * n[1] + P[3 * i + 2] * n[2] - d;
  const cross = (a, b) => {
    const k = key(a, b);
    if (!pts.has(k)) { const sa = s(a), sb = s(b), t = sa / (sa - sb); pts.set(k, [0, 1, 2].map((c) => P[3 * a + c] + (P[3 * b + c] - P[3 * a + c]) * t)); }
    return k;
  };
  const link = (u, v) => { (links.get(u) || links.set(u, []).get(u)).push(v); (links.get(v) || links.set(v, []).get(v)).push(u); };
  for (let f = 0; f < I.length; f += 3) {
    if (keepTri && !keepTri(f / 3)) continue;
    const v = [I[f], I[f + 1], I[f + 2]], sv = v.map(s), ks = [];
    for (let e = 0; e < 3; e++) { const a = v[e], b = v[(e + 1) % 3]; if ((sv[e] < 0) !== (sv[(e + 1) % 3] < 0)) ks.push(cross(a, b)); }
    if (ks.length === 2) link(ks[0], ks[1]);
  }
  const seen = new Set(), loops = [];
  for (const start of links.keys()) {
    if (seen.has(start)) continue;
    const loop = [start]; seen.add(start);
    let prev = null, cur = start;
    for (;;) {
      const nx = (links.get(cur) || []).find((q) => q !== prev && !seen.has(q));
      if (nx === undefined) break;
      loop.push(nx); seen.add(nx); prev = cur; cur = nx;
    }
    const closed = (links.get(cur) || []).includes(start) && loop.length > 2;
    loops.push({ pts: loop.map((k) => pts.get(k)), closed });
  }
  return loops;
}
// a loop's measures in its plane (u, v: two axes of the plane): length, the tape over its hull, centre
export function measureLoop(L, u, v) {
  const q = L.pts.map((p) => [p[0] * u[0] + p[1] * u[1] + p[2] * u[2], p[0] * v[0] + p[1] * v[1] + p[2] * v[2]]);
  let len = 0; for (let i = 0; i < q.length; i++) { const a = q[i], b = q[(i + 1) % q.length]; if (i + 1 < q.length || L.closed) len += Math.hypot(b[0] - a[0], b[1] - a[1]); }
  const h = q.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of h) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of h.slice().reverse()) { while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  const hull = lo.slice(0, -1).concat(hi.slice(0, -1));
  let tape = 0; for (let i = 0; i < hull.length; i++) { const a = hull[i], b = hull[(i + 1) % hull.length]; tape += Math.hypot(b[0] - a[0], b[1] - a[1]); }
  const c = L.pts.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]).map((x) => x / L.pts.length);
  return { len, tape, c, n: L.pts.length };
}

// ---- the tape on her (rest body, the engine frame: +y up, +z her front) and on the garment
// her rest skin, welded (Skin78: the engine's layout duplicates vertices along UV seams, which
// breaks a section into pieces), turned into the engine frame
export function skinRest(ch) { const P = new Float64Array(ch.vrest.length); for (let i = 0; i < P.length; i += 3) { P[i] = -ch.vrest[i]; P[i + 1] = ch.vrest[i + 1]; P[i + 2] = -ch.vrest[i + 2]; } return { P, I: ch.faces }; }
export function tape({ skin, gPos, gIdx, gComp }) {
  const torsoTris = (f) => gComp[gIdx[3 * f]] === 2 && gComp[gIdx[3 * f + 1]] === 2 && gComp[gIdx[3 * f + 2]] === 2;
  const pick = (loops, near) => loops.filter((L) => L.closed && L.pts.length > 8).map((L) => ({ L, d: Math.hypot(...L.pts.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]).map((x, i) => x / L.pts.length - near[i])) })).sort((a, b) => a.d - b.d)[0]?.L;
  const rows = [];
  for (let y = 0.86; y <= 1.36; y += 0.02) {
    const n = [0, 1, 0], u = [1, 0, 0], v = [0, 0, 1];
    const b = pick(sections(skin.P, skin.I, n, y), [0, y, 0]);
    const gl = sections(gPos, gIdx, n, y, torsoTris).filter((L) => L.pts.length > 8);
    const g = gl.length ? gl.reduce((a, L) => (L.pts.length > a.pts.length ? L : a)) : null;
    const mb = b ? measureLoop(b, u, v) : null, mg = g ? measureLoop(g, u, v) : null;
    rows.push({ y: +y.toFixed(2), body: mb ? +(mb.tape * 100).toFixed(1) : null, garment: mg ? +(mg.len * 100).toFixed(1) : null, garmentClosed: g?.closed ?? null, ease: mb && mg ? +((mg.len - mb.tape) * 100).toFixed(1) : null });
  }
  return rows;
}
export function sleeveTape({ ch, skin, gPos, gIdx, gComp }) {
  const HE = (p) => [-p[0], p[1], -p[2]], J = (nm) => HE(ch.joints.rest[ch.joints.names.indexOf(nm)]);
  const out = {};
  for (const [side, cid] of [["L", 0], ["R", 4]]) {
    const S = J(`${side}_Upperarm`), El = J(`${side}_Forearm`), a0 = [El[0] - S[0], El[1] - S[1], El[2] - S[2]], la = Math.hypot(...a0), a = a0.map((x) => x / la);
    const u0 = Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], d0 = u0[0] * a[0] + u0[1] * a[1] + u0[2] * a[2];
    let u = [u0[0] - d0 * a[0], u0[1] - d0 * a[1], u0[2] - d0 * a[2]]; const lu = Math.hypot(...u); u = u.map((x) => x / lu);
    const v = [a[1] * u[2] - a[2] * u[1], a[2] * u[0] - a[0] * u[2], a[0] * u[1] - a[1] * u[0]];
    const tris = (f) => gComp[gIdx[3 * f]] === cid && gComp[gIdx[3 * f + 1]] === cid && gComp[gIdx[3 * f + 2]] === cid;
    const rows = [];
    for (let t = 0.02; t <= 0.2; t += 0.02) {
      const p = [S[0] + a[0] * t, S[1] + a[1] * t, S[2] + a[2] * t], d = p[0] * a[0] + p[1] * a[1] + p[2] * a[2];
      const bl = sections(skin.P, skin.I, a, d).filter((L) => L.closed && L.pts.length > 6);
      const near = (L) => { const c = L.pts.reduce((s, q) => [s[0] + q[0], s[1] + q[1], s[2] + q[2]], [0, 0, 0]).map((x) => x / L.pts.length); return Math.hypot(c[0] - p[0], c[1] - p[1], c[2] - p[2]); };
      const b = bl.sort((x, y) => near(x) - near(y))[0];
      const gl = sections(gPos, gIdx, a, d, tris).filter((L) => L.pts.length > 6);
      const g = gl.length ? gl.sort((x, y) => near(x) - near(y))[0] : null;
      const mb = b && near(b) < 0.08 ? measureLoop(b, u, v) : null, mg = g ? measureLoop(g, u, v) : null;
      rows.push({ t: +t.toFixed(2), arm: mb ? +(mb.tape * 100).toFixed(1) : null, sleeve: mg ? +(mg.len * 100).toFixed(1) : null, closed: g?.closed ?? null, ease: mb && mg ? +((mg.len - mb.tape) * 100).toFixed(1) : null });
    }
    out[side] = rows;
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ch = character(), body = engineBody(ch);
  const G = mods.decodeGarmentAsset(read(path.resolve(ROOT, "assets/character/clothing", file)));
  const { W, g, bind } = buildWardrobe(body, { garments: ["shirt"], assetFiles: { shirt: file } });
  const s = g.shirt.solver;
  if (settled) for (let i = 0; i < 120; i++) { W.setBodySurface?.(bind.P, bind.N, bind.P, 1 / 120); W.stepFrame(1 / 120); }
  const gPos = s.pos, gIdx = G.indices, gComp = s.componentIds, skin = skinRest(ch);
  console.log(`${file}${settled ? " (settled 1 s under gravity)" : " (as cut, fitted to her rest body)"} - girths in cm (her: the tape over her hull; garment: its cloth all round)`);
  console.log("torso   y(m)  her   garment  ease");
  for (const r of tape({ skin, gPos, gIdx, gComp })) console.log(`        ${r.y.toFixed(2)}  ${String(r.body).padStart(5)}  ${String(r.garment).padStart(6)}${r.garmentClosed === false ? "*" : " "}  ${r.ease ?? ""}`);
  const sl = sleeveTape({ ch, skin, gPos, gIdx, gComp });
  for (const [side, rows] of Object.entries(sl)) {
    console.log(`sleeve ${side}  from shoulder (m)  arm  sleeve  ease`);
    for (const r of rows) console.log(`        ${r.t.toFixed(2)}  ${String(r.arm).padStart(5)}  ${String(r.sleeve).padStart(6)}${r.closed === false ? "*" : " "}  ${r.ease ?? ""}`);
  }
  console.log("(* the garment's section is open there: an opening, or the slice crosses its edge)");
}
