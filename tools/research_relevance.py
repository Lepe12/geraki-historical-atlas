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


HISTORY = re.compile(r'voyag|travel|travell|reise|viaggio|relation|itinerar|archipel|geograph|histor|histoire|storia|chronicle|memoir|περιηγ|ιστορι|ναυτι|navigation|diplomat|consul|pirat|corsair|corsar|ransom|captiv|portolan')
GEO = re.compile(r'\bisland\b|\bisle\b|\bisola\b|\binsel\b|νησ|cyclad|aegean|egee|archipel|greece|grece|grecia|ελλα|harbour|harbor')
NOISE = re.compile(r'quintet|symphon|zeitschrift.{0,12}musik|musical|coleoptera|scolytinae|favorites$|\bpodcast\b|\blivestream\b|\btv\b|\byoutube\b')


def assess(record, ident):
    # URLs/identifiers and caller-provided canonical labels cannot establish identity.
    title = norm(record.get('title'))
    context = ' '.join(norm(record.get(k)) for k in ('title','description','subject','context_excerpt'))
    names = [ident['target'], *ident.get('aliases', [])]
    name_match = any(contains(context, n) for n in names if n)
    regional = any(contains(context, n) for n in ident.get('region_terms', []) if n)
    history = bool(HISTORY.search(context))
    geographic = bool(GEO.search(context)) or regional
    reasons = []
    score = 0
    if name_match: score += 4; reasons.append('NAME_IN_SOURCE_METADATA')
    if geographic: score += 4; reasons.append('GEOGRAPHIC_CONTEXT')
    if history: score += 4; reasons.append('HISTORICAL_OR_DOCUMENTARY_CONTEXT')
    date_text = norm(record.get('year') or record.get('date'))
    publication_years = [int(x) for x in re.findall(r'\b(1\d{3}|20\d{2})\b', date_text)]
    requested = [int(x) for x in re.findall(r'\b(1\d{3}|20\d{2})\b', ident.get('date_range',''))]
    if publication_years and requested and min(requested)-100 <= min(publication_years) <= max(requested)+100:
        score += 3; reasons.append('NEAR_PERIOD_PUBLICATION_NOT_EVENT_DATE')
    if NOISE.search(title) and not (geographic and history):
        status = 'EXCLUDE_FROM_ACQUISITION'; reasons.append('EXPLICIT_TOPIC_COLLISION')
    elif record.get('mediatype') and record['mediatype'] not in ('texts',):
        status = 'REVIEW_REQUIRED'; reasons.append('NON_TEXT_OBJECT')
    elif ident.get('type') == 'place':
        if (name_match and (geographic or history)) or (regional and history): status = 'PRIORITY'
        else: status = 'REVIEW_REQUIRED'; reasons.append('PLACE_IDENTITY_UNRESOLVED')
    elif name_match and history: status = 'PRIORITY'
    else: status = 'REVIEW_REQUIRED'; reasons.append('CONTEXT_UNRESOLVED')
    return {'status': status, 'score': score, 'reasons': reasons,
            'identity_status': 'POSSIBLE_MATCH' if name_match else 'REGIONAL_CONTEXT' if regional else 'UNRESOLVED',
            'verified': False}


def rank(records, ident):
    assessed = [{**x, 'relevance_assessment': assess(x, ident)} for x in records]
    return sorted(assessed, key=lambda x: -x['relevance_assessment']['score'])


def discovery_queries(ident, recovery=False):
    names = list(dict.fromkeys([ident['target'], *ident.get('aliases', [])]))
    queries=[]
    if recovery and ident.get('region_terms'):
        for region in ident['region_terms'][:4]:
            for genre in ('voyage', 'travel', 'description'):
                queries.append(f'"{region}" {genre}')
    else:
        # Round-robin aliases, so limits do not starve historical spellings.
        for genre in ('island' if ident.get('type') == 'place' else 'history', 'voyage', 'corsair'):
            queries += [f'"{n}" {genre}' for n in names if n]
        queries += [f'"{n}"' for n in names if n]
    return list(dict.fromkeys(queries))


def request_digest(req, ctx):
    payload={**ctx, 'target_context': req.get('target_context',{})}
    return hashlib.sha256(json.dumps(payload,ensure_ascii=False,sort_keys=True).encode()).hexdigest()
