# NABOU research engine: observed integration status, 19 October 2026

UI, colours and 3D renderer were not changed. Software implementation, isolated tests,
production deployment and historical verification are separate results below.

## Confirmed failure and repair

The real acquisition-recovery run [39303631458](https://github.com/Lepe12/geraki-historical-atlas/actions/runs/39303631458)
acquired source bytes but failed in `event_first_search.py`. A new CLI regression
reproduced `KeyError: place_match`: thematic section findings need not contain a
named place, whereas the deduplication code required one. The repaired key uses the
actual excerpt and locator without inventing a name.

The actual retry [39306603643](https://github.com/Lepe12/geraki-historical-atlas/actions/runs/39306603643)
completed acquisition, thematic extraction and manifest generation. Its durable
receipt records 11 acquired source texts: nine PDFs and two page images processed
with OCR; one other lead remains unresolved. The thematic stage returned one
candidate and 256 passages requiring further examination. These are not 257
verified historical facts, nor a new exhaustive discovery campaign: this run
reacquired eligible leads from the earlier fresh discovery.

Two-column PDFs previously used Poppler `-layout`, joining unrelated narratives
and potentially their dates on the same line. New acquisition and server replay
use Poppler reading order. An actual two-column PDF regression exercises both
paths. Existing indexed source text and locators remain unchanged. New extraction
receipts record original PDF hash, derived text hash, order and extractor version.
Reading order still requires checking for unusual layouts.

OCR previously depended on a `configs/tsv` file that is absent when a deployment
uses standalone pinned language models. Tesseract could exit successfully with
plain text, which the TSV parser interpreted as no words. Explicit TSV output
configuration fixes that observed failure. An actual image-only PDF now returns
three words, pixel boxes and an OCR confidence of approximately 96.3 in the test.
This English fixture does not measure Greek OCR accuracy. A separate generated Greek-capital image fixture misread the toponym ΜΗΛΟΣ as MHAO%; its actual output and controlled character error rate are retained in `controlled-greek-ocr.json`. This identifies a remaining OCR-quality limitation and is not an accuracy estimate for historical documents. Handwriting recognition
remains unsupported; no HTR model was installed or evaluated.

## Semantic extraction and review

Actual local CPU inference uses official checksum-pinned Qwen2.5-7B-Instruct GGUF
weights, without a paid API or embedded key. A successful model invocation is not
an accepted research answer.

Run 39303631533 produced four text-grounded proposed claims, but the reviewer
explicitly judged only two and omitted the two Astypalaia claims. The pipeline
correctly published no answer. The repair requires an explicit indexed decision
for every claim, validates uniqueness and bounds, and allows one bounded repair
call for omissions. Silence never means approval. The final synthesized paragraphs
also undergo a separate source-grounded review. The next actual retry is
[39306603837](https://github.com/Lepe12/geraki-historical-atlas/actions/runs/39306603837);
its completion and resulting answer must be inspected before claiming acceptance.

Person research is now assessed by supported, cited person claims. It is not
rejected merely because a biography lacks geographic findings. Geographic
questions still require supported place findings. Quotes, dates, namesakes and
unsupported verification promotions retain their independent gates.

## Persistent evidence and research graph

The existing canonical host-local PHP importer now consumes source-replayed
bundles and citation-backed graphs. No new backend or database was created for
production. Model support, source class, interpretation and hypothesis remain
separate from operator review and historical verification. Rejected or undecided
model proposals remain explicitly labelled in the immutable bundle. Graph nodes
use content snapshots so later model decisions cannot overwrite earlier ones.

Actual isolated MariaDB 11.4.13 checks passed for additive migration, source/citation
foreign keys, transactional rollback, immutable candidates, audited review and
retraction, graph persistence, and readback after a database restart. Actual PHP/PDO
checks passed for checksum replay, idempotent import and full backup restoration
into a separate disposable test database.

A separate test imported four real model proposals from three actual acquired
sources, replayed six exact citations and confirmed that repeating the import
inserted zero duplicates. Every proposal remained UNREVIEWED and zero became
historically VERIFIED. This demonstrates byte replay and persistence, including
retention of unsupported proposals; it does not reverse the failed semantic
acceptance of that input run. Machine receipts are in
`evidence/integration_validation/2026-10-19/`.

## Live connector evidence

The report [39306892023](https://github.com/Lepe12/geraki-historical-atlas/blob/main/evidence/engine_validation/39306892023/endpoint-report.json)
contains actual endpoints, HTTP status, request method, errors and returned records.
Counts refer to bounded catalogue pages, not full books or independent witnesses.

| Connector | Actual native result |
|---|---|
| OpenArchives / EKT | HTTP 200; 25 records for πειρατεία |
| National Library of Greece | HTTP 200; two records for χειρόγραφο |
| More Veneto | HTTP 200 descriptive GraphQL search; zero corsari matches; positive control Venezia returns 20 of 3,237 |
| SearchCulture | HTTP 200 with existing repository secret; 50 returned records |
| Anemi | HTTP 200; real form returns one πειρατεία result and 853 Κρήτη results, but the current record parser drops the links; repair still under investigation |
| SIAS | Latest browser request times out without HTTP response; an earlier live request returned catalogue records; current availability is not confirmed |
| PARES / Simancas | Latest HTTP 429, now correctly rate-limited; earlier successful requests confirmed Simancas record descriptions |
| Google Books | Native HTTP 429; independent BnF catalogue fallback returns nine records |
| Academia.edu | Native HTTP 403; independent Crossref/OpenAlex fallback returns 40 records; no native access claimed |
| BOA | HTTP 200 researcher login/CAPTCHA page; search was not performed |

No CAPTCHA, authentication or provider quota was bypassed. A 200 login page is
not catalogue access. An empty query result is not proof of absence of historical
material. Current connector output must be checked again after each repair.

## Production and acceptance limits

The checksum-pinned Plesk deployment package includes backup, additive migration,
atomic replacement and rollback. Isolated package installation, rollback and
corrupted-download rejection pass. These tests do not execute production migration.

The actual production probe [39306604015](https://github.com/Lepe12/geraki-historical-atlas/blob/main/evidence/production_smoke/39306604015/report.json)
returns evidence GET 404, unsigned upload 415, unsigned review 400, signed agent
search 404. Production acceptance is BLOCKED. This environment has no bound Plesk
management/SSH connection, so neither production installation nor production
backup/migration is claimed. Existing research API secrets do not establish host
management access.

Four fresh research cases are executing under
[39304821565](https://github.com/Lepe12/geraki-historical-atlas/actions/runs/39304821565):
Lantzas, Kapsis, Milos 1660–1680, and Eastern Mediterranean corsair-base toponyms
1600–1700. Final per-case artifacts and pipeline reports are required. Independent
annotated ground truth is absent, so precision, exhaustive recall, citation fidelity
and OCR error rates remain unmeasured, not invented percentages.

GIS currently supports source-cited temporal gazetteer/alias exports, uncertainty,
null unresolved coordinates and schematic cited routes. Georeferenced portolan
registration, a populated historical gazetteer, HTR, independently established
source genealogy, and comparisons against independent baselines remain incomplete.
JSON-LD uses the local vocabulary with Schema.org/PROV; PLATO conformance is not
claimed. The full university-research integration is not complete while these
requirements or real semantic/production acceptance remain unresolved.
