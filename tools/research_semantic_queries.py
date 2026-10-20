"""Model-proposed short retrieval queries with execution and provenance receipts."""
import hashlib
import json
import re
import sys
from pathlib import Path

def expand(request,caller=None):
    sys.path.insert(0,str(Path(__file__).parent/'llm'))
    from llm_client import call
    from research_focus import decompose
    focus=decompose(request.get('target',''),request.get('aliases',[]))
    lanes={'greek','travellers','venetian','french','british','spanish_simancas','ottoman','italian_states','dutch','german','north_african'}
    from research_response_schema import query_expansion
    schema=query_expansion(lanes)
    prompt='''Return JSON matching the supplied response schema. The queries object has one registered lane as each key and its concrete catalogue search query as the value. Generate a real query for every lane. Never return field descriptions or placeholder text. Queries are retrieval hypotheses, never historical facts or results. For a personal name or place, exact searches of supplied name variants are useful. For a thematic question use short native-language subject and geographic terms plus travel-book/catalogue vocabulary. Do not invent identities or undocumented archive records. Keep each query under 100 characters. QUESTION_JSON: '''+json.dumps({k:request.get(k) for k in ('target','purpose','date_range')},ensure_ascii=False)
    prompt+='\nSUPPLIED_NAME_OR_PLACE_VARIANTS_NOT_IDENTITY_PROOF: '+json.dumps(request.get('aliases',[]),ensure_ascii=False)
    prompt+='\nUse the catalogue language of each lane: greek=Greek; travellers/british=English; venetian/italian_states=Italian; french/north_african=French; spanish_simancas=Spanish; ottoman=Turkish; dutch=Dutch; german=German. Do not merely copy Greek prose into foreign-language lanes. Preserve genuine supplied personal names as retrieval variants, without asserting identity.'
    if focus.get('kind')=='topic':
        from research_topics import topic_queries,VOCAB
        prompt+='\nCONTROLLED_RETRIEVAL_STARTING_POINTS_NOT_HISTORICAL_FACTS: '+json.dumps({lane:topic_queries(focus,lane) for lane in VOCAB},ensure_ascii=False)
    result=caller('query_expander',prompt) if caller else call('query_expander',prompt,response_schema=schema)
    receipt={k:result.get(k) for k in ('status','provider','model','model_identity','usage','error','elapsed_seconds','finish_reason','response_schema_sha256','wire_prompt_sha256','chat_mode')}
    receipt['prompt_sha256']=hashlib.sha256(prompt.encode()).hexdigest()
    receipt['prompt_text']=prompt
    receipt['response_text']=result.get('content')
    receipt['response_sha256']=hashlib.sha256(json.dumps(result,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
    receipt['verified_promotion_allowed']=False
    try:data=json.loads(result.get('content',''))
    except (ValueError,TypeError):data={}
    rows=[];rejected=[];seen=set()
    thematic=focus.get('kind')=='topic'
    proposals=data.get('queries',[]) if isinstance(data,dict) else []
    candidates=[{'lane':lane,'query':value} for lane,value in proposals.items()] if isinstance(proposals,dict) else proposals if isinstance(proposals,list) else []
    for row in candidates:
        if not (isinstance(row,dict) and row.get('lane') in lanes and isinstance(row.get('query'),str) and 2<len(row['query'])<=100 and '\n' not in row['query'] and not (thematic and row['query']==request['target'])):
            rejected.append({'proposal':row,'reason':'INVALID_OR_OVERLONG_QUERY'});continue
        if row['query'].strip().casefold() in ('short catalogue query','short catalog query','your query','concrete query','query'):
            rejected.append({'proposal':row,'reason':'PLACEHOLDER_QUERY'});continue
        if row['lane'] in seen:
            rejected.append({'proposal':row,'reason':'DUPLICATE_LANE_QUERY'});continue
        # This is a conservative script check, not a claim to detect every
        # language. It preserves Greek personal names and mixed-script place
        # names, while rejecting all-Greek thematic prose in foreign lanes.
        if thematic and row['lane']!='greek' and re.search('[Α-Ωα-ω]',row['query']) and not re.search('[A-Za-zÀ-ž]',row['query']):
            rejected.append({'proposal':row,'reason':'GREEK_THEMATIC_PROSE_IN_FOREIGN_LANGUAGE_LANE'});continue
        seen.add(row['lane'])
        rows.append({'lane':row['lane'],'query':row['query'],'status':'RETRIEVAL_HYPOTHESIS_NOT_EVIDENCE'})
    receipt['proposed_queries']=data.get('queries',[]) if isinstance(data,dict) else []
    receipt['rejected_queries']=rejected
    receipt['accepted_queries']=rows[:12]
    receipt['lane_coverage']={'accepted_lanes':sorted(seen),'missing_lanes':sorted(lanes-seen),
                              'complete':seen==lanes,'language_check':'CONSERVATIVE_SCRIPT_CHECK_NOT_FULL_LANGUAGE_IDENTIFICATION'}
    receipt['output_status']='MODEL_QUERIES_AVAILABLE' if rows else 'MODEL_QUERY_EXPANSION_FAILED'
    return receipt

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('--request',required=True);parser.add_argument('--output',required=True)
    args=parser.parse_args();raw=Path(args.request).read_bytes();request=json.loads(raw)
    result=expand(request)
    result.update(scope='LIVE_QUERY_EXPANSION_DIAGNOSTIC_NOT_SOURCE_RESEARCH_ACCEPTANCE',
                  request_sha256=hashlib.sha256(raw).hexdigest(),request_path=args.request,
                  validation_status='PASS' if result['lane_coverage']['complete'] else 'INCOMPLETE_LANE_COVERAGE')
    destination=Path(args.output);destination.parent.mkdir(parents=True,exist_ok=True)
    destination.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'status':result['output_status'],'accepted':len(result['accepted_queries']),'rejected':len(result['rejected_queries'])}))
    if result['output_status']!='MODEL_QUERIES_AVAILABLE' or result['validation_status']!='PASS':raise SystemExit(1)
