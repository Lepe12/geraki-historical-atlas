#!/usr/bin/env python3
"""Request-driven contextual event discovery; raw metadata never supplies dates."""
import json, pathlib, os, re, unicodedata
from request_context import load_request
from candidate_context import assess, catalogue_assess, variants, POLICY

rf, req, ctx = load_request()
terms=variants(ctx['target'],ctx['aliases'])
years=[int(y) for y in re.findall(r'\b(?:1[0-9]{3}|20[0-9]{2})\b',ctx['date_range'])]
lo,hi=(min(years),max(years)) if years else (0,9999)
hits=[]; context_leads=[]; catalogue_leads=[]
root=pathlib.Path('library_acquisition')
for file in sorted(root.glob('*')):
    if not file.is_file() or file.suffix.lower() not in ('.txt','.xml','.html','.htm'): continue
    text=unicodedata.normalize('NFKC',file.read_text(encoding='utf-8',errors='replace'))
    for hit in assess(text,terms,lo,hi):
        hit.update(file=file.name,lead_type='OCR_CONTEXT')
        if hit['decision']=='RETAIN_CANDIDATE': hits.append(hit)
        else:
            hit['status']=hit['reason'];context_leads.append(hit)

path=pathlib.Path('lane_discovery')/(os.getenv('PCT_RESEARCH_LANE','travellers')+'.json')
if path.exists():
    for record in json.loads(path.read_text(encoding='utf-8')).get('results',[]):
        for hit in catalogue_assess(record,terms,lo,hi):
            hit.update(repository=record.get('discovery_repository'),identifier=record.get('identifier'),
                       url=record.get('url'),title=record.get('title'),lead_type='CATALOGUE_METADATA',
                       verification_status='NOT_ORIGINAL_VERIFIED',
                       status='CATALOGUE_METADATA_LEAD' if hit['decision']=='RETAIN_CANDIDATE' else hit['reason'])
            catalogue_leads.append(hit)

def dedupe(items):
    output={}
    for item in items:
        key=(item.get('file'),item.get('repository'),item.get('identifier'),item['place_match'].casefold(),
             tuple(item['years_in_scope']),item.get('status'),item['context_excerpt'])
        if key in output: output[key]['occurrence_count']+=1
        else: output[key]={**item,'occurrence_count':1}
    return list(output.values())

hits=dedupe(hits);context_leads=dedupe(context_leads);catalogue_leads=dedupe(catalogue_leads)
report={'schema':'pct-event-first-general-v6','policy':POLICY,'request_file':rf.name,
        'target':ctx['target'],'aliases':ctx['aliases'],'date_range':[lo,hi],
        'hits':hits,'context_leads':context_leads,'catalogue_leads':catalogue_leads,
        'verification_status':'NEEDS_EVIDENCE','next_stage':'EXACT_PAGE_MAPPING_AND_ORIGINAL_INSPECTION',
        'rule':'Local context produces provisional candidates only. Names and dates are unresolved until original inspection; rejected/unresolved matches remain in context queues.'}
out=pathlib.Path('event_first_hits');out.mkdir(exist_ok=True)
(out/'event_hits.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('GENERAL EVENT-FIRST',ctx['target'],'anchored_hits',len(hits),'catalogue_leads',len(catalogue_leads),'unresolved_context_leads',len(context_leads))
