"""Conservatively split explicit source-finding commands; preserve the question.

No place aliases, identities or historical dates are inferred. Unrecognized prose
is kept intact rather than silently assigning it to an invented entity.
"""
import re
import unicodedata

# Instruction wording around the thing being asked about. The verb, optional
# "μου", optional noun ("στοιχεία", "πληροφορίες", ...) and optional "για" are
# all instruction, never part of the entity («Βρες στοιχεία για Κρεβελιέ»).
_GREEK_VERB = (r"(?:βρες|βρεις|βρειτε|βρε|ψαξε|ψαξεις|ψαξτε|ψαχνε|αναζητησε|αναζητησεις|αναζητηστε|"
               r"ερευνησε|ερευνα|μαζεψε|φερε|δειξε|πες|θελω|θελουμε)")
_GREEK_NOUN = (r"(?:(?:ιστορικα\s+|ολα\s+τα\s+|τα\s+)?(?:πηγες|πηγη|τεκμηρια|πληροφοριες|πληροφορια|αναφορες|στοιχεια|στοιχειο|"
               r"ιστορια|ιστορικο|υλικο|κειμενα|βιβλιογραφια|ντοκουμεντα|αρχεια))")
_ENGLISH = (r"(?:find|search(?:\s+for)?|look\s+(?:for|up)|tell\s+me|show\s+me)\s+(?:me\s+)?"
            r"(?:(?:sources|evidence|information|info|references|material|data|documents|everything)\s+)?"
            r"(?:(?:about|for|on|to|regarding)\s+)?")
COMMAND = re.compile(
    r"^(?:" + _GREEK_VERB + r"\s+(?:μου\s+|μας\s+)?(?:" + _GREEK_NOUN + r"\s+)?(?:(?:για|σχετικα\s+με|περι)\b\s*)?"
    r"|(?:τι\s+(?:ξερεις|ξερουμε|γνωριζεις)|ποιος\s+ηταν|ποια\s+ηταν|ποιο\s+ηταν)\s+(?:(?:για|σχετικα\s+με)\s+)?"
    r"|" + _ENGLISH +
    r"|(?:who\s+was|what\s+do\s+you\s+know\s+about)\s+)"
    r"(?:(?:τον|την|το|τους|τις|τη|τα|του|της|ο|η|the)\s+)?", re.I)
DATES = re.compile(r"(?<!\d)(\d{3,4})\s*[-–—]\s*(\d{3,4})(?!\d)")
PERIOD = re.compile(r"\s+(?:(?:την|τη|στην|στη)\s+)?(?:περιοδο|μεταξυ|κατα|between|during|from)\s*$", re.I)

def command_text(value):
    """Fold only the matching surface, with offsets into the original spelling."""
    chars=[];offsets=[]
    for pos,char in enumerate(value):
        for folded in unicodedata.normalize("NFD",char).casefold():
            if not unicodedata.combining(folded):
                chars.append(folded);offsets.append(pos)
    return "".join(chars),offsets

ALTERNATE_NAMES = re.compile(r"\s+(?:/|\||·)\s+")


def split_supplied_names(target):
    """Split an explicit bilingual name pair. Do not split prose or places."""
    text = str(target).strip()
    parts = [part.strip(" .;") for part in ALTERNATE_NAMES.split(text) if part.strip()]

    def nameish(part):
        words = re.findall(r"[^\W\d_]+", part.split(",")[0], re.UNICODE)
        return 2 <= len(words) <= 4 and len(part) <= 90 and not any(ch.isdigit() for ch in part)

    if len(parts) < 2 or not all(nameish(part) for part in parts):
        return [text]
    return parts


def split_research_query(target, date_range="", purpose=""):
    original = str(target).strip()
    folded,offsets = command_text(original)
    preamble = re.match(r"^(?:θελω\s+να|θα\s+ηθελα\s+να|μπορεις\s+να)\s+",folded,re.I)
    command_start=preamble.end() if preamble else 0
    match = COMMAND.match(folded[command_start:])
    if not match:
        # A short explicit name followed by a range is unambiguous; arbitrary
        # prose remains intact rather than guessing its entity.
        dates=DATES.search(original)
        head=original[:dates.start()].strip() if dates else ''
        words=re.findall(r'[^\W\d_]+',head,re.UNICODE)
        # Thematic questions are not person names. Preserve their entire
        # wording while retaining an explicit trailing range as a filter.
        if dates and not original[dates.end():].strip(' .;,:?') and re.search(r'πειρατ|κουρσαρ|pirat|corsair|corsar', command_text(head)[0]):
            supplied=DATES.fullmatch(str(date_range).strip()) if date_range else None
            if supplied and supplied.groups()!=dates.groups():
                raise ValueError('CONFLICTING_EXPLICIT_DATE_RANGES')
            return original, str(date_range).strip() or '-'.join(dates.groups()), str(purpose).strip() or original
        if not (dates and not original[dates.end():].strip(' .;,:?') and 1<=len(words)<=4 and all(w[0].isupper() for w in words)):
            return original, str(date_range).strip(), str(purpose).strip()
        value=original
    else:
        value = original[offsets[command_start+match.end()-1]+1:].strip()
    dates = DATES.search(value)
    # Only strip a trailing explicit date range. Interior dates may be a title.
    if dates and not value[dates.end():].strip(" .;,:?"):
        if date_range and DATES.fullmatch(str(date_range).strip()) and (
            tuple(DATES.fullmatch(str(date_range).strip()).groups()) != dates.groups()
        ):
            raise ValueError("CONFLICTING_EXPLICIT_DATE_RANGES")
        date_range = str(date_range).strip() or "-".join(dates.groups())
        value = value[:dates.start()].rstrip(" ,;:")
        period = PERIOD.search(command_text(value)[0])
        if period:
            value = value[:command_text(value)[1][period.start()]]
    value = value.strip(" .;,:?«»\"")
    if not value:
        raise ValueError("RESEARCH_QUERY_REQUIRES_TARGET")
    return value, str(date_range).strip(), str(purpose).strip() or original



# Descriptors after (or before) the name: «Κρεβελιέ τον κουρσάρο», «τον
# πειρατή Κρεβελιέ», "Henry Morgan the pirate". They tell us the request is
# about a person; they are search context, never part of the name. Stems are
# deliberately loose (κουρσατο is a real owner typo for κουρσάρο).
ROLE_STEMS = (
    ("κουρσα", "κουρσάρος"), ("κορσα", "κουρσάρος"), ("κουρσε", "κουρσάρος"),
    ("πειρατ", "πειρατής"), ("καπετα", "καπετάνιος"), ("ναυαρχ", "ναύαρχος"),
    ("ρεις", "ρεΐς"), ("corsa", "corsair"), ("pirat", "pirate"),
    ("privateer", "privateer"), ("buccaneer", "buccaneer"), ("captain", "captain"),
    ("admiral", "admiral"),
)
PLACE_WORDS = re.compile(
    r"^(?:(?:το|τη|την|στο|στη|στην)\s+)?(?:νησι|νησο|νησος|νησακι|λιμανι|ορμο|ορμος|ακρωτηρι|χωριο|πολη)\s+"
    r"(?:(?:της|του|τη|το)\s+)?", re.I)
_ARTICLE = r"(?:τον|την|το|του|της|ο|η|the)"


def _role_of(folded_word):
    for stem, canonical in ROLE_STEMS:
        if folded_word.startswith(stem):
            return canonical
    return None


def peel_descriptors(value):
    """Return (entity, role_terms, place_hint) for one extracted target.

    Only a trailing «[article] [adjective] role» or a leading «[article] role»
    is removed; the name itself is never rewritten.
    """
    entity = str(value).strip(" .;,:?«»\"")
    roles = []
    folded, offsets = command_text(entity)
    place = PLACE_WORDS.match(folded)
    if place and place.end() < len(folded):
        entity = entity[offsets[place.end() - 1] + 1:].strip()
        folded, offsets = command_text(entity)
    else:
        place = None
    # Trailing descriptor: ", τον κουρσάρο" / "τον γάλλο κουρσάρο" / "the pirate".
    trailing = re.search(r"(?:\s*,\s*|\s+)(?:(" + _ARTICLE + r")\s+)?(?:([^\W\d_]+)\s+)?([^\W\d_]+)\s*$", folded)
    if trailing and _role_of(trailing.group(3)):
        if trailing.group(1) or not trailing.group(2):
            cut = trailing.start()
        else:
            # No article: never swallow a name word as an "adjective"
            # ("Henry Morgan corsair" keeps Morgan).
            cut = trailing.start(3)
        head = entity[:offsets[cut]].strip(" ,") if cut < len(offsets) else entity
        if head and re.search(r"[^\W\d_]", head):
            roles.append(_role_of(trailing.group(3)))
            entity = head
            folded, offsets = command_text(entity)
    # Leading descriptor: «τον κουρσάρο Κρεβελιέ», "the pirate Henry Morgan".
    leading = re.match(r"(?:" + _ARTICLE + r"\s+)?([^\W\d_]+)\s+(?=\S)", folded)
    if leading and _role_of(leading.group(1)):
        rest = entity[offsets[leading.end() - 1] + 1:].strip()
        if rest and rest[0].isupper():
            roles.append(_role_of(leading.group(1)))
            entity = rest
    return entity, list(dict.fromkeys(roles)), bool(place)


def extract_research_focus(target, date_range="", purpose=""):
    """Split a natural question into the thing being asked about.

    Returns target/date_range/purpose (as split_research_query) plus a
    request-level hint: kind ('person' when a role such as κουρσάρος/pirate
    surrounds the name, 'place' for «το νησί …»), role_terms, and whether an
    instruction was removed. The original question always stays in purpose.
    """
    original = str(target).strip()
    value, dates, scope = split_research_query(original, date_range, purpose)
    instruction = value != original
    roles, place_hint = [], False
    if instruction or len(re.findall(r"[^\W\d_]+", value)) <= 4:
        entity, roles, place_hint = peel_descriptors(value)
        words = re.findall(r"[^\W\d_]+", entity)
        # Without an instruction, only peel a role off something that looks
        # like a name ("Henry Morgan corsair"), never off ordinary prose.
        name_like = instruction or (1 <= len(words) <= 3 and all(w[0].isupper() for w in words))
        if entity and entity != value and name_like and (instruction or roles or place_hint):
            value = entity
        elif not instruction:
            roles, place_hint = [], False
    kind = "person" if roles else "place" if place_hint else None
    return {
        "target": value,
        "date_range": dates,
        "purpose": scope or (original if value != original else str(purpose).strip()),
        "kind_hint": kind,
        "role_terms": roles,
        "instruction_removed": value != original,
        "original_question": original,
    }
