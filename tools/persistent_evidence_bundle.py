"""Bridge replayed semantic proposals to the existing host-local MariaDB importer."""
import hashlib
import json
from pathlib import Path
try:from tools.historical_attestations import Attestation, Citation
except ModuleNotFoundError:from historical_attestations import Attestation, Citation


def build(answer):
    sources={};attestations=[];deferred=[]
    review=answer.get('review') or {}
    supported=set(review.get('supported_claim_ids',[]))
    flags={r['claim_id']:r for r in review.get('flagged_claims',[])}
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
            locator={k:v for k,v in occurrence['locator'].items() if k in (
                'start_char','end_char','start_line','end_line','printed_page','scan_indexes_0_based',
                'pdf_file','pdf_reference_base','offset_unit','span_semantics')}
            citations.append(Citation(sid,json.dumps(locator,sort_keys=True),claim['quote'],
                                      'stated' if claim.get('kind')=='source_statement' else 'inferred'))
        if not citations:
            deferred.append({'claim_id':claim.get('claim_id'),'reason':'DURABLE_TEXT_BINDING_MISSING'});continue
        # A mention ID preserves provenance without asserting a resolved identity.
        entity='mention:'+hashlib.sha256(claim['claim_id'].encode()).hexdigest()[:24]
        assertion={'source_statement':'SOURCE_STATEMENT','inference':'INTERPRETATION','hypothesis':'HYPOTHESIS'}[claim['kind']]
        att=Attestation(entity,assertion,claim['statement'],tuple(citations))
        decision='FLAGGED' if claim['claim_id'] in flags else 'SUPPORTED_ATTRIBUTION' if claim['claim_id'] in supported else 'NOT_DECIDED'
        attestations.append({**att.to_record(),'model_claim_id':claim['claim_id'],
                             'assertion_class':assertion,'source_classification':claim.get('source_classification','UNVERIFIED'),
                             'model_review':{'decision':decision,'flag':flags.get(claim['claim_id']),
                                             'historical_verification':False}})
    return {'schema':'nabou-persistent-evidence-bundle-v1','sources':list(sources.values()),
            'attestations':attestations,'deferred':deferred,'verified_count':0,
            'persistence_status':'STAGED_FOR_EXISTING_HOST_LOCAL_IMPORTER_NOT_DATABASE_WRITE_PROOF'}


def write(destination,answer):
    from historical_research_graph import bundle_graph
    destination=Path(destination);bundle=build(answer);graph=bundle_graph(bundle)
    bundle['graph']={k:graph[k] for k in ('entities','relations')}
    destination.write_text(json.dumps(bundle,ensure_ascii=False,indent=2)+'\n')
    destination.with_name('research_graph.jsonld').write_text(json.dumps(graph['jsonld'],ensure_ascii=False,indent=2)+'\n')
