"""Request-derived search facets and conservative topical matching.

Facets are search constraints, never historical assertions. Supplied names
stay in the request. Cross-language spellings are retrieval hypotheses and
are not written back as attested aliases.
"""
import re
import unicodedata


def fold(text):
    return ''.join(c for c in unicodedata.normalize('NFD', str(text or ''))
                   if not unicodedata.combining(c)).casefold()


ROLE = r'(?:βασιλια(?:ς)?|βασιλε(?:υς|ας)|κυβερνητη(?:ς)?|πειρατη(?:ς)?|ναυαρχο(?:ς)?|καπετανιο(?:ς)?|king|governor|pirate|admiral|captain)'
ROLE_CLAUSE = re.compile((r'\s*[,;—–-]?\s+(' + ROLE + r')\s+(?:(?:της|τησ|του|των|of(?:\s+the)?)\s+)(.+)$').replace('ς','σ'))
ALTERNATE_NAMES = re.compile(r'\s+(?:/|\||·)\s+')
STOP = {'βρες','πληροφοριες','πηγες','τεκμηρια','ιστορια','ψαξε','για','τον','την','του','της','και','the','find','about','history','information','of','on','island','port'}
# Search equivalents for a supplied given name. They are retrieval hypotheses,
# never attested aliases and never written into focus['names'].
_GIVEN_EQUIVALENTS = {
    'Ιωάννης': ('Giovanni','Juan','John','Jean','Ioannes'),
    'Ιωάννη': ('Giovanni','Juan','John','Jean','Ioannes'),
    'Ioannis': ('Giovanni','Juan','John','Jean','Ioannes'),
    'Ioannes': ('Giovanni','Juan','Jean','John'),
    'Giovanni': ('Juan','Jean','John','Ioannes'),
    'Juan': ('Giovanni','Jean','John','Ioannes'),
    'Jean': ('Giovanni','Juan','John','Ioannes'),
    'John': ('Giovanni','Juan','Jean','Ioannes'),
    'Johannes': ('Giovanni','Juan','John'),
    'Πέτρος': ('Pietro','Pedro','Pierre','Peter'),
    'Πέτρου': ('Pietro','Pedro','Pierre','Peter'),
    'Πέτρο': ('Pietro','Pedro','Pierre','Peter'),
    'Petros': ('Pietro','Pedro','Pierre','Peter'),
    'Petrus': ('Pietro','Pedro','Peter'),
    'Pietro': ('Pedro','Pierre','Peter'),
    'Pedro': ('Pietro','Pierre','Peter'),
    'Pierre': ('Pietro','Pedro','Peter'),
    'Peter': ('Pietro','Pedro','Pierre'),
}
_GREEK_LATIN = dict(zip('αβγδεζηθικλμνξοπρστυφχψω',
                        ['a','v','g','d','e','z','i','th','i','k','l','m','n','x','o','p','r','s','t','y','f','ch','ps','o']))
GIVEN_EQUIVALENTS = {fold(key): values for key,values in _GIVEN_EQUIVALENTS.items()}


def _words(text):
    return re.findall(r'[^\W\d_]+', str(text), re.UNICODE)


def split_supplied_names(target):
    """Split an explicit bilingual name pair. Do not split prose or places."""
    text=str(target).strip()
    parts=[part.strip(' .;') for part in ALTERNATE_NAMES.split(text) if part.strip()]
    def nameish(part):
        words=_words(part.split(',')[0])
        return 2<=len(words)<=4 and len(part)<=90 and not any(ch.isdigit() for ch in part)
    if len(parts)<2 or not all(nameish(part) for part in parts):
        return [text]
    return parts


def _split_role(target):
    """Return person, role words and place from one explicit clause."""
    target=str(target).strip()
    surface=[]; offsets=[]
    for i,c in enumerate(target):
        for f in fold(c):
            surface.append(f); offsets.append(i)
    match=ROLE_CLAUSE.search(''.join(surface))
    if not match:
        return target,[],[]
    person=target[:offsets[match.start()]].strip(' ,;—–-')
    roles=[target[offsets[match.start(1)]:offsets[match.end(1)-1]+1]]
    places=[target[offsets[match.start(2)]:].strip(' .;,:?')]
    return person,roles,places


def _latin_token(token):
    text=fold(token).replace('ου','ou').replace('ντ','nt').replace('μπ','mp')
    return ''.join(_GREEK_LATIN.get(c,c) for c in text)


def _surname_orthography(latin):
    """Mechanical orthography only: k/c, -is/-i, ντζ/nz. Not an attested alias."""
    forms=[latin]
    if latin.startswith('k') and len(latin)>2:
        forms.append('c'+latin[1:])
    more=[]
    for form in forms:
        if form.endswith('is') and len(form)>4:
            more.append(form[:-1])
        elif form.endswith('i') and len(form)>3:
            more.append(form+'s')
        if 'ntz' in form:
            simplified=form.replace('ntz','nz')
            more.append(simplified)
            if simplified.endswith('s'):
                more.append(simplified[:-1])
        if form.endswith('nza'):
            more.extend((form[:-3]+'ntza', form+'s', form[:-3]+'ntzas'))
        elif form.endswith('nzas'):
            more.extend((form[:-1], form[:-4]+'ntza', form[:-4]+'ntzas'))
    return list(dict.fromkeys([*forms,*more]))


def decompose(target, aliases=(), purpose='', kind='unknown', regions=()):
    """Split an explicit name + role + place clause, preserving original text."""
    from research_topics import topic_focus
    topic = topic_focus(target, kind, regions)
    if topic:
        return topic
    supplied=split_supplied_names(target)
    target=supplied[0]
    aliases=[*supplied[1:], *[str(a).strip() for a in aliases if str(a).strip()]]
    person,roles,places=_split_role(target)
    places=[*list(regions or []),*places]
    names=[person]
    for alias in aliases:
        alias_person,alias_roles,alias_places=_split_role(alias)
        if alias_person:
            names.append(alias_person)
        roles.extend(alias_roles)
        places.extend(alias_places)
        if alias_roles:
            kind='person'
    if roles:
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
            'names':list(dict.fromkeys(n for n in names if n)),
            'roles':list(dict.fromkeys(roles)),'places':list(dict.fromkeys(p for p in places if p)),
            'interpretation':'REQUEST_CONSTRAINTS_NOT_VERIFIED_FACTS'}


def focused_queries(focus, qualifiers=(), include_hypotheses=False):
    """Every query retains a complete name, or surname with explicit context."""
    if focus['kind'] == 'topic':
        from research_topics import topic_queries
        return topic_queries(focus)
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
        if focus['kind']=='person' and len(words)>=2:
            queries.append('"'+words[-1]+', '+' '.join(words[:-1])+'"')
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
    for name in focus['names']:
        if re.search(r'[α-ω]',fold(name)):
            names.append(_latin_token(name))
    if focus.get('kind')=='person':
        extras=[]
        seen={fold(n) for n in names}
        for name in list(focus['names']):
            words=_words(name)
            if len(words)<2:
                continue
            given,surname=words[0],words[-1]
            base=_latin_token(surname)
            surnames=_surname_orthography(base)
            # Prefer Capsi/Lanza over another copy of the direct transliteration.
            ranked=sorted((s for s in surnames if s!=base), key=lambda s:(
                not (s.endswith('i') or s.endswith('nza')),
                not ('ntz' in base and 'nz' in s and 'ntz' not in s),
                s))
            forms=[ranked[0]] if ranked else []
            if base not in forms:
                forms.append(base)
            for given_form in GIVEN_EQUIVALENTS.get(fold(given),()):
                for surname_form in forms:
                    candidate=given_form+' '+surname_form[:1].upper()+surname_form[1:]
                    key=fold(candidate)
                    if key in seen:
                        continue
                    seen.add(key)
                    extras.append(candidate)
                    if len(extras)>=6:
                        break
                if len(extras)>=6:
                    break
            if len(extras)>=6:
                break
        names.extend(extras)
    return list(dict.fromkeys(names))


def _token_pattern(name):
    """Bounded Greek inflection tolerance; no first-name-only identity match."""
    n=fold(name)
    if re.search(r'[α-ω]',n):
        n=re.sub(r'(?:ησ|η|οσ|ου|ασ|α|εσ|ε|ο)$','',n)
        if len(n)>=3:
            return r'(?<!\w)'+re.escape(n)+r'(?:ησ|η|οσ|ου|ασ|α|εσ|ε|ο|ων|ουσ)?(?!\w)'
    return r'(?<!\w)'+re.escape(fold(name))+r'(?!\w)'


def name_pattern(parts):
    """Forward names or explicit surname-comma-given catalogue notation."""
    gap=r'[\s,.-]{1,8}(?:[^\W\d_]\.[\s]{0,4})?'
    forward=gap.join(_token_pattern(w) for w in parts)
    reversed_name=_token_pattern(parts[-1])+r'\s*,\s*'+gap.join(_token_pattern(w) for w in parts[:-1])
    return '(?:'+forward+'|'+reversed_name+')'


def _token_match(text,name):
    return bool(re.search(_token_pattern(name),text))


def extended_name_after(original, folded_end):
    """Detect a qualified/compound name without mistaking 'e la storia' for it.

    Map folded positions to original characters so the surname's capital is
    available. Names supplied in full are matched before their shorter aliases.
    """
    length=0;end=0
    for end,char in enumerate(original,1):
        length+=len(fold(char))
        if length>=folded_end:break
    tail=original[end:end+100]
    extension=re.match(r'(?:\s*,?\s+(?:di|de|da|von|van|e)\s+|[-–])([^\W\d_]+)',tail)
    return bool(extension and extension.group(1)[0].isupper())


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
    # A name in an authorship clause is not evidence that the book is about
    # that person. Retain it provisionally unless another field supports subject relevance.
    creator=record.get('creator') or record.get('author')
    if creator and focus['kind']=='person':
        creator_hit=_topical_match_segment({'text':str(creator)},focus)
        if creator_hit.get('matched_name'):
            for match in matches:
                words=_words(match.get('matched_name') or '')
                if match.get('matched_field')=='title' and len(words)>=2:
                    attribution=r'(?<!\w)(?:by|di|par|por|von|του|τησ)\s+'+name_pattern(words)
                    if re.search(attribution,fold(record.get('title',''))):
                        match.update(category='POSSIBLE_TARGET',reason='AUTHORSHIP_NOT_SUBJECT_EVIDENCE')
    return min(matches,key=lambda m:order[m['category']]) if matches else _topical_match_segment({},focus)


def _topical_match_segment(record, focus):
    # Query text, repository names and source_lead flags are intentionally absent:
    # what was searched cannot establish what the source is about.
    original=' '.join(str(record.get(k) or '') for k in
              ('title','description','subject','context_excerpt','metadata_text','text','snippet'))
    text=fold(original)
    if focus['kind'] == 'topic':
        from research_topics import topic_match
        return topic_match(original, focus)
    places=[p for p in focus.get('places',[]) if _token_match(text,p)]
    roles=[r for r in focus.get('roles',[]) if _token_match(text,r)]
    for name in sorted(focus['names'],key=len,reverse=True):
        words=_words(name)
        if focus['kind']=='person' and len(words)>=2:
            # Surname AND at least one given-name token; a matching given name
            # by itself is never a match. Still a candidate, never verified identity.
            # Name parts must occur together, not anywhere in a long catalogue
            # description (e.g. one author called Ioannis and another Kapsis).
            gap=r'[\s,.-]{1,8}(?:[^\W\d_]\.[\s]{0,4})?'
            pattern=name_pattern(words)
            name_hit=re.search(pattern,text)
            if name_hit:
                if extended_name_after(original,name_hit.end()):
                    return {'category':'POSSIBLE_TARGET','reason':'EXTENDED_NAME_REQUIRES_IDENTITY_REVIEW',
                            'matched_name':name,'places':places,'roles':roles}
                local=text[max(0,name_hit.start()-180):name_hit.end()+180]
                places=[p for p in focus.get('places',[]) if _token_match(local,p)]
                roles=[r for r in focus.get('roles',[]) if _token_match(local,r)]
                constrained=bool(focus.get('places') or focus.get('roles'))
                context_ok=bool(places) if focus.get('places') else bool(roles)
                return {'category':'POSSIBLE_TARGET' if constrained and not context_ok else 'TARGET_MATCH',
                        'reason':'NAME_WITHOUT_REQUEST_CONTEXT' if constrained and not context_ok else 'NAME_TOKENS_IN_SOURCE',
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
            pattern=name_pattern(words)
            if re.search(pattern,text):
                return {'category':'POSSIBLE_TARGET','reason':'TRANSLITERATION_REQUIRES_IDENTITY_REVIEW',
                        'matched_name':name,'places':places,'roles':roles,'query_hypothesis':True}
    return {'category':'CONTEXT_ONLY' if places else 'UNMATCHED',
            'reason':'REQUEST_PLACE_ONLY' if places else 'NO_TARGET_IDENTITY_MATCH',
            'matched_name':None,'places':places,'roles':roles}
