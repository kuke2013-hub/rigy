# Rigy 1.3.4 — pelvis-independent hand and foot placement

**Behaviour:** dragging the hips or torso does not reparent the wrists to the moving chest. Both wrist and both foot positions are held in the immutable per-model `anchorRoot` coordinate frame. Zelda side grips still move/rotate/scale the entire character **and** its anchors together; the anchors are not pinned to the actual room during whole-object moves.

A small amount of the 13.93-second original idle animation is retained at each fixed endpoint, without resetting the overall manually established placement.

- Wrists: apply 38% of the sampled raw Mixamo animation offset from the stored reference position, capped at **3 cm**.
- Feet: preserve the existing rigid planted-foot behaviour except while editing the pelvis/torso; in body-edit mode apply 20% of source foot displacement, capped at **6 mm**.
- Rest-of-body animation continues; the original animation clip is unchanged.
- When the user first edits the pelvis/torso, previously unmanipulated wrists are anchored to their current placement. Manually moved wrist positions already have independent anchors.
- When moving the body, two-bone anatomical IK uses geometric and damped CCD candidate solutions, choosing the smaller wrist error while retaining joint angle projection and torso-clearance checks. If no pose is physically reachable, hand placement may have a residual rather than allowing injury-like rotations.
- Feet are constrained using the prior hip cone and ankle/pelvis contact solver; user-adjusted feet retain root-relative target coordinates. The original Zelda v13 whole-model control file is unchanged.

**Order each frame:** `AnimationMixer.update` → raw animated endpoint snapshots → pelvis and torso targets → constrained hip and foot IK → constrained wrist IK → torso-collision guard → render. This avoids overwriting animation with frozen character transforms.

**Verification:** `tests/pelvis-endpoint-browser.test.mjs` loads the actual FBX and tests pelvis translation, both fixed hands, both planted feet, animation checkpoints, manually repositioned hand followed by pelvis translation, and torso edits. The test measures actual skinned joint positions, not just invisible stored targets.

**Limitations:** this is a one-character Mixamo-specific solver. Shoulder girdle, full 3D clinical coupling, realistic muscle/fat contact, head/neck and all self-collision remain approximations. The previously reported lateral-overhead arm regression remains unresolved independently of the pelvis-anchor tests. Real Quest 3 controllers have not been physically tested by the assistant.

Review `anatomy/medical-joints.v1.json`, `anatomy/shoulder-envelope.mjs`, and `anatomy/hip-envelope.mjs` for evidence and limitations.
