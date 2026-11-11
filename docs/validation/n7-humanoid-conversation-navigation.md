# Keep conversation with the humanoid

The desktop `Συνομιλία` action previously closed the humanoid and opened N7 CONTROL, while mobile kept the voice panel with the figure. Exiting the isolated figure also automatically opened CONTROL. These transitions explain the empty-background/control-panel screen reported by the owner.

The isolated preview now opens its inline conversation panel at every viewport size. Stopping voice conversation keeps the figure visible. Explicit Exit still closes the figure and stops audio/microphone, but does not automatically open CONTROL. The N7 workspace button, authenticated Agents, Research and history remain available. Production `/n7-apex/` conversation routing is preserved. No renderer, artwork, camera, voice provider, auth or backend changes.

Regression coverage: the desktop authenticated queued-conversation test opens `Συνομιλία`, receives its queued reply, stops conversation while retaining the visible dialog and no workspace, then explicitly exits without opening the workspace. The full guide test now expects desktop conversation to stay inside the figure, matching mobile.
