#!/usr/bin/env python3
"""Resolve the active research request without encoding a place/test case in code."""
from __future__ import annotations
import json, os, pathlib, subprocess

ROOT=pathlib.Path("library_discovery_requests")

def _git_time(p):
    try:
        s=subprocess.check_output(["git","log","-1","--format=%ct","--",str(p)],text=True,stderr=subprocess.DEVNULL).strip()
        return int(s or 0)
    except Exception:
        try:return int(p.stat().st_mtime)
        except Exception:return 0

def load_request():
    explicit=os.getenv("PCT_REQUEST_FILE","").strip()
    if explicit:
        p=pathlib.Path(explicit)
        if not p.is_absolute() and not p.exists(): p=ROOT/explicit
        if not p.exists(): raise SystemExit("PCT_REQUEST_FILE not found: "+explicit)
    else:
        reqs=list(ROOT.glob("*.json"))
        if not reqs: raise SystemExit("No research request")
        p=max(reqs,key=lambda x:(_git_time(x),x.name))
    req=json.loads(p.read_text(encoding="utf-8"))
    target=str(req.get("target") or req.get("place") or "").strip()
    aliases=req.get("aliases") or req.get("place_variants") or []
    if isinstance(aliases,str): aliases=[x.strip() for x in aliases.split(",") if x.strip()]
    date_range=str(req.get("date_range") or req.get("dates") or "").strip()
    purpose=str(req.get("purpose") or req.get("research_command") or "").strip()
    if not target: raise SystemExit("Research request requires target/place")
    return p,req,{"target":target,"aliases":[str(x) for x in aliases if str(x).strip()],"date_range":date_range,"purpose":purpose}
