"""Gazetteer-based place disambiguation (Edinburgh-geoparser idea, simplified).

A mention of the target place by an *ambiguous* name (one that Wikidata also
gives to a geographic item far away, e.g. Argentière in Haute-Savoie for
Kimolos) counts as on-target only when a context name of the target co-occurs:
its island group, admin unit, sea, neighbouring places, or historical region
terms (e.g. Milo, Cyclades, Archipel, Levant). Unambiguous names count alone.

Context only, never evidence. Callers hold back, never delete.
Cache: data/gazetteer/place_context.v1.json (tools/build_place_context.py).
"""
import json
import re
from functools import lru_cache
from pathlib import Path

from search_priority import HOMONYMS, fold, homonym_check

CACHE = Path(__file__).resolve().parents[1] / 'data/gazetteer/place_context.v1.json'
ON_TARGET, AMBIGUOUS, OTHER_PLACE, NO_MENTION = 'ON_TARGET', 'AMBIGUOUS_NO_CONTEXT', 'OTHER_PLACE_HOMONYM', 'NO_MENTION'


@lru_cache(maxsize=4)
def _load(path):
    try:
        return json.loads(Path(path).read_text(encoding='utf-8')).get('places', {})
    except (OSError, ValueError):
        return {}


def _matcher(names):
    """Single words match by prefix (declension/OCR endings: Κιμώλου, Argentiera);
    multi-word names match as a whole phrase."""
    from excerpt_prefilter import name_prefixes
    words = [n for n in names if len(n.split()) == 1]
    phrases = [fold(n) for n in names if len(n.split()) > 1]
    prefixes = name_prefixes(words)
    phrase = re.compile('|'.join(r'(?<![^\W\d_])%s(?![^\W\d_])' % re.escape(p) for p in phrases)) if phrases else None

    def match(folded_text, toks):
        for t in toks:
            for p in prefixes:
                if t.startswith(p):
                    return t
        m = phrase.search(folded_text) if phrase else None
        return m.group(0) if m else None
    return match


def profile(names, cache=None):
    """Context and ambiguous names for the place the request names (union over matches)."""
    places = _load(str(cache or CACHE))
    wanted = {fold(n) for n in names if n}
    context, ambiguous, ids = [], {}, []
    for pid, p in places.items():
        if wanted & {fold(n) for n in p.get('names', [])}:
            ids.append(pid)
            context += [n for n in p.get('context', []) if n not in context]
            ambiguous.update(p.get('ambiguous_names', {}))
    # Names with a known homonym rule (search_priority.HOMONYMS) are ambiguous too.
    for n in names:
        if any(re.search(h['name'], fold(n)) for h in HOMONYMS):
            ambiguous.setdefault(n, [{'rule': h['id']} for h in HOMONYMS if re.search(h['name'], fold(n))])
    amb_folded = {fold(n) for n in ambiguous}
    clear = [n for n in names if n and fold(n) not in amb_folded]
    amb = [n for n in names if n and fold(n) in amb_folded]
    return {'place_ids': ids, 'context': context, 'clear_names': clear, 'ambiguous_names': amb,
            'ambiguous_detail': {n: ambiguous.get(n) or next((v for k, v in ambiguous.items() if fold(k) == fold(n)), [])
                                 for n in amb}}


def classify(text, names, prof=None):
    """(status, detail) for one text against the request's place names."""
    from excerpt_prefilter import dehyphenate
    from excerpt_ranking import tokens
    prof = prof or profile(names)
    t = fold(dehyphenate(text))
    toks = tokens(t)
    hit = _matcher(prof['clear_names'])(t, toks)
    if hit:
        return ON_TARGET, 'NAME:' + hit
    amb = _matcher(prof['ambiguous_names'])(t, toks)
    if not amb:
        return NO_MENTION, None
    if homonym_check(text, names):
        return OTHER_PLACE, 'HOMONYM:' + amb
    if not prof['context']:
        # No context places known for this name: cannot disambiguate, so do not hold.
        return ON_TARGET, 'AMBIGUOUS_NAME_NO_CONTEXT_KNOWN:' + amb
    ctx = _matcher(prof['context'])(t, toks)
    if ctx:
        return ON_TARGET, 'AMBIGUOUS_NAME_WITH_CONTEXT:%s+%s' % (amb, ctx)
    return AMBIGUOUS, 'AMBIGUOUS_NAME_WITHOUT_CONTEXT:' + amb
