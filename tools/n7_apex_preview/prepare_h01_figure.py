#!/usr/bin/env python3
"""Compose the owner-supplied H01 head onto the approved N7 body (second face option).

Inputs are the committed, pinned assets only; no image generation is involved.
The H01 head and neck are scaled uniformly and never warped; the body's
shoulder lines are raised next to the neck to meet H01's own neck flare, and
both layers get a light colour match.
Output: 800x1200 lossless WebP whose 320x480-unit layout equals the approved
figure, so the existing neck/skull joint rig applies unchanged.
"""
import argparse, hashlib, pathlib, subprocess, tempfile
import numpy as np
from PIL import Image, ImageFilter

HERE = pathlib.Path(__file__).resolve().parent
BODY = HERE / "assets/n7-humanoid-face-v4.webp"
HEAD = HERE / "assets/n7-head-h01.webp"
BODY_SHA = "1abf41530c4253962a46fe426c107eb2f776f54ad5c2c5e594b8765bd569ea68"
HEAD_SHA = "3d6062af7015d73bd83f9acc5e209ddece193f37bf544d6302daa00251687219"
K = 2.5                      # output pixels per 320x480 layout unit
W, H = int(320 * K), int(480 * K)
# H01 landmarks in its own pixels: hair top 20, chin 1075, face axis x=578.
HEAD_SCALE_UNITS = 180 / 1055  # approved head: hair top y=20, chin y=200
HEAD_AXIS, HEAD_CHIN = 578.0, 1075.0


def decode(path, sha):
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != sha:
        raise RuntimeError(f"unexpected source asset: {path.name}")
    with tempfile.TemporaryDirectory() as tmp:
        png = pathlib.Path(tmp) / "x.png"
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(path), str(png)], check=True)
        return Image.open(png).convert("RGBA").copy()


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def hue_shift(rgb, lo, hi, degrees, feather=12):
    """Rotate hue only for saturated pixels whose hue lies in [lo, hi] degrees."""
    hsv = np.array(Image.fromarray((rgb * 255).astype(np.uint8)).convert("HSV")).astype(np.float32)
    hue = hsv[..., 0] * 360 / 255
    weight = smooth(lo - feather, lo, hue) * (1 - smooth(hi, hi + feather, hue)) * smooth(40, 110, hsv[..., 1])
    hsv[..., 0] = ((hue + degrees * weight) % 360) * 255 / 360
    return np.array(Image.fromarray(hsv.astype(np.uint8), "HSV").convert("RGB")).astype(np.float32) / 255


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    body = decode(BODY, BODY_SHA).resize((W, H), Image.LANCZOS)
    body = np.array(body).astype(np.float32)[..., :3] / 255
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    ux, uy = xx / K, yy / K          # layout units
    dx = np.abs(ux - 160)

    # 1. H01 keeps its own neck at its natural width. Its neck flares into the
    #    shoulders about 13 units higher than the body's shoulder line, so the
    #    body's shoulder lines are raised to meet it next to the neck (nothing
    #    further out or lower moves) and the two outlines become one.
    lift = 13.0 * (1 - smooth(44, 112, dx)) * (1 - smooth(250, 300, uy))
    rows = np.arange(H, dtype=np.float32)
    lifted = np.empty_like(body)
    source_y = (uy + lift) * K
    for column in range(W):
        for channel in range(3):
            lifted[:, column, channel] = np.interp(source_y[:, column], rows, body[:, column, channel])
    body = lifted
    #    Remove the approved line-art head and its loose strands; keep the
    #    (raised) shoulders. The cut stays clear of the shoulder contour.
    keep_from = 204.0 + np.interp(dx, [28, 40, 50, 62, 100, 160], [0, 3, 11, 18, 36, 56]) - 13.0 * (1 - smooth(44, 112, dx))
    body_keep = smooth(-4, 4, uy - keep_from)
    body *= body_keep[..., None]

    # 2. Light match: H01 is lit warm from the left and cool from the right.
    #    Carry a restrained warm key onto the left shoulder lines only.
    lum = body.max(axis=2, keepdims=True)
    warm = lum * np.array([1.0, 0.74, 0.40], np.float32)
    amount = smooth(165, 60, ux) * (0.50 - 0.30 * smooth(215, 430, uy))
    #    Stronger at the left of the neck base, where H01's warm rim hands over to the body line.
    amount = np.clip(amount + 0.45 * np.exp(-(((ux - 125) / 22) ** 2 + ((uy - 226) / 16) ** 2)), 0, 0.9)[..., None]
    cyanish = (body[..., 2:3] > body[..., 0:1] * 1.15).astype(np.float32)
    body = body * (1 - amount * cyanish) + warm * amount * cyanish

    # 3. H01 head, uniform scale, chin on the approved chin point (160, 200).
    head = decode(HEAD, HEAD_SHA)
    scale = HEAD_SCALE_UNITS * K
    size = (round(head.width * scale), round(head.height * scale))
    head = head.resize(size, Image.LANCZOS)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ox, oy = round(160 * K - HEAD_AXIS * scale), round(200 * K - HEAD_CHIN * scale)
    layer.paste(head, (ox, oy))
    layer = np.array(layer).astype(np.float32) / 255
    rgb, alpha = layer[..., :3], layer[..., 3]
    # Bring H01's blue toward N7 cyan and its orange toward N7 gold, slightly.
    rgb = hue_shift(rgb, 196, 232, -6)
    rgb = hue_shift(rgb, 14, 40, +5)

    # 4. One neck: no narrowing and no cut. H01's neck and its flare stay as
    #    drawn and dissolve softly into the body: sideways along the shoulder
    #    line, where its warm and cool rims hand over to the body's own line,
    #    and downward over the upper chest. Loose hair beside the neck is kept.
    radius = int(7 * K)
    kernel = np.exp(-.5 * (np.arange(-3 * radius, 3 * radius + 1) / radius) ** 2); kernel /= kernel.sum()
    column_soft = np.empty_like(alpha)
    for column in range(W):
        column_soft[:, column] = np.convolve(np.pad(alpha[:, column], 3 * radius, mode="edge"), kernel, mode="valid")
    low = smooth(210, 218, uy)
    sideways = 1 - low * smooth(40, 56, dx)
    downward = 1 - low * (1 - smooth(.50, .96, column_soft))
    #    The matte skin thins out gradually toward the chest; its bright
    #    filaments carry further, so they read as the body's own lines.
    bright = smooth(.40, .85, rgb.max(axis=2))
    downward *= 1 - smooth(212, 244, uy) * (1 - .75 * bright)
    fade = sideways * downward
    out = body * (1 - alpha * fade)[..., None] + rgb * (alpha * fade)[..., None]

    image = Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8), "RGB")
    target = pathlib.Path(args.out)
    with tempfile.TemporaryDirectory() as tmp:
        png = pathlib.Path(tmp) / "figure.png"
        image.save(png)
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(png), "-c:v", "libwebp", "-lossless", "1",
                        "-compression_level", "6", str(target)], check=True)
    print("N7_H01_FIGURE_READY", target, image.size, hashlib.sha256(target.read_bytes()).hexdigest())
    if target.with_suffix(".png") != target:
        image.save(target.with_suffix(".preview.png"))


if __name__ == "__main__":
    main()
