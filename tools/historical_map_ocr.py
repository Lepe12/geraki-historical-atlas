#!/usr/bin/env python3
"""Run a real, optional local OCR engine on an already-georeferenced map.

Tesseract OCR labels are machine guesses, not historical reading approvals.
Only GeoTIFF with a genuine CRS/transform can produce earth coordinates.
This is a practical CPU fallback for mapKurator, NOT its model/weights.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import math
from pathlib import Path
import subprocess
import sys

try:
    from tools.historical_map_intelligence import convert_labels
except ModuleNotFoundError:
    from historical_map_intelligence import convert_labels

MAX_SOURCE_BYTES = 150 * 1024 * 1024
MAX_LABELS = 2500


def raster_sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as stream:
        while chunk := stream.read(1024 * 1024):
            h.update(chunk)
    return h.hexdigest()


def ocr_rows_to_map_geojson(tsv, *, pixel_to_world, min_confidence=0.35):
    """Create WGS84 text-footprint polygons from Tesseract TSV.
    pixel_to_world(x,y) must be a *real* map-to-geographic transform.
    """
    if not callable(pixel_to_world):
        raise ValueError("Georeferencing is required, not optional")
    if not 0 <= min_confidence <= 1:
        raise ValueError("confidence threshold must be between 0 and 1")
    features, rejected = [], 0
    reader = csv.DictReader(io.StringIO(tsv), delimiter="\t")
    required = {"text", "left", "top", "width", "height", "conf"}
    if reader.fieldnames is None or not required.issubset(reader.fieldnames):
        raise ValueError("Unsupported OCR TSV format")
    for row in reader:
        label = " ".join(str(row.get("text", "")).split()).strip()
        if not label or len(label) > 120 or len(label) < 2:
            rejected += 1
            continue
        try:
            confidence = float(row["conf"]) / 100
            left, top = int(row["left"]), int(row["top"])
            width, height = int(row["width"]), int(row["height"])
        except (TypeError, ValueError):
            rejected += 1
            continue
        if not math.isfinite(confidence) or confidence < min_confidence or confidence > 1:
            rejected += 1
            continue
        if left < 0 or top < 0 or width < 1 or height < 1:
            rejected += 1
            continue
        corners = [
            [left, top], [left + width, top],
            [left + width, top + height], [left, top + height], [left, top]
        ]
        polygon = []
        for x, y in corners:
            lon, lat = pixel_to_world(x, y)
            if not all(math.isfinite(v) for v in (lon, lat)):
                raise ValueError("Georeferencing produced non-finite geographic coordinate")
            polygon.append([round(lon, 8), round(lat, 8)])
        features.append({
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": [polygon]},
            "properties": {"text": label, "score": round(confidence, 4),
                           "pixel_bbox": [left, top, width, height],
                           "ocr_engine": "tesseract", "identity_status": "UNREVIEWED"}
        })
        if len(features) >= MAX_LABELS:
            break
    return {"type": "FeatureCollection", "features": features}, rejected


def read_geotiff_and_ocr(path, *, languages, psm=11, min_confidence=0.35, ocr_runner=subprocess.run):
    try:
        import rasterio
        from pyproj import Transformer
    except ImportError as error:
        raise RuntimeError("Install local 'rasterio' and 'pyproj' first") from error
    with rasterio.open(path) as dataset:
        if dataset.crs is None:
            raise ValueError("Georeferenced GeoTIFF CRS is missing; no map coordinates will be guessed")
        if dataset.transform.is_identity:
            raise ValueError("GeoTIFF has identity transform; pixel coordinates are not geographic")
        if dataset.width < 1 or dataset.height < 1:
            raise ValueError("Empty raster")
        transformer = Transformer.from_crs(dataset.crs, "EPSG:4326", always_xy=True)
        transform = dataset.transform

        def geolocate(px, py):
            x, y = transform * (px, py)
            return transformer.transform(x, y)

        command = ["tesseract", str(path), "stdout", "-l", languages,
                   "--psm", str(psm), "tsv"]
        completed = ocr_runner(command, capture_output=True, text=True, timeout=180)
        if completed.returncode != 0:
            raise RuntimeError("OCR_FAILED: " + str(completed.stderr)[:300])
        ocr, rejected = ocr_rows_to_map_geojson(
            completed.stdout, pixel_to_world=geolocate,
            min_confidence=min_confidence)
        return ocr, {"raster_width": dataset.width, "raster_height": dataset.height,
                     "raster_crs": str(dataset.crs), "ocr_language": languages,
                     "ocr_engine": "tesseract", "ocr_page_segmentation_mode": psm,
                     "rejected_words": rejected}


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--geotiff", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--map-source", required=True)
    p.add_argument("--source-url", required=True)
    p.add_argument("--rights", required=True)
    p.add_argument("--title", required=True)
    p.add_argument("--languages", default="eng")
    p.add_argument("--min-confidence", type=float, default=0.35)
    p.add_argument("--start-year", type=int)
    p.add_argument("--end-year", type=int)
    a = p.parse_args(argv)
    if not a.geotiff.is_file() or a.geotiff.stat().st_size > MAX_SOURCE_BYTES:
        raise SystemExit("INPUT_REQUIRED: GeoTIFF missing or exceeds 150 MB limit")
    if a.output.resolve() == a.geotiff.resolve():
        raise SystemExit("Output must not replace the original GeoTIFF")
    ocr, stats = read_geotiff_and_ocr(
        a.geotiff, languages=a.languages, min_confidence=a.min_confidence)
    result = convert_labels(
        ocr, source_id=a.map_source, source_url=a.source_url,
        rights=a.rights, map_title=a.title, crs="EPSG:4326",
        start_year=a.start_year, end_year=a.end_year)
    result["metadata"].update({
        **stats, "original_geotiff_sha256": raster_sha256(a.geotiff),
        "ocr_model_label": "TESSERACT_CPU_FALLBACK_NOT_MAPKURATOR",
        "map_georeferencing_quality": "NOT_EXTERNALLY_VALIDATED",
        "image_labels_human_reviewed": False,
        "geographic_place_identities_human_reviewed": False,
    })
    a.output.parent.mkdir(parents=True, exist_ok=True)
    a.output.write_text(json.dumps(result, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    print(json.dumps({"status": "OCR_LABELS_EXTRACTED_NOT_VERIFIED",
        "features": len(result["features"]), "output": str(a.output),
        "ocr_engine": "tesseract", "historically_verified": 0}))


if __name__ == "__main__":
    main()
