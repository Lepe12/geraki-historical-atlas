# NABOU//X — Kraken historical handwriting (HTR) pilot

## Scope (2026-10-24)
This is an **opt-in server-side pilot**, not a production HTR success claim.
It extends `server/command-center-live/pdf-evidence.py` for image-only/low-text
PDF pages. It does **not** alter 3D/UI, agent orchestration, database,
historical verification gates, or the browser's PDF Learning upload flow.

Existing behavior remains the default when `PCT_HTR_ENABLED` is unset:
PDF text -> Poppler, image-only pages -> Tesseract OCR.

## When enabled
- Convert a low-text PDF page to PNG using the existing Poppler path.
- Invoke a **locally installed** Kraken 7.x binary with an **explicit, local,
  historically appropriate recognition model** (no auto-download).
- Preserve per-page `method: KRAKEN_HTR`, `htr_status`, `text_sha256`,
  `transcription_review: UNREVIEWED`, and top-level
  `historically_verified: false`.
- If Kraken is absent, times out, fails, or has no output, fall back to the
  existing Tesseract OCR where available. Record the HTR error per page.
- The first 2 low-text pages are eligible (at most 3 with configuration).
  This protects a synchronous backend parser; it is **not** bulk HTR.

## Prerequisites — NOT verified on the current Plesk server
- Python environment and available RAM/CPU sufficient for installed Kraken.
- `kraken` command on the Python worker's PATH.
- Readable and licensed HTR model for the **specific script and period**.
- Poppler (`pdfinfo`, `pdftotext`, `pdftoppm`), as currently required.
- Adequate timeouts and operational isolation before production enablement.

Environment variables (for **staging only** until infrastructure and model
are proven):

```shell
PCT_HTR_ENABLED=1
PCT_HTR_MODEL=/absolute/path/to/a-validated-script-model.mlmodel
PCT_HTR_MAX_PAGES=2
PCT_HTR_MEMORY_MB=4096
```

Do not store HTR models in Git; do not add any credential to the repository.
CLI (Kraken official syntax):

```shell
kraken -i scanned-page.png page.txt --device cpu segment -bl ocr -m /absolute/path/to/model.mlmodel
```

## Verification performed
- Local contract tests with **fake Kraken executable**, checking disabled
  defaults, missing-model behavior, argv and output.
- Local image-only PDF integration test: Poppler renders page, controlled mock
  Kraken produces unreviewed transcription, source SHA remains attached.
- These tests prove code wiring only, **not handwriting recognition accuracy**,
  server resources, or end-to-end production UI operation.

Run again:

```shell
python3 server/command-center-live/test_htr_kraken.py -v
python3 server/command-center-live/test_pdf_htr_pilot.py -v
```

## Gates before claiming a working HTR feature
1. Plesk read-only diagnostics: CPU, RAM, Python environment and background
   job capacity. Do not enable HTR blindly on Passenger's synchronous request.
2. Install Kraken in an isolated environment and license-check a recognition
   model compatible with 16th–17th century Greek/Italian/Spanish handwriting.
   Ottoman scripts require separately qualified models/evaluation.
3. Transcribe a small real scanned document (10–20 pages); compare against
   human diplomatic transcription and report Character Error Rate (CER) and
   Word Error Rate (WER). Synthetic stub results are **not** accuracy tests.
4. Design a guarded server preview/review endpoint for image-only PDFs and
   integrate it with the browser PDF Learning interface. Currently the browser
   refuses to generate review proposals for PDFs with no text layer, even
   though server OCR exists. **This PR does not change that behavior.**
5. Confirm source lineage, page identifiers, exact quote checking, operator
   review and `historically_verified: false` before production rollout.
6. Test FTPS artifact list (now includes `htr_kraken.py`) and validate a
   real production deployment **only after explicit enablement approval**.

Official CLI documentation:
https://kraken.re/main/user_guide/inference.html
