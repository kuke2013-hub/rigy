# RIGY-V0157 — User-reference charcoal / silver surface

Baseline: 54f862c4fb5a0b937af5b6f48e2ef9aa6c2c21bb (RIGY-V0156).
Rollback: versions/RIGY-V0156-anatomical-knee-stability.
Independent version: versions/RIGY-V0157-reference-finish.

The supplied image is a screenshot of a dark glossy character, not a UV-unwrapped texture image. Mapping the 2D screenshot to a three-dimensional skinned character would produce severe distortion. Instead, this reversible model-only preset reproduces the dark graphite base with pale glossy highlights. Supported existing materials are cloned (Phong: charcoal, pale specular, shininess 88; PBR: dark grey, 0.26 metalness, 0.27 roughness). Original textures, UVs and material objects remain preserved on each mesh for rollback; the preset is applied only to the bundled featured FBX, not user uploads. No geometry, skin weights, animation, joints, controls or 10-350% scale modified.

Test verifies reference finish applied to the loaded character with all 12 handles available. Final appearance still requires visual review and Quest headset testing.
