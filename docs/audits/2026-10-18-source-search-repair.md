# Source search precision and passage retention

The research engine now retains every returned IIIF search passage on the same page instead of keeping only the first hit. Full-text identity matching examines later occurrences and passages before selecting an excerpt, preferring local requested context over a context-free namesake. Separate search highlights cannot manufacture a complete name by being concatenated and treated as catalogue metadata.

A provisional OCR match no longer downgrades an independently matching title/description/subject. Complete names without requested context remain review-required instead of automatically receiving acquisition priority; off-topic penalties are not overridden by OCR. These controls do not establish historical identity or VERIFIED status, and all discoveries remain retained.

The application source filter now searches recorded content and citations rather than serialized internal query/ranking metadata. Greek accents, decomposed Unicode, capitalization, final sigma and query word order are normalized. Multiple search words must all appear in source content. New OCR match reasons have Greek explanations.

Validation:

- 60 Python tests passed across full-text discovery, research focus, reliability, discovery retention, pipeline repairs and semantic answers.
- 21 JavaScript tests passed, including source search normalization, exclusion of query provenance, citation search and existing research lifecycle behavior.
- Offline reassessment of the existing run 39107988812 exercised 708 retained discovery rows, including 57 OCR rows. No records were deleted or promoted to VERIFIED; no existing classifications changed in this particular dataset. This was replay of archived data, not a newly executed external search.
- Browser layout/navigation tests cover desktop and mobile. Added filter checks for accent-free Greek input and a false hit present only in query provenance.

Existing archived reports remain immutable. Engine changes apply to future research runs; the UI search correction applies when the new application is deployed. No new historical research request or database write is part of this repair.
