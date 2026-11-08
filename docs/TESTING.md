# Rigy test matrix (anatomy v0.1)

## Local static/math tests

```bash
python3 VERIFY_BACKUP.py
node --test tests/*.test.mjs
find anatomy VRPOD_ANATOMY_EXPERIMENT VR_OBJECTS_TEMPLATE -name '*.js' -o -name '*.mjs' | while read f; do node --check "$f"; done
```

`VERIFY_BACKUP.py` verifies original files listed in `SOURCE_CHECKSUMS.json`. Original checksums must remain unchanged. Local math tests verify elbow axis lock, knee angle-dependent passive twist proxy, wrist coupling proxy, finger MCP spread proxy, missing-data fail-closed and dataset structure. **They do not test WebXR or IK runtime with Three.js.**

## Browser integration

- Host over HTTPS; ensure external Three.js `0.186.1` and Rapier `0.21.0` CDN imports return.
- Open original `VR_OBJECTS_TEMPLATE/` and check its empty scene, file import and unchanged controls.
- Open `/VRPOD_ANATOMY_EXPERIMENT/`; ensure it starts with Pose mode off and displays a clear uncalibrated status.
- Load real skinned GLB with rig; check triangle-to-bone picking and highest-weight mapping.
- Load a deliberately unconfirmed calibration file: must reject it (not pretend a rig is calibrated).
- Load correct per-rig calibration confirmed by inspecting each axis, bind pose and parent chain.
- Test elbow flexion limits, forearm twist only, wrist flex/deviation, knee twist at straight and bent positions; verify wrong-side movement blocked.
- After trigger release, check exact pose remains. After pressing Reset, confirm bind pose restored and original Zelda world object reset.
- Confirm imported textures, UVs, morph targets, weights and proportions are not rewritten.

## Quest 3 real-hardware regression

- Verify passthrough transparency; no synthetic floor/grid, gravity, inertia, drift or model snap-to-floor.
- Left/right side grip near/distant grab, wrist pitch/roll/twist, combined two-grip movement and linear 10–350% scale.
- Left X object lateral; either stick Y depth movement; right X yaw 30° while right grip holds, viewer snap turn 30° otherwise.
- In Pose mode, triggers select and pose skinned surfaces without stealing side-grip events; simultaneous grip+trigger must not disrupt whole-object controls.
- Controller fast tracking/move/release, inverted whole-object orientation, two-handed manipulation while a limb is posed, resets.
- FPS, console warnings, GLB size, materials and visual mesh skinning deformation at extremes.
- Record Quest Browser version, headset hardware, actual rig file hash, calibration used, observed failures and video proof if possible.

A passed Node test or presence on GitHub **is not** a passed WebXR integration or real hardware test. Do not claim so.
