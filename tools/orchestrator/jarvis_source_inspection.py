"""Anonymous, bounded inspection of public historical HTML search hits.

Reading a page is NOT validation of the source or of a historical claim.
"""
from __future__ import annotations
import html, ipaddress, io, re, ssl, urllib.parse, urllib.request
from html.parser import HTMLParser

HOSTS=('bnf.fr','loc.gov','archive.org','nationalarchives.gov.uk',
       'diplomatie.gouv.fr','internetculturale.it','cultura.gov.it',
       'openarchives.gr','anemi.lib.uoc.gr','google.com','googleapis.com',
       'isam.org.tr','nationaalarchief.nl','kb.nl','bne.es','searchculture.gr',
       'openalex.org','crossref.org','zenodo.org')

def allowed(url):
    try:
        p=urllib.parse.urlsplit(str(url)); h=(p.hostname or '').lower().rstrip('.')
        if p.scheme!='https' or not h or p.username or p.password or p.port not in (None,443):return False
        try:ipaddress.ip_address(h);return False
        except ValueError:pass
        return any(h==d or h.endswith('.'+d) for d in HOSTS)
    except (ValueError,TypeError):return False

class PlainText(HTMLParser):
    def __init__(self):super().__init__();self.parts=[];self.skip=0
    def handle_starttag(self,tag,attrs):
        if tag in {'script','style','noscript','svg'}:self.skip+=1
        if tag in {'p','h1','h2','h3','li','br'}:self.parts.append(' ')
    def handle_endtag(self,tag):
        if tag in {'script','style','noscript','svg'} and self.skip:self.skip-=1
    def handle_data(self,data):
        if not self.skip:self.parts.append(data)

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        raise ValueError('REDIRECT_REQUIRES_REVIEW')

def read(url,opener=None):
    if not allowed(url):return {'status':'URL_NOT_ALLOWLISTED'}
    try:
        opener=opener or urllib.request.build_opener(NoRedirect(),urllib.request.HTTPSHandler(context=ssl.create_default_context()))
        req=urllib.request.Request(url,headers={'User-Agent':'N7-Historical-Research/1.0',
                                                 'Accept':'text/html,application/xhtml+xml'})
        with opener.open(req,timeout=9) as resp:
            if not allowed(resp.geturl()):return {'status':'UNSAFE_FINAL_URL'}
            typ=resp.headers.get('Content-Type','').lower()
            is_pdf='pdf' in typ
            if 'html' not in typ and not is_pdf:
                return {'status':'UNSUPPORTED_DOCUMENT_TYPE'}
            cap=3_000_000 if is_pdf else 450_000
            raw=resp.read(cap+1)
        if len(raw)>cap:return {'status':'DOCUMENT_TOO_LARGE'}
        if is_pdf:
            try:
                from pypdf import PdfReader
                pdf=PdfReader(io.BytesIO(raw),strict=False)
                if pdf.is_encrypted:return {'status':'ENCRYPTED_PDF_REQUIRES_REVIEW'}
                pages=[(pdf.pages[i].extract_text() or '') for i in range(min(6,len(pdf.pages)))]
                body=' '.join(' '.join(pages).split())[:35000]
                return {'status':'DOCUMENT_READ','text':body,'pages_read':len(pages)}
            except ImportError:
                return {'status':'PDF_READER_NOT_INSTALLED'}
            except Exception:
                return {'status':'PDF_EXTRACTION_FAILED'}
        parser=PlainText();parser.feed(raw.decode('utf-8','replace'))
        return {'status':'PAGE_READ','text':' '.join(html.unescape(' '.join(parser.parts)).split())[:35000]}
    except (OSError,ValueError,TimeoutError) as exc:
        return {'status':'PAGE_UNAVAILABLE','error':type(exc).__name__}

def inspect(search_runs,*,target,aliases=(),max_pages=4,reader=read):
    """Follow only allowed result URLs; mark excerpts for review, never VERIFIED."""
    from unicodedata import normalize,combining
    def fold(value):
        s=normalize('NFKD',str(value or ''))
        return ''.join(c for c in s if not combining(c)).casefold()
    place=fold(str(target).split(',')[0].strip())
    names=[]
    for a in aliases:
        a=str(a).strip()
        if a and fold(a) not in fold(target) and (len(a.split())>=2 or re.search(r'creve|κρεβε',fold(a))):
            names.append(fold(a))
    inspected=[];seen=set()
    for run in search_runs or []:
        if not isinstance(run,dict):continue
        for rec in run.get('records') or []:
            if not isinstance(rec,dict):continue
            url=str(rec.get('url') or rec.get('digital_url') or '').strip()
            if not url or url in seen or not allowed(url):continue
            seen.add(url)
            result=reader(url); status=str(result.get('status'))
            item={'url':url,'title':str(rec.get('title') or '')[:300],'status':status,
                  'historically_verified':False,'citation_verified':False}
            if status in ('PAGE_READ','DOCUMENT_READ'):
                text=str(result.get('text') or '')
                item['contains_target']=bool(place and place in fold(text))
                item['contains_person']=any(n in fold(text) for n in names)
                if item['contains_target'] and item['contains_person']:
                    pos=text.casefold().find(str(target).split(',')[0].casefold())
                    pos=max(0,pos)
                    item['page_excerpt']=text[max(0,pos-200):pos+500]
                    item['status']='CO_OCCURRENCE_NEEDS_REVIEW'
                else:item['status']='PAGE_READ_NO_EVENT_MATCH'
            inspected.append(item)
            if len(inspected)>=max(1,min(4,max_pages)):break
        if len(inspected)>=max(1,min(4,max_pages)):break
    return {'schema':'n7-public-source-inspection-v1','inspected_pages':inspected,
            'inspected_count':len(inspected),'historically_verified':False,
            'rule':'A page or textual co-occurrence is not a verified historical attestation.'}
