#!/usr/bin/env python3
"""Paint the designed N7 environment (v3) from nothing but code.

A wide alpine dusk in the N7 palette: star field and a faint cyan veil in a
navy sky, a gold-to-cyan glow on the horizon, six alpine ranges receding in
haze with snow that catches the light, and mist lying in the valleys. The middle is kept open and dark so the screen-blended Humanoid
stands clear. Stylised, not photographic. Deterministic; no source image and
no image generation.
"""
import argparse, hashlib, pathlib, subprocess, tempfile
import numpy as np
from PIL import Image

W, H = 2240, 1260
RNG = np.random.default_rng(77)


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def noise1d(n, knots, rng):
    xs = np.linspace(0, 1, knots)
    t = np.linspace(0, 1, n)
    v = rng.uniform(-1, 1, knots)
    i = np.clip(np.searchsorted(xs, t) - 1, 0, knots - 2)
    f = (t - xs[i]) / (xs[i + 1] - xs[i]); f = f * f * (3 - 2 * f)
    return v[i] * (1 - f) + v[i + 1] * f


def fbm(n, base, octaves, rng, gain=.5):
    out = np.zeros(n); amp = 1.0; total = 0.0
    for o in range(octaves):
        out += amp * noise1d(n, base * 2 ** o + 1, rng); total += amp; amp *= gain
    return out / total


def blur(a, radius):
    """Gaussian blur of a float field, in the frequency domain (mirror-padded)."""
    pad = int(radius * 3) + 1
    f = np.pad(a.astype(np.float32), pad, mode="reflect")
    fy = np.fft.fftfreq(f.shape[0])[:, None]; fx = np.fft.rfftfreq(f.shape[1])[None, :]
    kernel = np.exp(-2 * (np.pi * radius) ** 2 * (fx ** 2 + fy ** 2))
    out = np.fft.irfft2(np.fft.rfft2(f) * kernel, s=f.shape)
    return out[pad:-pad, pad:-pad].astype(np.float32)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--out", required=True); args = ap.parse_args()
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    u, v = xx / W, yy / H
    nx = (u - .5) * 2
    horizon = .60

    # Sky: navy zenith to a teal band, then the dusk glow sitting on the horizon.
    t = smooth(0, horizon, v)[..., None]
    sky = np.array([.006, .016, .040]) * (1 - t) + np.array([.020, .105, .170]) * t
    glow_y = np.exp(-((v - horizon) / .11) ** 2)
    sky += (glow_y * (.55 + .45 * np.exp(-(nx / .9) ** 2)))[..., None] * np.array([.040, .240, .320])
    gold = np.exp(-((v - horizon + .030) / .045) ** 2) * (np.exp(-((nx + .46) / .30) ** 2) + .75 * np.exp(-((nx - .52) / .26) ** 2))
    sky += gold[..., None] * np.array([.70, .40, .09])
    # A faint cyan veil sweeping across the upper sky.
    veil = np.zeros((H, W), np.float32)
    for k, (cy, amp, width, freq, phase) in enumerate([(.20, .050, .050, 1.6, .3), (.29, .040, .035, 2.3, 1.7), (.13, .030, .060, 1.1, 2.6)]):
        band = cy + amp * np.sin(u * np.pi * freq + phase) + .012 * np.sin(u * 23 + k)
        veil += np.exp(-((v - band) / (width * 1.6)) ** 2) * (.5 + .5 * np.sin(u * np.pi * (1.3 + k) + k * 1.9)) ** 2 * .6
    sky += (blur(veil * .5, 14) * 2)[..., None] * np.array([.012, .085, .100])
    # Stars: mostly faint pinpoints, a handful brighter, thinning toward the horizon.
    stars = np.zeros((H, W), np.float32)
    count = 1500
    sx, sy = RNG.integers(0, W, count), (RNG.random(count) ** 1.6 * H * horizon * .95).astype(int)
    stars[sy, sx] = RNG.random(count) ** 7 + .05
    stars = blur(stars, .75) * 5.5 + blur(stars ** 2, 2.2) * 9
    sky += (stars * (1 - smooth(horizon - .26, horizon - .02, v)))[..., None] * np.array([.78, .92, 1.0])
    img = sky.astype(np.float32)

    # Alpine ranges, far to near: jagged ridged-noise crests with named peaks at
    # the sides and a wide open valley in the middle for the figure.
    line = np.linspace(-1, 1, W)

    def ridged(base, octaves):
        out = np.zeros(W); amp = 1.0; total = 0.0
        for o in range(octaves):
            out += amp * (1 - np.abs(noise1d(W, base * 2 ** o + 1, RNG))) ** 1.6; total += amp; amp *= .52
        return out / total

    layers = [  # centre crest, valley lift, roughness, peaks (x, height, width), colour, light, snow
        (.585, .020, .030, [(-.62, .050, .30), (.70, .060, .28), (.08, .020, .25)], (.060, .200, .285), .55, .0),
        (.610, .045, .050, [(-.80, .120, .30), (-.34, .060, .20), (.45, .095, .24), (.90, .110, .26)], (.040, .145, .215), .85, .55),
        (.650, .075, .070, [(-.58, .190, .28), (.72, .215, .30), (.22, .045, .16)], (.026, .100, .158), 1.0, 1.0),
        (.705, .110, .075, [(-.90, .250, .34), (.96, .230, .32), (-.30, .050, .18)], (.015, .062, .104), .75, .65),
        (.775, .150, .070, [(-.70, .130, .30), (.62, .150, .30)], (.008, .034, .060), .35, .0),
        (.865, .170, .060, [(-.95, .150, .40), (.98, .170, .40)], (.004, .016, .030), .10, .0),
    ]
    facet_a, facet_b = fbm(W * 2, 90, 5, RNG), fbm(W * 2, 70, 5, RNG)
    columns = np.arange(W)[None, :]
    for index, (centre, lift, rough, peaks, colour, light, snow) in enumerate(layers):
        ridge = centre - lift * np.abs(line) ** 1.7 - rough * (ridged(7 + index * 2, 7) - .45)
        prominence = np.zeros(W)
        for px, ph, pw in peaks:
            cone = np.clip(1 - np.abs(line - px) / pw, 0, 1) ** 1.25
            ridge -= ph * cone * (.80 + .20 * ridged(18, 4)); prominence += cone * ph
        depth = yy - ridge[None, :] * H
        mask = smooth(-1.0, 1.0, depth)
        colour = np.array(colour, np.float32)
        below = np.clip(depth, 0, None)
        # Rock faces: two families of descending ridgelines make lit and shadowed facets.
        fall = below * .85
        ia = np.clip((columns + fall).astype(int), 0, W * 2 - 1); ib = np.clip((columns - fall + W).astype(int), 0, W * 2 - 1)
        facets = facet_a[ia] - facet_b[ib]
        lit_side = -np.tanh(line * 3.0)[None, :]               # light comes from the glow behind the valley
        lit = np.clip(.5 + 2.2 * facets * lit_side, 0, 1)
        relief = np.exp(-below / (H * .16))
        haze = 1 - np.exp(-below / (H * (.050 + .018 * index)))
        body = colour[None, None, :] * (.62 + .75 * (lit * relief)[..., None])
        body = body * (1 - .55 * haze[..., None]) + np.array([.022, .100, .140]) * (haze * max(0, .60 - .11 * index))[..., None]
        if snow:
            # Snow on the high faces: lit sides glint cyan-white, a little gold near the dusk.
            cap = smooth(.02, .16, prominence)[None, :] * np.exp(-below / (H * .050)) * smooth(.35, .85, lit) * snow
            grain = (fbm(W, 300, 3, RNG)[None, :] * .5 + .5)
            body += (cap * (.55 + .45 * grain))[..., None] * np.array([.36, .72, .86])
            dusk = np.exp(-((line + .46) / .26) ** 2) + .7 * np.exp(-((line - .52) / .24) ** 2)
            body += (cap * dusk[None, :] * .35)[..., None] * np.array([.90, .55, .18])
        img = img * (1 - mask[..., None]) + body * mask[..., None]
        if light:
            crest = np.exp(-below / (1.6 + index * .35)) * mask
            img += (crest * light * .16)[..., None] * np.array([.45, .88, 1.0])
        if index in (1, 2, 3):
            # Mist lying in the valleys between the ranges.
            band = centre + .035 + .020 * np.abs(line[None, :]) + .010 * fbm(W, 6 + index, 4, RNG)[None, :]
            mist = np.exp(-((v - band) / (.020 + .004 * index)) ** 2) * (.40 + .60 * (fbm(W, 8 + index, 5, RNG)[None, :] * .5 + .5))
            img += blur(mist, 10 + 4 * index)[..., None] * np.array([.044, .165, .215]) * (1.0 - .22 * index)

    # Quiet stage behind the figure, soft vignette, fine grain against banding.
    # Behind the figure the ranges dissolve into soft dark mist, so no ridge
    # line or horizon edge shows through the translucent, screen-blended body.
    column = np.exp(-(nx / .36) ** 6) * smooth(.26, .46, v)
    soft = np.stack([blur(img[..., c], 80) for c in range(3)], axis=2)
    img = img * (1 - column[..., None]) + soft * column[..., None]
    stage = 1 - .56 * np.exp(-(nx / .34) ** 4) * smooth(.26, .56, v) - .16 * np.exp(-((nx / .30) ** 2 + ((v - .30) / .30) ** 2))
    vignette = 1 - .45 * smooth(.55, 1.35, np.sqrt(nx ** 2 + ((v - .5) * 1.5) ** 2))
    img *= (stage * vignette)[..., None]
    img += RNG.normal(0, .0035, (H, W, 1)).astype(np.float32)
    img = np.clip(img, 0, 1) ** (1 / 1.9)

    image = Image.fromarray((img * 255 + .5).astype(np.uint8), "RGB")
    target = pathlib.Path(args.out)
    with tempfile.TemporaryDirectory() as tmp:
        png = pathlib.Path(tmp) / "out.png"; image.save(png)
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(png), "-c:v", "libwebp", "-quality", "92", str(target)], check=True)
    image.save(target.with_suffix(".preview.png"))
    print("N7_BACKDROP_V3_READY", target, image.size, hashlib.sha256(target.read_bytes()).hexdigest())


if __name__ == "__main__":
    main()
