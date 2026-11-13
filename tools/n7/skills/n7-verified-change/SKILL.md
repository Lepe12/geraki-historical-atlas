---
name: n7-verified-change
description: Verify N7 coding tasks with test-first debugging, review gates, real source checks and explicit evidence. Use for N7 code changes or Coding Agent quality checks.
---
# N7 verified change

Applies to N7 coding requests, debugging, implementation, and review. This is
a reviewed workflow, not permission to edit the application or run shell tools.

## Actual capabilities first
The built-in N7 Agent has a restricted workspace and a read-only allowlisted
browser. It cannot edit its own source, run a test command, merge a PR, deploy,
or access GitHub through the tools provided by this skill. Never claim those
actions happened. If unavailable, return an executable plan and precise
verification requirements instead of simulated success.

## Sources and safe boundaries
The canonical source is Lepe12/independent-ai-bot. Actual runtime files are
assembled by runtime/recipe.json from canonical sources. Root server.js and
root public/ are legacy fixtures. Preserve live data, private captures,
secrets, library, and the production service. Do not publish private code into
the atlas. Never auto-merge or auto-deploy.

## Workflow
1. Inspect the actual relevant source and existing tests before proposing a fix.
2. Define observable acceptance criteria. For a bug, request a failing
   reproduction test (RED) before the fix; for old untested behavior, require
   characterization tests.
3. Propose the minimum isolated implementation (GREEN), then review any
   refactor for regressions.
4. When an authorized external coding tool is available, run focused tests
   and the relevant full suite; report exact commands, results and environment.
   A command not run is NOT RUN, not PASS.
5. Review correctness, readability, architecture, security, and performance.
6. Prefer an isolated draft PR. Deployment and real production readback are
   separate steps requiring their own proof.

## N7 canonical checks for authorized external coding environments
- npm ci --ignore-scripts --omit=optional
- npm run prepare:pdf
- python3 scripts/build_n7_runtime.py --pdf-runtime tools/n7/vendor
- node --test test/runtime-restore.cjs
- npm test
- python3 -m unittest discover -s test -p 'test_*.py'
- For source changes: npm run update:release, as documented in
  docs/SOURCE-OF-TRUTH.md (do not alter authenticated capture evidence).

## Report
Separate IMPLEMENTED, TESTED, LIVE VERIFIED, and NOT VERIFIED. A synthetic
model fixture does not prove autonomous live coding, historical correctness,
or production deployment.

Adapted from https://github.com/addyosmani/agent-skills methodology:
test-driven-development, code-review-and-quality, and brownfield adoption.
