#!/usr/bin/env python3
"""Validate data/voyages/voyages.v1.json (schema nabou-voyages-v1).

Standalone check for the NABOU//X 3D voyage view. It rejects any leg that
lacks a citation, a quote, a run/claim reference or a gazetteer_id, any leg
that stores its own coordinates, and any date that does not appear verbatim
in the quoted source text. Read-only: it never modifies data.

Usage: python3 tools/validate_voyages.py [voyages.json] [gazetteer.json]
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VOYAGES = ROOT / "data" / "voyages" / "voyages.v1.json"
GAZETTEER = ROOT / "data" / "gazetteer" / "mediterranean_gazetteer.v1.json"

SCHEMA = "nabou-voyages-v1"
CERTAINTY = {"STATED", "UNCERTAIN"}
REVIEW = {"PENDING_REVIEW", "USER_APPROVED"}
VOYAGE_STATUS = {"DRAFT", "USER_APPROVED"}
COORD_KEYS = {"lat", "lon", "lng", "latitude", "longitude", "coordinates", "coords"}


def gazetteer_ids(gazetteer):
    return {p["id"] for p in gazetteer.get("places", []) if p.get("id")}


def _blank(value):
    return not isinstance(value, str) or not value.strip()


def _endpoint_errors(where, end, ids):
    errors = []
    if not isinstance(end, dict):
        return [f"{where}: endpoint must be an object"]
    gid = end.get("gazetteer_id")
    if _blank(gid):
        errors.append(f"{where}: missing gazetteer_id")
    elif gid not in ids:
        errors.append(f"{where}: gazetteer_id {gid} is not in the gazetteer")
    if _blank(end.get("name_in_source")):
        errors.append(f"{where}: missing name_in_source")
    if COORD_KEYS & set(end):
        errors.append(f"{where}: coordinates must come from the gazetteer, not the voyage file")
    return errors


def leg_errors(where, leg, ids):
    errors = []
    if not isinstance(leg, dict):
        return [f"{where}: leg must be an object"]
    if COORD_KEYS & set(leg):
        errors.append(f"{where}: coordinates must come from the gazetteer, not the voyage file")
    for side in ("from", "to"):
        errors += _endpoint_errors(f"{where}.{side}", leg.get(side), ids)
    if leg.get("certainty") not in CERTAINTY:
        errors.append(f"{where}: certainty must be one of {sorted(CERTAINTY)}")
    if leg.get("review_status") not in REVIEW:
        errors.append(f"{where}: review_status must be one of {sorted(REVIEW)}")
    if leg.get("geometry") != "SCHEMATIC":
        errors.append(f"{where}: geometry must be SCHEMATIC")
    if _blank(leg.get("run_id")):
        errors.append(f"{where}: missing run_id")
    claims = leg.get("claim_ids")
    if not isinstance(claims, list) or not claims or any(_blank(c) for c in claims):
        errors.append(f"{where}: claim_ids must be a non-empty list")
    cit = leg.get("citation")
    quote = ""
    if not isinstance(cit, dict):
        errors.append(f"{where}: missing citation")
    else:
        for key in ("title", "page", "url", "quote"):
            if _blank(cit.get(key)):
                errors.append(f"{where}: citation.{key} is missing")
        quote = cit.get("quote") or ""
    date = leg.get("date_in_source")
    if date not in (None, ""):
        if _blank(date):
            errors.append(f"{where}: date_in_source must be text")
        elif quote and date not in quote:
            errors.append(f"{where}: date_in_source {date!r} does not appear in the quote")
    waypoints = leg.get("waypoints", [])
    if not isinstance(waypoints, list):
        errors.append(f"{where}: waypoints must be a list")
    else:
        for i, wp in enumerate(waypoints):
            if not isinstance(wp, dict) or wp.get("cartographic_aid") is not True:
                errors.append(f"{where}.waypoints[{i}]: must be marked cartographic_aid: true")
    return errors


def validate(doc, gazetteer):
    errors = []
    if not isinstance(doc, dict) or doc.get("schema") != SCHEMA:
        return [f"schema must be {SCHEMA}"]
    voyages = doc.get("voyages")
    if not isinstance(voyages, list):
        return ["voyages must be a list"]
    ids = gazetteer_ids(gazetteer)
    seen = set()
    for vi, voyage in enumerate(voyages):
        where = f"voyages[{vi}]"
        if not isinstance(voyage, dict):
            errors.append(f"{where}: must be an object")
            continue
        vid = voyage.get("voyage_id")
        if _blank(vid):
            errors.append(f"{where}: missing voyage_id")
        elif vid in seen:
            errors.append(f"{where}: duplicate voyage_id {vid}")
        seen.add(vid)
        if voyage.get("status") not in VOYAGE_STATUS:
            errors.append(f"{where}: status must be one of {sorted(VOYAGE_STATUS)}")
        legs = voyage.get("legs")
        if not isinstance(legs, list):
            errors.append(f"{where}: legs must be a list")
            continue
        seqs = set()
        for li, leg in enumerate(legs):
            lw = f"{where}.legs[{li}]"
            errors += leg_errors(lw, leg, ids)
            seq = leg.get("seq") if isinstance(leg, dict) else None
            if not isinstance(seq, int) or seq < 1:
                errors.append(f"{lw}: seq must be a positive integer")
            elif seq in seqs:
                errors.append(f"{lw}: duplicate seq {seq}")
            seqs.add(seq)
    return errors


def main(argv):
    vpath = Path(argv[1]) if len(argv) > 1 else VOYAGES
    gpath = Path(argv[2]) if len(argv) > 2 else GAZETTEER
    doc = json.loads(vpath.read_text(encoding="utf-8"))
    gaz = json.loads(gpath.read_text(encoding="utf-8"))
    errors = validate(doc, gaz)
    for e in errors:
        print("ERROR", e)
    legs = sum(len(v.get("legs", [])) for v in doc.get("voyages", []) if isinstance(v, dict))
    print(f"{vpath.name}: {len(doc.get('voyages', []))} voyages, {legs} legs, {len(errors)} errors")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
