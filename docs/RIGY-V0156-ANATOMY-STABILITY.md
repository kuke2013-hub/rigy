# RIGY-V0156 — Knee anatomical stability
Baseline: 56a515974730937a29db24e45e56ede911d6e488
Rollback: backup/RIGY-V0155-before-knee-anatomy-guard
Independent version: versions/RIGY-V0156-anatomical-knee-stability

Knee is projected onto its first-pose calibrated one-axis hinge with 0–138° flexion from the medical reference. Longitudinal femur twist is limited to ±35° as an *engineering proxy*, not a clinically validated coupled joint boundary. The original hip flexion/abduction coupling and thigh collision remain. When the knee is pinned, cap contact passes to two to avoid repeated unstable spin. Final validation enforces anatomy after all leg IK. Sideways joint movement is achieved at the hip, not by off-axis tibia rotation.

Medical restrictions are an invariant in all future VRPod changes: FBX animation, controller grips, IK, locks and pose saves must never bypass the limits. Tests sample idle clip, lateral drags and measured quaternions. Original FBX, Zelda controls and scaling unchanged. Real Quest hardware not tested. Known overhead-arm issue separate.
