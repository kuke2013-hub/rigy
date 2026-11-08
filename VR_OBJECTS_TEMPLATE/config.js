// No model is loaded by default. This is an empty, reusable VR environment.
// For a future model, upload a self-contained GLB to this template's assets
// folder and set e.g. modelUrl: './assets/my-object.glb'.
// Direct OBJ and FBX import works for basic geometry, but GLB is preferred
// because external texture/material sidecars are not reliably self-contained.
export const OBJECT_CONFIG = Object.freeze({
  modelUrl: null,
  // true = make any imported object initially fit a convenient grab size.
  // false = respect metre scale authored in the source asset.
  fitToView: true,
  targetLongestSideMetres: 1.67,
  initialYawRadians: 0,
});
