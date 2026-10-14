"""Conservative, request-driven discovery triage. Never verifies historical claims."""
import hashlib
import json
import re
import unicodedata


def norm(value):
    if isinstance(value, (dict, list)):
        value = json.dumps(value, ensure_ascii=False)
    return ''.join(c for c in unicodedata.normalize('NFKD', str(value or '')) if not unicodedata.combining(c)).casefold()


def contains(text, term):
    return bool(re.search(r'(?<!\w)' + re.escape(norm(term)) + r'(?!\w)', norm(text)))


def identity(req, ctx):
    supplied = req.get('target_context') or {}
    if not isinstance(supplied, dict):
        raise ValueError('TARGET_CONTEXT_MUST_BE_OBJECT')
    regions = supplied.get('region_terms', [])
    if not isinstance(regions, list) or any(not isinstance(x, str) for x in regions):
        raise ValueError('REGION_TERMS_MUST_BE_STRINGS')
    kind = supplied.get('type') or ('place' if re.search(r'\bisland\b|\bharbou?r\b|\bport\b|νησ', norm(ctx.get('purpose'))) else 'unknown')
    return {'target': ctx['target'], 'aliases': ctx.get('aliases', []), 'type': kind,
            'region_terms': regions, 'date_range': ctx.get('date_range', ''),
            'rule': 'User-supplied geographic context is a search constraint, not source evidence.'}


HISTORY = re.compile(r'(?<!\w)(?:voyag|travel|reise|viaggio|relation\b|itinerar|geograph|histor|histoire|storia|chronicle|memoir|περιηγ|ιστορι|ναυτι|navigation|diplomat|consul|pirat|corsair|corsar|ransom|captiv|portolan)')
GEO = re.compile(r'\bisland\b|\bisle\b|\bisola\b|\binsel\b|νησ|cyclad|aegean|egee|archipel|greece|grece|grecia|ελλα|harbour|harbor')
OFF_TOPIC = re.compile(r'(?<!\w)(?:respirat|toxicolog|epidemiolog|mortality|morbidity|hadronic|butterflies|moths|soundtrack|milkshake schedule|cia reading room|proceedings of.*physics)')
NOISE = re.compile(r'quintet|symphon|zeitschrift.{0,12}musik|musical|coleoptera|scolytinae|favorites$|\bpodcast\b|\blivestream\b|\btv\b|\byoutube\b')


def _clamp(value):
    return max(0, min(100, int(round(value))))


def _label(score, bands):
    for threshold, label in bands:
        if score >= threshold:
            return label
    return bands[-1][1]


def retention_contract(triage_status):
    if triage_status == 'PRIORITY':
        acquisition = 'AUTO_ACQUIRE_ELIGIBLE'
    elif triage_status == 'EXCLUDE_FROM_ACQUISITION':
        acquisition = 'DO_NOT_AUTO_ACQUIRE'
    else:
        acquisition = 'HOLD_FOR_REVIEW'
    return {
        'retention_status': 'RETAINED_RESEARCH_DISCOVERY',
        'visible_in_research_discovery': True,
        'discard_allowed': False,
        'triage_status': triage_status,
        'acquisition_disposition': acquisition,
        'rule': 'Scientific triage may change automation priority but must not delete or hide the discovery.'
    }


def evidence_confidence(record):
    """Evidence maturity score, not a probability that a historical claim is true."""
    if bool(record.get('verified')):
        return {
            'score':100,'label':'VERIFIED','scale':'0-100','is_probability':False,
            'reasons':['FINAL_VERIFICATION_RECORDED'],
            'meaning':'Maturity and traceability of evidence for claim use; not probability of historical truth.'
        }
    score=0;reasons=[]
    if record.get('identifier') or record.get('url') or record.get('source_file'):
        score+=5;reasons.append('TRACEABLE_SOURCE_POINTER')
    if record.get('connector_status') == 'EXECUTED':
        score+=5;reasons.append('DISCOVERY_EXECUTION_RECORDED')
    source_type=str(record.get('source_type') or '').upper()
    if source_type in ('PRIMARY','PRIMARY_ORIGINAL'):
        score+=15;reasons.append('PRIMARY_SOURCE_CLASSIFICATION')
    elif source_type in ('CONTEMPORARY_PRINTED','PRIMARY_FACSIMILE'):
        score+=10;reasons.append('CONTEMPORARY_OR_FACSIMILE_CLASSIFICATION')
    elif source_type in ('SECONDARY','CATALOGUE_METADATA','OCR_CONTEXT'):
        score+=3;reasons.append('DISCOVERY_OR_SECONDARY_MATERIAL')
    locators=record.get('exact_page_candidates') or []
    exact=any(isinstance(x,dict) and x.get('printed_page') is not None and
              (x.get('leaf') is not None or x.get('canvas_id') or x.get('image_file')) for x in locators)
    if exact:
        score+=15;reasons.append('EXACT_LOCATOR_MAPPED')
    if bool(record.get('original_inspected')):
        score+=25;reasons.append('ORIGINAL_INSPECTED')
    if record.get('source_says') or record.get('controlled_transcription') or record.get('original_quote'):
        score+=15;reasons.append('CONTROLLED_EXTRACTION_RECORDED')
    if bool(record.get('genealogy_checked')):
        score+=10;reasons.append('SOURCE_GENEALOGY_ASSESSED')
    if bool(record.get('corroborated')):
        score+=10;reasons.append('CORROBORATION_RECORDED')
    if str(record.get('human_review_status') or '').upper() in ('HUMAN_REVIEWED','ACCEPT','ACCEPTED'):
        score+=10;reasons.append('HUMAN_REVIEW_ACCEPTED')
    score=_clamp(score)
    if (record.get('evidence_level') in ('SECONDARY_DISCOVERY_ONLY','PUBLIC_REPOSITORY_DISCOVERY_ONLY')
            or str(record.get('verification_status') or '').upper() == 'UNVERIFIED_DISCOVERY'):
        if not record.get('original_inspected'):
            score=min(score,20);reasons.append('DISCOVERY_ONLY_CAP')
    return {
        'score':score,
        'label':_label(score,[(85,'VERY_STRONG'),(65,'STRONG'),(40,'DEVELOPING'),(20,'PRELIMINARY'),(0,'DISCOVERY_ONLY')]),
        'scale':'0-100','is_probability':False,'reasons':reasons,
        'meaning':'Maturity and traceability of evidence for claim use; not probability of historical truth.'
    }


def candidate_research_value(record, base=40):
    score=base;reasons=[]
    if record.get('context_excerpt'):
        score+=15;reasons.append('CONTEXT_AVAILABLE')
    if record.get('event_terms'):
        score+=min(15,5*len(record.get('event_terms') or []));reasons.append('EVENT_VOCABULARY_MATCH')
    date=record.get('date')
    if isinstance(date,dict) and (date.get('normalized_year') is not None or date.get('normalized_range')):
        score+=10;reasons.append('DATE_CONTEXT_RESOLVED')
    if record.get('exact_page_candidates'):
        score+=10;reasons.append('EXACT_PAGE_LEAD_AVAILABLE')
    if record.get('source_says') or record.get('controlled_transcription') or record.get('original_quote'):
        score+=15;reasons.append('DIRECT_TEXT_AVAILABLE')
    score=_clamp(score)
    return {
        'score':score,'label':_label(score,[(80,'HIGH'),(55,'MEDIUM'),(0,'LOW')]),
        'scale':'0-100','is_probability':False,'reasons':reasons,
        'meaning':'Usefulness for further historical research; independent from evidential strength.'
    }


def assess(record, ident):
    title = norm(record.get('title'))
    context = ' '.join(norm(record.get(k)) for k in ('title','description','subject','context_excerpt'))
    names = [ident['target'], *ident.get('aliases', [])]
    name_match = any(contains(context, n) for n in names if n)
    regional = any(contains(context, n) for n in ident.get('region_terms', []) if n)
    history = bool(HISTORY.search(context))
    geographic = bool(GEO.search(context)) or regional
    reasons=[];score=0
    if name_match: score+=4;reasons.append('NAME_IN_SOURCE_METADATA')
    if geographic: score+=4;reasons.append('GEOGRAPHIC_CONTEXT')
    if history: score+=4;reasons.append('HISTORICAL_OR_DOCUMENTARY_CONTEXT')
    date_text=norm(record.get('year') or record.get('date'))
    publication_years=[int(x) for x in re.findall(r'\b(1\d{3}|20\d{2})\b',date_text)]
    requested=[int(x) for x in re.findall(r'\b(1\d{3}|20\d{2})\b',ident.get('date_range',''))]
    near_period=bool(publication_years and requested and min(requested)-100 <= min(publication_years) <= max(requested)+100)
    if near_period:
        score+=20;reasons.append('NEAR_PERIOD_PUBLICATION_NOT_EVENT_DATE')
    if OFF_TOPIC.search(title):
        status='REVIEW_REQUIRED';reasons.append('EXPLICIT_OTHER_DISCIPLINE_OR_MODERN_CORPUS')
    elif NOISE.search(title) and not (geographic and history):
        status='EXCLUDE_FROM_ACQUISITION';reasons.append('EXPLICIT_TOPIC_COLLISION')
    elif record.get('mediatype') and record['mediatype'] not in ('texts',):
        status='REVIEW_REQUIRED';reasons.append('NON_TEXT_OBJECT')
    elif ident.get('type') == 'place':
        if (name_match or regional) and geographic and history: status='PRIORITY'
        else: status='REVIEW_REQUIRED';reasons.append('PLACE_IDENTITY_UNRESOLVED')
    elif name_match and history: status='PRIORITY'
    else: status='REVIEW_REQUIRED';reasons.append('CONTEXT_UNRESOLVED')

    research_score=5 if (record.get('title') or record.get('identifier') or record.get('url')) else 0
    rv_reasons=[]
    if name_match: research_score+=30;rv_reasons.append('TARGET_NAME_MATCH')
    if geographic: research_score+=20;rv_reasons.append('GEOGRAPHIC_CONTEXT')
    if history: research_score+=25;rv_reasons.append('HISTORICAL_CONTEXT')
    if near_period: research_score+=15;rv_reasons.append('NEAR_PERIOD_PUBLICATION')
    if record.get('source_lead'): research_score+=10;rv_reasons.append('RESEARCHER_SUPPLIED_LEAD')
    if OFF_TOPIC.search(title): research_score-=25;rv_reasons.append('OFF_TOPIC_PENALTY')
    if NOISE.search(title) and not (geographic and history): research_score-=35;rv_reasons.append('TOPIC_COLLISION_PENALTY')
    research_score=_clamp(research_score)

    return {
        'status':status,'score':score,'reasons':reasons,
        'identity_status':'POSSIBLE_MATCH' if name_match else 'REGIONAL_CONTEXT' if regional else 'UNRESOLVED',
        'research_value':{
            'score':research_score,'label':_label(research_score,[(80,'HIGH'),(55,'MEDIUM'),(0,'LOW')]),
            'scale':'0-100','is_probability':False,'reasons':rv_reasons,
            'meaning':'Usefulness for further research; not evidential strength.'
        },
        'evidence_confidence':evidence_confidence(record),
        'retention':retention_contract(status),
        'verified':False
    }


def rank(records, ident):
    assessed=[{**x,'relevance_assessment':assess(x,ident)} for x in records]
    return sorted(assessed,key=lambda x:(-x['relevance_assessment']['research_value']['score'],
                                         -x['relevance_assessment']['score']))


def discovery_queries(ident, recovery=False):
    names=list(dict.fromkeys([ident['target'],*ident.get('aliases',[])]));queries=[]
    if recovery and ident.get('region_terms'):
        for region in ident['region_terms'][:4]:
            for genre in ('voyage','travel','description'):
                queries.append(f'"{region}" {genre}')
    else:
        for genre in ('island' if ident.get('type') == 'place' else 'history','voyage','corsair'):
            queries += [f'"{n}" {genre}' for n in names if n]
        queries += [f'"{n}"' for n in names if n]
    return list(dict.fromkeys(queries))


def request_digest(req, ctx):
    payload={**ctx,'target_context':req.get('target_context',{})}
    return hashlib.sha256(json.dumps(payload,ensure_ascii=False,sort_keys=True).encode()).hexdigest()
