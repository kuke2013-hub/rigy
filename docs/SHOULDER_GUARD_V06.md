# Rigy v0.6 — shoulder angular guard (experimental)

**Reason:** the v0.5 solver capped added shoulder rotation by **100° relative to the current animated frame**, but that is not an anatomical limit. A moving Mixamo shoulder could therefore be placed far behind the torso or raised unnaturally, especially in compound 3D motion. The medical dataset did not previously constrain the actual shoulder manipulation routine. This patch **enforces** a body-relative constraint in both wrist and elbow edit paths.

## Algorithm

At each manipulated shoulder, compute an orthogonal anatomical trunk frame from actual `LeftArm` and `RightArm` shoulder origins, `Spine2` and `Hips` (right-handed, +X anatomical left, +Y toward chest/head, +Z anterior). Measure the direction **shoulder → elbow** in that moving frame. Project an out-of-range direction onto an asymmetric spherical sector by the shortest corrective quaternion. Limit additional humeral axial twist relative to the animation using a rig-specific child-bone axis. Keep subsequent wrist IK bounded; unreachable controller targets are permitted to remain unreachable rather than rotating the joint farther. The original Mixamo animation still plays; the constraint is applied *after* the mixer and only when a shoulder is actively manipulated/pinned.

### Conservative v0.6 per-humerus limits

| Torso-relative direction | Maximum arm elevation from anatomical hanging/downward axis | Qualification |
| --- | ---: | --- |
| Outward/lateral | 90° | Below normal total arm abduction because this avatar does not articulate the scapula/clavicle |
| Forward/anterior | 100° | Conservative forward reach; no full overhead motion until shoulder-girdle coupling exists |
| Backward/posterior | 35° | Conservative extension, prevents arms swept behind torso |
| Across chest/medial | 45° | Prevents extreme across-body swing without modeling scapular mechanics |
| Relative added upper-arm swing | 55° | Engineering motion cap relative to a given animated frame |
| Relative added humeral axial twist | ±35° | Engineering restriction relative to animated frame; not a clinical axial range |

For oblique directions, interpolate the angular cap from the adjacent cardinal directions using absolute normalized horizontal weights, then project the direction onto the resulting sphere sector. This is a **provisional software envelope**, not a joint coordinate system validated against 3D human motion trials.

## Evidence and limitations

Full anatomical arm elevation involves the **glenohumeral joint, scapula, clavicle and thorax**; simply permitting 180° on a single `Arm` bone is not physically realistic. Measurements show substantial plane-dependent scapulohumeral rhythm, and shoulder rotation and motion limits are coupled. Sources:

- Wu et al., ISB upper-limb joint coordinate system recommendations: https://pubmed.ncbi.nlm.nih.gov/15844264/
- Plane-of-elevation shoulder movement, normative biplane fluoroscopy, PMID 23389787: https://pubmed.ncbi.nlm.nih.gov/23389787/
- Rotator cuff/shoulder complex review: https://pmc.ncbi.nlm.nih.gov/articles/PMC8111677/
- 3D glenohumeral shoulder relationships at varying abduction: https://pmc.ncbi.nlm.nih.gov/articles/PMC4234823/

The numerical v0.6 cutoffs are **deliberately restrictive engineering choices** chosen for an avatar lacking an articulated scapula and **are not measured medical thresholds**. Do not describe an outside-the-envelope pose as a certain injury, or an inside pose as safe. Later work needs anatomically registered glenohumeral, scapulothoracic and clavicular coordinate systems; actual bone-axis calibration from a neutral rig; position-dependent twist; mesh collision and a full-body coupled IK solver.

## Testing

- `node --test tests/shoulder-envelope.test.mjs` checks both sides and anterior/posterior/lateral/medial extremes independently.
- The browser smoke loads the uploaded Mixamo FBX, tests the 12 edit points and runs **impossible** wrist movements in four planes. It asserts the resulting upper-arm direction remains inside the moving torso envelope.
- The unchanged Zelda controller is protected by the existing `VERIFY_BACKUP.py` source hash test.
- Desktop browser tests do not prove real Quest tracking/grip handling. Verify physically in Meta Quest Browser.
