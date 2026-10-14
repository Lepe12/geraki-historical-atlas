#!/usr/bin/env python3
"""Deterministic source router for JARVIS specialist historical agents.

Routing changes search priority only. It never raises evidence state and must
never be treated as support for a historical claim.
"""
from __future__ import annotations
import json,re,unicodedata
from pathlib import Path

REG=Path(__file__).with_name("specialist_agent_registry.json")

CONTEXT_BOOSTS={
  "greek_aegean":{
    "patterns":[r"[\u0370-\u03ff]",r"\baegean\b",r"\bcyclad",r"\bgreece\b",r"\bgreek\b"],
    "routes":{
      "repo:SearchCulture.gr / EKT":30,
      "repo:OpenArchives.gr / EKT":26,
      "repo:Academia.edu Public Research":20,
      "repo:Anemi / University of Crete":18,
      "registry:moreveneto_browser":16,
      "repo:Internet Culturale":12,
      "repo:İSAM Kütüphanesi":10,
      "repo:Gallica/BnF":8,
    },
  },
  "ottoman_levant":{
    "patterns":[r"\bott?oman",r"\bturk",r"\blevant",r"\bconstantinople\b",r"\bistanbul\b"],
    "routes":{
      "repo:İSAM Kütüphanesi":24,
      "repo:Gallica/BnF":12,
      "repo:Archives diplomatiques France":12,
      "repo:PARES / Archivo General de Simancas":8,
    },
  },
  "iberian_atlantic":{
    "patterns":[r"\bspain\b",r"\bspanish\b",r"\biberi",r"\bportugal",r"\bcaribbean\b",r"\bwest indies\b"],
    "routes":{
      "repo:PARES / Archivo General de Simancas":24,
      "repo:Biblioteca Digital Hispánica":22,
      "repo:The National Archives Public Content":8,
      "repo:Gallica/BnF":8,
    },
  },
  "french":{
    "patterns":[r"\bfrance\b",r"\bfrench\b",r"\bprovence\b",r"\bmarseille\b",r"\bcorsica\b"],
    "routes":{
      "repo:Gallica/BnF":24,
      "repo:Archives diplomatiques France":22,
      "registry:archives_nationales_open_data":18,
    },
  },
  "italian_venetian":{
    "patterns":[r"\bvenice\b",r"\bvenetian\b",r"\bitaly\b",r"\bitalian\b",r"\badriatic\b"],
    "routes":{
      "registry:moreveneto_browser":24,
      "repo:Internet Culturale":22,
      "registry:sias_browser":16,
    },
  },
  "british":{
    "patterns":[r"\bbritish\b",r"\bengland\b",r"\benglish\b",r"\blondon\b"],
    "routes":{"repo:The National Archives Public Content":24},
  },
  "dutch":{
    "patterns":[r"\bdutch\b",r"\bnetherlands\b",r"\bholland\b"],
    "routes":{"repo:Nationaal Archief":24,"repo:Delpher":20},
  },
  "german":{
    "patterns":[r"\bgerman\b",r"\bgermany\b",r"\bbavaria\b"],
    "routes":{"repo:Deutsche Digitale Bibliothek":24},
  },
  "north_african":{
    "patterns":[r"\bbarbary\b",r"\bmaghreb\b",r"\bnorth africa",r"\balgiers\b",r"\btunis\b",r"\btripoli\b",r"\bmorocco\b",r"\bsal[eé]\b"],
    "routes":{
      "repo:Gallica/BnF":22,
      "repo:Archives diplomatiques France":20,
      "repo:İSAM Kütüphanesi":18,
      "repo:PARES / Archivo General de Simancas":12,
    },
  },
}

def _registry():
    return json.loads(REG.read_text(encoding="utf-8"))

def _norm(value):
    value=unicodedata.normalize("NFKD",str(value or ""))
    return "".join(ch for ch in value if not unicodedata.combining(ch)).casefold()

def _context_blob(plan):
    values=[
      plan.get("target",""),plan.get("purpose",""),plan.get("date_range",""),
      " ".join(plan.get("aliases",[]) or []),
    ]
    return " ".join(str(x) for x in values if x)

def _route_parts(route_id):
    if ":" not in route_id:
        raise ValueError("INVALID_SPECIALIST_ROUTE:"+route_id)
    kind,value=route_id.split(":",1)
    if kind not in {"repo","registry"} or not value.strip():
        raise ValueError("INVALID_SPECIALIST_ROUTE:"+route_id)
    return kind,value.strip()

def plan_routes(agent:dict, plan:dict, limit:int=4):
    """Return ranked, auditable routes for one specialist agent."""
    if limit<1:
        raise ValueError("connector limit must be positive")
    route_ids=list(agent.get("source_routes") or [])
    if not route_ids:
        meta=_registry().get("agents",{}).get(agent.get("agent_id"),{})
        route_ids=list(meta.get("source_routes") or [])
    scores={}
    reasons={}
    for index,rid in enumerate(route_ids):
        _route_parts(rid)
        scores[rid]=100-index*4
        reasons[rid]=["agent_profile"]

    blob=_context_blob(plan)
    folded=_norm(blob)
    matched=[]
    for name,cfg in CONTEXT_BOOSTS.items():
        hit=False
        for pattern in cfg["patterns"]:
            if re.search(pattern,blob,re.I) or re.search(pattern,folded,re.I):
                hit=True;break
        if not hit:
            continue
        matched.append(name)
        for rid,boost in cfg["routes"].items():
            _route_parts(rid)
            scores[rid]=scores.get(rid,55)+boost
            reasons.setdefault(rid,[]).append("context:"+name)

    ranked=sorted(scores,key=lambda rid:(-scores[rid],route_ids.index(rid) if rid in route_ids else 999,rid))
    out=[]
    for rid in ranked[:limit]:
        kind,value=_route_parts(rid)
        out.append({
          "route_id":rid,
          "route_type":"repository_dispatch" if kind=="repo" else "registered_connector",
          "repository":value if kind=="repo" else None,
          "connector_id":value if kind=="registry" else None,
          "score":scores[rid],
          "reason":reasons.get(rid,["context"]),
          "context_profiles":matched,
          "evidence_effect":"NONE_DISCOVERY_PRIORITY_ONLY",
        })
    return out

def select_queries(queries:list[str], route_count:int, total_budget:int=20):
    """Bound remote work while retaining at least one late alias/date variant."""
    clean=[]
    for q in queries:
        q=str(q or "").strip()
        if q and q not in clean: clean.append(q)
    if not clean:return []
    per=max(1,min(5,total_budget//max(1,route_count)))
    if len(clean)<=per:return clean
    if per==1:return [clean[0]]
    selected=clean[:per-1]
    if clean[-1] not in selected:selected.append(clean[-1])
    return selected[:per]
