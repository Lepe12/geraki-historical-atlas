"""Conservative persistent skill learning for archival search methods.

No source result or historical claim is verified by this module.
Skills are procedural query variants; promotion requires held-out test pass.
"""
import argparse
import json
import os
import tempfile
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

STATES = {"proposed", "validated", "rejected"}
LANES = {"greek", "travellers", "spanish_simancas", "venetian", "french",
         "british", "dutch", "german", "italian_states", "ottoman", "north_african"}

def normal(text):
    return " ".join(unicodedata.normalize("NFKC", text).casefold().split())

def clean_aliases(values):
    if not isinstance(values, list):
        raise ValueError("aliases must be a list")
    out, seen = [], set()
    for value in values:
        if not isinstance(value, str) or not value.strip() or len(value) > 120:
            raise ValueError("invalid alias")
        key = normal(value.strip())
        if key not in seen:
            seen.add(key)
            out.append(value.strip())
    if not out or len(out) > 40:
        raise ValueError("aliases must contain 1-40 unique strings")
    return out

def load(path):
    path = Path(path)
    if not path.exists():
        return {"version": 1, "skills": {}, "events": []}
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("version") != 1 or not isinstance(data.get("skills"), dict) or not isinstance(data.get("events"), list):
        raise ValueError("invalid registry")
    return data

def save(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    # Atomic replacement avoids truncated registry on interrupted writes.
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".skills-", suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False, indent=2, sort_keys=True)
            fh.write("\n")
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)

def propose(data, skill_id, lane, aliases, rationale):
    if not skill_id or len(skill_id) > 80 or not all(c.isalnum() or c in "-_" for c in skill_id):
        raise ValueError("invalid skill id")
    if lane not in LANES:
        raise ValueError("unknown lane")
    if skill_id in data["skills"]:
        raise ValueError("skill exists: no silent overwrite")
    aliases = clean_aliases(aliases)
    data["skills"][skill_id] = {"lane": lane, "aliases": aliases,
                               "rationale": rationale, "state": "proposed",
                               "evaluation": None}
    data["events"].append({"at": datetime.now(timezone.utc).isoformat(),
                           "skill_id": skill_id, "action": "proposed"})
    return data["skills"][skill_id]

def evaluate(data, skill_id, cases, minimum=1.0):
    """Held-out cases: [{input, expected_aliases:[...], forbidden_aliases:[...]}].
    Controls test query expansion only, never historical accuracy.
    """
    skill = data["skills"][skill_id]
    if skill["state"] != "proposed":
        raise ValueError("evaluate only proposed skills")
    if not isinstance(cases, list) or len(cases) < 3:
        raise ValueError("at least three independently supplied controls required")
    aliases = {normal(a) for a in skill["aliases"]}
    scores = []
    for case in cases:
        required = {normal(a) for a in clean_aliases(case["expected_aliases"])}
        forbidden = {normal(a) for a in case.get("forbidden_aliases", [])}
        scores.append(bool(required & aliases) and not bool(forbidden & aliases))
    ratio = sum(scores) / len(scores)
    passed = ratio >= minimum and all(scores)
    skill["evaluation"] = {"passed": passed, "score": ratio, "cases": len(scores),
                           "scope": "query-expansion-only"}
    skill["state"] = "validated" if passed else "rejected"
    data["events"].append({"at": datetime.now(timezone.utc).isoformat(),
                           "skill_id": skill_id, "action": skill["state"],
                           "score": ratio})
    return skill["evaluation"]

def query_variants(data, skill_id):
    skill = data["skills"][skill_id]
    if skill["state"] != "validated":
        raise ValueError("only validated skills may be used")
    return list(skill["aliases"])

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--registry", default="data/agent_skills/registry.json")
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("propose")
    p.add_argument("--id", required=True)
    p.add_argument("--lane", required=True)
    p.add_argument("--aliases-json", required=True)
    p.add_argument("--rationale", required=True)
    p = sub.add_parser("evaluate")
    p.add_argument("--id", required=True)
    p.add_argument("--cases-json", required=True)
    p = sub.add_parser("query")
    p.add_argument("--id", required=True)
    args = parser.parse_args()
    data = load(args.registry)
    if args.command == "propose":
        result = propose(data, args.id, args.lane, json.loads(args.aliases_json), args.rationale)
        save(args.registry, data)
    elif args.command == "evaluate":
        result = evaluate(data, args.id, json.loads(Path(args.cases_json).read_text(encoding="utf-8")))
        save(args.registry, data)
    else:
        result = query_variants(data, args.id)
    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
