# JARVIS live observer adapter — legacy diagnostic

**Status: retained diagnostic component, not the current JARVIS operating mode.**

The current JARVIS policy is `controlled_dispatch`; see `docs/JARVIS_CONTROLLED_DISPATCH.md` and `tools/orchestrator/jarvis_policy.json`.

The observer adapter remains useful because it performs a read-only interpretation of durable Piratecartography run artifacts without dispatching agents or changing evidence.

It reads:

- `evidence/runs/<run_id>/SYSTEM_HEALTH.json`
- `evidence/runs/<run_id>/MARIADB_STORAGE_INTENT.json`

It understands the current **11 research lanes** and reports lane status, blockers, repository errors, candidate counts, verified-event counts and MariaDB persistence intent.

Run:

```bash
python3 tools/orchestrator/jarvis_observer.py
python3 tools/orchestrator/jarvis_observer.py --run-id RUN_ID
```

## Safety boundary

The observer does **not** dispatch/cancel research agents, write to MariaDB, change the importer, promote evidence to VERIFIED, or modify WordPress/Plesk/secrets/GitHub settings.

This file is retained for recovery and regression diagnostics. It must not be used to infer that JARVIS is still observer-only.
