#!/usr/bin/env python3
"""Fit the owner's 3D N7 model to the approved N7 figure.

The owner supplied textured.glb as a 3D base to be adapted to the existing,
approved N7 (n7-humanoid-face-v4), not shown as is. This keeps the model's
mesh, UVs and its own texture (used only for the sides and back), and:

1. Orients it upright and places it in the approved picture's 320x480 frame
   (front view, orthographic): uniform scale and offset fitted to the outline.
2. Stretches the head above the chin so the hair tops meet, then reshapes it row by row so its front outline follows the approved figure's
   outline (hair, head, neck, shoulders), with a smooth width curve; depth is
   scaled with half the same factor so the volume stays rounded.
3. With --profile, maps each row's depth onto the owner's approved profile outline.
4. Leaves everything else, including the figure's proportions in the picture,
   to the picture itself, which the viewer projects onto the front.

Output: a GLB with Y-up positions in picture units (1 unit = 1 picture pixel,
origin at picture (160, 0), y up = picture y down negated).
"""
import argparse, hashlib, io, json, pathlib, struct, subprocess, tempfile
import numpy as np
from PIL import Image, ImageDraw

HERE = pathlib.Path(__file__).resolve().parent
SRC_SHA = "659017150e31a797ee8743384a1ed9bd253ab5e8f1514ac595a3c3344b054837"  # n7-model-textured-v1.glb
ART_SHA = "1abf41530c4253962a46fe426c107eb2f776f54ad5c2c5e594b8765bd569ea68"  # approved n7-humanoid-face-v4.webp
SCALE, TY = 200.0, 245.0  # fitted: picture px per model unit, picture y of model origin


def decode_art():
    data = (HERE / "assets/n7-humanoid-face-v4.webp").read_bytes()
    if hashlib.sha256(data).hexdigest() != ART_SHA: raise SystemExit("unexpected artwork")
    with tempfile.TemporaryDirectory() as tmp:
        png = pathlib.Path(tmp) / "a.png"; subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(HERE / "assets/n7-humanoid-face-v4.webp"), str(png)], check=True)
        return np.array(Image.open(png).convert("RGB")).astype(float).max(axis=2)


def smooth_rows(v, k=9):
    pad = np.pad(v, k, mode="edge"); w = np.hanning(2 * k + 1); w /= w.sum()
    return np.convolve(pad, w, mode="same")[k:-k]


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--out", required=True); ap.add_argument("--profile"); args = ap.parse_args()
    src = HERE / "assets/n7-model-textured-v1.glb"; b = src.read_bytes()
    if hashlib.sha256(b).hexdigest() != SRC_SHA: raise SystemExit("unexpected source model")
    clen = struct.unpack("<I", b[12:16])[0]; j = json.loads(b[20:20 + clen]); bin0 = 20 + clen + 8
    blen = struct.unpack("<I", b[20 + clen:24 + clen])[0]; binary = bytearray(b[bin0:bin0 + blen])
    prim = j["meshes"][0]["primitives"][0]
    def view(i):
        a = j["accessors"][i]; bv = j["bufferViews"][a["bufferView"]]; return a, bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    pa, poff = view(prim["attributes"]["POSITION"])
    P = np.frombuffer(bytes(binary[poff:poff + pa["count"] * 12]), "<f4").reshape(-1, 3).astype(np.float64)
    P = np.stack([P[:, 0], -P[:, 2], P[:, 1]], 1)            # bake the file's +90 deg X rotation: Y up, Z toward viewer
    ia, ioff = view(prim["indices"])
    dt = "<u2" if ia["componentType"] == 5123 else "<u4"
    tri = np.frombuffer(bytes(binary[ioff:ioff + ia["count"] * np.dtype(dt).itemsize]), dt).reshape(-1, 3)
    # Picture coordinates of every vertex (front, orthographic).
    px, py = P[:, 0] * SCALE + 160, -P[:, 1] * SCALE + TY
    # The approved hair rises higher than the model's: stretch only the head
    # above the chin (row 197) so the hair tops meet; the face/neck keep scale.
    art_rows = np.where((decode_art() > 70).any(1))[0]
    model_top = py.min(); art_top = float(art_rows.min()) + 2; chin = 197.0
    k = (chin - art_top) / (chin - model_top)
    above = py < chin
    py = np.where(above, chin - (chin - py) * k, py)
    head_stretch = float(k)
    # Front outline of the model per picture row.
    mask = Image.new("L", (320, 480), 0); d = ImageDraw.Draw(mask)
    for t in tri: d.polygon([(px[k], py[k]) for k in t], fill=255)
    m = np.array(mask) > 0
    art = decode_art(); tgt = art > 70
    rows = np.arange(480); mL = np.full(480, np.nan); mR = mL.copy(); tL = mL.copy(); tR = mL.copy()
    for y in rows:
        a = np.where(m[y])[0]; t = np.where(tgt[y])[0]
        if len(a) > 1: mL[y], mR[y] = a.min(), a.max()
        if len(t) > 1: tL[y], tR[y] = t.min(), t.max()
    valid = ~np.isnan(mL) & ~np.isnan(tL)
    sx = np.ones(480); cx = np.zeros(480)
    sx[valid] = (tR[valid] - tL[valid]) / np.maximum(4, mR[valid] - mL[valid])
    cx[valid] = (tL[valid] + tR[valid]) / 2 - (mL[valid] + mR[valid]) / 2
    sx = np.clip(np.interp(rows, rows[valid], sx[valid]), .80, 1.45); cx = np.clip(np.interp(rows, rows[valid], cx[valid]), -12, 12)
    sx, cx = smooth_rows(sx, 14), smooth_rows(cx, 14)
    # Apply per row (interpolated at each vertex's picture y), around the picture centre.
    yi = np.clip(py, 0, 479); s = np.interp(yi, rows, sx); c = np.interp(yi, rows, cx)
    nx = 160 + (px - 160) * s + c
    depth = P[:, 2] * SCALE * (1 + (s - 1) * .5)
    report_side = {}
    if args.profile:
        # 4. Side shape from the owner's approved profile picture (facing right,
        #    so its right edge is the front). Each row's depth range is mapped
        #    onto the profile's outline in that row; rows are aligned on the
        #    hair top and the neck, measured in both pictures.
        prof = np.array(Image.open(args.profile).convert("RGB").resize((320, 480), Image.LANCZOS)).astype(float).max(axis=2) > 70
        def edges(mask):
            L = np.full(480, np.nan); R = L.copy()
            for y in range(480):
                xs = np.where(mask[y])[0]
                if len(xs) > 1: L[y], R[y] = xs.min(), xs.max()
            return L, R
        pL, pR = edges(prof)
        ptop = int(np.where(~np.isnan(pL))[0].min()); atop = int(np.where((art > 70).any(1))[0].min())
        pw = np.where(np.isnan(pL), 999, pR - pL); pneck = 150 + int(np.argmin(pw[150:260]))
        aw = np.array([((art[y] > 70).sum()) for y in range(480)]); aneck = 207
        # picture row -> profile row
        to_prof = lambda r: ptop + (r - atop) * (pneck - ptop) / (aneck - atop)
        valid = ~np.isnan(pL)
        pL = smooth_rows(np.interp(rows, rows[valid], pL[valid]), 6); pR = smooth_rows(np.interp(rows, rows[valid], pR[valid]), 6)
        centre = float(np.mean((pL[215:246] + pR[215:246]) / 2))   # neck column centre -> depth 0
        # model depth range per picture row (vertex based)
        zmin = np.full(480, np.nan); zmax = zmin.copy(); r_i = np.clip(np.round(py).astype(int), 0, 479)
        for r in range(480):
            sel = r_i == r
            if sel.sum() > 3: zmin[r], zmax[r] = depth[sel].min(), depth[sel].max()
        ok = ~np.isnan(zmin)
        zmin = smooth_rows(np.interp(rows, rows[ok], zmin[ok]), 8); zmax = smooth_rows(np.interp(rows, rows[ok], zmax[ok]), 8)
        pr = np.clip(to_prof(py), 0, 479)
        back, front = np.interp(pr, rows, pL) - centre, np.interp(pr, rows, pR) - centre
        lo, hi = np.interp(py, rows, zmin), np.interp(py, rows, zmax)
        f = np.clip((depth - lo) / np.maximum(1, hi - lo), 0, 1)
        depth = back + f * (front - back)
        # 5. Smooth N7 face. The model's own nose, lips and cheeks are replaced
        #    by a smooth mask inside the approved face oval (centre 160,140;
        #    half-axes 62 x 92 px): depth follows the profile's front edge in
        #    the centre and falls off smoothly to the sides, blended out at the
        #    oval's rim so it joins the rest of the head.
        fx = (nx - 160) / 62.0; fy = (py - 140) / 92.0; rho = np.sqrt(fx ** 2 + fy ** 2)
        frontish = depth > (back + front) / 2
        mask_w = np.clip((1.0 - rho) / .22, 0, 1); mask_w = mask_w * mask_w * (3 - 2 * mask_w) * frontish
        # Stop above the jaw line so the chin and neck keep the model's shape (no folds).
        mask_w *= 1 - np.clip((py - 178) / 18.0, 0, 1)
        face_front = np.interp(np.clip(to_prof(np.full_like(py, 150.0)), 0, 479), rows, pR) - centre
        smooth_face = face_front - 30.0 * fx ** 2 - 10.0 * np.clip(fy, 0, None) ** 2
        depth = depth * (1 - mask_w) + smooth_face * mask_w
        report_side["face_vertices_smoothed"] = int((mask_w > .5).sum())
        report_side = {"profile_centre_px": round(centre, 1), "profile_rows": {"top": ptop, "neck": pneck}, "art_rows": {"top": atop, "neck": aneck}}
    out = np.stack([nx - 160, -(py), depth], 1).astype("<f4")   # picture units, y up, origin at picture (160,0)
    binary[poff:poff + pa["count"] * 12] = out.tobytes()
    pa["min"] = out.min(0).tolist(); pa["max"] = out.max(0).tolist()
    # Normals no longer match; the viewer recomputes them.
    prim["attributes"].pop("NORMAL", None)
    j["nodes"][0].pop("rotation", None); j["nodes"][0]["name"] = "n7_fitted"
    js = json.dumps(j, separators=(",", ":")).encode()
    while len(js) % 4: js += b" "
    glb = struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(js) + 8 + len(binary)) + struct.pack("<I4s", len(js), b"JSON") + js + struct.pack("<I4s", len(binary), b"BIN\0") + bytes(binary)
    pathlib.Path(args.out).write_bytes(glb)
    # Fit report: outline overlap before and after reshaping.
    mask2 = Image.new("L", (320, 480), 0); d2 = ImageDraw.Draw(mask2)
    for t in tri: d2.polygon([(nx[k], py[k]) for k in t], fill=255)
    m2 = np.array(mask2) > 0; lo, hi = np.where(m2.any(1))[0][[0, -1]]
    def iou(a): return float((a[lo:hi - 6] & tgt2[lo:hi - 6]).sum() / max(1, (a[lo:hi - 6] | tgt2[lo:hi - 6]).sum()))
    tgt2 = np.zeros_like(tgt)
    for y in rows:
        if not np.isnan(tL[y]): tgt2[y, int(tL[y]):int(tR[y]) + 1] = True
    print(json.dumps({"out": args.out, "bytes": len(glb), "sha256": hashlib.sha256(glb).hexdigest(), "iou_before": round(iou(m), 3), "iou_after": round(iou(m2), 3), "rows": [int(lo), int(hi)], "width_factor_range": [round(float(sx.min()), 3), round(float(sx.max()), 3)], "head_height_factor": round(head_stretch, 3), **report_side}))
    viz = np.zeros((480, 320, 3), np.uint8); viz[..., 0] = tgt2 * 200; viz[..., 1] = m2 * 200; viz[..., 2] = (art > 70) * 255
    Image.fromarray(viz).resize((640, 960)).save(pathlib.Path(args.out).with_suffix(".fit.png"))


if __name__ == "__main__":
    main()
