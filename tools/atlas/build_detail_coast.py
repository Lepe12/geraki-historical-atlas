"""Detailed coastline for the zoomed-in chart (data/coast-detail.json).

Source: Natural Earth 1:10m land + minor islands (public domain), clipped to the Mediterranean, projected to the
2D chart's pixel space (same Mercator as nautical-chart.js: x=(lon-lon0)*k, y=(my1-M(lat))*k) and simplified.
Usage: python3 build_detail_coast.py ne_10m_land.geojson ne_10m_minor_islands.geojson out.json [tolerance_px]
"""
import json, math, sys
from shapely.geometry import shape, box, mapping
from shapely.ops import unary_union, transform

LON0, K, MY1 = -20, 30, 66.48233060009922
M = lambda la: math.degrees(math.log(math.tan(math.pi / 4 + math.radians(la) / 2)))
BBOX = box(-7.0, 29.0, 37.5, 46.9)

def load(p):
    gs = []
    for f in json.load(open(p))["features"]:
        g = shape(f["geometry"])
        if g.intersects(BBOX):
            gs.append(g.intersection(BBOX))
    return gs

def main():
    land, isl, out = sys.argv[1], sys.argv[2], sys.argv[3]
    tol = float(sys.argv[4]) if len(sys.argv) > 4 else 0.12
    geom = unary_union(load(land) + load(isl))
    proj = transform(lambda x, y, z=None: ((x - LON0) * K, (MY1 - M(y)) * K), geom)
    proj = proj.simplify(tol, preserve_topology=True)
    polys = [proj] if proj.geom_type == "Polygon" else list(proj.geoms)
    parts = []
    for p in polys:
        if p.area < 0.02:  # drop specks smaller than the chart can show
            continue
        for ring in [p.exterior, *p.interiors]:
            c = list(ring.coords)[:-1]
            if len(c) < 3:
                continue
            s = "M%.1f %.1f" % c[0] + "".join("l%.1f %.1f" % (b[0] - a[0], b[1] - a[1]) for a, b in zip(c, c[1:])) + "z"
            parts.append(s)
    d = "".join(parts).replace("l0.0 0.0", "")
    json.dump({"schema": "nabou-coast-detail/v1",
               "source": "Natural Earth 1:10m land and minor islands (public domain), naturalearthdata.com",
               "projection": {"lon0": LON0, "k": K, "my1": MY1}, "bbox": [-7.0, 29.0, 37.5, 46.9], "d": d},
              open(out, "w"), ensure_ascii=False, separators=(",", ":"))
    print(len(polys), "polygons,", len(d) // 1024, "KB path")

main()
