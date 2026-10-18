# NABOU//X × Darwin experiment

This directory is intentionally isolated from the production NABOU//X frontend and live backend.

## Purpose

Use Darwin Agents to test whether an evolving historical-research prompt can improve measurable research quality without weakening source discipline.

Production behavior is unchanged.

## Safety model

- human approval is required before a challenger enters an A/B test;
- no permanent NABOU memory writes are performed here;
- evolution uses a Pareto gate;
- empirical-Bernstein confidence gating is enabled;
- the frozen task set must stay unchanged during a comparison;
- provenance, identity resolution, claim/evidence fit and uncertainty calibration are non-regression dimensions.

## Files

- `agents/nabou-historian.ts` — experimental historical agent definition.
- `critics/historical-rubric.md` — NABOU-specific scientific evaluation criteria.
- `frozen-tasks.json` — ten fixed historical test tasks.

## Run locally

Requires Node.js 20+ and one supported Darwin model provider.

```bash
cd darwin-nabou
npm install
```

Set either `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` (or use a supported local/CLI provider).

The first experimental runs should be kept outside production. Do not merge this branch until:
1. the package installs cleanly,
2. the custom agent is recognized by the installed Darwin version,
3. the ten frozen tasks complete,
4. baseline vs challenger scores are exported,
5. a human reviews the proposed prompt diff.

## Acceptance criteria

A Darwin challenger is useful for NABOU only if it improves aggregate performance while producing no meaningful regression in:
- source provenance,
- identity resolution,
- claim-evidence correspondence,
- uncertainty calibration.

A higher prose-quality score alone is not sufficient.
