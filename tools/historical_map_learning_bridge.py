#!/usr/bin/env python3
"""Stage manually reviewed historical map OCR separately from PDF verified knowledge.

Corrected image labels are NOT proof of place identities or historical events.
Default mode exports only; writing to memory requires --save-staging.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
from urllib.parse import urlsplit

try:
    from tools.historical_map_georeference import sha256_file
except ModuleNotFoundError:
    from historical_map_georeference import sha256_file

SCHEMA = "nabou-manual-map-review-v1"

def build_candidates(review, image):
    from PIL import Image
    if review.get("schema") != SCHEMA or review.get("historically_verified") != 0:
        raise ValueError("Only unverified human map review is accepted")
    if review.get("map_georeferenced") is not False:
        raise ValueError("Georeferencing must not be asserted by OCR review")
    image_hash = sha256_file(image)
    if image_hash != review.get("image_sha256") or image_hash != (review.get("source") or {}).get("image_sha256"):
        raise ValueError("SOURCE_IMAGE_SHA256_MISMATCH")
    source = review["source"]
    url = urlsplit(str(source.get("url") or ""))
    if url.scheme != "https" or not url.hostname or not source.get("id"):
        raise ValueError("Invalid map source provenance")
    with Image.open(image) as original:
        width, height = original.size
    candidates = []
    ids = set()
    for reading in review.get("labels", []):
        if not isinstance(reading, dict) or not reading.get("label_id"):
            raise ValueError("Invalid OCR reading record")
        if reading["label_id"] in ids:
            raise ValueError("Duplicate OCR reading ID")
        ids.add(reading["label_id"])
        if reading.get("historically_verified") is not False or reading.get("geolocation") is not None:
            raise ValueError("Reading must not contain verified geography or historical claims")
        decision = reading.get("decision")
        if decision not in ("UNREVIEWED", "READING_ACCEPTED", "READING_REJECTED"):
            raise ValueError("Unknown decision")
        if decision != "READING_ACCEPTED":
            continue
        text = str(reading.get("final_reading") or "").strip()
        reviewer = str(reading.get("reviewer") or "").strip()
        bbox = reading.get("pixel_bbox")
        if (not text or len(text) > 150 or not reviewer or not reading.get("reviewed_at")
            or not isinstance(bbox, list) or len(bbox) != 4
            or any(not isinstance(v, (int,float)) or isinstance(v,bool) for v in bbox)
            or bbox[0] < 0 or bbox[1] < 0 or bbox[2] <= 0 or bbox[3] <= 0
            or bbox[0]+bbox[2] > width or bbox[1]+bbox[3] > height):
            raise ValueError("Accepted OCR text needs reviewer, timestamp and bounded source pixels")
        candidates.append({
            "reading_id": reading["label_id"], "reading": text,
            "original_ocr_guess": reading.get("ocr_text"),
            "locator": {"type": "IMAGE_PIXEL_RECTANGLE", "bbox": bbox},
            "reviewer": reviewer, "read_at": reading["reviewed_at"],
            "source_image_sha256": image_hash, "source_url": source["url"],
            "reading_reviewed": True, "historical_place_identity_status": "UNRESOLVED",
            "historical_fact_verified": False, "may_be_a_non_toponym": True,
        })
    return {
        "schema": "nabou-map-learning-staging-v1",
        "source": {"id": source["id"], "url": source["url"],
                   "image_sha256": image_hash, "title": source.get("title")},
        "medium": "HISTORICAL_MAP_IMAGE_NOT_PDF",
        "human_corrected_readings": candidates,
        "geo_identifications_approved": 0, "historically_verified": 0,
        "eligible_for_automatic_claim_promotion": False
    }


def write_staging(mem, record):
    """Separate staging area; never change document or entity knowledge."""
    if record.get("schema") != "nabou-map-learning-staging-v1" or record.get("historically_verified") != 0:
        raise ValueError("Invalid unverified map-learning candidates")
    mem.setdefault("map_review_staging", {})[record["source"]["id"]] = record
    return mem


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--review", type=Path, required=True)
    p.add_argument("--image", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--memory", type=Path, default=Path("data/naboux_memory.json"))
    p.add_argument("--save-staging", action="store_true",
                   help="Explicit operator action; never promotes historical claims")
    args = p.parse_args()
    reviewed = json.loads(args.review.read_text(encoding="utf-8"))
    result = build_candidates(reviewed,args.image)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    if args.save_staging:
        import sys
        sys.path.insert(0,str(Path(__file__).resolve().parent/"memory"))
        from naboux_memory import load, save
        memory = load(args.memory)
        write_staging(memory,result)
        save(memory,args.memory)
    print(json.dumps({"status": "UNVERIFIED_MAP_READING_STAGED" if args.save_staging else "DRY_RUN_EXPORTED_ONLY",
                     "readings": len(result["human_corrected_readings"]),
                     "historically_verified":0, "pdf_memory_modified":False,
                     "memory_updated":bool(args.save_staging)}))


if __name__ == "__main__":
    main()
