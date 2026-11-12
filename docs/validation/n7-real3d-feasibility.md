# Real 3D avatar: verified fast GitHub route

Owner rejected the H01 image-surface trial and requested real 3D, specifically asking for a fast GitHub-based route. No live avatar was changed during this investigation.

## Recommended foundation

Repository: https://github.com/met4citizen/TalkingHead — inspected HEAD `1563de184c19b310de4b636664d5835e2c74dbba`, package 1.8.2, MIT. Its `avatars/mpfb.glb` is explicitly CC0 in the repository README (other sample avatars have different licenses). File: https://github.com/met4citizen/TalkingHead/blob/main/avatars/mpfb.glb . The downloaded 36,815,920-byte glTF 2 asset has SHA256 `63c645a2a863b9972e9a9c2ed576a1de4c390b8475508e1473e69c87a3ee299c`: 8 meshes, one 67-joint skin, Head/Neck/Jaw/eye bones and 66 morph targets including eyelid, jaw and viseme shapes. No glTF extensions are required. The 36 MB model is retained in the workspace, not committed as a large binary.

Actual runtime check used the existing Three.js 0.184 installation and GLTFLoader, not a replacement portrait plane. Browser renders of front, 90-degree profile, 180-degree rear and independent eyelid/jaw morphs passed; no browser errors. See the source inspection, runtime metadata and actual profile screenshot in `n7-real3d-evidence/`. Local runner/asset are under `/workspace/work/n7-real3d-research/`. This proves a genuine volumetric, rigged asset can be loaded in our current renderer; it does not claim the TalkingHead class is integrated into N7 or that the stock face resembles H01.

## Integration work and boundaries

- Adapt actual 3D face/hair/materials to the owner's N7 reference. The supplied front image alone does not specify the hidden side/back appearance. The stock MPFB avatar is a motion/geometry foundation, not the final N7 art.
- TalkingHead supports existing AudioBuffer/PCM through `speakAudio`, so a new voice subscription is not required. Its documented language modules do not include Greek; accurate Greek mouth timing still needs mapping/alignment and verification with the existing Piper output.
- TalkingHead 1.8.2 currently requests Three.js ^0.186, while the N7 project uses ^0.184. First integrate in an isolated real-avatar view; do not silently change the stable main renderer. `avatarOnly` is documented as experimental, not assumed compatible.
- Optimize the 36 MB stock asset, preserving skinning and face morphs, before live delivery. Verify full side/rear geometry, independent blink/jaw, head/neck bones, cancellation, actual voice synchronization, mobile performance and lifecycle.

## Other verified options

- MPFB/Blender: https://static.makehumancommunity.org/mpfb/docs/getting_started.html — free/open character authoring, rigging and face/body customization. Existing Blender 4.3.2 is installed and meets MPFB's documented 4.2 minimum. This is the customization route behind the ready-made GLB.
- Microsoft Rocketbox: https://github.com/microsoft/Microsoft-Rocketbox — MIT, 115 rigged characters, facial/ARKit blend shapes; useful alternative library but requires more conversion/retargeting than the already compatible MPFB GLB.
- KeenTools FaceBuilder: https://keentools.io/products/facebuilder-for-blender — photo-based fitted real head with 51 ARKit/FACS shapes; supports a single image and multi-view texturing. Official page lists a 15-day trial and paid core license (individual monthly $19.99 before tax). Not installed or purchased; not required for the free stock-model route.

The previous H01 preview remains a rejected image-depth trial. Do not relabel it as a full 3D head or claim this feasibility model is already deployed.
