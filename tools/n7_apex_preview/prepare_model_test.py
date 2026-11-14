#!/usr/bin/env python3
"""Prepare the owner's N7 3D model (textured.glb) for the isolated model test.

Geometry, normals, UVs and the material are kept exactly. Only the two
embedded 4096x4096 textures are reduced to 2048x2048 JPEG (base colour, and
the packed metallic/roughness map), which cuts the download from 15.7 MB to a
few MB. The original file's SHA-256 is checked first.
"""
import argparse, hashlib, io, json, pathlib, struct
from PIL import Image

ORIGINAL_SHA = "929195d16fa3e976793174ae668e1ed765cb43831b50ad9362cc64badfbdf97f"


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--src", required=True); ap.add_argument("--out", required=True); ap.add_argument("--size", type=int, default=2048)
    args = ap.parse_args()
    data = pathlib.Path(args.src).read_bytes()
    if hashlib.sha256(data).hexdigest() != ORIGINAL_SHA:
        raise SystemExit("unexpected source model")
    clen = struct.unpack("<I", data[12:16])[0]
    gltf = json.loads(data[20:20 + clen])
    bin_start = 20 + clen + 8
    blen = struct.unpack("<I", data[20 + clen:24 + clen])[0]
    binary = data[bin_start:bin_start + blen]
    image_views = {img["bufferView"]: img for img in gltf.get("images", [])}
    out = bytearray()
    for index, view in enumerate(gltf["bufferViews"]):
        chunk = binary[view.get("byteOffset", 0):view.get("byteOffset", 0) + view["byteLength"]]
        if index in image_views:
            img = Image.open(io.BytesIO(chunk)).convert("RGB").resize((args.size, args.size), Image.LANCZOS)
            buf = io.BytesIO(); img.save(buf, "JPEG", quality=88, optimize=True, subsampling=0); chunk = buf.getvalue()
            image_views[index]["mimeType"] = "image/jpeg"
        while len(out) % 4: out.append(0)
        view["byteOffset"] = len(out); view["byteLength"] = len(chunk); out += chunk
    while len(out) % 4: out.append(0)
    gltf["buffers"][0]["byteLength"] = len(out)
    js = json.dumps(gltf, separators=(",", ":")).encode()
    while len(js) % 4: js += b" "
    glb = struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(js) + 8 + len(out)) + struct.pack("<I4s", len(js), b"JSON") + js + struct.pack("<I4s", len(out), b"BIN\0") + bytes(out)
    pathlib.Path(args.out).write_bytes(glb)
    print("N7_MODEL_TEST_READY", args.out, len(glb), hashlib.sha256(glb).hexdigest())


if __name__ == "__main__":
    main()
