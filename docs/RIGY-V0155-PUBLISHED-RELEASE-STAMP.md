# RIGY-V0155 — Publish exact version / cache keys

Working geometry commit: `4f656b8d3c1de563ac72867aba2908f5eacc8899` (RIGY-V0154).
Recoverable branch: `versions/RIGY-V0155-3d-midjoint-control`.
Previous working baseline: `backup/RIGY-V0148-before-lateral-midjoint-IK`.

The V0154 lateral 3D elbow/knee pole solver passed its browser regression (both sides in both lateral directions), and the full pelvis, hand/foot anchors, all 12 grab handles, anatomical hip/shoulder limits, and torso exclusion checks. The legacy 160° lateral overhead wrist IK test remains a separate failure.

This commit assigns the matching V0155 release identifier in the displayed footer, the engine diagnostic, the source-module cache query strings, and both pelvis/lateral regression expectations, so the Quest and desktop browsers refresh the current code rather than using old ES module cache entries. It does not alter the IK algorithm or model/controller files. Original Zelda v13 scale, side grip mapping and FBX remain unchanged. No hardware validation claimed.
