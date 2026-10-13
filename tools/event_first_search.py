#!/usr/bin/env python3
"""General multilingual EVENT-FIRST search driven by the active research request.

OCR and catalogue metadata are kept as distinct lead classes. Neither is evidence.
"""
import json,pathlib,re,unicodedata,sys,os
sys.path.insert(0,str(pathlib.Path(__file__).parent))
from request_context import load_request

rf,req,ctx=load_request()
target=ctx["target"];aliases=ctx["aliases"];date=ctx["date_range"]
terms=[]
for x in [target]+aliases:
    x=str(x).strip()
    if x and x.casefold() not in {t.casefold() for t in terms}:terms.append(x)
years=[int(x) for x in re.findall(r"\b(?:1[0-9]{3}|20[0-9]{2})\b",date)]
lo,hi=(min(years),max(years)) if years else (0,9999)

EVENT=[
 r"corsair\w*",r"corsaire\w*",r"corsar\w*",r"corsaro\w*",r"pirat\w*",r"forban\w*",r"privateer\w*",r"armateur\w*",
 r"raid\w*",r"incursion\w*",r"attaque\w*",r"assaut\w*",r"attack\w*",r"aanval\w*",r"angriff\w*",r"ataque\w*",r"attacc\w*",
 r"pillage\w*",r"ravag\w*",r"saccag\w*",r"sack\w*",r"plunder\w*",r"raub\w*",r"plünder\w*",r"saque\w*",r"sacchegg\w*",r"roov\w*",
 r"br[uû]l\w*",r"burn\w*",r"incendi\w*",r"brand\w*",r"captur\w*",r"prisonni\w*",r"gevangen\w*",r"gefang\w*",r"cattur\w*",r"captiv\w*",
 r"esclav\w*",r"slave\w*",r"schiav\w*",r"slav\w*",r"tribut\w*",r"contribution\w*",r"ran[cç]on\w*",r"ransom\w*",r"riscatt\w*",r"rescat\w*",
 r"zeerover\w*",r"kapern\w*",r"seer[aä]uber\w*",r"ghaz\w*",r"akın\w*",r"esir\w*",r"fidye\w*",
 r"πειρατ\w*",r"κουρσάρ\w*",r"επιδρομ\w*",r"αιχμαλωσ\w*",r"λύτρ\w*",r"λεηλασ\w*",r"κατάληψ\w*",r"ρεσάλτ\w*",r"συνέλαβ\w*"
]

def place_matches(text):
    return [m for t in terms for m in re.finditer(r"(?<!\w)"+re.escape(t)+r"(?!\w)",text,re.I)]

def event_matches(text):
    return [m for pat in EVENT for m in re.finditer(r"(?<!\w)(?:"+pat+r")(?!\w)",text,re.I)]

def scoped_years(text):
    return sorted(set(int(y) for y in re.findall(r"\b(1[0-9]{3}|20[0-9]{2})\b",text) if lo<=int(y)<=hi))

def dedupe_ocr(items):
    merged={}
    for x in items:
        key=(x.get("file"),str(x.get("place_match","")).casefold(),tuple(x.get("years_in_scope") or []),tuple(sorted(str(t).casefold() for t in x.get("event_terms") or [])))
        if key not in merged:
            y=dict(x);y["occurrence_count"]=1;y["lines"]=[x.get("line")] if x.get("line") else [];merged[key]=y
        else:
            y=merged[key];y["occurrence_count"]+=1
            if x.get("line") and x.get("line") not in y["lines"]:y["lines"].append(x.get("line"))
    return list(merged.values())

def dedupe_catalogue(items):
    merged={}
    for x in items:
        key=(x.get("repository"),x.get("identifier") or x.get("url"),tuple(x.get("years_in_scope") or []),tuple(sorted(str(t).casefold() for t in x.get("event_terms") or [])),x.get("status"))
        if key not in merged:
            y=dict(x);y["occurrence_count"]=1;merged[key]=y
        else:
            merged[key]["occurrence_count"]+=1
    return list(merged.values())


root=pathlib.Path("library_acquisition");out=pathlib.Path("event_first_hits");out.mkdir(exist_ok=True)
hits=[];context_leads=[];catalogue_leads=[]
for p in root.glob("*"):
    if not p.is_file() or p.name=="acquisition_report.json" or p.suffix.lower() not in (".txt",".xml",".html",".htm"):continue
    try:text=unicodedata.normalize("NFKC",p.read_text(encoding="utf-8",errors="ignore"))
    except Exception:continue
    pm=place_matches(text);em=event_matches(text)
    for m in pm:
        near=[e for e in em if abs(e.start()-m.start())<=5000]
        if not near:continue
        a=max(0,m.start()-2500);b=min(len(text),m.end()+5000);ctx_text=text[a:b]
        ys=scoped_years(ctx_text)
        item={"file":p.name,"place_match":m.group(0),"line":text.count("\n",0,m.start())+1,"years_in_scope":ys,"event_terms":sorted(set(e.group(0) for e in near),key=str.casefold),"context":re.sub(r"[ \t]+"," ",ctx_text),"lead_type":"OCR_CONTEXT","context_excerpt":ctx_text}
        if ys:hits.append(item)
        else:
            item["status"]="TEMPORAL_CONTEXT_UNRESOLVED";context_leads.append(item)

# Scan catalogue/discovery metadata independently. This improves recall while
# retaining a strict LOCATED-only evidence state until an original is inspected.
disc_path=pathlib.Path("lane_discovery")/(os.getenv("PCT_RESEARCH_LANE","travellers")+".json")
if disc_path.exists():
    try:disc=json.loads(disc_path.read_text(encoding="utf-8"))
    except Exception:disc={}
    for rec in disc.get("results",[]):
        blob=unicodedata.normalize("NFKC",json.dumps(rec,ensure_ascii=False))
        pm=place_matches(blob);em=event_matches(blob)
        if not pm or not em:continue
        ys=scoped_years(blob)
        # For a dated request, metadata without an in-scope date remains a lead
        # but does not become a structured event candidate.
        status="CATALOGUE_METADATA_LEAD" if ys or not years else "TEMPORAL_CONTEXT_UNRESOLVED"
        catalogue_leads.append({
          "repository":rec.get("discovery_repository"),"identifier":rec.get("identifier"),
          "url":rec.get("url"),"title":rec.get("title"),"place_match":pm[0].group(0),
          "years_in_scope":ys,"event_terms":sorted(set(e.group(0) for e in em),key=str.casefold),
          "status":status,"verification_status":"NOT_ORIGINAL_VERIFIED",
          "lead_type":"CATALOGUE_METADATA","context_excerpt":blob[:12000]
        })

hits=dedupe_ocr(hits)\ncontext_leads=dedupe_ocr(context_leads)\ncatalogue_leads=dedupe_catalogue(catalogue_leads)\n\nreport={"schema":"pct-event-first-general-v5","request_file":rf.name,"target":target,"aliases":aliases,
 "date_range":[lo,hi],"hits":hits,"context_leads":context_leads,"catalogue_leads":catalogue_leads,
 "verification_status":"NEEDS_EVIDENCE","next_stage":"EXACT_PAGE_MAPPING_AND_ORIGINAL_INSPECTION",
 "rule":"OCR and catalogue metadata are discovery leads only. Repeated occurrences within one source/signature are deduplicated and counted, not treated as independent findings. Actor identity is not required."}
(out/"event_hits.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
print("GENERAL EVENT-FIRST",target,date,"anchored_hits",len(hits),"catalogue_leads",len(catalogue_leads),"unresolved_context_leads",len(context_leads))
