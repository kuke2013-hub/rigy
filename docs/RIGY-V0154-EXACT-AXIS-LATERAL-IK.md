# RIGY-V0154 — Exact-axis lateral knee/elbow IK

Baseline: `99c1b4b441c15edff153517537692110a6146284`. Independent named version: `versions/RIGY-V0154-axis-preserving-lateral-IK`. Rollback: `backup/RIGY-V0148-before-lateral-midjoint-IK` or V0153.

The V0149–V0153 iterative midjoint solver either allowed an 8 cm hand error or refused sideways elbow movement. The fundamental kinematic correction is to rotate an entire upper-limb chain about its **current root-to-anchored-end axis**. This is the exact 3D bending-plane degree of freedom of a two-bone chain with fixed endpoints: the upper arm or thigh and its hinge move sideways while the wrist/ankle remains on the axis. The elbow/knee itself remains a 1-DOF hinge; the shoulder/hip provides the lateral motion.

The new solver first restores the distal anchor via existing IK if necessary, projects the requested pole to the fixed-length intersection circle, then searches bounded axis rotations with anatomical shoulder/hip envelopes and torso/thigh exclusion. Candidates that move a fixed wrist/foot more than 25 mm or worsen its existing error are rejected. Source FBX, Zelda controls, two-hand scaling, pelvis, creator materials and animation are not edited.

Regression: `tests/lateral-knee-elbow-browser.test.mjs`; known separate 160° overhead reach smoke regression remains until fixed. Quest hardware still must be tested.
