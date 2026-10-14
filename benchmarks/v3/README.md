# Historical Benchmark v3

Benchmark v3 separates three questions that older scoring mixed together:

1. **Did the system retrieve the benchmark case?** — reference-case recall.
2. **How many returned candidates were actually relevant?** — candidate precision.
3. **Was a historical claim itself verified as true?** — only HISTORICAL_GOLD can answer this.

Official candidate precision is calculated only from `HUMAN + FINAL` labels bound to
the exact candidate evidence checksum. AI-assisted retrospective labels are never
accepted as official v3 precision labels.

The current manifest is generated from the latest stored evaluation request for each
benchmark case and the preserved `candidate_events.json` files in `evidence/runs/`.

Relevance and documentary quality are labelled independently. A catalogue record can
be relevant for retrieval while still being `METADATA_ONLY`.

Until human labels exist, v3 intentionally reports `precision: null`. This is a
scientific safeguard, not a failure.
