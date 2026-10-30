#!/usr/bin/env python3
"""Build the small terrain heightmap used only by the optional 3D view of the main map (map-3d-scene.js).

Source: NOAA NCEI ETOPO1 Global Relief Model (1 arc-minute), bedrock/ice surface, public domain
(U.S. Government work). Doi: 10.7289/V5C8276M. Fetched as a CSV subset from NOAA's ERDDAP server
(dataset `etopo180`, every 2nd sample = 2 arc-minutes), for example:

  curl -o etopo.csv "https://coastwatch.pfeg.noaa.gov/erddap/griddap/etopo180.csv?altitude[(28.0):2:(55.6)][(-20.4):2:(40.4)]"
  python3 tools/build_elevation.py etopo.csv assets/nautical/terrain/mediterranean-elevation.png

The grid is resampled (bilinear) onto the same Mercator window as the 2D chart (nautical-chart.js:
W=1800, H=1105, lon0=-20, k=30, my1) at half resolution (900 x 553 cells, one cell = 2 chart px).
Encoding (8-bit RGB PNG):  R = sqrt(land height / 4000 m) * 255   (0 at sea level and below)
                           G = sqrt(sea depth   / 6000 m) * 255   (0 on land)
Requires numpy and Pillow. Offline once the CSV is downloaded.
"""
import math
import sys

import numpy as np
from PIL import Image

W, H, K, LON0, MY1 = 1800, 1105, 30.0, -20.0, 66.48233060009922
GW, GH = 900, 553


def main(src, out):
    d = np.loadtxt(src, delimiter=",", skiprows=2)
    lats, lons = np.unique(d[:, 0]), np.unique(d[:, 1])
    z = d[:, 2].reshape(len(lats), len(lons))  # ERDDAP CSV: latitude outer (ascending), longitude inner
    xs = (np.arange(GW) + 0.5) * W / GW
    ys = (np.arange(GH) + 0.5) * H / GH
    lon = LON0 + xs / K
    lat = np.degrees(2 * np.arctan(np.exp(np.radians(MY1 - ys / K))) - math.pi / 2)
    fi = np.interp(lat, lats, np.arange(len(lats)))
    fj = np.interp(lon, lons, np.arange(len(lons)))
    i0 = np.floor(fi).astype(int).clip(0, len(lats) - 2)
    j0 = np.floor(fj).astype(int).clip(0, len(lons) - 2)
    ti, tj = (fi - i0)[:, None], (fj - j0)[None, :]
    g = (z[i0][:, j0] * (1 - ti) * (1 - tj) + z[i0][:, j0 + 1] * (1 - ti) * tj
         + z[i0 + 1][:, j0] * ti * (1 - tj) + z[i0 + 1][:, j0 + 1] * ti * tj)
    img = np.zeros((GH, GW, 3), np.uint8)
    img[..., 0] = np.round(np.sqrt(np.clip(g, 0, 4000) / 4000) * 255)
    img[..., 1] = np.round(np.sqrt(np.clip(-g, 0, 6000) / 6000) * 255)
    Image.fromarray(img, "RGB").save(out, optimize=True)
    print(f"{out}: {GW}x{GH}, min {g.min():.0f} m, max {g.max():.0f} m")


if __name__ == "__main__":
    main(*sys.argv[1:3])
