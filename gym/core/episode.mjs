// One episode: a method on an event for a seed.
//
// The runner owns the clock, the scripted commands, the disturbances (jittered by the seed) and the
// whole-body gate; the method only moves her. Everything is deterministic in (method, event, seed,
// mods): the same call gives the same record on any machine.
import { rng as makeRng, subSeed } from "./stats.mjs";
import { createGate } from "./gate.mjs";
import { makeWorld } from "./world.mjs";

export const DT = 1 / 540, GATE_EVERY = 6, TRACE_EVERY = 27; // gate at 90 Hz, trace at 20 Hz
const DEG = Math.PI / 180;

export const needsOf = (event) => [...new Set(event.script.map((s) => s.cmd))];
export const supported = (method, event) => needsOf(event).every((c) => method.supports.includes(c));

export function runEpisode({ method, event, seed, mods = {}, trace = false }) {
  const wall0 = performance.now();
  const world = makeWorld(event.world, mods);
  const agent = method.create({ world, rng: makeRng(subSeed(seed, event.id, "init")), mods });
  const gate = createGate(event.gate);
  const prng = makeRng(subSeed(seed, event.id, "push"));
  const pushes = (event.disturbances || []).map((d) => {
    const yaw = prng.uniform(-1, 1) * (d.jitterDeg ?? 10) * DEG, c = Math.cos(yaw), s = Math.sin(yaw);
    const n = d.N * (1 + prng.uniform(-1, 1) * (d.jitterN ?? 0.1));
    return { part: d.part, dur: d.dur, t0: Math.max(0, d.t + prng.uniform(-1, 1) * (d.jitterT ?? 0.1)), F: [n * (d.dir[0] * c - d.dir[1] * s), n * (d.dir[0] * s + d.dir[1] * c), n * d.dir[2]] };
  });
  // (commands arrive with a little timing jitter, +-20 ms by default: a one-foot hold that depends on the
  // control tick a command lands in - measured: 9 ms moved a head from 3 to 46 deg - is not robust)
  const jrng = makeRng(subSeed(seed, event.id, "cmd"));
  const script = event.script.map((s) => ({ ...s, t: s.t + (s.t > 0 ? jrng.uniform(-1, 1) * (s.jitterT ?? 0.02) : 0), done: false })).sort((a, b) => a.t - b.t);
  const nSteps = Math.round(event.T / DT), transient = event.gate?.transient !== false;
  const atCmd = [], tr = [];
  let t = 0, obs = null, comRef = null, comEx = 0, headRelMax = 0, oneFootS = 0, ended = false;
  for (let i = 0; i <= nSteps; i++) {
    t = i * DT;
    const active = pushes.filter((p) => t >= p.t0 && t < p.t0 + p.dur);
    agent.step(DT, active.length ? active : null);
    // (a command is issued at the end of the step its time arrives in, as tests/rider_wbc.test.mjs does)
    for (const s of script) if (!s.done && t >= s.t) { s.done = true; atCmd.push({ cmd: s, obs: agent.observe() }); agent.command(s); }
    if (i % GATE_EVERY === 0 || i === nSteps) {
      obs = agent.observe();
      gate.step({ t, dt: GATE_EVERY * DT, finite: obs.finite, pelvisZ: obs.pelvisZ, headDeg: obs.headDeg, bodyN: obs.bodyN });
      if (!obs.finite) { ended = true; break; }
      if (obs.headRelDeg > headRelMax) headRelMax = obs.headRelDeg;
      if (obs.feetOn.L !== obs.feetOn.R) oneFootS += GATE_EVERY * DT;
      if (comRef) comEx = Math.max(comEx, Math.hypot(obs.com[0] - comRef[0], obs.com[1] - comRef[1])); else if (t >= 1) comRef = obs.com;
      if (trace && i % TRACE_EVERY === 0) tr.push([+t.toFixed(2), ...obs.pelvis.map((x) => +x.toFixed(3)), +obs.headDeg.toFixed(1), ...obs.com.map((x) => +x.toFixed(3)), obs.support]);
      const down = gate.first.get("up");
      if (transient && down && t - down.t > 0.5) { ended = true; break; } // (she is down: no point simulating on)
    }
  }
  if (!obs || obs.finite !== false) obs = agent.observe();
  const comSpeed = obs.finite ? Math.hypot(...obs.comV) : NaN;
  const violations = gate.finish({ t, finite: obs.finite, pelvisZ: obs.pelvisZ, headDeg: obs.headDeg, support: obs.support, comSpeed });
  const am = agent.metrics();
  const metrics = {
    headMaxDeg: +gate.headMax.toFixed(1), headRelMaxDeg: +headRelMax.toFixed(1), headEndDeg: obs.headDeg == null ? null : +obs.headDeg.toFixed(1),
    pelvisMinZ: +gate.pelvisMinZ.toFixed(3), comSpeedEnd: +comSpeed.toFixed(3), bodyMaxN: +gate.bodyMaxN.toFixed(0),
    comExcursionM: +comEx.toFixed(4), oneFootS: +oneFootS.toFixed(2), steps: am.steps, effort: am.effort == null ? null : +am.effort.toFixed(4), assists: am.assists,
  };
  const ctx = { event, end: obs, atCmd, metrics, comEx, oneFootS, t, mods };
  if (event.maxSteps != null && am.steps > event.maxSteps) violations.push({ rule: "steps", t: +t.toFixed(3), detail: `${am.steps} steps (allowed ${event.maxSteps})` });
  for (const v of event.check?.(ctx) || []) violations.push({ t: +t.toFixed(3), ...v });
  violations.sort((a, b) => a.t - b.t);
  return {
    event: event.id, method: method.id, seed, mods, ok: violations.length === 0, violations, first: violations[0]?.rule || null,
    firstT: violations[0]?.t ?? null, simS: +t.toFixed(2), endedEarly: ended, wallMs: Math.round(performance.now() - wall0), metrics, fsm: am.fsm || null, trace: trace ? tr : undefined,
  };
}
