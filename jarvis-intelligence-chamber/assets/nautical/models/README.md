# 3D models (3D map only)

| File | What | Author / source | Licence |
|---|---|---|---|
| `galleon.glb` | "Galleon" — three-masted galleon, high stern castle, square sails, rigging, baked 2K PBR textures (39,876 triangles, originally 2.2 MB; now 1.1 MB) | Grab3D — https://grab3d.com/models/vehicles/galleon/ (download `https://grab3d.com/dl/galleon/galleon.glb`, downloaded 2026-10-30) | CC0 1.0 (public domain), see `LICENSE-galleon.txt` |

The file was compressed losslessly-in-appearance with meshoptimizer `gltfpack 1.3.0 -cc -kn -km` (same triangles, same textures; vertex data quantised and meshopt-compressed); author and CC0 licence unchanged. It is loaded by `map-3d-ship.js` with three.js `GLTFLoader` (vendor/three, MIT)
only after the 3D view is turned on. It is a stylised generic galleon, not a reconstruction of a specific ship.
