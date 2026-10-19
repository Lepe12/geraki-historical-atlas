"""Conservatively split explicit source-finding commands; preserve the question.

No place aliases, identities or historical dates are inferred. Unrecognized prose
is kept intact rather than silently assigning it to an invented entity.
"""
import re
import unicodedata

COMMAND = re.compile(
    r"^(?:(?:βρες|βρεις|βρειτε|ψαξε|ψαξεις|ψαξτε|αναζητησε|αναζητησεις|αναζητηστε)\s+(?:μου\s+)?(?:(?:πηγες|τεκμηρια|πληροφοριες|αναφορες)\s+)?"
    r"(?:για|σχετικα\s+με)|(?:find|search\s+for|look\s+for)\s+(?:sources|evidence|information|references)\s+"
    r"(?:about|for|on|to))(?:\s+|$)(?:(?:τον|την|το|τους|τις|τη|τα|the)\s+)?", re.I)
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
        folded_head,_=command_text(head)
        eventish=bool(re.search(r"πειρατ|κουρσ|επιδρομ|pirac|corsair|privateer|(?<!\w)raid",folded_head))
        capitalized=bool(words) and all(w[0].isupper() for w in words)
        # A short name, or a short place plus an explicit event word, may carry
        # a trailing range. Ordinary prose stays intact.
        if not (dates and not original[dates.end():].strip(' .;,:?') and 1<=len(words)<=4 and (capitalized or eventish)):
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
