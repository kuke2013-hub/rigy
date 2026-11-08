# RIGY-V0147 — Preserve an already validated arm pose

Previous commit: \`d20aa24b8efae7044513d7574db688135816dd00\`.
Independently saved version: \`versions/RIGY-V0147-preserve-valid-arm-poses\`.
Original backup: \`backup/RIGY-V0140-before-pelvis-pose-engine\`.

A wrist held overhead was still forced back through full geometric IK
every animation frame, even when its locally stored prior arm pose was
already valid. That allowed an elbow branch flip and >10cm endpoint
drift. This version retains a previously validated pose when it is
already within 18mm of the fixed wrist anchor. If the user manipulates
the arm, or pelvis/body movement requires greater adjustment, full
IK still runs. The anatomical and collision safety pass remains active.

The original FBX, Zelda controls, scaling, geometry, textures, hip
constraints, and 15% default animation influence remain unchanged.
