# RIGY-V0150 — Convert pole-circle coordinates to Three.js Vector3

V0149 commit: `772085c8f7c456e0d46eeaeee744802bd5fcf19c`. V0148 backup: `backup/RIGY-V0148-before-lateral-midjoint-IK`. Saved branch: `versions/RIGY-V0150-lateral-pole-vector-fix`.

The pure geometry helper intentionally returns ordinary `{x,y,z}` coordinates for unit tests. The Three.js solver must convert this result to a `THREE.Vector3` before using `.clone()` and `.sub()`. The V0149 browser test exposed this runtime type error, and this release corrects that exact bridge without modifying source FBX, Zelda controls, anatomical limits or the 3D IK policy.
