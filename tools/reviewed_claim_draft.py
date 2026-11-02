"""Copy currently supported claims into a bounded draft; never approve it.

Called only AFTER current source, quotation, fidelity, relevance and model claim
reviews. The existing engine's final model review and paragraph guards still run.
No translation, shortening, inference or promotion of historical status.
"""
def draft(claims):
    sections=[];seen=set()
    for claim in claims:
        statement=claim.get('statement');cid=claim.get('claim_id')
        if not isinstance(statement,str) or not statement.strip() or not isinstance(cid,str):continue
        # No clipping: an overlong claim uses the existing narrative fallback.
        if len(statement)>480:return None
        key=' '.join(statement.casefold().split())
        if key in seen:continue
        seen.add(key)
        prefix='According to the consulted source: '
        if claim.get('kind')=='hypothesis':prefix='Source conjecture (unverified): '
        elif claim.get('kind')=='inference':prefix='Provisional inference from the consulted source: '
        if claim.get('relevance_status')=='CONTEXTUAL':prefix='Background context. '+prefix
        sections.append({'text':prefix+statement,'claim_ids':[cid]})
        if len(sections)==4:break
    if not sections:return None
    return {'answer_sections':sections,'unknowns':[],
            'limitations':['This provisional answer reproduces selected reviewed claims; original-page inspection, source genealogy, corroboration and human review remain pending.']}
