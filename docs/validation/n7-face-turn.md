# Preserve the face outline during mouse turns

Owner report: the v4 artwork looks good as an image but its shape deforms in the live turn. They clarified that the problem is shape during rotation, not static detail or lighting.

Baseline: live corner captures reproduce a flattened chin and distorted lower outline with simultaneous maximum yaw/pitch. Existing single-axis evidence measured downward head spread at 0.9172 of neutral. The old shader allowed yaw ±0.34 rad plus pitch ±0.32 rad independently, stacking both at corners. The source is a rounded front-artwork depth illusion, with a neck transition; such large combined turns exceed its convincing range.

Correction: yaw is bounded to ±0.22 rad and pitch to ±0.16 rad. A shared normalized pose budget limits simultaneous extremes. Shadow/rim strength now follows the actual yaw angle instead of remaining at its old full-turn strength. Pointer input, smooth following, v4 artwork, texture patches, neutral reference, background, audio and controls are unchanged.

Acceptance tightened: single-axis and four diagonal head spread must stay within 0.95–1.05 of neutral; neck/body must remain fixed; visible signed nod and jaw movement, exact neutral, coverage and source comparisons remain required. The old recorded 0.9172 downward spread fails this stronger shape criterion. Actual new browser results: downward 0.9740, upward 0.9994; diagonal range 0.9786–1.0036; every diagonal body difference zero. Eight yaw poses, 96 coverage frames, signed pitch, ten-second backdrop, effects-off and reduced motion all passed. The optimized Next build/type/lint passed. This is shape evidence, not a claim of improved FPS. See `n7-face-turn-evidence/` for actual live baseline and local corrected frames.
