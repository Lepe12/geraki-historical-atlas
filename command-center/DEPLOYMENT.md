# Research Command Center deployment

The canonical production architecture and endpoints are documented in:

`docs/COMMAND_CENTER_PRODUCTION.md`

This directory contains the production static Command Center client published by `.github/workflows/deploy-command-center-pages.yml`.

The static client consumes real durable snapshots and, when available, the production live backend/WebSocket. UI transport success or failure never changes historical evidence state.

Do not use this file as the authoritative backend-status document; production behavior is enforced by `.github/workflows/command-center-production-gate.yml`.
