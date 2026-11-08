/** RIGY V0141: scaled original animation; endpoints NEVER inherit offsets. */
export function motionWeight(input){
 if(!Number.isFinite(input))throw new TypeError('Invalid animation weight');
 return Math.min(.20,Math.max(0,input));
}
export function relativeMotion(raw,reference,weight,maxMetres=.025){
 if(![raw.x,raw.y,raw.z,reference.x,reference.y,reference.z,weight,maxMetres].every(Number.isFinite)
   ||maxMetres<=0)throw new TypeError('Invalid source motion');
 const w=motionWeight(weight);
 const v={x:(raw.x-reference.x)*w,y:(raw.y-reference.y)*w,z:(raw.z-reference.z)*w};
 const size=Math.hypot(v.x,v.y,v.z);
 if(size>maxMetres){
  const f=maxMetres/size;v.x*=f;v.y*=f;v.z*=f;
 }
 return v;
}
