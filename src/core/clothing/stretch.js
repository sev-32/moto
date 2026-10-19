// Stretch denim (LUCID MOTO, CANDIDATE): the riding cut as how far her jeans stretch, not as their
// pattern. Shared by the game layer (src/core/47_rider_wardrobe.js, bundled) and the Node tools
// (tools/clothing/engine.mjs); installed on a solver instance (the engine's source is not changed).
//
// The riding cut (tools/clothing/riding-cut.mjs) gives every edge and bend of the jeans the length her
// riding postures ask of it: its longest on its carriers (the garment carried by her skin) over the
// postures, less 18% of stretch, at most 1.35 x the pattern. Applied as the pattern, the jeans were
// that long when she stood too: on her standing they slid 2 cm down her hips and stood 12-17 mm off her
// waist at the sides and back (without the cut: 7-9 mm), and her T-shirt bulged over them. Stretch
// denim (cotton with elastane) is cut to her standing and stretches where she bends: here each edge's
// and bend's rest length is the pattern's, lengthened towards what her pose asks of it now - its length
// on its carriers, less the same stretch - never beyond the cut; yielding fast as she bends (yieldHz),
// recovering slower as she straightens (recoverHz).
//
// The waistband takes no part: a jeans waistband is interfaced and does not stretch. Cut `tension`
// under the pattern (its edges and bends that much shorter), it grips her waist and hips, and the
// jeans hang from it.
import { alongCloth } from "./hangers.js";

// the waist: the shell's highest opening (its boundary loop with the highest mean height at rest)
export function waistOf(solver) {
  const n = solver.shellVertexCount, I = solver.indices, P = solver.rest, K = (a, b) => (a < b ? a * 1048576 + b : b * 1048576 + a), use = new Map();
  for (let f = 0; f < I.length; f += 3) for (let k = 0; k < 3; k++) { const a = I[f + k], b = I[f + (k + 1) % 3]; if (a < n && b < n) { const key = K(a, b); use.set(key, (use.get(key) || 0) + 1); } }
  const adj = new Map(); for (const [key, c] of use) if (c === 1) { const a = Math.floor(key / 1048576), b = key % 1048576; (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); }
  const seen = new Set(); let best = null, bestY = -Infinity;
  for (const v0 of adj.keys()) {
    if (seen.has(v0)) continue;
    const L = [v0]; seen.add(v0);
    for (let i = 0; i < L.length; i++) for (const u of adj.get(L[i])) if (!seen.has(u)) { seen.add(u); L.push(u); }
    const y = L.reduce((s, v) => s + P[3 * v + 1], 0) / L.length;
    if (L.length >= 8 && y > bestY) { bestY = y; best = L; }
  }
  return best || [];
}

// cut: the riding cut's garment record ({ edgeRest_f32_b64, bendRest_f32_b64 }); b64: base64 -> typed array
export function installStretch(solver, cut, b64, { eps = 0.18, yieldHz = 6, recoverHz = 1, bandM = 0.04, tension = 0.03 } = {}) {
  const S = solver, n = S.shellVertexCount;
  const waist = waistOf(S), dw = waist.length ? alongCloth(S, waist).d : null;
  const inBand = (v) => !!dw && v < n && dw[v] <= bandM;
  const pairs = (key, rests, cutKey) => {
    const P = S[key], m = P.length / 2, c = cut?.[cutKey] ? b64(cut[cutKey], Float32Array) : null;
    if (c && c.length !== m) throw Error(`riding cut ${cutKey}: ${c.length} for ${m} ${key}`);
    const base = rests.map((r) => (S[r] ? Float64Array.from(S[r]) : null)), max = new Float64Array(m).fill(1), band = new Uint8Array(m), f = new Float64Array(m).fill(1);
    for (let i = 0; i < m; i++) {
      const a = P[2 * i], b = P[2 * i + 1], r0 = base[0][i];
      if (inBand(a) && inBand(b)) { band[i] = 1; f[i] = 1 - tension; continue; }
      if (c && r0 >= 0.001) max[i] = Math.max(1, c[i] / r0);
    }
    return { key, rests, base, max, band, f };
  };
  const X = { pairs: [pairs("edges", ["edgeRest", "edgeRestAuthored"], "edgeRest_f32_b64"), pairs("bends", ["bendRest", "bendRestAuthored"], "bendRest_f32_b64")], waist, bandVertices: 0, stretched: 0, maxFactor: 1 };
  if (dw) for (let v = 0; v < n; v++) if (dw[v] <= bandM) X.bandVertices++;
  // her pose now: each pair's length on its carriers -> its rest, eased towards it
  X.update = (dt = 0) => {
    // (the carriers on her body as it is now: the engine refreshes them in its step, not on a new body)
    const T = S.refreshCausalReference ? S.refreshCausalReference() : S.carrierTarget; if (!T) return;
    const ay = dt > 0 ? 1 - Math.exp(-dt * 2 * Math.PI * yieldHz) : 1, ar = dt > 0 ? 1 - Math.exp(-dt * 2 * Math.PI * recoverHz) : 1;
    let stretched = 0, mx = 1;
    for (const p of X.pairs) {
      const P = S[p.key], b0 = p.base[0];
      for (let i = 0; i < p.f.length; i++) {
        if (p.band[i] || p.max[i] <= 1) continue;
        const a = 3 * P[2 * i], b = 3 * P[2 * i + 1];
        const L = Math.hypot(T[b] - T[a], T[b + 1] - T[a + 1], T[b + 2] - T[a + 2]);
        const want = Math.min(p.max[i], Math.max(1, L / (1 + eps) / b0[i])), cur = p.f[i];
        p.f[i] = cur + (want - cur) * (want > cur ? ay : ar);
        if (p.f[i] > 1.001) stretched++;
        if (p.f[i] > mx) mx = p.f[i];
      }
      p.rests.forEach((r, k) => { const A = S[r], B = p.base[k]; if (!A || !B) return; for (let i = 0; i < p.f.length; i++) A[i] = B[i] * p.f[i]; });
    }
    X.stretched = stretched; X.maxFactor = mx;
  };
  X.update(0);
  const base = S.setBodySurface.bind(S);
  S.setBodySurface = function (positions, normals = null, prevPositions = null, dt = 1 / 60) { const r = base(positions, normals, prevPositions, dt); X.update(dt); return r; };
  S.stretch = X;
  return X;
}
