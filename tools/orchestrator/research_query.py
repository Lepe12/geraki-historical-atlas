"""Conservatively split explicit source-finding commands; preserve the question.

No place aliases, identities or historical dates are inferred. Unrecognized prose
is kept intact rather than silently assigning it to an invented entity.
"""
import re
import unicodedata

COMMAND = re.compile(
    r"^(?:(?:βρες|βρειτε|ψαξε|ψαξτε|αναζητησε|αναζητηστε)\s+(?:μου\s+)?(?:(?:πηγες|τεκμηρια|πληροφοριες)\s+)?"
    r"(?:για|σχετικα\s+με)|(?:find|search\s+for|look\s+for)\s+(?:sources|evidence|information)\s+"
    r"(?:about|for|on))(?:\s+|$)(?:(?:τον|την|το|τους|τις|τη|τα|the)\s+)?", re.I)
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

def split_research_query(target, date_range="", purpose=""):
    original = str(target).strip()
    folded,offsets = command_text(original)
    match = COMMAND.match(folded)
    if not match:
        return original, str(date_range).strip(), str(purpose).strip()
    value = original[offsets[match.end()-1]+1:].strip()
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
