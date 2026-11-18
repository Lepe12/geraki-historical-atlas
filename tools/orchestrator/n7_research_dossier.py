#!/usr/bin/env python3
"""Produce a source-linked historical research dossier from actual inspected documents.

This is a research artifact, never an automatic historical verification certificate.
All quoted passages must come from inspected HTML/PDF content, with PDF page indices.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

READABLE = {"PAGE_READ_NO_EVENT_MATCH", "CO_OCCURRENCE_NEEDS_REVIEW"}
PERSON = re.compile(r"creveuil|crevell|crevelier|κρεβε", re.I)
PLACE = re.compile(r"ierapetra|hierapetra|gerapetra|ιεραπετρ", re.I)
YEAR = re.compile(r"(?<!\d)1675(?!\d)")

def compact(value, limit=580):
    return " ".join(str(value or "").split())[:limit]

def evidence_item(row, agent):
    url = str(row.get("document_url") or row.get("url") or "")
    if not url.startswith("https://"):
        return None
    pages = []
    seen = set()
    for excerpt in row.get("page_excerpts") or []:
        number = excerpt.get("pdf_page")
        text = compact(excerpt.get("text"), 680)
        if not isinstance(number, int) or number < 1 or not text:
            continue
        identity = (number, text)
        if identity in seen:
            continue
        seen.add(identity)
        pages.append({"pdf_page": number, "excerpt": text,
                      "person_mentioned": bool(PERSON.search(text)),
                      "place_mentioned": bool(PLACE.search(text)),
                      "year_mentioned": bool(YEAR.search(text))})
    html_excerpt = compact(row.get("page_excerpt"), 680)
    if not pages and html_excerpt and row.get("status") == "CO_OCCURRENCE_NEEDS_REVIEW":
        pages.append({"pdf_page": None, "excerpt": html_excerpt,
                      "person_mentioned": bool(PERSON.search(html_excerpt)),
                      "place_mentioned": bool(PLACE.search(html_excerpt)),
                      "year_mentioned": bool(YEAR.search(html_excerpt))})
    return {"url": url, "title": compact(row.get("title"), 200),
            "agent": agent, "status": row.get("status"),
            "pages_read": max(0, int(row.get("pages_read") or 0)),
            "total_pages": row.get("total_pages"),
            "partial_read": bool(row.get("partial_document_read")),
            "source_chain": list(row.get("source_chain") or [])[:3],
            "person_detected": bool(row.get("contains_person")),
            "place_detected": bool(row.get("contains_target")),
            "excerpts": pages[:25]}

def compile_dossier(directory: Path, report: dict):
    sources = {}
    failures = []
    for file in sorted((directory / "results").glob("*.json")):
        result = json.loads(file.read_text(encoding="utf-8"))
        agent = str(result.get("agent_id") or "unassigned")
        for row in (result.get("source_inspection") or {}).get("inspected_pages") or []:
            if row.get("status") not in READABLE:
                failures.append({"url": str(row.get("url") or "")[:300],
                                 "agent": agent, "status": row.get("status")})
                continue
            item = evidence_item(row, agent)
            if not item:
                continue
            key = item["url"].split("#", 1)[0]
            if key not in sources or (len(item["excerpts"]) > len(sources[key]["excerpts"])):
                sources[key] = item
    entries = list(sources.values())
    candidates = []
    for entry in entries:
        for page in entry["excerpts"]:
            # Co-occurrence on the *same PDF page* is a lead, not authentication.
            if page["person_mentioned"] and page["place_mentioned"]:
                candidates.append({"url":entry["url"],"pdf_page":page["pdf_page"],
                                   "excerpt":page["excerpt"],
                                   "year_mentioned":page["year_mentioned"],
                                   "status":"CO_OCCURRENCE_REQUIRES_SOURCE_CRITICISM"})
    independent_urls = sorted({c["url"] for c in candidates})
    return {
        "schema":"n7-historical-research-dossier/v1",
        "run_id":report["run_id"], "research_status":"EVIDENCE_REVIEW_REQUIRED",
        "discovery_count":report.get("discovered_record_count",0),
        "pages_read":report.get("inspected_source_pages_count",0),
        "readable_source_count":len(entries),
        "unreadable_source_attempts":failures,
        "read_sources":entries,
        "same_page_person_place_leads":candidates,
        "independent_source_candidates":len(independent_urls),
        "claim_assessment":{
          "subject":str(report.get("research_question") or "Unspecified historical research question"),
          "status":"NOT_HISTORICALLY_VERIFIED",
          "basis":"No independent primary attestation established by this automatic inspection.",
          "cross_checked":False,
          "source_critical_review_required":True
        },
        "next_research_actions":[
          "Inspect cited archival records, shelfmarks and original-language witnesses.",
          "Confirm whether each quoted page refers to Ierapetra or only to Creveliers elsewhere.",
          "Cross-check any dated attack with a genuinely independent contemporary source.",
          "Do not assert the number of attackers or Ottoman ships without a page-level quotation."
        ]
    }

def render_markdown(d):
    lines = ["# N7 — Ιστορική ερευνητική αναφορά",
             "", "**Ερώτημα:** "+str(d["claim_assessment"]["subject"]),
             "", "**Κατάσταση:** Απαιτείται κριτικός έλεγχος πηγών — δεν έχει ιστορικά επαληθευτεί.",
             "", "## Πραγματική εργασία",
             f"- Υποψήφιες εγγραφές αναζήτησης: {d['discovery_count']}",
             f"- Σελίδες που διαβάστηκαν: {d['pages_read']}",
             f"- Διαφορετικά αναγνωσμένα τεκμήρια: {d['readable_source_count']}",
             f"- Υποψήφια χωρία με πρόσωπο και τόπο στην ίδια σελίδα: {len(d['same_page_person_place_leads'])}",
             "", "## Αναγνωσμένες πηγές"]
    for source in d["read_sources"]:
        url = source["url"]
        lines += ["",f"### {source['title'] or 'Ανώνυμο τεκμήριο'}",
                  f"Πηγή: {url}",
                  f"Αναγνώστηκαν {source['pages_read']} σελίδες. "
                  + ("Μερική ανάγνωση." if source["partial_read"] else "")]
        if not source["excerpts"]:
            lines.append("Δεν εξήχθη χωρίο σχετικό με τα αναζητούμενα ονόματα.")
        for excerpt in source["excerpts"]:
            page = excerpt["pdf_page"]
            lines += ["", f"**Σελίδα PDF {page}**" if page else "**Απόσπασμα HTML**",
                      "> " + excerpt["excerpt"].replace("\n"," ")]
    if not d["read_sources"]:
        lines.append("Δεν αναγνώστηκε κανένα επιτρεπόμενο τεκμήριο.")
    lines += ["", "## Σύγκριση και ιστορική αποτίμηση"]
    n=d["independent_source_candidates"]
    lines += [f"Διαφορετικά τεκμήρια με υποψήφια χωρία για πρόσωπο και τόπο: **{n}**.",
              "Δεν ταυτοποιήθηκε αυτομάτως ανεξάρτητη πρωτογενής μαρτυρία για το συμβάν.",
              "Η συνύπαρξη λέξεων ή η συμφωνία δύο δευτερογενών έργων δεν αποτελεί επαλήθευση.",
              "", "## Εκκρεμότητες προς τεκμηρίωση"]
    lines += ["- "+x for x in d["next_research_actions"]]
    lines += ["", "## Μη προσβάσιμες πηγές"]
    if d["unreadable_source_attempts"]:
        lines += ["- "+x["url"]+" — "+str(x["status"]) for x in d["unreadable_source_attempts"][:20]]
    else:
        lines.append("Καμία καταγεγραμμένη αποτυχία ανάγνωσης.")
    return "\n".join(lines)+"\n"

def write_dossier(directory:Path, report:dict):
    d=compile_dossier(directory,report)
    (directory/"research_dossier.json").write_text(json.dumps(d,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    (directory/"research_dossier.md").write_text(render_markdown(d),encoding="utf-8")
    return d
