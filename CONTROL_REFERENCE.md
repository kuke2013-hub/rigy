# Zelda VR v13 — Control and environment contract

The following reflects the model-independent Quest 3 template and its original v13 controller baseline. Future projects must preserve these behaviours unless explicitly told otherwise.

## Environment

- WebXR `immersive-ar` passthrough on Meta Quest 3 with an alpha/transparent scene background.
- `local-floor` XR reference space. No drawn floor, grid, virtual stage or artificial scenery.
- Zero gravity `(0,0,0)`. No bounce, throwing, collision floor or unwanted drift.
- The last grip release freezes the model's **world position, orientation and scale**. Rotation may remain inverted; do not clamp it to the ground.
- Preserve model proportions and materials. The base template optionally fits the model's longest side uniformly to **1.67 m**; use `fitToView: false` to respect authoring scale.

## Controller mapping

| Action | How it works |
| --- | --- |
| Select / grab | Aim either Quest controller's target ray and press the side grip, close or distant. There is angular aim assistance but no hard-coded maximum grab range. |
| Move | Move the gripping controller up, down, left, right, closer or farther. Far-object movement also responds to the controller's pointing direction. |
| One-handed rotate | Twist, pitch, and roll the gripping wrist; the model follows the tracked controller orientation. |
| Two-handed move | Both grips can hold simultaneously. The hand midpoint and both target rays affect the model's position. Right-wrist pitch/roll remains active. |
| Two-handed resize | Spread/close both gripping hands for **linear** scaling, limited to **10%–350%**. |
| Left thumbstick X | Translate the **object** sideways, held or unheld. Do not strafe the viewer. |
| Left OR right thumbstick Y | Forward pushes the **object away**; back pulls it **closer**, held or unheld. Do not move the viewer. |
| Right thumbstick X while right grip holds | Rotate object yaw in **30° increments**; return stick to centre before another increment. |
| Right thumbstick X while right grip not held | Snap-turn viewpoint by **30° increments**; return stick to centre before another increment. |
| Release both grips | Freeze position, orientation and scale exactly; no inertia or fall. |

## Desktop preview

- Mouse drag: orbit; scroll wheel: zoom.
- W/A/S/D: desktop navigation; Shift modifies navigation speed.
- Desktop preview is a convenience, **not** a substitute for WebXR Quest 3 testing.

## Published-object brightness (newer shared layer)

`objects/shared/app.js` adds a **model-only brightness** slider in the page's pre-XR panel, from **0% = black model** to **100% = original rendered brightness**. Its selected value is applied to model shading in VR as well. It is not supposed to darken the real-world passthrough image, replace materials or change the controller engine. The base template's `app.js` does **not** automatically include this slider; published pages need the compatible shared layer and panel wiring.
