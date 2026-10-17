#!/usr/bin/env python3
"""Read-only accounting of a durable run; never promotes or removes discoveries."""
import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
from urllib.parse import urlsplit

CONTROLS=[
    {'id':'ucm-varriale-2020','url':'https://revistas.ucm.es/index.php/CHMO/article/download/70017/4564456553981',
     'doi':'10.5209/chmo.70017','source_type':'SECONDARY_STUDY',
     'locator':'printed p.92; PDF page index 11; name present in body',
     'inspection':'WEB_PDF_TEXT_INSPECTED_NOT_ARCHIVAL_ORIGINAL'},
    {'id':'cedcs-acuna-1577-edition','url':'https://www.archivodelafrontera.com/wp-content/uploads/2014/07/Acu%C3%B1a-2-enero-1577-viaje-misi%C3%B3n-secreta-a-Estambul.pdf',
     'source_type':'MODERN_DOCUMENT_EDITION',
     'locator':'printed pp.20-21; PDF page indices 19-20; name present',
     'inspection':'WEB_PDF_TEXT_INSPECTED_NOT_ARCHIVAL_ORIGINAL'},
]


def navigation_candidate(row):
    """Auditor flags known navigation, retaining the complete original row."""
    path=urlsplit(str(row.get('url') or '')).path.lower()
    repo=str(row.get('repository') or '')
    if 'Archives diplomatiques' in repo and '/search/form/' in path:return True
    if 'National Archives Public Content' in repo:
        return path.rstrip('/') in ('/help-with-your-research','/help-with-your-research/research-guides/first-world-war','/help-with-your-research/research-guides/family-history')
    if 'Internet Culturale' in repo:
        return str(row.get('title') or '').casefold() in ('home','itinerari','mostre','mappa del thesauro')
    return False


def audit(data):
    snap=data['snapshot'];rows=snap.get('discoveries',[]);coverage=snap.get('coverage',[])
    groups=defaultdict(list)
    for row in rows:
        key=row.get('url') or (str(row.get('repository'))+'|'+str(row.get('identifier')))
        groups[key].append(row)
    present=json.dumps(rows,ensure_ascii=False).casefold()
    controls=[{**c,'present_in_snapshot':c['url'].casefold() in present or bool(c.get('doi') and c['doi'].casefold() in present)} for c in CONTROLS]
    return {
        'schema':'pct-result-integrity-audit-v1','run_id':data['run_id'],
        'raw_snapshot_rows':len(rows),'unique_by_url_or_repository_identifier':len(groups),
        'duplicate_occurrences_by_that_key':len(rows)-len(groups),
        'topical_categories':dict(Counter(r.get('topical_match',{}).get('category','UNSPECIFIED') for r in rows)),
        'coverage_rows':len(coverage),'distinct_repository_labels':len({r.get('repository') for r in coverage}),
        'coverage_status_counts':dict(Counter(r.get('status','UNSPECIFIED') for r in coverage)),
        'navigation_flags':[{'lane':r.get('lane'),'title':r.get('title'),'url':r.get('url'),'repository':r.get('repository')} for r in rows if navigation_candidate(r)],
        'acquisition_observed':{lane:{'acquired_rows':len(d.get('results',[])),'held_count':d.get('held_count'),'total_candidates':d.get('total_candidates')} for lane,d in data['acquisition'].items()},
        'fulltext_queries':[{'repository':a.get('repository'),'query':q.get('query'),'hits':q.get('hits'),'status':q.get('status')} for a in data['fulltext'].get('attempts',[]) for q in a.get('queries',[])],
        'candidate_claims':len(snap.get('claims',[])),
        'positive_reference_controls':controls,
        'control_recall_is_official_metric':False,
        'limitations':[
            'Post-hoc controls are not a blind benchmark and do not establish overall recall.',
            'Repository labels include aliases; distinct labels are not a count of institutions.',
            'URL-based deduplication is conservative and does not establish source independence.',
            'Zero acquired rows is directly inspected for Greek and travellers lanes only.',
            'Navigation flags are conservative audit flags, not a complete automatic classifier.',
            'No new production run or original archival verification is represented by this audit.'
        ]
    }


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input',type=Path);parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();raw=args.input.read_bytes();result=audit(json.loads(raw))
    result['input_sha256']=hashlib.sha256(raw).hexdigest()
    args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:result[k] for k in ('run_id','raw_snapshot_rows','unique_by_url_or_repository_identifier','duplicate_occurrences_by_that_key','coverage_rows','distinct_repository_labels','topical_categories')},ensure_ascii=False))


if __name__=='__main__':main()
