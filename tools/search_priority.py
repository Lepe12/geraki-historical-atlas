"""Search-side helpers for place research: name variants, piracy-first queries,
homonym guards, a question-derived date window and known priority targets.

Search aids only. Nothing here is evidence: a variant or a priority target only
decides what is searched or read first. Nothing is deleted; a homonym hit is
held back with its reason so a human can still see it.
"""
import json
import os
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KNOWLEDGE = ROOT / 'knowledge' / 'pirates_bases.md'
PRIORITY_TARGETS = ROOT / 'data' / 'research_priority_targets.v1.json'
POLICY = 'place-variants-piracy-first-v1'


def fold(value):
    text = unicodedata.normalize('NFD', str(value or '').replace('ſ', 's'))
    return ''.join(c for c in text if not unicodedata.combining(c)).casefold().replace('ς', 'σ').replace('’', "'")


# ------------------------------------------------------------- name variants
def search_name_variants(target, aliases=(), knowledge_path=KNOWLEDGE, gazetteer=None, max_names=16):
    """Target, request aliases, then old names from the knowledge file and the
    gazetteer, each with its basis. Request names always come first and are
    never removed. PCT_NAME_VARIANTS=0 disables the expansion."""
    out, seen = [], set()

    def add(name, basis, source=''):
        name = str(name or '').strip()
        if name and fold(name) not in seen:
            seen.add(fold(name))
            out.append({'name': name, 'basis': basis, 'source': source})

    add(target, 'REQUEST_TARGET')
    for a in aliases or ():
        add(a, 'REQUEST_ALIAS')
    if os.getenv('PCT_NAME_VARIANTS', '1') == '0':
        return out
    try:
        from connectors.open_collections import place_aliases
    except ImportError:  # pragma: no cover - tools/ not on sys.path
        return out
    for item in list(out):
        if item['basis'] not in ('REQUEST_TARGET', 'REQUEST_ALIAS'):
            continue
        try:
            names, _ = place_aliases(item['name'], max_names, knowledge_path, gazetteer)
        except Exception:
            continue
        for n in names[1:]:
            add(n['name'], n['basis'], n.get('source', ''))
    return out[:max(len([x for x in out if x['basis'].startswith('REQUEST')]), max_names)]


def names_only(variants):
    return [v['name'] for v in variants]


# ------------------------------------------------------- piracy-first queries
LANE_PIRACY_TERMS = {
    'french': ['corsaires', 'pirates', 'forbans'],
    'north_african': ['corsaires', 'corsarios', 'pirates'],
    'venetian': ['corsari', 'pirati'],
    'italian_states': ['corsari', 'pirati'],
    'greek': ['κουρσάροι', 'πειρατές'],
    'ottoman': ['korsan', 'levend'],
    'spanish_simancas': ['corsarios', 'piratas'],
    'dutch': ['zeerovers', 'kapers'],
    'german': ['Korsaren', 'Seeräuber'],
    'british': ['pirates', 'corsairs'],
    'travellers': ['corsairs', 'pirates', 'corsaires'],
}
# Asked for by the historian; Malta = the Maltese corsairs of the Archipelago.
GENERAL_PIRACY_TERMS = ['corsari', 'corsaires', 'pirati', 'pirates', 'corsairs', 'κουρσάροι', 'πειρατές', 'korsan', 'Malta']
PIRACY_QUERY = re.compile(r'πειρατ|κουρσαρ|pirat|corsa|korsan|forban|levend|zeerov|kaper|korsar|seerau|malta', re.I)


def lane_piracy_terms(lane):
    own = LANE_PIRACY_TERMS.get(lane, [])
    return list(dict.fromkeys(own + ['Malta'] + GENERAL_PIRACY_TERMS))


def place_piracy_first(queries, names, lane, limit=None):
    """Name-variant x piracy-term queries first, then the queue as it was.

    The round budget only reaches the first queries of each repository, so the
    combinations that can find corsair activity under an old name go first.
    Term-major order: every variant is tried with the lane's own word before
    the second word is used. Existing queries keep their relative order."""
    limit = int(os.getenv('PCT_PIRACY_FIRST_QUERIES', '8')) if limit is None else limit
    names = [n for n in names if n and not str(n).startswith('__')]
    combos = []
    if limit > 0:
        for term in lane_piracy_terms(lane):
            for n in names:
                combos.append(f'"{n}" {term}')
        combos = combos[:limit]
    queries = [q for q in queries if q]
    already = [q for q in queries if not q.startswith('__') and PIRACY_QUERY.search(fold(q))]
    rest = [q for q in queries if q not in already]
    return list(dict.fromkeys(combos + already + rest))


# ------------------------------------------------------------ homonym guards
HOMONYMS = [{
    'id': 'ARGENTIERE_ALPS',
    'name': r"argenti[eè]r",
    'other_place': "Argentière (Chamonix / Mont Blanc, Alpes; also L'Argentière-la-Bessée, Dauphiné)",
    'other': r"chamonix|mont[- ]?blanc|dauphin|savoi|savoy|glacier|\balpes?\b|\balpine?\b|\balps\b|\bisere\b|briancon|bessee|vallorcine|col de balme|aiguille|haute[- ]?savoie|durance|\bski\b|neige|moran|moraen|piemont",
    'aegean': r"\bmilo\b|\bmelos\b|μηλο|archipel|arcipelag|cyclad|κυκλαδ|levant|aegean|egee|egeo|αιγαι|kimol|cimol|κιμωλ|siphant|sifan|polin|grece|greece|grecia|ottoman|turquie|morea|candie|\bparos\b",
}]


def homonym_check(text, names):
    """Return the homonym id when text names another place with the same name.

    Applies only when one of the research names matches the homonym, the text
    shows that other place, and shows no Aegean context."""
    folded_names = ' '.join(fold(n) for n in names)
    t = fold(text)
    for h in HOMONYMS:
        if not re.search(h['name'], folded_names) or not re.search(h['name'], t):
            continue
        if re.search(h['other'], t) and not re.search(h['aegean'], t):
            return h
    return None


def candidate_text(item):
    parts = []
    for k in ('title', 'description', 'subject', 'creator', 'publisher', 'snippet', 'text', 'place'):
        v = item.get(k)
        if isinstance(v, (list, tuple)):
            v = ' '.join(str(x) for x in v)
        if v:
            parts.append(str(v))
    return ' '.join(parts)


def guard_candidates(items, names):
    """Hold back other-place homonyms from automatic acquisition (kept, never dropped)."""
    kept, held = [], []
    for x in items:
        h = None if x.get('priority_target') else homonym_check(candidate_text(x), names)
        if h:
            x = dict(x)
            x['relevance_assessment'] = {**(x.get('relevance_assessment') or {}), 'status': 'EXCLUDE_FROM_ACQUISITION',
                                         'homonym_guard': h['id'], 'reason': 'OTHER_PLACE_HOMONYM: ' + h['other_place']}
            x.pop('source_lead', None)
            held.append(x)
        else:
            kept.append(x)
    return kept, held


# ---------------------------------------------------------------- date window
ROMAN = {'XIII': 13, 'XIV': 14, 'XV': 15, 'XVI': 16, 'XVII': 17, 'XVIII': 18, 'XIX': 19}
_CENTURY = re.compile(r'(?<!\d)(1[3-9])\s*(?:ος|ου|ο|th|e|eme|ème|°|º)?\s*(?:αι|αιων|century|cent|siecle|siècle|secolo|jh|jahrhundert)', re.I)
_ROMAN_CENTURY = re.compile(r'\b(XIII|XIV|XV|XVI|XVII|XVIII|XIX)\s*(?:e|eme|ème|°)?\s*(?:siecle|siècle|secolo|century|αι)', re.I)
_YEAR = re.compile(r'(?<!\d)(1[2-9]\d{2})(?!\d)')


def infer_window(date_range='', purpose=''):
    """(start, end, basis). The request's date range wins; otherwise years or a
    century named in the question; otherwise (None, None, None)."""
    ys = [int(y) for y in _YEAR.findall(str(date_range or ''))]
    if ys:
        return min(ys), max(ys), 'REQUEST_DATE_RANGE'
    text = str(purpose or '')
    ys = [int(y) for y in _YEAR.findall(text)]
    if len(ys) >= 2:
        return min(ys), max(ys), 'QUESTION_YEARS'
    if len(ys) == 1:
        return ys[0] - 10, ys[0] + 10, 'QUESTION_YEAR_PLUS_MINUS_10'
    cs = [int(c) for c in _CENTURY.findall(fold(text))] + [ROMAN[c.upper()] for c in _ROMAN_CENTURY.findall(text)]
    if cs:
        return (min(cs) - 1) * 100, (max(cs) - 1) * 100 + 99, 'QUESTION_CENTURY'
    return None, None, None


# ---------------------------------------------------------- priority targets
def priority_targets(names, path=PRIORITY_TARGETS):
    """Known archival targets for these place names, as acquisition candidates.
    PCT_PRIORITY_TARGETS=0 disables them (offline fixtures)."""
    if os.getenv('PCT_PRIORITY_TARGETS', '1') == '0':
        return []
    try:
        data = json.loads(Path(path).read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return []
    wanted = {fold(n) for n in names if n}
    out = []
    for t in data.get('targets', []):
        if wanted & {fold(p) for p in t.get('places', [])}:
            out.append({'discovery_repository': t['repository'], 'repository': t['repository'],
                        'identifier': t['identifier'], 'title': t['title'], 'url': t['url'],
                        'date': [t['date']] if t.get('date') else [], 'source_lead': True,
                        'priority_target': t['id'], 'priority_note': t.get('note', ''),
                        'digital_status': t.get('digital_status', ''),
                        'relevance_assessment': {'status': 'PRIORITY', 'score': 100,
                                                 'reasons': ['KNOWN_PRIORITY_ARCHIVAL_TARGET']}})
    return out


def put_priority_first(items, targets):
    """Priority targets lead the acquisition queue; an existing copy is moved, not duplicated."""
    def key(x):
        return str(x.get('url') or x.get('identifier') or '').rstrip('/')
    by_key = {key(t): t for t in targets}
    first, rest = [], []
    for x in items:
        if key(x) in by_key:
            first.append({**x, **{k: v for k, v in by_key.pop(key(x)).items() if k not in x or k in ('priority_target', 'source_lead')}})
        else:
            rest.append(x)
    return [t for t in targets if key(t) in by_key] + first + rest
