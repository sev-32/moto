// The inner garment's open edges, rounded (LUCID MOTO, CANDIDATE): for the clothing engine's layer
// coupling (r1 InterGarmentContact), installed on a coupling instance - its source is not changed.
// Shared by the game layer (src/core/47_rider_wardrobe.js, bundled) and the Node tools.
//
// The coupling holds the outer garment (her T-shirt) a soft gap off the inner one (her jeans): for
// each of its points, the closest point of the jeans and the jeans' normal there, the gap measured
// along that normal. Where the closest point is on the jeans' open edge (the top of the waistband)
// and the shirt is beside or above it rather than over the jeans, the distance along the normal
// reads near zero however far the shirt is from the edge: the coupling pushed the shirt out to the
// full gap up to its reach (35 mm) above the waistband - a roll round her waist. Here such a point
// is measured as from a rounded edge: its true distance to the edge, along the line from it. Only for
// points in front of the jeans there (the distance along the normal not negative): a point behind
// the jeans is left as the engine finds it, so its layer gate (no shirt behind the jeans) is as before.

export function roundInnerEdges(layer, { tol = 1e-4 } = {}) {
  const I = layer.inner.indices, K = (a, b) => (a < b ? a * 1048576 + b : b * 1048576 + a), use = new Map();
  for (let f = 0; f < I.length; f += 3) for (let k = 0; k < 3; k++) { const key = K(I[f + k], I[f + (k + 1) % 3]); use.set(key, (use.get(key) || 0) + 1); }
  const edge = new Set(), vert = new Set();
  for (const [key, c] of use) if (c === 1) { edge.add(key); vert.add(Math.floor(key / 1048576)); vert.add(key % 1048576); }
  const R = { edges: edge.size, rounded: 0 };
  // the closest point on an open edge or at an open corner, and the query in front of the jeans
  const fix = (h, x, y, z) => {
    if (!h || !(h.signed >= 0)) return h;
    const t = 3 * h.ti, a = I[t], b = I[t + 1], c = I[t + 2], w = [h.u, h.v, h.w], ids = [a, b, c], on = [];
    for (let k = 0; k < 3; k++) if (w[k] > tol) on.push(ids[k]);
    const open = on.length === 1 ? vert.has(on[0]) : on.length === 2 ? edge.has(K(on[0], on[1])) : false;
    if (!open) return h;
    const dx = x - h.qx, dy = y - h.qy, dz = z - h.qz, d = Math.hypot(dx, dy, dz);
    if (!(d > h.signed * 1.0001) || d < 1e-9) return h;
    h.signed = d; h.nx = dx / d; h.ny = dy / d; h.nz = dz / d; R.rounded++;
    return h;
  };
  const B = layer.bvh, cp = B.closestPoint.bind(B), cpn = B.closestPointNeighborhood.bind(B);
  B.closestPoint = (x, y, z, ...r) => fix(cp(x, y, z, ...r), x, y, z);
  B.closestPointNeighborhood = (x, y, z, ...r) => fix(cpn(x, y, z, ...r), x, y, z);
  layer.roundedEdges = R;
  return R;
}
