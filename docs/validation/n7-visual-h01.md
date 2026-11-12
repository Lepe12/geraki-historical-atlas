# N7 Humanoid visual trial: H01 face option, quieter environment, menu

Scope: branch `preview/n7-visual-h01`, published only to the separate trial path `/n7-apex-step5-visual/`. The functional preview `/n7-apex-step5/` (branch `preview/n7-apex-step5-guide`, release `2c3286f6ce6b899a`) and production `/n7-apex/` are not written by this branch. Restore point for the functional version: branch `restore/n7-humanoid-3a8b6effe` (commit `3a8b6effe`). Nothing here replaces anything; the owner approves first.

Not changed: backend, public chat route, voice code and assets (`useN7Voice.ts`, `N7FemaleVoice.ts`, worker), conversation logic, joint rig, limits, moods, assembly, breathing, shockwave, and the `/avatar-3d/` stock-model trial. This branch's workflow run skips the public-chat and voice deployment steps. `N7Workspace.tsx`, `N7ApexStage.tsx` and `N7HumanoidView.tsx` change only the path check that recognises an isolated preview, so the trial path behaves like the functional one.

## 1. H01 as a second face

The approved eyeless N7 face stays the default. The dock has a face selector (N7 / H01); the choice is remembered in the browser and `?face=h01` selects it directly.

H01 is not a new renderer. `prepare_h01_figure.py` composes the committed, owner-supplied `n7-head-h01.webp` onto the approved body and the existing scene loads that raster instead (`n7-humanoid-h01-v1.webp`, 800×1200, so the detailed face is rendered at 2.5× the line-art resolution). The same neck/skull joints, limits, state postures, moods and voice reaction apply.

- Turning: a realistic face shows any warping, so with H01 the rig uses a flatter face plate (`faceRelief`): eyes, nose and mouth turn as one piece and the curvature moves to the sides under the hair. The approved N7 face keeps its original volume exactly.
- Proportion: uniform scale so hair top and chin land on the approved head's own points (y 20 and 200 of 480). Face width comes out at 95 units against 90 for the approved face. The face and chin are not warped.
- One neck: below the chin only, the H01 neck is narrowed sideways (half-width 34 → 26.5 units, complete by the neck base) so its warm and cool rim lines run into the body's neck outline, then the skin fades into the body's neck. Its cut-off bust edge is not shown: an owner-reported remnant of it sticking out at the left of the neck base was removed, and the body's shoulder lines now rise uninterrupted into the neck, with a warm hand-over where H01's left rim meets the body line (`local-h01-neck-detail.jpg`). The approved line-art head and its loose strands are removed; neck and shoulders are kept.
- Light and colour: H01's blue is turned 6° toward N7 cyan and its orange 5° toward N7 gold; the left shoulder lines take a restrained warm key to match H01's warm-left, cool-right lighting.

No image generation was used. Limits: the same as the approved face — only a front view exists, so the turn stays bounded (±0.34 rad) and there is no profile. The figure is screen-blended, so the realistic H01 skin is slightly translucent over bright scenery; the new environment dissolves into dark mist behind the figure for that reason.

## 2. Environment

The owner did not see a change in the first attempt (a regrade of the existing mountain raster, removed again) and chose a newly designed scene. `prepare_backdrop_v3.py` paints `n7-environment-v3.webp` (2240×1260) entirely by code, with no source image and no image generation: a navy sky with a star field and a faint cyan veil, a gold-to-cyan glow on the horizon, six alpine ranges receding in haze with snow that catches the light on the tall side peaks, and mist in the valleys. Behind the figure the ranges dissolve into soft dark mist across the full width of the body, so no ridge line or horizon edge shows through the translucent, screen-blended figure. It is stylised, not photographic.

Living highlights (guide Step 6) are the existing `N7Backdrop.tsx` mechanism, unchanged: one analysis of the loaded image picks up to twelve of its already-bright cyan or warm spots, and a small patch in the image's own colours at each spot fades between 8% and 78% opacity on a 9.6 s cycle with staggered phases. No per-frame analysis; Effects Off and reduced motion hide the layer. On the new scene twelve are found, sitting on the snow-lit peaks.

## 3. Menu

Presentation only; every option keeps its accessible name. One slim glass dock, grouped ΔΙΑΘΕΣΗ (Idle, Listening, Thinking, Speaking) · ΠΡΟΣΩΠΟ (N7, H01) · ΠΡΟΒΟΛΗ (Original, Particles, Compare) · ΣΚΗΝΗ (Assembly/Replay, Effects, Technical details, Πραγματικό 3D, Skip), with the live status at the left. Skip keeps its slot when it does not apply, so neither the dock nor the figure jumps when assembly ends. No blur effects are used (a first version with glass blur raised the software-rendered frame time from 44 to 51 ms and was dropped). The voice panel is restyled by CSS from `N7GuideView.tsx` only (centred card; a single pill when collapsed). Header, dock and voice panel sit outside the figure's box. On phones the dock stays one horizontally scrolling row, as before.

## Local verification (real browser, real WebGL pixels)

New `test_face_menu.cjs`: default face is the approved v4 at 320×480; all 15 buttons and the 3D link present by name; dock one row (< 64 px) and zero overlap of header, dock and voice panel with the figure, with the conversation closed and open; designed environment in use with living highlights; H01 at 800×1200 on rig `n7-neck-skull-joints-v3`; right, left, up and down poses move with zero coverage gaps; exact return to the rest image; moods and conversation panel work with H01; choice survives reload. No browser or shader errors.

All eleven existing suites pass unchanged on the same build: head/backdrop regression, joints, complete guide, voice, voice reactivity, Greek female Piper voice, automatic conversation, mobile conversation, passwordless, real-avatar trial and H01 head trial. As before, API, speech-recognition input and tone PCM in those suites are fixtures; the Piper model, Web Audio and rendering are real. The workflow now takes the preview path from the environment instead of hard-coding `/n7-apex-step5/`. One change to an existing test: the reduced-motion check in `test_complete_guide.cjs` waited a fixed 200 ms after selecting Speaking and failed intermittently under load at the end of that suite (once in CI, three of four live runs; six of six isolated replays were stable). It now waits for the Speaking still frame itself before comparing two captures 350 ms apart; the assertion is unchanged. The cause of the slow state change was not established beyond load.

Evidence: `n7-visual-h01-evidence/`. Live results are added below only after the deployed trial has actually been checked.
