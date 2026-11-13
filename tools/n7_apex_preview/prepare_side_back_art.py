#!/usr/bin/env python3
"""Align the owner's approved profile and back pictures to the approved front frame.

Both are placed on the idle's 320x480 black frame without redrawing:
- profile: rows mapped so its hair top and neck land on the front's (13, 207);
  same horizontal scale; its depth centre is recorded for the viewer.
- back: uniform scale, vertical squash and shift found by maximum outline
  correlation with the front, as for the mood pictures.
"""
import argparse, hashlib, json, pathlib, subprocess, tempfile
import numpy as np
from PIL import Image, ImageFilter

HERE = pathlib.Path(__file__).resolve().parent
PACK = HERE.parents[1] / "docs/validation/n7-reference-pack"
W, H = 320, 480


def save(img, path):
    with tempfile.TemporaryDirectory() as tmp:
        png = pathlib.Path(tmp) / "a.png"; img.save(png)
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(png), "-c:v", "libwebp", "-lossless", "1", str(path)], check=True)
    return hashlib.sha256(path.read_bytes()).hexdigest()


def decode(path):
    with tempfile.TemporaryDirectory() as tmp:
        png = pathlib.Path(tmp) / "a.png"; subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(path), str(png)], check=True)
        return Image.open(png).convert("RGB").copy()


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--out", required=True); args = ap.parse_args()
    out = pathlib.Path(args.out); out.mkdir(parents=True, exist_ok=True)
    front = decode(HERE / "assets/n7-humanoid-face-v4.webp")
    report = {}
    # Profile: vertical landmark mapping.
    prof = Image.open(PACK / "N7-profile-supplied.png").convert("RGB").resize((W, H), Image.LANCZOS)
    m = np.array(prof).max(axis=2) > 70
    rows = np.where(m.sum(1) > 1)[0]; ptop = int(rows.min())  # same rule as prepare_model_fitted.py
    # Neck = narrowest outline extent (same measure as prepare_model_fitted.py).
    w = np.array([(np.where(m[y])[0].max() - np.where(m[y])[0].min()) if m[y].any() else 999 for y in range(H)]); pneck = 150 + int(np.argmin(w[150:260]))
    atop, aneck = 13, 207
    src = np.array(prof)
    r = np.arange(H); pr = np.clip(ptop + (r - atop) * (pneck - ptop) / (aneck - atop), 0, H - 1)
    aligned = np.empty_like(src)
    for c in range(3):
        for x in range(W): aligned[:, x, c] = np.interp(pr, r, src[:, x, c])
    report["profile"] = {"sha256": save(Image.fromarray(aligned.astype(np.uint8)), out / "n7-art-profile-v1.webp"), "rows": [ptop, pneck]}
    # Back: outline correlation fit to the front.
    gw, gh = 160, 240
    idle = np.array(front.convert("L").resize((gw, gh), Image.BILINEAR).filter(ImageFilter.GaussianBlur(1.5))).astype(float); idle -= idle.mean()
    back = Image.open(PACK / "N7-back-supplied.png").convert("RGB"); bw, bh = back.size; bl = back.convert("L")
    def place(img, s, sy, dx, dy, size):
        Wd, Hd = size; nw, nh = int(Wd * s), int(Wd * s * sy * bh / bw)
        c = Image.new(img.mode, (Wd, Hd)); c.paste(img.resize((nw, nh), Image.LANCZOS), (int((Wd - nw) / 2 + dx), int(dy))); return c
    best = (-1,)
    for s in np.arange(.90, 1.16, .02):
        for sy in np.arange(.86, 1.06, .02):
            for dy in range(-16, 12, 2):
                c = np.array(place(bl, s, sy, 0, dy, (gw, gh)).filter(ImageFilter.GaussianBlur(1.5))).astype(float); c -= c.mean()
                v = (c * idle).sum() / np.sqrt((c * c).sum() * (idle * idle).sum())
                if v > best[0]: best = (v, s, sy, dy)
    v, s, sy, dy = best
    report["back"] = {"sha256": save(place(back, s, sy, 0, dy * 2, (W, H)), out / "n7-art-back-v1.webp"), "fit": {"correlation": round(float(v), 3), "scale": round(float(s), 2), "squash": round(float(sy), 2), "dy": dy * 2}}
    print(json.dumps(report))


if __name__ == "__main__":
    main()
