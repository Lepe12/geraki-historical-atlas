#!/usr/bin/env python3
"""Create an immutable-style execution manifest for reproducibility."""
import json,os,pathlib,subprocess,datetime,hashlib,platform
from llm.llm_router import routing_summary
from request_identity import canonical_request
rf,req,ctx,payload,digest,job_id=canonical_request()
def cmd(args):
    try:return subprocess.check_output(args,text=True,stderr=subprocess.DEVNULL).strip()
    except Exception:return None
commit=cmd(["git","rev-parse","HEAD"])
manifest={
 "schema":"agent-piracy-run-manifest-v1",
 "created_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),
 "research_job_id":job_id,
 "request_file":rf.name,
 "request_sha256":digest,
 "git_commit":commit,
 "github_run_id":os.getenv("GITHUB_RUN_ID"),
 "github_run_attempt":os.getenv("GITHUB_RUN_ATTEMPT"),
 "workflow":os.getenv("GITHUB_WORKFLOW"),
 "event_name":os.getenv("GITHUB_EVENT_NAME"),
 "ref":os.getenv("GITHUB_REF"),
 "normalized_request":payload,
 "runtime":{"python":platform.python_version(),"platform":platform.system(),
            "pdftotext":cmd(["pdftotext","-v"])},
 "model_configuration":routing_summary(),
 "software_checksums":{str(p.relative_to(pathlib.Path(__file__).parent)):hashlib.sha256(p.read_bytes()).hexdigest()
                       for p in pathlib.Path(__file__).parent.rglob('*.py')},
 "note":"GitHub Actions retains platform logs separately; durable research evidence and file SHA-256 values are preserved under evidence/runs."
}
p=pathlib.Path("run_manifest");p.mkdir(exist_ok=True)
(p/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print("RUN MANIFEST",job_id,digest,commit)
