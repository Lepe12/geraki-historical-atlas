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
from research_focus import decompose, fold, name_pattern, extended_name_after, long_s_variant
from research_relevance import contextual_years, later_namesake_requires_review

YEAR = re.compile(r'(?<!\d)(1\d{3}|20\d{2})(?!\d)')
# Historical predicates beyond piracy: administrative and diplomatic actions
# are relevant to a person research question too. All remain provisional.
PREDICATE = re.compile(r'\b(?:αιχμαλωτ\w*|συλλαμβ\w*|συλληψ\w*|επιτεθ\w*|επιτιθ\w*|επιδρομ\w*|λεηλατ\w*|φυλακ\w*|αποφυλακ\w*|διαμαρτυρ\w*|υπομνημα\w*|αποστελλ\w*|εστειλ\w*|αναλαμβ\w*|διορι\w*|συνεργαζ\w*|αναφερ\w*|βρισκεται|διαταγ\w*|απορριπτ\w*|αρχηγια|attacked|captured|imprisoned|appointed|reported|sent|petitioned|sailed|commanded|assal\w*|cattur\w*|nomm\w*|emprisonn\w*)\b')
FICTION = re.compile(r'\b(?:μυθιστορημα\w*|μυθοπλασ\w*|novel|novela|romanzo|fictional|libretto)\b')
SOCIAL = ('instagram.com','facebook.com','tiktok.com','youtube.com','linkedin.com')

def read(path, default=None):
    p=Path(path)
    return json.loads(p.read_text(encoding='utf-8')) if p.exists() else ({} if default is None else default)

def matches(text, terms):
    # Join only word hyphenation at a line break; never alter the stored quote
    # or its original offsets.
    surface=fold(re.sub(r'(?<=\w)[-\u00ad]\s*\r?\n\s*(?=\w)','',text))
    return [term for term in terms if re.search(name_pattern(term.split()),surface)]

def section_continuation(source):
    value=(source or {}).get('section_continuation')
    if not isinstance(value,dict) or not value.get('anchor_canvas') or not value.get('anchor_name'):return None
    if value.get('manifest_url')!=(source or {}).get('manifest_url'):return None
    return value

def ocr_variant_matches(text, terms, found=()):
    """Terms absent from the surface text but present in their long-s OCR form."""
    return [t for t in terms if t not in found and long_s_variant(t) and matches(text,[long_s_variant(t)])]

def name_forms(name):
    return [name,*([long_s_variant(name)] if long_s_variant(name) else [])]

HEADING_SECTION_CHARS=1800
# A following page of a named section (section_continuation) is read as one
# verbatim block up to this many characters, instead of only name-centred
# paragraphs: such pages continue the story with pronouns, abbreviated or
# OCR-fused names. Identity stays provisional; text beyond the cap keeps the
# ordinary paragraph rule.
CONTINUATION_PAGE_CHARS=2400

def continuation_block(text, paras):
    """(start,end,raw) exact slice over whole paragraphs, bounded by the cap."""
    if not paras:return None
    start=paras[0][0];end=paras[0][1]
    for _,e,_ in paras[1:]:
        if e-start>CONTINUATION_PAGE_CHARS:break
        end=e
    if end-start>CONTINUATION_PAGE_CHARS:
        cut=text.rfind(' ',start,start+CONTINUATION_PAGE_CHARS)
        end=cut if cut>start else start+CONTINUATION_PAGE_CHARS
    return start,end,text[start:end]

def heading_like(raw):
    """A one-line, mainly upper-case section heading such as 'JEAN CAPSI.'."""
    line=raw.strip()
    letters=[c for c in line if c.isalpha()]
    return bool('\n' not in line and 0<len(line)<=80 and letters
                and sum(c.isupper() for c in letters)>=0.6*len(letters))

def name_heading(raw, terms):
    """A heading that consists of the requested name only (case-insensitive)."""
    line=raw.strip()
    if '\n' in line or len(line)>80:return False
    bare=fold(re.sub(r'[\W\d_]+',' ',line)).strip()
    names={fold(form) for t in terms for form in name_forms(t)}
    return heading_like(line) or bare in names

def heading_section_end(text, paras, index):
    """End offset of the section governed by a name heading.

    The section runs over the following paragraphs up to the next heading or
    HEADING_SECTION_CHARS. The excerpt is an exact slice of the acquired text,
    so its offsets stay valid and nothing is paraphrased or invented.
    """
    start,end,_=paras[index]
    stop=end
    for _,e,raw in paras[index+1:]:
        if heading_like(raw):break
        if e-start>HEADING_SECTION_CHARS:
            cut=text.rfind(' ',stop,start+HEADING_SECTION_CHARS)
            if stop==end and cut>stop:stop=cut
            break
        stop=e
    return stop

def paragraphs(text):
    """Keep character offsets into the actual acquired text (including CRLF)."""
    for m in re.finditer(r'\S[\s\S]*?(?=\r?\n[ \t\r]*\n|\Z)',text):
        raw=m.group(0).rstrip()
        if raw:yield m.start(),m.start()+len(raw),raw

def read_acquired_text(path):
    # Character locators must retain CRLF and every other source character.
    with Path(path).open(encoding='utf-8',errors='replace',newline='') as stream:return stream.read()

def locator(text, start, end, source, file):
    document=source.get('web_acquisition') or {}
    pages=[p for p in document.get('pages',[]) if p.get('end_char',-1)>start and p.get('start_char',0)<end]
    return {'url':source.get('url') or source.get('identifier'),'source_file':file,
            'start_char':start,'end_char':end,'start_line':text.count('\n',0,start)+1,
            'end_line':text.count('\n',0,end)+1,'printed_page':None,
            'scan_indexes_0_based':[p['scan_index_0_based'] for p in pages],
            'pdf_file':document.get('pdf_file'),
            'pdf_reference_base':document.get('pdf_reference_base','LANE_ROOT'),
            'original_inspected':False}

def extract_document(text, source, file, ctx):
    terms=variants(ctx['target'],ctx.get('aliases',[]))
    focus=decompose(ctx['target'],ctx.get('aliases',[]))
    kind=focus['kind']
    if kind=='topic':
        return extract_topic_document(text,source,file,ctx,focus)
    ranges=[int(y) for y in YEAR.findall(ctx.get('date_range',''))]
    lo,hi=(min(ranges),max(ranges)) if ranges else (0,9999)
    host=(urlsplit(str(source.get('url') or '')).hostname or '').lower()
    if any(host==h or host.endswith('.'+h) for h in SOCIAL):return []
    document_named=bool(matches(str(source.get('title') or ''),terms))
    # Set by full-text discovery only for following pages of the same work after a
    # page that names the target in full; a surname there stays provisional.
    continuation=section_continuation(source)
    # A surname is a retrieval/association hypothesis, never established identity.
    surnames=list(dict.fromkeys(t.split()[-1] for t in terms if kind=='person' and len(t.split())>=2))
    year_heading=None
    topic=None
    findings=[]
    paras=list(paragraphs(text))
    page_block=None
    if kind=='person' and continuation and not document_named:
        page_block=continuation_block(text,paras)
        if page_block:paras=[page_block,*[p for p in paras if p[0]>=page_block[1]]]
    consumed_until=-1
    for index,(start,end,raw) in enumerate(paras):
        if end<=consumed_until:continue
        header=re.fullmatch(r'\s*(1\d{3}|20\d{2})\s*',raw)
        if header:
            year_heading={'year':int(header.group(1)),'text':raw,'locator':locator(text,start,end,source,file)}
            continue
        # Exclude trailing bibliographic notes from action/date recognition, but
        # keep the complete raw excerpt and any mediated page citation intact.
        body=re.split(r'\([^)]*(?:Θησαυρίσματα|[Bb]ibliograph|[Pp]ublication)',raw,maxsplit=1)[0]
        direct=matches(body,terms)
        ocr_names=ocr_variant_matches(body,terms,direct)
        direct=direct+ocr_names
        section_heading=False
        if direct and name_heading(raw,terms):
            # A bare name heading is not a passage: keep the section it governs.
            new_end=heading_section_end(text,paras,index)
            if new_end>end:
                section_heading=True
                end=new_end;raw=text[start:end];consumed_until=end
                body=re.split(r'\([^)]*(?:Θησαυρίσματα|[Bb]ibliograph|[Pp]ublication)',raw,maxsplit=1)[0]
        # A name hundreds of paragraphs earlier cannot identify a bare surname.
        near_topic=bool(topic and start-topic['locator']['end_char']<1600)
        short=matches(body,surnames) if document_named or near_topic or continuation else []
        if document_named or near_topic or continuation:
            ocr_short=ocr_variant_matches(body,surnames,short)
            ocr_names+=ocr_short;short=short+ocr_short
        other_name=False
        extended_name=False
        normalized_body=re.sub(r'(?<=\w)[-\u00ad]\s*\r?\n\s*(?=\w)','',body)
        first_names={fold(t.split()[0]) for t in terms if t.split()}
        for name in short:
            # A different explicit first name must not be collapsed into the
            # requested person merely because a surname is shared.
            forms='|'.join(re.escape(form) for form in name_forms(name))
            for m in re.finditer(r'\b([^\W\d_]+)\s+(?:'+forms+r')\b',normalized_body,re.I):
                before=m.group(1)
                # A single unpunctuated letter is an OCR'd drop capital, not a given name.
                if len(before)>1 and before[0].isupper() and fold(before) not in first_names|{'ο','του','τον','η','της','την','the','captain','καπεταν','il','el','le','la','los','les','don','sir'}:other_name=True
        for name in direct:
            # A longer explicitly qualified name may identify a namesake. Do
            # not infer that e.g. "Name Surname di Otherplace" is the target.
            for form in name_forms(name):
                for hit in re.finditer(name_pattern(form.split()),fold(normalized_body)):
                    if extended_name_after(normalized_body,hit.end()):
                        extended_name=True
        if direct:topic={'text':raw,'locator':locator(text,start,end,source,file)}
        # Pronouns alone do not establish a person. They remain a section-context
        # lead only where an explicitly named paragraph is adjacent.
        continuity=bool(topic and not direct and not short and start-topic['locator']['end_char']<1600
                        and re.match(r'\s*(?:Στις αρχές|Το έτος αυτό|Αυτός|Εκείνος|He\b|Il\b|Egli\b)',raw,re.I))
        block=bool(page_block and start==page_block[0])
        if not(direct or short or continuity or block):continue
        predicates=sorted(set(PREDICATE.findall(fold(body))))
        predicates+=sorted(set(m.group(0) for m in STRONG.finditer(body)))
        predicates+=sorted(set(m.group(0) for m in ACTION.finditer(body)))
        dates=contextual_years(body)
        # Never borrow a section year if this paragraph gives a conflicting date.
        date_basis='EXPLICIT_PARAGRAPH' if dates else 'YEAR_HEADING' if year_heading else 'UNRESOLVED'
        scoped=[y for y in dates if lo<=y<=hi]
        if not dates and year_heading and lo<=year_heading['year']<=hi:scoped=[year_heading['year']]
        fiction=bool(FICTION.search(fold(body)))
        name_basis='EXPLICIT_NAME' if direct else 'SURNAME_IN_NAMED_CONTEXT' if short else 'SECTION_CONTINUATION_PAGE_UNNAMED' if block else 'ADJACENT_TOPIC_UNRESOLVED'
        later_identity=kind=='person' and not (ranges and lo>=1750) and later_namesake_requires_review(body+' '+ ' '.join(str(y) for y in scoped),focus)
        candidate=bool(not later_identity and scoped and predicates and not fiction and not continuity and not other_name and not extended_name
                       and (direct or document_named))
        uncertainties=['ORIGINAL_NOT_INSPECTED','SOURCE_GENEALOGY_PENDING','INDEPENDENCE_UNRESOLVED']
        if later_identity:uncertainties.append('LATER_NAMESAKE_REQUIRES_IDENTITY_REVIEW')
        if not direct:uncertainties.append('IDENTITY_ASSOCIATION_PROVISIONAL')
        if date_basis=='YEAR_HEADING':uncertainties.append('DATE_FROM_SECTION_HEADING')
        if len(dates)>1:uncertainties.append('MULTIPLE_DATES_REQUIRE_CLAUSE_REVIEW')
        if not scoped:uncertainties.append('DATE_OUTSIDE_SCOPE' if dates else 'EVENT_DATE_UNRESOLVED')
        if not predicates:uncertainties.append('ACTION_UNRESOLVED')
        if fiction:uncertainties.append('FICTION_OR_BOOK_REVIEW_CONTEXT')
        if other_name:uncertainties.append('CONFLICTING_GIVEN_NAME')
        if extended_name:uncertainties.append('EXTENDED_NAME_REQUIRES_IDENTITY_REVIEW')
        if ocr_names:uncertainties.append('OCR_LONG_S_NAME_VARIANT')
        if section_heading:uncertainties.append('NAME_FROM_SECTION_HEADING')
        if block:uncertainties.append('SECTION_CONTINUATION_PAGE_BLOCK')
        if block and not(direct or short):uncertainties.append('NO_TARGET_NAME_ON_CONTINUATION_PAGE')
        if short and not direct and not document_named and not continuation:uncertainties.append('SURNAME_IDENTITY_UNRESOLVED')
        if short and not direct and continuation and not document_named:uncertainties.append('SURNAME_FROM_ADJACENT_NAMED_PAGE')
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

def extract_topic_document(text, source, file, ctx, focus):
    """Retain real topical passages without requiring an absent person's name.

    An unresolved date is retained as uncertainty, never filled from publication
    metadata. Long OCR paragraphs are sliced at real character offsets.
    """
    from research_topics import PIRACY, BASES, topic_match
    scope=[int(y) for y in YEAR.findall(ctx.get('date_range',''))]
    lo,hi=(min(scope),max(scope)) if scope else (0,9999)
    findings=[]
    pattern=re.compile(PIRACY)
    for start,end,raw in paragraphs(text):
        if not pattern.search(fold(raw)):
            continue
        spans=[]
        if len(raw)<=3500:
            spans=[(start,end,raw)]
        else:
            # Offsets map through accent folding (Greek characters retain one
            # position in this normalization). Search original word surfaces.
            for hit in re.finditer(r'(?i)\b(?:cor[sſf]air\w*|corsar\w*|pirat\w*|korsan\w*|πειρατ\w*|κουρσ\w*)',raw):
                a=max(start,start+hit.start()-650);b=min(end,start+hit.end()+950)
                if spans and a<=spans[-1][1]:
                    a=spans[-1][0];spans[-1]=(a,b,text[a:b])
                else:spans.append((a,b,text[a:b]))
        for a,b,quote in spans:
            years=contextual_years(quote)
            scoped=[y for y in years if lo<=y<=hi]
            uncertainties=['ORIGINAL_NOT_INSPECTED','SOURCE_GENEALOGY_PENDING','INDEPENDENCE_UNRESOLVED',
                           'TOPONYM_AND_USAGE_REQUIRE_SEMANTIC_EXTRACTION']
            if not scoped:uncertainties.append('EVENT_DATE_UNRESOLVED' if not years else 'DATE_OUTSIDE_SCOPE')
            fiction=bool(FICTION.search(fold(quote)))
            if fiction:uncertainties.append('FICTION_OR_BOOK_REVIEW_CONTEXT')
            match=topic_match(quote,focus)
            if not match['places']:uncertainties.append('REGIONAL_SCOPE_REQUIRES_REVIEW')
            candidate=bool(scoped and not fiction and re.search(BASES,fold(quote)))
            findings.append({'finding_id':'section-'+hashlib.sha256((file+str(a)+quote).encode()).hexdigest()[:20],
                'file':file,'title':source.get('title'),'url':source.get('acquired_source_url') or source.get('url'),
                'source_bibliography':{key:source.get(key) for key in ('creator','date','source_type','evidence_level','rights')},
                'source_text_sha256':hashlib.sha256(text.encode()).hexdigest(),
                'evidence_excerpt':quote,'years_in_scope':scoped,'date_basis':'EXPLICIT_PARAGRAPH' if years else 'UNRESOLVED',
                'date_evidence':None,'matched_names':[],'name_basis':'THEMATIC_CONCEPT',
                'locator':locator(text,a,b,source,file),'reported_cited_pages':[],
                'decision':'RETAIN_CANDIDATE' if candidate else 'REVIEW_CONTEXT',
                'reason':'THEMATIC_SOURCE_PASSAGE_NOT_VERIFIED_BASE',
                'extraction_method':'DETERMINISTIC_THEMATIC_PASSAGE_READING','uncertainties':uncertainties,
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
        if source:
            rows=extract_document(read_acquired_text(file),source,file.name,ctx)
            for row in rows:row['source_text_sha256']=hashlib.sha256(file.read_bytes()).hexdigest()
            findings.extend(rows)
    return {'schema':'pct-section-findings-v1','target':ctx['target'],'question':ctx.get('purpose'),
            'date_range':ctx.get('date_range'),'documents_considered':len(by_file),'findings':findings,
            'candidate_count':sum(f['decision']=='RETAIN_CANDIDATE' for f in findings),
            'method':'DETERMINISTIC_SECTION_READING','semantic_model_used':False,'verified':False}

def answer_report(report):
    findings=report.get('findings',[])
    dated=[f for f in findings if f['years_in_scope'] and not {'FICTION_OR_BOOK_REVIEW_CONTEXT','CONFLICTING_GIVEN_NAME',
           'EXTENDED_NAME_REQUIRES_IDENTITY_REVIEW','SURNAME_IDENTITY_UNRESOLVED','LATER_NAMESAKE_REQUIRES_IDENTITY_REVIEW'} & set(f['uncertainties'])]
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

