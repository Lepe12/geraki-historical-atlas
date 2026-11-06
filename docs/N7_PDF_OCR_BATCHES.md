# N7 PDF ingestion

`tools/library/n7_pdf_ingest.py` creates resumable batches of page-indexed JSON from PDFs. Requires Python 3.10+, PyMuPDF, and optionally Tesseract with `ell` and `eng` languages.

Example:

```sh
python tools/library/n7_pdf_ingest.py /private/book.pdf --output /private/book-pages --batch-size 20 --ocr auto --language ell+eng
```

Run the existing private PHP library importer for **each** output `pages-*.json` batch after schema installation. The PDF extraction checkpoint does not prove MariaDB imports. The PDF itself must be preserved privately. Original printed-page labels remain null until reviewed; scan index and printed page number are not equivalent. OCR status remains UNREVIEWED. Do not treat indexed text as a verified historical claim.

Local tests (2026-11-06): five-page text PDF processed in 2+2+1 pages with successful resume and duplicate-free restart; one raster-only PDF page recognized by Tesseract in English. Neither test verifies host deployment or accuracy on historical Greek print.

N7 chat integration still requires a secured private read adapter to the existing MariaDB library. Browser clients must not access MariaDB or private PDFs directly.
