"""Bridge replayed semantic proposals to the existing host-local MariaDB importer."""
import hashlib
import json
from pathlib import Path
try:from tools.historical_attestations import Attestation, Citation
except ModuleNotFoundError:from historical_attestations import Attestation, Citation


def build(answer):
    sources={};attestations=[];deferred=[]
    for claim in answer.get('claims',[]):
        citations=[]
        for occurrence in claim.get('source_occurrences',[]):
            path=occurrence.get('acquired_text_path');sha=occurrence.get('source_text_sha256')
            if not path or not sha:continue
            sid='src_'+hashlib.sha256((occurrence['url']+'\0'+sha).encode()).hexdigest()[:32]
            sources[sid]={'id':sid,'title':occurrence.get('title') or 'TITLE_NOT_SUPPLIED',
                          'url':occurrence['url'],'text_path':path,'text_sha256':sha,
                          'source_classification':claim.get('source_classification','UNVERIFIED'),
                          'classification_status':'PROVISIONAL_SOURCE_CRITICISM_PENDING'}
            citations.append(Citation(sid,json.dumps(occurrence['locator'],sort_keys=True),claim['quote'],
                                      'stated' if claim.get('kind')=='source_statement' else 'inferred'))
        if not citations:
            deferred.append({'claim_id':claim.get('claim_id'),'reason':'DURABLE_TEXT_BINDING_MISSING'});continue
        # A mention ID preserves provenance without asserting a resolved identity.
        entity='mention:'+hashlib.sha256(claim['claim_id'].encode()).hexdigest()[:24]
        att=Attestation(entity,claim.get('assertion_class','UNVERIFIED'),claim['statement'],tuple(citations))
        attestations.append({**att.to_record(),'model_claim_id':claim['claim_id']})
    return {'schema':'nabou-persistent-evidence-bundle-v1','sources':list(sources.values()),
            'attestations':attestations,'deferred':deferred,'verified_count':0,
            'persistence_status':'STAGED_FOR_EXISTING_HOST_LOCAL_IMPORTER_NOT_DATABASE_WRITE_PROOF'}


def write(destination,answer):
    from historical_research_graph import bundle_graph
    destination=Path(destination);bundle=build(answer);graph=bundle_graph(bundle)
    bundle['graph']={k:graph[k] for k in ('entities','relations')}
    destination.write_text(json.dumps(bundle,ensure_ascii=False,indent=2)+'\n')
    destination.with_name('research_graph.jsonld').write_text(json.dumps(graph['jsonld'],ensure_ascii=False,indent=2)+'\n')
