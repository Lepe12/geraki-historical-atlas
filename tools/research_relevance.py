"""Conservative, request-driven discovery triage. Never verifies historical claims."""
import hashlib
import json
import re
import unicodedata
from research_focus import decompose, focused_queries, fold, name_pattern, topical_match
from fulltext_discovery import text_match


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
    focus=decompose(ctx['target'],ctx.get('aliases', []),ctx.get('purpose',''),kind,regions)
    return {'target': ctx['target'], 'aliases': ctx.get('aliases', []), 'type': focus['kind'], 'focus':focus,
            'region_terms': regions, 'date_range': ctx.get('date_range', ''),
            'rule': 'User-supplied geographic context is a search constraint, not source evidence.'}


HISTORY = re.compile(r'(?<!\w)(?:voyag|travel|reise|viaggio|relation\b|itinerar|geograph|histor|histoire|storia|chronicle|memoir|περιηγ|ιστορι|ναυτι|navigation|diplomat|consul|pirat|corsair|corsar|ransom|captiv|portolan)')
GEO = re.compile(r'\bisland\b|\bisle\b|\bisola\b|\binsel\b|νησ|cyclad|aegean|egee|archipel|greece|grece|grecia|ελλα|harbour|harbor')
OFF_TOPIC = re.compile(r'(?<!\w)(?:respirat|toxicolog|epidemiolog|mortality|morbidity|hadronic|butterflies|moths|soundtrack|milkshake schedule|cia reading room|proceedings of.*physics)')
NOISE = re.compile(r'quintet|symphon|zeitschrift.{0,12}musik|musical|coleoptera|scolytinae|favorites$|\bpodcast\b|\blivestream\b|\btv\b|\byoutube\b')
MODERN_DOCUMENT = re.compile(r'curriculum\s+vitae|codice\s+etico|code\s+of\s+ethics|general.part.model|statistical\s+bulletin|στατιστικ\w*\s+δελτι')


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


def evidence_class(record, topical):
    """Separate a source report from a search hypothesis. Never confirms it."""
    reason=str((topical or {}).get('reason') or '')
    if (topical or {}).get('query_hypothesis') or 'HYPOTHESIS' in reason or reason=='TRANSLITERATION_REQUIRES_IDENTITY_REVIEW':
        return {'class':'HYPOTHESIS','category':'SEARCH_HYPOTHESIS','confirmed':False,
                'basis':'MECHANICAL_QUERY_HYPOTHESIS_NOT_ATTESTED_IDENTITY'}
    source=str(record.get('historical_source_type') or record.get('source_type') or '').upper()
    if source in ('PRIMARY','PRIMARY_ORIGINAL','PRIMARY_FACSIMILE','CONTEMPORARY_PRINTED'):
        return {'class':'PRIMARY_SOURCE','category':'PRIMARY_SOURCE_REPORTED','confirmed':False,
                'basis':'EXPLICIT_UPSTREAM_CLASSIFICATION'}
    if source in ('SECONDARY','SECONDARY_STUDY'):
        return {'class':'SECONDARY_STUDY','category':'SECONDARY_STUDY_REPORTED','confirmed':False,
                'basis':'EXPLICIT_UPSTREAM_CLASSIFICATION'}
    text=' '.join(norm(record.get(k)) for k in ('title','description','subject','context_excerpt'))
    if re.search(r'(?<!\w)(?:μελετ\w*|βιογραφ\w*|διατριβ\w*|monograph\w*|biograph\w*|thesis|journal)\b', text):
        return {'class':'SECONDARY_STUDY','category':'SECONDARY_STUDY_REPORTED','confirmed':False,
                'basis':'SCHOLARLY_FORM_UNCONFIRMED'}
    if re.search(r'(?<!\w)(?:επιστολ\w*|αυτογραφ\w*|αρχειακ\w*|dispatch\w*|dispacci|manoscrit\w*|letters?)\b', text):
        return {'class':'PRIMARY_SOURCE','category':'PRIMARY_SOURCE_REPORTED','confirmed':False,
                'basis':'DOCUMENTARY_FORM_UNCONFIRMED'}
    return {'class':'UNCLASSIFIED','category':'UNCLASSIFIED','confirmed':False,
            'basis':'CONTENT_ASSESSMENT_REQUIRED'}


GLUED_TEMPORAL_YEAR = re.compile(r"(?:(?<![\w])|(?<=['’]))(?:an|anno|ano|ann[eé]e|en|in|nel|year)(1\d{3}|20\d{2})(?!\w)")


def contextual_years(text):
    """Possible years, excluding explicit addresses, identifiers and page numbers.

    This is a lexical guard, never a claim that a surviving number dates an event.
    The acquired quotation and its offsets must remain unchanged.
    """
    value = fold(str(text))
    years = []
    # OCR often glues a year to its temporal preposition ("l'an1680",
    # "anno1680", "in1680"). Only these short temporal words are accepted as a
    # glued prefix; any other letter-glued number stays excluded.
    for match in GLUED_TEMPORAL_YEAR.finditer(value):
        years.append(int(match.group(1)))
    for match in re.finditer(r'(?<![\w.])(1\d{3}|20\d{2})(?!\w)', value):
        prefix = value[max(0, match.start()-160):match.start()]
        temporal=bool(re.search(r'\b(?:in|nel|nell.anno|anno|year|το|ετος|en el ano)\s*$', prefix))
        if not temporal and re.search(r'(?:\bdomicili\w*|\baddress|\bοδ[οω]\w*|\bstreet|\bstrasse|\brue|\bvia)\b[^.;\n]{0,120}$', prefix.replace('\n', ' ')):
            continue
        if re.search(r'(?:\bpp?\.|\bpages?\s+|\bσελ\.|\bσσ?\.|\bfol(?:io)?\.?\s+|\blegajo\s+|\bexpediente\s+|\bregistro\s+|\bno\.?\s+|\bn[º°]\s*)\s*$', prefix):
            continue
        if re.search(r'(?:\bpublished|\bpublication|\bεκδοση|\bedition)\s*(?:in\s+|:)?\s*$', prefix):
            continue
        years.append(int(match.group(1)))
    return sorted(set(years))


def later_namesake_requires_review(text, focus):
    """A later Latin namesake is not the supplied Greek person without review."""
    greek=[name for name in focus.get('names',[]) if re.search(r'[α-ω]', fold(name))]
    if not greek:
        return False
    folded=fold(text)
    for name in greek:
        words=name.split()
        if len(words)>=2 and re.search(name_pattern(words), folded):
            return False
    years=contextual_years(text)
    # An OCR error such as 1370 beside an explicitly modern corporate record
    # cannot establish a Renaissance identity. Keep the record for review.
    corporate=bool(re.search(r'\b(?:sociedad\s+anonima|accionistas|dividendos|shareholders|ανωνυμη\s+εταιρεια)\b', folded))
    if corporate and any(1900<=year<=2099 for year in years):
        return True
    return bool(years) and any(1750<=year<=2099 for year in years) and not any(year<=1700 for year in years)


def assess(record, ident):
    title = norm(record.get('title'))
    context = ' '.join(norm(record.get(k)) for k in ('title','description','subject','context_excerpt'))
    names = [ident['target'], *ident.get('aliases', [])]
    focus=ident.get('focus') or decompose(ident['target'],ident.get('aliases',[]),kind=ident.get('type','unknown'),regions=ident.get('region_terms',[]))
    metadata_record={k:record[k] for k in ('title','description','subject') if k in record} if record.get('fulltext_hit') else record
    topical=topical_match(metadata_record,focus)
    fulltext_match=text_match(record,focus) if record.get('fulltext_hit') else None
    # A provisional OCR hit cannot weaken an independently matching catalogue entry.
    if fulltext_match and topical['category']!='TARGET_MATCH':topical=fulltext_match
    name_match = topical['category']=='TARGET_MATCH'
    regional = any(contains(context, n) for n in ident.get('region_terms', []) if n)
    history = bool(HISTORY.search(context))
    geographic = bool(GEO.search(context)) or regional
    if focus['kind']=='topic':
        geographic=geographic or bool(topical.get('places'))
        history=history or bool(topical.get('topic_event_present') and topical.get('places'))
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
    elif focus['kind'] == 'topic':
        if topical['category'] in ('TARGET_MATCH','POSSIBLE_TARGET') and history:
            status='PRIORITY';reasons.append('THEMATIC_SOURCE_FOR_PASSAGE_INSPECTION')
        else:
            status='REVIEW_REQUIRED';reasons.append('THEMATIC_RELEVANCE_UNRESOLVED')
    elif ident.get('type') == 'place':
        if (name_match or regional) and geographic and history: status='PRIORITY'
        else: status='REVIEW_REQUIRED';reasons.append('PLACE_IDENTITY_UNRESOLVED')
    elif name_match and (history or (focus['kind']=='person' and topical.get('matched_field') in ('title','description','subject'))):
        status='PRIORITY';reasons.append('EXPLICIT_SUBJECT_NAME_ACQUISITION_NOT_VERIFICATION')
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
    # Generic maritime/history vocabulary is useful context, not an answer about
    # a named person. Keep every discovery but prevent it outranking name hits.
    if focus['kind']=='person':
        if topical['category']=='POSSIBLE_TARGET':
            status='REVIEW_REQUIRED';research_score=min(65,max(45,research_score));reasons.append('SURNAME_CONTEXT_REQUIRES_IDENTITY_REVIEW')
        elif not name_match:
            status='EXCLUDE_FROM_ACQUISITION';research_score=min(research_score,20)
            reasons.append('NO_TARGET_IDENTITY_MATCH')
    if fulltext_match:
        missing_context=fulltext_match['reason']=='FULLTEXT_NAME_WITHOUT_REQUEST_CONTEXT'
        if fulltext_match['reason']=='FULLTEXT_EXTENDED_NAME_REQUIRES_REVIEW' and topical['category']!='TARGET_MATCH':
            status='REVIEW_REQUIRED';research_score=min(research_score,65)
            reasons.append('EXTENDED_NAME_REQUIRES_IDENTITY_REVIEW')
        elif missing_context and topical['category']!='TARGET_MATCH':
            status='REVIEW_REQUIRED';research_score=min(research_score,65)
            reasons.append('FULLTEXT_NAME_WITHOUT_REQUEST_CONTEXT')
        elif not OFF_TOPIC.search(title) and not (NOISE.search(title) and not (geographic and history)):
            status='PRIORITY';research_score=max(research_score,70)
            reasons.append('FULLTEXT_CONTEXT_REQUIRES_IDENTITY_REVIEW')

    # A later page of the same chapter as a page that prints the attested full
    # name usually carries only the surname. Acquire it as a provisional lead;
    # the modern-document, namesake and admissibility gates below still apply.
    continuation=record.get('section_continuation')
    if (focus['kind']=='person' and isinstance(continuation,dict) and continuation.get('anchor_canvas')
            and continuation.get('manifest_url')==record.get('manifest_url')
            and ('NO_TARGET_IDENTITY_MATCH' in reasons or 'SURNAME_CONTEXT_REQUIRES_IDENTITY_REVIEW' in reasons)
            and not OFF_TOPIC.search(title) and not (NOISE.search(title) and not (geographic and history))
            and not MODERN_DOCUMENT.search(title) and not later_namesake_requires_review(context, focus)):
        status='PRIORITY';research_score=max(research_score,60)
        reasons.append('SECTION_CONTINUATION_OF_NAMED_PAGE_REQUIRES_IDENTITY_REVIEW')
    # A search-index hit or generic "history" token cannot make corporate,
    # statistical or CV material a priority biography. Keep the lead visible.
    if MODERN_DOCUMENT.search(title) and not name_match:
        status='EXCLUDE_FROM_ACQUISITION';research_score=min(research_score,20)
        reasons.append('UNRELATED_MODERN_DOCUMENT')
    if later_namesake_requires_review(context, focus):
        if status=='PRIORITY':
            status='REVIEW_REQUIRED'
        reasons.append('LATER_NAMESAKE_REQUIRES_IDENTITY_REVIEW')
    from historical_source_admissibility import hold_reason
    source_hold=hold_reason(record)
    if source_hold:
        status='EXCLUDE_FROM_ACQUISITION';research_score=min(research_score,20)
        reasons.append(source_hold)

    return {
        'status':status,'score':score,'reasons':reasons,
        'evidence_class':evidence_class(record, topical),
        'topical_match':topical,
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
    order={'TARGET_MATCH':0,'POSSIBLE_TARGET':1,'CONTEXT_ONLY':2,'UNMATCHED':3}
    return sorted(assessed,key=lambda x:(order[x['relevance_assessment']['topical_match']['category']],-x['relevance_assessment']['research_value']['score'],
                                         -x['relevance_assessment']['score']))


def discovery_queries(ident, recovery=False):
    focus=ident.get('focus') or decompose(ident['target'],ident.get('aliases',[]),kind=ident.get('type','unknown'),regions=ident.get('region_terms',[]))
    if focus['kind']=='person':
        return focused_queries(focus,('history','voyage','corsair'),include_hypotheses=True)
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

