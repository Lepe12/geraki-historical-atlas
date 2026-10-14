# Historical Benchmark v4 — Pilot Validation

Benchmark v4 is the scientific-validation layer for the JARVIS historical research system.

## What changes from v3

v3 separated retrieval recall from candidate precision and correctly refused to invent precision without human labels. v4 adds a stricter validation design:

1. **Blind research execution.** JARVIS receives only the research request in `cases/requests.json`. The expected answer/reference file in `gold/expectations.json` is scoring material and must never be injected into research prompts or routing.
2. **One frozen engine revision for official results.** Older stored runs may be used only as framework/baseline controls. Official metrics require fresh runs bound to one declared engine revision.
3. **Two independent human reviewers plus adjudication.** No AI label and no single-reviewer judgement enters official performance metrics.
4. **Candidate evidence is hash-bound.** Labels become stale if the frozen candidate changes.
5. **Multiple scientific dimensions.** Relevance is distinct from source quality, locator correctness, source genealogy, contradiction detection, claim support and abstention quality.
6. **Discovery is never silently discarded.** Benchmark scoring evaluates scientific use; it does not remove weak or unresolved research leads.

## Pilot set

The pilot contains 10 cases: seven positive reference cases, two negative/adversarial controls, and one open-research Milos case that is intentionally withheld from historical-truth scoring until an independent gold standard exists.

## Metrics

When sufficient adjudicated human labels exist, v4 reports:

- candidate precision;
- reference-case recall;
- negative-control specificity;
- unsupported-claim rate;
- exact-locator accuracy;
- source-genealogy accuracy;
- contradiction-detection rate;
- abstention-quality accuracy;
- inter-reviewer raw agreement and Cohen's kappa.

Metrics remain `null` when their evidence requirements are not met. A successful GitHub Actions run is only pipeline validation, never proof of historical accuracy.

## Fresh-run protocol

Before official scoring, replace the baseline entries in `run_bindings.json` with fresh blind runs of the same declared engine commit and set `baseline_only=false` only after verifying the run manifest and blindness conditions.
