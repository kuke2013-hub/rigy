# RIGY-V0145 — Stable IK branch for persistent wrist anchors

Parent: \`8591ba99dcd0e8fc6115835fc4be4ccf53710adc\`.
Version: \`versions/RIGY-V0145-hand-IK-continuity\`.
Rollback: \`backup/RIGY-V0140-before-pelvis-pose-engine\`.

The V0144 browser regression revealed a raised left wrist jumped 20.6cm
from its fixed spatial anchor after the source FBX animation moved from
one timestamp to another. The old arm solver restarted from a new Mixamo
pose and selected a different bend branch.

V0145 reuses a locally stored validated humerus/clavicle/elbow orientation
as the starting IK pose for subsequent animation frames. If a new solve
moves a pinned wrist substantially away, a prior candidate is permitted
only if the wrist error is smaller AND hard shoulder/elbow limits and the
arm–torso collision check still hold. New intentional elbow/wrist drags
invalidate the old seed to permit new poses.

The modified animation-pins dependency is imported with a fresh versioned
query for correct cache invalidation on Quest and desktop browsers.

The original Zelda controls, two-hand scaling, FBX, texture, geometry,
animation clips and medical joint profiles are unchanged.
