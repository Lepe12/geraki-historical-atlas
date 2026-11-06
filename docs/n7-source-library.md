# N7 permanent source library

Open **Βιβλιοθήκη** in the existing authenticated N7 sidebar. Upload a PDF, TXT or MD file, set title/author/year/aliases and optionally the offset between physical PDF pages and printed pages. Physical page numbers remain explicit; the application does not guess printed pagination.

## Storage and processing

- Originals remain in the owner's private `DATA_DIR/n7-source-library`, outside the public web directory and GitHub repository.
- Files up to 100 MiB are uploaded in 1 MiB chunks, with stored progress, idempotent retries and SHA-256 verification. Select the same original again to resume an interrupted upload.
- PDF text is extracted in batches of eight physical pages, up to 5,000 pages. A lease prevents two server processes claiming the same job. Restarted processes resume from the persisted cursor. Oversized individual pages are explicitly marked as truncated rather than silently described as fully read.
- A dedicated worker has memory/time limits. Existing small chat PDF handling remains separate. The PDF.js runtime installed by the document-reading deployment is reused.
- Extracted pages and their text hashes are saved atomically. An append-only index uses the latest page revision. Manual corrections retain previous versions. Export returns metadata, provenance and extracted text; the original remains private on the server.
- Readable PDF/TXT/MD chat attachments are also registered as sources. Successfully read web articles are stored as bounded web excerpts, not labelled as paginated books.

## Scanned books

After text extraction, **Έναρξη / Συνέχεια OCR** renders pending pages locally in the browser and sends at most three labelled images per request to the model already configured in N7. Progress is saved after each batch. Reopening the library retrieves the private original in chunks and continues with pending pages.

The browser tab must remain open for rendering/OCR. Digital text extraction runs on the server. Provider limits or a closed tab stop further visual batches without discarding completed work. An OCR draft is never labelled as human-reviewed. Use **Σελίδα / Έλεγχος** to correct and confirm it. Empty pages and difficult manuscripts require review; no handwriting-accuracy guarantee is implied.

## Retrieval and evidence

The private index is searched for every chat, independently of the conversation that imported the source. Greek diacritics and configured name variants improve matching without changing the stored original text. A title or author match alone cannot substitute for missing topical content. Explicit page requests select that page within the matching source.

Answers receive literal selected excerpts with stable source IDs, original/text hashes, physical pages and optional owner-configured printed pages. The source footer supplies deterministic excerpts. Invalid citation IDs and nonmatching Greek quotation-mark excerpts are flagged. Potential incompatible birth/death dates for the current Lantzas identity are marked unresolved. These checks establish reference/quotation provenance; they do not certify the historical truth of every model-generated sentence.

Europeana tries historical name variants in parallel, removes clear Mario Lanza / Lanza di Trabia namesakes and marks ambiguous records as identity-unverified. Catalogue metadata remain distinct from read text.

## Integration and deployment

The library RPC uses the reserved conversation ID `00000000-0000-4000-8000-000000000007` on the existing stream endpoint, inheriting its session and origin guards. It does not create a public unauthenticated book-serving route. The deployment checks that this endpoint returns 401 without authentication, stages helper dependencies before consumers, preserves the existing interface, versions the new sidebar script and rolls back changed application files on failed verification. Library data are not part of deployment replacement or rollback.

`n7-source-library.yml` tests real extraction beyond the old 80-page cap, upload/restart recovery, OCR interruption/resumption, name variants, exact quotations, revision retention and retrieval in a fresh conversation, alongside existing N7 regressions.
