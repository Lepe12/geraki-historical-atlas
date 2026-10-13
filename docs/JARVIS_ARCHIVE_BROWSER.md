# JARVIS Archive Browser Worker

Piratecartography now has a restricted persistent Playwright browser layer for
archives whose catalogue interfaces cannot be handled reliably with simple HTTP
requests.

## Safety

The browser is allowlisted to known archive/catalogue hosts. It records an
append-only JSONL audit trail and saves screenshots inside the evidence tree.
It does not have general desktop control, does not access WordPress, and does
not promote browser/catalogue discoveries to VERIFIED historical evidence.

## Current use

- Moreveneto / Archivio di Stato di Venezia
- foundation for PARES/SIAS browser-backed fallbacks

The persistent profile is per named archive session and is intended to preserve
cookies/session state during a research run. GitHub-hosted runners remain
ephemeral between runs unless artifacts are explicitly preserved.
