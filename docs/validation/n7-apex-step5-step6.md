# N7 APEX Steps 5–6: isolated preview validation

Scope: `preview/n7-apex-step5-guide`, draft PR #347, `/n7-apex-step5/` only.
Production `/n7-apex/`, backend, model, authentication and agent business logic are outside this change.

## Guide and artwork

The complete original APEX Humanoid guide was supplied by the owner and read during this task. The upstream APEX-UI README explicitly excludes the humanoid implementation; it is not a substitute for that guide. Steps 5 and 6 specify source-artwork patches, bounded rounded-head depth, fixed neck, neutral reference restoration and living highlights detected once from the backdrop. No webcam, shockwave or breathing feature is added here.

The approved humanoid remains SHA-256 `bdba288c56230908e1c6abd1a199e5a895159730faf27c672916b03d51a5c7e5`.
The build still checks this digest before exporting it. The new backdrop is `assets/n7-mountain-backdrop.webp` (1672×941); its provenance and digest are recorded in the adjacent JSON. It is a generated raster environment, not the rejected SVG and not a new humanoid image.

## Root cause and correction

The old moving renderer discarded tiles when their source pixels were dark, translated and enlarged the remaining rectangles independently, and reduced their alpha for far-side shading. Adjacent rectangles no longer shared destination edges. Interior coverage therefore broke even within a single settled frame; this was not merely a frame-rate illusion. In the reproduced old left extreme, the measured head interior contained 83 completely uncovered pixels and 13,656 pixels with incomplete alpha coverage.

`N7HeadSurface.ts` uses the installed Three.js engine and one indexed texture surface. Moving patches share vertices and edges, including dark source texels. Far-side shading changes light rather than coverage. It retains the existing depth, yaw limit and neck falloff. The fixed regions are flat parts of this same surface, not a cached body underlay. Every 4px vertex in the moving region is preserved; unnecessary subdivisions outside it are removed.

The moving WebGL surface is presented directly. The native source is decoded and frozen once into a reference bitmap, then used as the texture source too. This prevents Chrome changing its accelerated WebP color-rounding path when returning from GPU use. That exact bitmap is the sole visible surface at neutral. These two full-frame surfaces never overlap. There is no previous-frame trail, geometric silhouette mask, or reference underneath a moving head. Source texture and output use sRGB consistently, with tone mapping disabled. During movement an sRGB GPU round trip can differ by at most 2/255 per body channel in the measured browser; at neutral and return the reference is exact.

The reference has an opaque black background. Screen compositing integrates its light artwork into the mountain scene without modifying the source image or inventing a head-shaped mask. Original and moving views share that presentation treatment. Raw neutral source equality and composed scene screenshots are separate checks.

The backdrop stays an unchanged `img` with cover mapping. Analysis runs once per loaded image. Twelve deterministic patches are extracted from existing bright ridge pixels in their sampled colors; only their opacity animates slowly. Resize observation keeps the patches aligned with the same cover crop. No backdrop redraw or readback occurs each frame. Effects Off hides the illumination layer, and reduced motion disables both the highlights and pointer-driven head motion. Assembly remains an explicit opt-in, as before.

## Verification

`test_head_backdrop.cjs` runs against a real built page, with no mocked rendering:

- Neutral, 25%, 50% and maximum yaw in both directions, and return to neutral.
- 96 consecutive motion frames with complete alpha coverage.
- Head visibility and unchanged neck/body placement, with the documented 2/255 color tolerance during movement.
- Exact source pixels at neutral and return; no accumulated ghost image.
- A separate 120-frame profile, without screenshot or pixel readback work inside that profile.
- Effects Off screenshot identical to the base image; analysis count stays one.
- Effects On screenshots at 0, 5 and 10 seconds, with measured changes.
- Idle, Listening, Thinking, Speaking, Assembly completion, Replay and Skip.
- Reduced-motion behavior and actual same-origin chat-auth status.

The existing workflow browser checks are also required, including original/comparison modes, mood differences, transported assembly matter, face ignition and completion. The workflow stores screenshots and `results.json` as the `n7-step5-step6-visual-evidence` artifact and blocks deployment on test failure.

No local static HTTP server supplies the N7 backend. Its `/api/status` returns 404; this is not a failed model call and not a successful chat test. The public live bot reports unauthenticated access. Actual authenticated replies and response latency cannot be certified from this session. `N7Workspace.tsx` is unchanged and remains mounted while the humanoid opens/closes.

### Performance limits

CPU-side submission time alone does not establish smooth presentation. The test reports both submission time and observed RAF intervals, including estimated missed 60 Hz opportunities. The managed browser uses SwiftShader software rendering; it does not establish performance on the owner's GPU. The initial full-screen animated-canvas implementation measured about 109 ms mean frame interval; small precomputed backdrop patches, direct presentation, on-demand head rendering and removal of flat subdivisions reduce that cost. The final local run measured 67.64 ms mean RAF interval (p95 100.0 ms), 0.20 ms median CPU submission (p95 0.50 ms), and 367 estimated missed 60 Hz opportunities over 120 intervals. All 120 intervals exceeded 25 ms in this software renderer. A stable 60 FPS result is not claimed.

## Deployment and rollback

The starting rollback commit is `e2bbcc901ba578e8f5d6c0e1eec31d55c1baca88`; its live release marker was `cd6e13acf19cb4cf`. The existing deployer stages and verifies the new static files, renames the current directory to a backup, and restores it if verification fails. For the isolated Step 5 target the successful deployment now retains that backup and prints `N7_APEX_ROLLBACK_POINT`. No automatic merge or production deployment is requested.

Live verification must check the new release marker, fetch the new asset, inspect the rendered isolated page, and compare the production release marker with its pre-change copy. CI success alone is not production verification.

The first push workflow (`43011832536`) was cancelled when the PR validation (`43011840510`) started: both used the same global concurrency group. Concurrency now includes event type and ref. New pushes still cancel stale runs for their own branch, while a read-only PR validation cannot cancel its deployment. This does not change runtime code.
