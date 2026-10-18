"""Source-attributed paragraph extraction, separate from scientific verification.

This is a deterministic reading aid, not semantic model comprehension. Sections,
explicit names and year headings are retained as auditable association hypotheses.
No date, place, actor, printed page or original inspection is invented.
"""
from __future__ import annotations
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import urlsplit
from candidate_context import variants, STRONG, ACTION
from research_focus import decompose, fold, name_pattern

YEAR = re.compile(r'(?<!\d)(1\d{3}|20\d{2})(?!\d)')
# Historical predicates beyond piracy: administrative and diplomatic actions
# are relevant to a person research question too. All remain provisional.
PREDICATE = re.compile(r'\b(?:αιχμαλωτ\w*|συλλαμβ\w*|συλληψ\w*|επιτεθ\w*|επιτιθ\w*|επιδρομ\w*|λεηλατ\w*|φυλακ\w*|αποφυλακ\w*|διαμαρτυρ\w*|υπομνημα\w*|αποστελλ\w*|εστειλ\w*|αναλαμβ\w*|διορι\w*|συνεργαζ\w*|αναφερ\w*|βρισκεται|διαταγ\w*|απορριπτ\w*|αρχηγια|attacked|captured|imprisoned|appointed|reported|sent|petitioned|sailed|commanded|assal\w*|cattur\w*|nomm\w*|emprisonn\w*)\b')
FICTION = re.compile(r'\b(?:μυθιστορημα\w*|μυθοπλασ\w*|novel|fictional|libretto)\b')
SOCIAL = ('instagram.com','facebook.com','tiktok.com','youtube.com','linkedin.com')

def read(path, default=None):
    p=Path(path)
    return json.loads(p.read_text(encoding='utf-8')) if p.exists() else ({} if default is None else default)

def matches(text, terms):
    # Join only word hyphenation at a line break; never alter the stored quote
    # or its original offsets.
    surface=fold(re.sub(r'(?<=\w)[-\u00ad]\s*\r?\n\s*(?=\w)','',text))
    return [term for term in terms if re.search(name_pattern(term.split()),surface)]

def paragraphs(text):
    """Keep character offsets into the actual acquired text (including CRLF)."""
    for m in re.finditer(r'\S[\s\S]*?(?=\r?\n[ \t\r]*\n|\Z)',text):
        raw=m.group(0).rstrip()
        if raw:yield m.start(),m.start()+len(raw),raw

def locator(text, start, end, source, file):
    document=source.get('web_acquisition') or {}
    pages=[p for p in document.get('pages',[]) if p.get('end_char',-1)>start and p.get('start_char',0)<end]
    return {'url':source.get('url') or source.get('identifier'),'source_file':file,
            'start_char':start,'end_char':end,'start_line':text.count('\n',0,start)+1,
            'end_line':text.count('\n',0,end)+1,'printed_page':None,
            'scan_indexes_0_based':[p['scan_index_0_based'] for p in pages],
            'pdf_file':document.get('pdf_file'),'original_inspected':False}

def extract_document(text, source, file, ctx):
    terms=variants(ctx['target'],ctx.get('aliases',[]))
    kind=decompose(ctx['target'],ctx.get('aliases',[]))['kind']
    ranges=[int(y) for y in YEAR.findall(ctx.get('date_range',''))]
    lo,hi=(min(ranges),max(ranges)) if ranges else (0,9999)
    host=(urlsplit(str(source.get('url') or '')).hostname or '').lower()
    if any(host==h or host.endswith('.'+h) for h in SOCIAL):return []
    document_named=bool(matches(str(source.get('title') or ''),terms))
    # A surname is a retrieval/association hypothesis, never established identity.
    surnames=list(dict.fromkeys(t.split()[-1] for t in terms if kind=='person' and len(t.split())>=2))
    year_heading=None
    topic=None
    findings=[]
    for start,end,raw in paragraphs(text):
        header=re.fullmatch(r'\s*(1\d{3}|20\d{2})\s*',raw)
        if header:
            year_heading={'year':int(header.group(1)),'text':raw,'locator':locator(text,start,end,source,file)}
            continue
        # Exclude trailing bibliographic notes from action/date recognition, but
        # keep the complete raw excerpt and any mediated page citation intact.
        body=re.split(r'\([^)]*(?:Θησαυρίσματα|[Bb]ibliograph|[Pp]ublication)',raw,maxsplit=1)[0]
        direct=matches(body,terms)
        # A name hundreds of paragraphs earlier cannot identify a bare surname.
        near_topic=bool(topic and start-topic['locator']['end_char']<1600)
        short=matches(body,surnames) if document_named or near_topic else []
        other_name=False
        extended_name=False
        normalized_body=re.sub(r'(?<=\w)[-\u00ad]\s*\r?\n\s*(?=\w)','',body)
        first_names={fold(t.split()[0]) for t in terms if t.split()}
        for name in short:
            # A different explicit first name must not be collapsed into the
            # requested person merely because a surname is shared.
            for m in re.finditer(r'\b([^\W\d_]+)\s+'+re.escape(name)+r'\b',normalized_body,re.I):
                before=m.group(1)
                if before[0].isupper() and fold(before) not in first_names|{'ο','του','τον','η','της','την','the','captain','καπεταν','il','el','le','la','los','les','don','sir'}:other_name=True
        for name in direct:
            # A longer explicitly qualified name may identify a namesake. Do
            # not infer that e.g. "Name Surname di Otherplace" is the target.
            for hit in re.finditer(name_pattern(name.split()),fold(normalized_body)):
                tail=normalized_body[hit.end():hit.end()+90]
                if re.match(r'\s+(?:di|de|da|von|van)\s+[A-ZÀ-ÖØ-Þ][^\W\d_]+',tail):
                    extended_name=True
        if direct:topic={'text':raw,'locator':locator(text,start,end,source,file)}
        # Pronouns alone do not establish a person. They remain a section-context
        # lead only where an explicitly named paragraph is adjacent.
        continuity=bool(topic and not direct and not short and start-topic['locator']['end_char']<1600
                        and re.match(r'\s*(?:Στις αρχές|Το έτος αυτό|Αυτός|Εκείνος|He\b|Il\b|Egli\b)',raw,re.I))
        if not(direct or short or continuity):continue
        predicates=sorted(set(PREDICATE.findall(fold(body))))
        predicates+=sorted(set(m.group(0) for m in STRONG.finditer(body)))
        predicates+=sorted(set(m.group(0) for m in ACTION.finditer(body)))
        dates=sorted(set(int(y) for y in YEAR.findall(body)))
        # Never borrow a section year if this paragraph gives a conflicting date.
        date_basis='EXPLICIT_PARAGRAPH' if dates else 'YEAR_HEADING' if year_heading else 'UNRESOLVED'
        scoped=[y for y in dates if lo<=y<=hi]
        if not dates and year_heading and lo<=year_heading['year']<=hi:scoped=[year_heading['year']]
        fiction=bool(FICTION.search(fold(body)))
        name_basis='EXPLICIT_NAME' if direct else 'SURNAME_IN_NAMED_CONTEXT' if short else 'ADJACENT_TOPIC_UNRESOLVED'
        candidate=bool(scoped and predicates and not fiction and not continuity and not other_name and not extended_name
                       and (direct or document_named))
        uncertainties=['ORIGINAL_NOT_INSPECTED','SOURCE_GENEALOGY_PENDING','INDEPENDENCE_UNRESOLVED']
        if not direct:uncertainties.append('IDENTITY_ASSOCIATION_PROVISIONAL')
        if date_basis=='YEAR_HEADING':uncertainties.append('DATE_FROM_SECTION_HEADING')
        if len(dates)>1:uncertainties.append('MULTIPLE_DATES_REQUIRE_CLAUSE_REVIEW')
        if not scoped:uncertainties.append('DATE_OUTSIDE_SCOPE' if dates else 'EVENT_DATE_UNRESOLVED')
        if not predicates:uncertainties.append('ACTION_UNRESOLVED')
        if fiction:uncertainties.append('FICTION_OR_BOOK_REVIEW_CONTEXT')
        if other_name:uncertainties.append('CONFLICTING_GIVEN_NAME')
        if extended_name:uncertainties.append('EXTENDED_NAME_REQUIRES_IDENTITY_REVIEW')
        if short and not direct and not document_named:uncertainties.append('SURNAME_IDENTITY_UNRESOLVED')
        if re.search(r'\b(?:εικαζ\w*|πιθανο\w*|perhaps|possibly|allegedly|hypoth\w*)\b',fold(body)):uncertainties.append('SOURCE_EXPRESSES_UNCERTAINTY')
        cite_pages=re.findall(r'(?:σελ\.|pp?\.)\s*(\d+(?:[-–]\d+)?)',raw,re.I)
        key=hashlib.sha256((file+'|'+str(start)+'|'+str(end)).encode()).hexdigest()[:20]
        findings.append({'finding_id':'finding-'+key,'file':file,'line':text.count('\n',0,start)+1,
            'title':source.get('title'),'url':source.get('url') or source.get('identifier'),
            'identifier':source.get('identifier'),'repository':source.get('discovery_repository') or source.get('repository'),
            'source_type':(source.get('web_acquisition') or {}).get('source_type','ACQUIRED_TEXT'),
            'source_text_sha256':hashlib.sha256(text.encode()).hexdigest(),
            'evidence_excerpt':raw,'context_excerpt':raw,'context':raw,'place_match':(direct or short or [ctx['target']])[0],
            'target_entity':{'kind':kind,'observed_names':direct or short,'association_basis':name_basis,'identity_status':'UNVERIFIED'},
            'actor':'UNKNOWN','place':None,'event_terms':sorted(set(predicates)),
            'years_in_scope':scoped,'date_role':'POSSIBLE_EVENT_CONTEXT','date_basis':date_basis,
            'date_evidence':{'text':year_heading['text'],'locator':year_heading['locator']} if date_basis=='YEAR_HEADING' else None,
            'topic_evidence':topic if continuity else None,'locator':locator(text,start,end,source,file),
            'reported_cited_pages':cite_pages,'citation_relationship':'CITED_BY_CONSULTED_SOURCE' if cite_pages else 'UNRESOLVED',
            'decision':'RETAIN_CANDIDATE' if candidate else 'REVIEW_CONTEXT',
            'reason':'SOURCE_ATTRIBUTED_SECTION_FINDING' if candidate else 'UNRESOLVED_SECTION_FINDING',
            'extraction_method':'DETERMINISTIC_SECTION_READING','uncertainties':uncertainties,
            'evidence_state':'ACQUIRED','original_inspected':False,'verified':False})
    return findings

def build_findings(base, ctx):
    base=Path(base);root=base/'library_acquisition'
    results=read(root/'acquisition_report.json').get('results',[])
    by_file={}
    for source in results:
        for f in [*source.get('files',[]),*(source.get('web_acquisition') or {}).get('files',[])]:
            if str(f).endswith('.txt'):by_file[Path(f).name]=source
    findings=[]
    for file in sorted(root.glob('*.txt')):
        # No anonymous text may become a source-attributed finding.
        source=by_file.get(file.name)
        if source:findings.extend(extract_document(file.read_text(encoding='utf-8',errors='replace'),source,file.name,ctx))
    return {'schema':'pct-section-findings-v1','target':ctx['target'],'question':ctx.get('purpose'),
            'date_range':ctx.get('date_range'),'documents_considered':len(by_file),'findings':findings,
            'candidate_count':sum(f['decision']=='RETAIN_CANDIDATE' for f in findings),
            'method':'DETERMINISTIC_SECTION_READING','semantic_model_used':False,'verified':False}

def answer_report(report):
    findings=report.get('findings',[])
    dated=[f for f in findings if f['years_in_scope'] and not {'FICTION_OR_BOOK_REVIEW_CONTEXT','CONFLICTING_GIVEN_NAME',
           'EXTENDED_NAME_REQUIRES_IDENTITY_REVIEW','SURNAME_IDENTITY_UNRESOLVED'} & set(f['uncertainties'])]
    items=sorted(dated,key=lambda f:(f['years_in_scope'],f['finding_id']))
    return {'schema':'pct-source-attributed-answer-v1','question':report.get('question'),
            'target':report.get('target'),'date_range':report.get('date_range'),
            'status':'PROVISIONAL_SOURCE_FINDINGS' if items else 'INSUFFICIENT_ACQUIRED_EVIDENCE',
            'summary':f'Εντοπίστηκαν {len(items)} αποσπάσματα εντός της ζητούμενης περιόδου. Αποδίδονται στις πηγές τους και εκκρεμεί έλεγχος.',
            'findings':items,'unresolved_findings':len(findings)-len(items),
            'verified_claims':0,'limitations':['RULE_BASED_EXTRACTION_NOT_SEMANTIC_SYNTHESIS','ORIGINAL_INSPECTION_PENDING',
            'SOURCE_GENEALOGY_AND_CORROBORATION_PENDING','ACCESS_AND_SEARCH_COVERAGE_MAY_BE_PARTIAL'],
            'verified':False}

def render_answer(answer):
    lines=['# Ευρήματα από τις πηγές', '',str(answer.get('question') or answer.get('target')), '',answer['summary'],'']
    for f in answer['findings']:
        loc=f['locator'];year=', '.join(map(str,f['years_in_scope']))
        lines.extend([f'## {year} — {f.get("title") or f["file"]}', '',
            'Η πηγή αναφέρει (αυτόματη εξαγωγή από αποκτημένο κείμενο, χωρίς έλεγχο πρωτοτύπου):','',
            '> '+f['evidence_excerpt'].replace('\n','\n> '),'',
            f'Πηγή: {f.get("url")}; αρχείο {f["file"]}, γραμμές {loc["start_line"]}–{loc["end_line"]}.',
            'Βάση χρονολόγησης: '+f['date_basis']+'.',
            'Εκκρεμότητες: '+', '.join(f['uncertainties'])+'.',''])
    if not answer['findings']:lines.append('Δεν υπάρχει επαρκές αποκτημένο κείμενο για απάντηση στη συγκεκριμένη περίοδο. Αυτό δεν αποδεικνύει απουσία γεγονότων.')
    lines.extend(['','Η ανεξαρτησία των πηγών και οι πιθανές αντιφάσεις δεν έχουν ακόμη αξιολογηθεί.'])
    return '\n'.join(lines)+'\n'
