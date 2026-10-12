#!/usr/bin/env python3
"""Search acquired historical-library OCR for target names and spelling variants."""
import json,pathlib,re,datetime,unicodedata
root=pathlib.Path("library_acquisition"); out=pathlib.Path("citation_chase_hits");out.mkdir(exist_ok=True)
TERMS={
 "KYTHNOS_THERMIA":[r"kythnos",r"cythnos",r"kithnos",r"thermia",r"termia",r"thermie",r"therm[iy]a"],
 "CREVELIER":[r"crevelier",r"creveliers",r"crevellier",r"crevelière",r"creveliere",r"crevel"],
 "AEGEAN_CONTEXT":[r"archipel",r"arcipelago",r"archipelago",r"archipelagus",r"cyclad",r"naxos",r"paros",r"andros",r"astypal",r"stampalia"]
}
def norm(s):
 s=unicodedata.normalize("NFKC",s).replace("\x00"," ")
 return re.sub(r"[ \t]+"," ",s)
def line_no(text,pos): return text.count("\n",0,pos)+1
hits=[]
for p in sorted(root.glob("*")):
 if not p.is_file() or p.name=="acquisition_report.json": continue
 try: raw=p.read_text(encoding="utf-8",errors="ignore")
 except Exception: continue
 text=norm(raw)
 for group,pats in TERMS.items():
  for pat in pats:
   for m in re.finditer(pat,text,re.I):
    a=max(0,m.start()-350);b=min(len(text),m.end()+500)
    context=text[a:b].replace("\n"," ")
    hits.append({"file":p.name,"group":group,"matched":m.group(0),"line":line_no(text,m.start()),"context":context})
report={"generated_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),"protocol":"PCT-OCR-CITATION-HIT-v1","terms":TERMS,"hit_count":len(hits),"hits":hits,"warning":"OCR hits are discovery leads, not verified quotations or page citations. Exact page image/original inspection remains required."}
(out/"ocr_hits.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
# Compact priority report: Kythnos/Thermia or Crevelier only
priority=[h for h in hits if h["group"] in ("KYTHNOS_THERMIA","CREVELIER")]
(out/"priority_hits.json").write_text(json.dumps({"count":len(priority),"hits":priority,"next_stage":"MAP_HIT_TO_PAGE_AND_INSPECT_ORIGINAL"},ensure_ascii=False,indent=2),encoding="utf-8")
print("OCR hits",len(hits),"priority",len(priority))
for h in priority[:30]: print(h["file"],h["group"],h["matched"],"line",h["line"],h["context"][:240])
