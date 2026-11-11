# Mobile conversation retains the humanoid

The supplied mobile screenshot shows the separate N7 CONTROL workspace after the figure has been closed. The figure header's Conversation handler explicitly closed the dialog before opening that workspace, which replaced the visible figure. This was a navigation issue rather than a missing artwork/WebGL asset.

On phone-sized viewports, including landscape up to 1000×500, Conversation now opens the existing voice/text composer inside the figure dialog. The standalone N7 workspace button on those viewports also restores the figure with its composer. Existing conversation state/controller remains mounted; microphone permission and passwordless chat behavior are preserved. Desktop workspace navigation remains available.

The figure uses the dynamic viewport height and the composer remains bounded to 38dvh. Mobile effect controls form a horizontal scroll strip rather than several rows, preserving vertical room for the artwork. Renderer, geometry, camera, source artwork, backdrop, backend chat and authentication are unchanged. The backend installer now performs only read-only verification when its module/server bytes are already installed; a UI-only publication does not restart or rewrite the N7 backend.

Reproduction against the preceding build failed when Conversation hid the dialog/composer. The new mobile browser test passes at 390×844, 390×480 and 844×390 with a local API fixture. At 390×844 the figure measures 304×456; at 390×480 it remains 137×206. The test checks visible figure, no composer overlap, no horizontal overflow, passwordless input/reply, preserved conversation, landscape navigation and restoration through the workspace button. No browser errors. Short viewport emulation is not a claim of physical-device keyboard testing.

See `n7-mobile-evidence/local-results.json` and `local-portrait.png`. Static build, TypeScript/lint and five deployment tests passed, including explicit proof that an already-installed backend is not rewritten/restarted.
