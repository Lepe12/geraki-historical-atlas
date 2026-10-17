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
    # Operators commonly submit a natural-language instruction instead of a bare
    # target. Remove only known leading instruction phrases, not internal words.
    # Otherwise an exact-match archive query becomes \"βρες πληροφορίες για ...\".
    if kind == 'person':
        person=re.sub(
            r'^(?:(?:βρες|ψαξε|αναζητησε)\\s+(?:(?:μου|μας)\\s+)?'
            r'(?:(?:πληροφοριες|πηγες|τεκμηρια|στοιχεια)\\s+)?'
            r'(?:για\\s+)?|(?:find|search)\\s+(?:(?:sources|information)\\s+)?'
            r'(?:about\\s+|for\\s+)?)(?:(?:τον|την|το|the)\\s+)?',
            '', fold(person), count=1
        ) if re.match(r'^(?:βρες|ψαξε|αναζητησε|find|search)\\b',fold(person)) else person
        # Keep the original orthography of names where no instruction is present.
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


def focused_queries(focus, qualifiers=(), include_hypotheses=False):
    """Every query retains a complete name, or surname with explicit context."""
    queries=[]
    contexts=[*focus.get('places',[]),*focus.get('roles',[])]
    batches=[]
    for name in (retrieval_names(focus) if include_hypotheses else focus['names']):
        queries=[]
        q='"'+name.replace('"','')+'"'
        queries.append(q)
        # Mechanical Greek inflection search hypothesis, not a historical alias.
        # E.g. a supplied accusative name may be indexed in the nominative.
        nominative=' '.join(w+'ς' if fold(w).endswith('η') else w for w in name.split())
        nq=None
        if nominative!=name and focus['kind']=='person':
            nq='"'+nominative.replace('"','')+'"'
            queries.append(nq)
        words=_words(name)
        if focus['kind']=='person' and len(words)>=2:
            surname=words[-1]
            for context in contexts:
                queries.append('"'+surname+'" "'+context.replace('"','')+'"')
        # The first three queries must cover name spelling and a contextual
        # route even on repositories capped at three requests. Do not spend
        # that whole budget on increasingly strict copies of one inflection.
        for context in contexts:
            queries.append(q+' "'+context.replace('"','')+'"')
            if nq: queries.append(nq+' "'+context.replace('"','')+'"')
        for qualifier in qualifiers:
            if str(qualifier).strip(): queries.append(q+' '+str(qualifier).strip())
        batches.append(queries)
    # Cover each supplied spelling before spending the budget on qualifiers.
    from itertools import zip_longest
    return list(dict.fromkeys(q for group in zip_longest(*batches) for q in group if q))


def retrieval_names(focus):
    """Mechanical cross-script search hypotheses, never attested aliases.

    Keep these out of focus['names'] so matching/verification cannot silently
    promote a transliteration to a historically established identity.
    """
    names=list(focus['names'])
    greek=dict(zip('αβγδεζηθικλμνξοπρστυφχψω',
                   ['a','v','g','d','e','z','i','th','i','k','l','m','n','x','o','p','r','s','t','y','f','ch','ps','o']))
    for name in focus['names']:
        if re.search(r'[α-ω]',fold(name)):
            text=fold(name).replace('ου','ou').replace('ντ','nt').replace('μπ','mp')
            names.append(''.join(greek.get(c,c) for c in text))
    return list(dict.fromkeys(names))


def _token_pattern(name):
    """Bounded Greek inflection tolerance; no first-name-only identity match."""
    n=fold(name)
    if re.search(r'[α-ω]',n):
        n=re.sub(r'(?:ησ|η|οσ|ου|ασ|α|εσ|ε|ο)$','',n)
        if len(n)>=3:
            return r'(?<!\w)'+re.escape(n)+r'(?:ησ|η|οσ|ου|ασ|α|εσ|ε|ο|ων|ουσ)?(?!\w)'
    return r'(?<!\w)'+re.escape(fold(name))+r'(?!\w)'


def _token_match(text,name):
    return bool(re.search(_token_pattern(name),text))


def topical_match(record, focus):
    # Independent metadata fields/list entries cannot form a person's name.
    # Prefer a complete match even if an earlier field contains only a surname.
    fields=('title','description','subject','context_excerpt','metadata_text','text','snippet')
    segments=[]
    for key in fields:
        value=record.get(key)
        for item in value if isinstance(value,list) else [value]:
            if item:
                segments.append((key,str(item)))
    order={'TARGET_MATCH':0,'POSSIBLE_TARGET':1,'CONTEXT_ONLY':2,'UNMATCHED':3}
    matches=[{**_topical_match_segment({'text':value},focus),'matched_field':key}
             for key,value in segments]
    return min(matches,key=lambda m:order[m['category']]) if matches else _topical_match_segment({},focus)


def _topical_match_segment(record, focus):
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
            # Name parts must occur together, not anywhere in a long catalogue
            # description (e.g. one author called Ioannis and another Kapsis).
            gap=r'[\s,.-]{1,8}(?:[^\W\d_]\.[\s]{0,4})?'
            pattern=gap.join(_token_pattern(w) for w in words)
            name_hit=re.search(pattern,text)
            if name_hit:
                local=text[max(0,name_hit.start()-180):name_hit.end()+180]
                places=[p for p in focus.get('places',[]) if _token_match(local,p)]
                roles=[r for r in focus.get('roles',[]) if _token_match(local,r)]
                constrained=bool(focus.get('places') or focus.get('roles'))
                return {'category':'POSSIBLE_TARGET' if constrained and not (places or roles) else 'TARGET_MATCH',
                        'reason':'NAME_WITHOUT_REQUEST_CONTEXT' if constrained and not (places or roles) else 'NAME_TOKENS_IN_SOURCE',
                        'matched_name':name,'places':places,'roles':roles}
            for hit in re.finditer(_token_pattern(words[-1]),text):
                local=text[max(0,hit.start()-180):hit.end()+180]
                local_places=[p for p in focus.get('places',[]) if _token_match(local,p)]
                local_roles=[r for r in focus.get('roles',[]) if _token_match(local,r)]
                if local_places or local_roles:
                    return {'category':'POSSIBLE_TARGET','reason':'SURNAME_WITH_REQUEST_CONTEXT','matched_name':name,'places':local_places,'roles':local_roles}
        elif name and re.search(r'(?<!\w)'+re.escape(fold(name))+r'(?!\w)',text):
            return {'category':'TARGET_MATCH','reason':'TARGET_PHRASE_IN_SOURCE','matched_name':name,'places':places,'roles':roles}
    # Cross-script full-name matches remain explicitly provisional. Mechanical
    # spelling is useful retrieval evidence, never proof of historical identity.
    if focus['kind']=='person':
        for name in retrieval_names(focus):
            if name in focus['names']:continue
            words=_words(name)
            if len(words)<2:continue
            pattern=r'[\s,.-]{1,8}'.join(_token_pattern(w) for w in words)
            if re.search(pattern,text):
                return {'category':'POSSIBLE_TARGET','reason':'TRANSLITERATION_REQUIRES_IDENTITY_REVIEW',
                        'matched_name':name,'places':places,'roles':roles,'query_hypothesis':True}
    return {'category':'CONTEXT_ONLY' if places else 'UNMATCHED',
            'reason':'REQUEST_PLACE_ONLY' if places else 'NO_TARGET_IDENTITY_MATCH',
            'matched_name':None,'places':places,'roles':roles}
