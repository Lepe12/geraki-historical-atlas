# HISTORICAL_GOLD cases

A HISTORICAL_GOLD case is a benchmark case that has passed both the explicit
human review gate and the separate final verification gate.

Machine discovery, catalogue metadata, OCR, AI inspection, workflow success,
or a source precheck cannot create HISTORICAL_GOLD.

## First candidate

`HG-EXQUEMELIN-PANAMA-1678` uses A. O. Exquemelin's first Dutch edition,
`De Americaensche Zee-Roovers` (Amsterdam, 1678), Library of Congress
LCCN 02017955.

The claim is deliberately narrow: the 1678 source presents the burning of
Panama as an action by English and French buccaneers. The case does not make
derivative translations count as independent corroboration.

Run:

```
python3 tools/historical_gold_case.py \
  --case-dir benchmarks/historical_gold/HG-EXQUEMELIN-PANAMA-1678 \
  --mode prepare
```

This creates a human attestation template and evidence-bound candidate/claim
files. A human must inspect the facsimile and create `human_attestation.json`.
Only then may `--mode validate` emit `HISTORICAL_GOLD.json`.

The validator fails closed if reviewer/verifier names, original inspection,
contradiction assessment, evidence checksums, claim binding or final VERIFY
are missing.
