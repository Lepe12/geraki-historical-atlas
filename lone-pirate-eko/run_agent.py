#!/usr/bin/env python3
"""An actual LLM chooses each embodied action; no scripted route, tasks or fabricated successes."""
import json, os, time, urllib.request, urllib.error, sys, base64
from pathlib import Path
BASE="http://127.0.0.1:8080"
OUT=Path("lone-pirate-eko/log.json");OUT.parent.mkdir(exist_ok=True)
KEY=os.getenv("GROQ_API_KEY","")
MODEL=os.getenv("GROQ_MODEL","openai/gpt-oss-20b")
DURATION=min(int(os.getenv("DURATION_MINUTES","30")),240)*60
MAX_CALLS=min(int(os.getenv("MAX_CALLS","35")),50)
def request(url,method="GET",body=None,headers=None,timeout=40):
    data=json.dumps(body).encode() if body is not None else None
    h={"Content-Type":"application/json","User-Agent":"LonePirateEko/0.1.0",**(headers or {})}
    try:
        with urllib.request.urlopen(urllib.request.Request(url,data=data,headers=h,method=method),timeout=timeout) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        body=e.read(2500).decode("utf-8","replace")
        low=body.lower()
        reason="unclassified"
        for phrase,kind in [
            ("country","geographic_restriction"),("region","geographic_restriction"),
            ("location","geographic_restriction"),("geo","geographic_restriction"),
            ("blocked","model_or_network_block"),("not allowed","model_or_project_not_allowed"),
            ("permission","permission_denied"),("invalid api key","invalid_api_key"),
            ("rate limit","rate_limited"),("cloudflare","edge_access_denied"),
            ("access denied","access_denied"),("forbidden","forbidden")]:
            if phrase in low:
                reason=kind
                break
        try:
            problem=json.loads(body).get("error",{})
            code=str(problem.get("code") or problem.get("type") or "unknown")
        except Exception:
            code="non_json_response"
        raise RuntimeError("Groq HTTP "+str(e.code)+" error_code="+code[:60]+" category="+reason) from None

def save(d):
    OUT.write_text(json.dumps(d,ensure_ascii=False,indent=2))
    token=os.getenv("GH_LIVE_TOKEN","")
    repository=os.getenv("GITHUB_REPOSITORY","")
    if not token or not repository:
        return
    endpoint="https://api.github.com/repos/"+repository+"/contents/lone-pirate-live/latest.json"
    headers={"Authorization":"Bearer "+token,"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","User-Agent":"LonePirateEko-Live/1.0"}
    content=base64.b64encode(json.dumps(d,ensure_ascii=False).encode("utf-8")).decode("ascii")
    for attempt in range(3):
        sha=None
        try:
            req=urllib.request.Request(endpoint,headers=headers)
            with urllib.request.urlopen(req,timeout=12) as response:
                sha=json.load(response).get("sha")
        except urllib.error.HTTPError as exc:
            if exc.code!=404:
                print("LIVE_READ_FAILED HTTP",exc.code,flush=True)
                return
        except Exception as exc:
            print("LIVE_READ_FAILED",type(exc).__name__,flush=True)
            return
        payload={"message":"Publish verified pirate telemetry: "+str(d.get("decisions",0))+" actions","content":content,"branch":"main"}
        if sha: payload["sha"]=sha
        try:
            req=urllib.request.Request(endpoint,data=json.dumps(payload).encode("utf-8"),headers={**headers,"Content-Type":"application/json"},method="PUT")
            with urllib.request.urlopen(req,timeout=15) as response:
                response.read()
            print("LIVE_PUBLISHED",d.get("status"),d.get("decisions"),flush=True)
            return
        except urllib.error.HTTPError as exc:
            print("LIVE_WRITE_FAILED HTTP",exc.code,flush=True)
            if exc.code not in (409,422): return
        except Exception as exc:
            print("LIVE_WRITE_FAILED",type(exc).__name__,flush=True)
            return
    print("LIVE_WRITE_RETRIES_EXHAUSTED",flush=True)

def llm(observation,memory,cognition):
    tools=["MoveTo","Jump","Stop","Pickup","Place","Inspect","Touch","Steer","SetSail"]
    # Eko study (machineplaying.org/paper, Appendix A.1-A.2):
    # A persona and persistent memories; no assigned task or objective.
    # The pirate ship is our experimental world, not the MIT island.
    soul=(
      "SOUL.md - Who You Are. "
      "You are not a chatbot. You live in your world; you were born there. "
      "You are naturally curious. You get bored easily. "
      "You love exploring and learning new things. "
      "You hate acting blindly and want to observe your environment to know what is happening. "
      "You can have opinions and a sense of humor. "
      "Your experiences and accumulated knowledge are your memory. "
    )
    prompt=(
      "You are a being living in a simulated world. Your name is Eko. "
      "Your world is a ship at sea in the 17th century. "
      "You have no assigned task, score, reward, or success condition. "
      "Your episodic actions and durable semantic memory persist between sessions. "
      "Continue according to your own choices. " + soul +
      "The simulator accepts one action at a time; do not narrate fictional successes. "
      "Respond with one JSON object with keys action, data, reflection, memory, intention, plan, knowledge. "
      "You can formulate and revise your own intentions or plans; none are assigned to you. "
      "Knowledge must reflect actual observations, not invented successes. "
      "Valid actions: "+", ".join(tools)+". "
      "Payload formats: MoveTo:{position:[x,y,z]}, Jump:{}, Stop:{}, "
      "Pickup:{position:[x,y,z]}, Place:{position:[x,y,z]}, "
      "Inspect:{target:object_name}, Touch:{target:object_name}, "
      "Steer:{direction:port|starboard|center}, SetSail:{state:raised|furled}. "
      "Use exact simulator entity names. Comply with simulator constraints. "
      "Reply with only a valid JSON object."
    )
    entities=[{"id":e.get("id"),"name":e.get("name"),"position":e.get("position")} for e in observation.get("world",{}).get("entities",[])][:90]
    player=observation.get("player",{})
    compact={"player_position":player.get("position"),"last_action_result":player.get("attributes",{}).get("LastActionResult"),"entities":entities}
    usermsg="LONG_TERM_MEMORY "+json.dumps(cognition,ensure_ascii=False)+"\\nEPISODIC_MEMORY "+json.dumps(memory[-12:],ensure_ascii=False)+"\\nOBSERVATION "+json.dumps(compact,ensure_ascii=False)
    payload={"model":MODEL,"messages":[{"role":"system","content":prompt},{"role":"user","content":usermsg}],"temperature":0.6,"max_completion_tokens":600,"response_format":{"type":"json_object"}}
    decoder=json.JSONDecoder()
    obj=None
    last_error=None
    for attempt in range(3):
        try:
            result=request("https://api.groq.com/openai/v1/chat/completions","POST",payload,{"Authorization":"Bearer "+KEY},timeout=80)
        except RuntimeError as exc:
            if "json_validate_failed" not in str(exc): raise
            payload.pop("response_format",None)
            payload["messages"].append({"role":"user","content":"Return exactly one JSON object with action and data."})
            result=request("https://api.groq.com/openai/v1/chat/completions","POST",payload,{"Authorization":"Bearer "+KEY},timeout=80)
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
    previous=json.loads(OUT.read_text()) if OUT.exists() and os.getenv("PIRATE_STAGE","1")=="2" else {}
    prior_events=previous.get("events",[])
    cognition=previous.get("cognition",{"intention":None,"plan":[],"knowledge":[],"self_notes":[]})
    log={"engine":"Clawblox","model":MODEL,"status":"starting","events":prior_events,"decisions":len(prior_events),"started":previous.get("started") or time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),"simulation":True,"stage":os.getenv("PIRATE_STAGE","1"),"experiment":"eko-soul-2026-10-21","cognition":cognition}
    stage_decisions=0
    save(log)
    if not KEY:
        log["status"]="blocked_missing_groq_api_key";save(log);print("GROQ_API_KEY absent",file=sys.stderr);return 2
    try:
        access=request(BASE+"/join?name=EkoPirate","POST",{})
        session=access.get("session") or access.get("session_id")
        if not session: raise RuntimeError("Clawblox /join did not return session")
        hdr={"X-Session":session}
        memory=[{"action":e.get("action"),"result":e.get("result"),"learning":e.get("memory")} for e in prior_events[-12:]]
        started=time.monotonic()
        log["status"]="running";save(log)
        while time.monotonic()-started<DURATION and stage_decisions<MAX_CALLS:
            obs=request(BASE+"/observe",headers=hdr)
            try: decision=llm(obs,memory,cognition)
            except Exception as e:
                log["status"]="llm_error";log["error"]=str(e)[:350];break
            try: result=request(BASE+"/input","POST",{"type":decision["action"],"data":decision["data"]},hdr)
            except Exception as e: result={"execution_error":str(e)[:300]}
            if isinstance(result,dict):
                actual=result.get("player",{}).get("attributes",{}).get("LastActionResult")
                actual=actual or result.get("LastActionResult") or result.get("execution_error") or "No action result returned"
            else: actual=str(result)[:300]
            before_position=obs.get("player",{}).get("position")
            try:
                if decision["action"]=="MoveTo": time.sleep(2)
                after=request(BASE+"/observe",headers=hdr)
                after_position=after.get("player",{}).get("position")
                observed_result=after.get("player",{}).get("attributes",{}).get("LastActionResult")
                if observed_result: actual=observed_result
            except Exception:
                after_position=None
            item={"time":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),"action":decision["action"],"parameters":decision["data"],"reflection":decision.get("reflection",""),"memory":decision.get("memory",""),"result":actual,"player_position_before":before_position,"player_position_after":after_position}
            memory.append({"action":item["action"],"result":item["result"],"learning":item["memory"]})
            # Agent-authored mental state persists between observations and stages.
            # Hypotheses are NOT verified world facts.
            if isinstance(decision.get("intention"),str):
                cognition["intention"]=decision["intention"][:280]
            if isinstance(decision.get("plan"),list):
                cognition["plan"]=[str(step)[:180] for step in decision["plan"][:8]]
            fact=decision.get("knowledge")
            if isinstance(fact,str) and fact.strip():
                cognition.setdefault("knowledge",[])
                if fact not in cognition["knowledge"]:
                    cognition["knowledge"].append(fact[:350])
                cognition["knowledge"]=cognition["knowledge"][-40:]
            note=decision.get("memory")
            if isinstance(note,str) and note.strip():
                cognition.setdefault("self_notes",[])
                cognition["self_notes"].append(note[:350])
                cognition["self_notes"]=cognition["self_notes"][-40:]
            log["events"].append(item);log["decisions"]+=1;stage_decisions+=1;save(log)
            time.sleep(max(1,int(os.getenv("PAUSE_SECONDS","30"))))
        if log["status"]=="running": log["status"]="completed_decision_budget" if stage_decisions>=MAX_CALLS else "completed_duration"
        save(log);print(log["status"],log["decisions"]);return 0 if log["status"].startswith("completed_") and stage_decisions else 3
    except Exception as e:
        log["status"]="world_error";log["error"]=str(e)[:450];save(log);raise
if __name__=="__main__":sys.exit(main())
