#!/usr/bin/env python3
"""Source-locked, independently checked candidate georeferencing for portolans.

This is *not* a proof that a 17th-century chart was geographically accurate.
Human-authored control points and separate hold-out points are mandatory.
No geographic data is exported on default runs, only an auditable report.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
from pathlib import Path

PROJECTION = "EPSG:32635"  # Aegean: metric local UTM grid; not claimed historical chart CRS
SCHEMA = "nabou-manual-map-review-v1"
OUTPUT_SCHEMA = "nabou-historical-georeference-candidate-v1"


def sha256_file(path):
    result = hashlib.sha256()
    with open(path, "rb") as reader:
        for block in iter(lambda: reader.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


def validate_review(review, image, *, control_ids, check_ids):
    try:
        from PIL import Image
    except ImportError as exc:
        raise RuntimeError("Pillow required for image validation") from exc
    if review.get("schema") != SCHEMA or review.get("historically_verified") != 0:
        raise ValueError("Only unverified manual map-review data is accepted")
    if review.get("map_georeferenced") is not False:
        raise ValueError("Manual source review must not assert completed georeferencing")
    documented_hash = str(review.get("image_sha256") or "").lower()
    source_hash = str((review.get("source") or {}).get("image_sha256") or "").lower()
    actual_hash = sha256_file(image)
    if documented_hash != actual_hash or source_hash != actual_hash:
        raise ValueError("SOURCE_IMAGE_SHA256_MISMATCH")
    with Image.open(image) as img:
        img.verify()
    with Image.open(image) as img:
        width, height = img.size
    if width < 10 or height < 10:
        raise ValueError("Input image too small for historical georeferencing")
    gcps = review.get("gcps")
    if not isinstance(gcps, list) or len(gcps) > 500:
        raise ValueError("Invalid number of review GCPs")
    by_id = {}
    for item in gcps:
        ident = item.get("id") if isinstance(item, dict) else None
        if not ident or ident in by_id:
            raise ValueError("Duplicate or missing GCP id")
        x, y = item.get("pixel_x"), item.get("pixel_y")
        lon, lat = item.get("longitude"), item.get("latitude")
        if not all(isinstance(v, (int, float)) and not isinstance(v, bool)
                   and math.isfinite(v) for v in (x, y, lon, lat)):
            raise ValueError("Non-finite or missing GCP coordinates")
        if not (0 <= x < width and 0 <= y < height and -180 <= lon <= 180 and -90 <= lat <= 90):
            raise ValueError("GCP is out of image or coordinate bounds")
        if (item.get("state") != "GCP_PROPOSED_NOT_VERIFIED"
            or not str(item.get("reviewer") or "").strip()
            or not str(item.get("placename") or "").strip()
            or not str(item.get("reference_url") or "").startswith("https://")):
            raise ValueError("Every GCP requires operator, named reference, HTTPS citation, and proposed status")
        by_id[ident] = item
    control = list(control_ids)
    check = list(check_ids)
    if len(control) < 4 or len(check) < 2 or len(set(control+check)) != len(control+check):
        raise ValueError("At least 4 independent control and 2 disjoint hold-out GCP IDs required")
    if set(control+check) - set(by_id):
        raise ValueError("GCP ID not found in manual review")
    return width, height, [by_id[x] for x in control], [by_id[x] for x in check], actual_hash


def fit_candidate(review, image, *, control_ids, check_ids, metric_crs=PROJECTION):
    """Fit affine on control points and evaluate untouched spatial hold-outs."""
    try:
        import numpy as np
        from pyproj import Transformer
        from affine import Affine
    except ImportError as exc:
        raise RuntimeError("numpy, pyproj and affine required") from exc
    width, height, control, check, actual = validate_review(
        review, image, control_ids=control_ids, check_ids=check_ids)
    transformer = Transformer.from_crs("EPSG:4326", metric_crs, always_xy=True)

    def matrix(items):
        x = np.array([[p["pixel_x"]/width, p["pixel_y"]/height, 1.0] for p in items])
        ys = np.array([transformer.transform(p["longitude"], p["latitude"]) for p in items])
        return x, ys

    train_x, train_y = matrix(control)
    hold_x, hold_y = matrix(check)
    if np.linalg.matrix_rank(train_x) < 3 or np.linalg.cond(train_x) > 100:
        raise ValueError("DEGENERATE_CONTROL_GEOMETRY: control points are collinear or badly clustered")
    beta, _, _, _ = np.linalg.lstsq(train_x, train_y, rcond=None)
    affine = Affine(beta[0,0]/width, beta[1,0]/height, beta[2,0],
                    beta[0,1]/width, beta[1,1]/height, beta[2,1])
    train_error = np.linalg.norm(train_x @ beta - train_y, axis=1)
    check_error = np.linalg.norm(hold_x @ beta - hold_y, axis=1)
    if not np.all(np.isfinite(check_error)):
        raise ValueError("Non-finite georeferencing residual")
    rmse = lambda a: float(np.sqrt(np.mean(np.square(a))))
    payload = {
        "schema": OUTPUT_SCHEMA,
        "source_id": review["source"].get("id"),
        "source_url": review["source"].get("url"),
        "image_sha256": actual, "image_width_px": width, "image_height_px": height,
        "algorithm": "AFFINE_LEAST_SQUARES_WGS84_TO_UTM35N",
        "metric_crs": metric_crs, "transform_gdal": list(affine.to_gdal()),
        "control_gcp_ids": list(control_ids),
        "holdout_gcp_ids": list(check_ids),
        "control_rmse_m": round(rmse(train_error), 2),
        "holdout_rmse_m": round(rmse(check_error), 2),
        "holdout_max_error_m": round(float(check_error.max()), 2),
        "holdout_error_by_gcp_m": {
            item["id"]: round(float(e), 2) for item, e in zip(check, check_error)},
        "georeference_status": "CANDIDATE_NOT_APPROVED",
        "historically_verified": False, "source_review_required": True,
        "is_cartographic_identity_proof": False,
        "limitations": [
            "Affinely fitted modern coordinates do not prove period-accurate nautical chart geometry",
            "Points may be misidentified; always inspect originals and independent sources",
            "Holdout points must have been selected independently, before checking residuals",
            "Do not feed unapproved georeferenced outputs into verified map/agent/learning memory",
        ]
    }
    return payload, affine


def export_candidate_raster(original_image, path, affine, report, *, max_holdout_m):
    """Opt-in unverified GeoTIFF; refuse large held-out residuals."""
    if report["holdout_max_error_m"] > max_holdout_m:
        raise ValueError("HOLDOOUT_ERROR_EXCEEDS_THRESHOLD: candidate GeoTIFF blocked")
    import rasterio
    from PIL import Image
    import numpy as np
    with Image.open(original_image) as im:
        channels = im.convert("RGB")
        arr = np.asarray(channels)
    path.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(path, "w", driver="GTiff", height=arr.shape[0], width=arr.shape[1],
                       count=3, dtype="uint8", crs=report["metric_crs"], transform=affine,
                       compress="deflate") as dataset:
        for i in range(3):
            dataset.write(arr[:,:,i], i+1)
        dataset.update_tags(
            NABOU_SOURCE_SHA256=report["image_sha256"],
            NABOU_VERIFICATION="CANDIDATE_NOT_APPROVED",
            NABOU_HOLDOUT_RMSE_METERS=str(report["holdout_rmse_m"]))
    return str(path)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--review", type=Path, required=True)
    p.add_argument("--image", type=Path, required=True)
    p.add_argument("--report", type=Path, required=True)
    p.add_argument("--controls", required=True, help="Comma-separated manually selected control IDs")
    p.add_argument("--holdouts", required=True, help="Comma-separated independent hold-out GCP IDs")
    p.add_argument("--candidate-geotiff", type=Path, help="Optional explicitly unapproved candidate raster")
    p.add_argument("--max-holdout-m", type=float, default=5000)
    args = p.parse_args()
    if not (math.isfinite(args.max_holdout_m) and 0 < args.max_holdout_m <= 100000):
        raise ValueError("Invalid hold-out threshold")
    review = json.loads(args.review.read_text(encoding="utf-8"))
    report, affine = fit_candidate(review, args.image,
        control_ids=args.controls.split(","), check_ids=args.holdouts.split(","))
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    if args.candidate_geotiff:
        export_candidate_raster(args.image, args.candidate_geotiff, affine, report,
                                max_holdout_m=args.max_holdout_m)
    print(json.dumps({"status":report["georeference_status"],"holdout_rmse_m":report["holdout_rmse_m"],
                      "historically_verified":False, "report":str(args.report),
                      "exported_candidate_geotiff":bool(args.candidate_geotiff)}))


if __name__ == "__main__":
    main()
