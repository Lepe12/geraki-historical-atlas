#!/usr/bin/env python3
import hashlib, json, os, pathlib, sys
sys.path.insert(0,str(pathlib.Path(__file__).parent))
from request_context import load_request

def canonical_request():
    rf,req,ctx=load_request()
    payload={"target":ctx["target"],"aliases":ctx["aliases"],"date_range":ctx["date_range"],"purpose":ctx["purpose"]}
    if req.get("target_context"):
        payload["target_context"]=req["target_context"]
    canonical=json.dumps(payload,ensure_ascii=False,sort_keys=True,separators=(",",":"))
    digest=hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    run_id=os.getenv("GITHUB_RUN_ID","local")
    job_id=os.getenv("PCT_RESEARCH_JOB_ID","").strip() or f"agent-piracy-{run_id}-{digest[:12]}"
    expected=os.getenv("PCT_EXPECTED_REQUEST_SHA256","").strip()
    if expected and expected != digest:
        raise SystemExit("REQUEST_IDENTITY_MISMATCH")
    return rf,req,ctx,payload,digest,job_id

def write_identity(path="research_request_identity.json"):
    rf,req,ctx,payload,digest,job_id=canonical_request()
    out={"schema":"agent-piracy-request-identity-v1","research_job_id":job_id,"request_file":rf.name,"request_sha256":digest,"normalized_request":payload}
    pathlib.Path(path).write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("REQUEST IDENTITY",job_id,rf.name,digest)
    return out

if __name__=="__main__":
    write_identity()
