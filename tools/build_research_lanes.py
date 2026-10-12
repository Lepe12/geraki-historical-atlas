#!/usr/bin/env python3
"""Build parallel research lanes from one general PCT research request."""
import json,pathlib
reqs=list(pathlib.Path("library_discovery_requests").glob("*.json"))
if not reqs: raise SystemExit("No research request")
preferred=[p for p in reqs if "general-exact-page" in p.name or p.name.startswith("zz-")]
rf=sorted(preferred or reqs)[-1]; req=json.loads(rf.read_text(encoding="utf-8"))
lanes={
"travellers":{"label":"Mediterranean/Eastern Mediterranean travellers & contemporary literature","families":["travel accounts","itineraries","geographies","missionary","consular","gazettes","chronicles"]},
"spanish_simancas":{"label":"Spanish Monarchy / Simancas","families":["Archivo General de Simancas","state","royal","naval","diplomatic"]},
"venetian":{"label":"Venetian","families":["Archivio di Stato di Venezia","Senato","bailo","provveditori","maritime","colonial","diplomatic"]},
"french":{"label":"French","families":["Archives nationales","Archives diplomatiques","Marine","consular","provincial"]},
"british":{"label":"English/British","families":["State Papers","Admiralty","diplomatic","consular","merchant"]},
"dutch":{"label":"Dutch","families":["Nationaal Archief","States-General","admiralties","VOC","merchant"]},
"german":{"label":"German-speaking","families":["BSB","imperial","state","city","ducal","manuscript","printed"]},
"italian_states":{"label":"Italian states","families":["Genoa","Naples/Sicily","Tuscany","Papal States","Savoy","state archives","libraries"]},
"ottoman":{"label":"Ottoman","families":["imperial","provincial","naval","fiscal","diplomatic","registers","chronicles","manuscripts"]},
"north_african":{"label":"North African / Barbary","families":["Algiers","Tunis","Tripoli","Morocco","chronicles","manuscripts","consular","captivity","ransom"]}
}
out=pathlib.Path("research_lanes");out.mkdir(exist_ok=True)
for k,v in lanes.items():
 payload={"lane":k,"label":v["label"],"source_families":v["families"],"research_request":req,"rules":{"event_first":True,"actor_required":False,"period_adaptive":True,"historical_language_variants":True,"catalogue_is_evidence":False,"verification":"exact original page + genealogy + independent corroboration"}}
 (out/f"{k}.json").write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding="utf-8")
print("research lanes",len(lanes),",".join(lanes))
