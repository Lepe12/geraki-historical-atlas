# JARVIS Controlled Dispatch

JARVIS now has a guarded control plane for dispatching a bounded subset of the ten Piratecartography research lanes.

## Active safeguards

- controlled_dispatch mode is enabled
- repository kill switch is available in tools/orchestrator/jarvis_policy.json
- an explicit target is required
- explicit selected agents are required
- maximum JARVIS dispatch is 3 agents at once
- only the ten known lanes are allowed
- duplicate request fingerprints are blocked by the audit store
- every approved dispatch writes an append-only audit record
- no automatic promotion to VERIFIED is allowed
- WordPress, Plesk credentials and GitHub secrets administration remain outside scope

## Execution path

JARVIS Controlled Dispatch validates the request, writes the audit record, then invokes the existing pct-parallel-multi-agent workflow with only the selected lanes. The existing research pipeline preserves evidence and queues the host-local MariaDB storage intent.

Subset runs skip the full ten-lane aggregate gate, while ordinary runs with no selected-agent subset continue to use the full ten-lane health gate.

## Kill switch

Set dispatch.kill_switch to true in tools/orchestrator/jarvis_policy.json. New JARVIS dispatches then fail closed before any agent workflow is launched.
