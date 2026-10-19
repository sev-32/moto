// How a garment hangs (LUCID MOTO, CANDIDATE): long-range attachments and the neckline's ring, for
// the LUCID Clothing Engine's position-based cloth, installed on a solver instance (its source is
// not changed). Shared by the game layer (src/core/47_rider_wardrobe.js, bundled) and the Node
// tools (tools/clothing/engine.mjs).
//
// Position-based cloth, a few iterations per step, cannot carry its own weight down long chains of
// edges: a T-shirt hanging from her shoulders sags 5-10 % (its neckline opens, it slides down her
// shoulders until its armholes catch her armpits), where cotton jersey stretches well under 1 %
// under its own weight. The standard answer (long-range attachments, Kim, Chentanez and Mueller-
// Fischer 2012): each point of the cloth is kept no farther from the garment's anchor - here the
// neckline - than its rest distance along the cloth, times (1 + slack). Unilateral: the cloth folds,
// bunches and moves freely; it only cannot hang longer than it is. The neckline itself is a ring that
// cannot open: its points no farther apart (across it, and a quarter round) than at rest. And it sits
// on her neck's base as a fitted crew neck does: each of its points held to its place on her body
// (the engine's own carrier target for it) beyond a free play - the engine's guard lets the
// neckline's centre drift 3.2 cm before acting, and under the shirt's weight it slid 2.3 cm down her
// shoulders and was pushed open by her body as it went.
//
// Applied in every substep of the engine, right after its own neckline guard (its _applyRetention),
// before its collision passes - so the cloth is put back outside her after it.

// the cloth's rest distances along itself from the anchors (Dijkstra over its edges, at the
// engine's rest lengths - a riding cut's or a fit's lengths included)
export function alongCloth(solver, anchors) {
  const n = solver.shellVertexCount, E = solver.edges, R = solver.edgeRestAuthored || solver.edgeRest;
  const adj = Array.from({ length: n }, () => []);
  for (let k = 0; k < E.length; k += 2) { const a = E[k], b = E[k + 1]; if (a >= n || b >= n) continue; const L = R[k >> 1]; adj[a].push(b, L); adj[b].push(a, L); }
  const d = new Float64Array(n).fill(Infinity), from = new Int32Array(n).fill(-1), heap = [];
  const push = (v, x) => { heap.push([x, v]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  for (const a of anchors) { d[a] = 0; from[a] = a; push(a, 0); }
  while (heap.length) {
    const [x, v] = pop(); if (x > d[v]) continue;
    const A = adj[v];
    for (let j = 0; j < A.length; j += 2) { const u = A[j], y = x + A[j + 1]; if (y < d[u]) { d[u] = y; from[u] = from[v]; push(u, y); } }
  }
  return { d, from };
}

// the shirt's neckline: the shell's points sewn to its rib collar's outer row, in ring order
export function necklineOf(solver) {
  const c = solver.collar, ring = new Int32Array(c.ringCount).fill(-1), S = solver.seams;
  for (let k = 0; k < S.length; k += 2) {
    const a = S[k], b = S[k + 1];
    if (a < solver.shellVertexCount && b >= c.outerStart && b < c.midStart) ring[b - c.outerStart] = a;
    else if (b < solver.shellVertexCount && a >= c.outerStart && a < c.midStart) ring[a - c.outerStart] = b;
  }
  return Array.from(ring).filter((v) => v >= 0);
}

// the shirt's hem: the shell's lowest opening (its boundary loop with the lowest mean height at rest)
export function hemOf(solver) {
  const n = solver.shellVertexCount, I = solver.indices, P = solver.rest, K = (a, b) => (a < b ? a * 1048576 + b : b * 1048576 + a), use = new Map();
  for (let f = 0; f < I.length; f += 3) for (let k = 0; k < 3; k++) { const a = I[f + k], b = I[f + (k + 1) % 3]; if (a < n && b < n) { const key = K(a, b); use.set(key, (use.get(key) || 0) + 1); } }
  const adj = new Map(); for (const [key, c] of use) if (c === 1) { const a = Math.floor(key / 1048576), b = key % 1048576; (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); }
  const seen = new Set(); let best = null, bestY = Infinity;
  for (const v0 of adj.keys()) {
    if (seen.has(v0)) continue;
    const L = [v0]; seen.add(v0);
    for (let i = 0; i < L.length; i++) for (const u of adj.get(L[i])) if (!seen.has(u)) { seen.add(u); L.push(u); }
    const y = L.reduce((s, v) => s + P[3 * v + 1], 0) / L.length;
    if (L.length >= 8 && y < bestY) { bestY = y; best = L; }
  }
  return best || [];
}

// freeHemM: the hem's last few centimetres hang free of the attachments - they lie over the jeans'
// waistband when she sits, and an attachment drawing them straight towards the neckline pulled them
// through it (behind the jeans: the engine's layer gate); they hang from the cloth above them
//
// strainLimit: no edge running away from the neckline longer than its rest length times
// (1 + strainLimit): swept once a substep from the neckline down, each edge's far point drawn
// towards its near point (follow-the-leader, in order of distance along the cloth), so the cloth's
// weight is carried from the neckline at once. The engine's 13 iterations a substep propagate it an
// edge or so an iteration: over the first 0.1 s her shirt's front fell 2-3 cm, stretching 20% (95th
// percentile) - cotton jersey stretches well under 1% under its own weight - and the long-range
// attachments did not catch it (over her bust the straight line from the neckline is far shorter than
// the cloth). Edges across the cloth (both ends about as far from the neckline) are left to the
// engine, and so is the free hem (freeHemM: there the layer coupling holds the shirt off the jeans,
// and drawn towards the neckline it was pulled in against the coupling every substep - a roll round
// her waist). Before the engine's collision passes: where her body pushes the cloth out, it still
// stretches.
export function installHangers(solver, { anchors = necklineOf(solver), slack = 0.02, ringSlack = 0.01, holdFreeM = 0.004, holdGain = 0.8, freeHemM = 0.08, strainLimit = 0.01, strainFreeHem = true } = {}) {
  const H = { anchors: Int32Array.from(anchors), slack, ringSlack, ringScale: 1, holdFreeM, holdGain, freeHemM, strainLimit, strainFreeHem, d: null, from: null, ring: null, free: null, ftl: null, corrections: 0, ringCorrections: 0, holdCorrections: 0, strainCorrections: 0 };
  // (re)measure: the distances along the cloth at its rest lengths as they are now, and the
  // neckline's spans on P (its rest shape, or the cloth as it lies when a fit is relaxed into it)
  H.update = (P = solver.rest) => {
    const a = alongCloth(solver, H.anchors), ring = [], m = H.anchors.length;
    H.d = a.d; H.from = a.from;
    const hem = H.freeHemM > 0 ? hemOf(solver) : [], dh = hem.length ? alongCloth(solver, hem).d : null;
    H.free = new Uint8Array(solver.shellVertexCount);
    if (dh) for (let i = 0; i < H.free.length; i++) H.free[i] = dh[i] < H.freeHemM ? 1 : 0;
    for (let j = 0; j < m; j++) for (const step of [m >> 1, m >> 2]) {
      const k = (j + step) % m; if (step === m >> 1 && k < j) continue;
      const p = 3 * H.anchors[j], q = 3 * H.anchors[k];
      ring.push(H.anchors[j], H.anchors[k], Math.hypot(P[q] - P[p], P[q + 1] - P[p + 1], P[q + 2] - P[p + 2]));
    }
    H.ring = ring;
    // the edges running away from the neckline, near point first, in order of its distance
    const E = solver.edges, n = solver.shellVertexCount, R = solver.edgeRestAuthored || solver.edgeRest, ftl = [];
    for (let k = 0; k < E.length; k += 2) {
      const a = E[k], b = E[k + 1]; if (a >= n || b >= n || !(Math.abs(H.d[a] - H.d[b]) >= 0.5 * R[k >> 1])) continue;
      const e = H.d[a] < H.d[b] ? [H.d[a], a, b, k >> 1] : [H.d[b], b, a, k >> 1];
      if (!(H.strainFreeHem && H.free[e[2]])) ftl.push(e);
    }
    ftl.sort((x, y) => x[0] - y[0]);
    H.ftl = Int32Array.from(ftl.flatMap((e) => [e[1], e[2], e[3]]));
    return H;
  };
  H.apply = () => {
    const P = solver.pos, w = solver.invMass, d = H.d, from = H.from, n = solver.shellVertexCount, T = solver.carrierTarget;
    // the neckline on her neck's base: back towards its place on her beyond the free play
    if (T && H.holdGain > 0) for (const a of H.anchors) {
      if (solver.carrierTri[a] < 0) continue;
      const p = 3 * a, dx = T[p] - P[p], dy = T[p + 1] - P[p + 1], dz = T[p + 2] - P[p + 2], l = Math.hypot(dx, dy, dz);
      if (l <= H.holdFreeM) continue;
      const c = ((l - H.holdFreeM) / l) * H.holdGain;
      P[p] += dx * c; P[p + 1] += dy * c; P[p + 2] += dz * c;
      H.holdCorrections++;
    }
    // the neckline cannot open
    const R = H.ring, rs = H.ringScale * (1 + H.ringSlack);
    for (let it = 0; it < 2; it++) for (let k = 0; k < R.length; k += 3) {
      const a = 3 * R[k], b = 3 * R[k + 1], lim = R[k + 2] * rs, dx = P[b] - P[a], dy = P[b + 1] - P[a + 1], dz = P[b + 2] - P[a + 2], l = Math.hypot(dx, dy, dz);
      if (l <= lim) continue;
      const wa = w ? w[R[k]] : 1, wb = w ? w[R[k + 1]] : 1, den = wa + wb; if (den <= 0) continue;
      const c = (l - lim) / (l * den);
      P[a] += dx * c * wa; P[a + 1] += dy * c * wa; P[a + 2] += dz * c * wa; P[b] -= dx * c * wb; P[b + 1] -= dy * c * wb; P[b + 2] -= dz * c * wb;
      H.ringCorrections++;
    }
    // no edge running away from the neckline stretched beyond the limit, from the neckline down
    if (H.strainLimit > 0) {
      const F = H.ftl, Rr = solver.edgeRestAuthored || solver.edgeRest, lim1 = 1 + H.strainLimit;
      for (let k = 0; k < F.length; k += 3) {
        const ib = F[k + 1]; if (w && !(w[ib] > 0)) continue;
        const a = 3 * F[k], b = 3 * ib, dx = P[b] - P[a], dy = P[b + 1] - P[a + 1], dz = P[b + 2] - P[a + 2], l = Math.hypot(dx, dy, dz), lim = Rr[F[k + 2]] * lim1;
        if (l <= lim) continue;
        const c = lim / l;
        P[b] = P[a] + dx * c; P[b + 1] = P[a + 1] + dy * c; P[b + 2] = P[a + 2] + dz * c;
        H.strainCorrections++;
      }
    }
    // no point farther from the neckline than the cloth is long
    const s = 1 + H.slack;
    for (let i = 0; i < n; i++) {
      const a = from[i]; if (a < 0 || a === i || H.free[i] || (w && !(w[i] > 0))) continue;
      const p = 3 * i, q = 3 * a, dx = P[p] - P[q], dy = P[p + 1] - P[q + 1], dz = P[p + 2] - P[q + 2], l = Math.hypot(dx, dy, dz), lim = d[i] * s;
      if (l <= lim) continue;
      const c = lim / l;
      P[p] = P[q] + dx * c; P[p + 1] = P[q + 1] + dy * c; P[p + 2] = P[q + 2] + dz * c;
      H.corrections++;
    }
  };
  H.update();
  const base = solver._applyRetention.bind(solver);
  solver._applyRetention = function () { base(); H.apply(); };
  solver.hangers = H;
  return H;
}
