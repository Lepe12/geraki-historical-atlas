#!/usr/bin/env python3
"""Cross-lane conservative source genealogy for Agent Piracy.

Only exact shared identifiers/URLs are declared NOT_INDEPENDENT automatically.
Title/creator similarity creates a review lead, never an independence claim.
"""
from __future__ import annotations
import argparse,hashlib,json,pathlib,re,urllib.parse,unicodedata,datetime

LANES=["travellers","spanish_simancas","venetian","french","british","dutch","german","italian_states","ottoman","north_african"]

def norm_text(v):
    s=unicodedata.normalize("NFKD",str(v or ""))
    s="".join(ch for ch in s if not unicodedata.combining(ch)).casefold()
    return " ".join(re.findall(r"[\w]+",s,flags=re.UNICODE))

def norm_url(v):
    if not v:return None
    try:
        u=urllib.parse.urlsplit(str(v))
        host=u.netloc.casefold().replace("www.","")
        path=re.sub(r"/+$","",u.path)
        return host+path
    except Exception:
        return str(v).strip().casefold()

def stable_id(rec):
    ident=rec.get("identifier")
    if ident:
        s=str(ident).strip()
        if s.startswith(("http://","https://")):
            return ("url",norm_url(s))
        return ("identifier",s.casefold())
    url=rec.get("url")
    if url:return ("url",norm_url(url))
    return None

def title_creator_key(rec):
    title=norm_text(rec.get("title"))
    creator=rec.get("creator")
    if isinstance(creator,list):creator=" | ".join(str(x) for x in creator)
    creator=norm_text(creator)
    if not title:return None
    return (title,creator)

ap=argparse.ArgumentParser()
ap.add_argument("--run-id",required=True)
args=ap.parse_args()
root=pathlib.Path("evidence/runs")/args.run_id
sources=[]
for lane in LANES:
    p=root/lane/"lane_discovery"/f"{lane}.json"
    if not p.exists():continue
    try:d=json.loads(p.read_text(encoding="utf-8"))
    except Exception:continue
    for i,r in enumerate(d.get("results",[]),1):
        sources.append({
          "source_uid":f"{lane}:{i:05d}",
          "lane":lane,
          "repository":r.get("discovery_repository"),
          "identifier":r.get("identifier"),
          "url":r.get("url"),
          "title":r.get("title"),
          "creator":r.get("creator"),
          "date":r.get("date"),
          "_stable":stable_id(r),
          "_tc":title_creator_key(r)
        })

by_exact={}
for s in sources:
    if s["_stable"]:by_exact.setdefault(s["_stable"],[]).append(s)
by_tc={}
for s in sources:
    if s["_tc"]:by_tc.setdefault(s["_tc"],[]).append(s)

relationships=[]
source_status={}
for s in sources:
    source_status[s["source_uid"]]={
      "independence_status":"UNKNOWN",
      "chain_id":None,
      "automatic_basis":None
    }

for key,group in by_exact.items():
    if len(group)<2:continue
    chain="exact-"+hashlib.sha256(repr(key).encode()).hexdigest()[:16]
    uids=[x["source_uid"] for x in group]
    relationships.append({
      "relationship":"SAME_DIGITAL_OBJECT",
      "confidence":1.0,
      "basis":"EXACT_SHARED_IDENTIFIER_OR_CANONICAL_URL",
      "source_uids":uids,
      "chain_id":chain,
      "independence_effect":"NOT_INDEPENDENT"
    })
    for x in group:
        source_status[x["source_uid"]]={"independence_status":"NOT_INDEPENDENT","chain_id":chain,"automatic_basis":"EXACT_SHARED_IDENTIFIER_OR_CANONICAL_URL"}

for key,group in by_tc.items():
    if len(group)<2:continue
    # Do not duplicate an exact relationship.
    uids=[x["source_uid"] for x in group]
    exact_same=any(set(r["source_uids"])==set(uids) and r["relationship"]=="SAME_DIGITAL_OBJECT" for r in relationships)
    if exact_same:continue
    relationships.append({
      "relationship":"POSSIBLE_SAME_EDITION_OR_DERIVATIVE",
      "confidence":0.5,
      "basis":"NORMALIZED_TITLE_CREATOR_MATCH",
      "source_uids":uids,
      "chain_id":None,
      "independence_effect":"UNKNOWN_REQUIRES_REVIEW"
    })

clean=[]
for s in sources:
    st=source_status[s["source_uid"]]
    clean.append({k:v for k,v in s.items() if not k.startswith("_")} | st)

out={
 "schema":"agent-piracy-source-genealogy-v1",
 "generated_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),
 "run_id":args.run_id,
 "source_count":len(clean),
 "exact_duplicate_groups":sum(r["relationship"]=="SAME_DIGITAL_OBJECT" for r in relationships),
 "possible_derivative_groups":sum(r["relationship"]=="POSSIBLE_SAME_EDITION_OR_DERIVATIVE" for r in relationships),
 "sources":clean,
 "relationships":relationships,
 "rules":[
   "Same repository diversity does not prove independence.",
   "Exact shared identifier/URL proves the records are not independent digital objects.",
   "Title/creator similarity is only a genealogy review lead.",
   "No source is automatically labelled INDEPENDENT."
 ]
}
dest=root/"SOURCE_GENEALOGY.json"
dest.write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print("SOURCE GENEALOGY",args.run_id,"sources",len(clean),"exact_duplicate_groups",out["exact_duplicate_groups"],"possible_derivative_groups",out["possible_derivative_groups"])
