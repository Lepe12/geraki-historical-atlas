#!/usr/bin/env python3
"""An actual LLM chooses each embodied action; no scripted route, tasks or fabricated successes."""
import json, os, time, urllib.request, urllib.error, sys
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
    "The ONLY valid action payload formats are: "
    "MoveTo:{position:[x,y,z]}, Jump:{}, Stop:{}, Pickup:{position:[x,y,z]}, "
    "Place:{position:[x,y,z]}, Inspect:{target:object_name}, Touch:{target:object_name}, "
    "Steer:{direction:port|starboard|center}, SetSail:{state:raised|furled}. "
    "Use exact world entity names (NOT entityId), and do not issue fixed routes. "
    "No fixed sequence of actions. Use observations and memory to select actions.")
    entities=[{"id":e.get("id"),"name":e.get("name"),"position":e.get("position")} for e in observation.get("world",{}).get("entities",[])][:90]
    player=observation.get("player",{})
    compact={"player_position":player.get("position"),"last_action_result":player.get("attributes",{}).get("LastActionResult"),"entities":entities}
    usermsg="MEMORY "+json.dumps(memory[-6:],ensure_ascii=False)+"\\nOBSERVATION "+json.dumps(compact,ensure_ascii=False)
    payload={"model":MODEL,"messages":[{"role":"system","content":prompt+" Example response: {\\\"action\\\":\\\"Inspect\\\",\\\"data\\\":{\\\"target\\\":\\\"Helm\\\"},\\\"reflection\\\":\\\"I am curious about this mechanism\\\",\\\"memory\\\":\\\"I have not inspected the helm yet\\\"}. Never output markdown, reasoning tags, or multiple JSON responses."},{"role":"user","content":usermsg}],"temperature":0.35,"max_tokens":350}
    decoder=json.JSONDecoder()
    obj=None
    last_error=None
    for attempt in range(3):
        result=request("https://openrouter.ai/api/v1/chat/completions","POST",payload,{"Authorization":"Bearer "+KEY,"HTTP-Referer":"https://github.com/Lepe12/geraki-historical-atlas","X-Title":"Lone Pirate Eko"},timeout=80)
        raw=result["choices"][0]["message"].get("content") or ""
        if isinstance(raw,list): raw="".join(v.get("text","") for v in raw if isinstance(v,dict))
        raw=raw.strip()
        if raw.startswith("```"): raw="\\n".join(raw.splitlines()[1:-1])
        try:
            pos=raw.find("{")
            if pos<0: raise ValueError("Model returned no JSON: "+raw[:100])
            obj,_=decoder.raw_decode(raw[pos:])
            break
        except (ValueError,json.JSONDecodeError) as e:
            last_error=str(e)
            payload["messages"].append({"role":"user","content":"Your previous response did not contain a valid JSON action. Reply with ONE JSON object only."})
    if obj is None: raise ValueError("Free model failed JSON after 3 responses: "+str(last_error))
    if not isinstance(obj,dict) or obj.get("action") not in tools or not isinstance(obj.get("data"),dict):
        raise ValueError("Unsupported model action")
    data=obj["data"]
    if obj["action"] in ("Inspect","Touch"):
        if not data.get("target") and data.get("entityId") is not None:
            eid=str(data["entityId"])
            entities=observation.get("world",{}).get("entities",[])
            match=next((e for e in entities if str(e.get("id"))==eid),None)
            if match: data["target"]=match.get("name")
        if not isinstance(data.get("target"),str) or not data["target"]:
            raise ValueError("Model action missing target")
    if obj["action"] in ("MoveTo","Pickup","Place"):
        v=data.get("position")
        if not isinstance(v,list) or len(v)!=3 or not all(isinstance(x,(int,float)) for x in v):
            raise ValueError("Model action missing 3D position")
    if obj["action"]=="Steer" and data.get("direction") not in ("port","starboard","center"):
        raise ValueError("Invalid steering direction")
    if obj["action"]=="SetSail" and data.get("state") not in ("raised","furled"):
        raise ValueError("Invalid sail state")
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
            if isinstance(result,dict):
                actual=result.get("player",{}).get("attributes",{}).get("LastActionResult")
                actual=actual or result.get("LastActionResult") or result.get("execution_error") or "No action result returned"
            else: actual=str(result)[:300]
            item={"time":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),"action":decision["action"],"parameters":decision["data"],"reflection":decision.get("reflection",""),"memory":decision.get("memory",""),"result":actual}
            memory.append({"action":item["action"],"result":item["result"],"learning":item["memory"]})
            log["events"].append(item);log["decisions"]+=1;save(log)
            time.sleep(max(1,int(os.getenv("PAUSE_SECONDS","30"))))
        if log["status"]=="running": log["status"]="completed_decision_budget" if log["decisions"]>=MAX_CALLS else "completed_duration"
        save(log);print(log["status"],log["decisions"]);return 0 if log["status"].startswith("completed_") and log["decisions"] else 3
    except Exception as e:
        log["status"]="world_error";log["error"]=str(e)[:450];save(log);raise
if __name__=="__main__":sys.exit(main())
