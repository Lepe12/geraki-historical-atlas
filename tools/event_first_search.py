#!/usr/bin/env python3
"""General multilingual EVENT-FIRST search driven by the active research request."""
import json,pathlib,re,datetime,unicodedata,sys,os
sys.path.insert(0,str(pathlib.Path(__file__).parent))
from request_context import load_request
rf,req,ctx=load_request()
target=ctx["target"];aliases=ctx["aliases"];date=ctx["date_range"]
terms=[]
for x in [target]+aliases:
    x=str(x).strip()
    if x and x.casefold() not in [t.casefold() for t in terms]:terms.append(x)
years=[int(x) for x in re.findall(r"\b(?:1[0-9]{3}|20[0-9]{2})\b",date)]
lo,hi=(min(years),max(years)) if years else (0,9999)
# Actor-neutral event vocabulary across the standing research languages.
EVENT=[
 r"corsair\w*",r"corsaire\w*",r"corsar\w*",r"corsaro\w*",r"pirat\w*",r"forban\w*",r"privateer\w*",r"armateur\w*",
 r"raid\w*",r"incursion\w*",r"attaque\w*",r"assaut\w*",r"attack\w*",r"aanval\w*",r"angriff\w*",r"ataque\w*",r"attacc\w*",
 r"pillage\w*",r"ravag\w*",r"saccag\w*",r"plunder\w*",r"raub\w*",r"plünder\w*",r"saque\w*",r"sacchegg\w*",r"roov\w*",
 r"br[uû]l\w*",r"burn\w*",r"incendi\w*",r"brand\w*",r"captur\w*",r"prisonni\w*",r"gevangen\w*",r"gefang\w*",r"cattur\w*",r"captiv\w*",
 r"esclav\w*",r"slave\w*",r"schiav\w*",r"slav\w*",r"tribut\w*",r"contribution\w*",r"ran[cç]on\w*",r"ransom\w*",r"riscatt\w*",r"rescat\w*",
 r"zeerover\w*",r"kapern\w*",r"seer[aä]uber\w*",r"ghaz\w*",r"akın\w*",r"esir\w*",r"fidye\w*",\n r"πειρατ\w*",r"κουρσάρ\w*",r"επιδρομ\w*",r"αιχμαλωσ\w*",r"λύτρ\w*",r"λεηλασ\w*",r"κατάληψ\w*",r"ρεσάλτ\w*"
]
root=pathlib.Path("library_acquisition");out=pathlib.Path("event_first_hits");out.mkdir(exist_ok=True)
hits=[];context_leads=[];catalogue_leads=[]
for p in root.glob("*"):
    if not p.is_file() or p.name=="acquisition_report.json" or p.suffix.lower() not in (".txt",".xml",".html",".htm"):continue
    try:text=unicodedata.normalize("NFKC",p.read_text(encoding="utf-8",errors="ignore"))
    except Exception:continue
    pm=[m for t in terms for m in re.finditer(r"(?<!\w)"+re.escape(t)+r"(?!\w)",text,re.I)]
    em=[m for pat in EVENT for m in re.finditer(r"(?<!\w)(?:"+pat+r")(?!\w)",text,re.I)]
    for m in pm:
        near=[e for e in em if abs(e.start()-m.start())<=5000]
        if not near:continue
        a=max(0,m.start()-2500);b=min(len(text),m.end()+5000);ctx_text=text[a:b]
        ys=sorted(set(int(y) for y in re.findall(r"\b(1[0-9]{3}|20[0-9]{2})\b",ctx_text) if lo<=int(y)<=hi))
        item={"file":p.name,"place_match":m.group(0),"line":text.count("\n",0,m.start())+1,"years_in_scope":ys,"event_terms":sorted(set(e.group(0) for e in near),key=str.casefold),"context":re.sub(r"[ \t]+"," ",ctx_text)}
        if ys: hits.append(item)
        else:
            item["status"]="TEMPORAL_CONTEXT_UNRESOLVED"
            context_leads.append(item)

# Also inspect discovery metadata. Catalogue descriptions are leads only, never evidence.
disc_path=pathlib.Path("lane_discovery")/(os.getenv("PCT_RESEARCH_LANE","travellers")+".json")
if disc_path.exists():
    try:
        disc=json.loads(disc_path.read_text(encoding="utf-8"))
    except Exception:
        disc={}
    for rec in disc.get("results",[]):
        blob=unicodedata.normalize("NFKC",json.dumps(rec,ensure_ascii=False))
        place_ok=any(re.search(r"(?<!\\w)"+re.escape(t)+r"(?!\\w)",blob,re.I) for t in terms)
        if not place_ok: continue
        found_terms=[]
        for pat in EVENT:
            found_terms += [m.group(0) for m in re.finditer(r"(?<!\\w)(?:"+pat+r")(?!\\w)",blob,re.I)]
        if not found_terms: continue
        ys=sorted(set(int(y) for y in re.findall(r"\\b(1[0-9]{3}|20[0-9]{2})\\b",blob) if lo<=int(y)<=hi))
        catalogue_leads.append({
          "repository":rec.get("discovery_repository"),
          "identifier":rec.get("identifier"),
          "url":rec.get("url"),
          "title":rec.get("title"),
          "place_match":next((t for t in terms if re.search(r"(?<!\\w)"+re.escape(t)+r"(?!\\w)",blob,re.I)),None),
          "years_in_scope":ys,
          "event_terms":sorted(set(found_terms),key=str.casefold),
          "status":"CATALOGUE_METADATA_LEAD",
          "verification_status":"NOT_ORIGINAL_VERIFIED"
        })

report={"schema":"pct-event-first-general-v3","request_file":rf.name,"target":target,"aliases":aliases,"date_range":[lo,hi],"hits":hits,"context_leads":context_leads,"catalogue_leads":catalogue_leads,"verification_status":"NEEDS_EVIDENCE","next_stage":"EXACT_PAGE_MAPPING_AND_ORIGINAL_INSPECTION","rule":"Actor identity is not required for discovery. OCR/event proximity is a lead only."}
(out/"event_hits.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
print("GENERAL EVENT-FIRST",target,date,"anchored_hits",len(hits),"catalogue_leads",len(catalogue_leads),"unresolved_context_leads",len(context_leads))
