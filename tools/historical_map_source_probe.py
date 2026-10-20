#!/usr/bin/env python3
"""Audit Library of Congress 1670 portolan IIIF access; never invent results.

Fixed catalog item and manifest candidate. No scans are downloaded.
"""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ITEM = "https://www.loc.gov/item/2005634040/"
CANDIDATE_MANIFEST = "https://www.loc.gov/item/2005634040/manifest.json"


def probe(fetch=urlopen):
    result = {
        "schema": "nabou-historical-map-acquisition-probe-v1",
        "source_id": "loc:2005634040",
        "catalogue_url": ITEM,
        "manifest_url_attempted": CANDIDATE_MANIFEST,
        "checked_at_utc": datetime.now(timezone.utc).isoformat(),
        "manifest_verified": False,
        "images_downloaded": 0,
        "historical_map_labels_extracted": 0,
        "status": "NOT_YET_ATTEMPTED",
    }
    try:
        request=Request(CANDIDATE_MANIFEST,headers={
            "User-Agent": "NABOU-historical-map-research/1.0 (+https://github.com/Lepe12/geraki-historical-atlas)",
            "Accept": "application/ld+json, application/json",
        })
        with fetch(request,timeout=20) as response:
            body=response.read(8*1024*1024+1)
        if len(body)>8*1024*1024:
            raise ValueError("Manifest exceeds 8MB limit")
        manifest=json.loads(body)
        if manifest.get("sequences"):
            canvases=manifest["sequences"][0].get("canvases",[])
        else:
            canvases=manifest.get("items",[])
        if not isinstance(canvases,list) or not canvases:
            raise ValueError("IIIF manifest contains no canvases")
        result.update({
            "manifest_verified": True,
            "status": "IIIF_METADATA_FETCHED_IMAGES_NOT_ACQUIRED",
            "canvas_count": len(canvases),
            "manifest_title": manifest.get("label"),
            "image_services_not_downloaded": True,
            "georeference_available": False,
            "ocr_executed": False,
        })
    except HTTPError as error:
        result.update(status="UPSTREAM_HTTP_BLOCKED_OR_UNAVAILABLE",
                      http_status=error.code, error_type="HTTPError")
    except (URLError, TimeoutError) as error:
        result.update(status="NETWORK_ACCESS_BLOCKED",error_type=type(error).__name__)
    except (OSError, json.JSONDecodeError, ValueError, TypeError, KeyError) as error:
        result.update(status="IIIF_MANIFEST_UNRESOLVED",error_type=type(error).__name__)
    return result


def main():
    p=argparse.ArgumentParser()
    p.add_argument("--out",type=Path,required=True)
    args=p.parse_args()
    report=probe()
    args.out.parent.mkdir(parents=True,exist_ok=True)
    args.out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"status":report["status"],"manifest_verified":report["manifest_verified"],
                      "image_count_downloaded":0,"file":str(args.out)}))


if __name__=="__main__":
    main()
