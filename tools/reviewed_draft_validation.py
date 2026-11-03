"""Validate a verbatim reviewed-claim synthesis stage without inventing a model call."""
import hashlib
import json
from pathlib import Path

METHOD='REVIEWED_CLAIMS_VERBATIM_REQUIRES_FINAL_REVIEW'

def validate(root,analysis_root,answer,continuation_valid=True):
    failure={'valid':False,'method':answer.get('synthesis_method'),'historical_verified':False}
    if answer.get('synthesis_method')!=METHOD:return {**failure,'reason':'NOT_REVIEWED_CLAIM_DRAFT'}
    if not continuation_valid:return {**failure,'reason':'CONTINUATION_RECEIPTS_INVALID'}
    try:
        from reviewed_claim_draft import draft
        from semantic_research_answer import digest,model_claim,normalize_final_review,parse
        from research_continuation import digest as cache_digest
        def section(value):
            return {'text':value['text'],'claim_ids':value['claim_ids']}
        attempts=answer.get('final_answer_attempts') or []
        if len(attempts)!=1:raise ValueError('DIRECT_DRAFT_REQUIRES_BOUND_FINAL_ATTEMPT')
        initial=[section(s) for s in attempts[0]['sections']]
        final=[section(s) for s in answer.get('answer_sections',[])]
        if not 1<=len(initial)<=4 or not final or any(s not in initial for s in final):
            raise ValueError('ACCEPTED_TEXT_NOT_IN_DRAFT')
        claims={c['claim_id']:c for c in answer.get('claims',[])}
        supported=set((answer.get('review') or {}).get('supported_claim_ids',[]))
        ids=[s['claim_ids'][0] for s in initial if len(s['claim_ids'])==1]
        if len(ids)!=len(initial) or len(set(ids))!=len(ids) or not set(ids)<=supported:
            raise ValueError('DRAFT_CITATIONS_NOT_SUPPORTED')
        expected=draft([claims[cid] for cid in ids])
        if not expected or expected['answer_sections']!=initial:
            raise ValueError('DRAFT_IS_NOT_VERBATIM_REVIEWED_CLAIMS')
        def safe(base,name):
            base=Path(base).resolve();path=(base/name).resolve()
            if not path.is_relative_to(base) or not path.is_file():raise ValueError('REVIEW_RECEIPT_NOT_AVAILABLE')
            return path
        for call in reversed(answer.get('calls',[])):
            if call.get('role')!='adversarial_reviewer' or call.get('status')!='COMPLETED':continue
            if call.get('replayed'):
                path=safe(root,call['response_cache_path'])
                value=json.loads(path.read_text());result=value['result']
                if cache_digest(result)!=call['response_cache_sha256']:
                    raise ValueError('CACHED_REVIEW_RECEIPT_CHANGED')
            else:
                folder=Path(analysis_root)/'research_answer'
                prompt=safe(folder,call['prompt_file']);raw=prompt.read_bytes()
                if hashlib.sha256(raw).hexdigest()!=call['prompt_sha256']:raise ValueError('REVIEW_PROMPT_CHANGED')
                text=raw.decode('utf-8')
                if 'FINAL_ANSWER_JSON:\n' not in text:continue
                payload=json.loads(text.split('FINAL_ANSWER_JSON:\n',1)[1])
                if [section(s) for s in payload['sections']]!=initial:continue
                supplied={c['claim_id']:c for c in payload['claims']}
                if any(supplied.get(cid)!=model_claim(claims[cid]) for cid in ids):
                    raise ValueError('FINAL_REVIEW_CLAIMS_CHANGED')
                path=safe(folder,call['prompt_file'].replace('.prompt.txt','.json'))
                result=json.loads(path.read_text())
                if digest(result)!=call['response_sha256']:raise ValueError('FINAL_REVIEW_RECEIPT_CHANGED')
            parsed=parse(result)
            review=normalize_final_review(parsed,initial)
            # Claim-review receipts are not final-answer reviews.
            if review is None:continue
            if (result.get('status')!='COMPLETED' or review.get('flagged_sections')
                or set(review.get('supported_section_indexes',[]))!=set(range(len(initial)))
                or review!=answer.get('final_answer_review') or review!=attempts[0].get('review')):
                raise ValueError('FINAL_REVIEW_DID_NOT_SUPPORT_DRAFT')
            return {'valid':True,'method':METHOD,'model_rewrite_required':False,
                    'draft_claim_ids':ids,'final_review_receipt':str(path.relative_to(Path(root).resolve())),
                    'final_review_replayed':bool(call.get('replayed')),'historical_verified':False}
        raise ValueError('NO_BOUND_FINAL_REVIEW_RECEIPT')
    except (OSError,ValueError,KeyError,TypeError,IndexError) as error:
        return {**failure,'reason':str(error)}
