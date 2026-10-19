# Model-assisted research answer

The parallel research workflow now calls `tools/semantic_research_answer.py` after durable lane outputs and before snapshot publication. `Research Semantic Answer` can also process an existing run, avoiding another discovery run when configuration is added.

The pipeline uses the existing OpenAI-compatible client and three existing roles: evidence extractor, adversarial reviewer and synthesis. It selects at most three batches of 14,000 JSON characters, then performs one review and one synthesis call: at most five model calls per execution. Deferred passages are explicitly reported. No account, billing or provider is automatically provisioned. The existing provider must support the client's `/chat/completions` request format and the selected model's token/temperature parameters.

## Configuration

Save the provider key in the repository **Actions secret** `PCT_LLM_API_KEY`, never in code, chat, logs or repository variables. Configure non-secret repository **Actions variables**:

| Variable | Meaning |
| --- | --- |
| `PCT_LLM_PROVIDER` | `openai_compatible` (workflow default) |
| `PCT_LLM_BASE_URL` | Provider's HTTPS API base URL, including its API version path when required |
| `PCT_LLM_MODEL` | Model identifier supplied by the provider |
| `PCT_LLM_EXTRACTOR_MODEL` | Optional role-specific override |
| `PCT_LLM_ADVERSARIAL_MODEL` | Optional role-specific override |
| `PCT_LLM_SYNTHESIS_MODEL` | Optional role-specific override |

All three roles can use `PCT_LLM_MODEL`. Missing model configuration produces an extractive source dossier when replayable passages are available, with no model calls; otherwise it reports insufficient acquired evidence. Explicit model-required preflight still reports `BLOCKED_CONFIGURATION`. Provider failure or rejected citations never turns into a fabricated successful answer. Setting these variables does not prove model execution; inspect the actual preserved report after a run.

## Evidence and validation

- Only source-attributed acquired-text findings with a replayable file/hash/character range can enter model evidence.
- Identical normalized paragraphs are grouped across URLs/lanes, retaining all occurrences. This is duplicate handling, not proof of common genealogy or independent corroboration.
- Extraction must supply a known evidence ID and an exact contiguous quote. Actors, places and dates must occur in supplied evidence; invented values and verification flags are rejected.
- The second model pass challenges claims and flags possible contradictions. Unknown or malformed claim references fail closed.
- Each answer paragraph must reference accepted, model-reviewed claim IDs. Its actual source URL and exact acquired excerpt are displayed in Results.
- Source quotation support is checked mechanically; semantic entailment and historical truth still require review. Model review is not human review or original inspection.
- Scientific candidate states, original inspection, controlled extraction, genealogy, corroboration and HUMAN_REVIEW/VERIFIED gates are not promoted by this module.

Reports persist under `evidence/runs/<run_id>/research_answer/answer.json` and `answer.md`, and enter the command-center snapshot. The UI displays a pending-review answer with expandable sources, or an explicit unavailable/configuration state. No 3D core or visual style changes are part of this integration.

Tests use simulated model responses and must not be reported as proof of a real provider call. Production acceptance requires a configured provider, successful recorded calls, valid cited output, a preserved report and the live UI result.

## Source dossier without a model

When model configuration is absent, the same runner now produces
`SOURCE_DOSSIER_AVAILABLE` using only exact passages replayed against acquired
text and its SHA-256. It makes no model calls and requires no additional model
subscription or API key. Sections contain source titles, quotations, stored
locators, links, uncertainties and recorded date indications. Identical passages
are grouped; repeated occurrences do not establish independent testimony.
Modern Latin namesakes of a requested Greek identity are held separately when
modern dates are present and the supplied Greek name is absent. This is a
conservative review hold, not a final exclusion or historical identity decision.

These entries have `kind=acquired_excerpt`, `model_analysis=false`, and
`verified=false`; they are not newly inferred historical claims. No suitable
passages produces `INSUFFICIENT_ACQUIRED_EVIDENCE`. The snapshot reports the
available dossier as `PARTIAL`, without marking historical research complete.
Acquired quotations retain original OCR, including mistakes. This mode does not
translate, establish source independence, infer relationships, or adjudicate
contradictions. Existing optional model analysis remains available when configured.
