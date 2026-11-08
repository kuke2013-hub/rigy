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
- The repository is public and the official GitHub Pages site has been enabled at `https://kuke2013-hub.github.io/rigy/`; confirm each future deployment and live revision separately from hardware tests.

## Grounded pose and body controls (Rigy 0.5.4, 8 Nov 2026)

- The **canonical playground** is `kuke2013-hub/rigy`, not the historical vrzzz. Preserve `VR_OBJECTS_TEMPLATE/physics-grab.js` byte-identical to archived SHA `9f206b64bbe1a483f429489e54aa85cdc2f489a7`.
- `index.html` and `index-app.js` load the original FBX and continuous 13.93 s Mixamo clip; `rigy/animated/animation-pins.js` is an additive, separately versioned animated-pose overlay. Always evaluate **AnimationMixer first**, then grounded rig solver, then render. Do not destroy the animation to freeze a limb.
- Both feet are automatically planted **at initial load**, including orientation, with anchors stored in the model's *unanimated* outer reference frame; they are not parented to the animated Hips. Moving an ankle changes and persists its planted target on release. No floor, gravity or world-stage geometry is needed. Explicit Zelda whole-model movement still moves the anchored frame with the entire character.
- Movement of pelvis, knees, torso, head and other joints must be solved *relative to the planted feet*. Grounded feet have higher priority than a conflicting knee/pelvis drag. Never stretch/shrink bones or secretly break joint limits to accommodate an anatomically impossible posture; restrict achievable target instead and document residual error.
- There are 12 near-field grab points: both wrists/elbows/ankles/knees, plus head, neck, torso and pelvis. All are draggable in 3D by controller trigger; markers appear only within ~30 cm of a controller, and the active marker remains visible while held. The original side-grip Zelda controls still move/rotate/scale the entire model.
- Elbow and knee hinge bend maxima use the linked medically sourced `anatomy/medical-joints.v1.json` reference ranges. Torso/neck/head use **conservative provisional** per-bone quaternion-angle caps, and hip/shoulder receive provisional swing caps; these are not a complete, calibrated 3D medical movement envelope. Real anatomical axis frames and coupled ranges (hip abduction/flexion, GH/scapula, cervical vertebrae, forearm pronation) must be implemented and independently verified before describing the system as medically accurate. Medical measurements are not injury-prevention guarantees.
- Regression must include: whole 13.93-second animation loop; default feet stationary; a dragged foot remains at its new contact target; moving knee/hip/torso/head doesn't unplant support feet; all 12 targets selectable and movable; per-joint angle limits respected; original grip mapping and release pose preserved; actual Quest 3 controller/animation testing clearly separated from automated Chromium tests.
- The v0.5.4 Chromium regression on this supplied character moved markers by a simulated ~12 cm and observed **at most about 7 mm foot contact error for foot/pelvis drags** and **about 5 mm for knee drags**. Ordinary idle across sampled clip positions showed <=5 mm error. These are results of this specific prototype test, not mathematical guarantees for all movement ranges, rigs or real headset behaviour. Unreachable targets are allowed to remain unmet rather than deform anatomical bone lengths.
- Quest 3 physical performance, hand tracking, anatomical axis signs and real-world root support still require testing on hardware. The supplied FBX's missing external texture remains a known asset limitation.
## Rigy 0.8 — active reference-frame rule

Supersedes older ambiguous instructions about limb anchors: upper limbs (wrist and elbow) pin relative to the **moving Spine2 torso bone**. Legs' **planted feet** remain in the unanimated model-anchor frame, and the pelvis/hips/legs correct their position to keep contact. Do not store arm pin targets in the unanimated outer anchor: a rotating torso then forces the target behind the shoulders and violates human movement. Both arms share shoulder elevation with the Mixamo Shoulder clavicle proxy and upper-arm GH limit, as documented in docs/SHOULDER_OVERHEAD_V07.md. Preserve all original Zelda side-grip controls byte-for-byte.
