# JARVIS Archive Browser Worker

## Status

Restricted browser-backed fallback for archive/catalogue interfaces that do not have a proven stable anonymous machine-search route.

## Safety

The browser is allowlisted to known archive/catalogue hosts. It records an append-only audit trail and stores screenshots/evidence inside the research evidence tree. It does not provide general desktop control, does not access WordPress, and cannot promote catalogue/browser discoveries to VERIFIED.

## Current routing principle

Prefer a proven native/API/catalogue connector when one exists. Use browser-backed research only when required by the archive interface and within access restrictions.

Current examples:
- Moreveneto / Archivio di Stato di Venezia browser research;
- SIAS / Italian state-archive fallback where request mechanics require browser interaction.

PARES/Simancas now has a proven native catalogue-search route and should **not** be described as browser-only. Browser research may still be useful for specific records or interfaces, but it is not the primary PARES discovery path.

Authenticated/CAPTCHA-protected services such as BOA remain explicit manual/authenticated blockers; the browser worker must not bypass access controls.

GitHub-hosted runner state is ephemeral unless evidence/session outputs are explicitly preserved.
