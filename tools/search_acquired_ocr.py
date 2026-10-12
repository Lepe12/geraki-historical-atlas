#!/usr/bin/env python3
"""Search acquired text for request-defined place/alias/name terms."""
import json,pathlib,re,datetime,unicodedata,sys
sys.path.insert(0,str(pathlib.Path(__file__).parent))
from request_context import load_request
rf,req,ctx=load_request()
root=pathlib.Path("library_acquisition");out=pathlib.Path("citation_chase_hits");out.mkdir(exist_ok=True)

place=[]
for t in [ctx["target"]]+ctx["aliases"]:
    t=str(t).strip()
    if t and t.casefold() not in [x.casefold() for x in place]:place.append(t)
lead_values=[]
for key in ("actors","actor","names","leads","persons","keywords"):
    v=req.get(key,[])
    if isinstance(v,str):v=[x.strip() for x in v.split(",") if x.strip()]
    if isinstance(v,list):lead_values.extend(str(x).strip() for x in v if str(x).strip())

def norm(s):
    s=unicodedata.normalize("NFKC",s).replace("\x00"," ")
    return re.sub(r"[ \t]+"," ",s)
def line_no(text,pos):return text.count("\n",0,pos)+1
hits=[]
terms=[("PLACE",t) for t in place]+[("REQUEST_LEAD",t) for t in lead_values]
for p in sorted(root.glob("*")):
    if not p.is_file() or p.name=="acquisition_report.json" or p.suffix.lower() not in (".txt",".xml",".html",".htm"):continue
    try:raw=p.read_text(encoding="utf-8",errors="ignore")
    except Exception:continue
    text=norm(raw)
    for group,term in terms:
        pat=r"(?<!\w)"+re.escape(term)+r"(?!\w)"
        for m in re.finditer(pat,text,re.I):
            a=max(0,m.start()-350);b=min(len(text),m.end()+500)
            hits.append({"file":p.name,"group":group,"term":term,"matched":m.group(0),"line":line_no(text,m.start()),"context":text[a:b].replace("\n"," ")})
report={"schema":"pct-ocr-citation-hit-v2","generated_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),"request_file":rf.name,"target":ctx["target"],"aliases":ctx["aliases"],"terms":terms,"hit_count":len(hits),"hits":hits,"warning":"OCR hits are discovery leads, not verified quotations or page citations. Exact-page original inspection remains required."}
(out/"ocr_hits.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
priority=[h for h in hits if h["group"]=="PLACE"]
(out/"priority_hits.json").write_text(json.dumps({"count":len(priority),"hits":priority,"next_stage":"EVENT_FIRST_AND_EXACT_PAGE_MAPPING"},ensure_ascii=False,indent=2),encoding="utf-8")
print("OCR hits",len(hits),"place priority",len(priority))
