# Rigy 0.7 — Overhead shoulder reach, corrected

The 0.6 restriction of 90° lateral and 100° forward was **not** a full human-shoulder maximum. Clinical/in-vivo work shows that arm elevation combines glenohumeral joint motion with upward rotation of the scapula and linked clavicular motion. This animation rig has Mixamo `LeftShoulder` / `RightShoulder` bones but no independently rigged scapular bones.

**Implementation:** The animation mixer continues playing. Each frame the pinned wrist target is distributed between the shoulder-girdle proxy and upper-arm bone; the upper arm is projected into a separate humerus-relative envelope. The proxy contributes up to ~50° of overhead rotation above the early elevation phase, while the GH component is bounded at ~125° in primary forward and lateral planes. Total humerothoracic forward elevation is allowed to ~175°, side elevation to ~170°. Backward extension and extreme cross-body positions remain restricted.

These are software constraints derived from the broad movement anatomy and in-vivo rhythm **not a validated, subject-specific medical simulation**. Scapular protraction, posterior tilt, glenoid mechanics, end-range joint coupling, clavicle translation and soft-tissue collision are not yet physically modeled. The Mixamo Shoulder bone only approximates the combined motion.

**Tests:** Pure mathematical directional tests include permitted overhead and rejected posterior/medial extremes. Browser tests must now demonstrate actual arm elevation above 120° on the real FBX, rather than checking only that bad poses are rejected. Quest hardware confirmation is still required.

**Primary references:** [McClure et al. in-vivo overhead reach](https://pmc.ncbi.nlm.nih.gov/articles/PMC2841046/) and [Wu et al., ISB shoulder joint coordinate standard](https://pubmed.ncbi.nlm.nih.gov/15844264/).

Zelda v13 physics/grabbing remains byte-identical, and grounded feet, near-controller markers and animation remain unchanged.

## Animation-relative arm pins (Rigy 0.8)

A shoulder cap cannot preserve an arm pose if the arm's target is held in room space while the animated torso leans and turns. Arm-wrist and elbow targets now use the **animated Spine2 chest frame**. When the body moves in the idle animation, the pinned arm pose follows the chest. **Foot/ankle contacts remain in the unanimated model frame**; they do not follow pelvis animation. This fixes the observed ~28 cm wrist-target drift at a later clip timestamp. Browser regression samples the arm after a time jump and checks both elevation and wrist-goal accuracy.
