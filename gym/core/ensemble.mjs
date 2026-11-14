// Many episodes, in parallel, and what they add up to.
import { Worker } from "node:worker_threads";
import os from "node:os";
import { wilson, verdict, median, mean, quantile } from "./stats.mjs";
import { METHODS } from "../methods/index.mjs";
import { supported } from "./episode.mjs";

const WORKER = new URL("../worker.mjs", import.meta.url);
export const GRIPS = [1.0, 0.8, 0.6];

// seeds 1..n; the grip scale cycles through GRIPS with the seed unless `vary` is off
export const modsFor = (seed, vary = true) => (vary ? { grip: GRIPS[seed % GRIPS.length] } : {});

export async function runEnsemble({ methods, events, seeds, jobs = Math.max(1, os.availableParallelism() - 0), vary = true, extra = {}, keepTraces = 2, onResult = () => {} }) {
  const queue = [], na = [];
  for (const m of methods) for (const e of events) {
    if (!supported(METHODS[m], e)) { na.push({ method: m, event: e.id }); continue; }
    for (let s = 1; s <= seeds; s++) queue.push({ method: m, event: e.id, seed: s, mods: { ...modsFor(s, vary), ...extra } });
  }
  queue.forEach((q, i) => { q.id = i; });
  const records = new Array(queue.length), kept = new Map();
  const n = Math.min(jobs, queue.length);
  await new Promise((resolve, reject) => {
    let next = 0, done = 0;
    const workers = [];
    const feed = (w) => {
      if (next >= queue.length) { w.postMessage("exit"); return; }
      const j = queue[next++];
      // (traces only for the first few episodes of each event: they are for the replay and the forensics)
      const key = j.method + "/" + j.event, c = kept.get(key) || 0;
      kept.set(key, c + 1);
      w.postMessage({ ...j, trace: c < keepTraces });
    };
    for (let i = 0; i < n; i++) {
      const w = new Worker(WORKER);
      workers.push(w);
      w.on("message", (m) => {
        if (m.ready) return feed(w);
        if (m.error) return reject(new Error(m.error));
        records[m.id] = m.rec; done++; onResult(m.rec, done, queue.length);
        if (done === queue.length) { workers.forEach((x) => x.terminate()); resolve(); } else feed(w);
      });
      w.on("error", reject);
    }
    if (!n) resolve();
  });
  return { records, na };
}

// per (method, event): how many passed, the interval, the verdict, how they failed
export function aggregate({ records, na }, events) {
  const by = new Map();
  for (const r of records) { const k = r.method + "/" + r.event; (by.get(k) || by.set(k, []).get(k)).push(r); }
  const rows = [];
  for (const [k, rs] of by) {
    const [method, event] = k.split("/"), ev = events.find((e) => e.id === event), pass = rs.filter((r) => r.ok).length, w = wilson(pass, rs.length), why = {};
    for (const r of rs) if (!r.ok) why[r.first] = (why[r.first] || 0) + 1;
    const pick = (f) => rs.map((r) => f(r.metrics));
    rows.push({
      method, event, level: ev.level, D: ev.D, n: rs.length, pass, rate: w.p, lo: w.lo, hi: w.hi, verdict: verdict(pass, rs.length),
      why, firstTMedian: median(rs.filter((r) => !r.ok).map((r) => r.firstT)),
      headMaxP90: quantile(pick((m) => m.headMaxDeg), 0.9), headEndMedian: median(pick((m) => m.headEndDeg)), stepsMean: mean(pick((m) => m.steps)),
      effort: mean(pick((m) => m.effort)), assistBalNm: mean(pick((m) => m.assists?.balanceRmsNm)), assistCatchN: Math.max(0, ...pick((m) => m.assists?.catchN ?? 0)), assistGetUpN: Math.max(0, ...pick((m) => m.assists?.getUpN ?? 0)),
      wallS: rs.reduce((a, r) => a + r.wallMs, 0) / 1000,
    });
  }
  for (const x of na) { const ev = events.find((e) => e.id === x.event); rows.push({ method: x.method, event: x.event, level: ev.level, D: ev.D, n: 0, pass: 0, verdict: "N/A", why: {} }); }
  return rows.sort((a, b) => a.method.localeCompare(b.method) || a.level - b.level || a.event.localeCompare(b.event));
}

// per method: each level's status, the grade (levels cleared in a row from 1), the D points earned
export function grade(rows, method) {
  const mine = rows.filter((r) => r.method === method), levels = {};
  for (const r of mine) (levels[r.level] ||= []).push(r);
  const out = [];
  let run = true, g = 0, points = 0, possible = 0;
  for (const L of Object.keys(levels).map(Number).sort((a, b) => a - b)) {
    const rs = levels[L], app = rs.filter((r) => r.verdict !== "N/A"), pass = app.filter((r) => r.verdict === "PASS");
    const status = !app.length ? "N/A" : pass.length === app.length && app.length === rs.length ? "CLEARED" : pass.length ? "PARTIAL" : app.every((r) => r.verdict === "FAIL") ? "NOT CLEARED" : "UNSURE";
    if (status === "CLEARED" && run) g = L; else run = false;
    for (const r of rs) { possible += r.D; if (r.verdict === "PASS") points += r.D; }
    out.push({ level: L, status, pass: pass.length, applicable: app.length, total: rs.length });
  }
  return { levels: out, grade: g, points, possible };
}
