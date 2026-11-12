# N7 Humanoid: jointed neck and skull head motion

Scope: `preview/n7-apex-step5-guide`, draft PR #347, isolated `/n7-apex-step5/` only. Production `/n7-apex/`, backend, model, authentication and voice provider are not changed.

## Approved form kept

The binding artwork is the owner-approved `assets/n7-humanoid-face-v4.webp` (SHA-256 `1abf41530c4253962a46fe426c107eb2f776f54ad5c2c5e594b8765bd569ea68`), still pinned by the builder. It has no eyes and no facial features, and none are added: no eyes, mouth, jaw morph or stock 3D face. Hair, head/body proportions, colours and lighting come only from that image. At rest the visible surface is the frozen source bitmap itself, byte for byte. The separate `/avatar-3d/` stock-model trial is untouched and is not the N7 Humanoid.

## What was wrong

Measured on the previous commit (`before-front-right-left-up-down.jpg`): the head depth depended on `x` only and was nearly flat, so a turn was mostly a sideways slide of the whole head plate; the head was cut from the body by a 20px blend at row 208, so the chin slid off a neck that did not follow; and pitch was limited to 0.10 rad on a surface with no vertical depth, so up/down was barely visible.

## Correction

`N7HeadSurface.ts` now projects the approved image once, from the front, onto a rounded rest volume measured on the artwork (face oval, skull with hair, neck column). That volume is moved only by a real joint chain built from Three.js `Object3D` nodes: fixed shoulders → neck base (160,252) → skull base (160,168). The neck joint carries 30% of each angle and the skull joint 70%; vertices are bound with linear-blend skin weights (skull, face, jaw and loose hair fully to the head; the neck column head → neck → shoulders). Every head point is therefore carried by rigid yaw, pitch and roll rotations. Projection is orthographic, so the head cannot grow. Limits: yaw ±0.34 rad, pitch ±0.21 rad, roll ±0.10 rad, with the existing shared budget for combined poses.

`N7GuideScene.tsx` drives the joints with a critically damped spring (no overshoot) instead of the previous 42 ms exponential snap. Listening, Thinking and Speaking add a head posture on the same joints (tilt; up and aside; small nods carried by the real playback envelope from `N7VoiceSignal`). Idle stays guide-exact: chest-only breathing, head at rest. A separate "Head gestures" switch sits beside "Breathing" in Technical details. Effects Off, Original and reduced motion keep the exact still image.

Mood light for Listening/Thinking no longer uses a hard brightness step and a hard cut at row 215; it fades with the drawn lines and across the neck. This removes flat haze patches over the empty dark face that became obvious once the head could turn in those states.

## Limits that remain

Only the front of the head exists as approved artwork. There is no side or back image, so this is a bounded turn of a front-projected volume, not a 360° model: at full yaw the hair outline foreshortens by about 6% (148 → 139–143 px in the 320×480 frame), and a true 90° profile view is not available. Extending the turn further would require new owner-approved side artwork.

## Local verification (real browser, real WebGL pixels, no rendering mocks)

`test_head_backdrop.cjs` (updated: fixed-body boundary moves from row 208 to row 256 because the neck is now part of the joint chain; new parallax, outline and neck assertions) and new `test_head_joints.cjs`:

- Neutral and return: zero differing channels against the frozen approved source.
- 96 consecutive motion frames: zero coverage gaps. No browser or shader errors.
- Full yaw: face core shifts −9.5 / +10.4 px while the hair outline edges move ≤ 9 px (a turn, not a slide); neck column changes 1,284 pixels (it follows); shoulders from row 256 down differ by 0.
- Pitch: face core −7.8 px up, +10.9 px down; vertical head spread 0.969–1.002 of neutral; diagonals 0.972–0.995.
- Return to rest: monotonic, no overshoot, exact zero; halfway in about 170 ms, settled in about 1.0 s.
- Idle: head pose exactly zero while breathing runs. Listening roll 0.55, Thinking yaw 0.37 / pitch 0.37, Speaking small sway; back to exactly zero in Idle and with Head gestures off.
- Software-rendered profile: mean 43 ms/frame in this managed browser. This does not establish 60 fps on the owner's GPU.

All existing suites also pass on the same build: complete guide (assembly, shockwave, chest-only breathing, moods, effects-off, compare, mobile, reduced motion), voice, voice reactivity, Greek female Piper voice, automatic conversation, mobile conversation, passwordless, real-avatar trial, H01 trial and public-chat unit tests. In those suites the API, speech-recognition input and tone PCM are fixtures, as each suite states; the Greek Piper model, Web Audio and rendering are real. No physical microphone or speaker is claimed.

Evidence: `n7-head-joints-evidence/` (direct browser captures and machine-readable results).

## Live verification — 2026-11-12

- Source `ed678d8e0`; [validation and isolated deployment passed](https://github.com/Lepe12/geraki-historical-atlas/actions/runs/43210911503), including the new joint test in CI.
- [Isolated preview](https://bot.piratecartography.com/n7-apex-step5/), release `2c3286f6ce6b899a`. Production `/n7-apex/` release marker read after deployment: `bbdc05016a211581`, unchanged. Host rollback point: `/bot.piratecartography.com/n7-app/public/.n7-apex-backup-35227165ab8a`.
- Fresh TLS-verified browser against the live URL, no API or rendering mocks: `test_head_backdrop.cjs`, `test_head_joints.cjs` and `test_complete_guide.cjs` all passed. Numbers match the local run: exact neutral/return, 96 frames with zero gaps, face core −9.5 / +10.6 px at full yaw, neck 1,284–1,286 changed pixels, shoulders 0 difference, pitch −7.8 / +10.9 px, spread 0.969–1.002, return halfway at 160 ms with no overshoot. Software-rendered mean 45 ms/frame.
- One real conversation turn through the live figure UI: public `/api/n7-apex/chat` returned HTTP 200 with a real Greek model reply; zero password fields; no browser errors. Thinking was observed live for 1.7 s with head pose yaw 0.30 / pitch 0.31 / roll −0.19. The reply was then read with the real Greek Piper voice (after "Ανάγνωση απάντησης"; typed messages are not read automatically): Speaking state, playback level up to 0.65, deepest voice-driven nod −0.136, pose back to exactly zero afterwards. See `live-talk.json`, `live-thinking.json`, `live-thinking-speaking.jpg`.
- Not verified: a physical microphone or audible speaker output (recognition input was typed text), authenticated owner sessions, and frame rate on a real GPU. One earlier attempt in the same managed browser reported "Δεν δημιουργήθηκε η ελληνική φωνή" after the automated script had pressed read-aloud during the first 90 MB voice download; two later attempts without that interruption synthesized and played correctly. Voice code is unchanged by this work; the cause of that one failure was not established.
