#!/usr/bin/env python3
"""An actual LLM chooses each embodied action; no scripted route, tasks or fabricated successes."""
import json, os, time, urllib.request, urllib.error, sys, random
from pathlib import Path
BASE="http://127.0.0.1:8080"
OUT=Path("lone-pirate-eko/log.json");OUT.parent.mkdir(exist_ok=True)
KEY=os.getenv("OPENROUTER_API_KEY","")
MODEL=os.getenv("OPENROUTER_MODEL","openrouter/free")
DURATION=min(int(os.getenv("DURATION_MINUTES","30")),240)*60
MAX_CALLS=min(int(os.getenv("MAX_CALLS","35")),50)
def request(url,method="GET",body=None,headers=None,timeout=40):
    data=json.dumps(body).encode() if body is not None else None
    h={"Content-Type":"application/json",**(headers or {})}
    with urllib.request.urlopen(urllib.request.Request(url,data=data,headers=h,method=method),timeout=timeout) as r:
        return json.loads(r.read().decode())
def save(d): OUT.write_text(json.dumps(d,ensure_ascii=False,indent=2))
def llm(observation,memory):
    tools=["MoveTo","Jump","Stop","Pickup","Place","Inspect","Touch","Steer","SetSail"]
    prompt=("You are one pirate alone on a 17th century ship in the open sea. There is no assigned task and no mission. "
    "Be curious, experiment freely, avoid dangerous actions, and reflect on failed attempts. "
    "You control actions through a simulation, not prose. Never claim an action succeeded before observing its result. "
    "Reply ONLY valid JSON {action: one of "+", ".join(tools)+", data: object, reflection: short string, memory: short string}. "
    "No fixed sequence of actions. Use observations and memory to select actions.")
    payload={"model":MODEL,"messages":[{"role":"system","content":prompt},{"role":"user","content":"MEMORY "+json.dumps(memory[-12:],ensure_ascii=False)+"\nOBSERVATION "+json.dumps(observation,ensure_ascii=False)[:14000]}],"temperature":.8}
    result=request("https://openrouter.ai/api/v1/chat/completions","POST",payload,{"Authorization":"Bearer "+KEY,"HTTP-Referer":"https://github.com/Lepe12/geraki-historical-atlas","X-Title":"Lone Pirate Eko"},timeout=80)
    raw=result["choices"][0]["message"]["content"]
    if isinstance(raw,list): raw="".join(v.get("text","") for v in raw if isinstance(v,dict))
    raw=raw.strip()
    if raw.startswith("```"): raw="\n".join(raw.splitlines()[1:-1])
    try: obj=json.loads(raw)
    except json.JSONDecodeError: obj=json.loads(raw[raw.index("{"):raw.rindex("}")+1])
    if obj.get("action") not in tools or not isinstance(obj.get("data"),dict): raise ValueError("Unsupported model action")
    return obj
def main():
    log={"engine":"Clawblox","model":MODEL,"status":"starting","events":[],"decisions":0,"started":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),"simulation":True}
    save(log)
    if not KEY:
        log["status"]="blocked_missing_openrouter_api_key";save(log);print("OPENROUTER_API_KEY absent",file=sys.stderr);return 2
    try:
        access=request(BASE+"/join?name=EkoPirate","POST",{})
        session=access.get("session") or access.get("session_id")
        if not session: raise RuntimeError("Clawblox /join did not return session")
        hdr={"X-Session":session}
        memory=[];started=time.monotonic()
        log["status"]="running";save(log)
        while time.monotonic()-started<DURATION and log["decisions"]<MAX_CALLS:
            obs=request(BASE+"/observe",headers=hdr)
            try: decision=llm(obs,memory)
            except Exception as e:
                log["status"]="llm_error";log["error"]=str(e)[:350];break
            try: result=request(BASE+"/input","POST",{"type":decision["action"],"data":decision["data"]},hdr)
            except Exception as e: result={"execution_error":str(e)[:300]}
            item={"time":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),"action":decision["action"],"parameters":decision["data"],"reflection":decision.get("reflection",""),"memory":decision.get("memory",""),"result":result.get("LastActionResult") if isinstance(result,dict) else str(result)}
            if item["result"] is None: item["result"]=str(result)[:700]
            memory.append({"action":item["action"],"result":item["result"],"learning":item["memory"]})
            log["events"].append(item);log["decisions"]+=1;save(log)
            time.sleep(max(1,int(os.getenv("PAUSE_SECONDS","30"))))
        if log["status"]=="running": log["status"]="completed_decision_budget" if log["decisions"]>=MAX_CALLS else "completed_duration"
        save(log);print(log["status"],log["decisions"]);return 0 if log["decisions"] else 3
    except Exception as e:
        log["status"]="world_error";log["error"]=str(e)[:450];save(log);raise
if __name__=="__main__":sys.exit(main())
