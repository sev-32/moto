// Seeded randomness and the statistics the gym judges with.
//
// One episode proves nothing about a marginally stable loop (R27: the same controller survives at
// 270 Hz and falls at 540 Hz), so every event is run over many seeds and judged by the interval a
// proportion of successes lets us claim, not by its point estimate.

// mulberry32: small, fast, identical on every machine
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    uniform: (lo, hi) => lo + (hi - lo) * next(),
    normal() { let u = 0; while (u === 0) u = next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next()); },
    pick: (xs) => xs[Math.floor(next() * xs.length) % xs.length],
  };
}

// a seed for a named purpose of one episode, so adding a perturbation never reshuffles the others
export function subSeed(seed, ...names) {
  let h = (seed >>> 0) ^ 0x9e3779b9;
  for (const ch of names.join("/")) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h >>> 0;
}

// Wilson score interval for k successes in n trials (95 % by default)
export function wilson(k, n, z = 1.96) {
  if (!n) return { p: NaN, lo: 0, hi: 1 };
  const p = k / n, d = 1 + (z * z) / n, c = p + (z * z) / (2 * n), s = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { p, lo: Math.max(0, (c - s) / d), hi: Math.min(1, (c + s) / d) };
}

// PASS: the lower bound clears the target; FAIL: the upper bound is under it; UNSURE: more seeds needed
export function verdict(k, n, target = 0.8) {
  if (!n) return "N/A";
  const { lo, hi } = wilson(k, n);
  return lo >= target ? "PASS" : hi < target ? "FAIL" : "UNSURE";
}

export const median = (xs) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : 0.5 * (s[s.length / 2 - 1] + s[s.length / 2])) : null; };
export const mean = (xs) => { const s = xs.filter(Number.isFinite); return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null; };
export const quantile = (xs, q) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : null; };
