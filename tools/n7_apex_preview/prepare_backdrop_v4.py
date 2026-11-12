#!/usr/bin/env python3
"""Paint the N7 smoke environment (v4) from code (owner reference: MIRA).

A near-black navy space filled with slow, layered smoke in N7 cyan/teal, a
few brighter wisps (the living highlights settle on them), and sparse fine stars. The centre stays dark so
the screen-blended figure stands clear. Deterministic; no source image and no
image generation. The floating strands are drawn live by N7Backdrop.
"""
import argparse, hashlib, pathlib, subprocess, tempfile
import numpy as np
from PIL import Image

W, H = 2240, 1260
RNG = np.random.default_rng(2207)


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def value_noise(scale):
    gw, gh = max(2, int(W / scale) + 2), max(2, int(H / scale) + 2)
    grid = Image.fromarray((RNG.random((gh, gw)) * 255).astype(np.uint8))
    return np.array(grid.resize((W, H), Image.BICUBIC), np.float32) / 255


def fbm(base, octaves, gain=.55):
    out = np.zeros((H, W), np.float32); amp = 1.0; total = 0.0
    for o in range(octaves):
        out += amp * value_noise(base / 2 ** o); total += amp; amp *= gain
    return out / total


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--out", required=True); args = ap.parse_args()
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    u, v = xx / W, yy / H
    nx, ny = (u - .5) * 2, (v - .5) * 2

    # Base: deep navy, a touch lighter toward the lower middle.
    img = np.zeros((H, W, 3), np.float32) + np.array([.006, .014, .026])
    img += (np.exp(-((nx / .9) ** 2 + ((ny - .45) / .8) ** 2)))[..., None] * np.array([.008, .022, .034])

    # Smoke: domain-warped fBm, turned into soft billows and thin bright wisps.
    warp_x, warp_y = fbm(520, 3), fbm(520, 3)
    a = fbm(620, 7, .52)
    shift = np.stack([np.clip(yy + (warp_y - .5) * 420, 0, H - 1), np.clip(xx + (warp_x - .5) * 420, 0, W - 1)])
    a = a[shift[0].astype(int), shift[1].astype(int)]
    billow = smooth(.36, .82, a) ** 1.4
    wisp = np.exp(-((a - .60) / .035) ** 2) * smooth(.35, .80, fbm(320, 4))
    side = smooth(.15, .85, np.abs(nx)) * .65 + .35          # quieter behind the figure
    img += (billow * side)[..., None] * np.array([.022, .072, .100])
    img += (wisp * side)[..., None] * np.array([.030, .105, .135])
    # A few brighter wisps on the outer sides, where the living highlights appear.
    bright = np.exp(-((a - .60) / .020) ** 2) * smooth(.50, .90, np.abs(nx)) * smooth(.50, .66, fbm(300, 3))
    img += bright[..., None] * np.array([.20, .62, .78])


    # Sparse fine stars, fewer near the centre.
    stars = np.zeros((H, W), np.float32)
    n = 900
    sx, sy = RNG.integers(0, W, n), RNG.integers(0, H, n)
    stars[sy, sx] = RNG.random(n) ** 6 * .9 + .08
    stars *= (.35 + .65 * smooth(.10, .60, np.abs(nx)))
    k = np.array(Image.fromarray((np.clip(stars, 0, 1) * 255).astype(np.uint8)).resize((W // 2, H // 2), Image.BOX).resize((W, H), Image.BICUBIC), np.float32) / 255
    img += (stars * .9 + k * 1.2)[..., None] * np.array([.70, .90, 1.0])

    # Darker stage behind the figure, soft vignette, fine grain against banding.
    stage = 1 - .45 * np.exp(-((nx / .30) ** 2 + ((v - .55) / .55) ** 2))
    vignette = 1 - .55 * smooth(.45, 1.35, np.sqrt(nx ** 2 + (ny * 1.15) ** 2))
    img *= (stage * vignette)[..., None]
    img += RNG.normal(0, .0025, (H, W, 1)).astype(np.float32)
    img = np.clip(img, 0, 1) ** (1 / 1.55)

    image = Image.fromarray((img * 255 + .5).astype(np.uint8), "RGB")
    target = pathlib.Path(args.out)
    with tempfile.TemporaryDirectory() as tmp:
        png = pathlib.Path(tmp) / "out.png"; image.save(png)
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(png), "-c:v", "libwebp", "-quality", "92", str(target)], check=True)
    image.save(target.with_suffix(".preview.png"))
    print("N7_BACKDROP_V4_READY", target, image.size, hashlib.sha256(target.read_bytes()).hexdigest())


if __name__ == "__main__":
    main()
