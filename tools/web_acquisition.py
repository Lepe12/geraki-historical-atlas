"""Bounded public document acquisition and linked-document citation chase.

Page text and PDF scan indexes are acquisition products, never original inspection.
"""
import hashlib, ipaddress, json, pathlib, re, socket, subprocess, urllib.parse, urllib.request, unicodedata
from html.parser import HTMLParser

SOCIAL=('facebook.com','instagram.com','tiktok.com','youtube.com','linkedin.com')
def public_url(url,resolve=True):
    p=urllib.parse.urlsplit(str(url))
    if p.scheme not in ('http','https') or not p.hostname or p.username or p.password or p.port not in (None,80,443):
        raise ValueError('UNSAFE_DOCUMENT_URL')
    if p.hostname=='localhost' or p.hostname.endswith(('.local','.internal')):raise ValueError('PRIVATE_DOCUMENT_URL')
    try: addresses=[ipaddress.ip_address(p.hostname)]
    except ValueError:
        addresses=[ipaddress.ip_address(x[4][0]) for x in socket.getaddrinfo(p.hostname,p.port or (443 if p.scheme=='https' else 80))] if resolve else []
    if any(not a.is_global for a in addresses):raise ValueError('PRIVATE_DOCUMENT_URL')
    return urllib.parse.urlunsplit((p.scheme,p.netloc,p.path,p.query,''))

class Redirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        return super().redirect_request(req,fp,code,msg,headers,public_url(newurl))

def fetch(url):
    url=public_url(url)
    req=urllib.request.Request(url,headers={'User-Agent':'Piratecartography-Research/3.0','Accept':'text/html,application/pdf,text/plain'})
    with urllib.request.build_opener(Redirects()).open(req,timeout=12) as response:
        data=response.read(12_000_001);ctype=response.headers.get('Content-Type','');final=public_url(response.url)
    if len(data)>12_000_000:raise ValueError('DOCUMENT_TOO_LARGE')
    return data,ctype,final

class Document(HTMLParser):
    def __init__(self):super().__init__();self.parts=[];self.links=[];self.skip=0
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if tag in ('script','style','nav'):self.skip+=1
        if tag=='a' and attrs.get('href'):self.links.append(attrs['href'])
        if tag in ('p','br','div','h1','h2','h3','li'):self.parts.append('\n')
    def handle_endtag(self,tag):
        if tag in ('script','style','nav') and self.skip:self.skip-=1
    def handle_data(self,data):
        if not self.skip:self.parts.append(data)

def acquire(url,out,fetcher=fetch,follow=True):
    """Acquire one source plus at most two linked PDFs; leave other citations queued."""
    out=pathlib.Path(out);out.mkdir(parents=True,exist_ok=True)
    host=urllib.parse.urlsplit(url).hostname or ''
    if any(host==h or host.endswith('.'+h) for h in SOCIAL):raise ValueError('SOCIAL_DISCOVERY_ONLY')
    data,ctype,final=fetcher(url)
    stem=hashlib.sha256(final.encode()).hexdigest()[:24]
    files=[];links=[];pages=[];errors=[]
    is_pdf=data.startswith(b'%PDF-')
    if is_pdf:
        binary=out/(stem+'.pdf');binary.write_bytes(data);files.append(str(binary))
        text=out/(stem+'.txt')
        proc=subprocess.run(['pdftotext','-layout',str(binary),str(text)],capture_output=True,timeout=30)
        if proc.returncode:raise ValueError('PDF_TEXT_EXTRACTION_FAILED')
        content=text.read_text(encoding='utf-8',errors='replace')
        offset=0
        chunks=content.split('\f')
        if chunks and not chunks[-1].strip():chunks=chunks[:-1]
        for index,page in enumerate(chunks):
            pages.append({'scan_index_0_based':index,'printed_page':None,'start_char':offset,'end_char':offset+len(page),'start_line':content.count('\n',0,offset)+1,'end_line':content.count('\n',0,offset+len(page))+1})
            offset+=len(page)+1
        files.append(str(text))
        loc=out/(stem+'.pages.json');loc.write_text(json.dumps({'source_url':final,'text_file':str(text),'pages':pages,'original_inspected':False},ensure_ascii=False,indent=2));files.append(str(loc))
    else:
        if not ('html' in ctype.lower() or ctype.lower().startswith('text/plain')):raise ValueError('UNSUPPORTED_DOCUMENT_TYPE')
        raw=data.decode('utf-8','replace')
        if 'html' in ctype.lower():
            document=Document();document.feed(raw)
            content=''.join(document.parts)
            links=list(dict.fromkeys(urllib.parse.urljoin(final,h) for h in document.links))
        else:content=raw
        if len(content.strip())<100:raise ValueError('NO_USABLE_DOCUMENT_TEXT')
        text=out/(stem+'.txt');text.write_text(content,encoding='utf-8');files.append(str(text))
        rawdir=out/'raw';rawdir.mkdir(exist_ok=True)
        rawfile=rawdir/(stem+'.html');rawfile.write_bytes(data);files.append(str(rawfile))
    record={'url':final,'sha256':hashlib.sha256(data).hexdigest(),'files':files,'pages':pages,
            'status':'TEXT_ACQUIRED' if content.strip() else 'PDF_ACQUIRED_NO_TEXT','original_inspected':False,'verification_status':'NEEDS_EVIDENCE',
            'pdf_file':str(binary) if is_pdf else None,'source_type':'PDF_TEXT' if is_pdf else 'WEB_PAGE_TEXT','linked_documents':[],'citation_queue':[]}
    pdfs=[]
    for link in links:
        try:link=public_url(link,resolve=False)
        except ValueError:continue
        if re.search(r'\.pdf(?:$|\?)|/article/download/|/bitstream/',link,re.I):pdfs.append(link)
    for link in pdfs:
        if follow and len(record['linked_documents'])<2:
            try:record['linked_documents'].append(acquire(link,out,fetcher,follow=False))
            except Exception as exc:errors.append({'url':link,'code':type(exc).__name__});record['citation_queue'].append(link)
        else:record['citation_queue'].append(link)
    record['bibliographic_queries']=bibliographic_queries(content) if not is_pdf else []
    record['errors']=errors
    record['citation_policy']='Only linked documents fetched; bibliographic references without a located URL remain unresolved.'
    return record


def bibliographic_queries(text):
    queries=[]
    for match in re.finditer(r'«([^»]{20,240})»|<<([^<>]{20,240})>>',text):
        before=text[max(0,match.start()-300):match.start()]
        folded=''.join(c for c in unicodedata.normalize('NFD',before) if not unicodedata.combining(c)).casefold()
        if not re.search(r'δημοσιευ|βιβλιογραφ|publication|bibliograph|references|πηγ',folded):continue
        title=' '.join((match.group(1) or match.group(2)).split())
        if len(title.split())>=4 and title not in queries:queries.append(title)
    return queries[:2]
