#!/usr/bin/env python3
"""Align the owner's approved mood images to the approved idle frame.

The supplied Listening/Thinking/Speaking images are 941x1672 (9:16) with the
figure drawn slightly taller than the 320x480 (2:3) idle. Each is scaled
uniformly, squashed vertically where measured necessary, shifted, and placed
on the idle's black frame. Nothing is redrawn. The fits were found by maximum
outline correlation with the idle (see docs/validation/n7-reference-pack).
"""
import argparse, hashlib, pathlib, subprocess, tempfile
from PIL import Image

HERE = pathlib.Path(__file__).resolve().parent
PACK = HERE.parents[1] / "docs/validation/n7-reference-pack"
W, H = 320, 480
# name: (supplied file, scale, vertical squash, dx units, dy units at 160x240)
FITS = {
    "listening": ("N7-listening-supplied.png", .98, .92, 0, -2),
    "thinking": ("N7-thinking-supplied.png", .98, 1.0, 0, -12),
    "speaking": ("N7-speaking-supplied.png", .96, .92, 0, -2),
}


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--out", required=True); args = ap.parse_args()
    out = pathlib.Path(args.out); out.mkdir(parents=True, exist_ok=True)
    for name, (src, s, sy, dx, dy) in FITS.items():
        u = Image.open(PACK / src).convert("RGB"); w, h = u.size
        nw, nh = round(W * s), round(W * s * sy * h / w)
        im = u.resize((nw, nh), Image.LANCZOS)
        frame = Image.new("RGB", (W, H)); frame.paste(im, (round((W - nw) / 2 + dx * 2), round(dy * 2)))
        target = out / f"n7-mood-{name}-v1.webp"
        with tempfile.TemporaryDirectory() as tmp:
            png = pathlib.Path(tmp) / "m.png"; frame.save(png)
            subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(png), "-c:v", "libwebp", "-lossless", "1", str(target)], check=True)
        print(name, target.name, hashlib.sha256(target.read_bytes()).hexdigest())


if __name__ == "__main__":
    main()
