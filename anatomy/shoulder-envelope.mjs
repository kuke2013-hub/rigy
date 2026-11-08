/**
 * Rigy v0.6: Conservative directional shoulder constraint for this Mixamo rig.
 *
 * The angles below are ENGINEERING CHOICES, not clinical injury thresholds or
 * per-axis medical maxima. The avatar has no separately calibrated scapula or
 * clavicle chain; therefore we deliberately disallow extreme arm elevation,
 * hyperextension behind the torso and strong across-body motion. Medical ROM
 * research describes the full shoulder complex, not a single FBX upperArm bone:
 * - ISB upper-limb joint coordinate standard, PMID 15844264.
 * - 3D shoulder fluoroscopy, PMID 23389787 (plane-dependent joint rhythm).
 * - https://pmc.ncbi.nlm.nih.gov/articles/PMC8111677/ (GH/scapula coupling).
 *
 * Coordinate system is torso-relative: +X = subject's left, +Y = up,
 * +Z = anterior (forward). A bone direction points shoulder -> elbow.
 * These values must eventually be replaced by subject-specific clinical 3D
 * pose envelopes with calibrated scapulothoracic motion and muscle mechanics.
 */
export const SHOULDER_ENVELOPE_V06 = Object.freeze({
  outwardDeg: 90,        // lateral elevation while scapula remains unmodelled
  forwardDeg: 100,       // flexion elevation; no full 180 degree overhead reach
  backwardDeg: 35,      // conservative posterior extension
  acrossBodyDeg: 45,    // forward cross-chest, prevents forced medial crossover
  addedSwingDeg: 55,    // maximum added swing relative to animated frame
  addedAxialTwistDeg: 35 // relative to animated bone, around humeral long axis
});
const RAD=Math.PI/180;
const finite=n=>Number.isFinite(n);
const clamp=(v,l,h)=>Math.max(l,Math.min(h,v));
export function shoulderElevationLimit(outward,forward,limits=SHOULDER_ENVELOPE_V06){
  const out=Math.max(0,outward),inside=Math.max(0,-outward);
  const front=Math.max(0,forward),back=Math.max(0,-forward);
  const total=out+inside+front+back;
  if(total<1e-10)return limits.outwardDeg;
  return (out*limits.outwardDeg + inside*limits.acrossBodyDeg + front*limits.forwardDeg + back*limits.backwardDeg)/total;
}
/**
 * Projects a unit direction into a torso-relative feasible directional sector.
 * side is 'left' or 'right'. Return projected direction and violation metadata;
 * no hidden unit conversions, no unsafely independent Euler X/Y/Z clamps.
 */
export function projectShoulderDirection({x,y,z},side,limits=SHOULDER_ENVELOPE_V06){
  if(![x,y,z].every(finite))throw new TypeError('Non-finite shoulder vector');
  if(side!=='left'&&side!=='right')throw new TypeError('Unknown shoulder side');
  const norm=Math.hypot(x,y,z);
  if(norm<1e-9)throw new RangeError('Zero-length shoulder bone');
  x/=norm;y/=norm;z/=norm;
  const outward=x*(side==='left'?1:-1);
  const horizontal=Math.hypot(outward,z);
  const elevationDeg=Math.atan2(horizontal,-y)/RAD;
  const maximumDeg=shoulderElevationLimit(outward,z,limits);
  if(elevationDeg<=maximumDeg+1e-7)return {x,y,z,elevationDeg,maximumDeg,clamped:false};
  const angle=maximumDeg*RAD;
  const localOut=horizontal<1e-8?1:outward/horizontal;
  const localFront=horizontal<1e-8?0:z/horizontal;
  return {
    x:localOut*Math.sin(angle)*(side==='left'?1:-1),
    y:-Math.cos(angle),
    z:localFront*Math.sin(angle),
    elevationDeg:maximumDeg,
    requestedDeg:elevationDeg,
    maximumDeg,
    clamped:true
  };
}
