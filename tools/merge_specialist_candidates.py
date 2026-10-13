#!/usr/bin/env python3
"""Feed registered specialist discoveries back into the travellers pipeline."""
import json,pathlib,os
lane=os.getenv('PCT_RESEARCH_LANE','travellers')
if lane!='travellers': raise SystemExit(0)
path=pathlib.Path('lane_discovery')/(lane+'.json')
data=json.loads(path.read_text())
seen={(str(x.get('discovery_repository')),str(x.get('identifier') or x.get('url') or x.get('title'))) for x in data.get('results',[])}
added=0
files=list(pathlib.Path('specialist_sources').rglob('result.json'))
if not files:
    data.setdefault('attempts',[]).append({'repository':'Specialist research','status':'UNEXECUTED','detail':'No specialist result artifact available'})
for file in files:
    specialist=json.loads(file.read_text())
    for run in specialist.get('search_runs',[]):
        for record in run.get('records',[]) or []:
            if not isinstance(record,dict):continue
            record={**record,'identifier':record.get('identifier') or record.get('id') or record.get('record_id') or record.get('fran_ir'),'title':record.get('title') or record.get('titre') or record.get('intitulé'),'url':record.get('url') or record.get('record_url') or record.get('url_slv'),'date':record.get('date') or record.get('dates'),'description':record.get('description') or record.get('intitulé'),'archival_reference':record.get('archival_reference') or record.get('cotes')}
            item={**record,'discovery_repository':record.get('repository') or run.get('repository') or run.get('connector_id'),'discovery_lane':lane,'specialist_agent':specialist.get('agent_id'),'connector_status':run.get('status'),'identifier':record.get('identifier') or record.get('id'),'url':record.get('url') or record.get('record_url'),'original_inspected':False,'verified':False}
            key=(str(item['discovery_repository']),str(item.get('identifier') or item.get('url') or item.get('title')))
            if key not in seen:
                seen.add(key);data.setdefault('results',[]).append(item);added+=1
        data.setdefault('attempts',[]).append({'repository':run.get('repository') or run.get('connector_id') or 'SPECIALIST_UNKNOWN','status':run.get('status','UNRESOLVED'),'specialist_agent':specialist.get('agent_id'),'queries':[{'query':run.get('query'),'status':run.get('status'),'hits':len(run.get('records',[]) or [])}],'hits':len(run.get('records',[]) or [])})
data['specialist_records_added']=added
path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print('SPECIALIST RECORDS MERGED',added)
