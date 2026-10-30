"""Build assets/assistant/cartographer-points.bin from the gold line portrait (see assets/assistant/README.md).
Usage: python3 tools/build-assistant-figure.py portrait.jpg assets/assistant/cartographer-points.bin   (needs numpy + Pillow)
Every bright pixel of the drawing can become one glowing point, so the gold lines of the portrait are kept as they are.
Depth is not in the drawing: it is a smooth relief made from the outline (a rounded body and a rounder head),
so the figure can turn a little in 3D. The head (above the ruff) gets a weight so it can turn and nod on its own."""
import sys
import numpy as np
from PIL import Image, ImageFilter
rng = np.random.default_rng(11)
im = Image.open(sys.argv[1]).convert("L")
W, H = im.size
L = np.asarray(im, np.float32) / 255
def blur(a, r):
    return np.asarray(Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r)), np.float32) / 255
mask = (blur(L, 8) > 0.05).astype(np.float32)
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
# head + cap: an ellipsoid around the face (three-quarter view, facing left)
hx, hy, rx, ry = 0.47 * W, 0.33 * H, 0.27 * W, 0.24 * H
e = 1 - ((xx - hx) / rx) ** 2 - ((yy - hy) / ry) ** 2
head = np.sqrt(np.clip(e, 0, 1))
depth = 0.55 * blur(mask, 90) + 0.25 * blur(mask, 30) + 0.45 * head * (yy < 0.62 * H) + 0.04 * L
# keep bright line pixels (probability rises with brightness)
p = np.clip((L - 0.05) / 0.35, 0, 1) ** 1.1
keep = rng.random(L.shape) < p * 0.95
ys, xs = np.nonzero(keep)
jx = xs + rng.random(len(xs)); jy = ys + rng.random(len(ys))
s = 2.0 / H
x = (jx - W / 2) * s; y = (H / 2 - jy) * s; z = depth[ys, xs] * 0.55 - 0.3
b = np.clip(L[ys, xs] * 1.15, 0, 1)
wgt = np.clip((0.62 * H - jy) / (0.14 * H), 0, 1)  # 1 = head, 0 = body; the ruff fades between
perm = rng.permutation(len(x))
pos = np.stack([x, y, z], 1)[perm]; b = b[perm]; wgt = wgt[perm]
n = len(pos)
out = (np.uint32(n).tobytes() + np.round(np.clip(pos, -1, 1) * 32767).astype("<i2").tobytes()
       + np.round(b * 255).astype("u1").tobytes() + np.round(wgt * 255).astype("u1").tobytes())
open(sys.argv[2], "wb").write(out)
print(n, len(out), pos.min(0), pos.max(0))
