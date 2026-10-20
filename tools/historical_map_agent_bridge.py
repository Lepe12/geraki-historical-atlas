"""Curated archival *catalogue leads* exposed to existing research agents.

No web discovery, georeference, OCR correctness or historical claim is implied.
The local registry is read-only and its contents must retain their own rights.
"""
from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAP_TERMS = (
    "historical map", "maps", "map", "cartograph", "portolan", "chart",
    "χάρτ", "χαρτογραφ", "πορτολάν", "χάρτης", "αἰγα", "αιγαι",
    "aegean", "mediterranean", "μεσόγει", "γεωγραφ", "νησι",
)


def curated_map_leads(queries, *, root=ROOT, max_records=5):
    relevant = [
        str(query).strip().casefold() for query in (queries or [])
        if isinstance(query, str) and any(term in query.casefold() for term in MAP_TERMS)
    ]
    if not relevant:
        return {"schema": "nabou-map-catalogue-bridge-v1",
                "status": "NOT_RELEVANT_TO_OPERATOR_QUERY", "leads": [],
                "historically_verified": 0, "archival_search_executed": False}
    source_root = Path(root) / "data" / "historical-map-sources"
    leads = []
    if source_root.is_dir():
        for path in sorted(source_root.glob("*.json"))[:25]:
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                continue
            if data.get("schema") != "nabou-historical-map-source-lead-v1":
                continue
            url = data.get("catalogue_url") or data.get("source_url")
            if not str(url or "").startswith("https://") or not data.get("source_id"):
                continue
            leads.append({
                "source_id": data["source_id"], "title": data.get("title"),
                "source_url": url, "institution": data.get("institution"),
                "year": data.get("source_year"), "rights_notice": data.get("rights"),
                "source_status": data.get("record_status") or data.get("evidence_status"),
                "stage": "CURATED_CATALOGUE_LEAD_NOT_A_FRESH_SEARCH",
                "historically_verified": False,
                "georeference_verified": False,
                "citation_to_specific_historical_event": None,
                "requires": ["HUMAN_SOURCE_INSPECTION", "SOURCE_LOCATION",
                             "CONTROL_POINT_REVIEW", "ENTITY_RESOLUTION"]
            })
            if len(leads) >= max_records:
                break
    return {"schema": "nabou-map-catalogue-bridge-v1", "status": "CURATED_LEADS_ONLY",
            "triggering_query": relevant[:3], "leads": leads,
            "historically_verified": 0, "archival_search_executed": False}
