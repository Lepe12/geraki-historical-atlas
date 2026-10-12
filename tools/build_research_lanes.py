#!/usr/bin/env python3
"""Build ten parallel source-family lanes from one general PCT research request."""
import json,pathlib,sys
sys.path.insert(0,str(pathlib.Path(__file__).parent))
from request_context import load_request
rf,req,ctx=load_request()
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
    payload={"lane":k,"label":v["label"],"source_families":v["families"],"request_file":rf.name,"research_request":req,"normalized_context":ctx,"rules":{"event_first":True,"actor_required":False,"period_adaptive":True,"historical_language_variants":True,"catalogue_is_evidence":False,"verification":"exact original page + genealogy + independent corroboration"}}
    (out/f"{k}.json").write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding="utf-8")
print("research lanes",len(lanes),"request",rf.name,",".join(lanes))
