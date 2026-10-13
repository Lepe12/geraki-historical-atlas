#!/usr/bin/env python3
"""Create a bounded connector repair proposal from a failed structured result.

This does not edit code, install packages, or merge changes.
"""
from __future__ import annotations
import argparse,json
from pathlib import Path

MAP={
 "TIMEOUT":["inspect endpoint latency","reduce page size","use browser fallback if registered"],
 "LOGIN_REQUIRED":["confirm archive authentication requirement","do not automate credential entry without explicit approval"],
 "CAPTCHA":["stop automated retries","queue human/browser review"],
 "ARCHIVE_NOT_CONFIRMED":["use registered browser fallback","inspect current catalogue route"],
 "EXECUTION_FAILED":["run connector self-test","inspect stderr","prepare isolated patch candidate"]
}

if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("--result",required=True);p.add_argument("--output",required=True)
    a=p.parse_args();d=json.loads(Path(a.result).read_text(encoding="utf-8"))
    codes=[x.get("code") for x in d.get("blockers",[]) if x.get("code")]
    actions=[]
    for code in codes: actions.extend(MAP.get(code,["manual diagnosis required"]))
    out={
      "schema":"pct-connector-repair-proposal-v1","connector_id":d.get("connector_id"),
      "status":d.get("status"),"blocker_codes":codes,"recommended_actions":list(dict.fromkeys(actions)),
      "automatic_patch_allowed":False,"automatic_merge_allowed":False,
      "required_gate":"Any code patch must pass connector framework tests and explicit review before merge."
    }
    Path(a.output).write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("REPAIR PROPOSAL",d.get("connector_id"),codes)
