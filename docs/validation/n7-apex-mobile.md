# Mobile conversation retains the humanoid

The supplied mobile screenshot shows the separate N7 CONTROL workspace after the figure has been closed. The figure header's Conversation handler explicitly closed the dialog before opening that workspace, which replaced the visible figure. This was a navigation issue rather than a missing artwork/WebGL asset.

On phone-sized viewports, including landscape up to 1000×500, Conversation now opens the existing voice/text composer inside the figure dialog. The standalone N7 workspace button on those viewports also restores the figure with its composer. Existing conversation state/controller remains mounted; microphone permission and passwordless chat behavior are preserved. Desktop workspace navigation remains available.

The figure uses the dynamic viewport height and the composer remains bounded to 38dvh. Mobile effect controls form a horizontal scroll strip rather than several rows, preserving vertical room for the artwork. Renderer, geometry, camera, source artwork, backdrop, backend chat and authentication are unchanged. The backend installer now performs only read-only verification when its module/server bytes are already installed; a UI-only publication does not restart or rewrite the N7 backend.

Reproduction against the preceding build failed when Conversation hid the dialog/composer. The new mobile browser test passes at 390×844, 390×480 and 844×390 with a local API fixture. At 390×844 the figure measures 304×456; at 390×480 it remains 137×206. The test checks visible figure, no composer overlap, no horizontal overflow, passwordless input/reply, preserved conversation, landscape navigation and restoration through the workspace button. No browser errors. Short viewport emulation is not a claim of physical-device keyboard testing.

See `n7-mobile-evidence/local-results.json` and `local-portrait.png`. Static build, TypeScript/lint and five deployment tests passed, including explicit proof that an already-installed backend is not rewritten/restarted.

## Live verification — 2026-11-11

Code `c8e5c32a3fdf85c107cd1dc89a672798dd7b3edc`, [successful CI and deployment](https://github.com/Lepe12/geraki-historical-atlas/actions/runs/43044626536), [visual evidence artifact](https://github.com/Lepe12/geraki-historical-atlas/actions/runs/43044626536/artifacts/13866748104). Live preview release `45a24a7649d06934`; production remains `bbdc05016a211581`.

The independent live browser used mobile viewport/touch emulation with no API/device mocks and no logged-in session. Conversation kept the figure visible, an actual anonymous message returned HTTP 200 and “Γεια σου, πώς μπορώ να σε βοηθήσω σήμερα;”, and the figure remained visible with the reply. Portrait figure 304×456, short viewport figure 137×206, landscape navigation and restoration via the workspace button all passed. No password fields or browser errors. See `n7-mobile-evidence/live-results.json` and `live-portrait.png`. This is viewport emulation rather than a physical Brave/soft-keyboard test.

Deployment log confirms `APEX_PUBLIC_CHAT_ALREADY_INSTALLED no_writes=true no_restart=true`. Static rollback snapshot: `/bot.piratecartography.com/n7-app/public/.n7-apex-backup-d5e05c9d24cd`.
