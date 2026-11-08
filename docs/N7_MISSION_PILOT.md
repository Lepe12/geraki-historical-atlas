# N7 research mission — guarded pilot

## Scope

Adds a **resumable, bounded four-agent discovery mission** to existing JARVIS.
It **reuses** `jarvis_specialist_plan.build`, the existing source routing,
`jarvis_runtime_guard.validate_specialist_assignment`,
`jarvis_specialist_worker.run_one` and research-query performance memory.
It is additive: **no changes** to the Atlas renderer, current interface,
existing N7 gateway, public WordPress installation or production database.

The four specialist search roles are `pirate_base`, `timeline`,
`source_genealogy`, `contradiction`. These are discovery agents, **not four
independent language models**. The contradiction role performs adversarial
*search*, not page-level validation of claims.

## Operations

An operator can run the **N7 Research Mission Pilot** GitHub workflow manually
on the default branch after review/merge. Default target is Naxos, 1600–1700.
The PR also runs an **offline CI check** automatically; it never connects to
external research services during PR validation.

Local commands (from repository root):

```sh
export PYTHONPATH=.:tools:tools/orchestrator:tools/connectors
python3 tools/orchestrator/n7_mission.py init --root .n7_missions --run-id local-naxos \
  --target Naxos --purpose 'Pirate bases in the seventeenth century' --date-range 1600-1700
python3 tools/orchestrator/n7_mission.py run --root .n7_missions --run-id local-naxos
python3 tools/orchestrator/n7_mission.py status --root .n7_missions --run-id local-naxos
```

For interrupted missions, repeat `run` against the **same persistent
`.n7_missions/<run-id>` directory**. Completed agent work is skipped. Failed
agents can be attempted at most twice. A fresh runner needs the checkpoint
artifact restored before rerunning. By design the GitHub Actions artifact
is not automatically restored across distinct workflow runs.

## Evidence safety

- `report.json` counts only **candidate records**, not verified claims.
- A `contradiction` agent completes only an adversarial search.
- Real source/page inspection, provenance cross-check, full PDF reading,
  model synthesis, and independent human review remain follow-on stages.
- `historically_verified` and `publication_allowed` are always `false`.
- Runtime guard and kill switch are rechecked before *each* assignment.
- Worker result must identify the assigned agent and forbid VERIFIED promotion.
- Local checkpoints are atomic; mission routing-memory is source/query
  performance metadata, not a verified knowledge base.
- No shell or arbitrary code issued by agents, no production deployment,
  no secrets written to reports, no GitHub commits during research.

## Acceptance tests

`python3 -m unittest tools/orchestrator/test_n7_mission.py -v`

Tests cover planning and required roles, kill switch, bounded resume, no
rerun of completed work, finite retries, corrupted historical-verification
flags, untrusted worker outputs and path traversal rejection. CI also performs
a real no-network planning smoke test using the existing JARVIS planner.

## N7 private chat integration (companion PR)

The N7 Command Center gateway now has two **HMAC-authenticated, server-to-server**
routes: `/n7/mission/dispatch-signed` and `/n7/mission/status-signed`.
They share the existing 32-byte private library bridge signing key; both
reject unsigned or browser-origin requests. The gateway dispatches a **fixed**
`n7-research-orchestrate.yml` workflow, which runs the existing full
`pct-parallel-multi-agent.yml` pipeline using JARVIS routing and
`auto_continue=false` (bounded, no automatic re-chain).

The status route resolves the parent planning run and its child research run
from GitHub. If the research completes, it attempts to read the existing
`evidence/runs/<run-id>/research_answer/answer.json` and return only a small
source-cited narrative preview, bibliography cues, and an evidence folder link
to the owner UI. Missing/unpublished reports fail gracefully: **a successful
workflow is not a verified historical claim or a promise that a report exists**.
The actual corpus and PDF bytes are not sent through the mission-status route.

Requires companion N7 bot PR (private repository), reviewed merges, and
a production bridge smoke test. No Plesk rollout happens from this PR.

## Status boundaries

`DISCOVERY_FINISHED` means **the four assignments returned**. It does not
mean the question was answered, sources were inspected, or historical facts
were established. Review the original evidence and run the existing
verification pipeline before preparing a publication or scholarly report.
