#!/usr/bin/env python3
"""Safely deploy only N7 mission route additions to the existing Plesk gateway.

The server may have operator-specific live changes not in Git: apply additive,
anchor-checked patches rather than replacing the whole gateway. Backup/rollback,
SHA-256 readback and authenticated-route smoke are mandatory.
"""
from __future__ import annotations
import ftplib,hashlib,io,json,os,pathlib,ssl,subprocess,socket,tempfile,time,uuid
import urllib.request,urllib.error

ROOT=pathlib.Path(__file__).resolve().parents[2]
APP="/piratecartography-gateway/server/command-center-live"
FILES=["app.js","n7-gateway.js"]

def add_exact(src:bytes,before:bytes,addition:bytes)->bytes:
    if src.count(before)!=1:raise RuntimeError("GATEWAY_LIVE_ANCHOR_CHANGED")
    return src.replace(before,addition+before)

def replace_exact(src:bytes,old:bytes,new:bytes)->bytes:
    if src.count(old)!=1:raise RuntimeError("GATEWAY_LIVE_ANCHOR_CHANGED")
    return src.replace(old,new)

def patch_gateway(live:bytes,canonical:bytes)->bytes:
    if b"module.exports={createN7Gateway};" not in live or b"verifyLibraryBridge" not in live:
        raise RuntimeError("GATEWAY_WRONG_APPLICATION")
    marker=b'    if(p==="/n7/mission/dispatch-signed"||p==="/n7/mission/status-signed")'
    if marker in live:
        if live.count(marker)!=1:raise RuntimeError("GATEWAY_DUPLICATE_MISSION_ROUTES")
        return live
    old=b"githubWorkflowDispatch,githubCodingDispatch,githubPrivateDispatch,libraryRunner=readPrivateLibrary"
    new=b"githubWorkflowDispatch,githubCodingDispatch,githubPrivateDispatch,githubResearchDispatch,githubResearchStatus,missionBridgeVerifier=verifyLibraryBridge,libraryRunner=readPrivateLibrary"
    live=replace_exact(live,old,new)
    start=b"    // Private N7 operator-to-research bridge."
    stop=b'    if (p!=="/n7/status"'
    fragment=canonical.split(start,1)[1].split(stop,1)[0]
    if not fragment or marker not in fragment:raise RuntimeError("CANONICAL_MISSION_ROUTE_MISSING")
    return add_exact(live,stop,start+fragment)

def patch_app(live:bytes,canonical:bytes)->bytes:
    if b"function githubDispatchWorkflow(" not in live or b"createN7Gateway({" not in live:
        raise RuntimeError("GATEWAY_WRONG_APPLICATION")
    if b"function githubResearchDispatch(" in live:
        if b"function githubResearchStatus(" not in live or b"N7_RESEARCH_WORKFLOW" not in live:
            raise RuntimeError("GATEWAY_MISSION_PATCH_INCOMPLETE")
        return live
    const=b'const CONTROLLED_WORKFLOW="jarvis-controlled-dispatch.yml";'
    newconst=b'\nconst N7_RESEARCH_WORKFLOW="n7-research-orchestrate.yml";'
    if newconst.strip() not in canonical:raise RuntimeError("CANONICAL_WORKFLOW_CONSTANT_MISSING")
    live=replace_exact(live,const,const+newconst)
    old=b'![CONTROLLED_WORKFLOW,"nabou-coder-v03.yml"].includes(workflow)'
    new=b'![CONTROLLED_WORKFLOW,"nabou-coder-v03.yml",N7_RESEARCH_WORKFLOW].includes(workflow)'
    live=replace_exact(live,old,new)
    start=b"function githubResearchDispatch("
    stop=b"async function refreshBaseline("
    fragment=canonical.split(start,1)[1].split(stop,1)[0]
    if b"function githubResearchStatus(" not in fragment:raise RuntimeError("CANONICAL_MISSION_STATUS_MISSING")
    live=add_exact(live,stop,b"\n"+start+fragment)
    old=b"githubWorkflowDispatch,githubCodingDispatch,githubPrivateDispatch});"
    new=b"githubWorkflowDispatch,githubCodingDispatch,githubPrivateDispatch,githubResearchDispatch,githubResearchStatus});"
    return replace_exact(live,old,new)

def patched(local:dict[str,bytes], live:dict[str,bytes])->dict[str,bytes]:
    return {"app.js":patch_app(live["app.js"],local["app.js"]),
            "n7-gateway.js":patch_gateway(live["n7-gateway.js"],local["n7-gateway.js"])}

def sha(b:bytes)->str:return hashlib.sha256(b).hexdigest()

def validate(source:dict[str,bytes])->None:
    with tempfile.TemporaryDirectory() as d:
        for name,data in source.items():
            p=pathlib.Path(d)/name;p.write_bytes(data)
            subprocess.run(["node","--check",str(p)],check=True,timeout=15,capture_output=True)
    assert b"/n7/mission/status-signed" in source["n7-gateway.js"]
    assert b"function githubResearchStatus(" in source["app.js"]

def smoke()->bool:
    base="https://pct-live.piratecartography.com/pct-api/live"
    try:
        with urllib.request.urlopen(base+"/health",timeout=9) as result:
            if result.status!=200 or json.loads(result.read()).get("status")!="PASS":return False
        body=b'{"target":"Naxos","purpose":"Research historical piracy"}'
        req=urllib.request.Request(base+"/n7/mission/dispatch-signed",data=body,
                    method="POST",headers={"Content-Type":"application/json"})
        try:
            with urllib.request.urlopen(req,timeout=9) as result:return False
        except urllib.error.HTTPError as error:
            return error.code==401 and json.loads(error.read()).get("error")=="signed_bridge_required"
    except (ValueError,urllib.error.URLError,TimeoutError):
        return False

def deploy()->None:
    if os.getenv("N7_DEPLOY_CONFIRM")!="N7-SIGNED-MISSION-GATEWAY":
        raise RuntimeError("DEPLOY_AUTHORIZATION_MISSING")
    root=os.environ["PCT_FTPS_HOST"]
    port=int(os.getenv("PCT_FTPS_PORT","21"))
    tls=os.getenv("PCT_FTPS_TLS_SERVER_NAME","").strip()
    if tls:
        left={x[4][0] for x in socket.getaddrinfo(root,port,type=socket.SOCK_STREAM)}
        right={x[4][0] for x in socket.getaddrinfo(tls,port,type=socket.SOCK_STREAM)}
        if not (left&right):raise RuntimeError("FTPS_TLS_NAME_MISMATCH")
    ftp=ftplib.FTP_TLS(timeout=35,context=ssl.create_default_context())
    nonce=uuid.uuid4().hex[:10];staged=[];changed=[];original={}
    try:
        ftp.connect(root,port)
        if tls:ftp.host=tls
        ftp.login(os.environ["PCT_FTPS_USER"],os.environ["PCT_FTPS_PASSWORD"])
        ftp.prot_p();ftp.cwd(APP)
        def read(path):
            data=[];n=0
            def take(b):
                nonlocal n
                n+=len(b)
                if n>2_000_000:raise RuntimeError("UNEXPECTED_GATEWAY_SIZE")
                data.append(b)
            ftp.retrbinary("RETR "+path,take)
            return b"".join(data)
        def store(path,data):
            ftp.storbinary("STOR "+path,io.BytesIO(data))
        canonical={name:(ROOT/"server/command-center-live"/name).read_bytes() for name in FILES}
        original={name:read(name) for name in FILES}
        result=patched(canonical,original)
        validate(result)
        for name,data in result.items():
            if data==original[name]:continue
            stage=".n7-mission-staged-"+nonce+"-"+name
            store(stage,data);staged.append(stage)
            if sha(read(stage))!=sha(data):raise RuntimeError("STAGED_HASH_MISMATCH")
        for name in FILES:
            if result[name]==original[name]:continue
            stage=".n7-mission-staged-"+nonce+"-"+name
            backup=".n7-mission-before-"+nonce+"-"+name
            ftp.rename(name,backup)
            try:ftp.rename(stage,name)
            except Exception:
                ftp.rename(backup,name)
                raise
            staged.remove(stage)
            changed.append((name,backup))
        for name,data in result.items():
            if sha(read(name))!=sha(data):raise RuntimeError("LIVE_HASH_MISMATCH")
        store("tmp/restart.txt",b"")
        for _ in range(12):
            if smoke():break
            time.sleep(5)
        else:raise RuntimeError("LIVE_MISSION_AUTH_SMOKE_FAILED")
        print(json.dumps({"status":"N7_SIGNED_MISSION_GATEWAY_DEPLOYED",
                          "changed_files":[x[0] for x in changed],
                          "sha256":{k:sha(v) for k,v in result.items()},
                          "authenticated_endpoint_test":"UNSIGNED_REQUEST_BLOCKED_401",
                          "main_map_modified":False,"db_rows_modified":False}))
    except Exception:
        for name,backup in reversed(changed):
            try:
                ftp.delete(name);ftp.rename(backup,name)
            except ftplib.all_errors:print("ROLLBACK_MANUAL_INSPECTION_REQUIRED",name)
        if changed:
            try:ftp.storbinary("STOR tmp/restart.txt",io.BytesIO(b""))
            except ftplib.all_errors:print("ROLLBACK_RESTART_FAILED")
        raise
    finally:
        for stage in staged:
            try:ftp.delete(stage)
            except ftplib.all_errors:pass
        try:ftp.quit()
        except ftplib.all_errors:pass

if __name__=="__main__":
    deploy()
