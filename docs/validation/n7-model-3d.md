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
