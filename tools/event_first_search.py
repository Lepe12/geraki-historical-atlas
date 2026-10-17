#!/usr/bin/env python3
"""Request-driven contextual event discovery; raw metadata never supplies dates."""
import json, pathlib, os, re, unicodedata
from request_context import load_request
from urllib.parse import urlsplit
from research_focus import decompose
from candidate_context import assess, catalogue_assess, variants, POLICY
from section_extraction import build_findings, answer_report, render_answer

rf, req, ctx = load_request()
terms=variants(ctx['target'],ctx['aliases'])
target_kind=decompose(ctx['target'],ctx['aliases'])['kind']
years=[int(y) for y in re.findall(r'\b(?:1[0-9]{3}|20[0-9]{2})\b',ctx['date_range'])]
lo,hi=(min(years),max(years)) if years else (0,9999)
hits=[]; context_leads=[]; catalogue_leads=[]
root=pathlib.Path('library_acquisition')
for file in sorted(root.glob('*')):
    if not file.is_file() or file.suffix.lower() not in ('.txt','.xml','.html','.htm'): continue
    text=unicodedata.normalize('NFKC',file.read_text(encoding='utf-8',errors='replace'))
    for hit in assess(text,terms,lo,hi,target_kind=target_kind):
        hit.update(file=file.name,lead_type='OCR_CONTEXT')
        if hit['decision']=='RETAIN_CANDIDATE': hits.append(hit)
        else:
            hit['status']=hit['reason'];context_leads.append(hit)

path=pathlib.Path('lane_discovery')/(os.getenv('PCT_RESEARCH_LANE','travellers')+'.json')
if path.exists():
    for record in json.loads(path.read_text(encoding='utf-8')).get('results',[]):
        host=(urlsplit(str(record.get('url') or '')).hostname or '').lower()
        social=any(host==h or host.endswith('.'+h) for h in ('instagram.com','facebook.com','tiktok.com','youtube.com','linkedin.com'))
        for hit in catalogue_assess(record,terms,lo,hi,target_kind=target_kind):
            if social:
                hit['decision']='HOLD_FOR_REVIEW'
                hit['reason']='SOCIAL_POST_DISCOVERY_ONLY' 
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

section_report=build_findings(pathlib.Path('.'),ctx)
section_hits=[{**f,'lead_type':'SOURCE_SECTION'} for f in section_report['findings'] if f['decision']=='RETAIN_CANDIDATE']
# Prefer the complete, source-attributed paragraph over a legacy substring hit.
hits=[h for h in hits if not any(f['file']==h.get('file') and f['locator']['start_line']<=h.get('line',0)<=f['locator']['end_line'] for f in section_hits)]
hits.extend(section_hits)
context_leads.extend({**f,'status':f['reason'],'lead_type':'SOURCE_SECTION'} for f in section_report['findings'] if f['decision']!='RETAIN_CANDIDATE')
structured=pathlib.Path('structured_output');structured.mkdir(exist_ok=True)
(structured/'extracted_findings.json').write_text(json.dumps(section_report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
answer=answer_report(section_report)
dossier=pathlib.Path('research_dossier');dossier.mkdir(exist_ok=True)
(dossier/'answer.json').write_text(json.dumps(answer,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(dossier/'answer.md').write_text(render_answer(answer),encoding='utf-8')
hits=dedupe(hits);context_leads=dedupe(context_leads);catalogue_leads=dedupe(catalogue_leads)
report={'schema':'pct-event-first-general-v6','policy':POLICY,'request_file':rf.name,
        'target':ctx['target'],'aliases':ctx['aliases'],'date_range':[lo,hi],
        'hits':hits,'context_leads':context_leads,'catalogue_leads':catalogue_leads,
        'verification_status':'NEEDS_EVIDENCE','next_stage':'EXACT_PAGE_MAPPING_AND_ORIGINAL_INSPECTION',
        'rule':'Local context produces provisional candidates only. Names and dates are unresolved until original inspection; rejected/unresolved matches remain in context queues.'}
out=pathlib.Path('event_first_hits');out.mkdir(exist_ok=True)
(out/'event_hits.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('GENERAL EVENT-FIRST',ctx['target'],'anchored_hits',len(hits),'catalogue_leads',len(catalogue_leads),'unresolved_context_leads',len(context_leads))
