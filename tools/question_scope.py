"""Conservative request facets: retrieval hints and negative acceptance gates.

Lexical overlap is necessary for these supported facets, never sufficient for
historical truth. Unknown subjects remain explicitly unassessed. No model call,
source deletion or evidence-state promotion takes place here.
"""
import hashlib
import json
import re
import unicodedata


def fold(value):
    return ''.join(c for c in unicodedata.normalize('NFD', str(value or ''))
                   if not unicodedata.combining(c)).casefold().replace('ς', 'σ').replace('ſ', 's')


# Retrieval vocabulary only; no place, actor or presumed historical event.
FACETS = {
    'anchorage': (r'anchor\w*|mouill\w*|ancrag\w*|ancoragg\w*|ancorad\w*|αγκυρο\w*|reid[e]?|reede|demirle\w*',
                  'αγκυροβόλια', ('anchorage', 'mouillage', 'ancoraggio', 'fondeadero', 'αγκυροβόλιο', 'Reede', 'ankerplaats', 'demirleme')),
    'freshwater': (r'fresh[ -]?water|drinking[ -]?water|potable\s+water|water\s+suppl\w*|watering[ -]?place|eau\s+(?:douce|potable)|acqua\s+(?:dolce|potabile)|agua\s+(?:dulce|potable)|ποσιμ\w*\s+νερ\w*|υδροδο\w*|ανεφοδιασ\w*\s+νερ\w*|νερ\w*\s+(?:για\s+)?(?:πλοια|ποση)|susswasser|trinkwasser|drinkwater|icme\s+suyu',
                   'πόσιμο νερό / υδροδότηση', ('fresh water', 'eau douce', 'acqua dolce', 'agua dulce', 'πόσιμο νερό', 'Trinkwasser', 'drinkwater', 'içme suyu')),
    'piracy': (r'pirac\w*|pirat\w*|corsair\w*|corsar\w*|πειρατ\w*|κουρσαρ\w*|korsan\w*|zeerover\w*',
               'πειρατεία', ('piracy', 'corsaires', 'corsari', 'corsarios', 'πειρατεία', 'Piraterie', 'zeeroverij', 'korsan')),
    'captivity': (r'captivit\w*|ransom\w*|αιχμαλω\w*|λυτρ\w*|captivite|riscatto|cautiverio|esaret',
                  'αιχμαλωσία / λύτρα', ('captivity ransom', 'captivité rançon', 'cattività riscatto', 'cautiverio rescate', 'αιχμαλωσία λύτρα', 'Gefangenschaft', 'gevangenschap', 'esaret')),
}
LANE_LANGUAGE = {'french': 1, 'north_african': 1, 'venetian': 2, 'italian_states': 2,
                 'spanish_simancas': 3, 'greek': 4, 'german': 5, 'dutch': 6, 'ottoman': 7}


def hits(text):
    return [key for key, (pattern, _, _) in FACETS.items()
            if re.search(r'(?<!\w)(?:' + pattern + r')(?!\w)', fold(text))]


def profile(request):
    purpose = str(request.get('purpose') or '')
    # Exclude explicit prohibitions from positive retrieval requirements.
    positive = re.sub(r'(?i)(?:do\s+not|don.t|never|μην|μη)\b[^.;\n]*', '', purpose)
    facets = hits(positive)
    primary = bool(re.search(r'primary\s+sources?|contemporary\s+(?:travell\w*|sources?|accounts?)|archival\s+(?:sources?|records?)|πρωτογεν\w*|συγχρον\w*\s+περιηγ\w*|αρχειακ\w*\s+πηγ\w*', fold(positive)))
    return {'facets': facets, 'requires_primary_support': primary,
            'assessment': 'CONSERVATIVE_LEXICAL_NECESSITY_NOT_SEMANTIC_OR_HISTORICAL_VERIFICATION',
            'unrecognized_scope_not_assessed': not bool(facets)}


def queries(request, lane='travellers'):
    """Cover every requested facet before spending the budget on more aliases."""
    facets = profile(request)['facets']
    names = [n for n in [request.get('target'), *(request.get('aliases') or [])]
             if isinstance(n, str) and n.strip()]
    language = LANE_LANGUAGE.get(lane, 0)
    return list(dict.fromkeys('"' + name.replace('"', '') + '" ' + FACETS[key][2][language]
                             for name in names for key in facets))


def primary_basis(claim, request):
    """Require source metadata, not the model's PRIMARY_SOURCE verdict alone."""
    years = [int(y) for y in re.findall(r'(?<!\d)(?:1\d{3}|20\d{2})(?!\d)', str(request.get('date_range') or ''))]
    for occurrence in claim.get('source_occurrences') or []:
        bib = occurrence.get('source_bibliography') or {}
        kind = str(bib.get('historical_source_type') or bib.get('source_type') or '').upper()
        if kind not in ('PRIMARY', 'PRIMARY_SOURCE', 'PRIMARY_ORIGINAL', 'PRIMARY_FACSIMILE', 'CONTEMPORARY_PRINTED', 'CONTEMPORARY_ACCOUNT', 'ARCHIVAL_DOCUMENT'):
            continue
        # A secondary author's reported archival reference does not qualify.
        if kind == 'ARCHIVAL_DOCUMENT' and bib.get('repository') and bib.get('call_number'):
            return 'REPORTED_ARCHIVAL_SOURCE_METADATA_NOT_ORIGINAL_INSPECTION'
        dates = [int(y) for y in re.findall(r'(?<!\d)(?:1\d{3}|20\d{2})(?!\d)', str(bib.get('date') or ''))]
        if bib.get('creator') and years and any(min(years) <= y <= max(years) for y in dates):
            return 'REPORTED_CONTEMPORARY_AUTHOR_AND_EDITION_NOT_EVENT_DATE'
    return None


def claim_facets(claim):
    # The evidence AND its attributed statement must address the same facet.
    return sorted(set(hits(claim.get('quote'))) & set(hits(claim.get('statement'))))


def review_binding(request, sections, claims):
    selected={cid for s in sections for cid in s.get('claim_ids') or []}
    payload={'request':{k:request.get(k) for k in ('target','aliases','purpose','date_range')},
             'sections':[{k:s.get(k) for k in ('text','claim_ids')} for s in sections],
             'claims':[{k:c.get(k) for k in ('claim_id','statement','quote')} for c in claims if c.get('claim_id') in selected]}
    return hashlib.sha256(json.dumps(payload,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()


def review_valid(request, answer, value):
    """A semantic assessment must bind exactly to the request and cited text."""
    facets=profile(request)['facets']
    if not isinstance(value,dict) or value.get('binding')!=review_binding(request,answer.get('answer_sections') or [],answer.get('claims') or []):
        return False
    rows=value.get('decisions')
    if not isinstance(rows,list) or len(rows)!=len(facets):return False
    if any(not isinstance(r,dict) or not isinstance(r.get('facet'),str) for r in rows):return False
    if {r['facet'] for r in rows}!=set(facets):return False
    return all(isinstance(r.get('reason'),str) and r['reason'].strip()
               and r.get('decision') in ('ADDRESSED','NOT_ADDRESSED','UNCERTAIN') for r in rows)


def replay_review(root, analysis_root, request, answer):
    """Read actual model receipt bytes; stored green coverage labels do not count."""
    from pathlib import Path
    from research_continuation import digest as cache_digest
    from semantic_research_answer import digest, parse
    base=Path(root).resolve();analysis=Path(analysis_root).resolve()/'research_answer'
    for call in reversed(answer.get('calls') or []):
        if call.get('role')!='adversarial_reviewer' or call.get('status')!='COMPLETED':continue
        try:
            if call.get('replayed'):
                path=(base/call['response_cache_path']).resolve()
                if not path.is_relative_to(base):continue
                result=json.loads(path.read_text())['result']
                if cache_digest(result)!=call['response_cache_sha256']:continue
            else:
                prompt=(analysis/call['prompt_file']).resolve()
                if not prompt.is_relative_to(analysis) or hashlib.sha256(prompt.read_bytes()).hexdigest()!=call['prompt_sha256']:continue
                marker='FINAL_ANSWER_JSON:\n'
                text=prompt.read_text()
                if marker not in text:continue
                supplied=json.loads(text.split(marker,1)[1])
                if (supplied.get('question_scope') or {}).get('binding')!=review_binding(request,answer.get('answer_sections') or [],answer.get('claims') or []):continue
                path=prompt.with_name(prompt.name.replace('.prompt.txt','.json'))
                result=json.loads(path.read_text())
                if digest(result)!=call['response_sha256']:continue
            value=(parse(result) or {}).get('question_scope_review')
            if result.get('status')=='COMPLETED' and review_valid(request,answer,value):
                return {'status':'REPLAYED','review':value,'receipt':str(path.relative_to(base))}
        except (OSError,ValueError,KeyError,TypeError):continue
    return {'status':'NOT_REPLAYED','review':None}


def assess(request, answer):
    scope = profile(request)
    supported = set((answer.get('review') or {}).get('supported_claim_ids') or [])
    claims = {c.get('claim_id'): c for c in answer.get('claims') or []}
    rows = []
    for key in scope['facets']:
        cited = []
        for section in answer.get('answer_sections') or []:
            if key not in hits(section.get('text')):
                continue
            for cid in section.get('claim_ids') or []:
                claim = claims.get(cid, {})
                if cid in supported and key in claim_facets(claim):
                    cited.append(cid)
        cited = sorted(set(cited))
        primary = [cid for cid in cited if primary_basis(claims[cid], request)]
        status = ('NO_CITED_SUPPORT' if not cited else
                  'PRIMARY_SUPPORT_NOT_ESTABLISHED' if scope['requires_primary_support'] and not primary else
                  'LEXICALLY_ADDRESSED_REQUIRES_HUMAN_REVIEW')
        rows.append({'facet': key, 'label_el': FACETS[key][1], 'status': status,
                     'cited_claim_ids': cited, 'primary_metadata_claim_ids': primary})
    semantic=answer.get('question_scope_review')
    semantic_valid=review_valid(request,answer,semantic) if rows else False
    decisions={r['facet']:r for r in semantic['decisions']} if semantic_valid else {}
    for row in rows:
        row['semantic_review']=decisions.get(row['facet'])
    missing = [r['facet'] for r in rows if r['status'] != 'LEXICALLY_ADDRESSED_REQUIRES_HUMAN_REVIEW']
    return {'schema': 'question-scope-coverage-v1', **scope, 'requirements': rows,
            'status': ('NOT_ASSESSED' if not rows else 'INCOMPLETE' if missing or not semantic_valid
                       or any(r['decision']!='ADDRESSED' for r in decisions.values()) else 'PROVISIONAL_SCOPE_REVIEW_PASSED'),
            'missing_requirements': missing, 'historical_verified': False,
            'semantic_review_valid':semantic_valid,
            'semantic_requirements_not_addressed':[key for key in scope['facets'] if decisions.get(key,{}).get('decision')!='ADDRESSED'],
            'answer_semantically_complete': False,
            'limits': ['LEXICAL_PASS_IS_NOT_PROOF_OF_A_COMPLETE_ANSWER',
                       'NO_RESULT_IS_NOT_EVIDENCE_OF_ABSENCE', 'PUBLICATION_DATE_IS_NOT_EVENT_DATE']}


def apply_to_answer(request, answer):
    """Keep unrelated paragraphs as context; never present them as the answer."""
    scope = profile(request)
    if scope['facets']:
        claims = {c.get('claim_id'): c for c in answer.get('claims') or []}
        kept = []
        for section in answer.get('answer_sections') or []:
            matched = set(hits(section.get('text'))) & set(scope['facets'])
            linked = {f for cid in section.get('claim_ids') or [] for f in claim_facets(claims.get(cid, {}))}
            if matched & linked:
                kept.append(section)
            else:
                answer.setdefault('question_scope_context_sections', []).append(section)
        answer['answer_sections'] = kept
        if not kept and answer.get('status') in ('MODEL_ANSWER_PENDING_HUMAN_REVIEW','SYNTHESIS_CONTEXT_REQUIRES_REVIEW'):
            answer['status'] = 'QUESTION_COVERAGE_INCOMPLETE'
    answer['question_coverage'] = assess(request, answer)
    return answer['question_coverage']
