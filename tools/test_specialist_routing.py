#!/usr/bin/env python3
"""Offline regression tests for specialist source routing."""
from __future__ import annotations
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/"orchestrator"))

from jarvis_specialist_plan import build
from jarvis_specialist_routing import plan_routes,select_queries

def route_ids(agent,plan,limit=4):
    return [x["route_id"] for x in plan_routes(agent,plan,limit)]

def main():
    milos=build(
      "Milos",
      "Research piracy, corsairing and maritime activity in the Aegean without assuming a pirate base.",
      "1660-1680",
      ["Μήλος","Melos","Milo"],
      "place",
    )
    amap={x["agent_id"]:x for x in milos["agents"]}
    base=route_ids(amap["pirate_base"],milos)
    contradiction=route_ids(amap["contradiction"],milos)
    assert base!=contradiction, (base,contradiction)
    assert "repo:SearchCulture.gr / EKT" in base, base
    assert "registry:moreveneto_browser" in base, base
    assert len(base)==len(set(base))<=4

    morgan=build(
      "Henry Morgan",
      "Biographical research on a Caribbean privateer and his Atlantic operations.",
      "1660-1688",
      [],
      "person",
    )
    mmap={x["agent_id"]:x for x in morgan["agents"]}
    bio=route_ids(mmap["pirate_biography"],morgan)
    assert any(x in bio for x in (
      "repo:PARES / Archivo General de Simancas",
      "repo:Biblioteca Digital Hispánica",
    )), bio

    q=select_queries(["q1","q2","q3","q4","q5","alias-last"],4,20)
    assert len(q)==5 and q[-1]=="alias-last",q

    all_sets={aid:tuple(route_ids(a,milos)) for aid,a in amap.items()}
    assert len(set(all_sets.values()))>1,all_sets
    print("SPECIALIST ROUTING TESTS PASS",len(all_sets),"agents")

if __name__=="__main__":
    main()
