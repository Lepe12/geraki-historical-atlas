"""Safely bridge live specialist discovery records into an evidence-aware staging shape.

A catalogue/search hit is never a document quotation or a historical attestation.
This module records traceable source *leads* and the blocker state only.
"""
from __future__ import annotations

import hashlib
import json


def _stable_id(data):
    return hashlib.sha256(json.dumps(data, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:24]


def discovery_to_evidence_queue(search_runs, *, run_id, agent_id):
    leads = []
    errors = []
    seen = set()
    for search in search_runs or []:
        if not isinstance(search, dict):
            continue
        connector = str(search.get("connector_id") or search.get("repository") or "unknown")
        status = str(search.get("status") or "UNKNOWN")
        if status != "EXECUTED":
            errors.append({"connector_id": connector, "status": status,
                           "diagnostic": str(search.get("diagnostic") or "")[:1000]})
        for raw in search.get("records") or []:
            if not isinstance(raw, dict):
                continue
            url = str(raw.get("url") or raw.get("identifier") or "").strip()
            title = str(raw.get("title") or "").strip()
            if not url and not title:
                continue
            marker = (connector, url, title)
            if marker in seen:
                continue
            seen.add(marker)
            lead = {
                "id": "lead_" + _stable_id([run_id, agent_id, marker]),
                "run_id": str(run_id),
                "agent_id": str(agent_id),
                "connector_id": connector,
                "source_url_or_identifier": url,
                "title": title,
                "query": str(search.get("query") or ""),
                "stage": "DISCOVERY_ONLY",
                "historical_attestation": False,
                "citation_verified": False,
                "requires": ["ACQUIRE_SOURCE", "EXTRACT_SOURCE_TEXT",
                             "REPLAY_QUOTE", "HUMAN_REVIEW"],
            }
            leads.append(lead)
    return {"schema": "nabou-discovery-evidence-queue-v1",
            "run_id": str(run_id), "agent_id": str(agent_id),
            "source_leads": leads, "connector_errors": errors,
            "historical_attestations": [], "verified_count": 0}
