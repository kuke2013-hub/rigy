# RIGY-V0139 — restore all 12 grab points

Rollback baseline: \`5059382d35e6e6b2e7b2a9ea50026eef9397992d\`.
Saved backup: \`backup/RIGY-V0138-before-all-handles-repair\`.
New independently recoverable version: \`versions/RIGY-V0139-all-grab-points\`.

All current handle identities must remain accessible: left/right elbows,
wrists, knees and ankles, plus head, neck, torso and pelvis.

The desktop hover and click previously used two different metrics:
a projected pixel-distance hover versus an independent 3D ray score. A
visible elbow or knee could consequently be highlighted but an adjacent
handle selected. Shared projected hit-testing makes click select exactly
the highlighted point. Quest retains the 30cm physical trigger pick.

Added real controller-start dispatcher regression (not directly calling
begin), drag, persistent pin, visual marker displacement, current
shoulder hard-limit checks; plus desktop click selection for all handles.

Do NOT relax the upper-arm or elbow limits or alter original Zelda v13,
two-grip scale, FBX, geometry, textures, animation and foot contact.
Headset controller interaction still requires physical Quest verification.
