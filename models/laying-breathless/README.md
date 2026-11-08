# Laying Breathless — original source, shared Rigy viewer

The 28,177,072-byte uploaded binary FBX (7700) contains the original 65-bone Mixamo rig, 52 skin clusters, 304,203 control points, 337,401 polygons and short animation. Its separate, 494,343-byte 2048 × 2048 JPEG UV atlas is also hosted unmodified.

The model is stored as 27 **lossless, ordered 1 MiB chunks** under `chunks/part-000.bin` through `part-026.bin`. This bypasses the GitHub connector's file-upload limitation without discarding geometry, skin weights or animation. The shared `index-app.js` downloads all parts, concatenates them in order and **verifies the original full FBX SHA-256** before Three.js FBXLoader parses it. The source JPEG is in `laying-breathless.jpg`.

Exact original FBX SHA-256: `3bc1818136bba47dc54ce838ed120276def9cbed6949f8da3f360565fc77457b`

Exact original JPEG SHA-256: `925150f8e0c9fd05d4b3ec449508bf9ca8ef781b943e1f81335e20f4663985f0`

The page reuses the common Zelda side-grip and medically constrained pose engine. It is not a unique fork of the rig controls. Source mesh, weights and animation have **not** been optimized. Because the FBX is large and dense, Quest 3 loading speed, actual pin manipulation and frame rate require headset testing and may need a separate Quest-optimised variant that preserves rig/UV data.

Do not mistake successful deployment or checksum verification for successful real-headset testing.
