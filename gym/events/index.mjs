// The events. Each is data plus an optional `check` for what the whole-body gate does not say.
//
//   level      1..10, the difficulty ladder (docs/GYM.md)
//   D          its difficulty value, a gymnast's "D score": what clearing it is worth
//   T          seconds simulated
//   script     [{ t, cmd, ... }]  intents, method-agnostic: stand | hold | step | walkTo | turn | ragdoll
//   disturbances  [{ t, dur, part, dir, N, jitterT, jitterN, jitterDeg }]  pushes, jittered by the seed
//   gate       overrides of core/gate.mjs's thresholds
//   maxSteps   most steps allowed (a hold-your-ground event allows 0)
//   check(ctx) -> [{ rule, detail }]  event-specific failures; ctx = { end, atCmd, metrics, comEx, oneFootS, t }
// A method that lacks one of the script's commands is not scored on the event (N/A), not failed.
export const EVENTS = [];
const add = (e) => EVENTS.push({ apparatus: "floor", D: 1, T: 8, world: {}, script: [], disturbances: [], ...e });
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const DIRS = { fwd: [0, 1, 0], back: [0, -1, 0], left: [-1, 0, 0], right: [1, 0, 0] };
const need = (cond, rule, detail) => (cond ? [] : [{ rule, detail }]);

// ---- Level 1 - Stand: hold still, take a small push
add({
  id: "stand.quiet", level: 1, D: 1.0, T: 10, title: "Quiet stance for 10 s",
  script: [{ t: 0, cmd: "stand" }],
  check: (c) => need(c.comEx < 0.03, "drift", `centre of mass moved ${(1000 * c.comEx).toFixed(0)} mm (limit 30)`),
});
for (const [name, dir] of Object.entries(DIRS)) {
  add({
    id: `stand.push60.${name}`, level: 1, D: 1.5, T: 5, title: `60 N shove at the chest, ${name}, hold your ground`,
    script: [{ t: 0, cmd: "stand" }], disturbances: [{ t: 1, dur: 0.1, part: "Spine02", dir, N: 60 }], maxSteps: 0,
  });
}

// ---- Level 2 - Shift and hold: a harder shove, one foot
for (const [name, dir] of Object.entries(DIRS)) {
  add({
    id: `stand.push100.${name}`, level: 2, D: 2.0, T: 5, title: `100 N shove at the chest, ${name}, hold your ground`,
    script: [{ t: 0, cmd: "stand" }], disturbances: [{ t: 1, dur: 0.1, part: "Spine02", dir, N: 100 }], maxSteps: 0,
  });
}
for (const foot of ["L", "R"]) {
  add({
    id: `hold.${foot}`, level: 2, D: 2.5, T: 7, title: `Shift onto the ${foot === "L" ? "left" : "right"} foot and hold the other up`,
    script: [{ t: 1, cmd: "hold", foot }], gate: { support: "single" },
    check: (c) => need(c.oneFootS > 3, "one-foot", `on one foot ${c.oneFootS.toFixed(1)} s (needs 3)`),
  });
}

// ---- Level 3 - Step: place a foot, answer a shove with a step
const stepEv = (id, foot, across, along, title) => add({
  id, level: 3, D: 3.0, T: 8, title,
  script: [{ t: 1, cmd: "step", foot, across, along }],
  check: (c) => {
    const a = c.atCmd[0]?.obs?.foot?.[foot], e = c.end.foot?.[foot];
    if (!a || !e) return [{ rule: "step", detail: "no foot position" }];
    const d = [e[0] - a[0], e[1] - a[1]], want = Math.hypot(across, along), got = (d[0] * across + d[1] * along) / want;
    return need(got > 0.6 * want, "step", `the foot moved ${got.toFixed(2)} m of the ${want.toFixed(2)} m asked`);
  },
});
stepEv("step.out.L", "L", -0.12, 0, "Step the left foot out 0.12 m, then stand");
stepEv("step.out.R", "R", 0.12, 0, "Step the right foot out 0.12 m, then stand");
stepEv("step.fwd.L", "L", 0, 0.15, "Step the left foot forward 0.15 m, then stand");
stepEv("step.fwd.R", "R", 0, 0.15, "Step the right foot forward 0.15 m, then stand");
stepEv("step.back.L", "L", 0, -0.12, "Step the left foot back 0.12 m, then stand");
stepEv("step.back.R", "R", 0, -0.12, "Step the right foot back 0.12 m, then stand");
add({
  id: "stand.push150.reactive", level: 3, D: 3.5, T: 8, title: "150 N shove at the chest: take whatever steps it needs, then stand",
  script: [{ t: 0, cmd: "stand" }], disturbances: [{ t: 1, dur: 0.1, part: "Spine02", dir: DIRS.fwd, N: 150 }],
});

// ---- Level 4 - Walk: go somewhere, turn, stop
add({
  id: "walk.2m5", level: 4, D: 4.0, T: 14, title: "Walk 2.5 m straight ahead and stop",
  script: [{ t: 1, cmd: "walkTo", along: 2.5 }],
  check: (c) => {
    const y = c.end.com[1] - c.atCmd[0].obs.com[1], x = c.end.com[0] - c.atCmd[0].obs.com[0];
    return [...need(y > 2.0 && y < 3.2, "distance", `covered ${y.toFixed(2)} m of 2.5`), ...need(Math.abs(x) < 0.4, "line", `${x.toFixed(2)} m off the line`)];
  },
});
add({
  id: "turn.180", level: 4, D: 4.0, T: 10, title: "Turn on the spot through 180 deg and stand",
  script: [{ t: 0.5, cmd: "turn", deg: 180 }],
  check: (c) => need(Math.abs(wrap(c.end.yaw - Math.PI)) < 25 * Math.PI / 180, "heading", `facing ${(c.end.yaw * 180 / Math.PI).toFixed(0)} deg, not 180`),
});

// ---- Level 7 - Recover: down on the ground, back on her feet
for (const [name, dir, N] of [["back", [0, -1, 0], 260], ["front", [0, 1, 0], 260], ["side", [1, 0, 0], 260]]) {
  add({
    id: `recover.getup.${name}`, level: 7, D: 7.0, T: 20, title: `Limp, shoved ${name}, down on the ground: get up and stand`,
    script: [{ t: 0.5, cmd: "ragdoll" }], disturbances: [{ t: 0.5, dur: 0.12, part: "Hip", dir, N, jitterT: 0.02 }],
    gate: { transient: false, comSpeedEnd: 0.1 },
  });
}
export const byId = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
