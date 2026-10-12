#!/usr/bin/env python3
"""Repository-aware, request-driven discovery plan for each PCT parallel lane."""
import os,json,pathlib,sys
sys.path.insert(0,str(pathlib.Path(__file__).parent))
from request_context import load_request
from historical_query_expansion import expand_queries

lane=os.getenv("PCT_RESEARCH_LANE","travellers")
rf,req,ctx=load_request()
cfg={
"travellers":[("Gallica/BnF","https://catalogue.bnf.fr"),("BSB","https://www.digitale-sammlungen.de"),("Internet Archive","https://archive.org"),("Google Books","https://books.google.com")],
"spanish_simancas":[("PARES / Archivo General de Simancas","https://pares.cultura.gob.es"),("Biblioteca Digital Hispánica","https://catalogo.bne.es")],
"venetian":[("Archivio di Stato di Venezia / SIAS","https://sias-archivi.cultura.gov.it"),("Internet Culturale","https://www.internetculturale.it"),("Internet Archive","https://archive.org")],
"french":[("Archives nationales","https://www.archives-nationales.culture.gouv.fr"),("Archives diplomatiques","https://archivesdiplomatiques.diplomatie.gouv.fr"),("Gallica/BnF","https://catalogue.bnf.fr")],
"british":[("The National Archives Discovery","https://discovery.nationalarchives.gov.uk"),("British Library","https://searcharchives.bl.uk")],
"dutch":[("Nationaal Archief","https://www.nationaalarchief.nl"),("Delpher","https://www.delpher.nl")],
"german":[("BSB","https://www.digitale-sammlungen.de"),("Deutsche Digitale Bibliothek","https://www.deutsche-digitale-bibliothek.de")],
"italian_states":[("Internet Culturale","https://www.internetculturale.it"),("SIAS / Italian State Archives","https://sias-archivi.cultura.gov.it")],
"ottoman":[("Türkiye Devlet Arşivleri / BOA","https://katalog.devletarsivleri.gov.tr"),("İSAM Kütüphanesi","https://kutuphane.isam.org.tr"),("Internet Archive","https://archive.org")],
"north_african":[("Gallica/BnF","https://catalogue.bnf.fr"),("Archives diplomatiques France","https://archivesdiplomatiques.diplomatie.gouv.fr"),("Biblioteca Digital Hispánica","https://catalogo.bne.es")]
}
langs={"spanish_simancas":["Spanish","Latin"],"venetian":["Italian","Venetian","Latin"],"french":["French"],"british":["English"],"dutch":["Dutch"],"german":["German","Latin"],"italian_states":["Italian","Latin"],"ottoman":["Ottoman Turkish","Turkish"],"north_african":["Arabic","Ottoman Turkish","French","Spanish","Italian"],"travellers":["French","Italian","English","Dutch","German","Spanish","Latin","Greek"]}
if lane not in cfg: raise SystemExit("Unknown PCT_RESEARCH_LANE: "+lane)
terms=[ctx["target"]]+ctx["aliases"]
queries=expand_queries(lane,ctx["target"],ctx["aliases"],ctx["date_range"])
plan={"lane":lane,"request_file":rf.name,"target":ctx["target"],"aliases":ctx["aliases"],"date_range":ctx["date_range"],"languages":langs[lane],"expanded_queries":queries,"repositories":[],"rule":"Search repository/catalogue with auditable multilingual event vocabulary and user-supplied historical name variants; catalogue records are leads only."}
for name,base in cfg[lane]:
    q=" ".join(terms+[ctx["date_range"]]).strip()
    plan["repositories"].append({"name":name,"base_url":base,"query_seed":q,"status":"DISCOVERY_TARGET"})
out=pathlib.Path("repository_plans");out.mkdir(exist_ok=True)
(out/f"{lane}.json").write_text(json.dumps(plan,ensure_ascii=False,indent=2),encoding="utf-8")
print("LANE",lane,"request",rf.name,"repositories",len(plan["repositories"]),"languages",",".join(plan["languages"]))
