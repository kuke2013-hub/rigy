# RIGY-V0141 — Pelvis-centred source animation and persistent endpoint anchors

Baseline Git commit: \`bd8971bdc70eaf51ef6308bfab2c034731ec1bc6\`.
Backup: \`backup/RIGY-V0140-before-pelvis-pose-engine\`.
Version branch: \`versions/RIGY-V0141-pelvis-centred-pose\`.

## Precedence

1. The pelvis positional reference is fixed to its original model-root-local
   location until explicitly moved by its controller handle.
2. The original Mixamo source animation is sampled without changing the FBX
   file. Per-bone local rotations/positions are blended from immutable t=0
   reference at **15% default influence**, adjustable from 0–20% on the page.
3. Both hands and both feet always have model-root-local translation anchors.
   Their target locations NEVER receive animated displacement; deliberate
   controller relocation updates only the selected endpoint's anchor.
4. Knees, elbows, neck, torso and head use pelvis-following references.
   These intermediate joint targets can receive a capped 25 mm, amplitude-
   scaled, original-clipped motion residual relative to their chosen pose.
5. The pre-existing 2-bone pelvis/arm IK and anatomical limits solve the
   positions. Infeasible hand or foot constraints are reported as deviations
   rather than stretching the mesh or silently moving an anchor.
6. Zelda v13 whole-model grips remain independent: they transform the model
   anchor and all root-local endpoint positions together.

## Implementation

The new \`rigy/animated/pelvis-pose-engine.js\` owns pelvis/endpoint/animation
policy. It composes the original Mixamo samples and then calls the retained
anatomically constrained solver and input dispatchers in \`animation-pins.js\`.
Every animation sample resets untouched/previously manipulated bones from a
frozen initial pose, preventing IK drift from becoming a new animation
baseline.

The separate \`pelvis-pose-math.mjs\` implements pure tested amplitude
attenuation. All 12 controller/desktop controls remain mapped as before.
The previous Zelda controls, FBX, animation, materials and model are untouched.

## Limitations

This is a first pelvis-first **architecture iteration**, not a new
clinically validated whole-body IK solver. Two-hand/two-foot spatial
constraints can become impossible during extreme pelvis motion, at which
point the low-level solver may leave measurable residual error.
Controller/Quest hardware testing is outstanding. The previously known
160-degree lateral overhead IK regression is separate from this change.
