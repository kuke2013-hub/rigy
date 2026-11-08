# RIGY-V0138 — hard anatomical overrides independent of animation

Baseline commit: \`cd3120d0f46c632daafa4de08a801f68af8a1d25\`.
Backup: \`backup/RIGY-V0137-before-hard-joint-overrides\`.
Separate saved version: \`versions/RIGY-V0138-hard-joint-limits\`.

Root cause: previous shoulder axial restriction was relative to the CURRENT
Mixamo animation; a rotated keyframe could therefore become the baseline.
The elbow was only limited during incremental IK steps, so off-hinge
rotations from animation or saved poses could remain uncorrected.

Fix: at initial first-pose calibration record shoulder, humerus, elbow
local quaternions and the derived elbow hinge axis. At the FINAL pose pass
every rendered frame, regardless of source:
- Preserve torso-relative shoulder directional limits and GH approximation.
- Limit humeral longitudinal axial roll to +/-75 degrees relative to its
  calibrated first pose, not to the current animation.
- Limit clavicle proxy orientation to 55 degrees relative to first pose.
- Project the forearm onto its sole calibrated elbow hinge; 0–145 degrees
  absolute bend with zero off-axis swing.
- Apply existing torso penetration proxy and update any saved pose locks
  with the resulting valid rotations.
- Browser regression deliberately injects 175-degree shoulder, elbow and
  clavicle rotations for BOTH arms, with and without pinned saved poses.

No changes to Zelda v13, two-grip scaling, FBX geometry/rig, source
animation tracks, hip/foot controls, or materials.

The caps are conservative engineering limits for THIS initial Mixamo rig,
not clinically validated safe maxima. Additional joints require separate
anatomical axis calibration and browser validation. Existing lateral
160-degree overhead wrist-IK regression is a separate known issue.
