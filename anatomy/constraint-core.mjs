/**
 * VRPod medical-reference joint bounds prototype (pure math, no Three.js).
 * Medical values in medical-joints.v1.json are measurements, often separate
 * test movements, NOT a validated injury-prevention or complete 3-D envelope.
 * No bone coordinate assumptions: the Three adapter requires explicit calibration.
 */
const AXES = ['flexion','twist','abduction'];
const cap = (v, low, high) => Math.min(high, Math.max(low, v));
const finite = v => typeof v === 'number' && Number.isFinite(v);
const lerp = (a,b,t) => a+(b-a)*t;

function boundAngle(value, limits) {
  if (!Array.isArray(limits)||limits.length!==2||limits.some(v=>!finite(v))||limits[0]>limits[1])
    throw new TypeError('Malformed motion limit');
  return cap(value, limits[0], limits[1]);
}

function kneeTwistEnvelope(flexion, nodes) {
  const pts=[...nodes].sort((a,b)=>a.flexion-b.flexion);
  if(pts.length<2)throw new TypeError('Missing knee twist samples');
  if(flexion<=pts[0].flexion)return {min:-pts[0].internal,max:pts[0].external};
  for(let i=1;i<pts.length;i++){
    if(flexion<=pts[i].flexion){
      const a=pts[i-1],b=pts[i];
      const t=(flexion-a.flexion)/(b.flexion-a.flexion);
      return {min:-lerp(a.internal,b.internal,t),max:lerp(a.external,b.external,t)};
    }
  }
  const last=pts[pts.length-1];return {min:-last.internal,max:last.external};
}

// This rotated ellipse is a PROTOTYPE approximation, not a fitted cadaveric curve.
// Respect the separate signed clinical bounds first, then apply a coupled boundary.
function obliqueWristEnvelope(f, a, limits, alphaDeg) {
  const alpha=alphaDeg*Math.PI/180, c=Math.cos(alpha),s=Math.sin(alpha);
  const u=c*f+s*a, v=-s*f+c*a;
  // Directional radii intentionally remain engineering estimates.
  const radiusU=Math.max(Math.abs(limits.flexion[0]),Math.abs(limits.flexion[1]));
  const radiusV=Math.max(Math.abs(limits.abduction[0]),Math.abs(limits.abduction[1]));
  const ratio=Math.hypot(u/radiusU,v/radiusV);
  if(ratio<=1)return [f,a];
  const uc=u/ratio,vc=v/ratio;
  return [cap(c*uc-s*vc,...limits.flexion),cap(s*uc+c*vc,...limits.abduction)];
}

export function validateProfile(profile) {
  if(!profile||typeof profile!=='object')throw new TypeError('Missing joint profile');
  if(!profile.boundsDeg)throw new Error(`Joint ${profile.kind||'unknown'} not calibrated for motion`);
  for(const [axis,limit] of Object.entries(profile.boundsDeg)){
    if(!AXES.includes(axis))throw new TypeError(`Unexpected axis ${axis}`);
    boundAngle(0,limit);
  }
  return true;
}

export function constrainAnatomicalAngles(profile, requested) {
  validateProfile(profile);
  const angles={flexion:0,twist:0,abduction:0};
  for(const axis of AXES){
    const v=requested?.[axis]??0;
    if(!finite(v))throw new TypeError(`Non-finite ${axis} angle`);
    const range=profile.boundsDeg[axis]||[0,0];
    angles[axis]=boundAngle(v,range);
  }
  const coupling=profile.coupling;
  if(coupling?.type==='kneePassiveTwistByFlexion'){
    const allowed=kneeTwistEnvelope(angles.flexion,coupling.measuresDeg);
    angles.twist=cap(angles.twist,allowed.min,allowed.max);
  } else if(coupling?.type==='ellipseProxy'){
    [angles.flexion,angles.abduction]=obliqueWristEnvelope(
      angles.flexion,angles.abduction,profile.boundsDeg,coupling.orientationDeg);
  } else if(coupling?.type==='mcpSpreadReduction'){
    // Approximate, explicitly NON-clinical spread reduction as MCP flexes.
    const frac=cap(Math.max(0,angles.flexion)/Math.max(1,profile.boundsDeg.flexion[1]),0,1);
    const allowed=(1-frac)*Math.max(Math.abs(profile.boundsDeg.abduction[0]),profile.boundsDeg.abduction[1]);
    angles.abduction=cap(angles.abduction,-allowed,allowed);
  }
  return angles;
}

export function getJointProfile(dataset, profileName) {
  const profile=dataset?.profiles?.[profileName];
  if(!profile)throw new Error(`No joint profile: ${profileName}`);
  validateProfile(profile); // fail closed for unmeasured / aggregate-only joints
  if(profile.kind==='aggregateOnly')throw new Error(`Cannot assign aggregate profile to one bone: ${profileName}`);
  return profile;
}
