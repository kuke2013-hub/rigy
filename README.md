# Rigy 0.2 — animated character + persistent limb posing

**New interactive entry page:** [`index.html`](./index.html) • [Complete implementation notes](./ANIMATED_RIG_README.md) • [Uploaded FBX source manifest](./models/standing-idle/manifest.json) • [Deployment status](../../actions/workflows/pages.yml)

The uploaded **Standing W_Briefcase Idle.fbx** has been preserved byte-for-byte as SHA-verified model chunks. Its Mixamo animation loops while wrist/ankle IK targets and elbow/knee bend pins persist. **Quest trigger** adjusts individual joints; the **unchanged Zelda v13 side grips** still move and scale the whole character. This is an experimental prototype: joint frames, full anatomical coupling, rendering and Quest controls have not been hardware validated. The file references a missing external texture, so appearance may be untextured.

**Hosting:** the root page is ready for GitHub Pages but **Pages is not enabled yet**. Repository administrators must visit [Settings → Pages](../../settings/pages), select **GitHub Actions** as the build source, then rerun the [deployment workflow](../../actions/workflows/pages.yml). The expected address, once deployment succeeds, is `https://kuke2013-hub.github.io/rigy/`. This is currently **not a verified live link**. GitHub Pages for a private repository may require a paid GitHub plan.

---

# Rigy — VRPod anatomical skeleton laboratory

**Canonical development repository:** `https://github.com/kuke2013-hub/rigy`  
**Status:** Zelda VR v13 preserved; experimental anatomical pose extension included. **No human rig is bundled, and Quest 3 controls/pose mode have not been hardware-validated.**

Rigy is the new standalone playground for developing medically-informed, hand-manipulable rigged characters in Meta Quest 3/3S mixed reality. It is not the production VRPod website. The earlier `vrzzz` name in archived source documentation is historical provenance only, **not a deployment or development destination**.

## Open the experiments

- `/VR_OBJECTS_TEMPLATE/index.html` — original, unchanged Zelda v13 model-independent passthrough viewer.
- `/VRPOD_ANATOMY_EXPERIMENT/index.html` — separate, opt-in anatomical posing experiment. Import a rigged `.glb` (OBJ/FBX import is also available in the underlying template), then supply a **verified, character-specific calibration JSON**. Check **Enable experimental limb pose mode**. Use the **controller trigger** to select a skinned limb, move/aim to pose and release to keep the last pose. Side grips still grab and move the **whole object** as originally designed.

Both must be hosted over **HTTPS**, then opened from Quest Browser. A `file://` URL cannot provide WebXR passthrough. No source GLB is shipped.

## Core non-negotiable behaviour

`VR_OBJECTS_TEMPLATE/physics-grab.js` is a byte-identical, archived Zelda v13 controller baseline; do not modify it. Preserve:

- WebXR `immersive-ar` transparent passthrough; no floor/grid/stage/gravity or object drift.
- Either controller's side grip: near/distant grab, movement and wrist-based object rotation.
- Two hands: linear scale **10%–350%**.
- Left thumbstick horizontal translates object; either stick vertical pushes/pulls it.
- Right stick horizontal: 30° yaw step while right grip holds, 30° viewpoint snap otherwise.
- Releasing both grips freezes **world position, rotation and scale** without gravity.

Anatomical posing is additive and is **disabled by default**. Pose UI controls and skeletal logic live outside the controller baseline. For a non-rigged model, the viewer continues supporting the original object workflow.

## Contents

| Path | Purpose |
| --- | --- |
| `VR_OBJECTS_TEMPLATE/` | Original untouched Zelda v13 WebXR scene, controllers, config and documentation |
| `objects/shared/app.js` | Archived shared published-object application layer, including optional per-model brightness/Meshopt support; not automatically wired into Rigy's lab |
| `VRPOD_ANATOMY_EXPERIMENT/` | Experimental viewer that imports original physics controls and anatomy layer |
| `anatomy/medical-joints.v1.json` | Medical-source-linked **reference and experimental** joint bounds; individual ROM values are not validated 3D pose envelopes |
| `anatomy/constraint-core.mjs` | Pure JavaScript angle limits and provisional coupled boundaries |
| `anatomy/three-joint-adapter.js` | Map calibrated bone-local neutral frames to anatomical constraints |
| `anatomy/pose-layer.js` | Opt-in trigger selection plus bounded CCD pose manipulation |
| `examples/calibration.template.json` | Schema illustration; deliberately unconfirmed and not usable without actual rig inspection |
| `docs/ANATOMY_SPEC.md` | Evidence classes, coordinate system, limitations and implementation plan |
| `docs/TESTING.md` | Reproducible tests and Quest real-hardware test matrix |
| `PROJECT_INSTRUCTIONS.md` | Canonical project instructions for subsequent Rigy work |
| `SOURCE_CHECKSUMS.json`, `VERIFY_BACKUP.py` | Provenance/integrity checks of untouched archived files |

## Getting started

1. Serve this repository from an HTTPS origin with directory structure intact; Github Pages is one option **if enabled and verified** for this repo.
2. Open `VRPOD_ANATOMY_EXPERIMENT/index.html` on Quest 3's browser.
3. Import a self-contained, properly skinned humanoid GLB with bone hierarchy and vertex weights.
4. Inspect the bone naming, hierarchy, local bind-pose rotations and anatomical axis directions in your test rig.
5. Copy `examples/calibration.template.json`, replace placeholder bone names/frames with **actually measured** ones, set the inspection flags true only for each calibrated joint.
6. Load the calibration JSON, activate Pose mode and use the **trigger** for limb posing. Keep side grips reserved for original whole-object controls.
7. Record per-joint axis sign/motion results, mesh deformation, regressions and Quest frame-rate before claiming success.

### Run baseline and mathematical checks

```bash
python3 VERIFY_BACKUP.py
node --test tests/*.test.mjs
node --check anatomy/pose-layer.js
node --check anatomy/three-joint-adapter.js
node --check VRPOD_ANATOMY_EXPERIMENT/app.js
```

The Node tests verify data and mathematics only. They do **not** establish that the Three.js imports resolve in a browser, that an avatar's bone frames are correct, that headset grips are unaffected in practice, or that medical limits are validated across coupled 3D poses. These require dedicated browser and Quest testing.

## What is not implemented

Production-quality full-body IK, scapula/clavicle coupling, pose-aware hip and shoulder surfaces, detailed cervical/spine vertebra mechanics, bone-specific automatic calibration, anatomy-aware self-collision, soft-tissue or skin contact, physics-based muscle resistance, rig authoring/import pipeline, persistent exported poses, and verified WebXR Quest 3 operation. Missing clinical measurements are flagged as **disabled**, never invented.

**Source of truth for future development:** `PROJECT_INSTRUCTIONS.md` + `docs/ANATOMY_SPEC.md`, not historical references to the old repository in archived baseline files.
