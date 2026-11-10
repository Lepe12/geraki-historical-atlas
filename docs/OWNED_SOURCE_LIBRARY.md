# Owned published-source library

Local-only connector for the owner's gathered articles and archival editions.

## Environment

| Variable | Meaning |
| --- | --- |
| `PCT_OWNED_LIBRARY` | Absolute path to the library folder. When unset, NABOU uses `/workspace/bibliothiki-piges` **only if that directory exists**. |
| `PCT_OWNED_LIBRARY_TOKEN` (Actions secret) | Optional PAT that can **read** the private repo `Lepe12/nabou-owned-library`. When set, research-lane jobs check that repo out to a runner-temp path and set `PCT_OWNED_LIBRARY`. When absent, the hook is a no-op. |

**Never** commit PDFs or full OCR `.txt` files to the public `Lepe12/geraki-historical-atlas` repository. **Never** upload those files as public workflow artifacts. Do not print library file contents in logs.

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

## How GitHub-hosted research runs get the files (without making them public)

1. Keep the published sources in the **private** repo `Lepe12/nabou-owned-library` (or another private mount).
2. Add repository secret `PCT_OWNED_LIBRARY_TOKEN` on `geraki-historical-atlas`: a fine-grained PAT (or classic `repo` PAT) that can read that private library repo only.
3. Research-lane jobs run `.github/actions/owned-library-checkout`, which sets `PCT_OWNED_LIBRARY` to the runner-temp checkout when the secret is present.
4. Acquisition copies matching `.txt` (and records PDF paths) into each run's `library_acquisition/` workspace; those run artifacts stay in the evidence tree as ordinary acquired texts, not as a republication of the private library tree.

Without the secret, hosted runners behave as before: owned-library hooks no-op, and only public web/catalog downloads are available.
