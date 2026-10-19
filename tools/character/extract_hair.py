#!/usr/bin/env python3
"""Her groom: hair clump guides from the hair cards of the Human Engine model she was made with.

    python3 -I tools/character/extract_hair.py <LUCID_CLOTHING_ENGINE_CLEAN_HANDOFF root>

The Human Engine model (public/model/base.gltf, checked against the handoff's manifest) carries
her original hair as cards: mesh "hair", 123 strips skinned (98 %) to the Head joint, each with
its UV v running from the root (v = 0, at the scalp) to the tip. Their textures are not in the
handoff, so the cards cannot be drawn as cards; their shape is the style (a bob to the nape).

Per card: its centreline from root to tip (the mean of its vertices in 12 equal steps of v), its
width (the spread across it at each step) and its facing (the card's mean normal). Each card
becomes 3 clumps side by side across its width, so the groom is the cards' coverage drawn as the
DDHF hair engine's clump charts. Positions are turned into her master frame (the half turn about +Y
that takes the Human Engine frame to hers - measured for the body in lucid_body_adapter_v1.json).

Writes assets/character/hair/lucid_hair_guides_v1.json. CANDIDATE.
"""
import base64, hashlib, json, sys
from pathlib import Path

import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

ROOT = Path(__file__).resolve().parents[2]
HO = Path(sys.argv[1]).resolve()
M = "project/labs/human-engine/clothing-safe/m26/source/public/model/"
NODES, PER_CARD = 12, 3


def main():
    man = {m["path"]: m["sha256"] for m in json.loads((HO / "MANIFEST_SHA256.json").read_text())["files"]}
    raw = {}
    for p in (M + "base.gltf", M + "base.bin"):
        b = (HO / p).read_bytes()
        if man.get(p) != hashlib.sha256(b).hexdigest():
            sys.exit(f"{p}: not the handoff's file")
        raw[p] = b
    g, B = json.loads(raw[M + "base.gltf"]), raw[M + "base.bin"]
    CT = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}
    NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}

    def acc(i):
        a = g["accessors"][i]
        v = g["bufferViews"][a["bufferView"]]
        dt, n = CT[a["componentType"]], NC[a["type"]]
        off = v.get("byteOffset", 0) + a.get("byteOffset", 0)
        stride = v.get("byteStride", 0) or np.dtype(dt).itemsize * n
        rows = np.frombuffer(B, np.uint8, a["count"] * stride, off).reshape(a["count"], stride)
        return rows[:, : np.dtype(dt).itemsize * n].copy().view(dt).reshape(a["count"], n)

    hair = next(m for m in g["meshes"] if m["name"] == "hair")
    pr = hair["primitives"][0]
    P = acc(pr["attributes"]["POSITION"]).astype(np.float64) * np.array([-1.0, 1.0, -1.0])  # -> her master frame
    Nrm = acc(pr["attributes"]["NORMAL"]).astype(np.float64) * np.array([-1.0, 1.0, -1.0])
    UV = acc(pr["attributes"]["TEXCOORD_0"]).astype(np.float64)
    I = np.concatenate([acc(p["indices"]).reshape(-1) for p in hair["primitives"]]).reshape(-1, 3)
    n = len(P)
    A = coo_matrix((np.ones(len(I) * 3), (np.r_[I[:, 0], I[:, 1], I[:, 2]], np.r_[I[:, 1], I[:, 2], I[:, 0]])), shape=(n, n))
    nc, lab = connected_components(A, directed=False)
    cards = []
    for c in range(nc):
        ids = np.where(lab == c)[0]
        if len(ids) < 8:
            continue
        v = UV[ids, 1]
        v0, v1 = v.min(), v.max()
        if v1 - v0 < 1e-6:
            continue
        t = (v - v0) / (v1 - v0)
        pts, wid = [], []
        for k in range(NODES):
            lo, hi = k / NODES, (k + 1) / NODES
            sel = ids[(t >= lo - 1e-9) & (t <= hi + 1e-9)] if k == NODES - 1 else ids[(t >= lo) & (t < hi)]
            if len(sel) == 0:
                sel = ids[np.argsort(np.abs(t - (lo + hi) / 2))[:3]]
            q = P[sel]
            pts.append(q.mean(0))
            wid.append(float(np.linalg.norm(q.max(0) - q.min(0))) if len(sel) > 1 else 0.0)
        pts = np.array(pts)
        nrm = Nrm[ids].mean(0)
        nrm /= np.linalg.norm(nrm) + 1e-12
        # the card's width direction: across the centreline, in the card's plane
        tang = pts[-1] - pts[0]
        tang /= np.linalg.norm(tang) + 1e-12
        side = np.cross(nrm, tang)
        side /= np.linalg.norm(side) + 1e-12
        w = float(np.median(wid))
        cards.append((pts, nrm, side, w))
    clumps = []
    for ci, (pts, nrm, side, w) in enumerate(cards):
        for j in range(PER_CARD):
            off = (j - (PER_CARD - 1) / 2) * (w / PER_CARD)
            clumps.append({"card": ci, "nodes": (pts + side * off).round(5).tolist(), "width": round(w / PER_CARD * 1.5, 5), "facing": nrm.round(4).tolist()})
    L = [float(np.sum(np.linalg.norm(np.diff(np.array(c["nodes"]), axis=0), axis=1))) for c in clumps]
    out = {
        "schema": "lucid-moto.hair-guides.v1", "status": "CANDIDATE",
        "source": {"model": "Human Engine M26 public/model/base.gltf, mesh hair (cards)", "sha256": {Path(p).name: hashlib.sha256(raw[p]).hexdigest() for p in raw}},
        "frame": "her master frame (+X right, +Y up, -Z forward): the Human Engine positions turned half a turn about +Y",
        "rule": f"per card: centreline of {NODES} nodes root (UV v = 0) to tip, width = the median spread across it; {PER_CARD} clumps per card side by side across its width",
        "joint": "Head", "cards": len(cards), "clumps": clumps,
        "stats": {"lengthM": {"min": round(min(L), 3), "median": round(float(np.median(L)), 3), "max": round(max(L), 3)}},
    }
    dst = ROOT / "assets/character/hair/lucid_hair_guides_v1.json"
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps(out, separators=(",", ":")))
    print(json.dumps({"cards": len(cards), "clumps": len(clumps), **out["stats"]}), "->", dst.relative_to(ROOT))


if __name__ == "__main__":
    main()
