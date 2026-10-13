"""Conservative candidate routing. Decisions are machine review, never verification."""
import json
import re

POLICY = 'pct-event-context-v1'
STRONG = re.compile(r'(?<!\w)(?:corsair\w*|corsaire\w*|corsar\w*|pirat\w*|forban\w*|privateer\w*|zeerover\w*|seer[aä]uber\w*|κουρσάρ\w*|πειρατ\w*|ransom\w*|ran[cç]on\w*|riscatt\w*|fidye\w*|captiv\w*|esclav\w*|schiav\w*|slaves?|slavery|αιχμαλωσ\w*|λύτρ\w*|pillage\w*|plunder\w*|λεηλασ\w*)(?!\w)', re.I)
ACTION = re.compile(r'(?<!\w)(?:attack\w*|attaqu\w*|attacc\w*|angriff\w*|ataque\w*|raid\w*|incursion\w*|assaut\w*|aanval\w*|captur\w*|cattur\w*|bombard\w*|burn\w*|br[uû]l\w*|incendi\w*|επιδρομ\w*)(?!\w)', re.I)
MARITIME = re.compile(r'(?<!\w)(?:ships?|vessels?|galleys?|gal[eè]r\w*|galera\w*|navir\w*|vaisseau\w*|navi|nave|schiff\w*|πλοί\w*|γαλέ\w*)(?!\w)', re.I)
GEOGRAPHY = re.compile(r'(?<!\w)(?:islands?|isles?|[iî]les?|insel\w*|isola|isole|islas?|ports?|porto|porti|puertos?|harbou?rs?|coasts?|villages?|towns?|cities|city|adalar?|liman\w*|νησί\w*|νήσο\w*|λιμάνι\w*|λιμέν\w*|en|dans|at|near|off|sur|στη|στην|στο|στον)(?!\w)', re.I)
CULTURAL = re.compile(r'(?<!\w)(?:librett\w*|operas?|drama per musica|zeitschrift f[uü]r musik|imperial painting|slavische rhapsodie)(?!\w)', re.I)
ROLE = re.compile(r'\b(?:born|birth|died|published|publication|edition|né|née|geboren|gestorben|έκδοση|γεννήθηκε)\b', re.I)


def variants(target, aliases):
    return list(dict.fromkeys(str(x).strip() for x in [target, *aliases] if str(x).strip()))


def assess(text, terms, lo=0, hi=9999):
    """Keep place/action/year linked locally, preserving unresolved leads."""
    output = []
    for term in terms:
        for place in re.finditer(r'(?<!\w)' + re.escape(term) + r'(?!\w)', text, re.I):
            start, end = max(0, place.start()-300), min(len(text), place.end()+300)
            previous=list(re.finditer(r'\n\s*\n',text[start:place.start()]))
            if previous: start+=previous[-1].end()
            following=re.search(r'\n\s*\n',text[place.end():end])
            if following: end=place.end()+following.start()
            context = text[start:end]
            local = text[max(start, place.start()-90):min(end,place.end()+90)]
            decision, reason = 'REVIEW_CONTEXT', 'NO_LOCAL_HISTORICAL_ACTION'
            strong = list(STRONG.finditer(context))
            weak = list(ACTION.finditer(context)) if MARITIME.search(context) else []
            events = strong + weak
            years = []
            if CULTURAL.search(context):
                decision, reason = 'REJECT_CONTEXT', 'CULTURAL_OR_NONHISTORICAL_NAME_CONTEXT'
            elif not GEOGRAPHY.search(local):
                reason = 'NAME_IDENTITY_UNRESOLVED'
            elif events:
                for year in re.finditer(r'\b(1[0-9]{3}|20[0-9]{2})\b', context):
                    value = int(year.group(0))
                    around = context[max(0,year.start()-40):year.end()+20]
                    if lo <= value <= hi and not ROLE.search(around) and any(abs(year.start()-event.start())<=180 for event in events):
                        years.append(value)
                decision, reason = ('RETAIN_CANDIDATE', 'LOCAL_PLACE_ACTION_YEAR') if years else ('REVIEW_CONTEXT', 'EVENT_DATE_UNRESOLVED')
            output.append({'place_match':place.group(0), 'line':text.count('\n',0,place.start())+1,
                           'years_in_scope':sorted(set(years)),
                           'event_terms':sorted(set(e.group(0) for e in events)),
                           'context_excerpt':context, 'context':context,
                           'place_resolution':'CONTEXT_SUPPORTED_PROVISIONAL' if GEOGRAPHY.search(local) else 'UNRESOLVED',
                           'date_role':'POSSIBLE_EVENT_CONTEXT' if years else 'UNRESOLVED',
                           'decision':decision,'reason':reason,'policy':POLICY})
    return output


def strings(value):
    if isinstance(value,str): return [value]
    if isinstance(value,list): return [v for v in value if isinstance(v,str)]
    return []


def catalogue_assess(record, terms, lo, hi):
    # Never search serialized raw JSON: contributors' lifespans, IDs and URLs
    # are not event evidence. Do not splice unrelated metadata fields together.
    output=[]
    for field in ('title','description'):
        for text in strings(record.get(field)):
            for hit in assess(text,terms,lo,hi):
                hit['source_field']=field
                output.append(hit)
    return output


def review_preserved(candidate, target, aliases, lo, hi):
    if candidate.get('source_type') == 'CATALOGUE_METADATA':
        try:
            record=json.loads(candidate.get('context_excerpt') or '')
        except (ValueError,TypeError):
            return {'decision':'REVIEW_CONTEXT','reason':'ORIGINAL_METADATA_MISSING','policy':POLICY}
        hits=catalogue_assess(record,variants(target,aliases),lo,hi)
    else:
        hits=assess(candidate.get('context_excerpt') or '', variants(target,aliases),lo,hi)
    retained=[h for h in hits if h['decision']=='RETAIN_CANDIDATE']
    return {'decision':'RETAIN_CANDIDATE' if retained else 'REVIEW_OR_EXCLUDE_FROM_EVENT_QUEUE',
            'reason':'LOCAL_CONTEXT_PRESENT' if retained else 'NO_SUPPORTED_LOCAL_PLACE_ACTION_YEAR',
            'policy':POLICY, 'verified':False}
