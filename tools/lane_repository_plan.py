#!/usr/bin/env python3
"""Repository-aware, request-driven discovery plan for each PCT parallel lane."""
import os,json,pathlib,sys
sys.path.insert(0,str(pathlib.Path(__file__).parent))
from request_context import load_request
from historical_query_expansion import expand_queries
from research_relevance import identity, discovery_queries
sys.path.insert(0,str(pathlib.Path(__file__).parent/"orchestrator"))
from jarvis_specialist_plan import build as specialist_plan

lane=os.getenv("PCT_RESEARCH_LANE","travellers")
rf,req,ctx=load_request()
cfg={
"greek":[("SearchCulture.gr / EKT","https://www.searchculture.gr"),("OpenArchives.gr / EKT","https://www.openarchives.gr"),("National Library of Greece Digital Collections","https://digitalcollections.nlg.gr"),("Anemi / University of Crete","https://anemi.lib.uoc.gr"),("OpenAlex Scholarly Works","https://openalex.org"),("Crossref Scholarly Metadata","https://www.crossref.org"),("Academia.edu Public Research","https://www.academia.edu"),("Google Books","https://books.google.com")],
"travellers":[("SearchCulture.gr / EKT","https://www.searchculture.gr"),("Library of Congress","https://www.loc.gov"),("Gallica/BnF","https://catalogue.bnf.fr"),("BSB","https://www.digitale-sammlungen.de"),("Internet Archive","https://archive.org"),("Google Books","https://books.google.com")],
"spanish_simancas":[("PARES / Archivo General de Simancas","https://pares.cultura.gob.es"),("Biblioteca Digital Hispánica","https://catalogo.bne.es")],
"venetian":[("Archivio di Stato di Venezia / SIAS","https://sias-archivi.cultura.gov.it"),("Internet Culturale","https://www.internetculturale.it"),("Internet Archive","https://archive.org")],
"french":[("Archives nationales","https://www.archives-nationales.culture.gouv.fr"),("Archives diplomatiques","https://archivesdiplomatiques.diplomatie.gouv.fr"),("Gallica/BnF","https://catalogue.bnf.fr")],
"british":[("The National Archives Discovery","https://discovery.nationalarchives.gov.uk"),("The National Archives Public Content","https://www.nationalarchives.gov.uk"),("British Library","https://searcharchives.bl.uk")],
"dutch":[("Nationaal Archief","https://www.nationaalarchief.nl"),("Delpher","https://www.delpher.nl")],
"german":[("BSB","https://www.digitale-sammlungen.de"),("Deutsche Digitale Bibliothek","https://www.deutsche-digitale-bibliothek.de")],
"italian_states":[("Internet Culturale","https://www.internetculturale.it"),("SIAS / Italian State Archives","https://sias-archivi.cultura.gov.it")],
"ottoman":[("Türkiye Devlet Arşivleri / BOA","https://katalog.devletarsivleri.gov.tr"),("İSAM Kütüphanesi","https://kutuphane.isam.org.tr"),("Internet Archive","https://archive.org")],
"north_african":[("Gallica/BnF","https://catalogue.bnf.fr"),("Archives diplomatiques France","https://archivesdiplomatiques.diplomatie.gouv.fr"),("Biblioteca Digital Hispánica","https://catalogo.bne.es")]
}
langs={"greek":["Greek","Katharevousa","English","French","Italian","Latin"],"spanish_simancas":["Spanish","Latin"],"venetian":["Italian","Venetian","Latin"],"french":["French"],"british":["English"],"dutch":["Dutch"],"german":["German","Latin"],"italian_states":["Italian","Latin"],"ottoman":["Ottoman Turkish","Turkish"],"north_african":["Arabic","Ottoman Turkish","French","Spanish","Italian"],"travellers":["French","Italian","English","Dutch","German","Spanish","Latin","Greek"]}
if lane not in cfg: raise SystemExit("Unknown PCT_RESEARCH_LANE: "+lane)
# Google results via SerpAPI plus Brave; missing keys remain explicit blockers.
if lane=='travellers':
    cfg[lane].insert(0,("Public Web Source Discovery","https://serpapi.com/search.json"))
terms=[ctx["target"]]+ctx["aliases"]
ident=identity(req,ctx)
specialists=specialist_plan(ctx["target"],ctx["purpose"],ctx["date_range"],ctx["aliases"],ident["type"] if ident["type"] in ("place","person","event") else "all")
queries=discovery_queries(ident)+expand_queries(lane,ctx["target"],ctx["aliases"],ctx["date_range"])
if ident['focus']['kind']=='topic':
    queries=expand_queries(lane,ctx['target'],ctx['aliases'],ctx['date_range'])
queries=list(dict.fromkeys(queries))
plan={"lane":lane,"request_file":rf.name,"target":ctx["target"],"aliases":ctx["aliases"],"date_range":ctx["date_range"],"languages":langs[lane],"target_identity":ident,"specialist_plan":specialists,"expanded_queries":queries,"repositories":[],"rule":"Search repository/catalogue with auditable multilingual event vocabulary and user-supplied historical name variants; catalogue records are leads only."}
for name,base in cfg[lane]:
    q=" ".join(terms+[ctx["date_range"]]).strip()
    plan["repositories"].append({"name":name,"base_url":base,"query_seed":q,"status":"DISCOVERY_TARGET"})
out=pathlib.Path("repository_plans");out.mkdir(exist_ok=True)
(out/f"{lane}.json").write_text(json.dumps(plan,ensure_ascii=False,indent=2),encoding="utf-8")
print("LANE",lane,"request",rf.name,"repositories",len(plan["repositories"]),"languages",",".join(plan["languages"]))

