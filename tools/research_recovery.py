#!/usr/bin/env python3
"""One bounded recovery wave for the travellers lane, with explicit outcome."""
import json, os, pathlib, subprocess, sys
from request_context import load_request
from research_relevance import identity

out=pathlib.Path('research_dossier');out.mkdir(exist_ok=True)
rf,req,ctx=load_request()
ident=identity(req,ctx)
events_path=pathlib.Path('event_first_hits/event_hits.json')
events=json.loads(events_path.read_text()) if events_path.exists() else {}
count=len(events.get('hits',[]))+sum(x.get('decision')=='RETAIN_CANDIDATE' for x in events.get('catalogue_leads',[]))
report={'schema':'pct-recovery-v1','request_file':rf.name,'initial_candidates':count,'executed':False,'verified':False}
if os.getenv('PCT_RESEARCH_LANE','travellers')=='travellers' and count==0 and ident.get('region_terms'):
    env={**os.environ,'PCT_RECOVERY_WAVE':'1','PCT_ACQUISITION_BUDGET_SECONDS':'240'}
    for script in ('library_source_discovery.py','route_library_candidates.py','acquire_library_candidate.py','search_acquired_ocr.py','event_first_search.py'):
        subprocess.run([sys.executable,str(pathlib.Path(__file__).parent/script)],env=env,check=True)
    after=json.loads(events_path.read_text())
    report.update(executed=True,reason='NO_EVENT_CANDIDATES_REGIONAL_SOURCE_WAVE',final_ocr_candidates=len(after.get('hits',[])),final_catalogue_candidates=sum(x.get('decision')=='RETAIN_CANDIDATE' for x in after.get('catalogue_leads',[])))
else:
    report['reason']='CANDIDATES_PRESENT' if count else 'NO_USER_SUPPLIED_REGION_OR_NON_TRAVELLERS_LANE'
(out/'recovery.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print('RECOVERY',json.dumps(report))
