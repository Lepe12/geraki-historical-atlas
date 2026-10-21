"""Bounded public document acquisition and linked-document citation chase.

Page text and PDF scan indexes are acquisition products, never original inspection.
"""
import hashlib, ipaddress, json, pathlib, re, socket, subprocess, time, urllib.error, urllib.parse, urllib.request, unicodedata
from html.parser import HTMLParser

SOCIAL=('facebook.com','instagram.com','tiktok.com','youtube.com','linkedin.com')
# Bounded document reads must accommodate ordinary digitized volumes. The live
# JSON bridge limit is unrelated to the size of an acquired source PDF.
MAX_DOCUMENT_BYTES=32_000_000
def public_url(url,resolve=True):
    p=urllib.parse.urlsplit(str(url))
    if p.scheme not in ('http','https') or not p.hostname or p.username or p.password or p.port not in (None,80,443):
        raise ValueError('UNSAFE_DOCUMENT_URL')
    if p.scheme=='http' and p.hostname=='hdl.handle.net':p=p._replace(scheme='https')
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
    req=urllib.request.Request(url,headers={'User-Agent':'Piratecartography-Research/3.0','Accept':'text/html,application/pdf,text/plain,application/json,image/*;q=0.8'})
    for attempt in range(3):
        try:
            with urllib.request.build_opener(Redirects()).open(req,timeout=12) as response:
                data=response.read(MAX_DOCUMENT_BYTES+1);ctype=response.headers.get('Content-Type','');final=public_url(response.url)
            break
        except urllib.error.HTTPError as error:
            if error.code not in (502,503,504) or attempt==2:raise
            time.sleep(attempt+1)
    if len(data)>MAX_DOCUMENT_BYTES:raise ValueError('DOCUMENT_TOO_LARGE')
    return data,ctype,final

class Document(HTMLParser):
    def __init__(self):super().__init__();self.parts=[];self.links=[];self.skip=0;self.metadata={}
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if tag in ('script','style','nav'):self.skip+=1
        if tag=='a' and attrs.get('href'):self.links.append(attrs['href'])
        if tag=='meta' and attrs.get('content'):
            name=(attrs.get('name') or attrs.get('property') or '').lower()
            if name.startswith(('citation_','dc.','dcterms.')):
                self.metadata.setdefault(name,[]).append(attrs['content'])
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
    files=[];links=[];pages=[];errors=[];metadata={}
    is_pdf=data.startswith(b'%PDF-')
    if re.search(r'\.pdf(?:$|\?)',str(url),re.I) and not is_pdf:raise ValueError('EXPECTED_PDF_NOT_RETURNED')
    is_image=ctype.lower().startswith('image/')
    if is_image:
        import shutil
        if not shutil.which('tesseract'):raise ValueError('OCR_RUNTIME_NOT_AVAILABLE')
        image=out/(stem+('.png' if data.startswith(b'\x89PNG') else '.jpg'))
        image.write_bytes(data);files.append(str(image))
        languages='eng+fra+ita+ell'
        proc=subprocess.run(['tesseract',str(image),'stdout','-l',languages],capture_output=True,timeout=60)
        if proc.returncode:raise ValueError('IMAGE_OCR_FAILED')
        content=proc.stdout.decode('utf-8','replace')
        if len(content.strip())<40:raise ValueError('NO_USABLE_OCR_TEXT')
        text=out/(stem+'.txt');text.write_text(content,encoding='utf-8');files.append(str(text))
        pages=[{'scan_index_0_based':None,'printed_page':None,'start_char':0,'end_char':len(content),
                'image_url':final,'image_file':str(image),'original_inspected':False}]
        receipt={'source_url':final,'source_image_sha256':hashlib.sha256(data).hexdigest(),
                 'method':'TESSERACT_OCR','languages':languages,
                 'version':subprocess.check_output(['tesseract','--version'],text=True).splitlines()[0],
                 'text_sha256':hashlib.sha256(content.encode()).hexdigest(),
                 'original_inspected':False,'verified':False}
        record_file=out/(stem+'.ocr.json');record_file.write_text(json.dumps(receipt,indent=2)+'\n');files.append(str(record_file))
    elif is_pdf:
        binary=out/(stem+'.pdf');binary.write_bytes(data);files.append(str(binary))
        text=out/(stem+'.txt')
        proc=subprocess.run(['pdftotext','-enc','UTF-8',str(binary),str(text)],capture_output=True,timeout=30)
        if proc.returncode:raise ValueError('PDF_TEXT_EXTRACTION_FAILED')
        content=text.read_text(encoding='utf-8',errors='replace')
        offset=0
        chunks=content.split('\f')
        if chunks and not chunks[-1].strip():chunks=chunks[:-1]
        for index,page in enumerate(chunks):
            pages.append({'scan_index_0_based':index,'printed_page':None,'start_char':offset,'end_char':offset+len(page),'start_line':content.count('\n',0,offset)+1,'end_line':content.count('\n',0,offset+len(page))+1})
            offset+=len(page)+1
        files.append(str(text))
        loc=out/(stem+'.pages.json');loc.write_text(json.dumps({'source_url':final,'text_file':str(text),'pages':pages,
            'text_order':'POPPLER_READING_ORDER','source_pdf_sha256':hashlib.sha256(data).hexdigest(),
            'text_sha256':hashlib.sha256(content.encode()).hexdigest(),
            'extractor_version':subprocess.check_output(['pdftotext','-v'],stderr=subprocess.STDOUT,text=True).splitlines()[0],
            'original_inspected':False},ensure_ascii=False,indent=2));files.append(str(loc))
    else:
        if not ('html' in ctype.lower() or ctype.lower().startswith('text/plain')):raise ValueError('UNSUPPORTED_DOCUMENT_TYPE')
        raw=data.decode('utf-8','replace')
        if 'html' in ctype.lower():
            document=Document();document.feed(raw)
            metadata=document.metadata
            content=''.join(document.parts)
            links=list(dict.fromkeys(urllib.parse.urljoin(final,h) for h in document.links))
        else:content=raw
        if (re.search(r'verify.{0,45}(?:not a robot|human)',content,re.I|re.S) and
                re.search(r'javascript|captcha',content,re.I)) or ('Just a moment' in raw[:2000] and '_cf_chl' in raw):
            raise ValueError('ACCESS_CHALLENGE_RETURNED')
        if len(content.strip())<100:raise ValueError('NO_USABLE_DOCUMENT_TEXT')
        text=out/(stem+'.txt');text.write_text(content,encoding='utf-8');files.append(str(text))
        rawdir=out/'raw';rawdir.mkdir(exist_ok=True)
        rawfile=rawdir/(stem+'.html');rawfile.write_bytes(data);files.append(str(rawfile))
    record={'url':final,'sha256':hashlib.sha256(data).hexdigest(),'files':files,'pages':pages,
            'status':'TEXT_ACQUIRED' if content.strip() else 'PDF_ACQUIRED_NO_TEXT','original_inspected':False,'verification_status':'NEEDS_EVIDENCE',
            'pdf_file':str(binary) if is_pdf else None,'source_type':'IMAGE_OCR' if is_image else 'PDF_TEXT' if is_pdf else 'WEB_PAGE_TEXT',
            'bibliographic_metadata':metadata,'linked_documents':[],'citation_queue':[]}
    pdfs=[]
    for link in links:
        try:link=public_url(link,resolve=False)
        except ValueError:continue
        if re.search(r'\.pdf(?:$|\?)|/article/download/|/article/view/\d+/\d+|/bitstream/',link,re.I):pdfs.append(link)
    for link in pdfs:
        if follow and len(record['linked_documents'])<2:
            try:record['linked_documents'].append(acquire(link,out,fetcher,follow=False))
            except Exception as exc:errors.append({'url':link,'code':type(exc).__name__});record['citation_queue'].append(link)
        else:record['citation_queue'].append(link)
    record['bibliographic_queries']=bibliographic_queries(content)
    record['errors']=errors
    record['citation_policy']='Only linked documents fetched; bibliographic references without a located URL remain unresolved.'
    return record


def bibliographic_queries(text):
    """Extract bounded citation titles; prose quotes alone are not references."""
    queries=[]
    def fold(value):
        return ''.join(c for c in unicodedata.normalize('NFD',value) if not unicodedata.combining(c)).casefold()
    def add(value):
        title=' '.join(value.split()).strip(' «»“”".,;')
        if not 20<=len(title)<=240 or len(title.split())<4:return
        if '...' in title or '…' in title:return
        # ISBNs and page locators are not part of a title query.
        title=re.split(r'\s+ISBN\b|,\s*(?:τομ|τόμ|σελ|vol\b|pp\.)',title,flags=re.I)[0].strip(' .,;')
        key=re.sub(r'[^\w]+','',fold(title))
        for index,old in enumerate(queries):
            oldkey=re.sub(r'[^\w]+','',fold(old))
            if key==oldkey or (min(len(key),len(oldkey))>=30 and (key in oldkey or oldkey in key)):
                if len(key)<len(oldkey):queries[index]=title
                return
        queries.append(title)
    for match in re.finditer(r'(?:«|<<|“|")([^»”<>"\n]{20,300}?)(?:»|>>|”|")',text):
        before=fold(text[max(0,match.start()-1000):match.start()])
        if re.search(r'δημοσιευ|βιβλιογραφ|publication|bibliograph|references|πηγ|παραπομπ',before):add(match.group(1))
    in_references=False
    for line in text.splitlines():
        plain=line.strip()
        heading=fold(re.sub(r'\[[^]]*\]','',plain)).strip(' :')
        if heading in ('πηγεσ','βιβλιογραφια','παραπομπεσ','references','bibliography','sources','further reading'):
            in_references=True;continue
        if heading in ('καθιερωμενοι οροι','εξωτερικοι συνδεσμοι','external links','authority control','categories'):
            in_references=False
        if not in_references:continue
        citation=re.search(r'\((?:1\d{3}|20\d{2})\)\.\s+(.+)',plain)
        if citation:
            title=re.split(r'\.\s+|,\s+[^,:]{2,60}:',citation.group(1),maxsplit=1)[0]
            add(title)
    return queries[:8]


def citation_title_match(query, record):
    """A cited work need not name the actor, but must match its title query.

    Search ranking, a shared surname and a PDF extension are insufficient.
    This is acquisition triage, not bibliographic identity verification.
    """
    def tokens(value):
        text=''.join(c for c in unicodedata.normalize('NFD',str(value or '')) if not unicodedata.combining(c)).casefold()
        return set(re.findall(r'[^\W\d_]{4,}',text))-{'with','from','during','della','delle','degli','para','dans','pour','τους','στην','στον','κατα','μετα','περι','history','historical','download','document'}
    wanted=tokens(query)
    # A description may merely cite another work; it cannot identify this work.
    found=tokens(record.get('title') or '')
    overlap=len(wanted & found)
    return bool(len(wanted)>=3 and overlap>=3 and overlap/len(wanted)>=0.8)

