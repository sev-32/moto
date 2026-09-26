// Shared (Node + browser-portable) proving-ground track geometry. The browser layer embeds
// the same algorithm (src/core/50_world.js); this copy is for design checks and previews.
export function buildCenterline(ctrl, ds = 1) {
  const n = ctrl.length, dense = [];
  const d = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  for (let i = 0; i < n; i++) {
    const p0 = ctrl[(i - 1 + n) % n], p1 = ctrl[i], p2 = ctrl[(i + 1) % n], p3 = ctrl[(i + 2) % n];
    const t0 = 0, t1 = t0 + Math.sqrt(d(p0, p1)), t2 = t1 + Math.sqrt(d(p1, p2)), t3 = t2 + Math.sqrt(d(p2, p3));
    const L = (pa, pb, ta, tb, t) => [((tb - t) / (tb - ta)) * pa[0] + ((t - ta) / (tb - ta)) * pb[0], ((tb - t) / (tb - ta)) * pa[1] + ((t - ta) / (tb - ta)) * pb[1]];
    const m = Math.max(8, Math.ceil(d(p1, p2) / 0.5));
    for (let k = 0; k < m; k++) {
      const t = t1 + ((t2 - t1) * k) / m;
      const A1 = L(p0, p1, t0, t1, t), A2 = L(p1, p2, t1, t2, t), A3 = L(p2, p3, t2, t3, t);
      const B1 = L(A1, A2, t0, t2, t), B2 = L(A2, A3, t1, t3, t);
      dense.push(L(B1, B2, t1, t2, t));
    }
  }
  // arc-length resample (closed)
  const cum = [0];
  for (let i = 1; i <= dense.length; i++) cum.push(cum[i - 1] + d(dense[i - 1], dense[i % dense.length]));
  const total = cum[cum.length - 1], N = Math.round(total / ds), X = new Float64Array(N), Y = new Float64Array(N);
  let j = 0;
  for (let i = 0; i < N; i++) {
    const s = (i * total) / N;
    while (cum[j + 1] < s) j++;
    const a = dense[j], b = dense[(j + 1) % dense.length], u = (s - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
    X[i] = a[0] + (b[0] - a[0]) * u;
    Y[i] = a[1] + (b[1] - a[1]) * u;
  }
  const step = total / N, TX = new Float64Array(N), TY = new Float64Array(N), K = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const a = (i - 1 + N) % N, b = (i + 1) % N, dx = X[b] - X[a], dy = Y[b] - Y[a], l = Math.hypot(dx, dy);
    TX[i] = dx / l; TY[i] = dy / l;
  }
  for (let i = 0; i < N; i++) {
    const a = (i - 2 + N) % N, b = (i + 2) % N;
    let da = Math.atan2(TY[b], TX[b]) - Math.atan2(TY[a], TX[a]);
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    K[i] = da / (4 * step); // + = turning left
  }
  // light smoothing of curvature
  const Ks = new Float64Array(N);
  for (let i = 0; i < N; i++) { let s = 0; for (let k = -6; k <= 6; k++) s += K[(i + k + N) % N]; Ks[i] = s / 13; }
  return { N, step, length: total, X, Y, TX, TY, K: Ks };
}
export function selfClearance(t, skip = 60) {
  let min = 1e9, at = null;
  for (let i = 0; i < t.N; i += 2)
    for (let j = i + skip; j < t.N - (i < skip ? skip - i : 0); j += 2) {
      const dd = Math.hypot(t.X[i] - t.X[j], t.Y[i] - t.Y[j]);
      if (dd < min) { min = dd; at = [i, j]; }
    }
  return { min, at };
}
