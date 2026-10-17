#!/usr/bin/env python3
"""Public repository connectors used by PCT research lanes.

Each connector returns (status, records, diagnostic).  EXECUTED means a real
remote query completed.  Authentication/browser/key requirements are explicit
and are never reported as successful searches.
"""
from __future__ import annotations
import json, os, re, time, urllib.parse, urllib.request, urllib.error, xml.etree.ElementTree as ET, unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from html.parser import HTMLParser
from html import unescape

UA={"User-Agent":"Piratecartography-Historical-Research/3.0 (+scholarly catalogue discovery)"}

def _get(url, timeout=20, accept=None):
    headers=dict(UA)
    if accept: headers["Accept"]=accept
    req=urllib.request.Request(url,headers=headers)
    with urllib.request.urlopen(req,timeout=timeout) as r:
        return r.read()

def _json(url, timeout=45):
    return json.loads(_get(url,timeout).decode("utf-8","replace"))

def _text(node):
    return " ".join(" ".join(node.itertext()).split()) if node is not None else ""

def _local(tag):
    return tag.rsplit("}",1)[-1].lower()

def _first_local(root, names):
    names={n.lower() for n in names}
    for e in root.iter():
        if _local(e.tag) in names and _text(e):
            return _text(e)
    return None

def _all_local(root, names):
    names={n.lower() for n in names}; out=[]
    for e in root.iter():
        if _local(e.tag) in names:
            t=_text(e)
            if t and t not in out: out.append(t)
    return out

def _sru_records(url, repository, lane):
    data=_get(url)
    root=ET.fromstring(data)
    recs=[]
    for rec in [e for e in root.iter() if _local(e.tag)=="record"]:
        rd=next((e for e in rec.iter() if _local(e.tag)=="recorddata"),None)
        if rd is None: continue
        # Dublin Core / generic SRU fields.
        title=_first_local(rd,["title"])
        creators=_all_local(rd,["creator","author"])
        dates=_all_local(rd,["date","publicationdate"])
        ids=_all_local(rd,["identifier"])
        # MARCXML fields (BNE and other Alma SRU targets).
        marc=next((e for e in rd.iter() if _local(e.tag)=="record"),None)
        if marc is not None:
            def marc_values(tags,codes=None):
                vals=[]
                for field in marc.iter():
                    if _local(field.tag)!="datafield" or field.get("tag") not in tags:continue
                    parts=[]
                    for sf in field:
                        if _local(sf.tag)!="subfield":continue
                        if codes is None or sf.get("code") in codes:
                            t=_text(sf)
                            if t:parts.append(t)
                    if parts:vals.append(" ".join(parts))
                return vals
            controls=[_text(e) for e in marc.iter() if _local(e.tag)=="controlfield" and e.get("tag")=="001" and _text(e)]
            mt=marc_values({"245"},{"a","b","c"})
            mc=marc_values({"100","110","700"},{"a","b","c","d"})
            md=marc_values({"260","264"},{"c"})
            mids=marc_values({"035"},{"a"})+controls
            murls=marc_values({"856"},{"u"})
            title=title or (mt[0] if mt else None)
            creators=creators+mc;dates=dates+md;ids=ids+mids+murls
        urls=[x for x in ids if x.startswith(("http://","https://"))]
        recs.append({
            "discovery_repository":repository,"discovery_lane":lane,
            "connector_status":"EXECUTED","identifier":ids[0] if ids else None,
            "title":title,"creator":creators[:4],"date":dates[:4],
            "url":urls[0] if urls else None,"identifiers":ids[:12]
        })
    return recs

class _LinkParser(HTMLParser):
    def __init__(self):
        super().__init__(); self.links=[]; self._href=None; self._buf=[]
    def handle_starttag(self,tag,attrs):
        if tag.lower()=="a":
            self._href=dict(attrs).get("href"); self._buf=[]
    def handle_data(self,data):
        if self._href is not None:self._buf.append(data)
    def handle_endtag(self,tag):
        if tag.lower()=="a" and self._href is not None:
            txt=" ".join("".join(self._buf).split())
            if txt:self.links.append((self._href,txt))
            self._href=None; self._buf=[]

def _html_search(url, repository, lane, base, keep=None, max_records=25):
    html=_get(url).decode("utf-8","replace")
    p=_LinkParser();p.feed(html);seen=set();recs=[]
    for href,title in p.links:
        absolute=urllib.parse.urljoin(base,href)
        if keep and not keep(absolute,title): continue
        key=(absolute,title)
        if key in seen:continue
        seen.add(key)
        recs.append({"discovery_repository":repository,"discovery_lane":lane,
            "connector_status":"EXECUTED","identifier":absolute,"title":title,
            "date":[],"url":absolute})
        if len(recs)>=max_records:break
    return recs

def bnf_sru(q,lane):
    params={"version":"1.2","operation":"searchRetrieve",
      "query":'bib.anywhere all "'+q.replace('"'," ")+'"',
      "recordSchema":"dublincore","maximumRecords":20}
    url="https://catalogue.bnf.fr/api/SRU?"+urllib.parse.urlencode(params)
    return "EXECUTED",_sru_records(url,"BnF General Catalogue",lane),url

def bne_sru(q,lane):
    # Alma SRU/CQL: multi-term requests must be boolean AND clauses, not one
    # literal phrase. Preserve quoted phrases as one token.
    tokens=re.findall(r'"([^"]+)"|(\S+)',str(q))
    vals=[]
    for quoted,bare in tokens:
        v=(quoted or bare or "").strip()
        if v and v.casefold() not in {x.casefold() for x in vals}: vals.append(v)
    if not vals:
        vals=[str(q).strip()]
    cql=" AND ".join('alma.all_for_ui="'+v.replace('"'," ")+'"' for v in vals)
    params={"version":"1.2","operation":"searchRetrieve",
      "query":cql,
      "recordSchema":"marcxml","startRecord":1,"maximumRecords":20}
    url="https://catalogo.bne.es/view/sru/34BNE_INST?"+urllib.parse.urlencode(params)
    return "EXECUTED",_sru_records(url,"Biblioteca Nacional de España SRU",lane),url

def archives_diplomatiques(q,lane):
    base="https://archivesdiplomatiques.diplomatie.gouv.fr"
    url=base+"/search/results?"+urllib.parse.urlencode({"q":q})
    keep=lambda u,t: ("/ark:/" in u or "/search/" in u or "/ead/" in u or "notice" in u.lower()) and len(t)>3
    return "EXECUTED",_html_search(url,"Archives diplomatiques France",lane,base,keep),url

def internet_culturale(q,lane):
    base="https://www.internetculturale.it"
    url=base+"/it/16/search?"+urllib.parse.urlencode({"q":q,"instance":"magindice","pag":1})
    keep=lambda u,t: ("/opencms/" in u or "/it/" in u) and ("search?" not in u) and len(t)>3
    return "EXECUTED",_html_search(url,"Internet Culturale",lane,base,keep),url

def _norm_search_text(v):
    s=unicodedata.normalize("NFKD",str(v or ""))
    s="".join(ch for ch in s if not unicodedata.combining(ch)).casefold()
    return " ".join(re.findall(r"[a-z0-9]+",s))

def _query_tokens(q):
    stop={"the","a","an","of","and","or","in","on","at","to","for","corsair","pirate"}
    return [x for x in _norm_search_text(q).split() if len(x)>2 and x not in stop]

def _tna_fetch_page(row):
    u=row.get("url")
    if not u:return row
    try:
        raw=_get(u,timeout=12).decode("utf-8","replace")
        parser=_LinkParser();parser.feed(raw)
        child=[]
        prefix=urllib.parse.urlsplit(u).path.rstrip("/")+"/"
        for href,title in parser.links:
            au=urllib.parse.urljoin(u,href)
            p=urllib.parse.urlsplit(au).path
            if p.startswith(prefix) and p!=prefix and au not in child:
                child.append(au)
        clean=re.sub(r"(?is)<(script|style|nav|footer)[^>]*>.*?</\\1>"," ",raw)
        txt=re.sub(r"<[^>]+>"," ",clean)
        txt=" ".join(txt.split())
        row["metadata_text"]=txt[:40000]
        row["child_urls"]=child[:20]
        years=list(dict.fromkeys(re.findall(r"\\b(?:1[0-9]{3}|20[0-9]{2})\\b",txt)))
        row["date"]=years[:16]
    except Exception:
        pass
    return row

def tna_public_content(q,lane):
    base="https://www.nationalarchives.gov.uk"
    url=base+"/search/results/?"+urllib.parse.urlencode({"_q":q})
    content_prefixes=(
      "/education/resources/",
      "/explore-the-collection/stories/",
      "/help-with-your-research/",
      "/blog/",
      "/cabinetpapers/",
      "/pathways/",
      "/museum/"
    )
    def keep(u,t):
        try:p=urllib.parse.urlsplit(u).path.casefold()
        except Exception:return False
        return any(p.startswith(x) for x in content_prefixes) and len(t)>3

    rows=_html_search(url,"The National Archives Public Content",lane,base,keep,max_records=25)

    # Fallback corpus crawl for public content that the site-search page misses.
    hub_urls=[
      base+"/education/sessions-and-resources/?time-period=early-modern",
      base+"/explore-the-collection/stories/?page=1",
      base+"/explore-the-collection/stories/?page=2",
      base+"/explore-the-collection/stories/?page=3",
      base+"/explore-the-collection/stories/?page=4",
      base+"/explore-the-collection/stories/?page=5",
      base+"/explore-the-collection/stories/?page=6",
    ]
    candidates=[];seen=set()
    for hub in hub_urls:
        try:
            for r in _html_search(hub,"The National Archives Public Content",lane,base,keep,max_records=400):
                k=r.get("url")
                if k and k not in seen:
                    seen.add(k);candidates.append(r)
            # Some TNA resource cards are serialized in page data rather than
            # exposed as ordinary anchor elements. Extract stable content paths
            # directly from the server-rendered HTML/embedded JSON as a fallback.
            raw_hub=_get(hub,timeout=15).decode("utf-8","replace")
            for pth in re.findall(r'/(?:education/resources|explore-the-collection/stories)/[A-Za-z0-9_%\\-]+/',raw_hub,re.I):
                au=urllib.parse.urljoin(base,pth)
                if au in seen: continue
                seen.add(au)
                candidates.append({
                  "discovery_repository":"The National Archives Public Content",
                  "discovery_lane":lane,"connector_status":"EXECUTED",
                  "identifier":au,"title":urllib.parse.unquote(pth.rstrip("/").rsplit("/",1)[-1]).replace("-"," "),
                  "date":[],"url":au
                })
            # Card titles can exist without ordinary hrefs. Reconstruct stable
            # education-resource slugs from heading text, then verify by fetch.
            if "/education/sessions-and-resources/" in hub:
                for inner in re.findall(r'(?is)<h[2-4][^>]*>(.*?)</h[2-4]>',raw_hub):
                    title=unescape(re.sub(r"<[^>]+>"," ",inner))
                    title=" ".join(title.split())
                    if not title or len(title)>120: continue
                    slug=_norm_search_text(title).replace(" ","-")
                    if not slug: continue
                    au=base+"/education/resources/"+slug+"/"
                    if au in seen: continue
                    seen.add(au)
                    candidates.append({
                      "discovery_repository":"The National Archives Public Content",
                      "discovery_lane":lane,"connector_status":"EXECUTED",
                      "identifier":au,"title":title,"date":[],"url":au
                    })
        except Exception:
            continue
    # Bound the fallback crawl and fetch concurrently.
    candidates=candidates[:180]
    enriched=[]
    with ThreadPoolExecutor(max_workers=12) as ex:
        futs=[ex.submit(_tna_fetch_page,r) for r in candidates]
        for fut in as_completed(futs):
            try: enriched.append(fut.result())
            except Exception: pass

    toks=_query_tokens(q)
    matched_parents=[]
    for r in enriched:
        body=_norm_search_text((r.get("title") or "")+" "+(r.get("metadata_text") or ""))
        if toks and all(t in body for t in toks):
            rows.append(r);matched_parents.append(r)

    # One bounded child-page expansion inside matched education resources.
    child_rows=[];child_seen=set()
    for parent in matched_parents:
        for u in parent.get("child_urls") or []:
            if "/education/resources/" not in u: continue
            if u in child_seen: continue
            child_seen.add(u)
            child_rows.append({"discovery_repository":"The National Archives Public Content","discovery_lane":lane,"connector_status":"EXECUTED","identifier":u,"title":u.rstrip("/").rsplit("/",1)[-1],"date":[],"url":u})
    child_rows=child_rows[:40]
    child_enriched=[]
    with ThreadPoolExecutor(max_workers=8) as ex:
        futs=[ex.submit(_tna_fetch_page,r) for r in child_rows]
        for fut in as_completed(futs):
            try: child_enriched.append(fut.result())
            except Exception: pass
    for r in child_enriched:
        body=_norm_search_text((r.get("title") or "")+" "+(r.get("metadata_text") or ""))
        if toks and all(t in body for t in toks):
            rows.append(r)

    # Enrich direct site-search results too.
    direct=[]
    with ThreadPoolExecutor(max_workers=8) as ex:
        futs=[ex.submit(_tna_fetch_page,r) for r in rows[:40]]
        for fut in as_completed(futs):
            try: direct.append(fut.result())
            except Exception: pass

    ded=[];seen=set()
    for r in direct:
        k=r.get("url") or r.get("identifier")
        if not k or k in seen:continue
        seen.add(k);ded.append(r)
    return "EXECUTED",ded[:40],url+" ; bounded public-content hub crawl"

def nationaal_archief(q,lane):
    base="https://www.nationaalarchief.nl"
    url=base+"/onderzoeken/zoeken?"+urllib.parse.urlencode({"searchTerm":q})
    keep=lambda u,t: ("/onderzoeken/" in u) and ("zoeken?" not in u) and len(t)>3
    return "EXECUTED",_html_search(url,"Nationaal Archief",lane,base,keep),url

def delpher_sru(q,lane):
    params={"version":"1.2","operation":"searchRetrieve","query":q,
      "startRecord":1,"maximumRecords":20,"recordSchema":"ddd",
      "x-collection":"DDD_artikel",
      "x-fields":"OaiPmhIdentifier,dateString,zones,title"}
    url="https://jsru.kb.nl/sru/sru?"+urllib.parse.urlencode(params)
    return "EXECUTED",_sru_records(url,"Delpher / KB SRU",lane),url

def google_books(q,lane):
    url="https://www.googleapis.com/books/v1/volumes?"+urllib.parse.urlencode({"q":q,"maxResults":20,"printType":"books"})
    try:
        d=_json(url)
    except urllib.error.HTTPError as exc:
        if exc.code not in (403,429,502,503,504): raise
        status="REMOTE_RATE_LIMITED" if exc.code==429 else "REMOTE_ACCESS_BLOCKED" if exc.code==403 else "REMOTE_UNAVAILABLE"
        # Query an independent public catalogue, never bypass Google's controls.
        # Preserve the original failure and attribute every fallback record to BnF.
        try:
            fallback_status, rows, detail=bnf_sru(q,lane)
            for row in rows:
                row["fallback_for"]="Google Books"
                row["fallback_reason"]=status
            return status,rows,f"Google Books HTTP {exc.code}; fallback {fallback_status}: {detail}"
        except Exception as fallback_error:
            return status,[],f"Google Books HTTP {exc.code}; BnF fallback failed: {type(fallback_error).__name__}"
    out=[]
    for it in d.get("items",[]):
        v=it.get("volumeInfo",{})
        out.append({"discovery_repository":"Google Books","discovery_lane":lane,
          "connector_status":"EXECUTED","identifier":it.get("id"),"title":v.get("title"),
          "creator":v.get("authors",[]),"date":[v.get("publishedDate")] if v.get("publishedDate") else [],
          "url":v.get("infoLink"),"digital_url":v.get("previewLink")})
    return "EXECUTED",out,url

def isam(q,lane):
    # Prefer the public DSpace discovery API; fall back to public AtoM browse/search.
    api="https://makale.isam.org.tr/server/api/discover/search/objects?"+urllib.parse.urlencode({"query":q,"size":20})
    try:
        d=_json(api)
        objs=d.get("_embedded",{}).get("searchResult",{}).get("_embedded",{}).get("objects",[])
        out=[]
        for o in objs:
            obj=o.get("_embedded",{}).get("indexableObject",{})
            out.append({"discovery_repository":"İSAM DSpace","discovery_lane":lane,
              "connector_status":"EXECUTED","identifier":obj.get("uuid") or obj.get("handle"),
              "title":obj.get("name"),"date":[],"url":obj.get("_links",{}).get("self",{}).get("href")})
        return "EXECUTED",out,api
    except Exception as first:
        base="https://arsiv.isam.org.tr"
        url=base+"/index.php/informationobject/browse?"+urllib.parse.urlencode({"topLod":0,"query":q})
        keep=lambda u,t: ("/index.php/" in u) and ("informationobject/browse" not in u) and len(t)>3
        out=_html_search(url,"İSAM AtoM",lane,base,keep)
        return "EXECUTED",out,url+" ; DSpace fallback reason="+str(first)

def library_of_congress(q,lane):
    # Official loc.gov JSON API; public and anonymous. Keep request volume low.
    url="https://www.loc.gov/books/?"+urllib.parse.urlencode({"q":q,"fo":"json","c":25})
    last=None
    for attempt in range(3):
        try:
            d=_json(url,timeout=30);break
        except urllib.error.HTTPError as exc:
            last=exc
            if exc.code==403:
                return "REMOTE_ACCESS_BLOCKED",[],url+" ; HTTP 403 from remote service to GitHub runner"
            if exc.code not in (429,502,503,504): raise
            time.sleep(2*(attempt+1))
    else:
        if isinstance(last,urllib.error.HTTPError) and last.code in (429,502,503,504):
            return "REMOTE_ACCESS_BLOCKED",[],url+" ; repeated HTTP "+str(last.code)
        raise last
    out=[]
    for x in d.get("results",[]) or []:
        ident=x.get("id") or x.get("url")
        title=x.get("title")
        dates=[]
        for v in [x.get("date"),x.get("created_published_date"),x.get("other_date")]:
            if isinstance(v,list): dates.extend(str(z) for z in v if z)
            elif v: dates.append(str(v))
        out.append({
          "discovery_repository":"Library of Congress","discovery_lane":lane,
          "connector_status":"EXECUTED","identifier":ident,"title":title,
          "creator":x.get("contributor") or x.get("contributor_names") or [],
          "date":dates[:8],"url":x.get("id") or x.get("url"),
          "description":x.get("description") or [],
          "subject":x.get("subject") or [],
          "location":x.get("location") or [],
          "partof":x.get("partof") or [],
          "raw":x
        })
    return "EXECUTED",out,url

def searchculture(q,lane):
    key=os.getenv("SEARCHCULTURE_API_KEY","").strip()
    if not key:
        return "API_KEY_REQUIRED",[],"Official SearchCulture API requires SEARCHCULTURE_API_KEY. Public portal HTML is not accepted as a stable machine-search substitute."
    params={"apiKey":key,"page":1,"pageSize":25}
    if str(q).startswith("__SC_FILTER__|"):
        for part in str(q).split("|")[1:]:
            if "=" not in part: continue
            k,v=part.split("=",1)
            if k and v: params[k]=v
    else:
        params["general_term"]=q
    url="https://www.searchculture.gr/aggregator/api/search.json?"+urllib.parse.urlencode(params)
    req=urllib.request.Request(url,headers={**UA,"Accept":"application/json"})
    with urllib.request.urlopen(req,timeout=30) as resp:
        d=json.loads(resp.read().decode("utf-8","replace"))
    out=[]
    for x in d.get("results",[]) or d.get("items",[]) or []:
        uri=x.get("uri") or x.get("id")
        title=x.get("dc_title") or x.get("title")
        if isinstance(title,list): title=" ".join(str(v) for v in title)
        out.append({
          "discovery_repository":"SearchCulture.gr / EKT",
          "discovery_lane":lane,
          "connector_status":"EXECUTED",
          "identifier":uri,
          "title":title,
          "date":x.get("ekt_chronology") or x.get("dc_date") or x.get("date") or [],
          "url":uri,
          "metadata_text":json.dumps(x,ensure_ascii=False),
          "raw":x
        })
    safe_params=dict(params);safe_params["apiKey"]="REDACTED"
    safe_url="https://www.searchculture.gr/aggregator/api/search.json?"+urllib.parse.urlencode(safe_params)
    return "EXECUTED",out,safe_url

def ddb(q,lane):
    key=os.getenv("DDB_API_KEY","").strip()
    if not key:return "API_KEY_REQUIRED",[],"Set DDB_API_KEY to execute the Deutsche Digitale Bibliothek API."
    url="https://api.deutsche-digitale-bibliothek.de/search?"+urllib.parse.urlencode({"query":q,"rows":20,"oauth_consumer_key":key})
    d=_json(url);out=[]
    docs=d.get("results",d.get("docs",[]))
    if isinstance(docs,dict): docs=docs.get("docs",docs.get("items",[]))
    for x in docs or []:
        ident=x.get("id") or x.get("identifier")
        out.append({"discovery_repository":"Deutsche Digitale Bibliothek","discovery_lane":lane,
          "connector_status":"EXECUTED","identifier":ident,"title":x.get("title"),
          "date":[x.get("date")] if x.get("date") else [],
          "url":("https://www.deutsche-digitale-bibliothek.de/item/"+ident) if ident else None})
    return "EXECUTED",out,url

def pares_simancas(q,lane):
    """Resolve a known public PARES record URL/ID; NOT a general catalogue search."""
    value=str(q).strip()
    match=re.search(r"(?:ParesBusquedas20/catalogo/description/)?([0-9]{2,12})(?:[/?#].*)?$",value)
    if not match or (not value.isdigit() and "pares." not in value.lower()):
        # PARES publishes a public HTML catalogue search. Treat matches as
        # *discovery candidates*, not archival record verification.
        if not value or len(value)>180:
            return "INVALID_QUERY",[],"Expected short catalogue search text"
        search_url="https://pares.cultura.gob.es/ParesBusquedas20/catalogo/find?"+urllib.parse.urlencode({"texto":value})
        try:
            html=_get(search_url,timeout=25).decode("utf-8","replace")
            if "Resultados" not in html and "resultados" not in html:
                return "SEARCH_NOT_CONFIRMED",[],search_url
            ids=list(dict.fromkeys(re.findall(r'(?:/catalogo/description/|catalogo/description/)([0-9]{2,12})',html)))
            # Search result links are not proof of archive attribution.
            # Confirm each description page before emitting a Simancas hit.
            rows=[]
            for candidate_id in ids[:20]:
                record_status,record_rows,record_detail=pares_simancas(candidate_id,lane)
                if record_status=="EXECUTED":
                    rows.extend(record_rows)
            if rows:
                return "EXECUTED",rows,search_url+" ; confirmed Simancas descriptions only"
            return "ARCHIVE_NOT_CONFIRMED",[],search_url+" ; "+str(len(ids))+" catalogue links, none confirmed as Archivo General de Simancas"
        except Exception as exc:
            return "ACCESS_BLOCKED",[],search_url+" ; "+type(exc).__name__+": "+str(exc)

        return "RECORD_ID_OR_BROWSER_SEARCH_REQUIRED",[],(
            "PARES public search is interactive. Supply a PARES description URL "
            "or numeric record ID for a direct archival-metadata lookup.")
    record_id=match.group(1)
    url="https://pares.cultura.gob.es/ParesBusquedas20/catalogo/description/"+record_id
    try:
        raw=_get(url,timeout=25).decode("utf-8","replace")
        from html import unescape
        plain=unescape(re.sub(r"<[^>]+>"," ",re.sub(r"(?is)<(script|style)[^>]*>.*?</\\1>"," ",raw)))
        plain=" ".join(plain.split())
        if not ("Signatura" in plain and ("Archivo General de Simancas" in plain)):
            return "RECORD_NOT_CONFIRMED",[],url+" did not confirm a Simancas archival description"
        title_match=re.search(r"(?is)<title[^>]*>(.*?)</title>",raw)
        title=unescape(re.sub(r"<[^>]+>"," ",title_match.group(1))).strip() if title_match else "PARES record "+record_id
        sig=re.search(r"Signatura\\s*:\\s*(.{1,180}?)(?=Fecha |Nivel de Descripci|Código de Referencia|Contexto)",plain)
        ref=re.search(r"Código de Referencia\\s*:\\s*(.{1,180}?)(?=Contexto|Contenido y Estructura|Condiciones)",plain)
        return "EXECUTED",[{
            "discovery_repository":"PARES / Archivo General de Simancas",
            "discovery_lane":lane,"connector_status":"EXECUTED",
            "identifier":record_id,"title":title,"url":url,
            "archive":"Archivo General de Simancas",
            "archival_reference":ref.group(1).strip() if ref else None,
            "shelfmark":sig.group(1).strip() if sig else None,
            "date":[],"digital_url":None,
            "evidence_level":"CATALOGUE_METADATA_ONLY",
        }],url
    except Exception as exc:
        return "ACCESS_BLOCKED",[],url+" ; "+type(exc).__name__+": "+str(exc)

def _public_site_index(q,lane,repository,domain,max_records=20):
    """Retain the coverage target without issuing an unconfigured web search.

    No external search provider is currently configured. An unavailable route
    is not an executed zero-result search and does not verify any source.
    """
    scope=(" for "+domain) if domain else ""
    return "UNAVAILABLE",[],"WEB_SEARCH_PROVIDER_NOT_CONFIGURED"+scope+"; search was not executed"


def _abstract_from_index(index):
    """Reconstruct source word positions without inventing text across gaps."""
    if not isinstance(index,dict):return ""
    words={}
    for word,positions in index.items():
        if not isinstance(word,str) or not isinstance(positions,list):continue
        for position in positions:
            if type(position) is int and position>=0:
                words[position]=word if position not in words or words[position]==word else '[ambiguous]'
    parts=[];previous=-1
    for position,word in sorted(words.items()):
        if position>previous+1:parts.append('[...]')
        parts.append(word);previous=position
    return ' '.join(parts)


class _MetadataTextParser(HTMLParser):
    def __init__(self):super().__init__();self.parts=[]
    def handle_data(self,data):self.parts.append(data)


def _abstract_text(value):
    if not isinstance(value,str):return ''
    parser=_MetadataTextParser();parser.feed(value)
    return ' '.join(' '.join(parser.parts).split())


def _public_metadata_url(value):
    if not isinstance(value,str):return None
    try:parsed=urllib.parse.urlsplit(value)
    except ValueError:return None
    return value if parsed.scheme in ('http','https') and parsed.hostname else None


def openalex_works(q,lane):
    """Search scholarly works metadata via the public OpenAlex API.

    Results are discovery leads only. They must not be treated as historical
    verification until the underlying work and its cited primary sources are inspected.
    """
    params={"search":str(q),"per_page":20}
    key=os.getenv("OPENALEX_API_KEY","").strip()
    if key:
        params["api_key"]=key
    url="https://api.openalex.org/works?"+urllib.parse.urlencode(params)
    d=_json(url,timeout=30)
    out=[]
    for x in d.get("results",[]) or []:
        authors=[]
        for a in x.get("authorships",[]) or []:
            name=((a or {}).get("author") or {}).get("display_name")
            if name and name not in authors:
                authors.append(name)
        loc=x.get("primary_location") or {}
        landing=loc.get("landing_page_url") or x.get("doi") or x.get("id")
        locations=[x.get('best_oa_location') or {},loc,*(x.get('locations') or [])]
        pdf_links=[]
        for location in locations:
            if not isinstance(location,dict):continue
            pdf=_public_metadata_url(location.get('pdf_url'))
            if pdf and not any(link['url']==pdf for link in pdf_links):
                pdf_links.append({'url':pdf,'is_oa':location.get('is_oa') is True,
                                  'license':location.get('license'),'version':location.get('version')})
        out.append({
          "discovery_repository":"OpenAlex Scholarly Works",
          "discovery_lane":lane,
          "connector_status":"EXECUTED",
          "identifier":x.get("id") or x.get("doi"),
          "title":x.get("title") or x.get("display_name"),
          "creator":authors[:8],
          "date":[x.get("publication_date") or x.get("publication_year")] if (x.get("publication_date") or x.get("publication_year")) else [],
          "url":landing,
          "doi":x.get("doi"),
          "type":x.get("type"),
          "cited_by_count":x.get("cited_by_count"),
          "description":_abstract_from_index(x.get('abstract_inverted_index')),
          "description_provenance":"OPENALEX_ABSTRACT_METADATA_NOT_INSPECTED_FULLTEXT",
          "fulltext_links":pdf_links,
          "digital_url":next((link['url'] for link in pdf_links if link['is_oa']),None),
          "evidence_level":"SECONDARY_DISCOVERY_ONLY",
          "verification_status":"UNVERIFIED_DISCOVERY",
          "acquisition_policy":"METADATA_DISCOVERY_THEN_INSPECT_UNDERLYING_WORK",
          "discovery_route":"OPENALEX_API"
        })
    safe_url=url if not key else url.replace(urllib.parse.quote_plus(key),"REDACTED")
    return "EXECUTED",out,safe_url

def crossref_works(q,lane):
    """Search Crossref bibliographic metadata for scholarly discovery."""
    params={"query.bibliographic":str(q),"rows":20}
    mailto=os.getenv("CROSSREF_MAILTO","").strip()
    if mailto:
        params["mailto"]=mailto
    url="https://api.crossref.org/works?"+urllib.parse.urlencode(params)
    d=_json(url,timeout=30)
    out=[]
    for x in (d.get("message") or {}).get("items",[]) or []:
        title=x.get("title") or []
        if isinstance(title,list):
            title=" ".join(str(v) for v in title if v)
        authors=[]
        for a in x.get("author",[]) or []:
            name=" ".join(str(v).strip() for v in [a.get("given"),a.get("family")] if v)
            if name and name not in authors:
                authors.append(name)
        date=[]
        for key_name in ("published-print","published-online","issued","created"):
            parts=((x.get(key_name) or {}).get("date-parts") or [])
            if parts and isinstance(parts[0],list):
                date=["-".join(str(v) for v in parts[0])]
                break
        doi=x.get("DOI")
        url_value=x.get("URL") or (("https://doi.org/"+doi) if doi else None)
        out.append({
          "discovery_repository":"Crossref Scholarly Metadata",
          "discovery_lane":lane,
          "connector_status":"EXECUTED",
          "identifier":doi or url_value,
          "title":title,
          "creator":authors[:8],
          "date":date,
          "url":url_value,
          "doi":doi,
          "type":x.get("type"),
          "publisher":x.get("publisher"),
          "container_title":x.get("container-title") or [],
          "description":_abstract_text(x.get('abstract')),
          "description_provenance":"CROSSREF_ABSTRACT_METADATA_NOT_INSPECTED_FULLTEXT",
          "fulltext_links":[{'url':link['URL'],'content_type':link.get('content-type'),
                             'intended_application':link.get('intended-application'),
                             'access_status':'UNVERIFIED'}
                            for link in (x.get('link') or []) if isinstance(link,dict) and _public_metadata_url(link.get('URL'))],
          "evidence_level":"SECONDARY_DISCOVERY_ONLY",
          "verification_status":"UNVERIFIED_DISCOVERY",
          "acquisition_policy":"METADATA_DISCOVERY_THEN_INSPECT_UNDERLYING_WORK",
          "discovery_route":"CROSSREF_REST_API"
        })
    return "EXECUTED",out,url

def academia_public(q,lane):
    return _public_site_index(q,lane,"Academia.edu Public Research","academia.edu",20)

def openarchives_public(q,lane):
    return _public_site_index(q,lane,"OpenArchives.gr / EKT","openarchives.gr",25)

def nlg_public(q,lane):
    return _public_site_index(q,lane,"National Library of Greece Digital Collections","digitalcollections.nlg.gr",25)

def anemi_public(q,lane):
    return _public_site_index(q,lane,"Anemi / University of Crete","anemi.lib.uoc.gr",25)

def unsupported(repository, reason="No stable anonymous machine-search connector configured."):
    return "AUTH_OR_BROWSER_REQUIRED",[],reason

def dispatch(repository,q,lane):
    if repository=="Public Web Source Discovery":
        return _public_site_index(q,lane,repository,None,20)
    """Dispatch exact repository labels from lane_repository_plan.py."""
    if repository=="Gallica/BnF": return bnf_sru(q,lane)  # catalogue SRU is stable public fallback
    if repository=="Google Books": return google_books(q,lane)
    if repository=="Library of Congress": return library_of_congress(q,lane)
    if repository=="Biblioteca Digital Hispánica": return bne_sru(q,lane)
    if repository=="Archives diplomatiques": return archives_diplomatiques(q,lane)
    if repository=="Archives diplomatiques France": return archives_diplomatiques(q,lane)
    if repository=="Internet Culturale": return internet_culturale(q,lane)
    if repository=="Nationaal Archief": return nationaal_archief(q,lane)
    if repository=="The National Archives Public Content": return tna_public_content(q,lane)
    if repository=="Delpher": return delpher_sru(q,lane)
    if repository=="Deutsche Digitale Bibliothek": return ddb(q,lane)
    if repository=="SearchCulture.gr / EKT": return searchculture(q,lane)
    if repository=="OpenArchives.gr / EKT": return openarchives_public(q,lane)
    if repository=="National Library of Greece Digital Collections": return nlg_public(q,lane)
    if repository=="Anemi / University of Crete": return anemi_public(q,lane)
    if repository=="OpenAlex Scholarly Works": return openalex_works(q,lane)
    if repository=="Crossref Scholarly Metadata": return crossref_works(q,lane)
    if repository=="Academia.edu Public Research": return academia_public(q,lane)
    if repository=="İSAM Kütüphanesi": return isam(q,lane)
    if repository=="PARES / Archivo General de Simancas":
        return pares_simancas(q,lane)
    if repository in ("Türkiye Devlet Arşivleri / BOA",):
        return unsupported(repository,"BOA catalogue requires authenticated interactive research access.")
    if repository in ("Archivio di Stato di Venezia / SIAS","SIAS / Italian State Archives"):
        return unsupported(repository,"SIAS target retained; stable anonymous term-search endpoint not yet established.")
    if repository=="Archives nationales":
        return unsupported(repository,"Archives nationales target retained; no general anonymous API connector established.")
    if repository=="British Library":
        return unsupported(repository,"British Library target retained; public catalogue record pages exist but no stable anonymous search API configured.")
    return "CITATION_CHASE_WEB_OR_API_CONNECTOR_REQUIRED",[],"Repository target known; connector not configured."

