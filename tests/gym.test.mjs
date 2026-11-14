// The gym (gym/): its statistics, its whole-body gate, the determinism of an episode, that the gym's
// muscle method stands her up exactly as the unit tests' harness does, and a two-seed ensemble end to end.
// (What the controllers achieve is not asserted here: that is the scoreboard's job, docs/lab/SCOREBOARD.md.)
import test from "node:test";
import assert from "node:assert/strict";
import { rng, subSeed, wilson, verdict } from "../gym/core/stats.mjs";
import { createGate } from "../gym/core/gate.mjs";
import { runEpisode, supported } from "../gym/core/episode.mjs";
import { runEnsemble, aggregate, grade } from "../gym/core/ensemble.mjs";
import { METHODS } from "../gym/methods/index.mjs";
import { EVENTS, byId } from "../gym/events/index.mjs";
import { onMuscles, dt } from "./lib/wbc-harness.mjs";

test("statistics: Wilson interval and the PASS / FAIL / UNSURE verdicts", () => {
  assert.ok(Math.abs(wilson(8, 8).lo - 0.6756) < 1e-3);
  assert.ok(Math.abs(wilson(32, 32).lo - 0.8928) < 1e-3);
  assert.ok(Math.abs(wilson(0, 8).hi - 0.3244) < 1e-3);
  assert.equal(verdict(8, 8), "UNSURE"); // eight clean runs do not clear 80 %
  assert.equal(verdict(32, 32), "PASS");
  assert.equal(verdict(0, 8), "FAIL");
  assert.equal(verdict(5, 8), "UNSURE");
  assert.equal(verdict(0, 0), "N/A");
});

test("seeds: the same seed gives the same stream, a named purpose gets its own", () => {
  const a = rng(7), b = rng(7), c = rng(8);
  const xs = Array.from({ length: 5 }, () => a.next()), ys = Array.from({ length: 5 }, () => b.next());
  assert.deepEqual(xs, ys);
  assert.notDeepEqual(xs, Array.from({ length: 5 }, () => c.next()));
  assert.notEqual(subSeed(7, "e", "init"), subSeed(7, "e", "push"));
  assert.equal(subSeed(7, "e", "init"), subSeed(7, "e", "init"));
});

test("gate: names the first rule broken and when; the transient rules can be switched off", () => {
  const g = createGate();
  const obs = (t, o = {}) => ({ t, dt: 0.011, finite: true, pelvisZ: 0.9, headDeg: 3, bodyN: 0, ...o });
  g.step(obs(0.1)); g.step(obs(0.2, { headDeg: 40 })); g.step(obs(0.3, { pelvisZ: 0.4 }));
  const v = g.finish({ t: 1, finite: true, pelvisZ: 0.9, headDeg: 3, support: "double", comSpeed: 0.01 });
  assert.deepEqual(v.map((x) => x.rule), ["head", "up"]);
  assert.equal(v[0].t, 0.2);
  // end rules
  const e = createGate().finish({ t: 5, finite: true, pelvisZ: 0.5, headDeg: 50, support: "moving", comSpeed: 0.3 });
  assert.deepEqual(e.map((x) => x.rule).sort(), ["end-up", "head-end", "settled", "support-end"]);
  // a body contact must last: 0.05 s of it is not a violation, 0.3 s is
  const b1 = createGate(); for (let t = 0; t < 5; t++) b1.step(obs(t * 0.011, { bodyN: 100 }));
  assert.equal(b1.first.has("body"), false);
  const b2 = createGate(); for (let t = 0; t < 30; t++) b2.step(obs(t * 0.011, { bodyN: 100 }));
  assert.equal(b2.first.has("body"), true);
  // falling and getting up: only the end counts
  const f = createGate({ transient: false });
  f.step(obs(0.1, { headDeg: 120, pelvisZ: 0.1, bodyN: 500 })); f.step(obs(0.2, { headDeg: 120, pelvisZ: 0.1, bodyN: 500 }));
  assert.deepEqual(f.finish({ t: 9, finite: true, pelvisZ: 0.9, headDeg: 2, support: "double", comSpeed: 0 }), []);
  // not finite
  const n = createGate(); n.step(obs(0.1, { finite: false }));
  assert.equal(n.first.get("finite").t, 0.1);
});

test("events: every event is well formed, and a method lacking a command is N/A on it", () => {
  const ids = new Set();
  for (const e of EVENTS) {
    assert.ok(!ids.has(e.id), `duplicate ${e.id}`); ids.add(e.id);
    assert.ok(e.level >= 1 && e.level <= 10 && e.D > 0 && e.T > 0 && e.script.length > 0, e.id);
    for (const s of e.script) assert.ok(typeof s.cmd === "string" && s.t >= 0, e.id);
    for (const d of e.disturbances) assert.ok(d.N > 0 && d.dur > 0 && d.dir.length === 3, e.id);
  }
  assert.equal(supported(METHODS.motors, byId["hold.L"]), false); // the motors have no one-foot hold
  assert.equal(supported(METHODS.wbc, byId["turn.180"]), false); // the muscles do not turn yet
  assert.equal(supported(METHODS.wbc, byId["hold.L"]), true);
});

const SHORT = { id: "test.stand", level: 1, D: 1, T: 1.5, world: {}, script: [{ t: 0, cmd: "stand" }], disturbances: [{ t: 0.5, dur: 0.1, part: "Spine02", dir: [0, 1, 0], N: 40 }], gate: { comSpeedEnd: 5, support: null } };
test("episode: deterministic in (method, event, seed); another seed gives another start", () => {
  const run = (seed) => { const r = runEpisode({ method: METHODS.wbc, event: SHORT, seed }); delete r.wallMs; return r; };
  const a = run(7), b = run(7), c = run(8);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.metrics, c.metrics);
  assert.ok(a.simS > 1.4 && a.metrics.headMaxDeg < 30);
});

test("the gym's muscle method stands her up exactly as the unit tests' harness does (same physics, same numbers)", () => {
  const ev = { ...SHORT, id: "test.hold", T: 5, disturbances: [], script: [{ t: 1, cmd: "hold", foot: "L", jitterT: 0 }], gate: { support: "single" } };
  const g = runEpisode({ method: METHODS.wbc, event: ev, seed: 1, mods: { jointStdDeg: 0 } });
  const h = onMuscles(5, { fsm: true, each: (t, R, W) => { if (Math.abs(t - 1) < dt / 2) W.requestSingleLeg("L"); } });
  assert.equal(g.fsm, h.W.fsm.log.map((e) => `${e[0]}:${e[2]}`).join(">"));
  assert.ok(Math.abs(g.metrics.headMaxDeg - h.headMax) < 0.1, `head max ${g.metrics.headMaxDeg} against ${h.headMax.toFixed(1)}`);
  assert.ok(Math.abs(g.metrics.headEndDeg - h.headEnd) < 0.1);
});

test("ensemble: two seeds in worker threads, aggregated, graded; N/A events are listed, not run", async () => {
  const events = [byId["stand.push60.fwd"], byId["hold.L"]];
  const res = await runEnsemble({ methods: ["motors"], events, seeds: 2, jobs: 2 });
  assert.equal(res.records.length, 2);
  assert.deepEqual(res.na, [{ method: "motors", event: "hold.L" }]);
  const rows = aggregate(res, EVENTS);
  assert.equal(rows.length, 2);
  const row = rows.find((r) => r.event === "stand.push60.fwd");
  assert.equal(row.n, 2);
  assert.ok(["PASS", "FAIL", "UNSURE"].includes(row.verdict));
  assert.equal(rows.find((r) => r.event === "hold.L").verdict, "N/A");
  const g = grade(rows, "motors");
  assert.ok(g.levels.length === 2 && g.possible > 0);
  // (the first records keep a trace)
  assert.ok(Array.isArray(res.records[0].trace) && res.records[0].trace.length > 10);
});
