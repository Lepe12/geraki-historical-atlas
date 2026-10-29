Recorded Internet Archive advanced-search responses (4 docs each) used
by tools/connectors/test_open_collections.py. Recorded 2026-10-29 from:

- ia_rumsey_cerigo.json: q=collection:david-rumsey-map-collection AND ("Cerigo")
- ia_texts_milo_1500_1800.json: q=mediatype:texts AND ("Milo") AND year:[1500 TO 1800]

Requested with rows=4; response bodies are unmodified (no metadata edited).

Added 2026-10-29 for tools/connectors/test_open_collections_extra.py (bodies unmodified):

- gallica_{cerigo,milo}_1450_1900.xml: https://catalogue.bnf.fr/api/SRU, recordSchema=unimarcXchange,
  maximumRecords=4, query=bib.anywhere all "<name>" and bib.digitized all "freeAccess"
  and bib.publicationdate within "1450 1900"
- europeana_{cerigo,milo}_1450_1900.json: https://api.europeana.eu/record/v2/search.json,
  query="<name>", qf=YEAR:[1450 TO 1900], rows=4, profile=standard, recorded with the public
  demo key api2demo (the only key value that appears in them)
- hathitrust_ia_{cerigo,milo}_oclc.json: archive.org advancedsearch,
  q=mediatype:texts AND ("<name>") AND oclc-id:* AND year:[1450 TO 1900], rows=6
- hathitrust_bib_{cerigo,milo}.json: https://catalog.hathitrust.org/api/volumes/brief/json/oclc:…|…
  for the OCLC numbers in the matching IA response
