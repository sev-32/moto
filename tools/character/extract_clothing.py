#!/usr/bin/env python3
"""Bring the LUCID Clothing Engine (Human Engine M26 + Clothing Engine R1) to the rider.

    python3 -I tools/character/extract_clothing.py <LUCID_CLOTHING_ENGINE_CLEAN_HANDOFF root>

Every file read from the handoff is checked against the handoff's own MANIFEST_SHA256.json first.

  * the engine's runtime sources, byte for byte, into src/vendor/lucid-clothing/ (their own
    relative layout, so their imports resolve unchanged): the M26 cloth solver, triangle BVH,
    garment decoder, watertight body proxy, jeans detail carrier and render supermesh, and the R1
    overlay (LucidClothSolverV2, WardrobeRuntime, InterGarmentContact, the pants section envelope
    and tube topology audit) - with MANIFEST.json (sha256 of each, the handoff they came from)
  * the garments and the watertight body proxy, byte for byte, into assets/character/clothing/
  * assets/character/clothing/lucid_body_adapter_v1.json: how her Skin78 drives the engine's body.

The adapter. The engine simulates against the Human Engine body (public/model/base.gltf, mesh
"Body": 15,602 vertices - UV seams split - and 28,092 triangles, 78 skin joints) in the Human
Engine frame. Measured here: that body is her Skin78 (14,164 vertices, 28,092 triangles) turned
half a turn about +Y - every Human Engine vertex lies on a Skin78 rest vertex after
(x, y, z) -> (-x, y, -z), to float precision - with the same triangles in the same order. So the
engine's body is hers: each frame her canonical skin (Semantic51 -> body.articulate.v2 ->
Skin78 LBS), turned into the engine's frame and gathered into its 15,602-vertex layout. The
adapter holds that gather (heToSkin78), the engine body's triangles and the measurements.
Skin78, its weights and the deformer are read, never written; the garments are not refitted.
"""
import base64, hashlib, json, shutil, sys
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[2]
HO = Path(sys.argv[1]).resolve()
PRJ = "project/labs/human-engine/"
M26 = PRJ + "clothing-safe/m26/source/"
SOURCES = [
    M26 + "public/src/clothing/lucidClothSolver.js",
    M26 + "public/src/clothing/dynamicBvh.js",
    M26 + "public/src/clothing/garmentAsset.js",
    M26 + "public/src/clothing/watertightBodyProxy.js",
    M26 + "public/src/clothing/jeansDetailRuntime.js",
    M26 + "public/src/clothing/renderSupermesh.js",
    M26 + "public/src/runtime/loader.js",
    PRJ + "clothing-engine/r1/src/lucidClothSolverV2.js",
    PRJ + "clothing-engine/r1/src/wardrobeRuntime.js",
    PRJ + "clothing-engine/r1/src/interGarmentContact.js",
    PRJ + "clothing-engine/r1/src/pantsSectionEnvelope.js",
    PRJ + "clothing-engine/r1/src/pantsTubeTopology.js",
]
DATA = [M26 + "public/data/clothing/" + f for f in (
    "lucid_human_native_tshirt_v1.json", "lucid_human_native_jeans_v1.json",
    "lucid_human_native_jeans_v1_details.json", "body_watertight_proxy_alpha4.json")]
MODEL = [M26 + "public/model/base.gltf", M26 + "public/model/base.bin"]
HALF_TURN = np.array([-1.0, 1.0, -1.0])


def main():
    manifest = {m["path"]: m["sha256"] for m in json.loads((HO / "MANIFEST_SHA256.json").read_text())["files"]}
    raw = {}
    for p in SOURCES + DATA + MODEL:
        b = (HO / p).read_bytes()
        h = hashlib.sha256(b).hexdigest()
        if manifest.get(p) != h:
            sys.exit(f"{p}: sha256 {h} does not match the handoff manifest")
        raw[p] = b
    # ---- sources and data, byte for byte
    V = ROOT / "src/vendor/lucid-clothing"
    for p in SOURCES:
        d = V / p[len("project/"):]
        d.parent.mkdir(parents=True, exist_ok=True)
        d.write_bytes(raw[p])
    (V / "MANIFEST.json").write_text(json.dumps({
        "schema": "lucid-moto.vendor-manifest.v1",
        "from": HO.name, "verifiedAgainst": "MANIFEST_SHA256.json of that handoff",
        "rule": "byte-for-byte copies; never edited here - changes belong upstream (clothing-engine/r1 or a new revision)",
        "files": {p[len("project/"):]: hashlib.sha256(raw[p]).hexdigest() for p in SOURCES},
    }, indent=1) + "\n")
    C = ROOT / "assets/character/clothing"
    C.mkdir(parents=True, exist_ok=True)
    for p in DATA:
        (C / Path(p).name).write_bytes(raw[p])

    # ---- the body adapter
    g = json.loads(raw[MODEL[0]])
    B = raw[MODEL[1]]
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

    body = next(m for m in g["meshes"] if m["name"] == "Body")
    HP = acc(body["primitives"][0]["attributes"]["POSITION"]).astype(np.float64)
    HI = np.concatenate([acc(p["indices"]).reshape(-1) for p in body["primitives"]]).reshape(-1, 3).astype(np.int64)
    char = json.loads((ROOT / "assets/character/lucid_female_v4_2.json").read_text())
    dec = lambda o: np.frombuffer(base64.b64decode(o["b64"]), dtype=o.get("dtype", "float64")).reshape(o["shape"])
    X = dec(char["mesh"]["vrest"]).astype(np.float64)
    F = dec(char["mesh"]["faces"]).astype(np.int64)
    assert len(HI) == len(F) == 28092 and len(HP) == 15602 and len(X) == 14164
    # the gather, from the shared triangle order (Skin78 duplicates resolved by the triangles that
    # use them), checked against the positions
    m = np.full(len(HP), -1, np.int64)
    for t in range(len(HI)):
        for k in range(3):
            if m[HI[t, k]] < 0:
                m[HI[t, k]] = F[t, k]
    tree = cKDTree(X)
    dn, near = tree.query(HP * HALF_TURN)
    unset = m < 0
    m[unset] = near[unset]
    err = np.linalg.norm(X[m] * HALF_TURN - HP, axis=1)
    sameTri = float(np.mean(np.all(m[HI] == F, 1)))
    asIs = float(np.median(cKDTree(X).query(HP)[0]))
    print(f"gather: max position error {err.max():.2e} m; triangles identical in order {sameTri:.5f}; "
          f"nearest-vertex median with no turn {asIs:.4f} m")
    assert err.max() < 1e-6, "the Human Engine body is not her Skin78 turned: stop"
    bad = np.where(~np.all(m[HI] == F, 1))[0]
    adapter = {
        "schema": "lucid-moto.clothing-body-adapter.v1",
        "status": "CANDIDATE",
        "engineBody": {"source": "Human Engine M26 public/model/base.gltf, mesh Body", "vertices": int(len(HP)), "triangles": int(len(HI)),
                       "sha256": {Path(p).name: hashlib.sha256(raw[p]).hexdigest() for p in MODEL}},
        "skin": {"skinSha256": char["source"]["skinSha256"], "vertices": int(len(X)), "triangles": int(len(F))},
        "frame": {"map": "engine (Human Engine) = half turn of her master frame about +Y: (x, y, z) -> (-x, y, -z); both +Y up",
                  "measured": {"gatherMaxErrorM": float(err.max()), "nearestVertexMedianWithoutTurnM": round(asIs, 4),
                               "trianglesIdenticalInOrder": sameTri, "trianglesDiffering": bad.tolist()}},
        "heToSkin78_u16_b64": base64.b64encode(m.astype(np.uint16).tobytes()).decode(),
        "indices_u16_b64": base64.b64encode(HI.astype(np.uint16).tobytes()).decode(),
    }
    (C / "lucid_body_adapter_v1.json").write_text(json.dumps(adapter, separators=(",", ":")))
    print("wrote", len(SOURCES), "sources to", V.relative_to(ROOT), "and", len(DATA) + 1, "assets to", C.relative_to(ROOT))


if __name__ == "__main__":
    main()
