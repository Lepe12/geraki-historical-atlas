#!/usr/bin/env python3
"""Fast, deterministic, source-first retrieval. No model or fabricated claims."""
import argparse
import json
import re
import unicodedata
from pathlib import Path
from semantic_research_answer import collect, read

def tokens(value):
    value=unicodedata.normalize("NFKD",str(value)).casefold()
    value="".join(c for c in value if not unicodedata.combining(c))
    value=value.replace("ς","σ")
    return set(re.findall(r"[^\W_]{3,}",value,flags=re.UNICODE))

def search(records,request,limit=20):
    terms=tokens(" ".join([request.get("target",""),*(request.get("aliases") or []),*(request.get("search_name_variants") or [])]))
    if not terms:
        return []
    hits=[]
    for row in records:
        raw=row.get("text") or ""
        found=terms & tokens(raw)
        if not found:
            continue
        occurrences=row.get("occurrences") or []
        source=occurrences[0] if occurrences else {}
        hits.append({"evidence_id":row["evidence_id"],"excerpt":raw[:1400],
                     "matched_terms":sorted(found),"source":{"title":source.get("title"),"url":source.get("url"),
                     "locator":source.get("locator")},"source_attributed_only":True,
                     "historically_verified":False})
    hits.sort(key=lambda h:(-len(h["matched_terms"]),h["evidence_id"]))
    return hits[:limit]

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--run-id",required=True)
    parser.add_argument("--repo",default=".")
    args=parser.parse_args()
    if not re.fullmatch(r"\d{8,20}",args.run_id):
        raise SystemExit("INVALID_RUN_ID")
    root=Path(args.repo)/"evidence"/"runs"/args.run_id
    if not root.is_dir():
        raise SystemExit("CORPUS_NOT_RESTORED")
    request={}
    for p in sorted(root.glob("*/run_manifest/manifest.json")):
        request=read(p).get("normalized_request") or {}
        if request:
            break
    records,excluded=collect(root)
    hits=search(records,request)
    output={"status":"SOURCE_EXCERPTS_FOUND" if hits else "NO_LEXICAL_MATCH",
            "method":"DETERMINISTIC_LEXICAL_RETRIEVAL_NO_LLM",
            "model_used":False,"verified":False,"historically_verified":False,
            "candidate_excerpts":hits,"candidate_count":len(hits),
            "corpus_record_count":len(records),"excluded_count":len(excluded),
            "limitations":["Candidate excerpts are not verified historical claims; inspect full source and context."]}
    dest=root/"research_answer"/"fast_evidence.json"
    dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_text(json.dumps(output,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("N7_FAST_EVIDENCE",output["status"],"candidates",len(hits),"records",len(records),
          "excluded",len(excluded),"PRIVATE_ONLY")
if __name__=="__main__":
    main()
