# RIGY-V0146 — Deterministic overhead pose setup regression

Previous source: \`edb44d0f7154bf4e0152c976178f2eb8149b1898\`.
Branch: \`versions/RIGY-V0146-overhead-regression-timing\`.
Rollback: \`backup/RIGY-V0140-before-pelvis-pose-engine\`.

The V0145 pelvis+animation test established the hand pose in the same
event tick as an explicit reset, unlike the preexisting overhead smoke test,
which gives the FBX mixer a frame to reset to its normal neutral pose.
This update follows the original deterministic setup, allows one render
settling interval and prints initial overhead shoulder diagnostics when the
test fails. The actual wrist-position tolerance is unchanged.

No geometric model, original FBX, Zelda v13 controller, IK angle
restriction or 15% animation policy is changed.
