/**
 * Rigy v0.7: full shoulder-complex elevation with a limited clavicle/scapula proxy.
 *
 * Total elevation includes glenohumeral AND scapulothoracic contributions.
 * This is an ENGINEERING approximation using a Mixamo Shoulder bone as a
 * clavicle/scapular proxy: it cannot replicate true independent scapular
 * tilt/rotation or individual tissue mechanics.
 * Primary data: McClure et al. PMC2841046 (GH:scapula ~2.3:1 during
 * unconstrained overhead reach; ~49 deg upward scapula at maximum);
 * Wu et al. PMID 15844264 (joint vs humerothoracic coordinates).
 *
 * Coordinate system is torso-relative: +X = subject's left, +Y = up,
 * +Z = anterior (forward). A bone direction points shoulder -> elbow.
 * These values must eventually be replaced by subject-specific clinical 3D
 * pose envelopes with calibrated scapulothoracic motion and muscle mechanics.
 */
export const SHOULDER_ENVELOPE_V07 = Object.freeze({
  outwardDeg: 170,       // full shoulder-complex abduction (not single GH joint)
  forwardDeg: 175,       // full shoulder-complex forward flexion
  backwardDeg: 40,       // extension, with no invented backwards overhead arc
  acrossBodyDeg: 65,     // limited horizontal adduction with no free hyperrotation
  addedSwingDeg: 155,    // allow overhead travel; final direction still bounded
  addedAxialTwistDeg: 35,
  upwardProxyMaxDeg: 50, // scapula/clavicle contribution estimate, not a hard clinical bound
  glenohumeralMaxDeg: 125
});
export const SHOULDER_GH_ENVELOPE_V07 = Object.freeze({
  outwardDeg:125,forwardDeg:125,backwardDeg:40,acrossBodyDeg:65
});
// Legacy name retained only for import compatibility. New code uses V07.
export const SHOULDER_ENVELOPE_V06 = SHOULDER_ENVELOPE_V07;
/**
 * A two-phase APPROXIMATION to upward scapula/clavicle contribution. Below
 * ~30 deg of total elevation use very little; rising shoulder-complex angles
 * share increasing degrees with the girdle, capped near 50 degrees.
 * Published scapulohumeral ratios are not fixed universal constraints.
 */
export function shoulderGirdleCarryDegrees(totalElevationDeg,limits=SHOULDER_ENVELOPE_V07){
 if(!Number.isFinite(totalElevationDeg))throw new TypeError('Invalid elevation');
 return Math.min(limits.upwardProxyMaxDeg, Math.max(0,(totalElevationDeg-30)*0.35));
}
const RAD=Math.PI/180;
const finite=n=>Number.isFinite(n);
const clamp=(v,l,h)=>Math.max(l,Math.min(h,v));
export function shoulderElevationLimit(outward,forward,limits=SHOULDER_ENVELOPE_V07){
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
export function projectShoulderDirection({x,y,z},side,limits=SHOULDER_ENVELOPE_V07){
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
