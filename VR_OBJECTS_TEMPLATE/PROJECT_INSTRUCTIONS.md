# VR Objects — ChatGPT Project instructions

This project uses an existing, reusable Quest 3 mixed-reality environment,
not a new VR app written from scratch.

**Canonical GitHub template:**
https://github.com/kuke2013-hub/vrzzz/tree/main/VR_OBJECTS_TEMPLATE

**Model-free test page:**
https://kuke2013-hub.github.io/vrzzz/VR_OBJECTS_TEMPLATE/

**Known-good controls baseline:** Zelda VR v13.0, commit
https://github.com/kuke2013-hub/vrzzz/commit/362e97ff29d42641981c0cb0f8672b3a89db3fc0

When asked to work with a new 3D object (OBJ, FBX, BLEND, GLTF/GLB, STL, DAE
or other format), inspect its geometry/materials/unit scale, convert it to a
self-contained GLB when practical, and mount it into a **COPY** of the
`VR_OBJECTS_TEMPLATE` app. Do not add Zelda or any other default object.

**Preserve these controls exactly** unless I explicitly ask to change them:

1. Quest 3 pure passthrough, no simulated floor, grid, gravity or visible stage.
2. Side squeeze grip on either controller grabs near or far using Quest
   target-ray selection; remote aim assist, no artificial pick distance cap.
3. Once grabbed, either/both controllers reposition model up/down/left/right,
   even at remote distances, through tracked hand + pointing-ray motion.
4. One-hand wrist movement rotates model. Two-hand right wrist pitch/roll
   works simultaneously with movement and size adjustment.
5. Both grip buttons together: **linear 10%–350% resizing**. No huge/infinite
   model-scaling experiments.
6. Left stick X moves the MODEL left/right, held or unheld; no viewer strafe.
7. Left or right stick Y: BACK pulls model closer, FORWARD pushes it away,
   regardless of grip; no player forward/backward movement.
8. Right stick X rotates held object in 30° increments; when not holding
   with the right grip it snap-turns the view 30°. Recenter between snaps.
9. Release last grip freezes exact model world position/orientation/scale.
10. Preserve arm-scale fidelity, original object proportions/materials,
    transparencies and textures. Avoid hardcoded Zelda dimensions or pose.

Do not overwrite the working `vrzzz` Zelda app. Work in a separate copy,
folder or repository. Reuse `physics-grab.js` as the known-good controller
engine. Update visible version labels and cache-busting URLs on changes,
maintain a version history, and report actual GitHub commits. Confirm source
checks separately from real Quest 3 hardware testing; never claim a live
deployment or headset test without checking it.

For models from OBJ/FBX/other formats, prefer converting to embedded-texture
GLB to avoid broken external texture or MTL paths. A standalone FBX/OBJ may
work for geometry but is not guaranteed to preserve materials automatically.

## Mandatory publishing and verification contract

**Full self-service upload is required.** When a model is uploaded in this ChatGPT Project, the assistant is responsible for producing, uploading, committing, deploying, and verifying the real model asset and its page without making the user upload, rename, or copy files or run Git commands. Do not send the user an asset-folder link as a manual workaround. Do not announce a finished object if the GLB is absent or HTTP returns 404. If current tools cannot transfer binary data, be explicit that publication is blocked; use a genuinely binary-capable execution environment rather than invent success. Never claim that a text-only GitHub commit uploaded the GLB.

Before announcing success, check the exact case-sensitive \`modelUrl\` in each object's \`config.js\`, the asset path in \`objects/manifest.json\`, the GitHub repository binary blob, the HTTPS Pages response (HTTP 200 and valid GLB header), and actual browser loading. Compare filenames literally. Confirm deployment success but understand that deployment success alone does not prove an asset was included. Retain prior objects and the original Zelda app.

**Required brightness control for all new objects:** Every independently published object page must use the shared \`objects/shared/app.js\` brightness control in its pre-passthrough menu. Default is 100% = the original lit appearance; 0% = black rendering of the model, with all intermediate brightness levels. The control must act on model pixels only, not on the physical passthrough environment, other pages or controller behaviour. Preserve model textures, materials and their alpha; adjust rendered output without destructive edits to GLB or rewriting \`physics-grab.js\`. Keep the slider available before the "Enter Passthrough" button and make its chosen value apply inside XR. Test both endpoints and an intermediate value where browser testing is available.

## Proven automatic binary upload method (2026-11-02)

An assistant fully published `evil-angel-woman.glb` without requiring the user to transfer files manually. The known-good procedure for large GLBs, when local container DNS and direct Git network are unavailable, is:

1. Convert and validate the self-contained GLB locally; record exact byte size and SHA-256.
2. Compress it with xz. Split compressed bytes into chunks (e.g. 512 KiB each) and encode each chunk independently as Base64. Put one Base64 chunk per line in a UTF-8 text transfer file (under the model's distinct name).
3. Through the available file-service tools, upload that transfer file from the local container to a temporary file that the tool can read. Use `files.list` / `files.read` to retrieve exact chunk lines inside `functions.exec`; transfer each chunk directly into GitHub with `mcp__GitHub__create_blob({encoding:'utf-8'})`. Validate each Git blob SHA against the local chunk's Git SHA-1 to detect corruption.
4. Atomically add the chunk blobs to the object's `.transfer/partNN.b64` paths plus a GitHub Actions workflow using `create_tree`, `create_commit`, `update_ref` with the expected branch head. The workflow decodes each part **separately**, concatenates compressed bytes, decompresses using xz, verifies exact GLB size, SHA-256 and `glTF` magic, commits the actual binary into the object's `assets/` directory and deletes the temporary parts.
5. Check that the GitHub Action completed with success; verify the exact .glb path exists in the repository, and only then set the manifest status to `ready` in a new commit using the GitHub connector. This separate write also ensures another Pages deployment is triggered.
6. Verify GitHub Pages deployment, exact case-sensitive HTTPS asset path and on-page model loading where tools permit. Distinguish static checks from real Meta Quest 3 hardware testing. Clean up temporary Library transfer material if possible.
7. Keep the shared model-brightness slider, shared controller engine, existing objects, and original Zelda app untouched.

This procedure is an example of a verified autonomous upload technique; adapt safely when tools or platform limits change. **Never direct the user to a GitHub asset folder to finish your upload**. Do not claim completion until the real GLB is committed and served, not merely the HTML or staging chunks.
