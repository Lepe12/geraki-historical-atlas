# Incremental reading and small-extractor comparison

Normal continuations now recover exact saved extraction groups against the
current acquired records before scheduling unread excerpts. Ranking changes
cannot invalidate completed work merely by moving batch boundaries. Text,
source hashes, locators and bibliographic metadata must match. Changed source
bindings are held and require new extraction. Every reused payload still passes
current evidence validation and claim/final-answer review.

The existing response cache remains scoped to the exact question, configuration,
prompt and schema in its checkpoint generation. Stable ordering of synthesis
claims avoids needless cache misses for an unchanged supported claim set, while
newly reviewed claims retain priority. A completed unchanged question can replay
without new extraction, review or synthesis calls; pending reviews are still
performed and are never counted as completed just to improve speed.

The current engine revision is explicitly registered for replay of the existing
raw extraction cache. Extraction prompts are byte-identical to the previous
production prompts; the benchmark fixtures record their hashes. Historical
verification and source-validation gates are not bypassed by compatibility.

## Real model comparison

`research-extraction-speed.yml` runs the existing model boundary with the current
Qwen3-8B baseline and the approved Qwen2.5-3B candidate on the same three frozen
public Sonnini OCR records from research 40857073690 / analysis 41055773411.
It measures actual call time and records raw prompts, raw model outputs, usage,
model/checksum identity, validated proposals and rejected proposals.

The cases cover historical names, merchant anchorage, and an index fragment that
must not establish a corsair base. Qwen3-8B independently reviews the resulting
claims. Positive and negative reviewer controls explicitly check that merchant
shipping does not establish a pirate base or a fabricated date. A candidate must
pass the deterministic fixture checks, current evidence validators and larger
model reviews, and be at least 20% faster to qualify for a broader evaluation.

Three OCR cases are not a general accuracy benchmark. The workflow never changes
active model variables, research pointers or historical verification. Results
are published as diagnostic evidence under evidence/configuration/<run>/, not as
research findings. A faster candidate that fails fidelity stays disabled. GPU
hosting, external inference APIs and paid resources are not enabled here.
