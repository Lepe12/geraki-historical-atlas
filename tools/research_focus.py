"""Request-derived search facets and conservative topical matching.

Facets are search constraints, never historical assertions. No person/place
dictionary or unsubstantiated historical alias is injected into a request.
"""
import re
import unicodedata


def fold(text):
    return ''.join(c for c in unicodedata.normalize('NFD', str(text or ''))
                   if not unicodedata.combining(c)).casefold()


ROLE = r'(?:βασιλια(?:ς)?|βασιλε(?:υς|ας)|κυβερνητη(?:ς)?|πειρατη(?:ς)?|ναυαρχο(?:ς)?|καπετανιο(?:ς)?|king|governor|pirate|admiral|captain)'
ROLE_CLAUSE = re.compile((r'\s*[,;—–-]?\s+(' + ROLE + r')\s+(?:(?:της|τησ|του|των|of(?:\s+the)?)\s+)(.+)$').replace('ς','σ'))
STOP = {'βρες','πληροφοριες','πηγες','τεκμηρια','ιστορια','ψαξε','για','τον','την','του','της','και','the','find','about','history','information','of','on','island','port'}


def _words(text):
    return re.findall(r'[^\W\d_]+', str(text), re.UNICODE)


def decompose(target, aliases=(), purpose='', kind='unknown', regions=()):
    """Split an explicit name + role + place clause, preserving original text."""
    target=str(target).strip()
    # Match on a folded surface with original offsets (including decomposed Greek).
    surface=[]; offsets=[]
    for i,c in enumerate(target):
        for f in fold(c):
            surface.append(f); offsets.append(i)
    match=ROLE_CLAUSE.search(''.join(surface))
    person=target; roles=[]; places=list(regions or [])
    if match:
        person=target[:offsets[match.start()]].strip(' ,;—–-')
        roles=[target[offsets[match.start(1)]:offsets[match.end(1)-1]+1]]
        places.append(target[offsets[match.start(2)]:].strip(' .;,:?'))
        kind='person'
    words=_words(person)
    # A bare two/three-word name is only a retrieval hypothesis. Avoid treating
    # arbitrary prose as a person. Explicit place/event types always win.
    name_like=(2 <= len(words) <= 3 and not any(fold(w) in STOP for w in words)
               and (all(w[0].isupper() for w in words) or
                    (len(words)==2 and all(re.fullmatch(r'[α-ω]+',fold(w)) for w in words))))
    if kind in ('unknown','auto','all') and name_like:
        kind='person'
    return {'schema':'pct-research-focus-v1','kind':kind,'entity':person,
            'names':list(dict.fromkeys([person,*[str(a).strip() for a in aliases if str(a).strip()]])),
            'roles':roles,'places':list(dict.fromkeys(p for p in places if p)),
            'interpretation':'REQUEST_CONSTRAINTS_NOT_VERIFIED_FACTS'}


def focused_queries(focus, qualifiers=()):
    """Every query retains a complete name, or surname with explicit context."""
    queries=[]
    contexts=[*focus.get('places',[]),*focus.get('roles',[])]
    for name in focus['names']:
        q='"'+name.replace('"','')+'"'
        for context in contexts:
            queries.append(q+' "'+context.replace('"','')+'"')
        queries.append(q)
        # Mechanical Greek inflection search hypothesis, not a historical alias.
        # E.g. a supplied accusative name may be indexed in the nominative.
        nominative=' '.join(w+'ς' if fold(w).endswith('η') else w for w in name.split())
        if nominative!=name and focus['kind']=='person':
            nq='"'+nominative.replace('"','')+'"'
            queries.append(nq)
            for context in contexts: queries.append(nq+' "'+context.replace('"','')+'"')
        words=_words(name)
        if focus['kind']=='person' and len(words)>=2:
            surname=words[-1]
            for context in contexts:
                queries.append('"'+surname+'" "'+context.replace('"','')+'"')
        for qualifier in qualifiers:
            if str(qualifier).strip(): queries.append(q+' '+str(qualifier).strip())
    return list(dict.fromkeys(queries))


def _token_match(text, name):
    """Bounded Greek inflection tolerance; no first-name-only identity match."""
    n=fold(name)
    if re.search(r'[α-ω]',n):
        n=re.sub(r'(?:ησ|η|οσ|ου|ασ|α|εσ|ε|ο)$','',n)
        if len(n)>=3:
            return bool(re.search(r'(?<!\w)'+re.escape(n)+r'(?:ησ|η|οσ|ου|ασ|α|εσ|ε|ο|ων|ουσ)?(?!\w)',text))
    return bool(re.search(r'(?<!\w)'+re.escape(fold(name))+r'(?!\w)',text))


def topical_match(record, focus):
    # Query text, repository names and source_lead flags are intentionally absent:
    # what was searched cannot establish what the source is about.
    text=fold(' '.join(str(record.get(k) or '') for k in
              ('title','description','subject','context_excerpt','metadata_text','text','snippet')))
    places=[p for p in focus.get('places',[]) if _token_match(text,p)]
    roles=[r for r in focus.get('roles',[]) if _token_match(text,r)]
    for name in focus['names']:
        words=_words(name)
        if focus['kind']=='person' and len(words)>=2:
            # Surname AND at least one given-name token; a matching given name
            # by itself is never a match. Still a candidate, never verified identity.
            if _token_match(text,words[-1]) and any(_token_match(text,w) for w in words[:-1]):
                constrained=bool(focus.get('places') or focus.get('roles'))
                return {'category':'POSSIBLE_TARGET' if constrained and not (places or roles) else 'TARGET_MATCH',
                        'reason':'NAME_WITHOUT_REQUEST_CONTEXT' if constrained and not (places or roles) else 'NAME_TOKENS_IN_SOURCE',
                        'matched_name':name,'places':places,'roles':roles}
            if _token_match(text,words[-1]) and (places or roles):
                return {'category':'POSSIBLE_TARGET','reason':'SURNAME_WITH_REQUEST_CONTEXT','matched_name':name,'places':places,'roles':roles}
        elif name and re.search(r'(?<!\w)'+re.escape(fold(name))+r'(?!\w)',text):
            return {'category':'TARGET_MATCH','reason':'TARGET_PHRASE_IN_SOURCE','matched_name':name,'places':places,'roles':roles}
    return {'category':'CONTEXT_ONLY' if places else 'UNMATCHED',
            'reason':'REQUEST_PLACE_ONLY' if places else 'NO_TARGET_IDENTITY_MATCH',
            'matched_name':None,'places':places,'roles':roles}
