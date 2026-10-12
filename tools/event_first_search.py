#!/usr/bin/env python3
"""General EVENT-FIRST search of acquired OCR driven by the newest research request JSON."""
import json,pathlib,re,datetime,unicodedata
reqs=sorted(pathlib.Path("library_discovery_requests").glob("*.json"),key=lambda p:p.stat().st_mtime)
if not reqs: raise SystemExit("No research request")
req=json.loads(reqs[-1].read_text(encoding="utf-8"))
target=str(req.get("target") or req.get("place") or "").strip()
date=str(req.get("date_range") or req.get("dates") or "").strip()
aliases=req.get("place_variants") or req.get("aliases") or []
if isinstance(aliases,str): aliases=[x.strip() for x in aliases.split(",") if x.strip()]
terms=[target]+aliases
terms=[x for x in terms if x]
if not terms: raise SystemExit("Request requires target/place or aliases")
years=[int(x) for x in re.findall(r"\b(?:1[0-9]{3}|20[0-9]{2})\b",date)]
lo,hi=(min(years),max(years)) if years else (0,9999)
EVENT=[r"corsair\w*",r"corsaire\w*",r"pirat\w*",r"forban\w*",r"privateer\w*",r"armateur\w*",r"raid\w*",r"incursion\w*",r"attaque\w*",r"assaut\w*",r"pillage\w*",r"ravag\w*",r"saccag\w*",r"br[uû]l\w*",r"captur\w*",r"prisonni\w*",r"esclav\w*",r"tribut\w*",r"contribution\w*",r"ran[cç]on\w*",r"plunder\w*",r"burn\w*",r"attack\w*",r"zeerover\w*"]
root=pathlib.Path("library_acquisition");out=pathlib.Path("event_first_hits");out.mkdir(exist_ok=True)
hits=[]
for p in root.glob("*"):
 if not p.is_file() or p.name=="acquisition_report.json":continue
 text=unicodedata.normalize("NFKC",p.read_text(encoding="utf-8",errors="ignore"))
 pm=[m for t in terms for m in re.finditer(r"(?<!\w)"+re.escape(t)+r"(?!\w)",text,re.I)]
 em=[m for pat in EVENT for m in re.finditer(r"(?<!\w)(?:"+pat+r")(?!\w)",text,re.I)]
 for m in pm:
  near=[e for e in em if abs(e.start()-m.start())<=5000]
  if not near:continue
  a=max(0,m.start()-2500);b=min(len(text),m.end()+5000);ctx=text[a:b]
  ys=sorted(set(int(y) for y in re.findall(r"\b(1[0-9]{3}|20[0-9]{2})\b",ctx) if lo<=int(y)<=hi))
  hits.append({"file":p.name,"place_match":m.group(0),"line":text.count("\n",0,m.start())+1,"years_in_scope":ys,"event_terms":sorted(set(e.group(0) for e in near),key=str.lower),"context":re.sub(r"[ \t]+"," ",ctx)})
report={"protocol":"PCT-EVENT-FIRST-GENERAL-v1","request_file":reqs[-1].name,"target":target,"aliases":aliases,"date_range":[lo,hi],"hits":hits,"verification_status":"NEEDS_EVIDENCE","next_stage":"EXACT_PAGE_MAPPING_AND_ORIGINAL_INSPECTION","rule":"Actor identity is not required for discovery."}
(out/"event_hits.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
print("GENERAL EVENT-FIRST",target,date,"hits",len(hits))
