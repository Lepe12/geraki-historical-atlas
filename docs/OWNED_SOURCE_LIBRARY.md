# Owned published-source library

Local-only connector for the owner's gathered articles and archival editions.

## Environment

| Variable | Meaning |
| --- | --- |
| `PCT_OWNED_LIBRARY` | Absolute path to the library folder. When unset, NABOU uses `/workspace/bibliothiki-piges` **only if that directory exists**. |

GitHub Actions runners do not ship this folder. CI may later set `PCT_OWNED_LIBRARY` to a **private mount** that is never checked into the public repository. Do not commit PDFs or full OCR `.txt` files to `Lepe12/geraki-historical-atlas`.

## Layout

- `KATALOGOS.md` — bibliographic catalog (author, year, title, pages, PDF basename)
- One `.pdf` + matching `.txt` per published source at the folder root
- `simeioseis-ergasias/` — working notes only; never cited as published sources

OCR text is a convenience. If OCR disagrees with the scan, the PDF wins.

## Runtime behaviour

`tools/owned_source_library.py` scans the folder when present and exposes catalog records to acquisition:

1. `acquire_library_candidate.py` injects matching owned sources **before** web downloads.
2. `cited_work_acquisition.lookup` returns owned title matches **before** (and alongside) web citation search; local materialization skips the HTTP reader for `owned-library://` URLs.

When the folder is absent, both hooks are no-ops.
