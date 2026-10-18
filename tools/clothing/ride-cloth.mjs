#!/usr/bin/env node
// The LUCID Clothing Engine R1 (vendored, unchanged) on her: her canonical skin in her riding
// postures drives the engine's body; the T-shirt and jeans are simulated on it as the engine's
// own outfit qualification sets them up (settings, layer coupling, production initialisation:
// snap the body to the pose, rebuild each garment from its carriers, settle the cloth, then
// enable the layer). Reports the engine's gates and the cost; dumps the last frame (engine frame).
//
//   node tools/clothing/ride-cloth.mjs [--sequence seated,tuck,hangR,seated] [--hold 1.0] [--blend 0.6]
//        [--wind 0,20] [--garments jeans,shirt] [--cut] [--knee-bellows M] [--knee-dart S]
//        [--jeans-settings JSON] [--shirt-settings JSON] [--out DIR]
//
// Postures: tests/fixtures/rider_poses.json (tools/clothing/capture-poses.mjs), plus "rest". Her
// placement's rotation is kept (gravity acts on her as on the bike), her heading turned to face
// the engine's +Z; the wind is the air from ahead.
import fs from "node:fs";
import path from "node:path";
import { ROOT, read, mods, character, engineBody, buildWardrobe, skinWorld, headingFree, applyRidingCut, ridingCutAsset } from "./engine.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); return i < 0 ? d : args[i + 1]; };
const flag = (k) => args.includes("--" + k);
const sequence = String(opt("sequence", "seated,tuck,hangR,seated")).split(",");
const hold = Number(opt("hold", 1.0)), blend = Number(opt("blend", 0.6));
const winds = String(opt("wind", "0")).split(",").map(Number);
const out = path.resolve(opt("out", path.join(ROOT, "tmp/ride-cloth")));
const garments = String(opt("garments", "jeans,shirt")).split(",");
const jsonOpt = (k) => JSON.parse(opt(k, "{}"));
const ch = character(), body = engineBody(ch), poses = read(path.join(ROOT, "tests/fixtures/rider_poses.json"));

// pattern authoring as the engine's pants stress harness does it (verifyPantsStress.mjs): a front-knee
// bellows adds longitudinal material path before the rest metric is derived; a knee dart lengthens the
// front-knee longitudinal rest edges (Human Engine frame, knee centre y 0.456 m)
const kneeBellowsM = Number(opt("knee-bellows", 0)), kneeDartScale = Number(opt("knee-dart", 0)), kneeY = 0.456;
const authoring = (assets) => {
  if (!kneeBellowsM) return;
  const Pj = assets.jeans.positions, n = assets.jeans.meta.shellVertexCount, sigma = 0.07, cz = 0.002;
  for (let i = 0; i < n; i++) { const p = i * 3, y = Pj[p + 1], z = Pj[p + 2], wy = Math.exp(-Math.pow((y - kneeY) / sigma, 2)); if (wy < 0.01) continue; const front = (z - cz) / 0.075, fw = front <= 0 ? 0 : Math.min(1, front); if (fw <= 0) continue; Pj[p + 2] += kneeBellowsM * wy * fw; }
};
const t0 = performance.now();
const { W, g, layer, proxy, assets } = buildWardrobe(body, { garments, authoring, settings: { jeans: jsonOpt("jeans-settings"), shirt: jsonOpt("shirt-settings") } });
if (g.jeans && kneeDartScale) {
  const S = g.jeans.solver, Pr = S.rest, rest = S.edgeRestAuthored || S.edgeRest, sigma = 0.07, cz = 0.002;
  for (let e = 0; e < S.edges.length; e += 2) { const ei = e >> 1, a = S.edges[e], b = S.edges[e + 1]; if (a >= S.shellVertexCount || b >= S.shellVertexCount) continue; const pa = a * 3, pb = b * 3, my = 0.5 * (Pr[pa + 1] + Pr[pb + 1]), mz = 0.5 * (Pr[pa + 2] + Pr[pb + 2]), dx = Pr[pb] - Pr[pa], dy = Pr[pb + 1] - Pr[pa + 1], dz = Pr[pb + 2] - Pr[pa + 2], L = Math.hypot(dx, dy, dz) || 1, orient = Math.abs(dy) / L; if (orient < 0.5) continue; const wy = Math.exp(-Math.pow((my - kneeY) / sigma, 2)), front = Math.max(0, Math.min(1, (mz - cz) / 0.075)); if (wy < 0.01 || front <= 0) continue; rest[ei] *= 1 + kneeDartScale * wy * front * Math.pow((orient - 0.5) / 0.5, 1.2); }
}
const cut = flag("cut") ? ridingCutAsset() : null, cutApplied = {};
if (flag("cut") && !cut) throw Error("no riding cut asset: run tools/clothing/riding-cut.mjs");
for (const [id, gg] of Object.entries(g)) if (cut?.garments?.[id]) cutApplied[id] = applyRidingCut(gg.solver, cut.garments[id]);
console.log(`engine built in ${(performance.now() - t0).toFixed(0)} ms`, cut ? "riding cut " + JSON.stringify(cutApplied) : "");

// ---- the ride: postures in sequence, blended (commands and placement), wind from ahead
const REST = { commands: {}, placement: { R: [1, 0, 0, 0, 0, -1, 0, 1, 0] } }; // standing, facing world +Y
const P = (k) => (k === "live" ? poses.live : k === "rest" ? REST : poses.postures[k]);
const lerp = (a, b, t) => a + (b - a) * t;
function blendPose(a, b, t) {
  const cmds = {};
  for (const d of ch.dofs) cmds[d.id] = lerp(a.commands[d.id] ?? 0, b.commands[d.id] ?? 0, t);
  const Ra = headingFree(a.placement.R), Rb = headingFree(b.placement.R), M = Ra.map((v, i) => lerp(v, Rb[i], t));
  // (re-orthonormalised: the postures' rotations are close)
  const c0 = [M[0], M[3], M[6]], c1 = [M[1], M[4], M[7]], n0 = Math.hypot(...c0);
  c0.forEach((v, i) => (c0[i] = v / n0));
  const d = c0[0] * c1[0] + c0[1] * c1[1] + c0[2] * c1[2];
  c1.forEach((v, i) => (c1[i] = v - d * c0[i]));
  const n1 = Math.hypot(...c1);
  c1.forEach((v, i) => (c1[i] = v / n1));
  const c2 = [c0[1] * c1[2] - c0[2] * c1[1], c0[2] * c1[0] - c0[0] * c1[2], c0[0] * c1[1] - c0[1] * c1[0]];
  return { cmds, R: [c0[0], c1[0], c2[0], c0[1], c1[1], c2[1], c0[2], c1[2], c2[2]] };
}
const dt = 1 / 120, fps = 60, steps = Math.round(1 / (dt * fps));
const smooth = (x) => x * x * (3 - 2 * x);
const totalT = sequence.length * hold + (sequence.length - 1) * blend;
function poseAt(t) {
  let u = t;
  for (let k = 0; k < sequence.length; k++) {
    if (u <= hold || k === sequence.length - 1) return blendPose(P(sequence[k]), P(sequence[k]), 0);
    u -= hold;
    if (u <= blend) return blendPose(P(sequence[k]), P(sequence[k + 1]), smooth(u / blend));
    u -= blend;
  }
}
const first = poseAt(0), Xs = skinWorld(ch, first.cmds, first.R);
const b = body.gather(Xs);
const prevBody = new Float32Array(b.P), Xlast = Float64Array.from(Xs), Xi = new Float64Array(Xs.length);
W.setBodySurface(b.P, b.N, b.P, dt);
for (const gg of W.garments) gg.solver.reanchorToCurrentBody({ safetyPasses: 4 });
for (let w = 0; w < 12; w++) { W.setBodySurface(b.P, b.N, b.P, dt); W.stepFrame(dt); }
if (layer) layer.settings.enabled = true;
for (let w = 0; w < 8; w++) { W.setBodySurface(b.P, b.N, b.P, dt); W.stepFrame(dt); }

const rows = [];
const worst = { shirtP95: 0, shirtP99: 0, jeansP95: 0, jeansP99: 0, shirtInside: 0, jeansInside: 0, layerBehind: 0, containmentOutside: 0 };
let msBody = 0, msCloth = 0, frames = 0;
const Z = { shellP95Strain: 0, shellP99Strain: 0, maxSpeedMps: 0, finite: true };
for (const wind of winds) {
  for (let f = 0; f * (1 / fps) <= totalT; f++) {
    const t = f / fps, q = poseAt(t);
    let tb = performance.now();
    const X = skinWorld(ch, q.cmds, q.R);
    msBody += performance.now() - tb;
    const ramp = Math.min(1, t / 0.5); // the air from ahead (engine +Z is her forward), ramped in
    for (const gg of W.garments) gg.solver.setWind(wind * ramp, 180, 0);
    tb = performance.now();
    for (let s = 1; s <= steps; s++) { // the body between frames, at the engine's 120 Hz
      for (let i = 0; i < X.length; i++) Xi[i] = Xlast[i] + (X[i] - Xlast[i]) * (s / steps);
      prevBody.set(b.P); body.gather(Xi, [0, 0, 0], b.P, b.N);
      W.setBodySurface(b.P, b.N, prevBody, dt); W.stepFrame(dt);
    }
    Xlast.set(X);
    msCloth += performance.now() - tb; frames++;
    if (f % 15 === 0) {
      const sm = g.shirt ? g.shirt.solver.metrics() : Z, jm = g.jeans ? g.jeans.solver.metrics() : Z;
      const sa = g.shirt ? proxy.auditPoints(g.shirt.solver.pos, { start: 0, end: g.shirt.solver.shellVertexCount }) : { inside: 0 };
      const ja = g.jeans ? proxy.auditPoints(g.jeans.solver.pos, { start: 0, end: g.jeans.solver.shellVertexCount }) : { inside: 0 };
      const la = layer ? layer.audit() : { behind: 0 }, ca = jm.pantsContainment?.audit;
      const row = { wind, t: +t.toFixed(2), shirtP95: +sm.shellP95Strain.toFixed(3), shirtP99: +sm.shellP99Strain.toFixed(3), jeansP95: +jm.shellP95Strain.toFixed(3), jeansP99: +jm.shellP99Strain.toFixed(3), shirtInside: sa.inside, jeansInside: ja.inside, layerBehind: la.behind, containmentOutside: ca?.outside ?? null, finite: sm.finite && jm.finite };
      for (const k of ["shirtP95", "shirtP99", "jeansP95", "jeansP99", "shirtInside", "jeansInside", "layerBehind"]) worst[k] = Math.max(worst[k], row[k]);
      worst.containmentOutside = Math.max(worst.containmentOutside, row.containmentOutside ?? 0);
      rows.push(row);
      console.log(JSON.stringify(row));
    }
  }
}
fs.mkdirSync(out, { recursive: true });
const w = (n, a) => fs.writeFileSync(path.join(out, n), Buffer.from(a.buffer, a.byteOffset, a.byteLength));
w("BODY_POSITIONS.f32", b.P); w("BODY_INDICES.u32", body.indices);
if (g.shirt) { w("SHIRT_POSITIONS.f32", g.shirt.solver.renderPositions); w("SHIRT_INDICES.u32", assets.shirt.indices); w("SHIRT_COLORS.f32", assets.shirt.colors); }
if (g.jeans) {
  const detail = new mods.JeansDetailRuntime(read(path.join(ROOT, "assets/character/clothing/lucid_human_native_jeans_v1_details.json")), assets.jeans.indices);
  detail.update(g.jeans.solver.renderPositions);
  w("JEANS_POSITIONS.f32", g.jeans.solver.renderPositions); w("JEANS_INDICES.u32", assets.jeans.indices); w("JEANS_COLORS.f32", assets.jeans.colors);
  w("DETAIL_POSITIONS.f32", detail.positions); w("DETAIL_INDICES.u32", detail.indices); w("DETAIL_COLORS.f32", detail.colors);
}
const report = { sequence, hold, blend, winds, garments, ridingCut: cut ? { eps: cut.eps, cap: cut.cap, applied: cutApplied } : null, kneeBellowsM, kneeDartScale,
  jeansSettings: jsonOpt("jeans-settings"), shirtSettings: jsonOpt("shirt-settings"), simHz: 120, frames,
  msPerFrame: { body: +(msBody / frames).toFixed(2), cloth: +(msCloth / frames).toFixed(2) }, worst, rows };
fs.writeFileSync(path.join(out, "REPORT.json"), JSON.stringify(report, null, 1));
console.log(JSON.stringify({ msPerFrame: report.msPerFrame, worst }, null, 1));
