#!/usr/bin/env python3
"""Automatic research-lane selection for JARVIS general command.

JARVIS owns the decision about which of the ten geographic/archive lanes run.
The planner is deterministic and auditable. When context is weak or the user
asks for exhaustive coverage, it deliberately widens coverage instead of
pretending confidence.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Any

ALL_AGENTS = [
    "travellers",
    "spanish_simancas",
    "venetian",
    "french",
    "british",
    "dutch",
    "german",
    "italian_states",
    "ottoman",
    "north_african",
]

BROAD_MARKERS = (
    "all archives",
    "all sources",
    "all agents",
    "every archive",
    "every source",
    "comprehensive",
    "exhaustive",
    "full research",
    "deep research",
    "cross-archive",
    "cross archive",
    "παντού",
    "όλες τις πηγές",
    "ολες τις πηγες",
    "όλα τα αρχεία",
    "ολα τα αρχεια",
    "πλήρης έρευνα",
    "πληρης ερευνα",
)

PROFILE_RULES: dict[str, dict[str, Any]] = {
    "greek_aegean": {
        "patterns": [
            r"[\u0370-\u03ff]",
            r"\baegean\b", r"\bcyclad", r"\bgree(?:ce|k)\b",
            r"\bionian\b", r"\bcorfu\b", r"\bparga\b", r"\bmilos\b",
            r"\bmelos\b", r"\bmani\b", r"\bmorea\b",
        ],
        "weights": {
            "venetian": 34, "ottoman": 30, "travellers": 24,
            "italian_states": 18, "spanish_simancas": 8,
        },
    },
    "iberian_habsburg": {
        "patterns": [
            r"\bspain\b", r"\bspanish\b", r"\biberi", r"\bphilip\s+ii\b",
            r"\bfelipe\s+ii\b", r"\bsimancas\b", r"\bmadrid\b",
            r"\bportugal\b", r"\bazores\b", r"\bhabsburg\b",
            r"\barmada\b",
        ],
        "weights": {
            "spanish_simancas": 38, "italian_states": 18,
            "venetian": 12, "french": 8, "british": 8,
        },
    },
    "italian_mediterranean": {
        "patterns": [
            r"\bital(?:y|ian)\b", r"\bnaples\b", r"\bnapoli\b",
            r"\bsicil", r"\bgenoa\b", r"\bgenoese\b", r"\brome\b",
            r"\bpapal\b", r"\btuscany\b", r"\bflorence\b",
        ],
        "weights": {
            "italian_states": 38, "spanish_simancas": 18,
            "venetian": 16, "travellers": 10,
        },
    },
    "venetian_adriatic": {
        "patterns": [
            r"\bvenice\b", r"\bvenetian\b", r"\bvenez", r"\badriatic\b",
            r"\bdalmat", r"\bcret", r"\bcandia\b",
        ],
        "weights": {
            "venetian": 42, "italian_states": 16,
            "ottoman": 14, "travellers": 10,
        },
    },
    "ottoman_levant": {
        "patterns": [
            r"\bottoman", r"\bturk", r"\blevant\b", r"\bconstantinople\b",
            r"\bistanbul\b", r"\bsmyrna\b", r"\bizmir\b",
            r"\buluc\b", r"\bulu[cç]\b",
        ],
        "weights": {
            "ottoman": 42, "venetian": 16, "french": 12,
            "spanish_simancas": 10, "travellers": 8,
        },
    },
    "north_african": {
        "patterns": [
            r"\bbarbary\b", r"\bmaghreb\b", r"\bnorth africa",
            r"\balgiers\b", r"\balgeria\b", r"\btunis\b",
            r"\btripoli\b", r"\bmorocco\b", r"\bsal[eé]\b",
        ],
        "weights": {
            "north_african": 44, "french": 18, "ottoman": 18,
            "spanish_simancas": 14, "travellers": 8,
        },
    },
    "french": {
        "patterns": [
            r"\bfrance\b", r"\bfrench\b", r"\bmarseille\b",
            r"\bprovence\b", r"\bparis\b", r"\bcorsica\b",
        ],
        "weights": {
            "french": 44, "travellers": 10, "italian_states": 8,
            "spanish_simancas": 6,
        },
    },
    "british": {
        "patterns": [
            r"\bengland\b", r"\benglish\b", r"\bbritish\b",
            r"\blondon\b", r"\broyal navy\b",
        ],
        "weights": {
            "british": 44, "travellers": 10, "spanish_simancas": 8,
            "dutch": 6, "french": 6,
        },
    },
    "dutch": {
        "patterns": [
            r"\bdutch\b", r"\bnetherlands\b", r"\bholland\b",
            r"\bamsterdam\b", r"\bdelpher\b",
        ],
        "weights": {
            "dutch": 44, "british": 10, "french": 8,
            "travellers": 8,
        },
    },
    "german": {
        "patterns": [
            r"\bgerman\b", r"\bgermany\b", r"\bbavaria\b",
            r"\bvienna\b", r"\bimperial\b",
        ],
        "weights": {
            "german": 44, "italian_states": 8, "venetian": 8,
            "travellers": 6,
        },
    },
    "caribbean_atlantic": {
        "patterns": [
            r"\bcaribbean\b", r"\bwest indies\b", r"\bjamaica\b",
            r"\bhispaniola\b", r"\bcuba\b", r"\bpanama\b",
            r"\bport royal\b", r"\bprivateer\b", r"\bbuccaneer\b",
        ],
        "weights": {
            "british": 30, "spanish_simancas": 30, "french": 18,
            "dutch": 14, "travellers": 12,
        },
    },
}

BASE_SCORES = {
    "travellers": 8,
    "venetian": 5,
    "ottoman": 5,
    "spanish_simancas": 4,
    "italian_states": 3,
    "french": 2,
    "british": 2,
    "dutch": 1,
    "german": 1,
    "north_african": 1,
}


def _fold(value: str) -> str:
    value = unicodedata.normalize("NFKD", str(value or ""))
    return "".join(ch for ch in value if not unicodedata.combining(ch)).casefold()


def _context(payload: dict[str, Any]) -> tuple[str, str]:
    values = [
        payload.get("target", ""),
        payload.get("purpose", ""),
        payload.get("date_range", ""),
        " ".join(payload.get("aliases", []) or []),
    ]
    raw = " ".join(str(x) for x in values if x).strip()
    return raw, _fold(raw)


def _matches(pattern: str, raw: str, folded: str) -> bool:
    return bool(re.search(pattern, raw, re.I) or re.search(pattern, folded, re.I))


def plan_agents(payload: dict[str, Any], policy: dict[str, Any]) -> dict[str, Any]:
    dispatch = policy.get("dispatch", {})
    allowed = [a for a in dispatch.get("allowed_agents", []) if a in ALL_AGENTS]
    if not allowed:
        raise ValueError("NO_ALLOWED_RESEARCH_AGENTS")

    raw, folded = _context(payload)
    if not raw:
        raise ValueError("RESEARCH_CONTEXT_REQUIRED")

    scores = {agent: int(BASE_SCORES.get(agent, 0)) for agent in allowed}
    reasons = {agent: ["baseline"] for agent in allowed}
    profiles: list[str] = []

    for profile, cfg in PROFILE_RULES.items():
        if not any(_matches(pattern, raw, folded) for pattern in cfg["patterns"]):
            continue
        profiles.append(profile)
        for agent, weight in cfg["weights"].items():
            if agent not in scores:
                continue
            scores[agent] += int(weight)
            reasons[agent].append("context:" + profile)

    broad_requested = any(marker in folded for marker in BROAD_MARKERS)
    ranked = sorted(allowed, key=lambda a: (-scores[a], allowed.index(a), a))

    if broad_requested:
        selected = list(allowed)
        confidence = "HIGH"
        strategy = "explicit_broad_coverage"
    elif not profiles:
        # Historical discovery must prefer recall when JARVIS lacks enough
        # geographic clues. Do not silently exclude archives on weak context.
        selected = list(allowed)
        confidence = "LOW"
        strategy = "uncertain_context_broad_coverage"
    else:
        min_agents = max(1, int(dispatch.get("auto_select_min_agents", 3)))
        max_agents = min(len(allowed), max(min_agents, int(dispatch.get("auto_select_max_agents", 6))))
        # One context profile is usually focused; multiple geopolitical profiles
        # justify wider archival coverage.
        desired = min_agents + max(0, len(profiles) - 1)
        if "caribbean_atlantic" in profiles:
            desired = max(desired, 5)
        desired = min(max_agents, desired)
        selected = ranked[:desired]
        confidence = "HIGH" if len(profiles) == 1 else "MEDIUM"
        strategy = "context_ranked"

    ranking = [
        {"agent_id": agent, "score": scores[agent], "reasons": reasons[agent]}
        for agent in ranked
    ]
    return {
        "schema": "pct-jarvis-agent-selection-v1",
        "authority": "JARVIS",
        "strategy": strategy,
        "confidence": confidence,
        "matched_profiles": profiles,
        "selected_agents": selected,
        "ranking": ranking,
        "rule": "JARVIS selects research lanes; weak context widens coverage instead of pretending certainty.",
    }
