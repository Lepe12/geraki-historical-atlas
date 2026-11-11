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

Previous Step 5/6 evidence remains in `n7-apex-step5-step6.md`. This implementation is reviewable in draft PR #347; no merge or production release is authorized by this record.
