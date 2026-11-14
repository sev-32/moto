// The whole-body gate: one definition of a sound episode, used by every event and every method.
//
// R584: a "settled" label that looked at the pelvis alone passed a body whose head hung at 83 deg.
// So the gate looks at the whole body, at every instant, and tells which rule broke first and when.
//
//   finite    the state stays finite
//   up        the pelvis never below `minPelvisZ`
//   head      the head within `headMaxDeg` of upright at every instant      (transient rules)
//   body      nothing but the allowed contacts (the soles; the event may add hands, knees) bears on
//             the ground for more than `bodyContactS` seconds at more than `bodyContactN`
//   headEnd   at the end the head within `headEndDeg` of upright
//   settled   at the end back on two feet (`support` "double") and the centre of mass slower than
//             `comSpeedEnd`
//
// An event may override any threshold, or switch the transient rules off (`transient: false`, for
// falling and getting up: only the end counts) or the end rules (`end: false`).
export const GATE = {
  minPelvisZ: 0.6, headMaxDeg: 30, headEndDeg: 10, comSpeedEnd: 0.05, endMinPelvisZ: 0.8,
  bodyContactN: 20, bodyContactS: 0.1, transient: true, end: true, support: "double",
};

export function createGate(over = {}) {
  const cfg = { ...GATE, ...over };
  const g = { cfg, first: new Map(), headMax: 0, pelvisMinZ: Infinity, bodyS: 0, bodyMaxN: 0 };
  const flag = (rule, t, detail) => { if (!g.first.has(rule)) g.first.set(rule, { rule, t: +t.toFixed(3), detail }); };
  // obs: { t, dt, finite, pelvisZ, headDeg, bodyN }
  g.step = (o) => {
    if (!o.finite) { flag("finite", o.t, "state not finite"); return; }
    g.pelvisMinZ = Math.min(g.pelvisMinZ, o.pelvisZ);
    if (o.headDeg != null) g.headMax = Math.max(g.headMax, o.headDeg);
    if (o.bodyN != null) { g.bodyMaxN = Math.max(g.bodyMaxN, o.bodyN); g.bodyS = o.bodyN > cfg.bodyContactN ? g.bodyS + o.dt : 0; }
    if (!cfg.transient) return;
    if (o.pelvisZ < cfg.minPelvisZ) flag("up", o.t, `pelvis at ${o.pelvisZ.toFixed(2)} m`);
    if (o.headDeg != null && o.headDeg > cfg.headMaxDeg) flag("head", o.t, `head ${o.headDeg.toFixed(0)} deg (limit ${cfg.headMaxDeg})`);
    if (g.bodyS > cfg.bodyContactS) flag("body", o.t, `a non-foot contact bears ${o.bodyN.toFixed(0)} N`);
  };
  // end: { t, finite, pelvisZ, headDeg, support, comSpeed }
  g.finish = (e) => {
    if (cfg.end && e.finite) {
      if (e.pelvisZ < cfg.endMinPelvisZ) flag("end-up", e.t, `pelvis at ${e.pelvisZ.toFixed(2)} m at the end`);
      if (e.headDeg != null && e.headDeg > cfg.headEndDeg) flag("head-end", e.t, `head ${e.headDeg.toFixed(0)} deg at the end (limit ${cfg.headEndDeg})`);
      if (cfg.support && e.support !== cfg.support) flag("support-end", e.t, `support "${e.support}" at the end, not "${cfg.support}"`);
      if (!(e.comSpeed < cfg.comSpeedEnd)) flag("settled", e.t, `centre of mass at ${e.comSpeed.toFixed(2)} m/s at the end`);
    }
    return [...g.first.values()].sort((a, b) => a.t - b.t);
  };
  return g;
}
