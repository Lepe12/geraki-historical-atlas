#!/usr/bin/env python3
"""Secret-reference abstraction.

Agents receive opaque secret references, never secret values. Resolution is
performed only at execution boundary from environment/host secret storage.
"""
from __future__ import annotations
import os,re
SAFE=re.compile(r"^[A-Z][A-Z0-9_]{2,127}$")

def validate_ref(ref:str)->str:
    ref=str(ref or "").strip()
    if not SAFE.match(ref): raise ValueError("INVALID_SECRET_REFERENCE")
    return ref

def resolve_at_boundary(ref:str)->str:
    ref=validate_ref(ref)
    value=os.environ.get(ref)
    if not value: raise RuntimeError("SECRET_REFERENCE_UNAVAILABLE:"+ref)
    return value

def redact(text:str,refs:list[str])->str:
    out=str(text)
    for ref in refs:
        value=os.environ.get(validate_ref(ref))
        if value: out=out.replace(value,"[REDACTED_SECRET]")
    return out
