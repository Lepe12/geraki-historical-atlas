three.js r184 (npm three@0.184.0), MIT licence (see LICENSE).
Files copied unchanged from the npm package build/ and examples/jsm/controls/;
OrbitControls.js only has its import changed from "three" to "./three.module.min.js".
Loaded only by map-3d-scene.js when the user turns the main map to 3D.

GLTFLoader.js (examples/jsm/loaders), BufferGeometryUtils.js and SkeletonUtils.js (examples/jsm/utils) are from the
same npm three@0.184.0 package; only their imports are changed ("three" -> "./three.module.min.js", "../utils/X.js" -> "./X.js").
GLTFLoader is loaded only by map-3d-ship.js, after the 3D view starts, to load assets/nautical/models/galleon.glb.
