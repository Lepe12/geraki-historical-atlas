"""Model-proposed short retrieval queries with execution and provenance receipts."""
import hashlib
import json
import sys
from pathlib import Path

def expand(request):
    sys.path.insert(0,str(Path(__file__).parent/'llm'))
    from llm_client import call
    prompt='''Return JSON only: {"queries":[{"lane":"registered lane","query":"short catalogue query"}]}. Propose at most 12 multilingual source-discovery queries for the supplied historical question. Queries are hypotheses, never facts or results. Use common subject and geographic terms, plus travel-book/catalogue vocabulary. Do not quote the entire question, invent personal identities, or name undocumented archive records. Use these lanes: greek, travellers, venetian, french, british, spanish_simancas, ottoman, italian_states, dutch, german, north_african. One query per lane. Keep each query under 100 characters. QUESTION_JSON: '''+json.dumps({k:request.get(k) for k in ('target','purpose','date_range')},ensure_ascii=False)
    result=call('query_expander',prompt)
    receipt={k:result.get(k) for k in ('status','provider','model','model_identity','usage','error','elapsed_seconds','finish_reason')}
    receipt['prompt_sha256']=hashlib.sha256(prompt.encode()).hexdigest()
    receipt['verified_promotion_allowed']=False
    try:data=json.loads(result.get('content',''))
    except (ValueError,TypeError):data={}
    rows=[]
    lanes={'greek','travellers','venetian','french','british','spanish_simancas','ottoman','italian_states','dutch','german','north_african'}
    for row in data.get('queries',[]) if isinstance(data,dict) and isinstance(data.get('queries'),list) else []:
        if isinstance(row,dict) and row.get('lane') in lanes and isinstance(row.get('query'),str) and 2<len(row['query'])<=140 and '\n' not in row['query'] and row['query']!=request['target']:
            rows.append({'lane':row['lane'],'query':row['query'],'status':'RETRIEVAL_HYPOTHESIS_NOT_EVIDENCE'})
    receipt['accepted_queries']=rows[:12]
    receipt['output_status']='MODEL_QUERIES_AVAILABLE' if rows else 'MODEL_QUERY_EXPANSION_FAILED'
    return receipt
