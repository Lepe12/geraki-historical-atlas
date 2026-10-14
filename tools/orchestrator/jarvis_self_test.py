#!/usr/bin/env python3
"""Side-effect-safe Piratecartography JARVIS capability audit."""
from __future__ import annotations
import argparse, json
from pathlib import Path
from datetime import datetime, timezone

CHECKS=[
 ("controlled_dispatch",".github/workflows/jarvis-controlled-dispatch.yml"),
 ("archive_escalation",".github/workflows/jarvis-archive-escalation.yml"),
 ("multi_agent_workflow",".github/workflows/pct-parallel-multi-agent.yml"),
 ("moreveneto_browser","connectors/moreveneto_browser_search.py"),
 ("pares_simancas","connectors/pares_simancas_discover.py"),
 ("mariadb_queue","tools/storage/queue_mariadb_storage.py"),
 ("observer","tools/orchestrator/jarvis_observer.py"),
 ("recovery_engine","tools/orchestrator/jarvis_recovery.py"),
 ("runtime_guard","tools/orchestrator/jarvis_runtime_guard.py"),
 ("state_board","tools/orchestrator/jarvis_state_board.py"),
]

def audit(root:Path):
    caps=[]
    for name,rel in CHECKS:
        p=root/rel
        caps.append({"capability":name,"status":"PRESENT" if p.is_file() else "MISSING","path":rel})
    policy=root/"tools/orchestrator/jarvis_policy.json"
    if policy.is_file():
        d=json.loads(policy.read_text(encoding="utf-8"))
        caps.append({"capability":"kill_switch","status":"AVAILABLE","enabled":bool(d.get("dispatch",{}).get("kill_switch"))})
        caps.append({"capability":"dispatch_mode","status":str(d.get("mode","UNKNOWN"))})
    return {
      "schema":"pct-jarvis-self-test-v1",
      "generated_utc":datetime.now(timezone.utc).isoformat(),
      "overall":"PASS" if all(c["status"]!="MISSING" for c in caps) else "DEGRADED",
      "capabilities":caps,
      "note":"This is a static side-effect-safe audit. Live repository/archive/network access must be proven by dedicated smoke runs."
    }

if __name__=="__main__":
    p=argparse.ArgumentParser(); p.add_argument("--root",type=Path,default=Path(".")); p.add_argument("--output",type=Path)
    a=p.parse_args(); out=audit(a.root); payload=json.dumps(out,indent=2)+"\n"
    if a.output: a.output.parent.mkdir(parents=True,exist_ok=True); a.output.write_text(payload,encoding="utf-8")
    else: print(payload,end="")
