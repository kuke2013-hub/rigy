# RIGY-V0149 — 3D elbow/knee manipulation

Baseline SHA: \`1d4533951cbca9739b442c2505d47a710b79a0dd\`.
Rollback branch: \`backup/RIGY-V0148-before-lateral-midjoint-IK\`.
Saved version branch: \`versions/RIGY-V0149-lateral-elbow-knee-IK\`.

An old one-off midpoint steer was overridden by the subsequent anchored wrist/foot IK. The new solver treats an actively moved elbow/knee as a persistent 3D pole-vector selection during the anchored two-bone IK, preserving the same joint on every frame.

The midpoint is projected to the constant-length intersection circle between the anatomical upper and lower segments. The parent shoulder/hip is steered and rolled within limits, and the elbow/knee remains a one-axis hinge. Root positions, hand/foot anchors, bone lengths and the source animation remain unchanged.

New regression tests independently check two-bone circle geometry and both positive and negative controller-X drags for all four middle-joint handles, including surviving source FBX animation.
Anatomical limits and fixed endpoints take precedence if the requested side pose is unreachable.

The original Zelda v13 side grips, two-grip scale, FBX model, textures, whole-character MR and community code are not changed. Hardware validation on Quest remains necessary.
