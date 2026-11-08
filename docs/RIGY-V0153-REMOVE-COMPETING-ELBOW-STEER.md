# RIGY-V0153 — Remove competing pre-IK elbow steering

Previous version: `8a7da83d00fe09a889d44e4de35b331e2213e732` V0152. Independent saved branch: `versions/RIGY-V0153-remove-competing-elbow-steer`. Recovery: `backup/RIGY-V0148-before-lateral-midjoint-IK`.

Browser diagnostics revealed left-hand anchor mismatch already 24 cm before the new pole solver (`beforeMetres` far from `goalMetres`). The old `steerHingePosition` still rotated the upper arm before anchored-body IK on every elbow edit, conflicting with the new bend-plane computation. Skip this preliminary steer when `bodyAnchorMode` is true; allow the downstream `solveWithMiddlePole` to own the entire shoulder–elbow–wrist chain. Preserve legacy behaviour for nonanchored models. Anatomical caps, stationary endpoints, Zelda grips, two-hand scale and FBX are untouched.
