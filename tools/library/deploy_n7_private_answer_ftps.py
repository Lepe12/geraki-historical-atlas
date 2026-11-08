#!/usr/bin/env python3
"""Add only the owner-authenticated private research answer route to live N7.

Uses existing bot FTPS credentials and Passenger restart. No rehosting of raw
sources, no public URL for private evidence, no replacement of the chat.
Staged files, SHA readback, rollback and HTTP 401 smoke are mandatory.
"""
from __future__ import annotations
import hashlib,io,json,pathlib,re,subprocess,sys,tempfile,time,urllib.error,urllib.request,uuid

ROOT=pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/"tools"))
from n7_private_corpus_store import BOT,connect,remote_read,write

FILES=("server.js","n7_private_aead.js","n7-private-answer-reader.js")
HELPER=b'const {readOwnerAnswer}=require("./n7-private-answer-reader");\n'
ROUTE=b'''    if(req.method==='GET'&&/^\\/api\\/research\\/corpus\\/[0-9]{8,20}$/.test(p)){
      try{
        const researchRunId=p.split('/').pop();
        return json(res,200,readOwnerAnswer(DATA_DIR,researchRunId));
      }catch(_){
        return json(res,404,{error:'PRIVATE_ANSWER_NOT_READY'});
      }
    }
'''


def patched(source:bytes)->bytes:
    if b"if(!session(req))" not in source or b"n7OwnerMission(" not in source:
        raise RuntimeError("N7_LIVE_AUTH_OR_MISSION_MISSING")
    if b"readOwnerAnswer(DATA_DIR," in source:
        if source.count(b"readOwnerAnswer(DATA_DIR,")!=1 or HELPER not in source:
            raise RuntimeError("N7_PRIVATE_ANSWER_PARTIAL_OR_INCONSISTENT")
        return source
    if source.count(b"'use strict';\n")!=1:
        raise RuntimeError("N7_LIVE_MODULE_ANCHOR_CHANGED")
    source=source.replace(b"'use strict';\n",b"'use strict';\n"+HELPER,1)
    # Find the actual active cookie-session rejection, independent of server
    # formatting or additional operator-side statements on the same line.
    guard=b"if(!session(req))"
    if source.count(guard)!=1:
        print("N7_SESSION_GUARD_SHAPE",{
            "compact":source.count(guard),
            "spaced":source.count(b"if (!session(req))"),
            "auth_message":source.count(b"Authentication required"),
            "mission_route":source.count(b"/api/research/missions"),
            "user_session_refs":source.count(b"session(req)"),
        })
        raise RuntimeError("N7_LIVE_SESSION_GUARD_MISSING_OR_DUPLICATE")
    at=source.index(guard)
    end=source.find(b"\n",at)
    if end<0:raise RuntimeError("N7_SESSION_GUARD_TRUNCATED")
    line=source[at:end]
    if b"json(" not in line or b"401" not in line or len(line)>350:
        raise RuntimeError("N7_LIVE_SESSION_BOUNDARY_CHANGED")
    pos=end+1
    source=source[:pos]+ROUTE+source[pos:]
    return source


def hash_bytes(data):return hashlib.sha256(data).hexdigest()


def validate(files):
    with tempfile.TemporaryDirectory(prefix="n7-private-answer-deploy-") as d:
        root=pathlib.Path(d)
        for name,body in files.items():
            f=root/name
            f.write_bytes(body)
            subprocess.run(["node","--check",str(f)],check=True,capture_output=True,timeout=15)
    server=files["server.js"]
    assert b"readOwnerAnswer(DATA_DIR" in server and b"PRIVATE_ANSWER_NOT_READY" in server
    assert server.index(b"if(!session(req))")<server.index(b"readOwnerAnswer(DATA_DIR")
    assert b"PRIVATE_ANSWER_NOT_READY" in server
    assert patched(server)==server


def smoke():
    for url,expected in (
        ("https://bot.piratecartography.com/health",200),
        ("https://bot.piratecartography.com/api/research/corpus/42434462262",401),
    ):
        try:
            with urllib.request.urlopen(url,timeout=10) as result:
                if result.status!=expected:return False
                if expected==200 and json.loads(result.read()).get("status")!="ok":return False
        except urllib.error.HTTPError as e:
            if e.code!=expected:return False
        except (urllib.error.URLError,ValueError,TimeoutError):
            return False
    return True


def main():
    import os
    if os.getenv("N7_DEPLOY_CONFIRM")!="N7-PRIVATE-ANSWER-OWNER-AUTH":
        raise RuntimeError("UNAUTHORIZED_DEPLOY")
    changed=[]
    staged=[]
    with connect() as ftp:
        ftp.cwd(BOT)
        original={}
        try:
            def read(name):return remote_read(ftp,name,650000)
            for name in FILES:
                try:original[name]=read(name)
                except Exception as e:
                    if name=="server.js" or not str(e).startswith("550"):
                        raise
                    original[name]=None
            expected={
                "server.js":patched(original["server.js"]),
                "n7_private_aead.js":(ROOT/"tools/n7_private_aead.js").read_bytes(),
                "n7-private-answer-reader.js":(ROOT/"tools/library/n7-private-answer-reader.js").read_bytes()
            }
            validate(expected)
            nonce=uuid.uuid4().hex[:12]
            for name,data in expected.items():
                if original[name]==data:continue
                stage=".n7-private-answer-stage-"+nonce+"-"+name
                write(ftp,stage,data)
                staged.append(stage)
                if hash_bytes(read(stage))!=hash_bytes(data):
                    raise RuntimeError("N7_PRIVATE_MODULE_STAGING_SHA_MISMATCH")
            for name,data in expected.items():
                if original[name]==data:continue
                stage=".n7-private-answer-stage-"+nonce+"-"+name
                backup=".n7-private-answer-before-"+nonce+"-"+name if original[name] is not None else None
                if backup:ftp.rename(name,backup)
                try:ftp.rename(stage,name)
                except Exception:
                    if backup:ftp.rename(backup,name)
                    raise
                staged.remove(stage)
                changed.append((name,backup))
            for name,data in expected.items():
                if hash_bytes(read(name))!=hash_bytes(data):
                    raise RuntimeError("N7_PRIVATE_MODULE_READBACK_SHA_MISMATCH")
            write(ftp,"tmp/restart.txt",b"")
            for _ in range(15):
                if smoke():break
                time.sleep(5)
            else:raise RuntimeError("N7_PRIVATE_OWNER_ROUTE_SMOKE_FAILED")
            print(json.dumps({"status":"N7_PRIVATE_ANSWER_OWNER_ROUTE_DEPLOYED",
                "changed_files":[x[0] for x in changed],
                "sha256":{name:hash_bytes(data) for name,data in expected.items()},
                "owner_login_required_http":401,"health_http":200,"atlas_modified":False}))
        except Exception:
            for name,backup in reversed(changed):
                try:
                    ftp.delete(name)
                    if backup:ftp.rename(backup,name)
                except Exception:print("N7_PRIVATE_ANSWER_ROLLBACK_MANUAL_REVIEW_REQUIRED",name)
            if changed:
                try:write(ftp,"tmp/restart.txt",b"")
                except Exception:pass
            raise
        finally:
            for stage in staged:
                try:ftp.delete(stage)
                except Exception:pass


if __name__=="__main__":
    main()
