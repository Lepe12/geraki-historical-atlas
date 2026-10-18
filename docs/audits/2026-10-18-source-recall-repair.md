# Research retrieval and identity context repair

The source engine previously performed its full-text discovery stage only in the travellers lane. It now searches declared IIIF manifests from each lane's own catalogue discoveries. The existing Internet Archive corpus search runs only in travellers, avoiding eleven duplicate corpus searches. Existing per-stage deadlines remain unchanged. A lane without declared manifests records FULLTEXT_TARGETS_UNAVAILABLE rather than implying full-text coverage or absence of references.

Request parsing recognizes explicit reference-finding commands and common Greek polite prefixes, preserving the original question. Short explicit names followed by a trailing date range are separated into target and period. Arbitrary prose remains intact and conflicting dates fail explicitly.

Catalogue and OCR matching now support explicit surname-comma-given-name notation, including supplied Greek inflection forms. Queries include that notation as a retrieval hypothesis, not an attested historical alias. A shared name pattern keeps catalogue and full-text matching consistent and does not combine unrelated authors or highlights.

When the request specifies a place, a generic matching role cannot substitute for that place. A full name with the wrong/missing geographic context remains provisional/review-required. These rules retain sources and do not establish identity or historical verification.

Validation: 75 Python tests across request parsing, research focus, full-text discovery, pipeline repairs, reliability, retention and semantic answers. Tests include a non-travellers lane following its declared manifest through the real IIIF parsing pipeline with controlled transport responses; no duplicate IA request is made. Missing manifests produce explicit unavailable coverage. New regression checks cover polite reference requests, bare-name dates, inverted catalogue names and namesakes with a generic role in a different place.

No new external historical search was dispatched. These changes apply to future research jobs; archived results remain intact. Authenticated or unavailable repositories still require their actual access prerequisites. A specific user query and known missing reference are needed to measure retrieval quality against that example.
