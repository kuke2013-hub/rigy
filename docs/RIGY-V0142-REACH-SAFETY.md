# RIGY-V0142 — Pelvis movement reach safety and test corrections

Parent: \`5f7ef05226597b98df336a81f86a8b506b5d04f3\` (V0141).
Separate version branch: \`versions/RIGY-V0142-pelvis-reach-safety\`.
Original V0140 backup: \`backup/RIGY-V0140-before-pelvis-pose-engine\`.

With hands and feet anchored, an upward pelvis translation can be physically
impossible if both legs are already at maximum extension. V0141 kept anchors
fixed but still moved the pelvis fully, leaving actual feet/hand bone origins
short of their fixed goals by approximately 1.5–2.5 cm during the browser test.

V0142 rejects the unreachable portion of pelvis translation before storing
the pelvis pin. It bisects a proposed translation against four current
limb-length reach spheres, preserving anatomical bone length and endpoint
goal locations. The user can still move pelvis freely within feasible reach,
and the new diagnostic reports rejected pelvis travel.

Correct two test mistakes: one motion test had expected 30mm despite the
25mm micro-motion cap, and one browser test used the nonexistent field
\`pinned\` instead of the existing controller-test result's \`pinCount\`.
The source FBX, Zelda engine, rig geometry, hard joint limits, materials and
controller mapping remain unchanged.

This distance-only guard is a conservative feasibility test. Directional hip
and shoulder envelopes and collisions are still evaluated by the lower-level
joint solver; future refinements should add a multi-constraint reach
projection and better exact IK convergence.
