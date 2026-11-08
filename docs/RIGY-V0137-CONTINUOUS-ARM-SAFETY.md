# RIGY-V0137 — Continuous shoulder and arm/torso protection

## Recoverable history

Baseline commit: \`f4ccfffdeed2b00c56b694c574be420fd8ed83ef\`.
Backup branch: \`backup/RIGY-V0135-before-continuous-shoulder-guard\`.
Named saved version: \`versions/RIGY-V0137-continuous-arm-safety\`.

Every frame now validates both arms after source Mixamo animation, IK and
pose-lock restoration. A torso-relative shoulder envelope and coarse
upper-arm/forearm torso exclusion take precedence over impossible user
targets. A previously safe local arm pose is reused if available; otherwise
a bounded scan of humerus and elbow rotations finds a minimum-penetration
configuration. An invalid source animation frame is no longer used as the
collision baseline. Detailed safety outcome is exposed in shoulder
diagnostics. Test injection forces both unpinned arms toward the chest.

Original Zelda v13 and current working two-grip scale source, FBX,
materials, idle animation, hip and foot constraints are unchanged.

LIMITATIONS: This is a coarse sampled torso collision proxy, not mesh-perfect
self-collision or a clinically validated biomechanical model. Infeasible
hand targets may be left unmet. Real Quest validation is still required.
The old baseline's 160-degree lateral overhead IK regression remains a
separate unresolved issue unless the new CI proves otherwise.
