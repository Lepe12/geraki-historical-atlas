#!/usr/bin/env python3
"""OCR a real unreferenced archival map image without inventing coordinates.

Produces image-pixel annotations for human inspection, not GeoJSON
geographic features. Intended for historic scans before manual georeferencing.
"""
import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
import subprocess
from urllib.parse import urlsplit

MAX_BYTES = 30 * 1024 * 1024

def run_raw_ocr(image, *, source_id, source_url, rights, title,
                source_year, language="eng", runner=subprocess.run):
    if not image.is_file() or image.stat().st_size > MAX_BYTES:
        raise ValueError("Raster file missing/too large")
    if urlsplit(source_url).scheme != "https" or not urlsplit(source_url).hostname:
        raise ValueError("Authenticated source provenance URL (HTTPS) required")
    if not all([source_id.strip(), rights.strip(), title.strip()]):
        raise ValueError("Source identifier, rights and title required")
    completed=runner(
        ["tesseract", str(image), "stdout", "-l", language,
         "--psm", "11", "tsv"],
        capture_output=True, text=True, timeout=240)
    if completed.returncode:
        raise RuntimeError("LOCAL_TESSERACT_OCR_FAILED: "+completed.stderr[:300])
    reader=csv.DictReader(io.StringIO(completed.stdout), delimiter="\t")
    required={"text","conf","left","top","width","height"}
    if reader.fieldnames is None or not required.issubset(reader.fieldnames):
        raise ValueError("OCR did not return expected TSV columns")
    labels=[]
    for row in reader:
        name=" ".join(str(row.get("text") or "").split()).strip()
        if len(name)<2 or len(name)>140:continue
        try:
            conf=float(row["conf"])
            left,top,w,h=(int(row[k]) for k in ("left","top","width","height"))
        except (TypeError,ValueError):
            continue
        if not 0<=conf<=100 or min(left,top)<0 or min(w,h)<1:continue
        labels.append({
            "id": "raw_label_"+hashlib.sha256(f"{source_id}:{len(labels)}:{name}:{left}:{top}".encode()).hexdigest()[:24],
            "text_raw":name,
            "pixel_bbox":[left,top,w,h],
            "ocr_confidence":round(conf/100,4),
            "reading_status":"UNREVIEWED",
            "historically_verified":False,
            "geolocation":None,
            "proposed_place_id":None
        })
        if len(labels)>=4000:break
    # Confidence filtering is a review TRIAGE, not lexical/historical proof.
    triage=[item for item in labels
        if item["ocr_confidence"]>=0.6 and len(item["text_raw"])>=4
        and sum(ch.isalpha() for ch in item["text_raw"])/len(item["text_raw"])>=0.7]
    return {
        "schema":"nabou-unlocated-historical-map-ocr-v1",
        "source":{"id":source_id,"url":source_url,"title":title,
                  "year":source_year,"rights":rights,
                  "image_sha256":hashlib.sha256(image.read_bytes()).hexdigest()},
        "ocr":{"engine":"tesseract","language":language,
               "mapkurator_model_used":False,"labels_found":len(labels),
               "higher_confidence_word_candidates":len(triage),
               "quality_status":"LOW_READABILITY_NEEDS_HUMAN_REVIEW" if len(triage)<max(5,len(labels)*0.05) else "UNASSESSED_REQUIRES_HUMAN_REVIEW",
               "triage_does_not_verify_toponyms":True},
        "labels":labels,
        "georeferencing_status":"NOT_GEOREFERENCED",
        "historically_verified":0,
        "review_status":"HUMAN_REVIEW_REQUIRED",
    }


def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--image",type=Path,required=True)
    p.add_argument("--out",type=Path,required=True)
    p.add_argument("--source-id",required=True)
    p.add_argument("--source-url",required=True)
    p.add_argument("--title",required=True)
    p.add_argument("--rights",required=True)
    p.add_argument("--year",required=True,type=int)
    p.add_argument("--language",default="eng")
    a=p.parse_args(argv)
    result=run_raw_ocr(a.image,source_id=a.source_id,source_url=a.source_url,
        title=a.title,rights=a.rights,source_year=a.year,language=a.language)
    a.out.parent.mkdir(parents=True,exist_ok=True)
    a.out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"status":"UNLOCATED_OCR_EXTRACTED_NOT_VERIFIED",
        "labels":len(result["labels"]), "historically_verified":0,
        "geo_coordinates":None, "file":str(a.out)}))

if __name__=="__main__":
    main()
