# Σύνολο αξιολόγησης έρευνας NABOU//X / NABOU//X research evaluation set

## Ελληνικά

**Τι είναι.** 15 ερωτήματα με **γνωστές απαντήσεις που τεκμηριώνονται από πηγές**. Αφορούν την πειρατεία και την καταδρομή στη Μεσόγειο τον 17ο αιώνα (Λάντζας, Καψής, Creveliers, Μήλος 1660–1680). Το σύνολο ελέγχει τέσσερα πράγματα: ταυτοποίηση προσώπων, ισχυρισμούς με παραπομπές, χειρισμό αντιφάσεων και την έντιμη απάντηση «δεν υπάρχουν επαρκή τεκμήρια».

- `research_eval_set.v1.json`: τα ερωτήματα (`query_el`, `query_en`), η οντότητα με τα ονόματα και τις γραφές της, οι αναμενόμενοι ισχυρισμοί με πηγή, σελίδα και απόσπασμα, οι απαγορευμένοι ισχυρισμοί, οι συνώνυμοι (namesakes) και τα κριτήρια επιτυχίας. Στο τέλος υπάρχει η λίστα `dropped_for_lack_of_verifiable_source`, με όσα αφαιρέθηκαν επειδή δεν επαληθεύτηκαν.
- `score_run.py`: βαθμολογεί **offline** μια υπάρχουσα εκτέλεση. Δέχεται είτε `command-center/live/runs/<id>.json` είτε σκέτο `answer.json`. Δεν καλεί δίκτυο και δεν καλεί το backend.
- `test_score_run.py`: unit tests.
- `baselines/`: βαθμολογίες παλαιών εκτελέσεων και το `SUMMARY.md`.

**Κανόνας.** Κάθε αναμενόμενο στοιχείο προέρχεται από πηγή που ανοίχτηκε πραγματικά: Saulger 1698 (εικόνες σελίδων BSB), Tournefort 1718 (OCR archive.org), Floristán 2005, Gürkan 2014, Κουτζακιώτης 2023 (περίληψη), Στούκας 2018 και Greeka. Οι δύο τελευταίες είναι μόνο χαμηλής εμπιστοσύνης και χρησιμοποιούνται για τις αντιφάσεις. Ό,τι δεν επαληθεύτηκε έχει αφαιρεθεί ή έχει γίνει ερώτημα-παγίδα.

**Χρήση.**
```
python3 evaluation/score_run.py --run 39477311589 --item ID-01-lantzas-aliases --item ID-02-lanza-namesakes
python3 evaluation/score_run.py --run path/answer.json --item SY-01-milos-1660-1680 --out report.json --strict
python3 -m unittest discover -s evaluation -p 'test_*.py'
```

## English

**Metrics** (per item, computed from the real run fields `research_answer.claims[*].statement/quote/evidence_id/source_occurrences[*].url`, `answer_sections`, `unknowns`, `status`, `evidence`, `discoveries`, `contradictions.records`):

| metric | meaning |
|---|---|
| `cited_claim_precision` | Share of asserted claims that pass three checks: the citation is valid, the claim is about the item's entity, and it is neither a namesake nor a forbidden claim. A valid citation means the URL or `evidence_id` exists in the run and the quote is found in the evidence text. |
| `hallucinated_citations` | Claims that cite a URL absent from the run's discoveries/evidence, or an `evidence_id` absent from `research_answer.evidence`. |
| `quotes_not_in_evidence` | Claims whose quote is not in the cited evidence passage. |
| `must_find_recall` | Share of `expected_claims` matched by at least one validly cited **claim**. |
| `must_find_recall_incl_excerpts` | The same, but also counting raw `acquired_excerpt` dossier entries. It separates "found but not synthesised" from "not found". |
| `identity_merge_errors` | Claims that match a namesake marker, plus claims or answer sections that assert an `unresolved_pairs` identity without hedging. |
| `identity_split_errors` | Aliases that the set treats as the same person, but that the run lists in `unknowns` as possibly different people. |
| `forbidden_claims` | Matches of `forbidden_claims` in claims or in unhedged answer sections. |
| `honest_insufficiency` / `honesty_label` | For trap items, true when no forbidden claim appears and the run reports insufficiency or makes no relevant claim. For other items, an empty answer counts as honest only when the status does not present a final answer. |
| `contradiction.result` | `BOTH_SIDES`, `ONE_SIDE` or `NONE`. Both sides are searched in the cited claims and excerpts and in `contradictions.records`. |
| `gold_sources_discovered` | Diagnostic: whether the gold sources appear anywhere in the run's discoveries/evidence. It tells retrieval failure apart from extraction failure. |
| `evidence_passages_namesake` | Diagnostic: evidence passages that match namesake markers. |

Matching is substring-based on accent-, case- and final-sigma-normalised text. Each matcher is a list of groups, and every group needs one hit. It is deliberately conservative. A synthesised answer in different wording will be missed unless the matcher lists that wording, so extend the matchers rather than loosen the pass criteria.

**Item types:** 4 identity, 3 fact-with-citation, 3 contradiction, 3 negative/trap, 2 synthesis. The final target question is `SY-01`: «Ερεύνησε τη δραστηριότητα πειρατών στη Μήλο μεταξύ 1660 και 1680».

## Υπό έγκριση: `research_eval_set.v2.pending.json` / Pending v2 draft

**Ελληνικά.** Πρόχειρη επέκταση σε 28 ερωτήματα (τα 15 του v1 + 9 νέα με πηγή + 4 χωρίς απάντηση). Κάθε ερώτημα έχει `review_status`: `PROPOSED` (η απάντηση στηρίζεται σε πηγή που ανοίχτηκε και περιμένει έγκριση από τον ιστορικό) ή `NEEDS_HISTORIAN` (μόνο ερώτηση, χωρίς απάντηση, `scorable: false`). Το `score_run.py` **δεν** διαβάζει αυτό το αρχείο από προεπιλογή· διαβάζει μόνο το v1. Μετά την έγκριση, τα εγκεκριμένα περνάνε σε `research_eval_set.v2.json`.

**English.** Draft expansion to 28 items. `score_run.py` keeps `DEFAULT_EVAL = research_eval_set.v1.json`; this file is used only with `--eval evaluation/research_eval_set.v2.pending.json`. `NEEDS_HISTORIAN` items have no gold and must not be counted (they trivially "pass"). New sources: Tournefort 1718 OCR (Argentiere, Antimilo, Siphanto, Capuchins), Osborne collection vol. 2 (Cerigo), AURA Suppl. 14 (Koutsouflakis on Manetas/Phournoi; Pantzouris quoting Roberts/Hacke 1699). Page numbers marked "~" are from OCR running heads and must be checked on the page images.

**Έλεγχος ιστορικού, 2026-10-28.** Ο ιστορικός ([Lepe12](https://github.com/Lepe12)) έλεγξε και τα 28 ερωτήματα ένα ένα. Τα 22 είναι `USER_VALIDATED`, τα 2 `USER_CORRECTED` και τα 4 μένουν `NEEDS_HISTORIAN` (`scorable: false`). Κάθε ερώτημα έχει πεδίο `human_review` (verdict, reviewer, review_date, correction). Οι δύο διορθώσεις: στο `CT-03-kapsis-dates` κρατάμε μόνο τον Saulger 1698 (περίπου 1677–1680, κρέμασμα το 1680), και αφαιρούνται η Greeka και το «Γεώργιος». Στο `SY-02-kapsis-kingdom` ο Καψής δεν εξουδετέρωσε τον Armeni, αλλά παντρεύτηκε την κόρη του. Η σελίδα του Saulger (σ. 319–323) μένει να επιβεβαιωθεί.

**Historian review, 2026-10-28.** All 28 items were reviewed: 22 `USER_VALIDATED`, 2 `USER_CORRECTED` (CT-03: Saulger-only gold, Greeka removed, so the item is now `fact_with_citation`; SY-02: `armeni-secured` replaced by `armeni-daughter-married`, plus forbidden `armeni-neutralised`), and 4 `NEEDS_HISTORIAN`, which are not scored. `score_run.py` still defaults to v1.
