#!/usr/bin/env python3
"""Historical map labels -> evidence-safe GeoJSON and WHG match candidates.

Adapted to mapKurator's *output format*, not a bundled/installed mapKurator
model. Ground polygons remain label footprints, never confirmed place shapes.
WHG reconciliation is optional, credentialed, and NEVER approves identities.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import urllib.error
import urllib.request


SCHEMA = "nabou-historical-map-features-v1"
WHG_URL = "https://whgazetteer.org/reconcile"
USER_AGENT = "NABOU-HistoricalAtlas/1.0 (+https://github.com/Lepe12/geraki-historical-atlas)"


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def _coordinates(geometry):
    kind = geometry.get("type")
    coords = geometry.get("coordinates")
    if kind == "Point":
        positions = [coords]
    elif kind == "Polygon":
        positions = [point for ring in coords or [] for point in ring]
    elif kind == "MultiPolygon":
        positions = [point for polygon in coords or [] for ring in polygon for point in ring]
    else:
        raise ValueError("Unsupported/ungeoreferenced geometry: " + str(kind))
    if not positions or any(
        not isinstance(p, list) or len(p) < 2
        or any(isinstance(v, bool) or not isinstance(v, (float, int)) or not math.isfinite(v) for v in p[:2])
        or not (-180 <= p[0] <= 180 and -90 <= p[1] <= 90)
        for p in positions
    ):
        raise ValueError("Invalid geographic coordinates: EPSG:4326 longitude/latitude required")
    return positions


def convert_labels(raw, *, source_id, source_url, rights, map_title,
                   start_year=None, end_year=None, crs=None):
    """Accept georeferenced mapKurator-style GeoJSON; provenance is mandatory."""
    if crs != "EPSG:4326":
        raise ValueError("Explicit --crs EPSG:4326 required; never interpret pixels as lon/lat")
    if any(not str(v or "").strip() for v in (source_id, source_url, rights, map_title)):
        raise ValueError("Source ID, source URL, title and rights are required")
    if not str(source_url).startswith(("https://", "http://")):
        raise ValueError("Source URL must be HTTP(S)")
    if start_year is not None and end_year is not None and start_year > end_year:
        raise ValueError("Invalid historical year interval")
    if not isinstance(raw, dict) or raw.get("type") != "FeatureCollection":
        raise ValueError("GeoJSON FeatureCollection required")
    features, skipped = [], []
    for index, feat in enumerate(raw.get("features") or []):
        if not isinstance(feat, dict) or feat.get("type") != "Feature":
            skipped.append({"index": index, "reason": "INVALID_FEATURE"})
            continue
        prop = feat.get("properties") or {}
        if not isinstance(prop, dict):
            raise ValueError("Invalid feature properties")
        ocr = str(prop.get("text") or prop.get("label") or "").strip()
        postocr = str(prop.get("postocr_label") or "").strip()
        name = postocr or ocr
        if not name:
            skipped.append({"index": index, "reason": "NO_LABEL"})
            continue
        if len(name) > 300:
            raise ValueError("Label too long")
        geom = feat.get("geometry") or {}
        _coordinates(geom)
        score = prop.get("score")
        if score is not None and (isinstance(score, bool) or not isinstance(score, (float, int))
                                  or not math.isfinite(score) or not 0 <= score <= 1):
            raise ValueError("Invalid mapKurator OCR score, expected 0..1")
        evidence_id = "maplabel_" + digest([source_id, index, name, geom])[:24]
        features.append({
            "type": "Feature", "id": evidence_id,
            "geometry": geom,
            "properties": {
                "label": name, "raw_ocr_label": ocr,
                "postocr_label": postocr or None,
                "ocr_score": score, "ocr_score_is_historical_confidence": False,
                "mapkurator_osm_candidate": str(prop["osm_id"]) if prop.get("osm_id") is not None else None,
                "source_id": source_id, "source_url": source_url, "map_title": map_title,
                "source_rights": rights, "start_year": start_year, "end_year": end_year,
                "geometry_role": "MAP_TEXT_FOOTPRINT_NOT_ATTESTED_PLACE_GEOMETRY",
                "identity_status": "CANDIDATE_UNREVIEWED", "review_status": "UNREVIEWED",
                "source_quote_verified": False, "original_source_inspected": False,
                "historical_claim_verified": False,
                "provenance": {"processor": "nabou-mapkurator-output-adapter-v1",
                               "upstream": "knowledge-computing/mapkurator-system",
                               "input_feature_index": index, "coordinate_reference_system": crs}
            }
        })
    return {"type": "FeatureCollection", "schema": SCHEMA, "features": features,
            "metadata": {"source_id": source_id, "source_url": source_url,
                         "title": map_title, "rights": rights, "crs": "EPSG:4326",
                         "original_geojson_sha256": digest(raw),
                         "features_read": len(raw.get("features") or []),
                         "features_exported": len(features), "skipped": skipped,
                         "historical_verification": "NOT_PERFORMED"}}


def make_whg_queries(collection, *, namespaces=None):
    if collection.get("schema") != SCHEMA:
        raise ValueError("Normalized historical map features required")
    queries, feature_lookup = {}, {}
    for feature in collection.get("features", []):
        name = feature["properties"]["label"]
        key = "q" + str(len(queries))
        q = {"query": name, "mode": "fuzzy"}
        if namespaces:
            q["namespaces"] = namespaces
        # WHG warns start/end are HARD filters that wrongly exclude
        # modern authority records for historical names. Keep map years
        # on the source feature and apply historical context in human review.
        # Do not use period hints as matching filters.
        queries[key] = q
        feature_lookup[key] = feature["id"]
    return queries, feature_lookup


def reconcile(collection, *, token, namespaces="whg,gn", opener=urllib.request.urlopen):
    """WHG batch reconciliation; results remain operator-review candidates."""
    if not token:
        raise ValueError("WHG_API_TOKEN_REQUIRED; no anonymous scrape or token in frontend")
    queries, identifiers = make_whg_queries(collection, namespaces=namespaces)
    records, attributions, warnings = [], [], []
    keys = list(queries)
    for offset in range(0, len(keys), 50):
        batch_keys = keys[offset:offset + 50]
        payload = json.dumps({"queries": {key: queries[key] for key in batch_keys}},
                             ensure_ascii=False).encode("utf-8")
        request = urllib.request.Request(
            WHG_URL, data=payload, method="POST",
            headers={"Content-Type": "application/json", "Accept": "application/json",
                     "Authorization": "Bearer " + token, "User-Agent": USER_AGENT})
        with opener(request, timeout=30) as response:
            reply = json.load(response)
        if not isinstance(reply, dict):
            raise ValueError("Invalid WHG API response")
        attributions.append(reply.get("attribution") or {})
        for key in batch_keys:
            item = reply.get(key) or {}
            if not isinstance(item, dict):
                warnings.append({"feature_id": identifiers[key], "error": "INVALID_RESPONSE"})
                continue
            if item.get("error"):
                warnings.append({"feature_id": identifiers[key], "error": str(item["error"])[:200]})
            for match in (item.get("result") or [])[:15]:
                if not isinstance(match, dict) or not match.get("id"):
                    continue
                point = match.get("repr_point")
                if point is not None:
                    try:
                        _coordinates({"type": "Point", "coordinates": point})
                    except (ValueError, TypeError):
                        point = None
                records.append({
                    "id": "candidate_" + digest([identifiers[key], match.get("id"), namespaces])[:24],
                    "map_feature_id": identifiers[key], "candidate_place_id": str(match["id"]),
                    "candidate_name": match.get("name"),
                    "namespace": match.get("namespace"), "score_relative": match.get("score"),
                    "name_confidence_absolute": match.get("confidence"), "repr_point": point,
                    "match_flag_not_verified": match.get("match") is True,
                    "candidate_status": "SUGGESTED", "historically_verified": False,
                    "algorithm": "WHG-reconcile-fuzzy", "evidence": "NAME_MATCH_NOT_IDENTITY_PROOF"
                })
    return {"schema": "nabou-historical-map-candidates-v1",
            "input_sha256": digest(collection), "provider": "World Historical Gazetteer",
            "provider_endpoint": WHG_URL, "source_attributions": attributions,
            "candidates": records, "warnings": warnings, "operator_approved": 0,
            "historically_verified": 0, "identity_resolution": "REQUIRES_CONTEXTUAL_REVIEW"}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="operation", required=True)
    ingest = sub.add_parser("import-labels")
    ingest.add_argument("--input", required=True)
    ingest.add_argument("--output", required=True)
    ingest.add_argument("--map-source", required=True)
    ingest.add_argument("--source-url", required=True)
    ingest.add_argument("--rights", required=True)
    ingest.add_argument("--title", required=True)
    ingest.add_argument("--crs", required=True)
    ingest.add_argument("--start-year", type=int)
    ingest.add_argument("--end-year", type=int)
    whg = sub.add_parser("reconcile-whg")
    whg.add_argument("--input", required=True)
    whg.add_argument("--output", required=True)
    whg.add_argument("--namespaces", default="whg,gn")
    args = parser.parse_args(argv)
    data = json.loads(Path(args.input).read_text(encoding="utf-8"))
    if args.operation == "import-labels":
        result = convert_labels(data, source_id=args.map_source, source_url=args.source_url,
                                rights=args.rights, map_title=args.title, crs=args.crs,
                                start_year=args.start_year, end_year=args.end_year)
    else:
        result = reconcile(data, token=os.getenv("WHG_API_TOKEN"),
                           namespaces=args.namespaces)
    dest = Path(args.output)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "EXPORTED", "file": str(dest),
                      "features": len(result.get("features", [])),
                      "candidates": len(result.get("candidates", [])),
                      "historically_verified": 0}))


if __name__ == "__main__":
    main()
