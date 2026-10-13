# JARVIS live observer adapter

JARVIS is now wired to the **real Piratecartography run artifacts** already
produced by the ten research lanes.

The adapter reads:

- `evidence/runs/<run_id>/SYSTEM_HEALTH.json`
- `evidence/runs/<run_id>/MARIADB_STORAGE_INTENT.json`

These are the same artifacts used to describe lane health and queue host-local
MariaDB persistence.

## Current mode: observer

Run:

```bash
python3 tools/orchestrator/jarvis_observer.py
```

or pin a specific run:

```bash
python3 tools/orchestrator/jarvis_observer.py --run-id 38436190001
```

The generated report contains per-lane status, blockers, repository errors,
candidate counts, verified-event counts, MariaDB persistence intent and JARVIS
readiness recommendations.

### Deliberate safety boundary

This adapter does **not**:

- dispatch or cancel any research agent
- write to MariaDB
- change the five-minute importer
- promote any evidence to VERIFIED
- modify WordPress, Plesk, secrets or GitHub Actions settings

This is the first real integration step: JARVIS sees the actual ten-agent
pipeline and its MariaDB storage state without becoming a new failure point.

The next rollout gate is controlled dispatch, after observer output is checked
against several real runs.
