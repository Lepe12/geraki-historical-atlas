#!/usr/bin/env python3
"""Search book contents before catalogue triage can discard an unseen actor.

IA's full-text endpoint follows internetarchive/search.py (_full_text_search).
IIIF search services and page locators are read from each manifest, not guessed.
Transliterations are query hypotheses, never attested aliases or verified identity.
"""
from __future__ import annotations
import concurrent.futures, datetime, hashlib, json, os, re, time
from pathlib import Path
from html import unescape
from html.parser import HTMLParser
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen
from research_focus import decompose, fold, retrieval_names, name_pattern, extended_name_after, long_s_variant

IA_FTS='https://be-api.us.archive.org/ia-pub-fts-api'
GREEK=dict(zip('αβγδεζηθικλμνξοπρστυφχψω',
              ['a','v','g','d','e','z','i','th','i','k','l','m','n','x','o','p','r','s','t','y','f','ch','ps','o']))
ROLE_VOCAB={
    'βασιλ':('king','roi','roy','reign','regne','konig','koenig','herrscher','souverain','maitre','rex','re','rey','rei','βασιλ'),
    'king':('king','roi','roy','reign','regne','konig','koenig','herrscher','souverain','maitre','rex','re','rey','rei','βασιλ'),
    'κυβερνη':('governor','gouverneur','governatore','κυβερνη'),
    'governor':('governor','gouverneur','governatore','κυβερνη'),
    'πειρατ':('pirat','corsair','corsar','πειρατ'),
    'pirate':('pirat','corsair','corsar','πειρατ'),
    'ναυαρχ':('admiral','amiral','ammiraglio','ναυαρχ'),
    'admiral':('admiral','amiral','ammiraglio','ναυαρχ'),
    'καπεταν':('captain','capitain','capitano','καπεταν'),
    'captain':('captain','capitain','capitano','καπεταν'),
}


def norm(value):
    return fold(str(value)).replace('ſ','s')


def transliterate(value):
    return ''.join(GREEK.get(c,c) for c in norm(value).replace('ου','ou'))


def spelling_hypotheses(value, place=False):
    """Bounded mechanical search forms. These do not establish a name alias."""
    latin=transliterate(value)
    forms=[latin]
    if place and latin.endswith('ou'):
        forms=[latin[:-2]+'o',latin[:-2]+'os',latin]
    elif not place and latin.endswith('i'):
        forms.append(latin+'s')
    if latin.startswith('k'):
        forms.insert(1,'c'+latin[1:])
        if not place and latin.endswith('i'):forms.append('c'+latin[1:]+'s')
    # Nominative -ης transliterates to -is; catalogues also use the -i form.
    if not place:
        for form in list(forms):
            if form.endswith('is') and len(form)>4:
                forms.append(form[:-1])
                if form.startswith('k'):forms.append('c'+form[1:-1])
    forms.append(str(value))
    return list(dict.fromkeys(x for x in forms if len(x)>=3))[:6]


def search_terms(focus):
    if focus['kind']=='topic':
        return ['corsair','corsaire','corsaro','pirate','korsan','πειρατ'] if 'maritime_piracy' in focus.get('topic_concepts',[]) else []
    out=[]
    for name in focus['names']:
        words=name.split()
        entity=words[-1] if focus['kind']=='person' and len(words)>=2 else name
        out.extend(spelling_hypotheses(entity,focus['kind']=='place'))
    return list(dict.fromkeys(out))[:8]


def context_terms(focus):
    if focus['kind']=='topic':
        from research_topics import region_terms
        return region_terms(focus,True)
    return list(dict.fromkeys(x for place in focus.get('places',[]) for x in spelling_hypotheses(place,True)))[:12]


def _term_hit(text, term):
    """Short role words must be whole words; longer stems stay prefixes."""
    trailing=r'(?!\w)' if len(term)<=3 else ''
    return re.search(r'(?<!\w)'+re.escape(term)+trailing, text)


def role_terms(focus):
    return list(dict.fromkeys(t for role in focus.get('roles',[]) for key,terms in ROLE_VOCAB.items()
                             if norm(role).startswith(key) for t in terms))


def ia_queries(focus, limit=8):
    """Search complete supplied names before surname/OCR recovery hypotheses."""
    if focus['kind']=='topic':
        from research_topics import topic_queries
        return list(dict.fromkeys(topic_queries(focus)+topic_queries(focus,'french')))[:limit]
    queries=[]
    if focus['kind']=='person':
        # Supplied spellings stay ahead of mechanical hypotheses so a short
        # result limit still searches the name the user actually wrote.
        for name in focus['names']:
            queries.append('"'+name.replace('"','')+'"')
    places=context_terms(focus)
    for term in search_terms(focus):
        q='"'+term.replace('"','')+'"'
        if places:q+=' AND ('+' OR '.join('"'+p.replace('"','')+'"' for p in places[:4])+')'
        queries.append(q)
        if focus['kind']=='person' and term==search_terms(focus)[0]:
            catalogue=[*focus['names']]
            for name in retrieval_names(focus):
                if fold(name) not in {fold(item) for item in catalogue}:
                    catalogue.append(name)
                    break
            for name in catalogue:
                words=name.split()
                if len(words)>=2:queries.append('"'+words[-1]+', '+' '.join(words[:-1])+'"')
    if focus['kind']=='person':
        for name in retrieval_names(focus):
            if fold(name) in {fold(item) for item in focus['names']} or name==name.casefold():
                continue
            queries.append('"'+name.replace('"','')+'"')
    return list(dict.fromkeys(queries))[:limit]


def text_match(record,focus):
    """Match independent source text; never count the query as source evidence."""
    # Separate highlights can be from different pages. They are never joined
    # to manufacture name/place co-occurrence.
    candidates=[]
    if focus['kind']=='topic':
        from research_topics import topic_match
        for segment in record.get('fulltext_contexts') or [record.get('context_excerpt') or '']:
            match=topic_match(segment,focus)
            if match['topic_event_present']:
                return {**match,'category':'POSSIBLE_TARGET','reason':'FULLTEXT_THEMATIC_PASSAGE_REQUIRES_REVIEW',
                        'matched_excerpt':segment,'query_hypothesis':True}
        return None
    for segment in record.get('fulltext_contexts') or [record.get('context_excerpt') or '']:
        surface=[];offsets=[]
        for i,char in enumerate(segment):
            for c in norm(char):surface.append(c);offsets.append(i)
        text=''.join(surface)
        if focus['kind']=='person':
            for name in retrieval_names(focus):
                parts=name.split()
                if len(parts)<2:continue
                pattern=name_pattern(parts)
                for hit in re.finditer(r'(?<!\w)'+pattern+r'(?!\w)',text):
                    extended=extended_name_after(segment,hit.end())
                    local=text[max(0,hit.start()-240):hit.end()+240]
                    places=[p for p in focus.get('places',[]) if any(
                        re.search(r'(?<!\w)'+re.escape(norm(t))+r'(?!\w)',local)
                        for t in spelling_hypotheses(p,True))]
                    roles=[t for t in role_terms(focus) if _term_hit(local,t)]
                    context_ok=bool(places) if focus.get('places') else bool(roles)
                    context_missing=bool(focus.get('places') or focus.get('roles')) and not context_ok
                    candidates.append({'category':'POSSIBLE_TARGET',
                            'reason':'FULLTEXT_EXTENDED_NAME_REQUIRES_REVIEW' if extended else 'FULLTEXT_NAME_WITHOUT_REQUEST_CONTEXT' if context_missing else 'FULLTEXT_COMPLETE_NAME_REQUIRES_REVIEW',
                            'matched_name':name,'places':places,'roles':roles,
                            'matched_excerpt':segment[max(0,offsets[hit.start()]-120):offsets[hit.end()-1]+451],
                            'identity_verified':False,'query_hypothesis':True})
        for term in search_terms(focus):
            for hit in re.finditer(r'(?<!\w)'+re.escape(norm(term))+r'(?!\w)',text):
                if not segment[offsets[hit.start()]].isupper():continue
                local=text[max(0,hit.start()-240):hit.end()+240]
                start=max(0,hit.start()-240)
                places=[t for t in context_terms(focus) if any(segment[offsets[start+m.start()]].isupper()
                        for m in re.finditer(r'(?<!\w)'+re.escape(norm(t))+r'(?!\w)',local))]
                requested_roles=role_terms(focus)
                role_context=text[max(0,hit.start()-700):hit.end()+700]
                roles=[t for t in requested_roles if _term_hit(role_context,t)]
                if (places or focus['kind']=='place') and (not requested_roles or roles):
                    candidates.append({'category':'POSSIBLE_TARGET','reason':'FULLTEXT_NAME_AND_CONTEXT_HYPOTHESIS',
                            'matched_name':term,'places':places,'roles':roles,
                            'matched_excerpt':segment[max(0,offsets[hit.start()]-120):offsets[hit.end()-1]+451],
                            'identity_verified':False,'query_hypothesis':True})
    order={'FULLTEXT_NAME_AND_CONTEXT_HYPOTHESIS':0,'FULLTEXT_COMPLETE_NAME_REQUIRES_REVIEW':0,
           'FULLTEXT_NAME_WITHOUT_REQUEST_CONTEXT':1,'FULLTEXT_EXTENDED_NAME_REQUIRES_REVIEW':2}
    return min(candidates,key=lambda x:order[x['reason']]) if candidates else None


def merge_findings(records,focus):
    """One source/page row, retaining every independently returned OCR passage."""
    unique={}
    for row in records:
        key=(row.get('discovery_repository'),row['identifier'])
        if key not in unique:unique[key]=dict(row)
        else:
            old=unique[key]
            old['fulltext_contexts']=list(dict.fromkeys([*(old.get('fulltext_contexts') or [old.get('context_excerpt','')]),
                *(row.get('fulltext_contexts') or [row.get('context_excerpt','')])]))
            old['matched_terms']=list(dict.fromkeys([*old.get('matched_terms',[]),*row.get('matched_terms',[])]))
        current=unique[key]
        current['query_provenance']=list(dict.fromkeys([*current.get('query_provenance',[]),
            *([row['fulltext_query']] if row.get('fulltext_query') else [])]))
    for row in unique.values():
        match=text_match(row,focus)
        if match:row['context_excerpt']=match['matched_excerpt']
    return list(unique.values())


def get_bytes(url,body=None,limit=5_000_000):
    parsed=urlsplit(url)
    if parsed.scheme!='https' or not parsed.hostname or parsed.username:
        raise ValueError('PUBLIC_HTTPS_SOURCE_REQUIRED')
    headers={'User-Agent':'Piratecartography-Research/4.1','Accept':'application/json,text/html;q=0.9,*/*;q=0.5'}
    if body is not None:headers['Content-Type']='application/json'
    request=Request(url,data=json.dumps(body).encode() if body is not None else None,headers=headers)
    with urlopen(request,timeout=18) as response:data=response.read(limit+1)
    if len(data)>limit:raise ValueError('FULLTEXT_RESPONSE_SIZE_LIMIT')
    return data


def get_json(url,body=None):return json.loads(get_bytes(url,body))


def first(value):
    while isinstance(value,list):value=value[0] if value else None
    return value


def ia_search(query):
    data=get_json(IA_FTS,{'q':'!L '+query,'size':5,'from':0,'scroll':False})
    if data.get('timed_out'):raise ValueError('IA_FULLTEXT_TIMED_OUT')
    if not isinstance(data.get('hits',{}).get('hits'),list):raise ValueError('IA_FULLTEXT_RESPONSE_UNRECOGNIZED')
    rows=[]
    for hit in data['hits']['hits']:
        fields=hit.get('fields') or {};ident=first(fields.get('identifier'))
        if not ident:continue
        excerpts=(hit.get('highlight') or {}).get('text') or []
        segments=[str(x).replace('{{{','').replace('}}}','') for x in excerpts]
        text=' … '.join(segments)
        rows.append({'identifier':str(ident),'title':first(fields.get('meta_title')),
                     'creator':fields.get('meta_creator'),'date':fields.get('meta_date') or fields.get('meta_year'),
                     'publication_year':first(fields.get('meta_year')),
                     'url':'https://archive.org/details/'+str(ident),
                     'discovery_repository':'Internet Archive Full Text','acquisition_route':'INTERNET_ARCHIVE',
                     'connector_status':'EXECUTED','context_excerpt':text,
                     'fulltext_contexts':segments,
                     'fulltext_hit':True,'source_type':'OCR_CONTEXT','evidence_state':'DISCOVERED',
                     'fulltext_query':query,'reported_page_numbers':fields.get('page_num'),
                     'locator_status':'SEARCH_INDEX_PAGE_NOT_YET_MAPPED','original_inspected':False,'verified':False})
    return rows


class PlainText(HTMLParser):
    def __init__(self):super().__init__();self.parts=[]
    def handle_data(self,data):self.parts.append(data)


def label(value):
    if isinstance(value,str):return value
    if isinstance(value,dict):return ' '.join(label(x) for x in value.values())
    if isinstance(value,list):return ' '.join(label(x) for x in value)
    return str(value or '')


def metadata(manifest,key):
    for item in manifest.get('metadata',[]):
        if key in label(item.get('label')).casefold():return item.get('value')
    return None


def manifest_pool(root,request,discovery):
    """Reuse real, previously registered sources; do not inject a test book."""
    candidates=[]
    def add(url,provenance):
        if isinstance(url,str) and url.startswith('https://') and 'manifest' in url:
            if not any(x['url']==url for x in candidates):candidates.append({'url':url,'provenance':provenance})
    for source in request.get('source_leads',[]):
        if isinstance(source,dict):
            for url in [source.get('manifest'),*source.get('iiif_manifest_candidates',[])]:add(url,'CURRENT_REQUEST')
    for source in discovery.get('results',[]):
        for url in source.get('iiif_manifest_candidates') or []:add(url,'CATALOGUE_DISCOVERY')
    for path in sorted((root/'acquisition_requests').glob('*.json')):
        try:source=json.loads(path.read_text())
        except (ValueError,OSError):continue
        add(source.get('manifest'),str(path.relative_to(root)))
    return candidates[:6]


def iiif_search(source,terms,out,deadline=None,focus=None):
    deadline=deadline or time.monotonic()+140
    manifest=get_json(source['url']);services=manifest.get('service') or []
    if isinstance(services,dict):services=[services]
    service=next((s.get('@id') or s.get('id') for s in services if 'search' in str(s.get('profile',''))),None)
    if not service:return [],[{'query':None,'status':'FULLTEXT_SERVICE_UNAVAILABLE','hits':0,'detail':source['url']}]
    # Services are followed only on the declared manifest's own public origin.
    if urlsplit(service).netloc!=urlsplit(source['url']).netloc:raise ValueError('CROSS_ORIGIN_SEARCH_SERVICE_REQUIRES_REVIEW')
    canvases=(manifest.get('sequences') or [{}])[0].get('canvases') or manifest.get('items') or []
    canvas_map={c.get('@id') or c.get('id'):(i,c) for i,c in enumerate(canvases)}
    title=label(manifest.get('label'));rows={};attempts=[];page_cache={}
    queries=list(terms[:6])
    if focus:
        # Early-modern print OCR stores the long s as 'f' (MDZ: 'Capfi'), so
        # also query the bounded long-s form of each Latin-script term.
        seen={fold(t) for t in queries}
        for term in terms[:6]:
            variant=long_s_variant(term)
            if variant and fold(variant) not in seen:queries.append(variant);seen.add(fold(variant))
    def page_text_of(canvas_id,canvas):
        if canvas_id not in page_cache:
            links=canvas.get('seeAlso') or []
            if isinstance(links,dict):links=[links]
            text_url=next((x.get('@id') or x.get('id') for x in links if 'hocr' in str(x).lower() or '/ocr/' in str(x).lower()),None)
            page_text=''
            if text_url and time.monotonic()<deadline:
                try:
                    raw=get_bytes(text_url,limit=1_000_000);parser=PlainText();parser.feed(raw.decode('utf-8','replace'))
                    page_text=' '.join(parser.parts);dest=out/('page-'+hashlib.sha256(canvas_id.encode()).hexdigest()[:16]+'.txt');dest.write_text(page_text)
                except Exception:pass
            page_cache[canvas_id]=page_text
        return page_cache[canvas_id]
    def make_row(canvas_id,index,canvas,excerpt,page_text):
        printed=label(canvas.get('label'));page=re.match(r'^\s*(\d+)(?:\s|$)',printed)
        images=canvas.get('images') or []
        image=((images[0].get('resource') or {}).get('@id') if images else None)
        publication=re.search(r'\b\d{4}\b',str(metadata(manifest,'date') or ''))
        return rows.setdefault(canvas_id,{'identifier':canvas_id,'title':title,'date':[metadata(manifest,'date')],
            'publication_year':int(publication.group()) if publication else None,
            'url':image or canvas_id,'image_url':image,'manifest_url':source['url'],
            'source_origin':source['provenance'],'discovery_repository':'IIIF Full Text',
            'connector_status':'EXECUTED','fulltext_hit':True,'source_type':'OCR_CONTEXT',
            'evidence_state':'EXACT_PAGE_MAPPED','canvas_id':canvas_id,'scan_index_0_based':index,
            'printed_page':int(page.group(1)) if page else None,'page_label':printed,
            'context_excerpt':excerpt,'fulltext_contexts':[page_text or excerpt],'matched_terms':[],
            'original_inspected':False,'verified':False})
    for term in queries:
        if time.monotonic()>deadline:
            attempts.append({'query':None,'status':'BUDGET_EXHAUSTED','hits':0,'detail':'Full-text coverage is partial.'});break
        url=service+('&' if '?' in service else '?')+urlencode({'q':term})
        try:
            data=get_json(url)
            # MDZ returns a bare, typed AnnotationList for a valid zero hit.
            # Accept this exact response, while rejecting error/unknown JSON.
            if data.get('@type')=='sc:AnnotationList' and 'resources' not in data and 'hits' not in data:
                data.update(resources=[],hits=[])
            if not isinstance(data.get('resources'),list):raise ValueError('IIIF_SEARCH_RESPONSE_UNRECOGNIZED')
            # IIIF empty annotation lists may omit the optional hits extension.
            if 'hits' not in data and not data['resources']:data['hits']=[]
            if not isinstance(data.get('hits'),list):raise ValueError('IIIF_SEARCH_HITS_UNAVAILABLE')
        except Exception as exc:
            attempts.append({'query':term,'status':'REMOTE_ERROR','hits':0,'detail':type(exc).__name__+': '+str(exc)});continue
        annotations={a.get('@id'):a for a in data['resources']}
        attempts.append({'query':term,'status':'EXECUTED','hits':len(data['hits']),'detail':url})
        for hit in data['hits'][:12]:
            for aid in hit.get('annotations',[]):
                ann=annotations.get(aid,{})
                canvas_id=str(ann.get('on') or '').split('#')[0]
                if canvas_id not in canvas_map:continue
                index,canvas=canvas_map[canvas_id];printed=label(canvas.get('label'))
                page=re.match(r'^\s*(\d+)(?:\s|$)',printed)
                excerpt=unescape(str(hit.get('before',''))+str(hit.get('match',''))+str(hit.get('after','')))
                page_text=page_text_of(canvas_id,canvas)
                anchor=re.search(re.escape(str(hit.get('match',''))),page_text,re.I) if hit.get('match') and page_text else None
                if anchor:excerpt=page_text[max(0,anchor.start()-160):anchor.end()+420]
                row=make_row(canvas_id,index,canvas,excerpt,page_text)
                passage=page_text or excerpt
                if passage not in row['fulltext_contexts']:row['fulltext_contexts'].append(passage)
                if term not in row['matched_terms']:row['matched_terms'].append(term)
    if focus and focus.get('kind')=='person':
        section_continuations(rows,canvases,focus,page_text_of,make_row,deadline,source['url'])
    return list(rows.values()),attempts


SECTION_MAX_PAGES=6
SECTION_UNNAMED_SLACK=2

def _name_forms(name):
    return [name,*([long_s_variant(name)] if long_s_variant(name) else [])]

def page_names_target(text,focus):
    """An attested full name (not a mechanical hypothesis) printed on the page."""
    folded=fold(text)
    return next((name for name in focus.get('names',[]) if len(name.split())>=2 and
                 any(re.search(name_pattern(form.split()),folded) for form in _name_forms(name))),None)

def page_has_surname(text,focus):
    folded=fold(text)
    surnames={name.split()[-1] for name in focus.get('names',[]) if len(name.split())>=2}
    return any(re.search(r'(?<!\w)'+re.escape(fold(form))+r'(?!\w)',folded) for s in surnames for form in _name_forms(s))

def section_continuations(rows,canvases,focus,page_text_of,make_row,deadline,manifest_url):
    """Follow a chapter past the page that names the target in full.

    Book chapters name a person once (heading/first line) and continue with the
    surname. Pages after such an anchor page in the SAME manifest are kept as
    leads while they carry the surname; at most SECTION_UNNAMED_SLACK pages
    without it are bridged, and the walk stops after SECTION_MAX_PAGES. Every
    such page is marked section_continuation; identity stays provisional and the
    usual namesake/modern-document gates still apply downstream.
    """
    index_of={c.get('@id') or c.get('id'):i for i,c in enumerate(canvases)}
    anchors=sorted((index_of[cid],cid,name) for cid,row in list(rows.items()) if cid in index_of
                   for name in [page_names_target(' '.join(row.get('fulltext_contexts') or []),focus)] if name)
    for start,anchor_id,name in anchors:
        last_named=start
        for index in range(start+1,min(len(canvases),start+1+SECTION_MAX_PAGES)):
            if index-last_named>SECTION_UNNAMED_SLACK or time.monotonic()>deadline:break
            canvas=canvases[index];cid=canvas.get('@id') or canvas.get('id')
            text=page_text_of(cid,canvas)
            if not text:break
            if page_names_target(text,focus) and cid in rows:break  # next anchor takes over
            surname=page_has_surname(text,focus)
            if surname:last_named=index
            rows_before=cid in rows
            row=make_row(cid,index,canvas,text[:600],text)
            if not rows_before:row['matched_terms']=[]
            row.setdefault('section_continuation',{'anchor_canvas':anchor_id,'anchor_name':name,
                'manifest_url':manifest_url,'pages_after_anchor':index-start,
                'basis':'SURNAME_ON_PAGE' if surname else 'UNNAMED_PAGE_BRIDGED_WITHIN_SECTION',
                'identity_verified':False})


def run(root,request,ctx,lane='travellers',ia_enabled=True):
    out=root/'fulltext_discovery';out.mkdir(exist_ok=True)
    path=root/'lane_discovery'/f'{lane}.json'
    discovery=json.loads(path.read_text()) if path.exists() else {'results':[],'attempts':[]}
    focus=decompose(ctx['target'],ctx.get('aliases',[]),ctx.get('purpose',''))
    terms=search_terms(focus);places=context_terms(focus);records=[];attempts=[]
    started=time.monotonic()
    def checkpoint():
        payload={'schema':'pct-fulltext-discovery-v1','research_focus':focus,
                 'query_hypotheses':terms,'context_hypotheses':places,'attempts':attempts,'results':records,
                 'identity_policy':'Mechanical query hypotheses are not attested aliases; matches require identity review.',
                 'verified':False}
        (out/'report.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2))
    # IA searches the corpus directly, including names absent from catalogue fields.
    if ia_enabled:
        queries=ia_queries(focus)
        def ia_one(q):
            try:return q,'EXECUTED',ia_search(q),None
            except Exception as exc:return q,'REMOTE_ERROR',[],type(exc).__name__+': '+str(exc)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            for q,status,rows,error in executor.map(ia_one,queries):
                attempts.append({'repository':'Internet Archive Full Text','status':status,'hits':len(rows),
                    'base_url':IA_FTS,'queries':[{'query':q,'status':status,'hits':len(rows),'detail':error or IA_FTS}]})
                records.extend(rows);checkpoint()
    pool=manifest_pool(root,request,discovery)
    if not pool:
        attempts.append({'repository':'IIIF Full Text','status':'FULLTEXT_TARGETS_UNAVAILABLE','hits':0,
                         'detail':'No declared IIIF manifests were available in this lane; full-text coverage is not established.'})
    for source in pool:
        if time.monotonic()-started>150:break
        try:
            rows,queries=iiif_search(source,terms,out,started+150,focus);records.extend(rows)
            attempts.append({'repository':'IIIF Full Text','status':'EXECUTED' if any(q['status']=='EXECUTED' for q in queries) else 'FULLTEXT_SERVICE_UNAVAILABLE',
                'hits':len(rows),'base_url':source['url'],'queries':queries})
        except Exception as exc:
            attempts.append({'repository':'IIIF Full Text','status':'REMOTE_ERROR','hits':0,'base_url':source['url'],
                'queries':[{'query':None,'status':'REMOTE_ERROR','hits':0,'detail':type(exc).__name__+': '+str(exc)}]})
        checkpoint()
    for row in records:
        row['discovery_lane']=lane
    records[:]=merge_findings(records,focus);checkpoint()
    discovery.setdefault('results',[]).extend(records);discovery.setdefault('attempts',[]).extend(attempts)
    path.parent.mkdir(exist_ok=True);path.write_text(json.dumps(discovery,ensure_ascii=False,indent=2))
    print('FULLTEXT DISCOVERY',len(records),'source/page leads;',sum(bool(text_match(r,focus)) for r in records),'name/context hypotheses; not verified')
    return records,attempts


if __name__=='__main__':
    from request_context import load_request
    _,req,ctx=load_request()
    lane=os.getenv('PCT_RESEARCH_LANE','travellers')
    run(Path('.'),req,ctx,lane,ia_enabled=lane=='travellers')
