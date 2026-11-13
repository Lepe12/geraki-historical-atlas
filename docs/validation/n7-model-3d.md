# N7 3D model evaluation (owner's `textured.glb` and `highres.glb`)

Scope: separate test page `/n7-apex-step5-visual/model-3d/` on branch `preview/n7-visual-h01`. The N7 Humanoid, its renderer, the functional preview `/n7-apex-step5/` and production `/n7-apex/` are not changed; a test asserts that the Humanoid page never requests the model. Owner-supplied ZIP; original `textured.glb` SHA-256 `929195d16fa3e976793174ae668e1ed765cb43831b50ad9362cc64badfbdf97f`.

## What the files contain (measured)

| | `textured.glb` | `highres.glb` |
|---|---|---|
| Exported by | Blender glTF I/O 4.2 | trimesh (from a .ply) |
| Size | 15.7 MB | 9.7 MB |
| Geometry | 1 mesh, 23,120 vertices, 40,000 triangles, normals, UVs | 1 mesh, 268,698 vertices, 537,392 triangles, positions only |
| Material / textures | 1 material, 4096² base colour (JPEG) + 4096² metallic/roughness (PNG, 11.8 MB) | none (no colour, no normals, no UVs) |
| Rig, morphs, animation | none | none |
| Bounds | 1.12 × 1.99 × 0.72 units, upright after its own 90° node rotation | same shape and bounds |

It is a head-and-torso bust (cut below the chest), with sculpted hair and a smooth featureless face: no eyes, mouth or other facial features, matching N7. Front, 90° profile and back are real geometry. The neck is narrowest at about y 0.10–0.20 (width 0.41–0.47); the chin is near y 0.25.

`highres.glb` is the same shape at 13× the triangles with no surface data; without UVs the N7 texture cannot be applied to it. Not used further.

## Test page

`prepare_model_test.py` keeps geometry, normals, UVs and material exactly, and only reduces the two textures to 2048² JPEG: 15.7 MB → 2.75 MB. Loaded with the installed Three.js 0.184 `GLTFLoader`; no new engine or paid service.

- **Views**: front, profile 90°, back 180°, mouse follow, automatic motion, free orbit; head-and-shoulders or whole bust; side-by-side comparison with today's approved N7 picture.
- **Head motion without a rig**: a three-bone chain is created in code (chest → neck base y 0.07 → skull base y 0.24) and the single mesh is skinned to it with smooth weights across the neck (head fully bound above y 0.27, chest below y 0.02). Yaw ±0.55 rad, pitch ±0.30 rad, shared budget for diagonals, critically damped (no overshoot). The whole head turns and nods as one rigid volume; the shoulders stay.
- **N7 look** ("Ολογραφικό N7"): the texture's brightest drawn lines become emissive cyan, its warm lines gold, the body goes to dark navy, a cyan rim follows the silhouette, and an optional glow pass (bloom). Listening strengthens the rim, Thinking warms the lines, Speaking brightens them with the real voice level. "Αρχική υφή" shows the file's own texture.
- **Chat, voice, Agents, N7 back end**: the page mounts the same `N7Workspace` as the Humanoid (passwordless chat, Greek voice, microphone, login, Agents for signed-in owners; NABOU and the other N7 services are reached through that workspace's existing back-end routes). Its listening/thinking/speaking activity drives the model. Nothing in the workspace or back end was changed.

## Browser results (real Chromium; software WebGL: SwiftShader, 4 CPU cores, no GPU)

- Model ready 0.4–1.9 s after navigation on the local server (download 2.75 MB in ~50 ms locally; parse ~120 ms). No browser or shader errors.
- Head: yaw reached 0.546 rad to the right; pitch +0.29 down and −0.30 up. With a full right turn 50% of the pixels in the head band changed against 3.7% in the shoulder band.
- Frame interval, same browser and window, idle scene (mean of two runs): current Humanoid 132 ms; model with glow 241 ms; model without glow 172 ms; original texture 162 ms. The software renderer is far slower than any real GPU, so these are only relative: the model costs about 1.3× the Humanoid without glow and 1.8× with glow. Real-device frame rate was not measured.
- Phone viewport (390×844, 3×): loads and turns; no errors.
- The existing twelve browser suites still pass on this build; new `test_model_3d.cjs` passes and runs in CI.

## Findings and limits

1. **Appearance**: proportions, hair volume and the featureless face are consistent with N7, and unlike the picture it has real side and back views. But it reads as a glossy sculpted bust, not as a figure made of light lines: the texture is a mid-blue surface with bright streaks (median brightness 67/255, top 10% above 215), not N7's thin luminous lines on black. The N7 look gets closer but cannot recreate the fine line art, which simply is not in the texture.
2. **Framing**: it is a bust cut below the chest; today's N7 shows the torso to the waist. The body lines, the chest light and the neck "tree" of the approved picture exist only faintly in the texture.
3. **Head motion**: works without a rig through the added bones. Because it is one closed mesh, the neck stretches slightly at the extremes; the limits above keep it believable. Hair is part of the same mesh and moves rigidly with the head (no separate hair motion).
4. **No facial movement**: no morph targets, so there is no mouth or blink; speaking can only be shown with light, which matches N7 having no face.
5. **Glow**: the glow pass adds a soft haze rectangle around the model view and is the most expensive part; off, the cost is close to the Humanoid's.
6. **`highres.glb`**: unusable as is (no UVs or texture). Using it would need re-projecting the texture in Blender, a separate job.
7. Not done: the guide's assembly, mood bloom, breathing, shockwave and living backdrop are not ported to the model; those belong to the Humanoid renderer, which stays unchanged as instructed.

Evidence: `n7-model-3d-evidence/`.

## Live verification

Release `096db38ecccd44d9` ([run](https://github.com/Lepe12/geraki-historical-atlas/actions/runs/43387045207)): validation, including `test_model_3d.cjs` in CI, and trial deployment passed. Live model file 2,751,892 bytes, HTTP 200, downloaded in 1.0 s from this cloud session. `test_model_3d.cjs` against the live URL, TLS-verified: ready in 2.7 s, head turn changed 22.9% of the head band and 0.08% of the shoulder band, workspace present, Humanoid page did not request the model, no errors. Functional preview `2c3286f6ce6b899a` and production `bbdc05016a211581` unchanged.

## Update — the model adapted to the approved N7 (owner's intent)

The owner clarified that the model was supplied to give N7 real 3D, adapted to what has been built — not to be shown as is. The page now shows **"N7 σε 3D"** by default; the unchanged model stays available as "Αρχικό μοντέλο".

- **Shape fitted to the approved figure** (`prepare_model_fitted.py`, output `n7-model-fitted-v1.glb`): the mesh is placed in the approved picture's 320×480 frame (front, orthographic), the head above the chin is stretched ×1.21 so the hair tops meet, and each row is widened or narrowed (factor 0.80–1.37, smooth) so the front outline follows the approved outline. Outline overlap with the approved figure: 0.79 → **0.935** (`fit-outline-red-approved-green-model.png`). Depth is scaled by half the same factor so the volume stays rounded. The arms remain joined to the body where the picture shows a gap under the arms; the model ends just above the picture's bottom edge.
- **Our N7 on the front**: the approved picture is projected onto the surface facing the viewer and pinned to the geometry at rest, so it turns with the head in true 3D. Seen from the front, the figure is our approved N7.
- **Sides and back**: where the picture cannot reach, the model's own texture is reduced to the crests of its streaks (thin cyan lines, gold where warm) with a faint navy glow, plus a thin cyan contour where the surface turns away.
- **Moods**: the owner's approved Listening, Thinking and Speaking pictures are projected the same way and bloom out of the face over one second, as in the Humanoid; Speaking follows the real voice level.
- **Head**: same added chest → neck → skull chain, in picture units (neck base row 252, skull base row 168, as in the Humanoid). Yaw 0.55 rad, pitch ±0.24 rad measured; with a full turn 11.6% of the head band changed and 0% of the shoulder band.
- **Views**: front, 3/4, profile, back (eased whole-body turn), mouse follow, automatic.

Browser (SwiftShader, same machine): ready 1.3 s; frame interval Humanoid ~122 ms, N7 3D ~181 ms (≈1.5×, relative only). No browser or shader errors. `test_model_3d.cjs` rewritten for this page and passes; the Humanoid suites re-run here (guide, faces/menu, joints, passwordless) pass.

Limits: from the side, the front picture is stretched over the curved surface near the edge of the face and body; the sides/back are the model's streaks restyled, not drawn N7 artwork (they would need owner-approved side and back pictures to match the front exactly); the face has a sculpted nose ridge that shows as a dark facet at strong turns; no assembly, breathing or living backdrop on this page yet.

CI note: the first deployment attempt of this update ([run](https://github.com/Lepe12/geraki-historical-atlas/actions/runs/43415117781)) stopped at `test_female_voice.cjs`, whose original rule was "no voice download without a voice action". The background voice preparation added earlier at the owner's request breaks that rule by design; it had passed before only because the check ran within 2.5 s. The test now requires at most one download, and still zero downloads without an action when the browser asks to save data. Passed twice locally.

Live — release `c5fa39ec47e3d5ff` ([run](https://github.com/Lepe12/geraki-historical-atlas/actions/runs/43416442507)): all CI suites and deployment passed. `test_model_3d.cjs` against the live page, TLS-verified: N7 3D ready in 2.5 s, full head turn changed 11.6% of the head band and 0% of the shoulder band, front shows the approved cyan/gold artwork, moods, raw model, comparison and workspace work, Humanoid page did not load any test model, no errors. Functional preview `2c3286f6ce6b899a` and production `bbdc05016a211581` unchanged.

## Owner review — the face is wrong

Close-up (`face-problem-approved-front-left-right.jpg`: approved face, then the 3D front, left and right): the supplied model was not made from the approved N7 picture, so its sculpted shapes do not sit under the picture's drawn lines. The model's own hair lumps and face relief (nose, cheeks, chin) show through as extra glassy edges on top of the drawn hair and face outline, and when the head turns the picture slides across mismatched geometry and the model's hair covers part of the face. Outline fitting cannot fix this: it matches only the silhouette, not the inner shapes. Not yet fixed.

## Face fixed with the owner's front, profile and back pictures

The owner supplied a front, a 90° profile (facing right) and a back picture in the N7 style (`docs/validation/n7-reference-pack/N7-*-supplied.png`; all 1024×1536, hair top rows 11–14, necks 207–221 of 480). The approved v4 stays the front picture, because the mood pictures are aligned to it; the new front is kept as reference only.

- **Side shape** (`prepare_model_fitted.py --profile`, output `n7-model-fitted-v2.glb`): each row's depth range is mapped onto the profile outline, rows aligned on hair top and neck (profile 15/210 → front 13/207); depth 0 at the profile's neck centre (column 143.5).
- **Smooth N7 face**: inside the approved face oval (centre 160,140; half-axes 62×92 px) the model's nose, lips and cheeks are replaced by a smooth mask following the profile's front edge, blended out at the rim and stopped above the jaw line (rows 178–196) so the chin and neck keep their shape.
- **Three pictures on the model** (`prepare_side_back_art.py`, `n7-art-profile-v1.webp`, `n7-art-back-v1.webp`): front, profile and back are each pinned to the surface from their own direction and blended by the surface direction; the front dominates wherever the surface faces the viewer and always on the face; the profile's gold face curve is kept only on the face. Back fitted to the front by outline correlation 0.78 (scale 1.10, squash 0.98).

Close-up (`face-fixed-approved-front-left-right.jpg`): the front face now matches the approved one. Remaining: at strong turns the model's own hair lumps and hanging strands beside the neck still show as uneven shapes; faint warm marks remain at the temples; the model is a bust and ends above the picture's bottom edge. `test_model_3d.cjs` updated and passes locally.

## N7 built from our own pictures (owner: "φτιάξ' το με τις εικόνες μας")

The supplied model is no longer used for the shape. `prepare_model_from_art.py` builds the volume only from the approved front picture (width per row) and the owner's profile (depth per row, aligned by `prepare_side_back_art.py`): each picture row becomes a rounded cross-section of exactly that width and depth, joined from the hair top to the bottom of the frame (27,841 vertices, 55,560 triangles, 1.0 MB). In the neck band the outline follows the neck's own contour lines, so loose hair strands are not turned into volume; between neck and shoulders it follows the drawn shoulder line. The front, profile and back pictures are projected onto it as before, the face always from the approved front. Measured: neck 44 px wide, 49 px deep.

Result (`from-art-front-34-profile-back.jpg`, `from-art-head-left-right-up-down.jpg`, `from-art-moods.jpg`): the head, face and hair are the approved drawings from every side; no traces of the old model's hair or nose; the body reaches the bottom of the frame. The old model's raw view stays available ("Αρχικό μοντέλο").

Limits: cross-sections are smooth ovals, so the 3D hair has the drawn hair's outline and lines but no separate locks in depth; ears and loose strands exist only as drawing; at 3/4 angles the front and profile drawings blend. `test_model_3d.cjs` passes (head turn changes 11.5% of the head band, 0% of the shoulders). One Humanoid suite (`test_complete_guide.cjs`) failed twice on timing on this loaded machine and passed on the third run; Humanoid code is unchanged in this step.
