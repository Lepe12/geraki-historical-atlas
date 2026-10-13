# JARVIS — Piratecartography Multi-Agent Orchestrator

## Purpose

JARVIS is the supervisory layer above the existing 10 research agents.

It does **not** replace them and it does **not** perform historical research by itself.
Its job is to coordinate work, prevent duplicate effort, enforce provenance/quality gates,
and decide what should be promoted into the Piratecartography research corpus.

## High-level architecture

```
JARVIS Manager
   |
   +-- Planner / Dispatcher
   |      +-- Agent 1
   |      +-- Agent 2
   |      +-- ...
   |      +-- Agent 10
   |
   +-- Deduplication Gate
   +-- Provenance / Quality Gate
   +-- Retry / Reassignment Engine
   +-- Audit Log
   |
   +-- Piratecartography MariaDB
   +-- GitHub evidence/artifact storage
```

## Responsibilities

### 1. Planning and dispatch
JARVIS receives a research objective, splits it into bounded tasks, assigns each task to
the most suitable research agent, and records the assignment before execution.

### 2. Duplicate-work prevention
Before creating a new task, JARVIS checks whether an equivalent or near-equivalent task
already exists, is running, or has already produced usable evidence.

### 3. Provenance enforcement
Every accepted result must preserve:
- originating agent
- source/archive/library
- stable source identifier or URL when available
- retrieval timestamp
- research job/task identifier
- evidence status
- confidence/quality state
- links to stored artifacts where applicable

JARVIS must never convert a candidate source or candidate event into a verified historical
claim merely because an automated process completed successfully.

### 4. Quality gates
Results are classified into states such as:
- CANDIDATE
- NEEDS_REVIEW
- VERIFIED
- REJECTED
- DUPLICATE
- UNRESOLVED

Promotion to VERIFIED must require explicit evidence rules and should remain reversible.

### 5. Retry and reassignment
If an agent fails, returns weak evidence, or times out, JARVIS may:
- retry the same agent once
- reassign to a second agent
- split the task into narrower subtasks
- escalate to human review

### 6. Auditability
Every orchestration decision must be written to an append-only audit record:
- who/what initiated the task
- which agent received it
- why it was assigned
- result status
- quality-gate decision
- retry/reassignment history
- final disposition

## Safety boundaries

JARVIS must not:
- expose MariaDB directly to the public internet
- store credentials in GitHub
- access WordPress files or the WordPress database
- modify GitHub Actions/secrets without explicit authorization
- give research agents broad server permissions
- silently rewrite or discard provenance
- treat technical success as historical verification

## Rollout plan

### Phase 1 — Observer mode
JARVIS reads task/result metadata and emits decisions without changing live agent behavior.

### Phase 2 — Advisory mode
JARVIS proposes assignments, deduplication decisions, and review flags.

### Phase 3 — Controlled dispatch
JARVIS creates/reassigns research tasks, while result promotion remains gated.

### Phase 4 — Full orchestration
JARVIS coordinates all 10 agents with automatic retry, deduplication, audit logging, and
quality-gated storage.

## Initial acceptance criteria

JARVIS is ready for live use only when all of the following are true:
1. Existing 10-agent storage continues unchanged.
2. A duplicate research request is detected before a second agent is dispatched.
3. Every dispatch creates an audit record.
4. A failed agent can be reassigned without losing the original provenance.
5. Candidate evidence cannot be silently promoted to VERIFIED.
6. JARVIS can be disabled without disrupting the 10 agents.
7. No WordPress, Plesk credentials, secrets, or unrelated repositories are required.

## Recommended first live mode

Start with **Observer Mode** for several cycles. Compare JARVIS decisions with the current
10-agent workflow. Only after the audit log shows stable, sensible assignments and no data
loss should controlled dispatch be enabled.
