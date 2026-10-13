#!/usr/bin/env python3
"""Project namespace isolation for JARVIS artifacts and evidence."""
from __future__ import annotations
import re
from pathlib import Path

ALLOWED_PROJECTS={"piratecartography","geraki","between_empires"}
SAFE=re.compile(r"^[A-Za-z0-9_.:-]+$")

def validate_project(project:str)->str:
    project=str(project or "").strip()
    if project not in ALLOWED_PROJECTS: raise ValueError("PROJECT_NOT_ALLOWED")
    return project

def scoped_path(root:Path,project:str,*parts:str)->Path:
    project=validate_project(project)
    clean=[]
    for p in parts:
        s=str(p)
        if not SAFE.match(s): raise ValueError("UNSAFE_SCOPE_PART")
        clean.append(s)
    out=(root/project).joinpath(*clean)
    base=(root/project).resolve()
    if base not in out.resolve().parents and out.resolve()!=base: raise ValueError("PROJECT_SCOPE_ESCAPE")
    return out
