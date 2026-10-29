"""Deterministic, model-free relevance ranking of collected excerpts.

Reading order only: nothing is deleted, verified or promoted. Near-duplicates
(OCR variants, the same book reached through two lanes) are moved after every
distinct excerpt, so the model-call budget is spent on new text first. A
continuation round simply takes the next best excerpts in this order.
"""
import json
import math
import re
import unicodedata
from pathlib import Path

from research_topics import BASES, PIRACY

POLICY = 'lexical-bm25-alias-date-quality-v2'
NEAR_DUPLICATE_CONTAINMENT = 0.7
SHINGLE = 3
SCORE_LOG_LIMIT = 500
PIRACY_BOOST = 2.0
BASES_BOOST = 0.75
HOMONYM_PENALTY = -6.0
PREFIX = 6  # 'argentier' matches Argentiera/Argentiere/Argentière
STOP = set('''the and of to in a is that for on with as by at from this was were be are or an it which
his her their its not but have has had into than then there these those also such been about what who
when where how why did does question research scope και του της την των στο στη στην που για από με
ως ποιο ποια ποιος ποιες ποιοι πότε πώς ήταν είναι λέγεται τους τις τα το οι η ο ένα μια παλιούς
der die das und von zu mit den des dem ein eine im ist auf le la les de du des et en un une est dans
il lo gli della delle di da che per con una
νησοσ νησι νησια island isle insel isola ile isla eiland ada
είχε είχαν έχει έχουν ρόλο ρόλος ρόλοι στους στις στον στα στο σε κατά μετά πριν ποιον ποιους ποιων
τι γιατί πού ποτέ αν ότι όπως όταν μέσα έξω πάνω ήταν υπήρχε υπήρχαν λένε λέει δείχνει δείχνουν
ταξίδι ταξίδια ταξίδεψε πηγές πηγή στοιχεία μαρτυρίες αναφορές αναφέρει αναφέρουν παλιές παλιοί
role played during period century αιώνα αιώνας role rôle ruolo papel'''.split())
# Words of a piracy question that are real topic terms (stems, folded).
PIRACY_TOPIC_TERMS = ('pirat', 'corsai', 'corsar', 'korsan', 'forban', 'πειρατ', 'κουρσα', 'levend',
                      'zeerov', 'seerau', 'kaper', 'malta', 'maltes', 'esclav', 'captiv', 'rançon', 'ranson',
                      'riscat', 'λυτρα', 'αιχμαλ', 'σκλαβ')
BASES_TOPIC_TERMS = ('ορμητη', 'αγκυρο', 'λιμανι', 'harbou', 'anchor', 'refuge', 'repair', 'mouill',
                     'porto', 'rifugi', 'haven')
_GAZETTEER = Path(__file__).resolve().parents[1] / 'data/gazetteer/mediterranean_gazetteer.v1.json'


def fold(value):
    text = unicodedata.normalize('NFD', str(value or ''))
    return ''.join(c for c in text if not unicodedata.combining(c)).casefold().replace('ς', 'σ').replace('ſ', 's')


STOP_FOLDED = None


def tokens(value):
    return re.findall(r'[^\W\d_]{2,}', fold(value))


def _stop():
    global STOP_FOLDED
    if STOP_FOLDED is None:
        STOP_FOLDED = {fold(w) for w in STOP}
    return STOP_FOLDED


def _stem(token):
    return token[:PREFIX] if len(token) > PREFIX else token


def expand_names(names, gazetteer=_GAZETTEER):
    """Target and aliases plus sourced gazetteer variants of the same place."""
    names = [n.strip() for n in names if isinstance(n, str) and n.strip()]
    folded = {fold(n) for n in names}
    out = list(dict.fromkeys(names))
    try:
        places = json.loads(Path(gazetteer).read_text()).get('places', [])
    except (OSError, ValueError, AttributeError):
        places = []
    for place in places:
        variants = [v.get('name') for v in place.get('variants', []) if isinstance(v, dict)]
        variants += list((place.get('modern_name') or {}).values()) + [place.get('seed_title')]
        variants = [v for v in variants if isinstance(v, str) and v.strip()]
        if folded & {fold(v) for v in variants}:
            out.extend(v for v in variants if v not in out)
    return out


def _years(text):
    return [int(y) for y in re.findall(r'(?<!\d)(1[0-9]\d{2})(?!\d)', text)]


def shingles(text):
    words = tokens(text)
    if len(words) < SHINGLE:
        return {' '.join(words)} if words else set()
    return {' '.join(words[i:i + SHINGLE]) for i in range(len(words) - SHINGLE + 1)}


def _quality(row):
    text = row.get('text') or ''
    letters = sum(c.isalpha() for c in text) or 1
    digits = sum(c.isdigit() for c in text)
    words = text.split()
    score, reasons = 0.0, []
    if digits / letters > 0.15:
        score -= 1.0; reasons.append('TABLE_OR_NUMERIC_OCR')
    if len(words) < 24:
        score -= 0.5; reasons.append('SHORT_FRAGMENT')
    flags = set(row.get('uncertainties') or [])
    if flags & {'CATALOGUE_METADATA', 'INDEX_ENTRY', 'BIBLIOGRAPHIC_CONTEXT'}:
        score -= 1.0; reasons.append('METADATA_OR_INDEX')
    source = fold((row.get('source_bibliography') or {}).get('source_type') or '')
    if source in {'primary', 'primary_source', 'archival_document', 'contemporary_account'}:
        score += 0.5; reasons.append('PRIMARY_SOURCE_METADATA_HINT')
    return score, reasons


def rank(records, target='', aliases=(), date_range='', purpose='', gazetteer=_GAZETTEER):
    """Return (ordered records, report). Deterministic for identical input."""
    names = expand_names([target, *aliases], gazetteer)
    name_terms = sorted({_stem(t) for n in names for t in tokens(n) if t not in _stop() and len(t) >= 3})
    piracy_purpose = bool(re.search(PIRACY + '|' + BASES, fold(purpose)))
    purpose_terms = {_stem(t) for t in tokens(purpose) if t not in _stop() and len(t) >= 4}
    if piracy_purpose:
        # A piracy question is ranked on piracy vocabulary in every source
        # language, not on the words of the Greek question ('ρόλο', 'στους').
        purpose_terms = {t for t in purpose_terms if re.search(PIRACY + '|' + BASES, t)}
        purpose_terms |= {_stem(fold(t)) for t in PIRACY_TOPIC_TERMS + BASES_TOPIC_TERMS}
    purpose_terms = sorted(purpose_terms - set(name_terms))
    from search_priority import homonym_check, infer_window
    start, end, window_basis = infer_window(date_range, purpose)
    window = (start, end) if start is not None else None
    docs = [[_stem(t) for t in tokens(r.get('text'))] for r in records]
    n = len(docs) or 1
    avg = sum(map(len, docs)) / n or 1.0
    df = {}
    for doc in docs:
        for term in set(doc):
            df[term] = df.get(term, 0) + 1

    def bm25(doc, terms, k1=1.2, b=0.75):
        counts = {}
        for t in doc:
            counts[t] = counts.get(t, 0) + 1
        total = 0.0
        for term in terms:
            f = counts.get(term, 0)
            if f:
                idf = math.log(1 + (n - df.get(term, 0) + .5) / (df.get(term, 0) + .5))
                total += idf * f * (k1 + 1) / (f + k1 * (1 - b + b * len(doc) / avg))
        return total

    scored = []
    for index, (row, doc) in enumerate(zip(records, docs)):
        title = (row.get('occurrences') or [{}])[0].get('title') or ''
        title_terms = {_stem(t) for t in tokens(title)}
        scale = min(1.0, len(doc) / 24.0)  # a bare heading must not outrank prose
        name = bm25(doc, name_terms) * scale
        topic = bm25(doc, purpose_terms) * scale
        folded_text = fold(row.get('text'))
        theme = 0.0
        if piracy_purpose and re.search(PIRACY, folded_text):
            theme += PIRACY_BOOST
        if piracy_purpose and re.search(BASES, folded_text):
            theme += BASES_BOOST
        homonym = homonym_check(row.get('text') or '', names)
        date = 0.0
        if window:
            in_scope = row.get('years_in_scope') or [y for y in _years(row.get('text') or '') if window[0] <= y <= window[1]]
            mentioned = _years(row.get('text') or '')
            if in_scope:
                date = 1.5
            elif mentioned:
                date = -0.5
        quality, reasons = _quality(row)
        if homonym:
            # Read last among its peers, never dropped: same name, other place.
            quality += HOMONYM_PENALTY
            reasons = reasons + ['OTHER_PLACE_HOMONYM:' + homonym['id']]
        title_match = 1.0 if title_terms & set(name_terms) else 0.0
        score = round(3.0 * name + 1.0 * topic + theme + date + quality + title_match, 6)
        scored.append({'row': row, 'index': index, 'score': score,
                       'parts': {'name_bm25': round(name, 4), 'purpose_bm25': round(topic, 4), 'theme': theme,
                                 'date_window': date, 'source_quality': quality,
                                 'title_name_match': title_match},
                       'reasons': reasons})
    scored.sort(key=lambda s: (-s['score'], s['index'], s['row']['evidence_id']))

    # Near-duplicate guard against already-kept leaders only (inverted index).
    leaders, duplicates, index_by_shingle, leader_shingles = [], [], {}, {}
    seen_fingerprints = {}
    for item in scored:
        row = item['row']
        fp = row.get('similar_text_fingerprint')
        sh = shingles(row.get('text'))
        duplicate_of = seen_fingerprints.get(fp) if fp else None
        if duplicate_of is None and sh:
            overlap = {}
            for s in sh:
                for leader in index_by_shingle.get(s, ()):
                    overlap[leader] = overlap.get(leader, 0) + 1
            for leader, common in sorted(overlap.items()):
                smaller = min(len(sh), len(leader_shingles[leader]))
                if smaller and common / smaller >= NEAR_DUPLICATE_CONTAINMENT:
                    duplicate_of = leader
                    break
        if duplicate_of is not None:
            item['duplicate_of'] = duplicate_of
            duplicates.append(item)
            continue
        leaders.append(item)
        eid = row['evidence_id']
        if fp:
            seen_fingerprints[fp] = eid
        leader_shingles[eid] = sh
        for s in sh:
            index_by_shingle.setdefault(s, []).append(eid)
    ordered = leaders + duplicates
    report = {'policy': POLICY, 'role': 'READING_ORDER_ONLY_NOT_TRUTH_OR_SOURCE_INDEPENDENCE',
              'name_terms': name_terms, 'purpose_terms': purpose_terms,
              'expanded_names': names, 'date_window': list(window) if window else None,
              'date_window_basis': window_basis, 'piracy_boost': PIRACY_BOOST if piracy_purpose else 0.0,
              'homonym_penalised': sum(1 for s in scored if any(r.startswith('OTHER_PLACE_HOMONYM') for r in s['reasons'])),
              'ranked': len(ordered), 'distinct': len(leaders), 'near_duplicates_read_last': len(duplicates),
              'near_duplicate_containment': NEAR_DUPLICATE_CONTAINMENT, 'shingle_words': SHINGLE, 'dropped': 0,
              'near_duplicate_ids': [s['row']['evidence_id'] for s in duplicates],
              'near_duplicate_of': {s['row']['evidence_id']: s['duplicate_of'] for s in duplicates},
              'scores_logged': min(len(ordered), SCORE_LOG_LIMIT),
              'scores': [{'evidence_id': s['row']['evidence_id'], 'rank': i, 'score': s['score'],
                          **s['parts'], 'quality_reasons': s['reasons'],
                          **({'near_duplicate_of': s['duplicate_of']} if 'duplicate_of' in s else {})}
                         for i, s in enumerate(ordered[:SCORE_LOG_LIMIT])]}
    return [s['row'] for s in ordered], report
