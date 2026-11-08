# Rigy 1.3.6 experimental elbow-pole correction

The desktop browser regression for a 160-degree lateral reach previously left the wrist ~13 cm from its target despite the upper arm being inside its torso-relative anatomical sector. It commonly selected a near-extended elbow branch and could not follow the endpoint. The two-bone candidate now orients its elbow pole so signed elbow flexion is non-negative. Only when the original CCD leaves a >6.5 cm wrist error, a secondary two-bone solver is attempted; the original candidate is restored unless the second improves it by >=1 mm.

**Not a change to anatomical maxima:** existing 170° lateral / 175° forward total shoulder-complex caps, independent 125° GH proxy, elbow flexion bound, clavicle model, torso collision and hip restrictions remain unchanged. No change to original Zelda v13 controller or to the restored two-grip scale. Character-specific motion remains an engineering proxy, not a medically validated three-dimensional tissue simulation.

This is a rig-specific correction. CI and real Quest measurements determine whether it improves or regresses behaviour. Revert the animation and versioned imports if browser checks regress.
