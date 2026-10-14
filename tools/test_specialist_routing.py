#!/usr/bin/env python3
"""Offline regression tests for JARVIS-owned specialist source routing."""
from __future__ import annotations
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/"orchestrator"))

from jarvis_specialist_plan import build
from jarvis_specialist_reassign import build_second_wave

def route_ids(agent):
    return [x["route_id"] for x in agent.get("assigned_sources",[])]

def main():
    milos=build(
      "Milos",
      "Research piracy, corsairing and maritime activity in the Aegean without assuming a pirate base.",
      "1660-1680",
      ["Μήλος","Melos","Milo"],
      "place",
    )
    assert milos["routing_authority"]=="JARVIS_PLANNER"
    amap={x["agent_id"]:x for x in milos["agents"]}
    base=route_ids(amap["pirate_base"])
    contradiction=route_ids(amap["contradiction"])
    assert base!=contradiction,(base,contradiction)
    assert "repo:SearchCulture.gr / EKT" in base,base
    assert "registry:moreveneto_browser" in base,base
    assert len(base)==len(set(base))<=4
    for agent in milos["agents"]:
        assert agent["assignment_wave"]==1
        assert agent["assignment_id"].endswith(":wave1")
        assert agent["assigned_sources"]
        assert agent["assigned_queries"]
        assert agent["routing_decision"]["authority"]=="JARVIS_PLANNER"
        assert agent["query_budget"]["total"]<=20

    morgan=build(
      "Henry Morgan",
      "Biographical research on a Caribbean privateer and his Atlantic operations.",
      "1660-1688",
      [],
      "person",
    )
    mmap={x["agent_id"]:x for x in morgan["agents"]}
    bio=route_ids(mmap["pirate_biography"])
    assert any(x in bio for x in (
      "repo:PARES / Archivo General de Simancas",
      "repo:Biblioteca Digital Hispánica",
    )),bio

    synthetic={}
    for aid,agent in amap.items():
        synthetic[aid]={
          "agent_id":aid,
          "assignment_wave":1,
          "result_count":0,
          "search_runs":[{"status":"FAILED"},{"status":"BLOCKED"}],
        }
    wave2=build_second_wave(milos,synthetic)
    assert wave2["routing_authority"]=="JARVIS_PLANNER"
    assert wave2["assignment_wave"]==2
    assert wave2["agents"]
    for agent in wave2["agents"]:
        assert agent["assignment_wave"]==2
        assert agent["assignment_id"].endswith(":wave2")
        assert agent["routing_decision"]["authority"]=="JARVIS_PLANNER"
        assert agent["routing_decision"]["trigger"]=="RECOVERY_REPLAN"
        assert agent["routing_decision"]["recovery_action"]=="REPLAN"
        first=set(route_ids(amap[agent["agent_id"]]))
        second=set(route_ids(agent))
        assert not (first & second),(first,second)

    successful=dict(synthetic)
    successful["timeline"]={
      "agent_id":"timeline","assignment_wave":1,"result_count":2,
      "search_runs":[{"status":"EXECUTED","records":[{"id":"x"}]}],
    }
    wave2b=build_second_wave(milos,successful)
    assert "timeline" not in {x["agent_id"] for x in wave2b["agents"]}

    escalated=dict(synthetic)
    escalated["timeline"]={
      "agent_id":"timeline","assignment_wave":1,"result_count":0,
      "search_runs":[{"status":"AUTH_OR_BROWSER_REQUIRED","records":[],"diagnostic":"LOGIN_REQUIRED"}],
    }
    wave2c=build_second_wave(milos,escalated)
    assert "timeline" not in {x["agent_id"] for x in wave2c["agents"]}
    decision=next(x for x in wave2c["reassignment_decisions"] if x["agent_id"]=="timeline")
    assert decision["recovery_action"]=="ESCALATE",decision

    print("JARVIS SPECIALIST ROUTING TESTS PASS",len(milos["agents"]),"wave1 agents",len(wave2["agents"]),"wave2 agents")

if __name__=="__main__":
    main()
