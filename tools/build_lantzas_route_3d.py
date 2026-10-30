#!/usr/bin/env python3
"""Build the 3D-map route file for the Book III (1577) voyage of Petros Lantzas.

Input, read only:  data.json (repo root), the three route records below and their places.
                   jarvis-intelligence-chamber/assets/nautical/terrain/mediterranean-elevation.png
Output:            jarvis-intelligence-chamber/assets/nautical/routes/lantzas-1577-book3.json

Nothing is invented: the order of stops, the place coordinates, the year and the corridor waypoints are
copied from data.json. The waypoints in data.json are a cartographic corridor (data.json says so).
On the 3D terrain (ETOPO1 at the chart's resolution) some straight lines between those waypoints touch
land, so the drawn line keeps the data.json waypoints and, only where a straight piece would cross land,
follows the shortest open-water path on the same terrain grid. Those pieces are flagged "seaCorrected".
No page numbers are copied (the owner asked for none in the map UI).
"""
import heapq, json, math, os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CH = os.path.join(ROOT, "jarvis-intelligence-chamber")
LEGS = [  # data.json route id, drawn dashed + 'αβέβαιο' when the record is a reconstruction
    "atlas-lantzas-corfu-ragusa-1577",
    "recyVLMINuHGWSlyL",
    "atlas-book3-candia-porto-kagio-1577",
]
W, H, LON0, K, MY1 = 1800, 1105, -20, 30, 66.4823  # same Mercator window as the 2D chart

img = Image.open(os.path.join(CH, "assets/nautical/terrain/mediterranean-elevation.png")).convert("RGB")
GW, GH = img.size
PX = img.load()
LAND = [[(PX[i, j][0] / 255) ** 2 * 4000 for i in range(GW)] for j in range(GH)]
M = lambda lat: math.log(math.tan(math.pi / 4 + lat * math.pi / 360)) * 180 / math.pi
iM = lambda m: (2 * math.atan(math.exp(m * math.pi / 180)) - math.pi / 2) * 180 / math.pi


def to_f(lat, lon):  # fractional grid coordinate, as in map-3d-scene.js sample()
    x, y = (lon - LON0) * K, (MY1 - M(lat)) * K
    return max(0, min(GW - 1.001, x / W * GW - 0.5)), max(0, min(GH - 1.001, y / H * GH - 0.5))


def from_f(fx, fy):
    x, y = (fx + 0.5) / GW * W, (fy + 0.5) / GH * H
    return round(iM(MY1 - y / K), 4), round(x / K + LON0, 4)


def land(lat, lon):  # bilinear, identical to the browser's groundAt sampling
    fx, fy = to_f(lat, lon)
    x0, y0 = int(fx), int(fy)
    tx, ty = fx - x0, fy - y0
    L = LAND
    return (L[y0][x0] * (1 - tx) + L[y0][x0 + 1] * tx) * (1 - ty) + (L[y0 + 1][x0] * (1 - tx) + L[y0 + 1][x0 + 1] * tx) * ty


def wet(lat, lon):
    return land(lat, lon) <= 1  # groundAt < 0 in the browser


def clear(a, b, step=0.01):
    n = max(2, int(math.hypot(a[0] - b[0], a[1] - b[1]) / step))
    return all(wet(a[0] + (b[0] - a[0]) * t / n, a[1] + (b[1] - a[1]) * t / n) for t in range(n + 1))


def cell_wet(i, j):  # the grid node is sea
    return 0 <= i < GW - 1 and 0 <= j < GH - 1 and LAND[j][i] <= 1


def nearest_sea(lat, lon):
    fx, fy = to_f(lat, lon)
    i0, j0 = round(fx), round(fy)
    for r in range(0, 40):
        best = None
        for i in range(i0 - r, i0 + r + 1):
            for j in range(j0 - r, j0 + r + 1):
                if max(abs(i - i0), abs(j - j0)) == r and cell_wet(i, j):
                    d = (i - fx) ** 2 + (j - fy) ** 2
                    if best is None or d < best[0]:
                        best = (d, i, j)
        if best:
            return from_f(best[1], best[2])
    raise SystemExit(f"no sea near {lat},{lon}")


def astar(a, b):
    fa, fb = to_f(*a), to_f(*b)
    s, g = (round(fa[0]), round(fa[1])), (round(fb[0]), round(fb[1]))
    openq, came, cost = [(0, s)], {s: None}, {s: 0}
    while openq:
        _, c = heapq.heappop(openq)
        if c == g:
            break
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                n = (c[0] + di, c[1] + dj)
                if (di or dj) and cell_wet(*n) and clear(from_f(*c), from_f(*n)):
                    nc = cost[c] + math.hypot(di, dj)
                    if nc < cost.get(n, 1e18):
                        cost[n], came[n] = nc, c
                        heapq.heappush(openq, (nc + math.hypot(n[0] - g[0], n[1] - g[1]), n))
    if g not in came:
        raise SystemExit(f"no sea path {a} -> {b}")
    path, c = [], g
    while c:
        path.append(from_f(*c))
        c = came[c]
    path.reverse()
    # keep only the turning points that are needed to stay on water
    out, k = [a], 0
    while k < len(path) - 1:
        far = len(path) - 1
        while far > k + 1 and not clear(out[-1], path[far]):
            far -= 1
        out.append(path[far])
        k = far
    if not clear(out[-1], b):
        out.append(b)
    out[-1] = b
    return out


data = json.load(open(os.path.join(ROOT, "data.json"), encoding="utf-8"))
routes = {r["id"]: r for r in data["routes"]}
places = {p["id"]: p for p in data["places"]}
legs, stops = [], []
for rid in LEGS:
    r = routes[rid]
    raw = [r["displayStart"]] + r["waypoints"] + [r["displayEnd"]]
    # ports lie on the coast: the sailed line starts / ends at the nearest open water
    # an inner waypoint that falls on land at this terrain resolution is skipped (not moved)
    pts = [nearest_sea(*raw[0]) if not wet(*raw[0]) else raw[0]] + [p for p in raw[1:-1] if wet(*p)] \
        + [nearest_sea(*raw[-1]) if not wet(*raw[-1]) else raw[-1]]
    skipped = len(raw) - len(pts)
    line, corrected = [pts[0]], 0
    for a, b in zip(pts, pts[1:]):
        if clear(a, b):
            line.append(b)
        else:
            corrected += 1
            line.extend(astar(a, b)[1:])
    assert all(clear(a, b) for a, b in zip(line, line[1:])), rid
    frm, to = places[r["from"][0]["id"]], places[r["to"][0]["id"]]
    legs.append({
        "dataJsonRouteId": rid, "name": r["name"], "period": r["period"], "books": r["books"],
        "type": r["type"], "status": r["status"],
        "uncertain": r["type"] == "STRONG RECONSTRUCTION" or r["status"] != "VERIFIED",
        "from": frm["id"], "to": to["id"], "dataJsonWaypoints": raw,
        "seaCorrectedSegments": corrected, "landWaypointsSkipped": skipped, "line": [[round(x, 4), round(y, 4)] for x, y in line],
    })
for rid in LEGS:  # stops in voyage order; Candia's harbour (Mandraki) and the city are one stop
    r = routes[rid]
    for end in ("from", "to"):
        p = places[r[end][0]["id"]]
        if p["place"] == "Mandraki of Candia" or any(s["dataJsonPlaceId"] == p["id"] for s in stops):
            continue
        stops.append({"dataJsonPlaceId": p["id"], "place": p["place"], "historicalNames": p["historicalNames"],
                      "atlasLabel": p.get("atlasLabel", ""), "lat": p["lat"], "lon": p["lon"],
                      "coordinateStatus": p["coordinateStatus"], "year": r["period"]})
out = {"title": "Πέτρος Λάντζας, 1577 — διαδρομή από το βιβλίο (Βιβλίο Γ' της τριλογίας)",
       "basis": "Book III of the GERAKI trilogy (narrative), as recorded in data.json; not archival history.",
       "generatedFrom": "data.json routes " + ", ".join(LEGS), "stops": stops, "legs": legs}
dst = os.path.join(CH, "assets/nautical/routes/lantzas-1577-book3.json")
json.dump(out, open(dst, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
for l in legs:
    print(l["dataJsonRouteId"], "points", len(l["line"]), "sea-corrected segments", l["seaCorrectedSegments"], "skipped", l["landWaypointsSkipped"], "uncertain", l["uncertain"])
for s in stops:
    print(s["place"], s["lat"], s["lon"], s["coordinateStatus"], s["year"])
