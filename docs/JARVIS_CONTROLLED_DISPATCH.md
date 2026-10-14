# JARVIS Controlled Dispatch

**Status: current operating policy.**

JARVIS is the routing authority above the Piratecartography research lanes. The user supplies the research objective; JARVIS selects lanes automatically unless an explicit human override is supplied.

## Current policy

Executable source of truth: `tools/orchestrator/jarvis_policy.json`.

- mode: `controlled_dispatch`
- expected research lanes: **11**
- dispatch enabled: yes
- kill switch: available
- explicit target: required
- explicit lane selection: **not required**
- JARVIS automatic selection: enabled
- normal automatic selection: 3–6 lanes according to context
- weak/uncertain context: may widen to all 11 lanes
- explicit broad/exhaustive research request: all 11 lanes
- human lane override: allowed
- absolute policy maximum: 11 parallel lanes
- duplicate-work audit: required
- automatic VERIFIED promotion: forbidden
- arbitrary code/shell/subprocess assignments: forbidden

## Research lanes

`greek`, `travellers`, `spanish_simancas`, `venetian`, `french`, `british`, `dutch`, `german`, `italian_states`, `ottoman`, `north_african`.

## Execution contract

JARVIS validates the request, records the decision and selected lanes, and invokes the existing research pipeline. Scientific evidence gates remain downstream and independent from routing.

Selecting a lane means **search this source family**. It does not mean every named archive within that lane was successfully accessed.

## Kill switch

Set `dispatch.kill_switch` to `true` in `tools/orchestrator/jarvis_policy.json`. New controlled dispatches then fail closed before launch.

## Scientific boundary

JARVIS routing, successful agent execution and repository discovery never imply historical verification.
