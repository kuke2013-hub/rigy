# Rigy 0.9 — Arm/torso collision guard (experimental)

## Problem
An angular shoulder envelope on its own does not stop the forearm from passing
straight through the chest. The older v0.6 screenshot shows this failure.

## Fix
1. Use the live skeleton's shoulder joints and hips to define a moving,
   character-specific trunk frame. Normalize all measured segment positions.
2. Treat the trunk as a conservative **elliptical exclusion volume** through
   the upper torso, scaled by shoulder span and shoulder-to-hip distance.
3. Sample **both upper-arm and forearm segments**, not just the wrist endpoint.
4. If a proposed pose penetrates the trunk, reduce clavicle, upper arm and
   elbow changes towards animation-frame rotations until allowable. Natural
   crossing of the arm **in front** of the chest remains possible.
5. Re-evaluate existing pinned arms on each animated frame.

## Limitations
The collision core is an ENGINEERING approximation, not clinical anatomy. It
does not collide against deforming skinned triangles, breasts/abdomen/cloth
mesh, and does not model contact forces, real scapula motion or swept collisions.
Clinical shoulder ranges cannot by themselves guarantee no penetration.

Background: ISB shoulder coordinate recommendations
https://pubmed.ncbi.nlm.nih.gov/15844264/
Shoulder biomechanics:
https://pmc.ncbi.nlm.nih.gov/articles/PMC8111677/

Tests: node --test tests/torso-collision.test.mjs; browser-smoke targets
the middle of the trunk with each wrist and replays the idle animation.
The old Zelda controls remain untouched. The overhead sideways reach
prototype still requires separate passing IK regression before a full claim.
