#!/usr/bin/env python3
"""A GLB's mesh primitives as plain arrays, for the LUCID MOTO tools (fit-glasses.mjs, fit-shoes.mjs).

    python3 -I tools/character/extract_glb.py <model.glb> <out.json> [--skip NODE,NODE] [--jpeg Q]

Each mesh node's primitives in its mesh's own frame: positions, normals, UVs, tangents (xyz and the
bitangent's sign w, where the model has them), indices, its
material's name, factors and alpha mode, and which embedded images its textures are (written next
to out.json as <out>_imageN.<ext>). The asset block (author, licence, source) is kept. The file is
read as data only: nothing in it is run. Nodes named in --skip (a backdrop, a light's mesh) are left
out. --jpeg Q re-encodes the images as JPEG at quality Q, full chroma (4:4:4, so a normal map keeps
its x and y), to embed them smaller (needs Pillow).
"""
import json, os, struct, sys


def main(path, out, skip, jpeg=None):
    b = open(path, "rb").read()
    magic, ver, length = struct.unpack_from("<III", b, 0)
    if magic != 0x46546C67:
        raise SystemExit("not a GLB")
    off, ch = 12, {}
    while off < length:
        l, t = struct.unpack_from("<II", b, off)
        ch[t] = b[off + 8: off + 8 + l]
        off += 8 + l
    g = json.loads(ch[0x4E4F534A].decode("utf8"))
    blob = ch.get(0x004E4942, b"")

    def acc(i):
        a = g["accessors"][i]
        bv = g["bufferViews"][a["bufferView"]]
        code, size = {5126: ("f", 4), 5125: ("I", 4), 5123: ("H", 2), 5121: ("B", 1)}[a["componentType"]]
        n = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[a["type"]]
        start = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
        stride = bv.get("byteStride", size * n)
        return [list(struct.unpack_from("<" + code * n, blob, start + k * stride)) for k in range(a["count"])]

    images = []
    base = os.path.splitext(out)[0]
    for k, im in enumerate(g.get("images", [])):
        if "bufferView" not in im:
            continue
        bv = g["bufferViews"][im["bufferView"]]
        data = blob[bv.get("byteOffset", 0): bv.get("byteOffset", 0) + bv["byteLength"]]
        ext = {"image/jpeg": "jpg", "image/png": "png"}.get(im.get("mimeType"), "bin")
        mime = im.get("mimeType")
        if jpeg:
            import io
            from PIL import Image
            buf = io.BytesIO()
            Image.open(io.BytesIO(data)).convert("RGB").save(buf, "JPEG", quality=int(jpeg), subsampling=0)
            data, ext, mime = buf.getvalue(), "jpg", "image/jpeg"
        name = "%s_image%d.%s" % (base, k, ext)
        open(name, "wb").write(data)
        images.append({"index": k, "file": os.path.basename(name), "mimeType": mime, "bytes": len(data)})
    tex = lambda t: g["textures"][t["index"]].get("source") if t else None

    skipped = set(skip.split(",")) if skip else set()
    meshes = []
    for node in g.get("nodes", []):
        if "mesh" not in node or node.get("name") in skipped:
            continue
        m = g["meshes"][node["mesh"]]
        for p in m["primitives"]:
            at = p["attributes"]
            pos = acc(at["POSITION"])
            nor = acc(at["NORMAL"]) if "NORMAL" in at else None
            uv = acc(at["TEXCOORD_0"]) if "TEXCOORD_0" in at else None
            tan = acc(at["TANGENT"]) if "TANGENT" in at else None
            idx = [v[0] for v in acc(p["indices"])] if "indices" in p else list(range(len(pos)))
            mat = g["materials"][p["material"]] if "material" in p else {}
            pbr = mat.get("pbrMetallicRoughness", {})
            meshes.append({
                "node": node.get("name"), "mesh": m.get("name"), "material": mat.get("name"),
                "pbr": {k: pbr.get(k) for k in ("baseColorFactor", "metallicFactor", "roughnessFactor")},
                "textures": {"baseColor": tex(pbr.get("baseColorTexture")), "metallicRoughness": tex(pbr.get("metallicRoughnessTexture")), "normal": tex(mat.get("normalTexture"))},
                "alphaMode": mat.get("alphaMode"),
                "positions": [round(x, 6) for v in pos for x in v],
                "normals": [round(x, 5) for v in nor for x in v] if nor else None,
                "uvs": [round(x, 6) for v in uv for x in v] if uv else None,
                "tangents": [round(x, 5) for v in tan for x in v] if tan else None,
                "indices": idx,
            })
    json.dump({"asset": g.get("asset"), "images": images, "meshes": meshes}, open(out, "w"))
    print(json.dumps({"meshes": [(m["node"], m["material"], len(m["positions"]) // 3, len(m["indices"]) // 3) for m in meshes], "images": images}))


if __name__ == "__main__":
    a = sys.argv[1:]
    skip = a[a.index("--skip") + 1] if "--skip" in a else ""
    main(a[0], a[1], skip, a[a.index("--jpeg") + 1] if "--jpeg" in a else None)
