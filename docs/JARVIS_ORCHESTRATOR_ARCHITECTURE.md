# JARVIS — Piratecartography Multi-Agent Orchestrator

## Current role

JARVIS is the supervisory layer above the **11 geographic/source-family research lanes** and the specialist-agent layer.

It coordinates research; it does not turn automated discovery into historical truth.

## Current architecture

```
Research objective
      |
      v
JARVIS planner / policy / audit
      |
      +-- automatic lane selection (or explicit human override)
      |
      +-- 11 research lanes
      |     Greek / Travellers / Spanish-Simancas / Venetian / French
      |     British / Dutch / German / Italian States / Ottoman / North African
      |
      +-- specialist agents
      |     identity / timeline / contradiction / genealogy / network / biography ...
      |
      v
Discovery + acquisition + event-first extraction
      |
      v
Exact locator -> original inspection -> controlled extraction
      -> source genealogy -> corroboration -> contradiction review
      -> human review -> final verification
      |
      +-- GitHub durable evidence/audit
      +-- MariaDB structured research state
      +-- Command Center read-only operational view
```

## Operating mode

Current executable policy: `tools/orchestrator/jarvis_policy.json`.

The live policy is `controlled_dispatch` with deterministic/auditable automatic lane selection. Observer mode remains as a diagnostic adapter only.

JARVIS widens coverage when context is weak rather than pretending routing certainty.

## Responsibilities

JARVIS may plan/dispatch bounded research, prevent duplicate work, preserve assignment provenance, route to registered connectors, aggregate specialist work, expose blockers and prepare evidence for downstream review.

JARVIS must not:
- promote discovery automatically to VERIFIED;
- erase weak/off-target discoveries merely because they fail acquisition priority;
- expose MariaDB publicly;
- access WordPress or unrelated databases;
- inject secrets into assignments;
- execute arbitrary shell/code through research-agent instructions.

## Evidence boundary

Routing confidence, Research Value and Evidence Confidence are separate concepts. None is a probability that a historical claim is true.

The canonical evidence and verification rules are in `docs/SYSTEM_SPEC.md`, `docs/general-research-doctrine.md` and `docs/HUMAN_REVIEW_VERIFICATION_PROTOCOL.md`.

## Current maturity

Observer/advisory phases are retained as historical rollout stages. Controlled dispatch and automatic lane selection are implemented. Automatic retry/reassignment remains policy-bounded and is not a reason to weaken evidence gates.

The scientific-validation layer is Historical Benchmark v4; production validation results must come from frozen blind runs and independent human review, not from JARVIS itself.
