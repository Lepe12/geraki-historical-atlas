# NABOU//X × Darwin experiment

This directory is intentionally isolated from the production NABOU//X frontend and live backend.

## Purpose

Use Darwin Agents first as a frozen offline evaluation harness, then only after review as a prompt-evolution experiment.

Production behavior is unchanged.

## Safety model

- evolution is disabled in the checked-in agent definition;
- no permanent NABOU memory writes are performed here;
- the frozen task set must stay unchanged during a comparison;
- provenance, identity resolution, claim/evidence fit and uncertainty calibration are non-regression dimensions;
- GEPA + Pareto gating + mSPRT confidence settings are preconfigured for a later controlled evolution stage;
- do not enable online mutation until the baseline outputs and critic behaviour have been reviewed.

## Files

- `agents/nabou-historian.ts` — experimental historical agent definition.
- `critics/historical-rubric.md` — NABOU-specific scientific evaluation criteria.
- `frozen-tasks.json` — ten fixed historical test tasks.

## First run

Requires Node.js 20+ and one supported Darwin model provider.

```bash
cd darwin-nabou
npm install
npm run evolution:off
npm run eval
```

Set either `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` (or use another Darwin-supported provider).

The first experimental stage is **evaluation only**. No prompt mutation should be activated yet.

## Gate before evolution

Only move to Darwin evolution after all of the following are true:

1. package installation completes cleanly;
2. `nabou-historian` is discovered by the installed Darwin version;
3. all ten frozen tasks run successfully;
4. outputs are reviewed against `critics/historical-rubric.md`;
5. the baseline is saved;
6. a human explicitly approves starting prompt mutation.

When that gate is approved, evolution can be enabled deliberately; it must not be activated merely because the package is installed.

## Acceptance criteria

A challenger is useful for NABOU only if it improves aggregate performance while producing no meaningful regression in:

- source provenance,
- identity resolution,
- claim-evidence correspondence,
- uncertainty calibration.

A higher prose-quality score alone is not sufficient.
