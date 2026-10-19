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



def query_live_learning(queries, max_queries=3):
    """Obtain GitHub Actions OIDC identity and read only scoped reviewed-PDF excerpts.

    Fails closed if outside the trusted GitHub Actions main-branch runtime.
    Learned quotations are *not* original-inspected historical evidence.
    """
    import os
    import urllib.parse
    import urllib.request
    from urllib.error import HTTPError, URLError

    base = os.getenv("PCT_COMMAND_CENTER_URL", "").rstrip("/")
    oidc_url = os.getenv("ACTIONS_ID_TOKEN_REQUEST_URL", "")
    oidc_token = os.getenv("ACTIONS_ID_TOKEN_REQUEST_TOKEN", "")
    if not base or not oidc_url or not oidc_token:
        return {"status": "NOT_CONFIGURED", "hits": [], "verified_count": 0}
    if not base.startswith("https://"):
        return {"status": "INVALID_ENDPOINT", "hits": [], "verified_count": 0}

    try:
        parsed = urllib.parse.urlsplit(oidc_url)
        params = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
        params.append(("audience", "piratecartography-command-center"))
        audience_url = urllib.parse.urlunsplit(
            (parsed.scheme, parsed.netloc, parsed.path, urllib.parse.urlencode(params), parsed.fragment))
        token_req = urllib.request.Request(
            audience_url, headers={"Authorization": "Bearer " + oidc_token})
        with urllib.request.urlopen(token_req, timeout=8) as resp:
            signed_token = json.load(resp)["value"]
        hits = []
        seen = set()
        for q in [str(x).strip()[:200] for x in queries if str(x).strip()][:max_queries]:
            body = json.dumps({"query": q}, ensure_ascii=False).encode("utf-8")
            req = urllib.request.Request(
                base + "/knowledge/agent-search", data=body, method="POST",
                headers={"Authorization": "Bearer " + signed_token,
                         "Content-Type": "application/json", "User-Agent": "NABOU-agent-evidence-bridge/1"})
            with urllib.request.urlopen(req, timeout=12) as resp:
                payload = json.load(resp)
            for hit in payload.get("hits", []):
                key = (hit.get("source_id"), hit.get("attestation_id"))
                if key in seen:
                    continue
                seen.add(key)
                hits.append(hit)
                if len(hits) >= 24:
                    break
            if len(hits) >= 24:
                break
        return {"status": "EXECUTED", "hits": hits, "verified_count": 0,
                "source": "PRODUCTION_LEARNING_EVIDENCE",
                "original_pdf_replayed": False}
    except (HTTPError, URLError, KeyError, ValueError, TimeoutError, OSError) as exc:
        return {"status": "REMOTE_UNAVAILABLE", "hits": [], "verified_count": 0,
                "error": type(exc).__name__}
