# Reviewed-claim answer draft

`PCT_SYNTHESIS_MODE=reviewed_claims` copies up to four currently supported claim
statements into cited paragraphs rather than asking a model to rewrite them.
The default remains `model` until the real comparison passes. This is an opt-in
path in the existing engine, not a separate research system.

The source-bound extraction replay, current claim validation, fidelity and
relevance holds, claim model reviews, final answer model review, final paragraph
guards and historical verification gates remain in place. Every copied statement
is attributed to the consulted source; hypotheses, inferences and contextual
claims are labelled. No statement is shortened or translated. Overlong/empty
drafts fall back to model synthesis. Final-review rejection still triggers the
existing correction and fail-closed logic.

The draft reports claims not selected for its four paragraphs; all claims and
source provenance remain in the durable answer. Historical status remains
unverified and human review remains pending. This path produces a concise list
of reviewed findings, rather than a newly written narrative or claim of complete
research coverage.

The synthesis-speed workflow compares both modes using the exact retained public
Sonnini work from run 41437163921. It removes only cached synthesis/final-review
responses, replays extraction and claim review through current validators, and
requires real new final reviews. Timings exclude setup and earlier reading,
which are not the stages being changed. A separate real-model negative control
adds an unsupported dated pirate-base assertion to a cited paragraph and must
be rejected. Different CPU tags, missing reviews, changed claim/provenance
bindings or failed controls invalidate the speed claim. All outputs are durably
published with the existing Git output publisher and readback receipt.
