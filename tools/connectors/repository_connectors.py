#!/usr/bin/env python3
"""Public repository connectors used by PCT research lanes.

Each connector returns (status, records, diagnostic).  EXECUTED means a real
remote query completed.  Authentication/browser/key requirements are explicit
and are never reported as successful searches.
"""
from __future__ import annotations
import json, os, re, time, urllib.parse, urllib.request, urllib.error, xml.etree.ElementTree as ET
from html.parser import HTMLParser

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
    params={"version":"1.2","operation":"searchRetrieve",
      "query":'alma.all_for_ui="'+q.replace('"'," ")+'"',
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
    d=_json(url);out=[]
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
            if exc.code not in (429,502,503,504): raise
            time.sleep(2*(attempt+1))
    else:
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
    url="https://www.searchculture.gr/aggregator/api/search.json?"+urllib.parse.urlencode({"apiKey":key,"general_term":q,"page":1,"pageSize":50})
    d=_json(url);out=[]
    for x in d.get("results",[]) or d.get("items",[]) or []:
        uri=x.get("uri") or x.get("id")
        title=x.get("dc_title") or x.get("title")
        if isinstance(title,list): title=" ".join(str(v) for v in title)
        row={"discovery_repository":"SearchCulture.gr / EKT","discovery_lane":lane,"connector_status":"EXECUTED","identifier":uri,"title":title,"date":x.get("dc_date") or x.get("date") or [],"url":uri,"raw":x}
        if uri:
            try:
                jd=_json(uri.rstrip("/")+"/json",timeout=12)
                row["raw_full"]=jd
                row["metadata_text"]=json.dumps(jd,ensure_ascii=False)
            except Exception:
                pass
        out.append(row)
    return "EXECUTED",out,url

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

def unsupported(repository, reason="No stable anonymous machine-search connector configured."):
    return "AUTH_OR_BROWSER_REQUIRED",[],reason

def dispatch(repository,q,lane):
    """Dispatch exact repository labels from lane_repository_plan.py."""
    if repository=="Gallica/BnF": return bnf_sru(q,lane)  # catalogue SRU is stable public fallback
    if repository=="Google Books": return google_books(q,lane)
    if repository=="Library of Congress": return library_of_congress(q,lane)
    if repository=="Biblioteca Digital Hispánica": return bne_sru(q,lane)
    if repository=="Archives diplomatiques": return archives_diplomatiques(q,lane)
    if repository=="Archives diplomatiques France": return archives_diplomatiques(q,lane)
    if repository=="Internet Culturale": return internet_culturale(q,lane)
    if repository=="Nationaal Archief": return nationaal_archief(q,lane)
    if repository=="Delpher": return delpher_sru(q,lane)
    if repository=="Deutsche Digitale Bibliothek": return ddb(q,lane)
    if repository=="SearchCulture.gr / EKT": return searchculture(q,lane)
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
