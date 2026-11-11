#!/usr/bin/env python3
"""Isolated N7 APEX static preview deployer with verified upgrade/rollback."""
import ftplib, hashlib, io, json, os, pathlib, secrets, socket, ssl, urllib.request, urllib.error

PARENT="/bot.piratecartography.com/n7-app/public"
TARGET=os.getenv("N7_APEX_TARGET","n7-apex").strip("/") or "n7-apex"
BASE="https://bot.piratecartography.com"
TLS="linux3087.grserver.gr"
UPSTREAM="a8732fad1078a809cadfa810cb0d89cf4445dbed"

def sha(b): return hashlib.sha256(b).hexdigest()

def connect():
    host=os.environ["PCT_FTPS_HOST"]; port=int(os.getenv("PCT_FTPS_PORT","21"))
    ips=lambda h:{x[4][0] for x in socket.getaddrinfo(h,port,type=socket.SOCK_STREAM)}
    if not ips(host).intersection(ips(TLS)): raise RuntimeError("N7_APEX_UNEXPECTED_FTPS_HOST")
    ftp=ftplib.FTP_TLS(timeout=45,context=ssl.create_default_context())
    ftp.connect(host,port); ftp.host=TLS
    ftp.login(os.environ["PCT_FTPS_USER"],os.environ["PCT_FTPS_PASSWORD"]); ftp.prot_p()
    ftp.cwd(PARENT)
    if ftp.pwd().rstrip("/")!=PARENT: raise RuntimeError("N7_APEX_WRONG_PUBLIC_ROOT")
    return ftp

def exists_dir(ftp,name):
    cur=ftp.pwd()
    try: ftp.cwd(name); ftp.cwd(cur); return True
    except ftplib.error_perm: return False

def mkdirs(ftp, parts):
    for p in parts:
        try: ftp.mkd(p)
        except ftplib.error_perm as e:
            if not str(e).startswith("550"): raise
        ftp.cwd(p)

def upload_tree(ftp, root, stage, files):
    ftp.mkd(stage); ftp.cwd(stage)
    for rel,data in files:
        parts=pathlib.PurePosixPath(rel).parts
        ftp.cwd("/"+PARENT.strip("/")+"/"+stage)
        mkdirs(ftp,parts[:-1])
        ftp.storbinary("STOR "+parts[-1],io.BytesIO(data))
        ftp.sendcmd("SITE CHMOD 644 "+parts[-1])
        out=[]; ftp.retrbinary("RETR "+parts[-1],out.append)
        if sha(b"".join(out))!=sha(data): raise RuntimeError("N7_APEX_STAGE_HASH_MISMATCH:"+rel)
    ftp.cwd(PARENT)

def remove_tree(ftp, path):
    cur=ftp.pwd()
    try:
        ftp.cwd(path)
        items=list(ftp.mlsd())
        for name,facts in items:
            if name in (".",".."): continue
            if facts.get("type")=="dir": remove_tree(ftp,name)
            else: ftp.delete(name)
        ftp.cwd(".."); ftp.rmd(path)
    finally:
        try: ftp.cwd(cur)
        except ftplib.all_errors: pass

def fetch(path):
    req=urllib.request.Request(BASE+path,headers={"Cache-Control":"no-cache, no-store","User-Agent":"N7-apex-preview-verify/1"})
    return urllib.request.urlopen(req,context=ssl.create_default_context(),timeout=25)

def verify_live(release):
    with fetch("/"+TARGET+"/?v="+secrets.token_hex(8)) as r:
        body=r.read(500000)
        if r.status!=200 or b"N7" not in body: raise RuntimeError("N7_APEX_PUBLIC_PAGE_FAILED")
    with fetch("/api/status") as r:
        data=json.loads(r.read(30000))
        if r.status!=200: raise RuntimeError("N7_APEX_N7_STATUS_FAILED")
    for p in ("/api/conversations","/api/tasks"):
        try:
            with fetch(p): pass
        except urllib.error.HTTPError as e:
            if e.code==401: continue
            raise
        raise RuntimeError("N7_APEX_PRIVATE_ENDPOINT_EXPOSED")
    print("N7_APEX_LIVE_VERIFIED=true release="+release+" same_origin_api=true")

def main():
    dry=os.getenv("N7_DRY_RUN","1")!="0"
    root=pathlib.Path(os.environ["N7_APEX_OUT"]).resolve()
    if not (root/"index.html").is_file(): raise RuntimeError("N7_APEX_BUILD_MISSING_INDEX")
    payload=[]
    for p in sorted(x for x in root.rglob("*") if x.is_file()):
        rel=p.relative_to(root).as_posix()
        payload.append((rel,p.read_bytes()))
    if not any(rel.startswith("_next/") for rel,_ in payload): raise RuntimeError("N7_APEX_BUILD_MISSING_NEXT_ASSETS")
    digest=hashlib.sha256()
    for rel,data in payload:
        digest.update(rel.encode()+b"\0"+hashlib.sha256(data).digest())
    release=digest.hexdigest()[:16]
    marker=json.dumps({"product":"N7-APEX-PREVIEW","release":release,"upstream":UPSTREAM},sort_keys=True).encode()+b"\n"
    payload.append((".n7-apex-release.json",marker))

    ftp=connect(); tag=secrets.token_hex(6); stage=".n7-apex-stage-"+tag; backup=".n7-apex-backup-"+tag
    installed=False
    try:
        ftp.cwd(PARENT)
        existing=exists_dir(ftp,TARGET)
        current=None
        if existing:
            ftp.cwd(TARGET)
            try:
                out=[]; ftp.retrbinary("RETR .n7-apex-release.json",out.append)
                current=json.loads(b"".join(out))
            except Exception: raise RuntimeError("N7_APEX_EXISTING_TARGET_UNRECOGNIZED")
            finally: ftp.cwd(PARENT)
            if current.get("product")!="N7-APEX-PREVIEW" or current.get("upstream")!=UPSTREAM:
                raise RuntimeError("N7_APEX_EXISTING_TARGET_UNRECOGNIZED")
            if current.get("release")==release:
                print("N7_APEX_PREFLIGHT_OK existing_same_release=true release="+release)
                if not dry: verify_live(release)
                return
        print("N7_APEX_PREFLIGHT_OK upgrade="+str(existing).lower()+" files="+str(len(payload))+" release="+release+" dry_run="+str(dry))
        if dry: return
        upload_tree(ftp,root,stage,payload)
        if existing:
            ftp.rename(TARGET,backup)
        try:
            ftp.rename(stage,TARGET); stage=None; installed=True
            verify_live(release)
        except BaseException:
            if installed and exists_dir(ftp,TARGET):
                remove_tree(ftp,TARGET)
            if existing and exists_dir(ftp,backup):
                ftp.rename(backup,TARGET)
                print("N7_APEX_ROLLBACK_RESTORED=true")
            raise
        if existing and exists_dir(ftp,backup):
            if TARGET=="n7-apex-step5":
                print("N7_APEX_ROLLBACK_POINT="+PARENT+"/"+backup)
            else:
                remove_tree(ftp,backup)
        print("N7_APEX_DEPLOY_SUCCESS=true target=/"+TARGET+"/ backendUntouched=true upgraded="+str(existing).lower())
    except BaseException:
        if stage and exists_dir(ftp,stage):
            try: ftp.cwd(PARENT); remove_tree(ftp,stage)
            except BaseException: print("N7_APEX_STAGE_CLEANUP_INCOMPLETE=true")
        raise
    finally:
        try: ftp.quit()
        except ftplib.all_errors: pass

if __name__=="__main__": main()
