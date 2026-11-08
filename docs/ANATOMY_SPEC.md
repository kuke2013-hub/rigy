# Rigy joint constraints — research-to-rig specification v0.1

**Intent:** translate measurements of human movement into an experimental, configurable, 3D skeleton posing engine. **Not** a medical safety system, injury predictor, or validated complete anatomical model.

## Anatomical frames

Use a right-handed neutral body reference: +X toward the subject's **left**, +Y superior/upward, +Z anterior/forward. These global coordinates define orientation only; they are **not** a promise that arbitrary glTF bone-local `.rotation.x` is flexion. Each joint has its own neutral bind rotation and local anatomical frame (a unit quaternion), confirmed by a human inspecting the rig. For simplicity v0.1 decomposes relative anatomical quaternions using XYZ Euler angles, applies scalar limits, then recomposes; this is not a validated multi-degree-of-freedom joint-coordinate solver. Results are sequence/order dependent for large compound rotations.

Internal angles (degrees): `flexion` corresponds to anatomical frame +X, `twist` to +Y, `abduction` to +Z. Local sign must be calibrated (not guessed). Quaternion transforms in `anatomy/three-joint-adapter.js` are relative to bone **rest/bind** quaternions, not world frame.

## Clinical evidence versus implementation

| Joint group | Reference | Current engine | Important qualification |
| --- | --- | --- | --- |
| Elbow | Clinical bend around 0–145° | Hinge with other axes held | Population means are not hard maxima |
| Forearm | ~77° pronation, ~85° supination in cited CDC sample | Longitudinal twist only | Pronation belongs to radioulnar system, not an independent elbow twist |
| Wrist | Clinical flexion/deviation; measured oblique dart-thrower coupling | Bounds plus rotated ellipse **proxy** | Ellipse radii and combined boundary are engineering guesses, not fitted cadaveric data |
| Glenohumeral | Shoulder motion affected by position, scapular contribution | Provisional swing/twist bounds | Shoulder complex full-arm 180° range cannot be assigned to humerus alone; scapula coupling absent |
| Hip | Passive clinical ROM | Single-axis signed bounds | Combined flexion/adduction/internal-rotation envelope **not known** from isolated means |
| Knee | Passive axial rotation rises as knee flexes | Piecewise twist envelope **proxy** | At zero flexion, exact zero twist is an artificial engineering choice; 5/30/90° sampled values from different contexts are approximate |
| Talocrural ankle | Dorsiflexion and plantarflexion clinical means | Hinge | Separate subtalar axis required for inversion/eversion |
| Fingers | Active flexion per PIP/DIP/MCP | Hinges; MCP linear spread reduction **proxy** | Finger-specific variation, lateral axis and opposition not medically calibrated |
| Cervical/global spine | Aggregate total ROM only | Disabled as a per-bone joint | Never give total cervical motion to every vertebral bone |
| Subtalar, thumb CMC, TMJ | Complex and incompletely quantified in this data | Disabled | Require reference-quality spatial and translational modelling |

The dataset file includes explicit `sources`, `evidence`, `coupledDataStatus` and `DISABLED_UNTIL_CALIBRATED` for these distinctions. Don't treat absence of values as zero physiological movement.

## Core computational path

1. Trigger selects a skinned mesh triangle; highest summed influences are used to identify the candidate bone, an experimental heuristic.
2. Walk selected bone's ancestry to gather calibrated bones. Uncalibrated bones are not assigned invented joint envelopes.
3. Estimate a controller-relative target from both hand displacement and aim changes. This is a prototype far-limb grab.
4. Apply damped CCD from selected bone toward ancestors, projecting every proposed rotation through its calibrated joint constraint.
5. Optionally align the selected bone toward tracked controller orientation, also projected to joint limits.
6. Release trigger to freeze current bone local rotations; the object's overall world transform remains under the original v13 side grips.

## Known limitations and high-priority fixes

- Early prototype CCD, not full-body IK, Jacobian method, contact-aware dynamics or analytic inverse kinematics.
- Assumes an imported rig is in its static neutral pose at calibration; animations can overwrite changes. No per-model persistent pose export yet.
- No true glenohumeral/scapulothoracic, clavicular or multi-vertebra coupling. Hip and shoulder combined rotation surfaces not validated.
- No limb-to-limb collisions, soft tissue, muscle stiffness or pathological condition modelling.
- No auto mapping across Mixamo, Rigify, VRM or custom skeletons; user-calibrated file is essential.
- The whole-shoulder and global-cervical profiles are aggregate descriptions and **must not** be applied to one bone.
- Some motion fields are experimental heuristics extrapolated from studies with different participants and measurement setups; a clinician would not treat them as safety limits.
- No test on actual Quest hardware yet. A browser may expose trigger select differently, and model skinning/raycasting differs across GLBs.

## Source references

Authoritative references (clinical values and coordinate standards; see dataset for scope):

- International Society of Biomechanics joint systems (upper body): https://pubmed.ncbi.nlm.nih.gov/15844264/
- ISB joint systems (lower body): https://pubmed.ncbi.nlm.nih.gov/11934426/
- CDC normal joint range of motion: https://archive.cdc.gov/www_cdc_gov/ncbddd/jointrom/index.html
- Hip physical examination and motion ranges: https://pmc.ncbi.nlm.nih.gov/articles/PMC8167346/
- Knee passive axial rotation: https://pubmed.ncbi.nlm.nih.gov/6869656/
- Wrist biomechanical coupling: https://pubmed.ncbi.nlm.nih.gov/15621323/
- Cervical global motion measurement: https://pubmed.ncbi.nlm.nih.gov/10521629/

Clinical references must be reviewed in the original paper before replacing v0.1 approximations with definitive combined 3D envelopes.
