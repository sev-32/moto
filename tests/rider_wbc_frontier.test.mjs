// The frontier of her whole-body muscle control, as tests that say what "done" means.
// Each is a `todo` (node:test): it runs and its result is printed, but while the capability is not
// there a failure does not fail the suite; the day one passes, its "# TODO" line turns green and the
// flag comes off. They state docs/PHYSICS.md's "not yet / known" list (*On her own muscles,
// standing*), measured at the current controller (src/core/46_rider_wbc.js), with the same harness
// as tests/rider_wbc.test.mjs and NO motors, pose servos or balance assist: her muscles alone.
//
// A scenario counts as done only if the whole body is sound, not just the pelvis (R584: a gate that
// looked at the pelvis alone called a body with its head at 83 deg settled). The gate below is the
// first, local version of that contract (P1.1 of docs/BIOMECH_PLAN.md makes it shared):
//   up       the pelvis never below 0.6 m
//   head     the head within 30 deg of upright at every instant, within 10 deg at the end
//   settled  back on two feet (the support state machine in "double") and her centre of mass slower
//            than 0.05 m/s at the end
import test from "node:test";
import assert from "node:assert/strict";
import { onMuscles, dt } from "./lib/wbc-harness.mjs";

const HEAD_MAX = 30, HEAD_END = 10, COM_SPEED_END = 0.05;
function gate(o) {
  const v = [];
  if (!o.finite) v.push("state not finite");
  if (o.fell != null) v.push(`pelvis below 0.6 m at ${o.fell.toFixed(2)} s`);
  if (o.headMax > HEAD_MAX) v.push(`head ${o.headMax.toFixed(0)} deg at worst (limit ${HEAD_MAX})`);
  if (o.headEnd > HEAD_END) v.push(`head ${o.headEnd.toFixed(0)} deg at the end (limit ${HEAD_END})`);
  if (o.W.fsm.state !== "double") v.push(`support state "${o.W.fsm.state}" at the end, not "double"`);
  const sp = Math.hypot(...o.b.momentum(o.b.massMatrix()).vcom);
  if (!(sp < COM_SPEED_END)) v.push(`centre of mass at ${sp.toFixed(2)} m/s at the end`);
  return v;
}
const foot = (o, S) => o.b.ow[o.R.foot[S].link].slice();
const sub = (a, c) => a.map((x, i) => x - c[i]);

for (const [swing, name] of [["L", "left"], ["R", "right"]]) {
  test(`a voluntary step forward 0.15 m with her ${name} foot, then she stands: whole-body gate`, { todo: "the step lands, then she drifts into reactive steps and falls (left at ~6.7 s, right at ~5.9 s)" }, () => {
    let p0 = null;
    const o = onMuscles(8, { fsm: true, each: (t, R, W, o_) => {
      if (Math.abs(t - 1) < dt / 2) { p0 = foot(o_, swing); W.requestStep(swing, [0, 0.15]); }
    } });
    const d = sub(foot(o, swing), p0), fw = [-Math.sin(o.W.heading), Math.cos(o.W.heading)];
    assert.deepEqual(gate(o), []);
    assert.ok(d[0] * fw[0] + d[1] * fw[1] > 0.10, `the foot moved ${(d[0] * fw[0] + d[1] * fw[1]).toFixed(2)} m forward`);
  });
  test(`a voluntary step out 0.12 m with her ${name} foot, then she stands: whole-body gate`, { todo: "the step lands and she stands, but her head swings out to ~42 deg during it (limit 30)" }, () => {
    let p0 = null;
    const o = onMuscles(8, { fsm: true, each: (t, R, W, o_) => {
      if (Math.abs(t - 1) < dt / 2) { p0 = foot(o_, swing); W.requestStep(swing, [swing === "L" ? -0.12 : 0.12, 0]); }
    } });
    const d = sub(foot(o, swing), p0);
    assert.deepEqual(gate(o), []);
    assert.ok(Math.abs(d[0]) > 0.08, `the foot moved ${d[0].toFixed(2)} m across`);
  });
}

test("a voluntary step back 0.12 m with her left foot, then she stands: whole-body gate", { todo: "the step lands, then a chain of reactive steps and a fall at ~4.7 s" }, () => {
  const o = onMuscles(8, { fsm: true, each: (t, R, W) => { if (Math.abs(t - 1) < dt / 2) W.requestStep("L", [0, -0.12]); } });
  assert.deepEqual(gate(o), []);
});

test("a 150 N push forward at the chest for 0.1 s: she takes a reactive step (or two) and stands: whole-body gate", { todo: "she steps, keeps stepping and falls at ~2.6 s" }, () => {
  const o = onMuscles(8, { fsm: true, push: { t: 1, dur: 0.1, F: [0, 150, 0] } });
  assert.ok(o.W.fsm.log.some((e) => e[2] === "swing"), "no step was taken");
  assert.deepEqual(gate(o), []);
});

test("walk: 10 steps of 0.25 m from standing, then she stops: whole-body gate and 2 m covered", { todo: "she falls after 2 landings, ~3.2 s (the walk's plan runs on after she has fallen)" }, () => {
  let p0 = null;
  const o = onMuscles(15, { fsm: true, each: (t, R, W, o_) => { if (Math.abs(t - 1) < dt / 2) { p0 = o_.b.totals().com; W.requestWalk({ n: 10, step: [0.25, 0] }); } } });
  const c = o.b.totals().com;
  assert.deepEqual(gate(o), []);
  assert.ok(Math.hypot(c[0] - p0[0], c[1] - p0[1]) > 2.0, `covered ${Math.hypot(c[0] - p0[0], c[1] - p0[1]).toFixed(2)} m`);
});
