# Dependencies, testing and limitations

## Dependencies loaded from network

- Three.js **0.186.1** via jsDelivr in `VR_OBJECTS_TEMPLATE/index.html`, including import-map add-ons (GLTFLoader, OBJLoader, FBXLoader, OrbitControls).
- Rapier (`@dimforge/rapier3d-compat`) **0.21.0** via jsDelivr in `VR_OBJECTS_TEMPLATE/physics-grab.js`.
- The shared published-object layer additionally imports Three.js `MeshoptDecoder` to decode GLB files using `EXT_meshopt_compression`.

This ZIP intentionally preserves the actual source imports and does **not** embed third-party libraries. Internet connectivity is required to resolve those imports. To make a fully offline distribution, vendor compatible copies and test any required import-map/path changes separately, without changing the controller behaviour.

## How to preview

1. Copy `VR_OBJECTS_TEMPLATE/` to an HTTPS-hosted website or existing GitHub Pages directory.
2. Load the page to see the empty environment. No model is included by default.
3. If you later add a model, use a self-contained GLB. Choose the model in the picker or update `config.js` with the deployed `modelUrl`.
4. Open the HTTPS page in Meta Quest Browser on Quest 3 and select **Enter Passthrough**.
5. Check grab near/far, hand/wrist rotation, both hands moving, 10–350% scale, stick mappings, and frozen release on real hardware.

## What is checked for this ZIP

- Original repository file byte content matches the Git blob SHA-1 hashes recorded in `SOURCE_CHECKSUMS.json`.
- JavaScript syntax can be checked independently of browser and headset execution.
- The ZIP has no supplied GLB, GLTF, OBJ, FBX, BLEND, textures or other character/model assets.

These checks do **not** establish that the GitHub Pages deployment is currently live, that external CDN imports will always be available, or that Meta Quest 3 hardware behaviour was tested in this session.
