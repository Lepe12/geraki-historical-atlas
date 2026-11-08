#!/usr/bin/env python3
"""Install N7 mission controls into the EXISTING private bot, preserving live code.

Only the new public-safe mission integration is shipped. Uses existing FTPS
credentials and HMAC key already stored on the host. No secret is read back.
"""
import ftplib,hashlib,io,json,os,pathlib,re,socket,ssl,subprocess,tempfile,time,uuid
import urllib.request,urllib.error

BASE=pathlib.Path(__file__).resolve().parent
BOT="/bot.piratecartography.com/n7-app"
UI=(BASE/"n7-mission-owner-ui.js").read_bytes()
FILES=("server.js","public/index.html","public/n7-mission-owner-ui.js")

SERVER_HELPER=r'''
async function n7OwnerMission(route,payload){
  if(!["dispatch-signed","status-signed"].includes(route))throw Error("INVALID_MISSION_ROUTE");
  let secret;
  try{secret=fs.readFileSync(path.join(__dirname,'.n7-library-bridge-key'));}catch(_){throw Error("MISSION_BRIDGE_NOT_CONFIGURED");}
  if(secret.length!==32)throw Error("MISSION_BRIDGE_NOT_CONFIGURED");
  const raw=JSON.stringify(payload),ts=String(Math.floor(Date.now()/1000));
  if(Buffer.byteLength(raw)>4096)throw Error("INVALID_MISSION_PAYLOAD");
  const mac=crypto.createHmac("sha256",secret).update(ts+"."+raw).digest("hex");
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetch("https://pct-live.piratecartography.com/pct-api/live/n7/mission/"+route,{
      method:"POST",redirect:"error",signal:controller.signal,body:raw,
      headers:{"Content-Type":"application/json","X-N7-Library-Ts":ts,"X-N7-Library-Signature":mac}});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(response.status===429?"MISSION_RATE_LIMITED":"MISSION_UPSTREAM_FAILED");
    return result;
  }catch(e){
    if(e.message==="MISSION_RATE_LIMITED")throw e;
    throw Error("MISSION_UPSTREAM_FAILED");
  }finally{clearTimeout(timeout);}
}
'''.strip()

ROUTES=r'''
    if(p==='/api/research/missions'){
      if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
      let b;
      try{b=await body(req);}catch(_){return json(res,400,{error:'Invalid request body'});}
      const safe=x=>typeof x==='string'&&![...x].some(c=>c.codePointAt(0)<32);
      const target=b?.target,purpose=b?.purpose,dates=b?.date_range??'',aliases=b?.aliases??'';
      if(!safe(target)||target.trim().length<3||target.length>250||
        !safe(purpose)||purpose.trim().length<12||purpose.length>1000||
        !safe(dates)||dates.length>80||!safe(aliases)||aliases.length>220)
        return json(res,400,{error:'Invalid mission request'});
      try{
        const r=await n7OwnerMission("dispatch-signed",
          {target:target.trim(),purpose:purpose.trim(),date_range:dates.trim(),aliases:aliases.trim()});
        if(r.schema!=='n7-mission-dispatch-v1'||r.status!=='ACCEPTED'||
          !/^n7mission-[a-f0-9]{24}$/.test(r.request_id)||r.historically_verified!==false)
          throw Error("INVALID_MISSION_RESPONSE");
        return json(res,202,{request_id:r.request_id,status:"ACCEPTED",historically_verified:false,publication_allowed:false});
      }catch(e){return json(res,e.message==="MISSION_RATE_LIMITED"?429:503,{error:e.message});}
    }
    if(p.startsWith('/api/research/missions/')){
      if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});
      const id=p.slice('/api/research/missions/'.length);
      if(!/^n7mission-[a-f0-9]{24}$/.test(id))return json(res,400,{error:'Invalid mission id'});
      try{
        const r=await n7OwnerMission("status-signed",{request_id:id});
        if(r.schema!=='n7-mission-status-v1'||r.request_id!==id||
           typeof r.status!=='string'||r.historically_verified!==false)
          throw Error("INVALID_MISSION_RESPONSE");
        return json(res,200,{...r,historically_verified:false,publication_allowed:false});
      }catch(e){return json(res,503,{error:e.message});}
    }
'''.strip("\n")

def replace_once(data:bytes,anchor:bytes,new:bytes)->bytes:
    if data.count(anchor)!=1:raise RuntimeError("LIVE_N7_ANCHOR_NOT_UNIQUE")
    return data.replace(anchor,new)

def patch_server(src:bytes)->bytes:
    if not all(x in src for x in (b"if(!session(req))",b"const historicalResearch",b"/api/library/search")):
        raise RuntimeError("N7_EXPECTED_AUTH_AND_RESEARCH_MISSING")
    if b"async function n7OwnerMission(" in src:
        if b"/api/research/missions/" in src and b"n7-mission-owner-ui.js" in src:
            return src
        raise RuntimeError("N7_MISSION_PATCH_PARTIAL")
    helper=SERVER_HELPER.encode()+b"\n"
    server_anchor=list(re.finditer(rb"(?m)^const\s+server\s*=\s*http\.createServer\(",src))
    if len(server_anchor)!=1:raise RuntimeError("N7_SERVER_DECLARATION_CHANGED")
    at=server_anchor[0].start()
    src=src[:at]+helper+src[at:]
    # Must insert AFTER authentication and SAME-ORIGIN checks.
    guard=re.search(rb"(?m)^([ \t]*if\(!session\(req\)\)\s*return json\(res,401,[^\r\n]+[\r]?\n)",src)
    if not guard:raise RuntimeError("N7_SESSION_GUARD_CHANGED")
    src=src[:guard.end()]+ROUTES.encode()+b"\n"+src[guard.end():]
    token=re.search(rb"'/app\.js'\s*:\s*'app\.js'\s*,",src)
    if not token:raise RuntimeError("N7_STATIC_ASSET_MAP_CHANGED")
    src=src[:token.end()]+b"'/n7-mission-owner-ui.js':'n7-mission-owner-ui.js',"+src[token.end():]
    # Existing serve() is a fixed static whitelist: explicitly allow this one new path.
    if b"p==='/n7-mission-owner-ui.js'" not in src:
        # Static script (not an API) must be served before cookie-auth check.
        # API request validation remains guarded by the original origin/session rules.
        static_guard=re.search(rb"(?m)^([ \t]*if\(!session\(req\)\)\s*return json\(res,401,[^\r\n]+[\r]?\n)",src)
        if not static_guard:raise RuntimeError("N7_STATIC_AUTH_BOUNDARY_CHANGED")
        addition=b"    if(req.method==='GET'&&p==='/n7-mission-owner-ui.js')return serve(res,p);\n"
        src=src[:static_guard.start()]+addition+src[static_guard.start():]
    return src

def patch_index(src:bytes)->bytes:
    if b'<script src="/n7-mission-owner-ui.js"' in src:return src
    if b"</body>" not in src or b'id="messages"' not in src:raise RuntimeError("N7_HTML_SHELL_CHANGED")
    return replace_once(src,b"</body>",b'<script src="/n7-mission-owner-ui.js" defer></script></body>')

def sha(data):return hashlib.sha256(data).hexdigest()

def validate(payload):
    with tempfile.TemporaryDirectory(prefix="n7-owner-mission-") as d:
        for filename,bytes_ in (("server.js",payload["server.js"]),("ui.js",UI)):
            f=pathlib.Path(d)/filename
            f.write_bytes(bytes_)
            subprocess.run(["node","--check",str(f)],check=True,timeout=15,capture_output=True)
    if b"n7OwnerMission" not in payload["server.js"] or b"n7-mission-owner-ui.js" not in payload["public/index.html"]:
        raise RuntimeError("N7_MISSION_NOT_PATCHED")

def smoke():
    try:
        with urllib.request.urlopen("https://bot.piratecartography.com/n7-mission-owner-ui.js",timeout=9) as r:
            if r.status!=200 or b"n7-last-mission" not in r.read(100000):return False
        with urllib.request.urlopen("https://bot.piratecartography.com/health",timeout=9) as r:
            if r.status!=200 or json.load(r).get("status")!="ok":return False
        try:
            with urllib.request.urlopen("https://bot.piratecartography.com/api/research/missions",timeout=9):
                return False
        except urllib.error.HTTPError as e:
            return e.code==401
    except (urllib.error.URLError,ValueError,TimeoutError):
        return False

def deploy():
    if os.environ.get("N7_DEPLOY_CONFIRM")!="INSTALL-N7-OWNER-MISSIONS":
        raise RuntimeError("N7_DEPLOY_NOT_AUTHORIZED")
    host=os.environ["PCT_FTPS_HOST"]
    port=int(os.environ.get("PCT_FTPS_PORT","21"))
    tls=os.environ.get("PCT_FTPS_TLS_SERVER_NAME","").strip()
    if tls:
        hosts={i[4][0] for i in socket.getaddrinfo(host,port,type=socket.SOCK_STREAM)}
        names={i[4][0] for i in socket.getaddrinfo(tls,port,type=socket.SOCK_STREAM)}
        if not hosts.intersection(names):raise RuntimeError("N7_FTPS_TLS_HOST_MISMATCH")
    ftp=ftplib.FTP_TLS(timeout=35,context=ssl.create_default_context())
    changes=[];staged=[];nonce=uuid.uuid4().hex[:10]
    try:
        ftp.connect(host,port)
        if tls:ftp.host=tls
        ftp.login(os.environ["PCT_FTPS_USER"],os.environ["PCT_FTPS_PASSWORD"])
        ftp.prot_p()
        ftp.cwd(BOT)
        def get(name):
            bufs=[];total=0
            def take(c):
                nonlocal total
                total+=len(c)
                if total>600000:raise RuntimeError("N7_LIVE_FILE_TOO_LARGE")
                bufs.append(c)
            ftp.retrbinary("RETR "+name,take)
            return b"".join(bufs)
        def maybe(name):
            try:return get(name)
            except ftplib.error_perm as e:
                if str(e).startswith("550"):return None
                raise
        def store(name,data):ftp.storbinary("STOR "+name,io.BytesIO(data))
        if b"independent-ai-bot" not in get("package.json"):raise RuntimeError("WRONG_N7_APP")
        old={name:maybe(name) for name in FILES}
        if old["server.js"] is None or old["public/index.html"] is None:
            raise RuntimeError("N7_APP_FILES_MISSING")
        new={"server.js":patch_server(old["server.js"]),
             "public/index.html":patch_index(old["public/index.html"]),
             "public/n7-mission-owner-ui.js":UI}
        validate(new)
        for name,data in new.items():
            if old[name]==data:continue
            parent,leaf=name.rsplit("/",1) if "/" in name else ("",name)
            stage=(parent+"/" if parent else "")+".n7-owner-stage-"+nonce+"-"+leaf
            store(stage,data);staged.append(stage)
            if sha(get(stage))!=sha(data):raise RuntimeError("N7_STAGED_HASH_FAILED")
        for name,data in new.items():
            if old[name]==data:continue
            parent,leaf=name.rsplit("/",1) if "/" in name else ("",name)
            stage=(parent+"/" if parent else "")+".n7-owner-stage-"+nonce+"-"+leaf
            backup=(parent+"/" if parent else "")+".n7-owner-backup-"+nonce+"-"+leaf if old[name] is not None else None
            if backup:ftp.rename(name,backup)
            try:ftp.rename(stage,name)
            except Exception:
                if backup:ftp.rename(backup,name)
                raise
            staged.remove(stage);changes.append((name,backup))
        for name,data in new.items():
            if sha(get(name))!=sha(data):raise RuntimeError("N7_FINAL_READBACK_MISMATCH")
        store("tmp/restart.txt",b"")
        for _ in range(12):
            if smoke():break
            time.sleep(5)
        else:raise RuntimeError("N7_HTTP_SMOKE_NOT_PASSING")
        print(json.dumps({"status":"N7_OWNER_MISSION_DEPLOYED","files":[p for p,_ in changes],
                          "sha256":{k:sha(v) for k,v in new.items()},
                          "http_static":200,"http_health":200,"http_unauthenticated_api":401,
                          "database_mutation":False,"atlas_renderer_changed":False}))
    except Exception:
        for name,backup in reversed(changes):
            try:
                ftp.delete(name)
                if backup:ftp.rename(backup,name)
            except ftplib.all_errors:print("N7_ROLLBACK_MANUAL_REVIEW_REQUIRED",name)
        if changes:
            try:ftp.storbinary("STOR tmp/restart.txt",io.BytesIO(b""))
            except ftplib.all_errors:pass
        raise
    finally:
        for p in staged:
            try:ftp.delete(p)
            except ftplib.all_errors:pass
        try:ftp.quit()
        except ftplib.all_errors:pass

if __name__=="__main__":deploy()
