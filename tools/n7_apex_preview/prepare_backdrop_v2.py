#!/usr/bin/env python3
"""Derive the quieter, wider N7 mountain environment (v2) from the pinned v1 raster.

No image generation: the existing mountain raster is extended sideways by
mirrored continuation to a 21:9 panorama, softened for depth, graded into the
N7 navy/cyan palette with a faint gold horizon, and darkened behind the figure
so the screen-blended Humanoid reads clearly. Deterministic.
"""
import argparse, hashlib, pathlib, subprocess, tempfile
import numpy as np
from PIL import Image, ImageFilter

HERE = pathlib.Path(__file__).resolve().parent
SOURCE = HERE / "assets/n7-mountain-backdrop.webp"
SOURCE_SHA = "585e573b8f8701f12072e52404552b99dcbadc4a58f52d3cf4a1fbfbc5df5f18"
OUT_W, OUT_H = 2400, 1028


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    if hashlib.sha256(SOURCE.read_bytes()).hexdigest() != SOURCE_SHA:
        raise RuntimeError("unexpected backdrop source")
    with tempfile.TemporaryDirectory() as tmp:
        png = pathlib.Path(tmp) / "src.png"
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(SOURCE), str(png)], check=True)
        src = Image.open(png).convert("RGB").copy()

    # Wide: scale to the output height, then continue each side with a mirrored,
    # increasingly blurred copy so the valley opens into a panorama.
    scale = OUT_H / src.height
    base = src.resize((round(src.width * scale), OUT_H), Image.LANCZOS)
    side = (OUT_W - base.width) // 2 + 1
    canvas = Image.new("RGB", (OUT_W, OUT_H))
    left = base.crop((0, 0, side, OUT_H)).transpose(Image.FLIP_LEFT_RIGHT).filter(ImageFilter.GaussianBlur(5))
    right = base.crop((base.width - side, 0, base.width, OUT_H)).transpose(Image.FLIP_LEFT_RIGHT).filter(ImageFilter.GaussianBlur(5))
    x0 = (OUT_W - base.width) // 2
    canvas.paste(left, (x0 - side, 0)); canvas.paste(right, (x0 + base.width, 0)); canvas.paste(base, (x0, 0))
    # Depth: a gentle overall softness, stronger toward the edges.
    soft = np.array(canvas.filter(ImageFilter.GaussianBlur(1.4))).astype(np.float32) / 255
    softer = np.array(canvas.filter(ImageFilter.GaussianBlur(7))).astype(np.float32) / 255
    yy, xx = np.mgrid[0:OUT_H, 0:OUT_W].astype(np.float32)
    nx, ny = (xx / OUT_W - .5) * 2, (yy / OUT_H - .5) * 2
    edge = smooth(.55, 1.0, np.abs(nx))[..., None]
    img = soft * (1 - edge) + softer * edge

    # N7 grade: navy shadows, cyan mid-lights, ice highlights on the glaciers.
    lum = (img * np.array([.2126, .7152, .0722], np.float32)).sum(axis=2, keepdims=True)
    navy, teal, ice = (np.array(c, np.float32) for c in ([.012, .036, .070], [.050, .270, .400], [.66, .93, 1.0]))
    graded = navy + (teal - navy) * smooth(.02, .40, lum) + (ice - teal) * smooth(.38, .92, lum)
    img = img * .50 + graded * .50

    # Light: a cyan haze lying in the valley and a thin gold dusk line on the
    # horizon, both low and wide, so the scene glows without competing.
    horizon = yy / OUT_H
    haze = np.exp(-((horizon - .44) / .17) ** 2) * (.50 + .50 * np.exp(-(nx / .75) ** 2))
    img += haze[..., None] * np.array([.020, .085, .120], np.float32)
    dusk = np.exp(-((horizon - .255) / .035) ** 2) * np.exp(-((nx - .18) / .55) ** 2) * (1 - smooth(.08, .34, (softer * np.array([.2126, .7152, .0722], np.float32)).sum(axis=2)))
    img += dusk[..., None] * np.array([.20, .115, .025], np.float32)

    # Discreet: a darker stage behind the figure, quiet ground, soft vignette.
    stage = 1 - .30 * np.exp(-((nx / .30) ** 2 + ((ny - .15) / .90) ** 2))
    vignette = 1 - .42 * smooth(.40, 1.30, np.sqrt((nx * .95) ** 2 + (ny * .85) ** 2))
    ground = 1 - .28 * smooth(.30, 1.0, ny)
    img *= (stage * vignette * ground)[..., None]

    image = Image.fromarray((np.clip(img, 0, 1) * 255 + .5).astype(np.uint8), "RGB")
    target = pathlib.Path(args.out)
    with tempfile.TemporaryDirectory() as tmp:
        png = pathlib.Path(tmp) / "out.png"
        image.save(png)
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(png), "-c:v", "libwebp", "-quality", "90", str(target)], check=True)
    image.save(target.with_suffix(".preview.png"))
    print("N7_BACKDROP_V2_READY", target, image.size, hashlib.sha256(target.read_bytes()).hexdigest())


if __name__ == "__main__":
    main()
