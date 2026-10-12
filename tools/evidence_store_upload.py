#!/usr/bin/env python3
"""Persist acquired research evidence to durable S3-compatible object storage.

Required secrets:
  PCT_EVIDENCE_ENDPOINT
  PCT_EVIDENCE_BUCKET
  PCT_EVIDENCE_ACCESS_KEY
  PCT_EVIDENCE_SECRET_KEY
Optional:
  PCT_EVIDENCE_REGION (default auto)
  PCT_EVIDENCE_PREFIX (default evidence)

This uploader never changes historical verification state.
"""
import argparse,hashlib,json,mimetypes,os,pathlib,sys,urllib.request,urllib.parse,hmac,datetime

def sha256_bytes(b): return hashlib.sha256(b).hexdigest()
def sign(key,msg): return hmac.new(key,msg.encode(),hashlib.sha256).digest()
def sigkey(secret,date,region,service="s3"):
 k=sign(("AWS4"+secret).encode(),date);k=hmac.new(k,region.encode(),hashlib.sha256).digest()
 k=hmac.new(k,service.encode(),hashlib.sha256).digest();return hmac.new(k,b"aws4_request",hashlib.sha256).digest()
def put(endpoint,bucket,key,data,ctype,access,secret,region):
 now=datetime.datetime.now(datetime.timezone.utc); amz=now.strftime("%Y%m%dT%H%M%SZ"); day=now.strftime("%Y%m%d")
 endpoint=endpoint.rstrip("/"); u=urllib.parse.urlsplit(endpoint)
 path="/"+urllib.parse.quote(bucket,safe="")+"/"+urllib.parse.quote(key,safe="/~")
 host=u.netloc; payload=sha256_bytes(data)
 headers={"host":host,"x-amz-content-sha256":payload,"x-amz-date":amz,"content-type":ctype}
 signed=";".join(sorted(headers)); canon="".join(f"{k}:{headers[k]}\n" for k in sorted(headers))
 reqcanon="PUT\n"+path+"\n\n"+canon+"\n"+signed+"\n"+payload
 scope=f"{day}/{region}/s3/aws4_request"; sts="AWS4-HMAC-SHA256\n"+amz+"\n"+scope+"\n"+hashlib.sha256(reqcanon.encode()).hexdigest()
 signature=hmac.new(sigkey(secret,day,region),sts.encode(),hashlib.sha256).hexdigest()
 auth=f"AWS4-HMAC-SHA256 Credential={access}/{scope}, SignedHeaders={signed}, Signature={signature}"
 req=urllib.request.Request(f"{u.scheme}://{host}{path}",data=data,method="PUT",headers={"Host":host,"x-amz-content-sha256":payload,"x-amz-date":amz,"Content-Type":ctype,"Authorization":auth})
 with urllib.request.urlopen(req,timeout=60) as r: return r.status
p=argparse.ArgumentParser();p.add_argument("--job-id",required=True);p.add_argument("--source-id",required=True);p.add_argument("--path",action="append",required=True);p.add_argument("--repository",default="");p.add_argument("--lane",default="");p.add_argument("--index-out",default="evidence_index.json")
a=p.parse_args()
cfg={k:os.environ.get(k,"") for k in ["PCT_EVIDENCE_ENDPOINT","PCT_EVIDENCE_BUCKET","PCT_EVIDENCE_ACCESS_KEY","PCT_EVIDENCE_SECRET_KEY"]}
missing=[k for k,v in cfg.items() if not v]
if missing: sys.exit("Evidence Store not configured; missing secrets: "+", ".join(missing))
region=os.environ.get("PCT_EVIDENCE_REGION","auto");prefix=os.environ.get("PCT_EVIDENCE_PREFIX","evidence").strip("/")
rows=[]
for raw in a.path:
 path=pathlib.Path(raw)
 files=[path] if path.is_file() else [x for x in path.rglob("*") if x.is_file()]
 for f in files:
  data=f.read_bytes();digest=sha256_bytes(data);rel=f.name if path.is_file() else str(f.relative_to(path))
  key=f"{prefix}/{a.job_id}/{a.source_id}/{rel}"
  ctype=mimetypes.guess_type(f.name)[0] or "application/octet-stream"
  status=put(cfg["PCT_EVIDENCE_ENDPOINT"],cfg["PCT_EVIDENCE_BUCKET"],key,data,ctype,cfg["PCT_EVIDENCE_ACCESS_KEY"],cfg["PCT_EVIDENCE_SECRET_KEY"],region)
  rows.append({"research_job_id":a.job_id,"source_id":a.source_id,"repository":a.repository,"lane":a.lane,"object_key":key,"filename":str(f),"bytes":len(data),"sha256":digest,"content_type":ctype,"http_status":status,"original_inspected":False,"verification_status":"NEEDS_EVIDENCE"})
idx={"schema":"pct-evidence-index-v1","objects":rows,"gate":"Persistence/acquisition does not imply original inspection or historical verification."}
pathlib.Path(a.index_out).write_text(json.dumps(idx,ensure_ascii=False,indent=2),encoding="utf-8")
print(json.dumps({"persisted":len(rows),"index":a.index_out},ensure_ascii=False))
