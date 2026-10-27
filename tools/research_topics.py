"""Controlled thematic retrieval vocabulary, never evidence or place identity.

Unlike a named entity, a research subject must not be quoted as one phrase.
Translations below describe search concepts, not historical findings.
"""
import re
import unicodedata

def normalized(value):
    return ''.join(c for c in unicodedata.normalize('NFD', str(value)) if not unicodedata.combining(c)).casefold()

PIRACY = r'πειρατ|κουρσαρ|pirac|pirat|cor[sſf]air|corsar|korsan|zeeroo?v|seeraub'
BASES = r'ορμητηρ|αγκυροβολ|καταφυγ|harbou?r|anchorage|haven|\bbases?\b|refuge|repaire|mouillage'
REGIONS = {
    'mediterranean': {
        'pattern': r'μεσογει|mediterran|akdeniz',
        'forms': ['Mediterranean', 'Méditerranée', 'Mediterraneo', 'Mediterráneo', 'Akdeniz', 'Μεσόγειος'],
        'search_scope_hypotheses': ['Archipelago', 'Archipel', 'Arcipelago', 'Aegean', 'Αιγαίο', 'Levant', 'Levante'],
    },
    'caribbean': {'pattern': r'καραιβ|caribb|caribe|caraib', 'forms': ['Caribbean', 'Caribe', 'Caraïbes'], 'search_scope_hypotheses': []},
    'atlantic': {'pattern': r'ατλαντ|atlanti', 'forms': ['Atlantic', 'Atlantique', 'Atlantico'], 'search_scope_hypotheses': []},
}
VOCAB = {
    'greek': ('πειρατεία', 'ορμητήρια', 'περιηγητές'),
    'travellers': ('corsairs', 'harbours', 'voyages'),
    'british': ('piracy', 'anchorages', 'travels'),
    'french': ('corsaires', 'mouillages', 'voyage'),
    'venetian': ('corsari', 'porti', 'viaggio'),
    'italian_states': ('corsari', 'rifugi', 'viaggio'),
    'spanish_simancas': ('corsarios', 'puertos', 'viaje'),
    'ottoman': ('korsan', 'liman', 'seyahat'),
    'dutch': ('zeeroovers', 'havens', 'reizen'),
    'german': ('Seeräuber', 'Häfen', 'Reise'),
    'north_african': ('corsaires', 'ports', 'voyage'),
}

def explicit_topic_places(target):
    """Preserve capitalized place phrases explicitly supplied after a Greek preposition.

    These are query constraints, not resolved geographic identities. A compound
    such as «Νάουσα Πάρου» stays together to avoid treating another Ναουσα as
    a match merely because it has the same name.
    """
    pattern = r'(?i:\b(?:στην|στη|στον|στο|στις|στα|σε)\s+)([Α-ΩΆΈΉΊΌΎΏA-Z][α-ωάέήίόύώϊϋΐΰa-z]+(?:\s+[Α-ΩΆΈΉΊΌΎΏA-Z][α-ωάέήίόύώϊϋΐΰa-z]+){0,2})'
    return list(dict.fromkeys(m.group(1) for m in re.finditer(pattern, str(target))))

def topic_focus(target, kind='unknown', regions=()):
    text = normalized(target)
    words = re.findall(r'[^\W\d_]+', text)
    # Explicit thematic type always wins. Auto mode needs a subject concept and
    # prose; short pirate names continue through the existing identity path.
    if kind != 'topic' and not (len(words) >= 5 and re.search(PIRACY, text)):
        return None
    piracy = bool(re.search(PIRACY, text))
    scopes = [key for key, value in REGIONS.items() if re.search(value['pattern'], text)]
    explicit_places = explicit_topic_places(target) if not scopes else []
    return {'schema': 'pct-research-focus-v2', 'kind': 'topic', 'entity': target,
            'names': [], 'roles': [], 'places': list(dict.fromkeys([*regions, *explicit_places])),
            'topic_concepts': ['maritime_piracy'] if piracy else [],
            'base_usage_requested': bool(re.search(BASES, text)),
            'region_concepts': scopes,
            'interpretation': 'RETRIEVAL_CONCEPTS_NOT_HISTORICAL_ASSERTIONS'}

def region_terms(focus, include_hypotheses=False):
    terms = list(focus.get('places', []))
    for key in focus.get('region_concepts', []):
        value = REGIONS[key]
        terms.extend(value['forms'])
        if include_hypotheses:
            terms.extend(value['search_scope_hypotheses'])
    return list(dict.fromkeys(terms))

def topic_queries(focus, lane='travellers'):
    if 'maritime_piracy' not in focus.get('topic_concepts', []):
        return [' '.join(re.findall(r'[^\W_]+', focus['entity']))]
    event, base, genre = VOCAB.get(lane, VOCAB['travellers'])
    regions = region_terms(focus)
    preferred = {'greek': 'Μεσόγειος', 'french': 'Méditerranée', 'venetian': 'Mediterraneo',
                 'italian_states': 'Mediterraneo', 'spanish_simancas': 'Mediterráneo', 'ottoman': 'Akdeniz'}
    region = preferred.get(lane, 'Mediterranean') if 'mediterranean' in focus.get('region_concepts', []) else (regions[0] if regions else '')
    # The second route deliberately searches source genres. A travel book may
    # discuss corsairs on one page without indexing them in its catalogue title.
    # Catalogue descriptions often omit a geographic scope even when a book
    # contains relevant chapters. Preserve a bounded single-concept route;
    # acquisition triage still separates modern/software piracy and off-scope
    # records. A zero-result compound query must not exhaust discovery.
    queries = [f'{event} {region}', f'{genre} {region}',event,f'{event} {base} {region}']
    for key in focus.get('region_concepts', []):
        scopes = REGIONS[key]['search_scope_hypotheses']
        if scopes:
            scope = 'Archipel' if lane == 'french' else 'Arcipelago' if lane in ('venetian', 'italian_states') else scopes[0]
            queries.extend([f'{event} {scope}', f'{genre} {scope}'])
    return list(dict.fromkeys(q.strip() for q in queries if q.strip()))

def topic_match(text, focus):
    value = normalized(text)
    event = bool(re.search(PIRACY, value))
    places = strong_region_matches(text,focus)
    genre = bool(re.search(r'voyag|travel|viagg|περιηγ|portolan|seyahat|archipel|arcipel', value))
    return {'category': 'TARGET_MATCH' if event and places else 'POSSIBLE_TARGET' if event or (genre and places) else 'CONTEXT_ONLY' if places else 'UNMATCHED',
            'reason': 'THEMATIC_CONCEPT_AND_REGION' if event and places else 'THEMATIC_SCOPE_REQUIRES_PASSAGE_REVIEW',
            'matched_name': None, 'places': places, 'roles': [], 'topic_event_present': event,
            'identity_verified': False}

def strong_region_matches(text,focus):
    """Generic archipelago is a search hint, never Mediterranean geography."""
    value=normalized(text)
    ambiguous={'archipelago','archipel','arcipelago'}
    matches=[term for term in region_terms(focus,True) if normalized(term) not in ambiguous and normalized(term) in value]
    # A compound place supplied by the researcher may appear with a Greek
    # article between its components. Keep both components mandatory: a bare
    # «Νάουσα» must not be silently identified with the one on Paros.
    for term in focus.get('places', []):
        parts = normalized(term).split()
        if len(parts) == 2:
            pattern = r'(?<!\w)' + re.escape(parts[0]) + r'\s+(?:τησ\s+|του\s+)?' + re.escape(parts[1]) + r'(?!\w)'
            if re.search(pattern, value) and term not in matches:
                matches.append(term)
    for key in focus.get('region_concepts',[]):
        if re.search(REGIONS[key]['pattern'],value) and REGIONS[key]['forms'][0] not in matches:
            matches.append(REGIONS[key]['forms'][0])
    return matches

