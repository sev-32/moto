#!/usr/bin/env python3
"""Extract the canonical LUCID female-skin-v4.2 character for the browser runtime.

    python3 tools/character/extract_lucid.py <LUCID_BIOMECH_CAUSAL_RIG_R1 package root>

Uses the package's own modules (source-locked inputs, verified by sha256 before use):
  * assets.load_character   -> VREST, faces, Skin78 weights (raw, not renormalised), pivots
  * semantic.compiler       -> Semantic51 joints, parents, rest positions, the 51 DOF
                               definitions in compiler order with their rest-frame axes and
                               hard ranges (body.articulate.v2 rules)
  * anatomy.HandLayer       -> the declared hand layer (42 sign-probed finger/thumb axes)
  * physbody.passive_prior  -> passive tissue priors per DOF
  * FEMALE_MASTER_PHYSICAL_BODY_PROFILE -> 17 segment masses / COM / inertia (mapped to the
                               master frame), foot contact geometry
  * muscle_capacity_ledger  -> reference torque limits
and writes assets/character/lucid_female_v4_2.json (typed arrays as base64). It also writes
tests/fixtures/lucid_parity.json: poses compiled, cluster-driven and skinned by the Python
reference, for the JS parity test. Nothing here changes a weight, a helper rule or the deformer.
"""
import base64, hashlib, json, math, sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
pkg = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(pkg))
from lucid_bcr import assets as A  # noqa: E402
from lucid_bcr.semantic import compiler  # noqa: E402
from lucid_bcr.drivers import drivers  # noqa: E402
from lucid_bcr.skinning import skinner  # noqa: E402
from lucid_bcr.anatomy import HandLayer  # noqa: E402
from lucid_bcr.physbody import passive_prior, stance_gain  # noqa: E402

report = A.verify_sources()  # raises on any mismatch
ch = A.load_character(verify=True)
comp = compiler()
hand = HandLayer()


def b64(arr, dtype):
    a = np.ascontiguousarray(np.asarray(arr, dtype=dtype))
    return {"dtype": np.dtype(dtype).name, "shape": list(a.shape), "b64": base64.b64encode(a.tobytes()).decode()}


W = ch.W.tocsr()
W.sort_indices()
REFLECT = np.diag([1.0, 1.0, -1.0])  # physical profile (z forward) <-> master (-z forward)
prof = ch.physical_profile
bodies = []
for b in prof["bodies"]:
    c = b["centerWorldRestM"]
    I = np.asarray(b["inertiaAtComBodyKgM2"], float).reshape(3, 3)
    d = b["shape"]["dimensionsBodyM"]
    bodies.append({
        "body": b["body"], "joint": prof["jointMap"][b["body"]], "parent": prof["parent"][b["body"]],
        "massKg": b["massKg"], "comWorldRestM": (REFLECT @ np.array([c["x"], c["y"], c["z"]])).tolist(),
        "inertiaAtComKgM2": (REFLECT @ I @ REFLECT).ravel().tolist(),
        "boxM": [d["x"], d["y"], d["z"]],
    })
foot = {}
for side, g in prof["footContactGeometry"].items():
    foot[side] = {k: (REFLECT @ np.array([v["x"], v["y"], v["z"]])).tolist() for k, v in g.items() if k.endswith("Reference")}
    foot[side]["boundsPhysicalZForward"] = {k: v for k, v in g.items() if k.endswith("Bounds")}

ledger = A.load_json("config/muscle_capacity_ledger_v1.json")
torque = {d["dof"]: d["referenceTorqueLimitNm"] for d in ledger["dofs"]}

dofs = []
for d in comp.DEFS:
    try:
        pp = passive_prior(d.id, d.joint)
    except KeyError:  # the pelvis root DOFs carry no joint tissue
        pp = None
    sg = stance_gain(d.joint, d.id)
    dofs.append({
        "id": d.id, "joint": d.joint, "family": d.family, "min": d.minDeg, "max": d.maxDeg,
        "axis": comp.AXES[d.id].tolist(),
        "passive": None if pp is None else {"k": pp.k, "d": pp.d, "A": pp.A, "w": pp.w, "q0": pp.q0},
        "stance": list(sg) if sg else None, "torqueLimitNm": torque.get(d.id),
    })
graph_nodes = {n["id"]: n for n in ch.body_graph["nodes"]}
maxvel = {}
for d in comp.DEFS:
    node = graph_nodes.get(d.joint, {})
    key = d.id.split(".", 1)[1]
    for gd in node.get("dofs", []):
        if gd["id"] == key and gd.get("maxVelocity"):
            maxvel[d.id] = float(gd["maxVelocity"])
hand_dofs = [{"id": k, **{kk: (vv.tolist() if isinstance(vv, np.ndarray) else vv) for kk, vv in v.items()}} for k, v in hand.dofs.items()]
grips = A.load_json("config/hand_grip_profiles_v1.json")["profiles"]
contact = {k: b64(v, np.int32) for k, v in ch.contact_regions.items()}

out = {
    "schema": "lucid-moto.character.lucid-female-skin-v4.2.v1",
    "source": {"package": "LUCID_BIOMECH_CAUSAL_RIG_R1 (R1.5)", "sourceLocks": {k: v["actual"] for k, v in report.items()},
               "skinSha256": ch.skin_sha256, "compilerContract": "semantic-articulation-compiler.v2 (body.articulate.v2) via lucid_bcr.semantic",
               "rule": "the causal system moves the model; Skin78 weights, canonical helper rules and LBS are used unchanged"},
    "frame": {"up": comp.UP.tolist(), "forward": comp.FORWARD.tolist(), "left": comp.LEFT.tolist(), "note": "master frame: +X right, +Y up, -Z forward"},
    "joints": {"names": list(comp.TGT), "parents": [int(p) for p in comp.PARENTS], "rest": b64(comp.B, np.float64)},
    "dofs": dofs, "maxVelocityDegS": maxvel,
    "hand": {"dofs": hand_dofs, "grips": {k: grips[k] for k in ("bottle", "locomotion_relaxed", "sphere", "lumbrical") if k in grips}},
    "clusters": {"names": list(ch.cluster_names), "pivots": b64(ch.cluster_pivots, np.float64)},
    "mesh": {"vrest": b64(ch.vrest, np.float64), "faces": b64(ch.faces, np.uint16)},
    "weights": {"indptr": b64(W.indptr, np.int32), "indices": b64(W.indices, np.uint8), "data": b64(W.data, np.float64),
                "note": "raw canonical weights; LBS divides by the per-vertex sum exactly like the canonical runtime"},
    "physical": {"totalMassKg": prof["totalMassKg"], "bodies": bodies, "foot": foot, "authority": prof["authority"]},
    "contactRegions": contact,
}
dst = ROOT / "assets/character/lucid_female_v4_2.json"
dst.write_text(json.dumps(out, separators=(",", ":")))
print("wrote", dst, dst.stat().st_size, "bytes; skin", ch.skin_sha256[:12])

# ---------------------------------------------------------------- parity fixtures
rng = np.random.default_rng(916)
drv, sk = drivers(), skinner()
poses = []
names = [d.id for d in comp.DEFS]
for n in range(6):
    cmds = {}
    for d in comp.DEFS:
        span = d.maxDeg - d.minDeg
        if n == 0:
            continue  # rest pose
        cmds[d.id] = float(d.minDeg + span * rng.uniform(0.05, 0.95))
    hd = {}
    if n >= 2:
        for side in ("left", "right"):
            hd.update(hand.synergy(side, {"profile": "bottle", "profileGain": 0.3 + 0.1 * n, "spread": 0.2}))
    extra = hand.local_rotations(hd) if hd else None
    placement = None
    if n >= 3:
        from scipy.spatial.transform import Rotation as Rot
        Rw = Rot.from_rotvec(rng.normal(size=3) * 0.7).as_matrix()
        placement = (Rw, rng.normal(size=3) * 0.5)
    pose = comp.compile(cmds, extra_local=extra, placement=placement)
    D, T = drv.transforms(pose)
    X = sk.lbs(D, T)
    idx = np.unique(np.concatenate([rng.integers(0, len(X), 400), [0, len(X) - 1]]))
    poses.append({
        "commands": cmds, "hand": hd,
        "placement": None if placement is None else {"R": placement[0].tolist(), "t": placement[1].tolist()},
        "P": pose["P"].tolist(), "G": pose["G"].reshape(-1, 9).tolist(), "twist": pose["physicalTissueTwistDegBySide"],
        "D": D.reshape(-1, 9).tolist(), "T": T.tolist(),
        "sampleIdx": idx.tolist(), "sampleX": X[idx].tolist(), "sum": X.sum(axis=0).tolist(), "absMax": float(np.abs(X).max()),
    })
fx = ROOT / "tests/fixtures/lucid_parity.json"
fx.write_text(json.dumps({"schema": "lucid-moto.character-parity.v1", "skinSha256": ch.skin_sha256, "poses": poses}))
print("wrote", fx, fx.stat().st_size, "bytes")
