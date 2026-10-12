#!/usr/bin/env python3
"""Acquire BSB Saulger page images without assuming scan/printed page offset."""
import json, pathlib, re, urllib.request
from urllib.parse import urlparse

MANIFEST = "https://api.digitale-sammlungen.de/iiif/presentation/v2/bsb10447069/manifest"
TARGETS = {305, 310, 314, 317}
OUT = pathlib.Path("saulger_acquisition")
OUT.mkdir(exist_ok=True)
HEADERS = {"User-Agent": "PiratecartographyResearch/1.0 (scholarly IIIF acquisition)"}

def get(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=45) as resp:
        return resp.read()

def text_label(value):
    if isinstance(value, str): return value
    if isinstance(value, list): return " ".join(map(text_label, value))
    if isinstance(value, dict): return " ".join(map(text_label, value.values()))
    return str(value)

def canvases_from(m):
    if "sequences" in m: return m["sequences"][0]["canvases"]
    return m.get("items", [])

def image_url(canvas):
    for image in canvas.get("images", []):
        resource = image.get("resource", {})
        services = resource.get("service", [])
        if isinstance(services, dict): services = [services]
        if services:
            service = services[0]
            base = service.get("@id") or service.get("id")
            if base: return base.rstrip("/") + "/full/1200,/0/default.jpg"
        if resource.get("@id"): return resource["@id"]
    for anno_page in canvas.get("items", []):
        for anno in anno_page.get("items", []):
            body = anno.get("body", {})
            services = body.get("service", [])
            if isinstance(services, dict): services = [services]
            if services:
                base = services[0].get("id") or services[0].get("@id")
                if base: return base.rstrip("/") + "/full/1200,/0/default.jpg"
            if body.get("id"): return body["id"]
    return None

report = {"manifest": MANIFEST, "target_printed_pages": sorted(TARGETS), "pages": [], "status": "NOT_INSPECTED"}
try:
    m = json.loads(get(MANIFEST))
    canvases = canvases_from(m)
    report["canvas_count"] = len(canvases)
    for idx, canvas in enumerate(canvases):
        label = text_label(canvas.get("label", ""))
        # BSB label format: "PRINTED_PAGE (SCAN_NUMBER)", e.g. "305 (0323)".
        # Parse only the leading token; the parenthetical number is the scan ordinal.
        leading = label.strip().split(maxsplit=1)[0] if label.strip() else ""
        leading = leading.split("(", 1)[0]
        printed_page = int(leading) if leading.isdigit() else None
        matched = [printed_page] if printed_page in TARGETS else []
        if matched:
            url = image_url(canvas)
            entry = {"canvas_index_0_based": idx, "canvas_id": canvas.get("@id") or canvas.get("id"), "label": label, "printed_pages": matched, "image_url": url}
            if url:
                data = get(url)
                dest = OUT / ("printed_" + "_".join(map(str, matched)) + ".jpg")
                dest.write_bytes(data)
                entry["saved_file"] = str(dest)
                entry["bytes"] = len(data)
            report["pages"].append(entry)
    if not report["pages"]:
        report["status"] = "MANIFEST_RETRIEVED_BUT_PRINTED_PAGE_LABELS_UNRESOLVED"
        # Save first few labels for pagination investigation; do not guess offset.
        report["sample_labels"] = [{"index": i, "label": text_label(c.get("label", ""))} for i, c in enumerate(canvases[:30])]
    elif len({p for e in report["pages"] if e.get("saved_file") for p in e["printed_pages"]}) == len(TARGETS):
        report["status"] = "ALL_TARGET_IMAGES_ACQUIRED_PENDING_VISUAL_PAGE_VERIFICATION"
    else:
        report["status"] = "PARTIAL_ACQUISITION_PENDING_VERIFICATION"
except Exception as exc:
    report["status"] = "ACQUISITION_ERROR"
    report["error"] = repr(exc)
finally:
    (OUT / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if report["status"] == "ACQUISITION_ERROR":
        raise SystemExit(1)
