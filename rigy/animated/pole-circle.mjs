// RIGY-V0149: the locus of a middle joint with a fixed root, fixed
// distal endpoint and constant bone lengths is a circle in 3D.
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const add=(a,b)=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
const mul=(a,t)=>({x:a.x*t,y:a.y*t,z:a.z*t});
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const len=a=>Math.hypot(a.x,a.y,a.z);
export function projectedMiddleJoint(root,end,upperLength,lowerLength,requested,prior){
 if([root,end,requested,prior].some(v=>![v.x,v.y,v.z].every(Number.isFinite))||
    !Number.isFinite(upperLength)||!Number.isFinite(lowerLength)||
    upperLength<=0||lowerLength<=0)throw new TypeError('Invalid limb geometry');
 const axisLine=sub(end,root),dist=len(axisLine);
 if(dist<1e-6||dist>upperLength+lowerLength+1e-6||
    dist<Math.abs(upperLength-lowerLength)-1e-6)return null;
 const axis=mul(axisLine,1/dist);
 const along=(dist*dist+upperLength**2-lowerLength**2)/(2*dist);
 const centre=add(root,mul(axis,along));
 const radius=Math.sqrt(Math.max(0,upperLength**2-along**2));
 if(radius<1e-5)return centre;
 const perpendicular=point=>{
   const p=sub(point,centre);
   return add(p,mul(axis,-dot(p,axis)));
 };
 let pole=perpendicular(requested);
 if(len(pole)<1e-8)pole=perpendicular(prior);
 if(len(pole)<1e-8)pole=perpendicular(
   Math.abs(axis.x)<.8?add(centre,{x:1,y:0,z:0}):add(centre,{x:0,y:1,z:0}));
 return add(centre,mul(pole,radius/len(pole)));
}
