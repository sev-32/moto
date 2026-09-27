#!/usr/bin/env python3
"""Extract the R1.5 muscle layer (the 84 musculotendon proxies) for the browser rider.

    python3 tools/character/extract_muscles.py <LUCID_BIOMECH_CAUSAL_RIG_R1 package root>

Uses the package's own modules, unchanged:
  * muscles.muscle_system()            -> the 84 proxies fitted to her mesh (lucid_bcr.muscles): per path
                                          point its carrier joint and its offset from that joint in the
                                          rest (master) frame, follow points (patella: 0.55 of the knee;
                                          hip wrap: 0.5 of the hip), Fmax and its source, tendon share
  * physbody.PhysicsBody(muscles=True) -> the MuJoCo muscle body (spatial tendons, knee wraps, hip wrap
                                          carriers) and its fibre calibration (_calibrate_lengthrange)
  * muscle_fidelity                    -> the G12.0 sampler of lawful poses and the MuJoCo tendon Jacobian

The browser carries the proxy paths themselves (lengths, virtual-work moment arms), which the
package's MuJoCo body reproduces (gate G12.0: p95 moment-arm difference < 0.3 cm). Their fibre
calibration is physbody._calibrate_lengthrange's recipe - the same 400 lawful poses (seed 0), the
same 0.98 / 1.02 margins, l_opt from the tendon share, l_eff, range and vmax - applied to the proxy
lengths, so a muscle's normalised fibre length is 1 at rest in the browser exactly as in MuJoCo.
MuJoCo's own calibration is written alongside for comparison.

CANDIDATE refinement (LUCID MOTO, declared, not part of R1.5): the package's triceps is one proxy along
the long head's path (scapular origin, 2047 N = the Holzbaur et al. 2005 sum of TRIlong 798.5 N +
TRIlat 624.3 N + TRImed 624.3 N) with no wrap at the elbow. Measured on her skeleton: its elbow
moment arm falls from 1.7 cm straight to 0.2 cm at 90 deg and turns flexor past ~110 deg, and with the
shoulder flexed 110 deg (riding) the whole muscle sits at 0.5-0.6 of its force-length peak - she could
not brace on the bars. Here it is split into the three Holzbaur heads (lateral and medial from the
humerus, so shoulder flexion does not stretch them) sharing an olecranon point that turns with half
the elbow flexion - the package's own device for the patella (R1.1). Placements are made by the
package's MuscleSystem.place on her mesh; the olecranon point's depth is fitted so the heads' elbow
moment arm is ~2 cm (Murray, Delp & Buchanan 1995, J Biomech 28:513: triceps 1.5-2.3 cm over the
flexion range). Every other muscle is R1.5 verbatim (checked point for point against muscle_system()).

Writes assets/character/lucid_muscles_r1_5.json and tests/fixtures/lucid_muscle_parity.json (lawful
poses: proxy points, lengths and moment arms per hinge; MuJoCo tendon lengths and moment arms for the
R1.5 muscles; MuJoCo's muscle gain / bias / activation dynamics at sampled states). Nothing in the
package is written to: no receipt, no evidence file, no ledger entry.
"""
import json, math, sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
pkg = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(pkg))
from lucid_bcr import assets as A  # noqa: E402
from lucid_bcr.muscles import muscle_system, muscle_catalog, MuscleSystem, MuscleDef, P, MTU_PRIORS, TENDON_STRAIN_AT_FMAX, HOLZ, _base  # noqa: E402
from lucid_bcr.physbody import PhysicsBody  # noqa: E402
from lucid_bcr.muscle_fidelity import random_lawful_commands, pose_moment_arms, tendon_jacobian  # noqa: E402

A.verify_sources()  # raises on any mismatch
r15 = muscle_system()
pb = PhysicsBody(muscles=True)
assert pb.ms is r15 and len(r15.ids) == 84, len(r15.ids)
comp, mj, m, d = pb.comp, pb.mj, pb.model, pb.data
names = list(comp.TGT)

# ---------------------------------------------------------------- candidate triceps (see the module note)
HOLZ_TRI = {"long": 798.5, "lateral": 624.3, "medial": 624.3}     # Holzbaur 2005 (R1.5's 2047 N is their sum)
TRI_SHARE = MTU_PRIORS["triceps"]                                   # the package's triceps prior for every head
def candidate_catalog(olecranon_rho):
    out = []
    for mdef in muscle_catalog():
        if not mdef.id.endswith("_triceps"):
            out.append(mdef)
            continue
        side = mdef.id.split("_")[0]; S = "L" if side == "left" else "R"
        orig = mdef.points                        # [clavicle origin, humerus 0.45, humerus 0.9, forearm insertion]
        olec = P(f"{S}_Forearm", "humerus", 1.0, 180, olecranon_rho, follow=(f"{S}_Upperarm", 0.5))
        heads = {
            "long": [orig[0], orig[1], orig[2], olec, orig[3]],
            "lateral": [P(f"{S}_Upperarm", "humerus", 0.2, 140, 0.55), orig[2], olec, orig[3]],
            "medial": [P(f"{S}_Upperarm", "humerus", 0.5, -150, 0.45), orig[2], olec, orig[3]],
        }
        for h, pts in heads.items():
            out.append(MuscleDef(f"{side}_triceps_{h}", mdef.group, pts, HOLZ_TRI[h],
                                 HOLZ + f"; LUCID MOTO CANDIDATE: TRI{h[:3]} of the R1.5 triceps (Holzbaur 2005 split) + olecranon point",
                                 belly=mdef.belly, amp=mdef.amp, radius=mdef.radius, compartment=mdef.compartment, bulge=mdef.bulge))
    return out
def triceps_arm_cm(ms_, rho_deg=(0, 45, 90, 120)):
    """left triceps heads' elbow flexion moment arm (cm, extension negative) at elbow angles, rest otherwise"""
    out = {}
    for mid in ("left_triceps_long", "left_triceps_lateral", "left_triceps_medial"):
        row = []
        for a in rho_deg:
            pose = comp.compile({"leftElbow.flexionExtension": float(a)}, validate=False)
            r = ms_.moment_arms(pose)[mid].get("L_Forearm")
            ax = np.asarray(comp.AXES["leftElbow.flexionExtension"], float)
            G = pose["G"][comp.TI["L_Upperarm"]]      # the hinge axis turns with the upper arm
            row.append(float(r @ (G @ ax / np.linalg.norm(ax))) * 100 if r is not None else 0.0)
        out[mid] = row
    return out
# olecranon point depth: the fraction of the elbow's posterior axis-to-skin distance at which the heads'
# moment arm at 90 deg is closest to 2.0 cm (Murray et al. 1995)
best = None
for rho in np.arange(0.40, 0.96, 0.05):
    arms = triceps_arm_cm(MuscleSystem(candidate_catalog(float(rho))))
    err = abs(np.mean([v[2] for v in arms.values()]) + 2.0)
    if best is None or err < best[0]:
        best = (err, float(rho), arms)
OLEC_RHO = round(best[1], 2)
ms = MuscleSystem(candidate_catalog(OLEC_RHO))
print(f"olecranon depth rho {OLEC_RHO}: triceps heads' elbow moment arm (cm) at 0/45/90/120 deg:",
      {k: [round(x, 2) for x in v] for k, v in best[2].items()})
old_arm = []
for a in (0, 45, 90, 120):
    pose = comp.compile({"leftElbow.flexionExtension": float(a)}, validate=False)
    r = r15.moment_arms(pose)["left_triceps"].get("L_Forearm"); G = pose["G"][comp.TI["L_Upperarm"]]
    ax = np.asarray(comp.AXES["leftElbow.flexionExtension"], float); old_arm.append(round(float(r @ (G @ ax / np.linalg.norm(ax))) * 100, 2))
print("R1.5 triceps elbow moment arm (cm) at 0/45/90/120 deg:", old_arm)
# every other muscle is R1.5 verbatim
for i, mid in enumerate(ms.ids):
    if mid in r15.index:
        j = r15.index[mid]
        assert r15.carriers[j] == ms.carriers[i] and np.array_equal(r15.local[j], ms.local[i]) and r15.follow[j] == ms.follow[i], mid
candidates = {mid for mid in ms.ids if mid not in r15.index}
assert candidates == {f"{sd}_triceps_{h}" for sd in ("left", "right") for h in HOLZ_TRI}, candidates
nm = len(ms.ids)

# ---------------------------------------------------------------- fibre calibration on the proxy paths
# physbody._calibrate_lengthrange, sample for sample (same generator, same draw order), with the
# proxy's length at each pose in place of MuJoCo's tendon length
rng = np.random.default_rng(0)
Ls = []
for _ in range(400):
    cmds = {}
    for jn in pb.names:
        for kind, did, ax, lo, hi in pb.hinges[jn]:
            if kind != "hand":
                cmds[did] = float(rng.uniform(lo, hi))
    Ls.append(ms.lengths(comp.compile(cmds, validate=False)))
Ls = np.array(Ls)
L0 = np.array(ms.L0)
lo = np.minimum(Ls.min(0), L0) * 0.98
hi = np.maximum(Ls.max(0), L0) * 1.02

# MuJoCo's muscle defaults as compiled into this model (gainprm: range0 range1 force scale lmin lmax vmax fpmax fvmax)
gp = np.array(m.actuator_gainprm[:, :9])
bp = np.array(m.actuator_biasprm[:, :9])
dp = np.array(m.actuator_dynprm[:, :3])
lmin, lmax, fpmax, fvmax = float(gp[0, 4]), float(gp[0, 5]), float(gp[0, 7]), float(gp[0, 8])
assert np.allclose(gp[:, 4], lmin) and np.allclose(gp[:, 5], lmax) and np.allclose(gp[:, 8], fvmax)
assert np.allclose(dp[:, 0], 0.01) and np.allclose(dp[:, 1], 0.04) and np.allclose(dp[:, 2], 0.0)
assert all(int(x) == 1 for x in m.actuator_actearly)

muscles = []
for i, mdef in enumerate(ms.defs):
    mid = mdef.id
    share, belly_r = TRI_SHARE if mid in candidates else MTU_PRIORS.get(_base(mid), (0.5, 0.0))
    lopt = (1.0 - share) * L0[i]
    leff = max(lopt, (L0[i] - lo[i]) / 0.45, (hi[i] - L0[i]) / 0.5)
    rg = (1.0 + (lo[i] - L0[i]) / leff, 1.0 + (hi[i] - L0[i]) / leff)
    pts = []
    for k, c in enumerate(ms.carriers[i]):
        p = {"carrier": c, "local": [float(x) for x in ms.local[i][k]]}
        if k in ms.follow[i]:
            par, frac, cidx = ms.follow[i][k]
            assert names[cidx] == c
            p["follow"] = {"parent": names[par], "frac": frac}
        pts.append(p)
    mjcal = None
    if mid in r15.index:
        j = r15.index[mid]
        mjcal = {"restLength": float(pb.muscle_rest_length[j]), "lengthRange": [float(x) for x in pb.muscle_lengthrange[j]],
                 "range": [float(x) for x in pb.muscle_range[j]], "vmax": float(pb.muscle_vmax[j]),
                 "lopt": float(pb.muscle_lopt[j]), "leff": float(pb.muscle_leff[j])}
        if mid in pb.wrap_specs:
            mjcal["kneeWrap"] = pb.wrap_specs[mid]
    muscles.append({
        "id": mid, "status": "CANDIDATE (LUCID MOTO triceps refinement)" if mid in candidates else "R1.5",
        "group": mdef.group, "fmax": float(mdef.fmax), "fmaxSource": mdef.fmax_source,
        "tendonShare": share, "bellyRadiusM": belly_r, "points": pts,
        "restLength": float(L0[i]), "lengthRange": [float(lo[i]), float(hi[i])], "range": [float(rg[0]), float(rg[1])],
        "lopt": float(lopt), "leff": float(leff), "vmax": float(10.0 * lopt / leff),
        "mujoco": mjcal,
    })

out = {
    "schema": "lucid-moto.character.muscles.r1-5.v1",
    "source": {
        "package": "LUCID_BIOMECH_CAUSAL_RIG_R1 (R1.5)",
        "catalog": "lucid_bcr.muscles.muscle_catalog (84 proxies fitted to the female-skin-v4.2 mesh), the triceps replaced by the CANDIDATE split (3 Holzbaur heads + olecranon point, see tools/character/extract_muscles.py): 88",
        "olecranonRho": OLEC_RHO,
        "calibration": "physbody._calibrate_lengthrange recipe (400 lawful poses, seed 0, 0.98/1.02 margins) on the proxy lengths",
        "muscleModel": "MuJoCo 3 muscle (mju_muscleGain / mju_muscleBias / mju_muscleDynamics), actearly = 1, as compiled by PhysicsBody(muscles=True)",
        "truthClass": "PARAMETRIC_ENGINEERING_PROXY: landmark-fitted attachments; lower-body Fmax from Rajagopal2016, upper-body/trunk literature priors, not subject-calibrated",
    },
    "frame": "master rest frame (+X right, +Y up, -Z forward); point = rest position of its carrier joint + local, carried rigidly by that joint; a follow point turns with frac of its carrier's rotation relative to parent (rotation vector scaled), about the carrier joint",
    "muscleDefaults": {"lmin": lmin, "lmax": lmax, "fvmax": fvmax, "fpmax": fpmax, "tauAct": 0.01, "tauDeact": 0.04,
                       "tendonStrainAtFmax": TENDON_STRAIN_AT_FMAX, "vmaxNote": "vmax = 10 l_opt / l_eff (Rajagopal2016: 10 optimal fibre lengths / s)"},
    "muscles": muscles,
}
dst = ROOT / "assets/character/lucid_muscles_r1_5.json"
dst.write_text(json.dumps(out, separators=(",", ":")))
print("wrote", dst, dst.stat().st_size, "bytes")
r15m = [mu for mu in muscles if mu["mujoco"]]
dl = np.array([mu["restLength"] - mu["mujoco"]["restLength"] for mu in r15m])
print(f"rest length proxy - MuJoCo: max |d| {np.abs(dl).max() * 100:.3f} cm")
dr = np.array([[mu["lengthRange"][k] - mu["mujoco"]["lengthRange"][k] for k in (0, 1)] for mu in r15m])
print(f"length range proxy - MuJoCo: max |d| {np.abs(dr).max() * 100:.3f} cm ({r15m[int(np.abs(dr).max(1).argmax())]['id']})")

# ---------------------------------------------------------------- parity fixture
js_hinges = [h for h in pb.hinge_ids if pb.hinge_kind[h] != "hand" and not h.endswith("Toe.flexionExtension")]
rng = np.random.default_rng(1916)
poses = []
for n in range(13):
    cmds = {} if n == 0 else random_lawful_commands(pb, rng)
    cmds = {k: float(v) for k, v in cmds.items() if not k.endswith("Toe.flexionExtension")}
    mj_r, px, span = pose_moment_arms(pb, cmds)   # MuJoCo state set to cmds (root at rest), R1.5 proxy at the same pose
    pose = comp.compile(cmds, validate=False)
    paths = ms.paths(pose)
    MA = ms.moment_arms(pose, paths)
    ten = np.array(d.ten_length[:84])
    # the browser's hinges are semantic: its left forearm twist turns about the negated MuJoCo axis
    # (physbody: physical twist = -semantic on the left), so that hinge's arms change sign
    sgn = {h: (-1.0 if pb.hinge_kind[h] == "twist" and h.startswith("left") else 1.0) for h in js_hinges}
    jax = {}
    for h in js_hinges:
        jid = mj.mj_name2id(m, mj.mjtObj.mjOBJ_JOINT, h)
        jax[h] = [sgn[h] * float(x) for x in d.xaxis[jid]]
    arms = {}
    for mid in ms.ids:
        row = {}
        if mid in r15.index:
            mi = r15.index[mid]
            for hi_, h in enumerate(pb.hinge_ids):
                if h in jax and span[mi, hi_]:
                    row[h] = [sgn[h] * float(px[mi, hi_]) / 100.0, sgn[h] * float(mj_r[mi, hi_]) / 100.0]   # m: [proxy, MuJoCo]
        else:
            # (candidate: the proxy's own virtual-work arms projected on MuJoCo's hinge axes; no MuJoCo tendon)
            for hi_, h in enumerate(pb.hinge_ids):
                if h not in jax:
                    continue
                r = MA[mid].get(pb.hinge_joint[h])
                if r is not None and abs(float(r @ np.array(jax[h]))) > 1e-9:
                    row[h] = [float(r @ np.array(jax[h])), None]
        arms[mid] = row
    poses.append({
        "commands": {h: cmds.get(h, 0.0) for h in js_hinges},
        "points": [p.ravel().tolist() for p in paths],
        "lengths": ms.lengths(pose, paths).tolist(), "mujocoLengths": {mid: float(ten[r15.index[mid]]) for mid in ms.ids if mid in r15.index},
        "hingeAxes": jax, "hingeMomentArms": arms,
    })

# MuJoCo's muscle functions at sampled states, with the browser's (proxy) calibration
rng = np.random.default_rng(84)
flv = []
for i, mu in enumerate(muscles):
    # (MuJoCo's defaults from the compiled model; this muscle's range, force and vmax)
    lr = np.array(mu["lengthRange"]); prm = gp[0].copy(); prm[0], prm[1], prm[2], prm[6] = mu["range"][0], mu["range"][1], mu["fmax"], mu["vmax"]
    bprm = bp[0].copy(); bprm[0], bprm[1], bprm[2], bprm[6] = mu["range"][0], mu["range"][1], mu["fmax"], mu["vmax"]
    rows = []
    for _ in range(12):
        L = float(rng.uniform(lr[0] - 0.1 * (lr[1] - lr[0]), lr[1] + 0.1 * (lr[1] - lr[0])))
        V = float(rng.normal() * mu["leff"] * mu["vmax"] * 0.6)
        rows.append([L, V, float(mj.mju_muscleGain(L, V, lr, 1.0, prm)), float(mj.mju_muscleBias(L, lr, 1.0, bprm))])
    flv.append({"id": mu["id"], "gainprm": prm.tolist(), "rows": rows})
dyn = []
for _ in range(40):
    u, a = float(rng.uniform(-0.1, 1.1)), float(rng.uniform(0, 1))
    dyn.append([u, a, float(mj.mju_muscleDynamics(u, a, dp[0]))])

# fidelity of the MuJoCo body to the proxies at these poses (what G12.0 measures), for the record
E = [abs(v[0] - v[1]) for p in poses for row in p["hingeMomentArms"].values() for v in row.values() if v[1] is not None]
fx = ROOT / "tests/fixtures/lucid_muscle_parity.json"
r12 = lambda o: {k: r12(v) for k, v in o.items()} if isinstance(o, dict) else [r12(v) for v in o] if isinstance(o, list) else float(f"{o:.13g}") if isinstance(o, float) else o
fx.write_text(json.dumps(r12({"schema": "lucid-moto.muscle-parity.v1", "hinges": js_hinges, "ids": ms.ids, "r15Ids": r15.ids, "poses": poses,
                          "restRootPosition": comp.BD["Hip"].tolist(), "flv": flv, "activationDynamics": dyn,
                          "mujocoVsProxyMomentArmCm": {"median": float(np.median(E) * 100), "p95": float(np.percentile(E, 95) * 100), "max": float(np.max(E) * 100)}}), separators=(",", ":")))
print("wrote", fx, fx.stat().st_size, "bytes")
print(f"MuJoCo vs proxy moment arms at the fixture poses: median {np.median(E) * 100:.3f} cm, p95 {np.percentile(E, 95) * 100:.3f} cm, max {np.max(E) * 100:.3f} cm")
