#!/usr/bin/env python3
"""Static connector capability audit plus contract validation."""
from __future__ import annotations
import argparse,json
from pathlib import Path
from connector_registry import load_registry

def audit(root:Path):
    reg=load_registry(root/"tools/connectors/connector_registry.json")
    results=[]
    for cid,item in reg.get("connectors",{}).items():
        module=root/item["module"]
        caps=item.get("capabilities",{})
        errors=[]
        if not module.is_file(): errors.append("MODULE_MISSING")
        if not any(bool(v) for v in caps.values()): errors.append("NO_CAPABILITIES_DECLARED")
        if item.get("access_class")=="BROWSER" and not caps.get("browser"):
            errors.append("BROWSER_CLASS_WITHOUT_BROWSER_CAPABILITY")
        results.append({
          "connector_id":cid,
          "repository":item.get("repository"),
          "module":item.get("module"),
          "status":"PASS" if not errors else "FAIL",
          "errors":errors,
          "capabilities":caps,
          "fallbacks":item.get("fallbacks",{})
        })
    return {
      "schema":"pct-connector-capability-audit-v1",
      "overall":"PASS" if all(x["status"]=="PASS" for x in results) else "DEGRADED",
      "connectors":results,
      "rule":"This audit proves registry/module integrity only, not live archive reachability."
    }

if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("--root",type=Path,default=Path("."));p.add_argument("--output")
    a=p.parse_args();out=audit(a.root);payload=json.dumps(out,ensure_ascii=False,indent=2)+"\n"
    if a.output: Path(a.output).write_text(payload,encoding="utf-8")
    else: print(payload,end="")
