// CANDIDATE hip internal rotators (experiment): Rajagopal 2016 (FBM deep-hip upload) glmed1, glmin1, tfl - points registered on her
// rest skeleton by hip / knee centres (axes: hers X = os Z, Y = os Y, Z = -os X), the package's length-range recipe
import { character, BIO, MB } from "../../tests/lib/rider-harness.mjs";
const OS = {
  hjc: [-0.056276, -0.07849, 0.07726], kjcFemur: [-0.00809, -0.40796, -0.00275], kjcTibia: [-0.0080895, -0.0035348, -0.00148474], ajcTibia: [-0.01, -0.4, 0],
  muscles: {
    glmed1: { fmax: 1093.4667688, lopt: 0.073, lts: 0.0558168, pts: [["pelvis", [-0.0445, 0.0245, 0.1172]], ["femur", [-0.0218, -0.0117, 0.0555]]] },
    glmin1: { fmax: 374.0459016, lopt: 0.068, lts: 0.0161378, pts: [["pelvis", [-0.0464, -0.0149, 0.1042]], ["femur", [-0.0072, -0.0104, 0.056]]] },
    tfl: { fmax: 411.2065574, lopt: 0.095, lts: 0.449497, pts: [["pelvis", [-0.0311, 0.0214, 0.1241]], ["femur", [0.0294, -0.0995, 0.0597]], ["femur", [0.0107, -0.405, 0.0324]], ["tibia", [0.0108, -0.041, 0.0346]]] },
  },
};
const NAMES = { glmed1: "gluteus_medius_anterior", glmin1: "gluteus_minimus_anterior", tfl: "tensor_fasciae_latae" };
export function hipCandidates(asset) {
  const model = BIO.buildModel(character), body = MB.createArticulatedBody(model.spec);
  body.p = [0, 0, 0]; body.R = [1, 0, 0, 0, 1, 0, 0, 0, 1]; body.q.fill(0); body.qd.fill(0); body.kinematics();
  const O = (j) => Array.from(body.ow[model.linkOf[j]]);
  const out = [];
  for (const [S, side, sg] of [["L", "left", -1], ["R", "right", 1]]) {
    const hjc = O(S + "_Thigh"), kjc = O(S + "_Calf"), ajc = O(S + "_Foot");
    const hjcL = O("L_Thigh"), hjcR = O("R_Thigh");
    const sLat = Math.hypot(hjcR[0] - hjcL[0], hjcR[1] - hjcL[1], hjcR[2] - hjcL[2]) / (2 * OS.hjc[2]);
    const fem = Math.hypot(kjc[0] - hjc[0], kjc[1] - hjc[1], kjc[2] - hjc[2]), femOS = Math.hypot(...OS.kjcFemur), sF = fem / femOS;
    const shank = Math.hypot(ajc[0] - kjc[0], ajc[1] - kjc[1], ajc[2] - kjc[2]), shOS = Math.hypot(...OS.ajcTibia.map((v, i) => v - OS.kjcTibia[i])), sT = shank / shOS;
    // os (x anterior, y up, z right; left side mirrored in z) -> hers (+X right, +Y up, -Z forward)
    const map = (d, sc) => [sg * d[2] * sc[0], d[1] * sc[1], -d[0] * sc[2]];
    for (const [k, m] of Object.entries(OS.muscles)) {
      const points = m.pts.map(([bone, p]) => {
        let w, carrier;
        if (bone === "pelvis") { const d = map(p.map((v, i) => v - OS.hjc[i]), [sLat, sF, sF]); w = hjc.map((v, i) => v + d[i]); carrier = "Hip"; }
        else if (bone === "femur") { const d = map(p, [sF, sF, sF]); w = hjc.map((v, i) => v + d[i]); carrier = S + "_Thigh"; }
        else { const d = map(p.map((v, i) => v - OS.kjcTibia[i]), [sT, sT, sT]); w = kjc.map((v, i) => v + d[i]); carrier = S + "_Calf"; }
        const o = O(carrier);
        return { carrier, local: w.map((v, i) => v - o[i]) };
      });
      out.push({ id: `${side}_${NAMES[k]}`, status: "CANDIDATE (experiment)", group: k === "tfl" ? "hip_flexor" : "hip_abductor", fmax: m.fmax, share: m.lts / (m.lts + m.lopt), points });
    }
  }
  return out;
}
// the package's length-range recipe (physbody._calibrate_lengthrange) on her body: rest length, 400 lawful poses, 0.98 / 1.02
export function calibrate(asset, defs) {
  const MUS = globalThis.LUCID_MUSCLES, model = BIO.buildModel(character), body = MB.createArticulatedBody(model.spec);
  const tmp = { ...asset, muscles: defs.map((d) => ({ ...d, range: [0.75, 1.05], lengthRange: [0.1, 0.2], vmax: 10 })) };
  const M = MUS.createMuscles(tmp, model, body);
  const pose = (fn) => { body.p = [0, 0, 0]; body.R = [1, 0, 0, 0, 1, 0, 0, 0, 1]; body.q.fill(0); body.qd.fill(0); fn(); body.kinematics(); M.geometry(); return Float64Array.from(M.len); };
  const L0 = pose(() => {});
  let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const lo = Float64Array.from(L0), hi = Float64Array.from(L0);
  for (let s = 0; s < 400; s++) { const L = pose(() => { for (const h of model.hinges) body.q[h.link] = h.lo + (h.hi - h.lo) * rnd(); }); for (let i = 0; i < L.length; i++) { lo[i] = Math.min(lo[i], L[i]); hi[i] = Math.max(hi[i], L[i]); } }
  return defs.map((d, i) => {
    const l0 = L0[i], a = lo[i] * 0.98, c = hi[i] * 1.02, lopt = (1 - d.share) * l0, leff = Math.max(lopt, (l0 - a) / 0.45, (c - l0) / 0.5);
    return { ...d, restLength: l0, lengthRange: [a, c], range: [1 + (a - l0) / leff, 1 + (c - l0) / leff], lopt, leff, vmax: (10 * lopt) / leff };
  });
}
export function addHipCandidates(asset) {
  const defs = calibrate(asset, hipCandidates(asset));
  for (const d of asset.muscles) if (/_gluteus_medius$/.test(d.id)) d.fmax = 3945.0 - 1093.4667688 - 374.0459016;
  asset.muscles.push(...defs);
  return defs;
}
