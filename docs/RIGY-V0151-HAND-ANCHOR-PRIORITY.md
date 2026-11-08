# RIGY-V0151 — Prioritise fixed hands during sideways elbow drags

Previous release: `cd70b23958f8742a002e38e105c90883e531c3e9` (V0150). Backup: `backup/RIGY-V0148-before-lateral-midjoint-IK`. Named version: `versions/RIGY-V0151-hand-anchor-priority`.

Browser regression identified a left-elbow lateral pose that moved correctly but placed the anchored left hand 8.37 cm from its target. New elbow pole solver now recursively reduces an unachievable pole request toward the starting elbow pose, in 50% increments (up to three retries), only when the hand error exceeds 3.4 cm. The hand remains a hard reference; feasible sideways elbow input is still accepted in full. Knee pole IK and all other controls are unchanged.

Tests must verify left/right sideways motion of both knees/elbows and anchoring; full suite includes existing known 160° lateral overhead-arm limitation. Source FBX, Zelda grips, Quest side-grip scale and anatomical ROM unchanged.
