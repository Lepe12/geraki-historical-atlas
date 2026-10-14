# JARVIS 3D Core Baseline — LOCKED

Status: **LOCKED / CANONICAL 3D CORE**

Canonical approved 3D baseline commit:
`5223d9176e9d4f03bceccee0b32d94090024bd37`

Restore renderer commit:
`0bcd47edf252f0ff1eec84d2bda9a2e7fa5f555f`

## What is locked

Only the approved 3D renderer core is locked:

- `jarvis-intelligence-chamber/chamber.js`
- `jarvis-intelligence-chamber/gpu-field.js`

These define the approved 3D visual design, motion, spatial rendering and GPU field effects.

## What remains editable

The surrounding interface is **not locked** and may be changed normally:

- `jarvis-intelligence-chamber/index.html`
- `jarvis-intelligence-chamber/chamber.css`
- headers, sidebars, navigation, labels, buttons, telemetry, framing and other non-3D UI

## Lock rule

Do not replace or materially alter `chamber.js` or `gpu-field.js` unless the 3D design is intentionally unlocked and re-approved.

UI/UX changes around the 3D scene are allowed and should preserve the locked renderer core.
