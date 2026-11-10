# NABOU//X Agent Skills — pilot (isolated)
This is a **working query-method registry**, not model fine-tuning and not yet connected to production orchestrator / Learning UI.

* `propose` records archive-lane alias variants as PROPOSED.
* `evaluate` needs at least 3 independently supplied control cases and rejects any failed control.
* Only VALIDATED variants can be read by `query`.
* JSON stores skills and immutable-style event log (no in-place overwrite of same skill ID).
* No generated historical claim becomes VERIFIED. Benchmark v4 human review remains mandatory.
* Do not provide official blind gold labels as model prompts. Controls here assess only aliases, not historical recall.
* Candidate skills are **not** automatically promoted based on unverified search hits.

Example (development only):
```sh
python tools/agent_skills/registry.py --registry /tmp/skills.json propose --id alias-demo --lane spanish_simancas --aliases-json '["Πέτρος Λάντζας","Pedro Lanza","Pietro Lanza"]' --rationale 'Historical alias test fixture'
python tools/agent_skills/registry.py --registry /tmp/skills.json evaluate --id alias-demo --cases-json tools/agent_skills/example_controls.json
python tools/agent_skills/registry.py --registry /tmp/skills.json query --id alias-demo
```
Production integration is deliberately pending discovery of runtime contracts and storage; do not write directly to canonical MariaDB without an adapter/migration and tests.
