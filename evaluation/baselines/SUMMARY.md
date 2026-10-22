# Baseline scores / Βασικές μετρήσεις (eval set v1.0.0, scored offline 2026-10-22)

Runs were entity-level missions, so each was scored against the eval items whose entity matches its target
(the exact question wording differs). Reproduce with `python3 evaluation/score_run.py --run <id> --item <item>`.

| run | target | item | status | claims/excerpts | precision | recall | recall incl. excerpts | halluc. cites | merge/split err | namesake passages / evidence | honesty | result |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 39240619780 | Πέτρος Λάντζας | ID-01-lantzas-aliases | SOURCE_DOSSIER_AVAILABLE | 0/31 | None | 0.0 | 1.0 | 0 | 3/0 | 8/31 | HONEST_EMPTY | FAIL |
| 39240619780 | Πέτρος Λάντζας | ID-02-lanza-namesakes | SOURCE_DOSSIER_AVAILABLE | 0/31 | None | 0.0 | 1.0 | 0 | 3/0 | 8/31 | HONEST_EMPTY | FAIL |
| 39240619780 | Πέτρος Λάντζας | FC-03-lantzas-1596-arrest | SOURCE_DOSSIER_AVAILABLE | 0/31 | None | 0.0 | 0.0 | 0 | 0/0 | 0/31 | HONEST_EMPTY | FAIL |
| 39304929906 | Ιωάννης Καψής | ID-03-kapsis-aliases | EXTRACTION_FAILED_OR_UNSUPPORTED | 0/0 | None | 0.0 | 0.0 | 0 | 0/0 | 4/13 | HONEST_EMPTY | FAIL |
| 39304929906 | Ιωάννης Καψής | FC-01-capsi-hanged-1680 | EXTRACTION_FAILED_OR_UNSUPPORTED | 0/0 | None | 0.0 | 0.0 | 0 | 0/0 | 4/13 | HONEST_EMPTY | FAIL |
| 39304929906 | Ιωάννης Καψής | SY-02-kapsis-kingdom | EXTRACTION_FAILED_OR_UNSUPPORTED | 0/0 | None | 0.0 | 0.0 | 0 | 0/0 | 4/13 | HONEST_EMPTY | FAIL |
| 39304929906 | Ιωάννης Καψής | CT-02-kapsis-origin | EXTRACTION_FAILED_OR_UNSUPPORTED | 0/0 | None | None | None | 0 | 0/0 | 4/13 | HONEST_EMPTY | FAIL |
| 39304933066 | Μήλος | SY-01-milos-1660-1680 | FINAL_ANSWER_REVIEW_FAILED | 2/0 | 1.0 | 0.0 | 0.0 | 0 | 0/0 | 0/13 | HONEST_EMPTY | FAIL |
| 39477311589 | Πέτρος Λάντζας | ID-01-lantzas-aliases | MODEL_ANSWER_PENDING_HUMAN_REVIEW | 3/0 | 0.67 | 0.5 | 0.5 | 0 | 0/0 | 0/2 | ANSWERED | PASS |
| 39477311589 | Πέτρος Λάντζας | ID-02-lanza-namesakes | MODEL_ANSWER_PENDING_HUMAN_REVIEW | 3/0 | 1.0 | 1.0 | 1.0 | 0 | 0/0 | 0/2 | ANSWERED | PASS |
| 39477311589 | Πέτρος Λάντζας | FC-03-lantzas-1596-arrest | MODEL_ANSWER_PENDING_HUMAN_REVIEW | 3/0 | 0.67 | 0.0 | 0.0 | 0 | 0/0 | 0/2 | ASSERTIVE_WITHOUT_EXPECTED_CONTENT | FAIL |
| 39546422037 | Pedro Lanza | ID-01-lantzas-aliases | INSUFFICIENT_ACQUIRED_EVIDENCE | 0/0 | None | 0.0 | 0.0 | 0 | 0/0 | 0/0 | HONEST_EMPTY | FAIL |
| 39546422037 | Pedro Lanza | ID-02-lanza-namesakes | INSUFFICIENT_ACQUIRED_EVIDENCE | 0/0 | None | 0.0 | 0.0 | 0 | 0/0 | 0/0 | HONEST_EMPTY | FAIL |
| 39546422037 | Pedro Lanza | FC-03-lantzas-1596-arrest | INSUFFICIENT_ACQUIRED_EVIDENCE | 0/0 | None | 0.0 | 0.0 | 0 | 0/0 | 0/0 | HONEST_EMPTY | FAIL |

## Biggest failures / Μεγαλύτερες αποτυχίες

1. **Retrieval succeeds, extraction fails (Καψής, 39304929906).** Saulger 1698 (the main primary source) was in the
   discoveries, but no Saulger passage reached the 13 evidence passages; 4 of 13 were modern namesakes from the Greek
   Government Gazette (ΦΕΚ 1987-1999: a deputy minister and an MP called Ιωάννης Καψής). 0 claims, recall 0 on all Kapsis items.
2. **Pedro Lanza run (39546422037)**: 778 discoveries (9 TARGET_MATCH, 80 POSSIBLE_TARGET) but 0 evidence passages and neither
   Floristán 2005 nor Gürkan 2014 among them. The answer is honest (INSUFFICIENT_ACQUIRED_EVIDENCE) but empty.
3. **Dossier without synthesis (39240619780)**: the excerpts do contain the gold facts (evidence recall 1.0 for ID-01/ID-02),
   but none became a claim (claim recall 0); 3 excerpts were taken from the namesake Pietro Lanza Di Scalea, and 8 of 31 evidence passages matched namesake markers (4 Di Scalea, 4 from the 1897 «La querela di parte»).
4. **Milos (39304933066)**: the only claims are trivial ("Milo is an island"); none of Capsi, Camillo, the corsair fair or
   Creveliers was found. Saulger was discovered, Tournefort and Koutzakiotis were not.
5. **Best run (39477311589)** passes ID-01/ID-02: correct Floristán and Gürkan claims, no merge of Lantzas/Lanza, and the
   identity question is kept in `unknowns`. It still misses the 1596 imprisonment (FC-03) and the Parga/Corfu identification.
6. Contradiction handling could not be exercised: no past run produced claims on both sides of any CT item.
