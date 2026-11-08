# RIGY-V0144 — Validating reachable pelvis movement with anchored endpoints

Parent: \`32d780f013624eed3449af247d964f2513d727f8\`.
Separate named version: \`versions/RIGY-V0144-reachable-grabs\`.
Rollback: \`backup/RIGY-V0140-before-pelvis-pose-engine\`.

RIGY V0143 passed its pelvis-centred pose test, but the legacy twelve-point
test requested the pelvis to move UP and outward when the pinned feet
were already near full leg extension. The new bone-length constraint
correctly rejected that physically impossible translation, so the test
reported a nearly motionless pelvis. Change this test and the old pelvis
smoke checks to request a reachable downward/lateral translation instead.

The new pelvis architecture keeps wrist/ankle placement in model-root space,
while elbows/knees and the upper body are pelvis-relative. Existing tests
that directly manipulate a saved quaternion "arm pose lock" are adapted to
the new positional-anchor model, which does not create such locks.

No anatomical limits are relaxed and no model, Zelda, scaling, or animation
assets are altered.
