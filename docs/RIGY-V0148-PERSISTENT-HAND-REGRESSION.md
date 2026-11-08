# RIGY-V0148 — Real user-flow regression: move hand, move pelvis, animate

Parent commit: \`abeba0d96121c6618b286b45e7d081716976a7d3\`.
Saved version: \`versions/RIGY-V0148-persistent-hand-regression\`.
Preserved original: \`backup/RIGY-V0140-before-pelvis-pose-engine\`.

V0141–V0147 introduced the pelvis-centred compositor with original FBX
motion attenuated to 0–20% (default 15%), a stationary pelvis root, pelvis-
following secondary joint targets, and two hands + two feet anchored to
model-root coordinates. Old tests confirmed this architecture for regular
movements. The dedicated pelvis test then tested an unrelated extreme
160-degree forward overhead wrist pose which the older high-elevation
IK has not solved reliably; it failed before the intended primary
user-flow regression had been exercised.

This version tests exactly the core interaction:
1. Grab and relocate a wrist and release (create persistent hand anchor).
2. Grab and move pelvis in a feasible direction (do not shift hand anchor).
3. Jump to different original FBX timestamps while checking wrist target
   stays fixed within 0.01mm and the rendered hand remains within 35mm
   of its target and continues to obey hard anatomical upper-limb limits.

The separate \`tests/browser-smoke.mjs\` retains the original 160-degree
forward and lateral overhead reaches and their STRICT position tolerances.
Its failure is a real outstanding extreme-pose IK defect and is NOT
concealed by lowering thresholds or removing that smoke test.

No model, anatomy, Zelda v13 grip, two-grip scaling, material or animation
file is changed in this version. A GitHub browser test is not Quest
hardware validation.
