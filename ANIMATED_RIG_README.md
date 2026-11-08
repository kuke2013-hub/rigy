# Rigy animated-pose test (v0.3, 2026-11-08)

## Goal
Load the user-supplied **Standing W_Briefcase Idle.fbx** character, continually loop its source animation, and **retain independent user-created hand/leg poses while the rest of the Mixamo animation continues**. The root `index.html` contains a single **Enter VR / Passthrough** button (using WebXR `immersive-ar`) and a desktop preview. Zelda v13 whole-object controllers are imported byte-for-byte and unchanged from `VR_OBJECTS_TEMPLATE/physics-grab.js`.

## Source inspection
The FBX is a binary FBX 7700 file, 3,367,024 bytes (SHA-256 `cc0eb651ca4d9b93f7fbdc4d97846132d4ba390cad296db5f6b876001e3768e2`). It contains one skinned mesh (108225 XYZ coordinate scalars / 3 = 36075 source control points), 28 skin clusters, the Mixamo Hips / Spine / arms / legs skeleton, and one `mixamo.com` animation stack. **162 animation curves have 419 keys each**, with 9 constant curves. Key times span 13.933 seconds at nominal 30 fps. The user described the source as “30 frame animation,” but actual data indicate a **419-sample, 30 fps** motion clip. The original FBX is reassembled and SHA-256 verified **byte for byte** in-browser from base64 text parts; no re-export or mesh decimation occurred.

**Source texture limitation:** FBX `Video`/`Texture` points to `/Users/iki/Downloads/textures/packed/Image_0` but **does not embed the image**. Missing texture may render as fallback grey and cause a fetch warning. No attempt to fabricate the texture was made.

## How pose persistence works

1. Three.js `AnimationMixer` advances the complete original clip every frame.
2. Body reference frames (`Spine2` for arms, `Hips` for legs) continue animating normally.
3. When a wrist or ankle is grabbed using the Quest **trigger**, its new target is stored in the relevant animated body frame. The selected chain solves a damped 2-bone inverse-kinematics correction **after** every `mixer.update()`. Release retains the target; other animated bones keep moving.
4. When an orange elbow/knee point is grabbed, vertical controller motion adjusts a persistent flexion target. Only the corresponding hinge bone receives this after-animation correction; upstream body motion continues.
5. Whole-object manipulation is still handled exclusively by Zelda v13's original **side-grip** engine: near/far grab, wrist rotation, left X sideways, either stick Y depth, 30° yaw/snap and two-hand 10–350% scale. No collision floor, gravity or replacement environment.
6. Multiple pins are allowed on separate chains. If wrist and elbow (or ankle and knee) are both pinned, the joint bend pin has priority and the effector chain optimizes upstream motion without modifying the locked hinge.
7. Press **Clear pins** to restore independent animation or **Pause** to freeze animation while retaining pins.

The source medical reference bounds are loaded from `anatomy/medical-joints.v1.json`. Elbow and knee flexion maxima are prototype values derived from clinical ROM. Axis orientation is inferred from this specific Mixamo hierarchy and initial pose. **Not validated**: exact anatomical hinge frame, shoulder/scapula/hip coupling, 3D pose-dependent joint envelope, self-collision, realistic joint stiffness, and physical Quest headset interaction. In particular, upward arm poses may deviate from strict medical 3D limits. Do not interpret current numeric limits as injury/safety guarantees.

## File inventory

- `index.html`, `index-app.js`: default ready-to-use launcher, desktop orbit preview, Quest passthrough and unchanged global Zelda controls.
- `rigy/animated/animation-pins.js`: rig-specific bone maps, cyan wrist/ankle and amber elbow/knee handles; persistent per-frame posture solver.
- `rigy/animated/model-bundle.js`: byte-accurate FBX text-part loader with SHA-256 verification.
- `models/standing-idle/manifest.json`, `part-*.txt`: original FBX in base64 blocks, without modifying rig, animation, geometry or materials.
- `VR_OBJECTS_TEMPLATE/`: original reference; do not change.
- `.github/workflows/pages.yml`: deploys root as a GitHub Pages site when GitHub Pages/Actions permissions permit.

## Tests

```bash
python3 VERIFY_BACKUP.py
python3 tests/verify_animated_fbx.py
node --check index-app.js
node --check rigy/animated/animation-pins.js
node --check rigy/animated/model-bundle.js
```

These checks **do not prove** that the FBX loads and renders correctly in a browser, that its missing texture resolves, that pose markers/IK are visually correct, or that Quest XR trigger/side grips have been tested. Those require a browser and real Quest 3/3S testing. Do not call a GitHub source commit a verified Pages deployment.

## Reliable headset asset build and automated verification (v0.3)

- The full FBX remains committed unchanged as base64 fragments. `tests/reconstruct_fbx.py` regenerates an identical `models/standing-idle/standing-idle.fbx`. The dedicated `Restore original FBX binary` GitHub Action also attempts to commit the direct binary into `main` using a narrowly scoped `contents:write` permission; failures do not destroy the preserved parts.
- During Pages deployment the same verified reconstruction runs **before** the static artifact is uploaded. The browser first fetches the single native FBX file; if absent, it uses six parallel fragment fetches. Both paths verify the file SHA-256 before parsing.
- `Validate animated rig prototype` runs Python hash checks, JavaScript syntax, Node model-loading tests and an actual headless Chromium import/animation/pose smoke test using Playwright. A green browser result is a desktop runtime test, **not** a Quest/VR hardware test.
- GitHub Pages must still be enabled in repository Settings → Pages, source **GitHub Actions**, as the default GitHub workflow token cannot create a Pages site.
