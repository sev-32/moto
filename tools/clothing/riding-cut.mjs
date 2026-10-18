#!/usr/bin/env node
// The riding cut (pattern authoring, LUCID MOTO, CANDIDATE): the M16 jeans are a body-derived
// slim-straight shell made on her standing body; on the 916 her knees bend ~120 deg and her hips
// ~75 deg (hung off, the inside knee 125 deg, the hip 83 deg), and a standing pattern cannot cover
// that - the engine's own finding is that runtime forces cannot manufacture missing material and
// that pattern and runtime control are separate levers. Riding jeans answer it in the pattern
// (pre-curved knees, a higher back): here every edge and bend of the garment gets the length her
// riding postures ask of it - its longest length on her skin over the postures (the garment on its
// carriers, where the engine anchors it) less EPS of stretch - never shorter than the engine's own
// pattern, at most CAP times it, and edges under 1 mm (welds) left as they are.
//
//   node tools/clothing/riding-cut.mjs [--eps 0.04] [--cap 1.8] [--postures seated,tuck,hangR,hangL,alert,live]
//        [--garments jeans] -> assets/character/clothing/lucid_riding_cut_v1.json
import fs from "node:fs";
import path from "node:path";
import { ROOT, read, character, engineBody, buildWardrobe, skinWorld, headingFree } from "./engine.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); return i < 0 ? d : args[i + 1]; };
const eps = Number(opt("eps", 0.04)), cap = Number(opt("cap", 1.8));
const postures = String(opt("postures", "seated,tuck,hangR,hangL,alert,live")).split(",");
const garments = String(opt("garments", "jeans")).split(",");
const ch = character(), body = engineBody(ch), poses = read(path.join(ROOT, "tests/fixtures/rider_poses.json"));
const { W, g } = buildWardrobe(body, { garments });
const longest = {};
for (const [id, gg] of Object.entries(g)) longest[id] = { edges: new Float64Array(gg.solver.edges.length / 2), bends: new Float64Array(gg.solver.bends.length / 2) };
const len = (pos, pairs, out) => { for (let k = 0; k < pairs.length; k += 2) { const a = pairs[k] * 3, b = pairs[k + 1] * 3; out[k >> 1] = Math.max(out[k >> 1], Math.hypot(pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2])); } };
for (const k of postures) {
  const p = k === "live" ? poses.live : poses.postures[k];
  if (!p) throw Error(`no posture ${k}`);
  const X = skinWorld(ch, p.commands, headingFree(p.placement.R)), b = body.gather(X);
  W.setBodySurface(b.P, b.N, b.P, 1 / 120);
  for (const [id, gg] of Object.entries(g)) { gg.solver.resetToCurrentPose(); len(gg.solver.pos, gg.solver.edges, longest[id].edges); len(gg.solver.pos, gg.solver.bends, longest[id].bends); }
}
const out = { schema: "lucid-moto.riding-cut.v1", status: "CANDIDATE", eps, cap, postures,
  rule: "rest' = clamp(longest carrier length over the postures / (1 + eps), rest, cap * rest); rest < 1 mm unchanged; applied to the engine's baked and authored rest metrics",
  source: "tools/clothing/riding-cut.mjs on tests/fixtures/rider_poses.json", garments: {} };
for (const [id, gg] of Object.entries(g)) {
  const S = gg.solver, st = {};
  const cut = (rest, L, name) => {
    const r = new Float32Array(rest.length);
    let lengthened = 0, capped = 0, maxScale = 1, sum = 0;
    for (let i = 0; i < r.length; i++) {
      const r0 = rest[i];
      if (!(r0 >= 0.001)) { r[i] = r0; continue; }
      const want = L[i] / (1 + eps), sc = Math.min(cap, Math.max(1, want / r0));
      if (want / r0 > cap) capped++;
      if (sc > 1) lengthened++;
      maxScale = Math.max(maxScale, sc); sum += r0 * sc - r0;
      r[i] = r0 * sc;
    }
    st[name] = { count: r.length, lengthened, capped, maxScale: +maxScale.toFixed(3), addedLengthM: +sum.toFixed(3) };
    return Buffer.from(r.buffer).toString("base64");
  };
  out.garments[id] = { edgeRest_f32_b64: cut(S.edgeRest, longest[id].edges, "edges"), bendRest_f32_b64: cut(S.bendRest, longest[id].bends, "bends"), stats: st };
  console.log(id, JSON.stringify(st));
}
const dst = path.join(ROOT, "assets/character/clothing/lucid_riding_cut_v1.json");
fs.writeFileSync(dst, JSON.stringify(out));
console.log("wrote", path.relative(ROOT, dst));
