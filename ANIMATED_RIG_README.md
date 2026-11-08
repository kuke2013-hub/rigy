# Rigy animated-pose test (v0.4, 2026-11-08)

## Goal
Load the user-supplied **Standing W_Briefcase Idle.fbx** character, continually loop its source animation, and **retain independent user-created hand/leg poses while the rest of the Mixamo animation continues**. The root `index.html` contains a single **Enter VR / Passthrough** button (using WebXR `immersive-ar`) and a desktop preview. Zelda v13 whole-object controllers are imported byte-for-byte and unchanged from `VR_OBJECTS_TEMPLATE/physics-grab.js`.

## Source inspection
The FBX is a binary FBX 7700 file, 3,367,024 bytes (SHA-256 `cc0eb651ca4d9b93f7fbdc4d97846132d4ba390cad296db5f6b876001e3768e2`). It contains one skinned mesh (108225 XYZ coordinate scalars / 3 = 36075 source control points), 28 skin clusters, the Mixamo Hips / Spine / arms / legs skeleton, and one `mixamo.com` animation stack. **162 animation curves have 419 keys each**, with 9 constant curves. Key times span 13.933 seconds at nominal 30 fps. The user described the source as “30 frame animation,” but actual data indicate a **419-sample, 30 fps** motion clip. The original FBX is reassembled and SHA-256 verified **byte for byte** in-browser from base64 text parts; no re-export or mesh decimation occurred.

**Source texture limitation:** FBX `Video`/`Texture` points to `/Users/iki/Downloads/textures/packed/Image_0` but **does not embed the image**. Missing texture may render as fallback grey and cause a fetch warning. No attempt to fabricate the texture was made.

## How pose persistence works

1. Three.js `AnimationMixer` advances the complete original clip every frame.
2. Body reference frames (`Spine2` for arms, `Hips` for legs) continue animating normally.
3. When a wrist or ankle is grabbed using the Quest **trigger**, its new target is stored in the relevant animated body frame. The selected chain solves a damped 2-bone inverse-kinematics correction **after** every `mixer.update()`. Release retains the target; other animated bones keep moving.
4. When an orange elbow/knee point is grabbed, three-dimensional controller displacement sets a persistent joint-position target. The shoulder/hip is steered so the orange joint can follow the controller, with a best-effort lower-bone bend preserving the previous wrist/ankle position in the moving body reference. Coupled anatomical motion remains experimental.
5. Whole-object manipulation is still handled exclusively by Zelda v13's original **side-grip** engine: near/far grab, wrist rotation, left X sideways, either stick Y depth, 30° yaw/snap and two-hand 10–350% scale. No collision floor, gravity or replacement environment.
6. Multiple pins are allowed on separate chains. If wrist and elbow (or ankle and knee) are both pinned, the orange joint-position pin has priority, and the wrist/ankle then steers only the remaining hinge; conflicting physical targets cannot always both be met.
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

## Controller movement and visibility correction (v0.4)

- **Cause of the reported collapse:** the previous hand/foot target clamp compared FBX **local centimetres** to a reach bound computed in **world metres**. It incorrectly dragged end-effectors almost to the shoulder/hip immediately upon grabbing. All reach comparisons now use world-space bone distances, converting to the spine/hips reference frame **only after** clamping. A stationary grab must keep its original target instead of collapsing.
- **Every coloured point is now draggable:** cyan wrist/ankle points set effector goals; orange elbow/knee points set world-position goals for the joint and use a best-effort hinge adjustment for their distal hand/foot. Moving a knee may change its flexion while the idle animation continues; precise anatomical IK is not yet validated. Controller translation is the primary movement; cyan effectors also react modestly to controller aim.
- **Proximity reveal:** a blue/yellow sphere appears only when either tracked VR controller comes within **30 cm** of that individual point; the actively held point stays visible even if dragged farther away. The Quest trigger selects the nearest controller-close point, not a distant ray target. Original Zelda side grips continue whole-object near/far grabbing unchanged. On desktop, coloured points appear only while the mouse cursor hovers near them (or while dragging). The checkbox permits/disables nearby marker display.
- **Validation:** a new Playwright regression simulates stationary and translated controller grips on all eight joints, asserts no target-space collapse, checks that all eight points move, that markers start hidden, and that animation continues while a pin remains. Real Quest hardware/controller tracking still needs an actual headset test.
- **Cache busting:** root `index.html` / `index-app.js` / pose module use `rigy-0.4` import query strings so Quest Browser does not silently reuse the broken 0.3 scripts.


## Grounded feet, head/neck/torso and joint caps (Rigy 0.5)

- At the first animated frame, both foot positions and orientations are captured in the **unanimated model-anchor frame**. They do not follow the idle clip's animated Hips transform. Each frame follows the sequence: AnimationMixer update → root/pelvis correction → additive spine/head constraints → knee bend targets → dual planted-foot IK → wrist/elbow IK → render. No gravity, virtual floor or object-release physics is added.
- Moving either ankle updates its anchored position; after release it stays at the new target (to the extent achievable within the current two-segment IK reach). The pelvis and other joints compensate and the idle clip keeps playing. Explicit whole-character Zelda side-grip movement carries the planted foot frame with the whole model: grounding is relative to the model anchor, so baseline object repositioning is preserved.
- Additional handles: **head**, **neck**, **torso** (violet), and **pelvis** (light green). The controller trigger selects nearby points, and physical controller translation determines the 3D target. All 12 markers remain invisible until a controller is within 30cm; mouse hover reveals desktop handles.
- The experimental rig-specific quaternion caps are 12° Spine, 12° Spine1, 16° Spine2, 34° Neck, 24° Head relative to the current animated pose; upper arm ±100° total swing and upper leg ±76° are conservative engineering limits. Knee/elbow flexion maxima still reference the linked medical profile values. **This is not full 3-axis, clinically validated joint motion**. A complete hip/shoulder/spine anatomical frame calibration is still required.
- Kinematic constraints cannot meet physically impossible target combinations (e.g., both feet placed farther apart than the character's leg reach). Do not extend bones or break skinning to fake a success. The automated test checks foot drift and continuous animation; measured numerical error must be interpreted as simulation error, not a medical certificate.
- No physical Quest controller run has been performed by the automated tests. Check tracking, body positioning, actual foot stationarity, head/neck deformation and performance on hardware.

## Rigy 0.8 — animation-safe overhead shoulders

**Current rule:** wrist/elbow positions are pinned in animated Spine2-local space, so the user-adjusted arm pose survives torso motion. Both foot positions remain in the fixed model-anchor frame regardless of the idle animation. The Mixamo Shoulder bone provides an experimental upward clavicle/scapula proxy (up to approximately 50° at overhead elevation), while the upper arm's motion is constrained separately. Total shoulder-complex forward reach can approach 175°; side elevation approximately 170°. These limits are provisional engineering choices, not a measured full 3D clinical envelope. The browser regression checks a true 160° chest-relative reach and repeats at a later animation time.
