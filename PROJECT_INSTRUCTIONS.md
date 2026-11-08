# RIGY — canonical project instructions (8 November 2026)

**Active and only development repository:** `https://github.com/kuke2013-hub/rigy`. This supersedes all former `vrzzz` references. Historical links in byte-preserved source files indicate provenance, not current destinations. Rigy is the independent, reversible sandbox for VRPod's human-rig interaction engine.

## Mission

Create a reusable, Quest-first WebXR passthrough experiment where users can move entire 3D models with the **unchanged Zelda VR v13 controller** and, for separately calibrated humanoids, use a selectable posing mode to grasp and reposition limbs while joint limits reflect actual medical anatomy rather than 3D forum defaults.

## Immutable environment and control contract

Keep `VR_OBJECTS_TEMPLATE/physics-grab.js` exactly as uploaded and verified against `SOURCE_CHECKSUMS.json`, along with original template files as a known-good archive. The original controls are in `CONTROL_REFERENCE.md`; do not alter side grips, stick mapping, controller aim, 30° increments, linear 10–350% scaling, zero gravity, no floor/grid, 3D materials, or precise freeze-on-release behaviour. A new feature cannot silently rewrite the original controller or turn anatomical limits into restrictions on whole-object manipulation.

## Joint research and rig constraints

Use peer-reviewed medical/anatomical studies, cadaveric and in-vivo biomechanics, ISB joint coordinate standards and measured clinical ROM. Link each dataset entry to references and explicitly distinguish **active, passive, population mean, theoretical maximum, experimental design constraint** and unsupported limits. Do NOT treat forum animation values as medical evidence. `anatomy/medical-joints.v1.json` is **v1 experimental reference data** and not a clinically validated anatomical 3D constraint surface.

Use each bone's **local, individually calibrated anatomical frame** relative to its neutral bind pose. World axes are not interchangeable with arbitrary GLB `rotation.x/y/z`. Anatomical convention: right-handed, +X character-left, +Y superior, +Z anterior. Report signed rotation conventions and test each joint before enabling it. Use quaternion-based three-dimensional orientations; Euler decomposition in v0.1 is a documented prototype approximation, not the final ISB-compliant solver.

Plan joint classes: hinge (elbow/PIP/DIP), axial-twist (forearm), flexion-dependent hinge/twist (knee), oblique constrained dual-axis (wrist), swing-twist (shoulder/hip), coupled spine/scapula chains and rotation+translation (jaw). Never extrapolate global cervical or whole-shoulder range to individual bones. Never silently permit unmeasured segments to rotate arbitrarily. Joint limits are not medical safety guarantees; no injury simulation claim.

Maintain original source and experimental features in separately versioned folders. New experiment `VRPOD_ANATOMY_EXPERIMENT` is **opt-in via trigger** while Zelda side grips still select/manipulate the whole object. Use a *model-specific, human-confirmed* calibration document for rig mapping; do not infer valid axes from names alone. Preserve skin weights, bone hierarchy, materials, shapes/morph targets, textures, rig/animation and proportions; inspect before optimization.

## Test strategy

Verify source hash invariants, JS syntax, no regressions to existing controls, wrist twist, knee flexion-dependent twist, elbow locks, profile fail-closed behaviour, calibration correctness, CCD chain integrity, two-hand scaling and release freeze. Run actual Quest 3 test with a known rig; report what was observed rather than guessing. Explicitly separate source validation, browser rendering, HTTPS deployment and actual headset tests. Do not claim rig support complete if scene cannot select/skinned-pose the model.

## Next milestones

1. Complete joint-axis inspector and calibration UI for imported rigged GLBs; publish a sample licensed test rig and per-bone calibration.
2. Replace prototype Euler-clamp logic with stable quaternion/ISB joint-frame constraints; measure against 3D clinical datasets.
3. Develop true constrained IK with accurate shoulder girdle, hip, knee, wrist, neck/spine coupling and joint limit response.
4. Test on Quest 3 real hardware, adjust UX/performance and freeze last valid pose; add regression suite.
5. Only after tests, consider integration into VRPod's shared viewer. `rigy` remains the playground.

Never assert a deployed site, successful model upload, fully medical validation or hardware testing without corresponding evidence.

## Animated rig overlay (v0.2 — 8 November 2026)

- The root `index.html` / `index-app.js` is now the animated Mixamo test page; it loads the user's unchanged `Standing W_Briefcase Idle.fbx`, reconstructed and SHA-256 verified from `models/standing-idle/part-*.txt`. The FBX contains 419 animation samples over 13.933 seconds at 30 fps, not merely 30 frames. Its referenced external Image_0 texture was not embedded.
- **AnimationMixer.update(dt) must execute before persistent pose constraints every frame.** Never globally pause/rewrite animation as the way to pin a limb.
- Wrist and ankle cyan grip points use experimental damped 2-bone IK and store their target position in an **animated body reference**: Spine2 for arms, Hips for legs. Orange elbow/knee points store persistent flexion. After trigger release, the pose remains relative to the moving body, while unaffected animation tracks continue updating.
- Support multiple pins and explicit priority of a pinned knee/elbow hinge over an overlapping ankle/wrist pin. Release must not delete stored pins; "Clear pins" resets them without resetting the animation.
- The trigger is reserved for individual limb posing. The **unchanged** `VR_OBJECTS_TEMPLATE/physics-grab.js` side grips still operate the entire model: move, rotate, snap, push/pull and scale 10%–350%. No simulated floor or gravity. Never replace that engine.
- The initial Mixamo bone mapping and inferred hinge axes are **an experiment**, not anatomically validated calibration. Medical elbow/knee flexion values are sourced from `anatomy/medical-joints.v1.json`; precise shoulder/scapula, hip and full 3D coupled movement are not yet implemented. Do not claim perfect anatomy.
- Static verification and a source commit do not establish actual WebXR/Quest rendering or pose behaviour. Test with real Quest hardware, note missing texture, and report actual performance.
- The GitHub Pages deployment workflow exists, but Pages must first be enabled through repository Settings → Pages with GitHub Actions source. Do not call `https://kuke2013-hub.github.io/rigy/` live until successfully verified. The repository is currently private; plan limitations may apply.
