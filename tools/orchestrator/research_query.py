"""Conservatively split explicit source-finding commands; preserve the question.

No place aliases, identities or historical dates are inferred. Unrecognized prose
is kept intact rather than silently assigning it to an invented entity.
"""
import re

COMMAND = re.compile(
    r"^(?:(?:βρες|βρείτε|ψάξε|αναζήτησε)\s+(?:μου\s+)?(?:πηγές|τεκμήρια|πληροφορίες)\s+"
    r"(?:για|σχετικά\s+με)|(?:find|search\s+for|look\s+for)\s+(?:sources|evidence|information)\s+"
    r"(?:about|for|on))\s+(?:(?:τον|την|το|τους|τις|τη|τα|the)\s+)?", re.I)
DATES = re.compile(r"(?<!\d)(\d{3,4})\s*[-–—]\s*(\d{3,4})(?!\d)")
PERIOD = re.compile(r"\s+(?:(?:την|τη|στην|στη)\s+)?(?:περίοδο|μεταξύ|κατά|between|during|from)\s*$", re.I)

def split_research_query(target, date_range="", purpose=""):
    original = str(target).strip()
    match = COMMAND.match(original)
    if not match:
        return original, str(date_range).strip(), str(purpose).strip()
    value = original[match.end():].strip()
    dates = DATES.search(value)
    # Only strip a trailing explicit date range. Interior dates may be a title.
    if dates and not value[dates.end():].strip(" .;,:?"):
        if date_range and DATES.fullmatch(str(date_range).strip()) and (
            tuple(DATES.fullmatch(str(date_range).strip()).groups()) != dates.groups()
        ):
            raise ValueError("CONFLICTING_EXPLICIT_DATE_RANGES")
        date_range = str(date_range).strip() or "-".join(dates.groups())
        value = PERIOD.sub("", value[:dates.start()].rstrip(" ,;:"))
    value = value.strip(" .;,:?«»\"")
    if not value:
        raise ValueError("RESEARCH_QUERY_REQUIRES_TARGET")
    return value, str(date_range).strip(), str(purpose).strip() or original
