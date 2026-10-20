#!/usr/bin/env python3
"""Experimental 90/270-degree OCR of real historical map scans.

Crop boxes are transformed back into the ORIGINAL scan's pixel coordinates.
Multiple Tesseract readings are REVIEW CANDIDATES, not additional places.
This does not install or pretend to run the university mapKurator model.
"""
from __future__ import annotations
import argparse
import hashlib
import io
import json
import math
from pathlib import Path
import subprocess
import tempfile
import csv

try:
    from tools.historical_map_georeference import sha256_file
except ModuleNotFoundError:
    from historical_map_georeference import sha256_file


def rotated_to_original(bbox, angle, *, width, height):
    """OCR rotated-scan pixel rectangle to source-scan pixel rectangle."""
    x, y, w, h = bbox
    if angle == 90:  # PIL ROTATE_90: CCW
        return [width - (y+h), x, h, w]
    if angle == 270:  # PIL ROTATE_270: CW
        return [y, height-(x+w), h, w]
    if angle == 180:
        return [width-(x+w), height-(y+h), w, h]
    if angle == 0:
        return [x,y,w,h]
    raise ValueError("Only orthogonal rotations are supported")


def parse_ocr(tsv, *, angle, width, height, minimum_confidence):
    tsv_reader=csv.DictReader(io.StringIO(tsv),delimiter="\t")
    needed={"text","left","top","width","height","conf"}
    if not tsv_reader.fieldnames or not needed.issubset(tsv_reader.fieldnames):
        raise ValueError("Malformed OCR TSV")
    result=[]
    for row in tsv_reader:
        name=" ".join(str(row.get("text") or "").split()).strip()
        if len(name)<3 or len(name)>140 or sum(c.isalpha() for c in name)/len(name)<.6:
            continue
        try:
            confidence=float(row["conf"])/100
            bbox=[int(row[k]) for k in ("left","top","width","height")]
        except (TypeError,ValueError):
            continue
        if not math.isfinite(confidence) or confidence<minimum_confidence or confidence>1:
            continue
        if min(bbox)<0 or bbox[2]<=0 or bbox[3]<=0:
            continue
        rect=rotated_to_original(bbox,angle,width=width,height=height)
        if (rect[0]<0 or rect[1]<0 or rect[0]+rect[2]>width or rect[1]+rect[3]>height):
            continue
        result.append({"text_raw":name,"pixel_bbox":rect,
                       "ocr_confidence":round(confidence,4),
                       "orientation_deg":angle})
    return result


def intersection_over_union(a,b):
    x=max(a[0],b[0]);y=max(a[1],b[1])
    area=max(0,min(a[0]+a[2],b[0]+b[2])-x)*max(0,min(a[1]+a[3],b[1]+b[3])-y)
    union=a[2]*a[3]+b[2]*b[3]-area
    return area/union if union else 0


def merge_candidates(all_candidates, *, source_id, limit=3500):
    merged=[]
    # Highest confidence read of an image region wins only when regions overlap;
    # duplicates are not counted as independent source attestations.
    for item in sorted(all_candidates,key=lambda x:-x["ocr_confidence"]):
        if any(intersection_over_union(item["pixel_bbox"],old["pixel_bbox"])>.65
               for old in merged):
            continue
        new=dict(item)
        payload=json.dumps([source_id,new["pixel_bbox"],new["text_raw"],new["orientation_deg"]])
        new.update({
            "id":"raw_label_"+hashlib.sha256(payload.encode()).hexdigest()[:24],
            "reading_status":"UNREVIEWED","historically_verified":False,
            "geolocation":None,"proposed_place_id":None,
        })
        merged.append(new)
        if len(merged)>=limit:break
    return sorted(merged,key=lambda x:(x["pixel_bbox"][1],x["pixel_bbox"][0]))


def run_multiorientation(image, *, source_id, source_url, rights, title,
                         source_year, language="fra", angles=(0,90,270),
                         minimum_confidence=.45, runner=subprocess.run):
    from PIL import Image
    if not image.is_file() or image.stat().st_size>30*1024*1024:
        raise ValueError("Source image missing or exceeds 30MB")
    if not all(str(x or "").strip() for x in (source_id,source_url,rights,title)):
        raise ValueError("Explicit source provenance required")
    if not str(source_url).startswith("https://"):
        raise ValueError("HTTPS source URL required")
    if not 0<=minimum_confidence<=1:
        raise ValueError("Invalid OCR cutoff")
    angles=tuple(dict.fromkeys(angles))
    if not angles or any(x not in (0,90,180,270) for x in angles):
        raise ValueError("Only orthogonal scan orientations permitted")
    with Image.open(image) as original:
        width,height=original.size
        if width*height>75_000_000:
            raise ValueError("Image pixel budget exceeded")
        collected=[];counts={}
        with tempfile.TemporaryDirectory() as temp:
            for angle in angles:
                if angle==0:
                    current=image
                else:
                    rotated=original.transpose({90:Image.Transpose.ROTATE_90,
                        180:Image.Transpose.ROTATE_180,
                        270:Image.Transpose.ROTATE_270}[angle])
                    current=Path(temp)/f"ocr_rotated_{angle}.png"
                    rotated.save(current)
                completed=runner(["tesseract",str(current),"stdout","-l",language,
                                  "--psm","11","tsv"], capture_output=True,
                                 text=True,timeout=210)
                if completed.returncode:
                    raise RuntimeError("OCR rotation "+str(angle)+": "+str(completed.stderr)[:250])
                candidate=parse_ocr(completed.stdout,angle=angle,
                                    width=width,height=height,
                                    minimum_confidence=minimum_confidence)
                counts[str(angle)]=len(candidate)
                collected.extend(candidate)
    merged=merge_candidates(collected,source_id=source_id)
    return {
        "schema":"nabou-unlocated-historical-map-ocr-v1",
        "source":{"id":source_id,"url":source_url,"title":title,
                  "year":source_year,"rights":rights,
                  "image_sha256":sha256_file(image)},
        "ocr":{"engine":"tesseract_orthogonal_multiangle",
               "language":language,"mapkurator_model_used":False,
               "angles_tested_degrees":angles,"raw_candidates_per_angle":counts,
               "post_overlap_review_candidates":len(merged),
               "labels_found":len(merged),
               "quality_status":"UNBENCHMARKED_REQUIRES_HUMAN_TRANSCRIPTION_REVIEW",
               "score_not_historical_confidence":True},
        "labels":merged,"georeferencing_status":"NOT_GEOREFERENCED",
        "historically_verified":0,"review_status":"HUMAN_REVIEW_REQUIRED"
    }


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--image",type=Path,required=True)
    p.add_argument("--out",type=Path,required=True)
    p.add_argument("--source-id",required=True)
    p.add_argument("--source-url",required=True)
    p.add_argument("--rights",required=True)
    p.add_argument("--title",required=True)
    p.add_argument("--year",type=int,required=True)
    p.add_argument("--language",default="fra")
    p.add_argument("--angles",default="0,90,270")
    p.add_argument("--min-confidence",type=float,default=.45)
    a=p.parse_args()
    record=run_multiorientation(a.image,source_id=a.source_id,source_url=a.source_url,
        rights=a.rights,title=a.title,source_year=a.year,language=a.language,
        angles=tuple(int(x) for x in a.angles.split(",")),
        minimum_confidence=a.min_confidence)
    a.out.parent.mkdir(parents=True,exist_ok=True)
    a.out.write_text(json.dumps(record,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"status":"MULTIANGLE_OCR_CANDIDATES_UNVERIFIED",
        "angles":record["ocr"]["angles_tested_degrees"],
        "review_candidates":record["ocr"]["labels_found"],"historically_verified":0,
        "file":str(a.out)}))


if __name__=="__main__":
    main()
