"""Export source-constrained place findings, keeping unresolved identities null."""
def build(answer):
    records={r['evidence_id']:r for r in answer.get('evidence',[])}
    supported=set((answer.get('review') or {}).get('supported_claim_ids',[]))
    flagged={r['claim_id'] for r in (answer.get('review') or {}).get('flagged_claims',[])}
    findings=[]
    for claim in answer.get('claims',[]):
        if claim.get('claim_id') not in supported or claim['claim_id'] in flagged:
            continue
        evidence=records.get(claim.get('evidence_id'),{})
        for place in claim.get('places',[]):
            if place not in claim.get('quote',''):
                continue
            findings.append({'finding_id':claim['claim_id']+':'+str(len(findings)),
                'historical_toponym':place,'modern_identification':None,'coordinates':None,
                'date':claim.get('dates') or None,'users':claim.get('actors') or [],
                'usage_type':claim.get('usage_type','UNRESOLVED'),
                'source_statement':claim['statement'],'assertion_class':claim.get('assertion_class','UNVERIFIED'),
                'source_classification':claim.get('source_classification','UNVERIFIED'),
                'classification_status':claim.get('classification_status','UNVERIFIED'),
                'exact_source':claim.get('source_occurrences',[]),
                'page_folio_archival_reference':[{'title':s.get('title'),'url':s.get('url'),
                     'printed_page':(s.get('locator') or {}).get('printed_page'),
                     'pdf_scan_indexes_0_based':(s.get('locator') or {}).get('scan_indexes_0_based',[]),
                     'text_locator':s.get('locator'),
                     'mediated_archival_reference':s.get('reported_archival_reference')}
                    for s in claim.get('source_occurrences',[])],
                'excerpt':claim['quote'],'excerpt_type':'ACQUIRED_TEXT_NOT_ORIGINAL_INSPECTION',
                'confidence':{'level':'Guessing','basis':'MODEL_REVIEWED_SOURCE_PASSAGE; HISTORICAL_IDENTITY_AND_BASE_USAGE_UNVERIFIED'},
                'verification_status':'UNVERIFIED','verified':False,
                'missing':['MODERN_IDENTIFICATION_NOT_ESTABLISHED','COORDINATES_NOT_ESTABLISHED',
                           'ORIGINAL_INSPECTION_PENDING','SOURCE_GENEALOGY_PENDING']+
                           (['EVENT_DATE_UNRESOLVED'] if not claim.get('dates') else [])+
                           (['BASE_USAGE_UNRESOLVED'] if claim.get('usage_type','UNRESOLVED')=='UNRESOLVED' else [])})
    return {'schema':'nabou-geographic-findings-v1','question':answer.get('question'),'findings':findings,
            'candidate_findings':len(findings),'verified':0,
            'rule':'A place mentioned in a source is not automatically a pirate base. Null fields are unresolved; model review is not historical verification.'}
