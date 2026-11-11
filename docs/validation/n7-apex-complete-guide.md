# N7 APEX complete guide verification

Scope: isolated `/n7-apex-step5/` preview. Production `/n7-apex/`, backend, model, auth and agent services are unchanged. Finish the supplied guide before artistic revisions. Existing approved artwork and mountain raster remain unchanged.

| Step | Implementation and verification |
| --- | --- |
| 1 Artwork | Preserve the approved 320×480 source. Existing derived mood palettes reuse its geometry; no additional owner-approved mood artwork was supplied. Assembly 25%/60% captures are derived verification references, not newly approved art. |
| 2 Engine | One Three.js scene for moving figure, source particles, moods and breath. Immutable native reference at neutral/effects-off, Original/Particles/Compare, collapsed diagnostics, mobile fit. |
| 3 States | Face-outward one-second palette bloom; newest state takes precedence. Real HTTP and queued-job activity drives Thinking. Errors/completion clear it. Text arrival never pretends to be voice playback. Manual state buttons are explicitly previews. |
| 4 Assembly | Six-second left-to-right source transport on every opening. Head settles and face ignites. Replay/Skip reset or cancel the shared timeline. No owner audio supplied, so silent. Reduced motion defaults to static; manual Replay is explicit opt-in. |
| 5 Head | Shared-edge source-textured rounded head, bounded turn, fixed neck, shadow/rim and smooth return. Camera tracking is optional and not enabled. |
| 6 Background | Approved static raster plus preselected bright ridge highlights; no frame-by-frame image analysis. Effects-off shows the unchanged base. |
| 7 Shockwave | Exactly one face-origin wave at assembly completion, 2.5 seconds, passing over figure and background behind controls. Skip, replay, effects-off and reduced motion cancel/reset it. |
| 8 Breath | Slow chest deformation anchored below the head/neck; same phase across moods, no accumulated displacement. Off/reduced returns to neutral. |
| 9 Integration | Conversation remains mounted while entering/exiting the figure; available before assembly ends. Keyboard focus containment, inert background, mobile and reduced-motion checks. Local API lifecycle fixtures cover pending/direct/queued/error responses. |

## Evidence and limits

`n7-complete-guide-evidence/local-guide-results.json` records actual browser render assertions, with separately labelled **local-only mocked API lifecycle** checks. Rendering itself is not mocked. No browser/GLSL errors occurred. Breath changed 4,431 chest pixels while head pixels remained identical; turning it off restored the baseline exactly. Effects-off, comparison and rapid-state cancellation passed.

Independent head regression compares a frozen native source against a separate WebP decode within Chrome's observed two-level color rounding, then requires byte-identical return to that same frozen reference. It audits consecutive motion coverage and reports actual software-renderer performance rather than claiming 60 fps.

Live public API availability and private authentication are checked separately. No authenticated real-model answer, microphone capture or voice playback is claimed by the local fixture. No new voice provider, camera access or paid service has been added. Login uses the existing same-origin N7 login flow.

Local head audit passed 96 consecutive coverage frames and eight poses, with zero missing alpha pixels and exact frozen-reference return. In this software-rendered run the 120-frame profile averaged 118.19 ms (about 8.5 fps); this is a remaining performance limitation, not a 60-fps result. Fresh reconstruction and static production build passed.

Previous Step 5/6 evidence remains in `n7-apex-step5-step6.md`. This implementation is reviewable in draft PR #347; no merge or production release is authorized by this record.

## Published isolated release — 2026-11-11

- Code: `afd4aae9b7bdacc6f5b40b7a39a8d95cb5edcd64`.
- [Successful validation and deployment](https://github.com/Lepe12/geraki-historical-atlas/actions/runs/43023588406); [visual evidence artifact](https://github.com/Lepe12/geraki-historical-atlas/actions/runs/43023588406/artifacts/13855679175).
- [Live preview](https://bot.piratecartography.com/n7-apex-step5/), release `0e443f373d6e8680`.
- Production release remains `bbdc05016a211581`, checked after publication.
- Host rollback snapshot: `/bot.piratecartography.com/n7-app/public/.n7-apex-backup-b70ba90a9fae`.
- Live approved figure SHA256: `bdba288c56230908e1c6abd1a199e5a895159730faf27c672916b03d51a5c7e5`.
- Live mountain SHA256: `585e573b8f8701f12072e52404552b99dcbadc4a58f52d3cf4a1fbfbc5df5f18`.
- CI software-rendered head profile: mean 66.52 ms/frame (about 15 fps), CPU submission mean 0.20 ms. This also remains below 60 fps.
- `bot.piratecartography.com` responds HTTP 200. `pct-live.piratecartography.com` is reachable but its root responds HTTP 404; this is not a network block and does not establish its application routes.
- Public live `/api/status` confirms model/queue configuration and reports `authenticated:false`. Authenticated model responses remain unverified.

Live full-guide browser suite passed against the published URL with TLS verification enabled and no API fixtures: automatic assembly, one completion wave, chest-only breath and exact return, radial moods/latest-event behavior, effects-off baseline, compare controls, reopen/workspace access, mobile and reduced-motion. No browser or shader errors. See `n7-complete-guide-evidence/live-guide-results.json` and `live-completion.png`. Local API fixture results are recorded separately and do not establish authenticated live-model behavior.

Independent live head/backdrop regression also passed: 96 motion frames with zero coverage gaps; eight poses; fixed neck/body within the existing two-level browser color-rounding allowance; byte-exact frozen-reference return; ten-second background observation; effects-off exactness and reduced-motion. Live software-rendered profile averaged 112.36 ms/frame (about 8.9 fps), CPU submission 0.32 ms; see `live-head-results.json`. This performance limitation should be addressed in the subsequent refinement phase.
