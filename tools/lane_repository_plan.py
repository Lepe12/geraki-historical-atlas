#!/usr/bin/env python3
"""Repository-aware discovery plan for each PCT parallel research lane."""
import os,json,pathlib,urllib.parse
lane=os.getenv("PCT_RESEARCH_LANE","travellers")
reqs=list(pathlib.Path("library_discovery_requests").glob("*.json"))
preferred=[p for p in reqs if p.name.startswith("zz-")]
rf=sorted(preferred or reqs)[-1]; req=json.loads(rf.read_text(encoding="utf-8"))
target=req.get("target",""); aliases=req.get("aliases",[]); dates=req.get("date_range","")
cfg={
"travellers":[("Gallica/BnF","https://gallica.bnf.fr"),("BSB","https://www.digitale-sammlungen.de"),("Internet Archive","https://archive.org"),("Google Books","https://books.google.com")],
"spanish_simancas":[("PARES / Archivo General de Simancas","https://pares.cultura.gob.es"),("Biblioteca Digital Hispánica","https://bdh.bne.es")],
"venetian":[("Archivio di Stato di Venezia / SIAS","https://sias.archivi.beniculturali.it"),("Internet Culturale","https://www.internetculturale.it")],
"french":[("Archives nationales","https://www.archives-nationales.culture.gouv.fr"),("Archives diplomatiques","https://archivesdiplomatiques.diplomatie.gouv.fr"),("Gallica/BnF","https://gallica.bnf.fr")],
"british":[("The National Archives Discovery","https://discovery.nationalarchives.gov.uk"),("British Library","https://www.bl.uk")],
"dutch":[("Nationaal Archief","https://www.nationaalarchief.nl"),("Delpher","https://www.delpher.nl")],
"german":[("BSB","https://www.digitale-sammlungen.de"),("Deutsche Digitale Bibliothek","https://www.deutsche-digitale-bibliothek.de")],
"italian_states":[("Internet Culturale","https://www.internetculturale.it"),("SIAS / Italian State Archives","https://sias.archivi.beniculturali.it")],
"ottoman":[("Türkiye Devlet Arşivleri / BOA","https://www.devletarsivleri.gov.tr"),("İSAM Kütüphanesi","https://ktp.isam.org.tr")],
"north_african":[("Gallica/BnF","https://gallica.bnf.fr"),("Archives diplomatiques France","https://archivesdiplomatiques.diplomatie.gouv.fr"),("Biblioteca Digital Hispánica","https://bdh.bne.es")]
}
langs={"spanish_simancas":["Spanish","Latin"],"venetian":["Italian","Venetian","Latin"],"french":["French"],"british":["English"],"dutch":["Dutch"],"german":["German","Latin"],"italian_states":["Italian","Latin"],"ottoman":["Ottoman Turkish","Turkish"],"north_african":["Arabic","Ottoman Turkish","French","Spanish","Italian"],"travellers":["French","Italian","English","Dutch","German","Spanish","Latin","Greek"]}
terms=[target]+list(aliases)
plan={"lane":lane,"target":target,"date_range":dates,"languages":langs[lane],"repositories":[],"rule":"Search repository/catalogue in its own language and historical variants; acquire digital originals where technically available; catalogue records are leads only."}
for name,base in cfg[lane]:
 q=" ".join(terms+[str(dates)])
 plan["repositories"].append({"name":name,"base_url":base,"query_seed":q,"status":"DISCOVERY_TARGET"})
out=pathlib.Path("repository_plans");out.mkdir(exist_ok=True)
(out/f"{lane}.json").write_text(json.dumps(plan,ensure_ascii=False,indent=2),encoding="utf-8")
print("LANE",lane,"repositories",len(plan["repositories"]),"languages",",".join(plan["languages"]))
