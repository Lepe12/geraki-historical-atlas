#!/usr/bin/env python3
"""Append-only JARVIS research event bus with optional production delivery.

Durable JSONL remains authoritative. During GitHub Actions, events may also be
published to the Plesk Command Center endpoint using a short-lived GitHub OIDC
token. Remote delivery can never promote historical evidence and never blocks
durable research execution.
"""
from __future__ import annotations
import argparse,base64,datetime,json,os,re,time
from pathlib import Path
from urllib.parse import urlencode,urlsplit,urlunsplit,parse_qsl
from urllib.request import Request,urlopen

SAFE=re.compile(r"^[A-Za-z0-9_.:-]+$")
_OIDC_CACHE={"token":None,"exp":0}

def _safe(v:str,name:str)->str:
    v=str(v or "").strip()
    if not v or not SAFE.match(v): raise ValueError("INVALID_"+name.upper())
    return v

def _jwt_exp(token:str)->int:
    try:
        part=token.split(".")[1];part += "="*((4-len(part)%4)%4)
        return int(json.loads(base64.urlsafe_b64decode(part.encode()).decode()).get("exp",0))
    except Exception:
        return 0

def _oidc_token()->str|None:
    if os.environ.get("GITHUB_ACTIONS")!="true": return None
    now=int(time.time())
    if _OIDC_CACHE["token"] and int(_OIDC_CACHE["exp"])>now+45: return str(_OIDC_CACHE["token"])
    url=os.environ.get("ACTIONS_ID_TOKEN_REQUEST_URL","").strip()
    bearer=os.environ.get("ACTIONS_ID_TOKEN_REQUEST_TOKEN","").strip()
    if not url or not bearer: return None
    parts=urlsplit(url);query=dict(parse_qsl(parts.query,keep_blank_values=True));query["audience"]="piratecartography-command-center"
    req_url=urlunsplit((parts.scheme,parts.netloc,parts.path,urlencode(query),parts.fragment))
    req=Request(req_url,headers={"Authorization":"Bearer "+bearer,"User-Agent":"piratecartography-jarvis-event-bus/1"})
    with urlopen(req,timeout=4) as r:
        data=json.loads(r.read().decode("utf-8"))
    token=str(data.get("value") or "")
    if not token:return None
    _OIDC_CACHE["token"]=token;_OIDC_CACHE["exp"]=_jwt_exp(token)
    return token

def _publish_remote(event:dict)->None:
    base=os.environ.get("PCT_COMMAND_CENTER_URL","").strip().rstrip("/")
    if not base:return
    try:
        token=_oidc_token()
        if not token:return
        raw=json.dumps(event,ensure_ascii=False,separators=(",",":")).encode("utf-8")
        req=Request(base+"/events",data=raw,method="POST",headers={
          "Authorization":"Bearer "+token,
          "Content-Type":"application/json",
          "User-Agent":"piratecartography-jarvis-event-bus/1"
        })
        with urlopen(req,timeout=4) as r:
            if int(getattr(r,"status",500)) not in (200,202,204):
                raise RuntimeError("REMOTE_EVENT_HTTP_"+str(getattr(r,"status","?")))
    except Exception as exc:
        # Live transport is auxiliary. Durable JSONL remains authoritative.
        print("COMMAND_CENTER_REMOTE_DELIVERY_WARNING",type(exc).__name__,file=os.sys.stderr)

def emit(root:Path,project:str,run_id:str,event_type:str,*,agent_id:str="",phase:str="",percent:int|None=None,status:str="",artifacts=None,warnings=None,detail:str="")->dict:
    project=_safe(project,"project");run_id=_safe(run_id,"run_id");event_type=_safe(event_type,"event_type")
    if agent_id:_safe(agent_id,"agent_id")
    event={
      "schema":"pct-jarvis-event-v1",
      "event_id":datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ"),
      "created_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),
      "project":project,"run_id":run_id,"event_type":event_type,
      "agent_id":agent_id or None,"phase":phase or None,
      "percent":None if percent is None else max(0,min(100,int(percent))),
      "status":status or None,"artifacts":list(artifacts or []),
      "warnings":list(warnings or []),"detail":str(detail or "")[:2000]
    }
    path=root/project/run_id/"events.jsonl";path.parent.mkdir(parents=True,exist_ok=True)
    with path.open("a",encoding="utf-8") as fh:fh.write(json.dumps(event,ensure_ascii=False)+"\n")
    _publish_remote(event)
    return event

if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("--root",type=Path,default=Path("evidence/command_center"))
    p.add_argument("--project",default="piratecartography");p.add_argument("--run-id",required=True);p.add_argument("--event-type",required=True)
    p.add_argument("--agent-id",default="");p.add_argument("--phase",default="");p.add_argument("--percent",type=int);p.add_argument("--status",default="");p.add_argument("--detail",default="")
    a=p.parse_args();print(json.dumps(emit(a.root,a.project,a.run_id,a.event_type,agent_id=a.agent_id,phase=a.phase,percent=a.percent,status=a.status,detail=a.detail),ensure_ascii=False))
