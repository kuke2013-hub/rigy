# Laying Breathless — independent Rigy character experiment

The uploaded original binary FBX (7700) contains a 65-bone Mixamo rig, 52 skin clusters, 304,203 mesh control points, 337,401 polygons (608,406 triangles if fan-triangulated), and a short ~0.833-second animation. The user-provided 2048×2048 JPEG is the original supplied UV atlas.

This page imports the central `index-app.js`, `rigy/animated/pelvis-pose-engine.js` and original Zelda side-grip engine. The atlas is applied non-destructively to cloned mesh materials. The original skeleton, existing weights, mesh UVs, geometry and animation are not regenerated or simplified.

**Publishing status: SOURCE BINARY UPLOAD PENDING**. The GitHub connection used for this stage can write source text but cannot transfer the supplied 28 MB FBX and 483 KB JPEG. Do not claim the page automatically displays this character until the required files are present on the hosted deployment. It offers local FBX and JPEG pickers while these assets are pending.

Exact expected case-sensitive paths:
- `models/laying-breathless/laying-breathless.fbx` — 28,177,072 bytes — SHA-256 `3bc1818136bba47dc54ce838ed120276def9cbed6949f8da3f360565fc77457b`
- `models/laying-breathless/laying-breathless.jpg` — SHA-256 `925150f8e0c9fd05d4b3ec449508bf9ca8ef781b943e1f81335e20f4663985f0`

The existing experimental pose solver assumes a Mixamo naming convention; this new reclining source requires independent anatomical-axis verification, skin deformation/regression tests and real Quest 3 tests. Preserve the standing experiment unchanged.
