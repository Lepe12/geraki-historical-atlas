#!/usr/bin/env python3
"""Build jarvis-intelligence-chamber/data/pirate-bases.json from M. Gourgourini's published ArcGIS Online
web map «Πειρατικά & κουρσάρικα ορμητήρια του 16ου & 17ου αιώνα στην Ανατολική Μεσόγειο»
(item 21d9b503d23446c8bca4cf2e058e94a8, uniwageo.maps.arcgis.com), the data of her diploma thesis
(Univ. of West Attica, 2024, ch. 3). One record per (area, port); the four layers become per-century
entries. Coordinates are the thesis map's own points (the thesis calls them approximate positions read
from the sources), averaged when the layers draw the same place a few hundred metres apart for legibility.
Nothing is geocoded or added. Usage: build_pirate_bases.py [--from-file layers.json]"""
import json, math, sys, urllib.parse, urllib.request, datetime, pathlib
ITEM = "21d9b503d23446c8bca4cf2e058e94a8"
PORTAL = "https://uniwageo.maps.arcgis.com"
OUT = pathlib.Path(__file__).resolve().parents[2] / "jarvis-intelligence-chamber/data/pirate-bases.json"
LAYERS = {"Χριστιανικά Ορμητήρια 16ου Αιώνα": ("16", "christian"), "Μουσουλμανικά Ορμητήρια 16ου Αιώνα": ("16", "muslim"),
          "Χριστιανικά Ορμητήρια 17ου Αιώνα": ("17", "christian"), "Μουσουλμανικά Ορμητήρια 17ου Αιώνα": ("17", "muslim")}
# Spelling variants of the same port between layers (same place, < 1 km apart in the map).
SAME = {"Κάβο Μαλέα": "Κάβο Μαλέας", "Κάβο Σκύλο": "Κάβο Σκύλου", "Σχίζας": "Σχίζα"}

def fetch():
    webmap = json.load(urllib.request.urlopen(f"{PORTAL}/sharing/rest/content/items/{ITEM}/data?f=json", timeout=30))
    out = {}
    for layer in webmap["operationalLayers"]:
        base, rest = layer["url"].split("/services/", 1)
        url = base + "/services/" + urllib.parse.quote(rest) + "/query?" + urllib.parse.urlencode(
            {"where": "1=1", "outFields": "*", "outSR": 4326, "f": "geojson"})
        out[layer["title"]] = json.load(urllib.request.urlopen(url, timeout=30))
    return out

def clean(s):
    return " ".join(str(s or "").split())

def build(layers):
    bases = {}
    for title, fc in layers.items():
        century, faith = LAYERS[title]
        for f in fc["features"]:
            p, (lon, lat) = f["properties"], f["geometry"]["coordinates"]
            area, port = clean(p.get("AREA_NAME")), clean(p.get("PORT_NAME"))
            port = SAME.get(port, port)
            key = (area, port)
            b = bases.setdefault(key, {"area": area, "port": port, "points": [], "centuries": {}})
            b["points"].append((lon, lat))
            b["centuries"].setdefault(century, []).append({
                "faith": faith, "pirates": clean(p.get("PIRATE_TYPE") or p.get("TYPE_OF_PIRATES")) or None,
                "siteType": clean(p.get("AREA_TYPE")) or None, "details": clean(p.get("DETAILS")) or None,
                "link": clean(p.get("Links")) or None, "objectId": p.get("OBJECTID")})
    records = []
    for i, b in enumerate(sorted(bases.values(), key=lambda x: (x["area"], x["port"])), 1):
        lon = sum(x for x, _ in b["points"]) / len(b["points"]); lat = sum(y for _, y in b["points"]) / len(b["points"])
        spread = max(math.hypot((x - lon) * 111 * math.cos(math.radians(lat)), (y - lat) * 111) for x, y in b["points"])
        records.append({"id": f"pb{i:03d}", "area": b["area"], "port": b["port"], "lat": round(lat, 5), "lon": round(lon, 5),
                        "coordinateStatus": "APPROXIMATE", "mapSpreadKm": round(spread, 2),
                        "centuries": {c: v for c, v in sorted(b["centuries"].items())}})
    return {"title": "Πειρατικά & κουρσάρικα ορμητήρια του 16ου & 17ου αιώνα στην Ανατολική Μεσόγειο",
            "author": "Μαρία Γουργουρίνη",
            "source": {"thesis": "Γουργουρίνη Μ., «Ανάλυση & Χαρτογραφική Απεικόνιση του Φαινομένου της Πειρατείας στην Ανατολική Μεσόγειο κατά τον 16ο & 17ο αιώνα», Διπλωματική εργασία, Τμήμα Μηχανικών Τοπογραφίας και Γεωπληροφορικής, ΠΑ.Δ.Α., Ιούλιος 2024, κεφ. 3",
                       "repository": "https://polynoe.lib.uniwa.gr/xmlui/handle/11400/7193",
                       "map": f"{PORTAL}/home/item.html?id={ITEM}", "site": "https://www.piratecartography.com/"},
            "coordinateNote": "Θέσεις του χάρτη της διατριβής· η διατριβή τις ορίζει ως προσεγγιστικές θέσεις από τα κείμενα των πηγών.",
            "symbology": "Κόκκινη σημαία: χριστιανικό ορμητήριο · πράσινη: μουσουλμανικό · γκρι κοντάρι: 16ος αι. · μαύρο: 17ος αι. (διατριβή, κεφ. 3–4)",
            "generatedAt": datetime.date.today().isoformat(), "count": len(records), "bases": records}

if __name__ == "__main__":
    layers = json.load(open(sys.argv[2])) if len(sys.argv) > 2 and sys.argv[1] == "--from-file" else fetch()
    data = build(layers)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(OUT, data["count"], "bases")
