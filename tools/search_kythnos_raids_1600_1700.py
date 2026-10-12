#!/usr/bin/env python3
"""Event-focused Citation Chase for raids/violence on Kythnos/Thermia, 1600-1700."""
import json,pathlib,re,datetime,unicodedata
root=pathlib.Path("library_acquisition"); out=pathlib.Path("kythnos_1600_1700_hits");out.mkdir(exist_ok=True)
PLACE=[r"kythnos",r"cythnos",r"cythnus",r"kithnos",r"thermia",r"termia",r"phermia",r"phermina",r"thermie"]
EVENT=[
 r"corsair\w*",r"corsaire\w*",r"pirat\w*",r"forban\w*",r"armateur\w*",
 r"raid\w*",r"incursion\w*",r"attaque\w*",r"attaqu\w*",r"assaut\w*",r"pillage\w*",r"pill[eé]\w*",
 r"ravag\w*",r"saccag\w*",r"br[uû]l\w*",r"captur\w*",r"prisonni\w*",r"esclav\w*",
 r"tribut\w*",r"contribution\w*",r"ran[cç]on\w*",r"rancon\w*",r"tax\w*",
 r"zeerover\w*",r"rover\w*",r"plunder\w*",r"spo[iy]l\w*",r"burn\w*",r"attack\w*",
 r"turc\w*",r"barbaresq\w*",r"maltais\w*",r"proven[cç]al\w*",r"fran[cç]ois\w*"
]
YEARS=re.compile(r"\b(16\d{2})\b")
def norm(s): return unicodedata.normalize("NFKC",s).replace("\x00"," ")
hits=[]
for p in sorted(root.glob("*")):
 if not p.is_file() or p.name=="acquisition_report.json": continue
 text=norm(p.read_text(encoding="utf-8",errors="ignore"))
 place_matches=[m for pat in PLACE for m in re.finditer(r"(?<!\\w)(?:"+pat+r")(?!\\w)",text,re.I)]
 event_matches=[m for pat in EVENT for m in re.finditer(r"(?<!\\w)(?:"+pat+r")(?!\\w)",text,re.I)]
 for pm in place_matches:
  near=[em for em in event_matches if abs(em.start()-pm.start())<=5000]
  if not near: continue
  a=max(0,pm.start()-2500);b=min(len(text),pm.end()+5000);ctx=text[a:b]
  years=sorted(set(int(y) for y in YEARS.findall(ctx) if 1600<=int(y)<=1700))
  hits.append({"file":p.name,"place":pm.group(0),"line":text.count("\n",0,pm.start())+1,
    "nearby_event_terms":sorted(set(em.group(0) for em in near),key=str.lower),
    "years_1600_1700":years,"context":re.sub(r"[ \t]+"," ",ctx)})
report={"generated_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),
 "protocol":"PCT-KYTHNOS-RAIDS-1600-1700-v1","research_question":"Raids, corsair/pirate attacks, violent incursions, plunder, captivity, tribute or coercive exactions affecting Kythnos/Thermia during 1600-1700.",
 "scope":{"place_variants":PLACE,"date_range":[1600,1700],"event_patterns":EVENT},
 "hit_count":len(hits),"hits":hits,
 "warning":"OCR proximity is a lead only. Verification requires exact-page mapping, original-page inspection, event dating, and independent source genealogy."}
(out/"event_hits.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
print("Kythnos 1600-1700 event-proximity hits",len(hits))
for h in hits[:50]: print(h["file"],h["place"],h["line"],h["years_1600_1700"],h["nearby_event_terms"][:12])
