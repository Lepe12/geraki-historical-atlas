#!/usr/bin/env python3
"""Lazy loader for allowlisted connector modules."""
from __future__ import annotations
import importlib.util
from pathlib import Path
from connector_registry import connector

ROOT=Path(__file__).resolve().parent.parent.parent

def load_connector_module(connector_id:str):
    meta=connector(connector_id)
    path=(ROOT/meta["module"]).resolve()
    if ROOT not in path.parents: raise ValueError("CONNECTOR_PATH_OUTSIDE_REPOSITORY")
    if not path.is_file(): raise FileNotFoundError(path)
    name="pct_connector_"+connector_id.replace("-","_")
    spec=importlib.util.spec_from_file_location(name,path)
    if spec is None or spec.loader is None: raise ImportError("CONNECTOR_IMPORT_SPEC_FAILED")
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
