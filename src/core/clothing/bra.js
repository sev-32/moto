// Her bra, as her clothes feel it (LUCID MOTO, CANDIDATE): the surface her T-shirt drapes over at her
// bust is her skin smoothed - a bra's smooth cups - rather than her bare skin, whose nipples the
// cloth would otherwise take the print of. A garment-side assumption, declared: the contact surface
// handed to the clothing engine is changed there; her skin, its weights and its deformer are not
// (the skin drawn is hers, hidden under the shirt there).
//
// Where: within 4.5 cm of each nipple tip (the most forward point of each breast on her rest skin),
// fully within 2.5 cm. How: the posed skin there smoothed (24 umbrella steps, the disc's rim held),
// every frame - so the cups move with her as her skin does. Each tip comes 12 mm in: her nipple and
// the cone of her breast's tip rounded off, as a moulded cup rounds them (12 steps over 3.5 cm left
// the cone, and a fitted shirt lying on it showed it as a point).

// her rest skin (her master frame: +y up, -z forward), its triangles; returns the cups
export function makeBra({ vrest, faces, nv }, { radiusM = 0.045, coreM = 0.025, iterations = 24, lambda = 0.6 } = {}) {
  const tips = [];
  for (const sx of [-1, 1]) {
    let best = -1;
    for (let v = 0; v < nv; v++) {
      const x = vrest[3 * v], y = vrest[3 * v + 1], z = vrest[3 * v + 2];
      if (y < 1.1 || y > 1.28 || x * sx < 0.03 || x * sx > 0.15) continue;
      if (best < 0 || z < vrest[3 * best + 2]) best = v;
    }
    if (best >= 0) tips.push(best);
  }
  // the disc's vertices and their weights; neighbours over her triangles
  const w = new Map();
  for (let v = 0; v < nv; v++) {
    let d = Infinity;
    for (const t of tips) d = Math.min(d, Math.hypot(vrest[3 * v] - vrest[3 * t], vrest[3 * v + 1] - vrest[3 * t + 1], vrest[3 * v + 2] - vrest[3 * t + 2]));
    if (d < radiusM) { const u = Math.min(1, Math.max(0, (radiusM - d) / (radiusM - coreM))); w.set(v, u * u * (3 - 2 * u)); }
  }
  const ids = Int32Array.from(w.keys()), at = new Map(Array.from(ids, (v, i) => [v, i])), nb = Array.from(ids, () => new Set());
  for (let f = 0; f < faces.length; f += 3) for (let k = 0; k < 3; k++) {
    const a = faces[f + k];
    if (!at.has(a)) continue;
    for (let j = 1; j < 3; j++) nb[at.get(a)].add(faces[f + (k + j) % 3]);
  }
  const NB = nb.map((s) => Int32Array.from(s)), W = Float32Array.from(ids, (v) => w.get(v));
  const cur = new Float64Array(ids.length * 3), nxt = new Float64Array(ids.length * 3);
  // positions by skin vertex through get(v, out, offset) / set(v, x, y, z) - the engine's layout or
  // her own - smoothed in place
  function apply(get, set) {
    for (let i = 0; i < ids.length; i++) get(ids[i], cur, 3 * i);
    const q = [0, 0, 0];
    for (let it = 0; it < iterations; it++) {
      for (let i = 0; i < ids.length; i++) {
        const L = NB[i]; let sx = 0, sy = 0, sz = 0;
        for (let j = 0; j < L.length; j++) { const u = L[j], k = at.get(u); if (k !== undefined) { sx += cur[3 * k]; sy += cur[3 * k + 1]; sz += cur[3 * k + 2]; } else { get(u, q, 0); sx += q[0]; sy += q[1]; sz += q[2]; } }
        const m = L.length || 1;
        nxt[3 * i] = cur[3 * i] + lambda * (sx / m - cur[3 * i]); nxt[3 * i + 1] = cur[3 * i + 1] + lambda * (sy / m - cur[3 * i + 1]); nxt[3 * i + 2] = cur[3 * i + 2] + lambda * (sz / m - cur[3 * i + 2]);
      }
      cur.set(nxt);
    }
    const o = [0, 0, 0];
    for (let i = 0; i < ids.length; i++) { get(ids[i], o, 0); const wi = W[i]; set(ids[i], o[0] + wi * (cur[3 * i] - o[0]), o[1] + wi * (cur[3 * i + 1] - o[1]), o[2] + wi * (cur[3 * i + 2] - o[2])); }
  }
  return { tips, vertices: ids.length, apply };
}
