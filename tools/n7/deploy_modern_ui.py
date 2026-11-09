#!/usr/bin/env python3
"""Deploy only public N7 UI assets; preserve every backend/data/model file."""
import ftplib,hashlib,io,json,os,re,secrets,socket,ssl,subprocess,tempfile,time
from pathlib import Path
import urllib.request,urllib.error

HERE=Path(__file__).resolve().parent
ROOT='/bot.piratecartography.com/n7-app/public'
BASE='https://bot.piratecartography.com'
TLS='linux3087.grserver.gr'
MARK='N7_MODERN_LIGHT_UI_V1'
PREVIOUS_JS='892eebef10ee6d3e03eefcd38cff56c615f93c403ade07d3520a42b0e8fdff95'
PREVIOUS_CSS='31419687b2d5774d2b67e38a5401b55cb376f8a83321315aa1bf475e1bb081aa'

def canonical(text):return (text.rstrip()+'\n').encode()

def sha(data):return hashlib.sha256(data).hexdigest()
def read(ftp,name):
    out=[];ftp.retrbinary('RETR '+name,out.append);return b''.join(out)
def js_check(data):
    with tempfile.NamedTemporaryFile(suffix='.js') as f:
        f.write(data);f.flush()
        result=subprocess.run(['node','--check',f.name],capture_output=True,timeout=20)
        if result.returncode:raise RuntimeError('N7_MODERN_JS_SYNTAX_FAILED')

def patch_library(original):
    text=original.decode('utf8')
    if 'N7_SOURCE_LIBRARY_UI_V' not in text:raise RuntimeError('N7_LIBRARY_UI_UNRECOGNIZED')
    marker='// N7_LIBRARY_CHAT_ATTACH_V1'
    block="if(window.N7ChatDocuments){const chatButton=button('Στη συνομιλία',()=>window.N7ChatDocuments.attachLibrary(m).catch(showError));chatButton.className='n7-chat-attach';row.append(chatButton);} "
    anchor="row.append(button('Στοιχεία',"
    if marker in text:
        if text.count(marker)!=1 or text.count(block)!=1:raise RuntimeError('N7_LIBRARY_CHAT_UNREVIEWED')
        return original
    if text.count(anchor)!=1:raise RuntimeError('N7_LIBRARY_CHAT_ANCHOR_MISSING')
    text=text.replace(anchor,block+anchor,1)
    if 'N7_SOURCE_LIBRARY_UI_V2' in text and 'Array.from(row.children).slice(2)' in text:
        text=text.replace('Array.from(row.children).slice(2)',"Array.from(row.children).slice(2).filter(el=>!el.classList.contains('n7-chat-attach'))",1)
    result=(marker+'\n'+text).encode()
    js_check(result)
    return result

def patch_assets(original):
    app=original['app.js'].decode('utf8');css=original['style.css'].decode('utf8');html=original['index.html'].decode('utf8')
    for marker in ('N7_OWNER_MEMORY_UI_V1','N7_CHAT_CORRECTION_CONFIRM_V1','N7_NONBLOCKING_QUEUE_WATCH_v1'):
        if marker not in app:raise RuntimeError('N7_REQUIRED_PREVIOUS_UI_MISSING')
    for name in ('loginform','application','new','conversations','taskview','messages','chat','message','send'):
        if not re.search(r'\bid=[\"\']'+re.escape(name)+r'[\"\']',html):raise RuntimeError('N7_UNEXPECTED_INDEX')
    addon=(HERE/'modern-ui.js').read_text();theme=(HERE/'modern-ui.css').read_text();editor=(HERE/'editor-diff.js').read_text()
    if MARK in app:
        marker='// '+MARK
        if app.count(marker)!=1:raise RuntimeError('N7_MODERN_AMBIGUOUS_SOURCE')
        at=app.index(marker)
        if sha(canonical(app[at:])) not in {PREVIOUS_JS,sha(canonical(addon))}:raise RuntimeError('N7_MODERN_UNREVIEWED_SOURCE')
        app_prefix=app[:at]
        diff_marker='// N7_EDITOR_DIFF_V1'
        if diff_marker in app_prefix:
            pos=app_prefix.index(diff_marker)
            if app_prefix.count(diff_marker)!=1 or canonical(app_prefix[pos:])!=canonical(editor):raise RuntimeError('N7_EDITOR_UNREVIEWED_SOURCE')
            app_prefix=app_prefix[:pos]
        css_marker='/* N7_MODERN_LIGHT_STYLE_V1 */'
        if css.count(css_marker)!=1:raise RuntimeError('N7_MODERN_AMBIGUOUS_STYLE')
        at=css.index(css_marker)
        if sha(canonical(css[at:])) not in {PREVIOUS_CSS,sha(canonical(theme))}:raise RuntimeError('N7_MODERN_UNREVIEWED_STYLE')
        css_prefix=css[:at]
    else:app_prefix=app+'\n';css_prefix=css+'\n'
    revised_app=(app_prefix+editor+'\n'+addon+'\n').encode()
    revised_css=(css_prefix+theme+'\n').encode()
    release=sha(revised_app+revised_css)[:12]
    for attr,name in [('src','app.js'),('href','style.css'),('src','n7-library-ui.js')]:
        pattern=r'('+attr+r'=[\"\'])(?:https://bot\.piratecartography\.com)?/'+re.escape(name)+r'(?:\?[^\"\']*)?([\"\'])'
        html,n=re.subn(pattern,lambda m:m[1]+'/'+name+'?n7modern='+release+m[2],html)
        if n!=1:raise RuntimeError('N7_ASSET_REFERENCE_NOT_UNIQUE_'+name)
    html=re.sub(r'<title>.*?</title>','<title>N7 · Ο προσωπικός σου χώρος</title>',html,flags=re.S)
    html=re.sub(r'(name=[\"\']theme-color[\"\']\s+content=[\"\'])[^\"\']+',lambda m:m[1]+'#faf9f6',html)
    revised={'app.js':revised_app,'style.css':revised_css,'index.html':html.encode(),'n7-library-ui.js':patch_library(original['n7-library-ui.js'])}
    js_check(revised_app)
    return revised

def connect():
    host=os.environ['PCT_FTPS_HOST'];port=int(os.getenv('PCT_FTPS_PORT','21'))
    ips=lambda h:{x[4][0] for x in socket.getaddrinfo(h,port,type=socket.SOCK_STREAM)}
    if not ips(host).intersection(ips(TLS)):raise RuntimeError('N7_UNEXPECTED_FTPS_HOST')
    ftp=ftplib.FTP_TLS(timeout=40,context=ssl.create_default_context())
    ftp.connect(host,port);ftp.host=TLS;ftp.login(os.environ['PCT_FTPS_USER'],os.environ['PCT_FTPS_PASSWORD']);ftp.prot_p()
    ftp.cwd(ROOT)
    if ftp.pwd().rstrip('/')!=ROOT:raise RuntimeError('N7_UNEXPECTED_PUBLIC_ROOT')
    return ftp

def fetch(path):
    req=urllib.request.Request(BASE+path,headers={'Cache-Control':'no-cache, no-store','Pragma':'no-cache','User-Agent':'N7-modern-ui-verify/1'})
    return urllib.request.urlopen(req,context=ssl.create_default_context(),timeout=20)

def verify(files):
    for name,expected in files.items():
        for attempt in range(4):
            with fetch('/'+name+'?n7verify='+secrets.token_hex(12)) as r:
                valid=r.status==200 and sha(r.read(len(expected)+1))==sha(expected)
            if valid:break
            if attempt==3:raise RuntimeError('N7_PUBLIC_ASSET_MISMATCH_'+name)
            time.sleep(2)
    with fetch('/api/status') as r:
        data=json.loads(r.read(20000))
        if r.status!=200 or data.get('modelConfigured') is not True:raise RuntimeError('N7_MODEL_CONFIGURATION_FAILED')
    for p in ('/api/n7/approved-lessons','/api/conversations','/api/tasks'):
        try:
            with fetch(p):pass
        except urllib.error.HTTPError as e:
            if e.code==401:continue
            raise
        raise RuntimeError('N7_PRIVATE_ENDPOINT_EXPOSED')
    print('N7_MODERN_LIVE_VERIFIED=true exact_asset_hashes=true modelConfigured=true privateEndpoints=401')

def main():
    dry=os.getenv('N7_DRY_RUN','1')!='0';ftp=connect();stages=[];backups=[]
    try:
        # Read-only compatibility check: never replace backend code for this UI repair.
        ftp.cwd('/bot.piratecartography.com/n7-app')
        server=read(ftp,'server.js');stream=read(ftp,'n7-stream-attachments.js')
        if b'/stream' not in server and b'\\/stream' not in server:raise RuntimeError('N7_STREAM_ROUTE_MISSING')
        if any(x not in stream for x in (b'parseAttachments',b'buildPrompt',b'image_url',b'pdfText')):raise RuntimeError('N7_DOCUMENT_BACKEND_UNSUPPORTED')
        ftp.cwd(ROOT)
        original={name:read(ftp,name) for name in ('app.js','style.css','index.html','n7-library-ui.js')}
        revised=patch_assets(original)
        fixture=os.getenv('N7_FIXTURE_DIR')
        if fixture:
            target=Path(fixture);target.mkdir(parents=True,exist_ok=True)
            for name,data in revised.items():(target/name).write_bytes(data)
            for name in ('n7-mission-owner-ui.js','historical-library.js'):
                (target/name).write_bytes(read(ftp,name))
        print('N7_MODERN_PREFLIGHT_OK dry_run='+str(dry)+' files=app.js,style.css,index.html,n7-library-ui.js backendChanged=false dataChanged=false')
        if dry:return
        tag=secrets.token_hex(8)
        # Stage and verify all public assets before replacing any active file.
        for name,data in revised.items():
            stage='.n7-modern-stage-'+tag+'-'+name
            ftp.storbinary('STOR '+stage,io.BytesIO(data));stages.append(stage)
            ftp.sendcmd('SITE CHMOD 644 '+stage)
            if sha(read(ftp,stage))!=sha(data):raise RuntimeError('N7_STAGE_INTEGRITY_FAILED')
        for name in revised:
            if read(ftp,name)!=original[name]:raise RuntimeError('N7_CONCURRENT_UI_CHANGE')
        for name in revised:
            stage='.n7-modern-stage-'+tag+'-'+name;backup='.n7-modern-backup-'+tag+'-'+name
            ftp.rename(name,backup)
            try:ftp.rename(stage,name)
            except BaseException:ftp.rename(backup,name);raise
            stages.remove(stage);backups.append((name,backup))
            if read(ftp,name)!=revised[name]:raise RuntimeError('N7_FINAL_INTEGRITY_FAILED')
        verify(revised)
        print('N7_MODERN_DEPLOY_SUCCESS=true backendUntouched=true conversationsPreserved=true')
    except BaseException:
        for name,backup in reversed(backups):
            try:ftp.delete(name);ftp.rename(backup,name)
            except ftplib.all_errors:print('N7_MODERN_MANUAL_ROLLBACK_NEEDED='+name)
        if backups:print('N7_MODERN_ROLLBACK_ATTEMPTED=true')
        raise
    finally:
        for stage in stages:
            try:ftp.delete(stage)
            except ftplib.all_errors:pass
        try:ftp.quit()
        except ftplib.all_errors:pass

if __name__=='__main__':main()
