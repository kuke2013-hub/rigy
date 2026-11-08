# VR Objects — model-free Quest 3 environment

This folder is the **reusable, model-independent environment** extracted from
[`kuke2013-hub/vrzzz`](https://github.com/kuke2013-hub/vrzzz) at
**Zelda VR Version 13.0** (initial baseline commit
[`362e97ff29d42641981c0cb0f8672b3a89db3fc0`](https://github.com/kuke2013-hub/vrzzz/commit/362e97ff29d42641981c0cb0f8672b3a89db3fc0)).

**No Zelda mesh, model files, or built-in demo model is included.**
The controller/physics module preserves the v13 controller algorithms,
with model-specific wording and the original character's forced initial
orientation/reset replaced by a generic per-object spawn pose. The original Zelda app remains unchanged.

## Files

- `index.html`: asset-free interface and "Enter Passthrough" button
- `app.js`: original WebXR/joystick mapping, plus generic model import
- `physics-grab.js`: model-agnostic v13 controller & zero-gravity engine
- `config.js`: optional model URL, proportional fit and initial yaw
- `PROJECT_INSTRUCTIONS.md`: rules to paste into a new ChatGPT Project

## Add a new 3D object

**Preferred: GLB.** Convert OBJ, FBX, GLTF, DAE, STL, BLEND, etc. to a
self-contained **.glb** (geometry, materials and textures embedded) before
committing. Blender can be used as a converter. Preserve normals, UVs,
textures, hierarchy, bone transforms and relative proportions as applicable.

Either (a) choose a local GLB, OBJ or FBX using the file input (when your
browser supports file pickers), or (b) place a `my-object.glb` asset in
`assets/` in the same folder and set `modelUrl: './assets/my-object.glb'`
in `config.js`. **No network model is fetched by default.**

OBJ and FBX direct loading are basic convenience paths. External .mtl,
textures, FBX referenced textures, and .gltf sidecar buffers may require
conversion to GLB. GLTF with external resources is not supported by the
local file picker in this template.

By default `fitToView: true` uniformly scales a model's longest dimension
to 1.67m for easy first interaction, without stretching its geometry.
Set `fitToView: false` for assets authored at exact real-world metre scale.
Imported models are recentered and initially placed roughly 2m in front of
the viewer. No forced 90° yaw or Zelda-specific crouched model assumptions.

## Behaviour to preserve — baseline v13

- Quest 3 WebXR `immersive-ar`, `local-floor`, clear/transparent
  background: actual passthrough, no drawn floor/grid/stage.
- Gravity `(0,0,0)`; no collision floor, bounce, throwing or drift.
  Releasing the final side grip freezes exact world position, scale and rotation.
- Target-ray selection with modest 7° angular assist, no hard-coded maximum
  grab distance; the second grip can join after the first selects the model.
- While held, either hand physically moves and rotates the model. Distant
  translation uses both tracked grip motion and target-ray aiming changes.
- Both grips: left/right hand midpoint and ray direction contribute to
  position; right-wrist pitch/roll remains active. Spreading hands
  scales **linearly from 0.10× to 3.50×**.
- Left stick X moves model sideways, even if not held.
- Either stick Y pushes model away when forward, pulls it closer when back,
  even if not held. Thumbsticks do **not** walk the player.
- Right stick X: free = 30° viewpoint snap-turn; right grip held = 30°
  object yaw per stick tilt, requiring recenter.
- Original WebXR camera, rig, lighting, renderer settings, depth range,
  release physics and controller-mapping logic retained.

## Deployment and testing

On the existing repository's GitHub Pages, the empty template would be at:
https://kuke2013-hub.github.io/vrzzz/VR_OBJECTS_TEMPLATE/

You can copy this folder to another GitHub repo's root and enable Pages.
Serve over HTTPS: Quest passthrough cannot run from a local file.
Verify the exported object's scale, materials, loading and controls on the
**physical Quest 3**; source syntax tests do not prove headset behaviour.

Do not silently modify this baseline when working on new object projects.
Make an object-specific copy or a new version. The source `vrzzz` app is
left intact.

**Versioning:** This is Template 1.0 based on v13.0 controls. Preserve
`VR_OBJECTS_TEMPLATE/` as the immutable-ish known-good base; changes
to future object instances belong in separate folders/repos.


## Catalogue-wide brightness and publishing

Published objects reuse \`objects/shared/app.js\`, which automatically injects a "Model brightness" slider in the pre-VR panel. It defaults to 100% original appearance and dims the model to black at 0% without dimming passthrough. Do not duplicate the brightness controller in each object's folder. The underlying \`physics-grab.js\` remains the Zelda VR v13 baseline.

Do not consider an object published until its real, case-sensitive \`assets/<name>.glb\` binary is present in GitHub and loads with HTTP 200 from GitHub Pages. A successful Pages build is insufficient. The assistant—not the user—is responsible for the full upload and verification. If the connected tools cannot transfer binary files, report that the model publication is blocked; do not shift the manual upload to the user or mislabel the object as ready.
