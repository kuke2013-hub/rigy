/**
 * Rigy v0.9 conservative hip constraint envelope (engineered, NOT a clinical
 * full 3D safe-pose boundary). The hip is measured in the CURRENT pelvis frame:
 * +X anatomical LEFT, +Y superior, +Z anterior. Thigh points HIP -> KNEE.
 *
 * Sources for separate clinical ROM test averages:
 *   https://pmc.ncbi.nlm.nih.gov/articles/PMC8167346/
 *   https://pmc.ncbi.nlm.nih.gov/articles/PMC5045662/
 * The amount of tissue restriction strongly depends on combinations of motion:
 *   https://pubmed.ncbi.nlm.nih.gov/31965588/
 * Do not confuse clinical means with universal joint maxima or measured 3D
 * coupled limits. The coupling envelope is a reversible conservative proxy.
 */
const RAD=Math.PI/180;
const DEG=180/Math.PI;
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
export const HIP_ENVELOPE_V09=Object.freeze({
  flexionDeg:120,
  extensionDeg:15,
  abductionDeg:42,
  adductionDeg:18,
  axialTwistExtraDeg:35,
  // Experimental reducing spread in deep flexion; medical study only supports
  // qualitative coupling, not this particular mathematical multiplier.
  highFlexionAbductionReduction:0.22,
  highFlexionAdductionReduction:0.30,
  combinedBudget:1,
  // Proxy volume clearance: not material/body-fat simulation.
  softTissueClearanceMetres:0.015
});
export function hipDirectionalAngles({x,y,z},side){
 if(![x,y,z].every(Number.isFinite))throw new TypeError('Non-finite hip direction');
 if(side!=='left'&&side!=='right')throw new TypeError('Unknown hip side');
 const n=Math.hypot(x,y,z);
 if(n<1e-9)throw new RangeError('Zero-length femur');
 x/=n;y/=n;z/=n;
 const outward=x*(side==='left'?1:-1);
 const abductionDeg=Math.asin(clamp(outward,-1,1))*DEG;
 const sagittalNorm=Math.hypot(y,z);
 const flexionDeg=sagittalNorm<1e-7?0:Math.atan2(z,-y)*DEG;
 return {flexionDeg,abductionDeg};
}
export function projectHipDirection(direction,side,limits=HIP_ENVELOPE_V09){
 const start=hipDirectionalAngles(direction,side);
 let f=clamp(start.flexionDeg,-limits.extensionDeg,limits.flexionDeg);
 let b=start.abductionDeg;
 const deep=clamp(Math.max(0,f)/limits.flexionDeg,0,1);
 const maxOut=limits.abductionDeg*(1-limits.highFlexionAbductionReduction*deep);
 const maxIn=limits.adductionDeg*(1-limits.highFlexionAdductionReduction*deep);
 b=clamp(b,-maxIn,maxOut);
 // Do not allow simultaneous end-range flexion AND abduction with no tissue
 // resistance. Elliptical combined budget is an engineering approximation.
 const nf=f>=0?f/limits.flexionDeg:-f/limits.extensionDeg;
 const nb=b>=0?b/maxOut:-b/maxIn;
 const budget=Math.hypot(nf,nb);
 if(budget>limits.combinedBudget){
  const k=limits.combinedBudget/budget;
  f*=k;b*=k;
 }
 const a=f*RAD,c=b*RAD;
 const result={x:(side==='left'?1:-1)*Math.sin(c),y:-Math.cos(c)*Math.cos(a),z:Math.cos(c)*Math.sin(a)};
 return {...result,requestedFlexionDeg:start.flexionDeg,requestedAbductionDeg:start.abductionDeg,
  flexionDeg:f,abductionDeg:b,clamped:Math.hypot(result.x-direction.x/Math.hypot(direction.x,direction.y,direction.z),result.y-direction.y/Math.hypot(direction.x,direction.y,direction.z),result.z-direction.z/Math.hypot(direction.x,direction.y,direction.z))>1e-6,
  bounds:{flexionMax:limits.flexionDeg,extensionMax:limits.extensionDeg,abductionMax:maxOut,adductionMax:maxIn}};
}
/**
 * Workspace direction + reach clipping used for draggable feet; false promise
 * that a controller target can change human femur length is worse than
 * stopping at the limit. Limb solver must further account for knee geometry.
 */
export function projectHipFootGoal({x,y,z},side,maxReach,limits=HIP_ENVELOPE_V09){
 if(!Number.isFinite(maxReach)||maxReach<=0)throw new TypeError('Invalid leg reach');
 const mag=Math.hypot(x,y,z);
 if(mag<1e-9)return {x:0,y:-maxReach,z:0,clamped:true};
 const h=projectHipDirection({x,y,z},side,limits);
 const len=Math.min(mag,maxReach);
 return {x:h.x*len,y:h.y*len,z:h.z*len,clamped:h.clamped||mag>maxReach};
}
/**
 * Coarse muscle/fat VOLUME proxy for the two thighs: short cylinders from
 * 20% of hip-knee span through the knee, sampled in world metres. This does
 * NOT simulate tissue, fat percentages, deformation or physical force.
 * Returns estimated capsule overlap depth in metres. These radii are
 * engineering parameters; actual geometry should replace the proxy later.
 */
export function thighSoftTissueOverlap(a0,a1,b0,b1,radiusA,radiusB,clearance=.015){
 const vectors=[a0,a1,b0,b1];
 if(!vectors.every(v=>v&&[v.x,v.y,v.z].every(Number.isFinite))||
    ![radiusA,radiusB,clearance].every(Number.isFinite)||
    radiusA<=0||radiusB<=0||clearance<0)throw new TypeError('Invalid thigh volumes');
 let min=Infinity;
 const samples=12;
 for(let i=0;i<=samples;i++){
  const t=.20+.80*i/samples;
  const ax=a0.x+(a1.x-a0.x)*t,ay=a0.y+(a1.y-a0.y)*t,az=a0.z+(a1.z-a0.z)*t;
  for(let j=0;j<=samples;j++){
   const u=.20+.80*j/samples;
   const dx=ax-(b0.x+(b1.x-b0.x)*u);
   const dy=ay-(b0.y+(b1.y-b0.y)*u);
   const dz=az-(b0.z+(b1.z-b0.z)*u);
   const distance=Math.hypot(dx,dy,dz);
   if(distance<min)min=distance;
  }
 }
 return Math.max(0,radiusA+radiusB+clearance-min);
}