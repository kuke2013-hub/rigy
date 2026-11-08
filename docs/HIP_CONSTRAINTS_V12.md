# Rigy 1.2 — hard hip limits and simplified thigh soft-tissue collision

**Status:** Executable prototype; not clinically validated. Source Mixamo animation, original FBX skin weights, Zelda v13 object controller and anchored feet remain unchanged.

## Why this was necessary

The earlier ankle solver enforced the knee hinge but allowed the hip's full upper-leg direction to travel well outside anatomical ranges. A planted foot does not make an impossible split medically or mechanically achievable. A failed reach must stop at the nearest feasible pose rather than stretch a leg, let the mesh intersect the abdomen, or save an unreachable foot anchor.

The actual implementation is in `anatomy/hip-envelope.mjs` (pure math, source-linked) and `rigy/animated/animation-pins.js` (moving pelvis frame and constrained IK).

## Hard prototype limits (degrees)

| Movement | Current cap | Interpretation |
| --- | ---: | --- |
| Hip flexion | 120 | Conservative engine default |
| Hip extension backward | 15 | Conservative engine default |
| Hip abduction outward | 42 | Conservative engine default |
| Hip adduction across the body | 18 | Conservative engine default |
| Additional axial rotation | 35 | Reserved parameter; **not yet applied** as a complete 3D per-bone twist stop |
| Knee flexion | From `medical-joints.v1.json` | One-axis hinge; passive testing differs from active motion |

These limits are intentionally **not** labelled universal biological maxima. Published normative means depend on study and test posture: hip flexion 128.4 ± 6.7, extension 17.0 ± 3.9, abduction 33.0 ± 4.8, adduction 13.8 ± 6.3, internal rotation 42.1 ± 9.6 and external rotation 43.9 ± 8.4 degrees. The selected 42-degree outward software cap is a conservative but more permissive abduction default and is not the 33-degree mean measured in the cited sample.

Joint movement is measured on the actual animated pelvis frame, not arbitrary world Euler X/Y/Z. A coupled elliptical budget and progressively reduced spread at deep flexion prevent **simultaneously** achieving all separate single-axis extrema. These combined coefficients are explicit experimental engineering approximations, not clinical fitted motion surfaces.

## Muscle/fat collision approximation

A true muscle/fat model requires volumetric tissue, body composition, deformation and collision contact mechanics **not included in this FBX**. In v1.2 the engine uses two swept thigh capsules starting below the hip joints, scaled approximately to femur length (radius 2.8–6.5 cm, depending on the rig) with 1.5 cm extra clearance. If a new pose would newly penetrate the opposing thigh, it interpolates toward the last known clear upper-leg orientation. The torso already has its own arm/forearm exclusion proxy in `anatomy/torso-collision.mjs`.

This is a geometric intrusion guard, **not a force, stiffness, muscle tendon or genuine skin-volume simulation**. Contact with the pelvis, full feet/ankles, arm-to-leg or all mesh triangles is not comprehensively simulated.

## Planted feet and continuous animation

- The input target for an ankle is first clipped to the moving pelvis-space hip sector and the actual summed thigh+shin reach, **before** it is stored as a foot anchor.
- Upper-leg rotations are re-projected into the hip cone after each IK step.
- During a controller foot drag, if the accepted IK target is mechanically unreachable, the provisional anchor is corrected to the actual achieved foot position. On release, it remains stationary there.
- Unselected foot anchors are **not** moved by the user's torso/pelvis edits. They remain targets under the original world/model anchor system.
- `AnimationMixer.update` runs before procedural posing each frame. The original clip is not replaced with a static animation or reexported.

## Verification

- `node --test tests/hip-envelope.test.mjs`: 14 passing math/capsule tests when last run locally.
- `node tests/hip-browser.test.mjs` (from GitHub workflow under Playwright): exercises both leg sides, sideways splits, cross-midline, backward extensions, extreme combined poses, actual 33-bone FBX and position/anchor agreement.
- The individual hip browser test passed for 8 extreme scenarios, with measured foot target residuals typically around 0–5 mm and under its 25 mm assertion.
- **The overall browser regression is not yet green**: a separately reported *sideways overhead arm* test still fails its elevation threshold. The passing hip tests do not establish that the full body/shoulder rig is complete.
- Test on a real Quest 3 headset before claiming controller pose tracking and visual body clearance are verified.

## Evidence

- AAOS-derived hip clinical reference values in `Physical Examination of the Hip`: https://pmc.ncbi.nlm.nih.gov/articles/PMC8167346/
- Population joint ROM study: https://pmc.ncbi.nlm.nih.gov/articles/PMC5045662/
- Han et al., *The continuum of hip range of motion: From soft-tissue restriction to bony impingement* (2020), 8 cadaveric hips, coupled movements: https://pubmed.ncbi.nlm.nih.gov/31965588/
- ISB joint coordinate standards for hip and lower body: https://pubmed.ncbi.nlm.nih.gov/11934426/

## Remaining required work

1. Rig-specific independent hip axial-twist stop + pose-dependent caps and pelvic impingement.
2. Self collision between calves, pelvis/thigh, arms/legs, actual mesh thickness.
3. True character-specific muscle/soft tissue volume and contact constraints if desired.
4. Finish the lateral overhead shoulder IK regression; this remains a separate test failure.
5. Quest 3 real-hardware test with recorded footage across animation timestamps.
