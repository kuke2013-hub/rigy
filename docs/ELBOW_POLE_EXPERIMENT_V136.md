# Rigy 1.3.6 shoulder IK trial — reverted

The trial in commit cb89eaee51b3f1b51500bb9b26b4b96a2b5e2fdf tested positive elbow-pole selection and a secondary geometric IK branch on large manual wrist target misses. GitHub Actions browser testing still reported ~0.129 m lateral-overhead wrist error on the 160-degree target, unchanged from the prior build. The original arm solver and cache-busted version 1.3.5 have therefore been restored in the subsequent commit; **no trial changes remain in the running controller or pose engine**.

The active known limitations remain:
- 160-degree lateral overhead target may not be reachable by the current solver despite lying within the current aggregate software shoulder envelope.
- The actual Mixamo forearm hinge plane and humeral axial twist are not calibrated into a complete position-dependent three-dimensional physiological arm model.
- The existing wrist, elbow, shoulder-complex, hip, knee and pelvis constraints were retained unchanged. Those are software approximations, not an individualized medical simulation.
- Physical Quest 3 hardware has not been tested here.

The scaling correction is independent and remains present in `rigy/controls/` while the unchanged v13 original stays under `VR_OBJECTS_TEMPLATE/`. Do not mask the failing shoulder assertion or relax the medical guard merely to make the test green.
