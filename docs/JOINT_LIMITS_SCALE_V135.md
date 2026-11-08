# Rigy 1.3.5 — Quest scaling correction and joint-limit audit

## Scaling correction (working rig only)

The original Zelda v13 controller at `VR_OBJECTS_TEMPLATE/physics-grab.js` is unchanged. Rigy now imports one versioned working copy at `rigy/controls/physics-grab.js`. The two-hand resize used to clamp **initial** hand spacing at 10 cm while live spacing was clamped at 3.5 cm. Starting both grips closer than 10 cm caused an unresponsive/underresponsive range. Both use 3.5 cm now, with linear size change and unchanged 10–350% absolute limits.

The working controller emits a status message every ~5 percentage points of scale and exposes `window.__rigyDiagnostics().wholeCharacterGrip` (connected sources, grip engagement, hold mode, scale percent). This is diagnostic instrumentation, not proof of real Quest operation. A two-grip tracking test on real Quest is still required. A small Node unit test covers linearity and scale caps.

## Current verified-in-code anatomical restrictions

- **Shoulder:** moving-torso directional constraints: 170° lateral and 175° forward total shoulder-complex elevation, 40° posterior, 65° across-body, 125° provisional glenohumeral component; added axial twist ±35° relative to animation; forearm/torso intrusion proxy. The scapula/clavicle contribution is a software approximation, not individualized anatomy.
- **Hip:** 120° flexion, 15° extension, 42° outward abduction, 18° medial adduction, combined angular restriction and thigh/thigh clearance proxy. Reserved ±35° axial twist is **not yet enforced** independently.
- **Elbow and knee:** hinge-only procedural motion; maximum bend taken from the medical profile (elbow 145°, knee 138°). The script does not presently enforce complete medical three-axis knee rotation profiles on the animated rig.
- **Head, neck, torso:** incremental quaternion caps against the current animated pose, **not calibrated per-axis anatomical X/Y/Z bounds**. Wrist and ankle handles place endpoint bones through arm/leg IK; this is **not yet an independent wrist/ankle joint rotation control**.
- **Other joints:** `anatomy/medical-joints.v1.json` records source-linked references but must not be mistaken for full enforcement in `rigy/animated/animation-pins.js`.

Clinical joint motion limits depend on rotation plane, posture, whether movement is active/passive, and coupling to neighboring joints. The 3D axis system must be calibrated to the actual FBX rig; generic Euler.x/y/z clamping on random bone axes would be erroneous. Primary sources: ISB upper limb JCS https://pubmed.ncbi.nlm.nih.gov/15844264/ and lower JCS https://pubmed.ncbi.nlm.nih.gov/11934426/; CDC ROM https://archive.cdc.gov/www_cdc_gov/ncbddd/jointrom/index.html. Do not describe current prototype as clinically validated.

## Known unresolved issues

The lateral overhead shoulder browser regression was failing before this grip-only change. It has not been silently relaxed. Neither the 1.3.5 grip correction nor its synthetic scale test establishes Quest hardware success. Next required anatomical work: rig-calibrated per-axis body and axial hip limits, full wrist/ankle rotation, coupled shoulder twist constraints, self-collision and 3D IK regression across the idle cycle.
