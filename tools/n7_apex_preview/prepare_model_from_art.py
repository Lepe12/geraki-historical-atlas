#!/usr/bin/env python3
"""Build the N7 3D shape directly from the owner's approved pictures.

No external model: for every picture row the figure's width comes from the
approved front picture and its depth from the approved profile (already aligned
to the front frame by prepare_side_back_art.py). Each row becomes a rounded
cross-section (superellipse) spanning exactly that width and depth, and the
rows are joined into one surface from the hair top to the bottom of the frame.
Loose hair strands beside the neck are left out of the volume: in the neck
band the outline follows the neck's own contour lines. The pictures themselves
are projected onto this surface by the viewer.

Output: GLB in picture units (1 = 1 px of the 320x480 frame), y up = -row,
x = column - 160, z = profile column - PROFILE_CENTRE (front = +z).
"""
import argparse, hashlib, json, pathlib, struct, subprocess, tempfile
import numpy as np
from PIL import Image, ImageFilter

HERE = pathlib.Path(__file__).resolve().parent
FRONT_SHA = "1abf41530c4253962a46fe426c107eb2f776f54ad5c2c5e594b8765bd569ea68"
PROFILE_CENTRE = 143.5
ROW_STEP, SEGMENTS = 2, 120


def decode(name, sha=None):
    path = HERE / "assets" / name
    if sha and hashlib.sha256(path.read_bytes()).hexdigest() != sha: raise SystemExit("unexpected " + name)
    with tempfile.TemporaryDirectory() as tmp:
        png = pathlib.Path(tmp) / "a.png"; subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(path), str(png)], check=True)
        return np.array(Image.open(png).convert("L").filter(ImageFilter.GaussianBlur(1.6))).astype(float)


def median_rows(v, k=9):
    out = v.copy(); h = k // 2
    for i in range(len(v)):
        w = v[max(0, i - h):i + h + 1]; w = w[~np.isnan(w)]
        out[i] = np.median(w) if len(w) else np.nan
    return out


def outline(a, cx, inner_rows, inner_sides, thr=40, minoff=14):
    """Outermost bright edges per row; inside `inner_rows` the named sides use
    the contour line nearest the centre instead (skips loose strands)."""
    m = a > thr; L = np.full(480, np.nan); R = L.copy()
    for y in range(480):
        xs = np.where(m[y])[0]
        if len(xs) < 2: continue
        L[y], R[y] = xs.min(), xs.max()
        if inner_rows[0] <= y <= inner_rows[1]:
            if "L" in inner_sides:
                c = xs[xs < cx - minoff]
                if len(c): L[y] = c.max()
            if "R" in inner_sides:
                c = xs[xs > cx + minoff]
                if len(c): R[y] = c.min()
    return median_rows(L), median_rows(R)


def shoulder_slope(a, cx, L, R, rows, side="LR", thr=40, start=236, bottom=300, minoff=24):
    """Between the neck and the full shoulders, follow the drawn shoulder line:
    for each column outside the neck, the first bright pixel from `start`
    down is the shoulder contour; a row includes every column whose shoulder
    contour is at or above it (plus the neck's own contour)."""
    m = a > thr; top = np.full(320, np.inf)
    for x in range(320):
        if abs(x - cx) < minoff: continue
        ys = np.where(m[start:bottom, x])[0]
        if len(ys): top[x] = start + ys[0]
    L, R = L.copy(), R.copy()
    for y in range(rows[0], rows[1] + 1):
        cols = np.where(top <= y)[0]
        if "L" in side:
            left = cols[cols < cx]; neck = L[y] if not np.isnan(L[y]) else cx - minoff
            L[y] = min(neck, left.min()) if len(left) else neck
        if "R" in side:
            right = cols[cols > cx]; neck = R[y] if not np.isnan(R[y]) else cx + minoff
            R[y] = max(neck, right.max()) if len(right) else neck
    return L, R


def fill(v):
    ok = ~np.isnan(v); idx = np.arange(len(v)); first, last = idx[ok][0], idx[ok][-1]
    v = np.interp(idx, idx[ok], v[ok]); return v, int(first), int(last)


def smooth(v, k=5):
    pad = np.pad(v, k, mode="edge"); w = np.hanning(2 * k + 1); w /= w.sum()
    return np.convolve(pad, w, mode="same")[k:-k]


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--out", required=True); args = ap.parse_args()
    front = decode("n7-humanoid-face-v4.webp", FRONT_SHA); prof = decode("n7-art-profile-v1.webp")
    fL, fR = outline(front, 160, (196, 300), "LR")
    fL, fR = shoulder_slope(front, 160, fL, fR, (236, 300))
    pL, pR = outline(prof, PROFILE_CENTRE, (200, 300), "L")
    pL, pR = shoulder_slope(prof, PROFILE_CENTRE, pL, pR, (236, 300), side="L")
    # The pictures fade out at the very bottom: hold the last clear rows.
    for v in (fL, fR, pL, pR): v[440:] = v[439]
    (fL, t1, b1), (fR, _, _), (pL, t2, b2), (pR, _, _) = fill(fL), fill(fR), fill(pL), fill(pR)
    fL, fR, pL, pR = smooth(fL), smooth(fR), smooth(pL), smooth(pR)
    top, bottom = max(t1, t2), 479
    rows = list(range(top, bottom + 1, ROW_STEP))
    if rows[-1] != bottom: rows.append(bottom)
    verts, faces = [], []
    theta = np.linspace(0, 2 * np.pi, SEGMENTS, endpoint=False)
    for y in rows:
        cx, hw = (fL[y] + fR[y]) / 2 - 160, max(1.5, (fR[y] - fL[y]) / 2)
        cz, hd = (pL[y] + pR[y]) / 2 - PROFILE_CENTRE, max(1.5, (pR[y] - pL[y]) / 2)
        # Close the top of the head smoothly over the first rows.
        k = min(1.0, (y - top + 2) / 10.0) ** .5
        n = 2.2 if y < 200 else 2.6
        c, s = np.cos(theta), np.sin(theta)
        x = cx + hw * k * np.sign(c) * np.abs(c) ** (2 / n)
        z = cz + hd * k * np.sign(s) * np.abs(s) ** (2 / n)
        for xi, zi in zip(x, z): verts.append((xi, -float(y), zi))
    rings = len(rows)
    for r in range(rings - 1):
        for i in range(SEGMENTS):
            a, b = r * SEGMENTS + i, r * SEGMENTS + (i + 1) % SEGMENTS
            c2, d = a + SEGMENTS, b + SEGMENTS
            faces += [(a, b, c2), (b, d, c2)]   # outward-facing
    apex = len(verts); verts.append(((fL[top] + fR[top]) / 2 - 160, -float(top - 1), (pL[top] + pR[top]) / 2 - PROFILE_CENTRE))
    for i in range(SEGMENTS): faces.append((apex, (i + 1) % SEGMENTS, i))
    V = np.array(verts, "<f4"); F = np.array(faces, "<u4")
    pos, idx = V.tobytes(), F.tobytes()
    gltf = {"asset": {"version": "2.0", "generator": "N7 prepare_model_from_art.py"}, "scene": 0, "scenes": [{"nodes": [0]}],
            "nodes": [{"mesh": 0, "name": "n7_from_art"}], "meshes": [{"primitives": [{"attributes": {"POSITION": 0}, "indices": 1, "material": 0}]}],
            "materials": [{"name": "n7", "doubleSided": True}],
            "buffers": [{"byteLength": len(pos) + len(idx)}],
            "bufferViews": [{"buffer": 0, "byteOffset": 0, "byteLength": len(pos), "target": 34962}, {"buffer": 0, "byteOffset": len(pos), "byteLength": len(idx), "target": 34963}],
            "accessors": [{"bufferView": 0, "componentType": 5126, "count": len(V), "type": "VEC3", "min": V.min(0).tolist(), "max": V.max(0).tolist()},
                          {"bufferView": 1, "componentType": 5125, "count": F.size, "type": "SCALAR"}]}
    js = json.dumps(gltf, separators=(",", ":")).encode()
    while len(js) % 4: js += b" "
    binary = pos + idx
    glb = struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(js) + 8 + len(binary)) + struct.pack("<I4s", len(js), b"JSON") + js + struct.pack("<I4s", len(binary), b"BIN\0") + binary
    pathlib.Path(args.out).write_bytes(glb)
    print(json.dumps({"out": args.out, "bytes": len(glb), "sha256": hashlib.sha256(glb).hexdigest(), "vertices": len(V), "triangles": len(F), "rows": [top, bottom],
                      "neck_width_px": round(float(np.min((fR - fL)[196:252])), 1), "neck_depth_px": round(float(np.min((pR - pL)[200:262])), 1)}))


if __name__ == "__main__":
    main()
