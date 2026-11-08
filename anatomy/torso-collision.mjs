/**
 * Rigy v0.9: approximate arm-vs-torso exclusion volume.
 * This is NOT an anatomical surface or medical collision model.
 * Units: metres in a moving torso frame (+X anatomical left, +Y up, +Z forward).
 * Character dimensions come from its shoulder span and shoulder-to-hip height.
 */
const clamp=(x,l,h)=>Math.max(l,Math.min(h,x));
export function torsoPenetrationLocal(point,{shoulderSpan,torsoHeight}){
 const {x,y,z}=point;
 if(![x,y,z,shoulderSpan,torsoHeight].every(Number.isFinite)||shoulderSpan<=0||torsoHeight<=0)
  throw new TypeError("Invalid torso collision input");
 // Deliberately exclude head/neck and upper shoulder caps, which this proxy
 // cannot model accurately. The core runs from upper chest to upper pelvis.
 if(y>0.025||y< -0.86*torsoHeight)return 0;
 const t=clamp(-y/torsoHeight,0,1);
 const halfWidth=shoulderSpan*(0.43-0.095*t);
 const halfDepth=shoulderSpan*(0.32-0.025*t);
 const radial=Math.hypot(x/halfWidth,z/halfDepth);
 return clamp(1-radial,0,1);
}
export function armSegmentIntrusion(a,b,shape,skipFraction=0){
 let maximum=0;
 for(let i=0;i<=12;i++){
  const t=skipFraction+(1-skipFraction)*i/12;
  maximum=Math.max(maximum,torsoPenetrationLocal({
   x:a.x+(b.x-a.x)*t,
   y:a.y+(b.y-a.y)*t,
   z:a.z+(b.z-a.z)*t
  },shape));
 }
 return maximum;
}
export function armTorsoIntrusion(shoulder,elbow,wrist,shape){
 return Math.max(
  armSegmentIntrusion(shoulder,elbow,shape,0.18),
  armSegmentIntrusion(elbow,wrist,shape,0)
 );
}
