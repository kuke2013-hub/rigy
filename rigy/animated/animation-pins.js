import * as THREE from 'three';

/**
 * Rigy 0.2 experimental animated-pose overlay.
 * Important update order: AnimationMixer.update() -> PosePins.update() -> render.
 * Pins are expressed in a moving spine/hip frame; animation never gets paused
 * or deleted. A trigger drag edits only the selected chain and the pose is
 * reapplied every frame after the Mixamo clip updates the bones.
 *
 * Per-bone hinge axes are inferred from first animated pose and body anterior,
 * NOT medically validated anatomical calibration. Shoulder clamps are
 * conservative *relative to current animation*, not true 3-D joint envelopes.
 */
const V = () => new THREE.Vector3();
const Q = () => new THREE.Quaternion();
const TWO_PI=Math.PI*2;
const RAD=Math.PI/180;
const clamp=THREE.MathUtils.clamp;
const EPS=1e-7;
// Markers should appear only around a real nearby Quest controller.
const HANDLE_NEAR_METRES=0.30;
const DESKTOP_HOVER_PIXELS=26;

function worldQ(bone) { const q=Q();bone.getWorldQuaternion(q);return q; }
function worldPos(bone) {const v=V();bone.getWorldPosition(v);return v;}
function normalizedBoneName(name){return name.toLowerCase().replace(/[^a-z0-9]/g,'');}

function pickBone(root,suffix){
 const hits=[];
 const target=normalizedBoneName(suffix);
 // FBXLoader may sanitize `mixamorig:Hips` into `mixamorig_Hips` or similar.
 root.traverse(obj=>{if(obj.isBone && normalizedBoneName(obj.name).endsWith(target))hits.push(obj);});
 if(hits.length!==1) throw new Error(`${suffix}: found ${hits.length} bones (expected exactly one)`);
 return hits[0];
}

/**
 * An explicit two-segment limb map for the actual uploaded Mixamo FBX.
 * No equivalent mapping is presumed for unrelated skeletons.
 */
function makeMixamoMaps(avatar,profiles) {
 const spine=pickBone(avatar,'Spine2'),hips=pickBone(avatar,'Hips');
 const elbowMax=profiles?.elbow?.boundsDeg?.flexion?.[1];
 const kneeMax=profiles?.knee?.boundsDeg?.flexion?.[1];
 if(!Number.isFinite(elbowMax)||!Number.isFinite(kneeMax))throw new Error('Missing medical elbow/knee reference bounds');
 const limbs=[];
 for(const side of ['Left','Right']) {
  const upperArm=pickBone(avatar,`${side}Arm`), forearm=pickBone(avatar,`${side}ForeArm`),hand=pickBone(avatar,`${side}Hand`);
  const thigh=pickBone(avatar,`${side}UpLeg`),shin=pickBone(avatar,`${side}Leg`),foot=pickBone(avatar,`${side}Foot`);
  limbs.push({id:`${side.toLowerCase()}-wrist`,kind:'effector',label:`${side} wrist · lift arm`,reference:spine,upper:upperArm,hinge:forearm,effector:hand,lowerEnd:hand,kindName:'elbow',maxBend:elbowMax,maxSwing:120});
  limbs.push({id:`${side.toLowerCase()}-elbow`,kind:'bend',label:`${side} elbow · bend`,reference:spine,upper:upperArm,hinge:forearm,effector:hand,lowerEnd:hand,kindName:'elbow',maxBend:elbowMax,maxSwing:120});
  limbs.push({id:`${side.toLowerCase()}-ankle`,kind:'effector',label:`${side} ankle · lift foot`,reference:hips,upper:thigh,hinge:shin,effector:foot,lowerEnd:foot,kindName:'knee',maxBend:kneeMax,maxSwing:115});
  limbs.push({id:`${side.toLowerCase()}-knee`,kind:'bend',label:`${side} knee · bend`,reference:hips,upper:thigh,hinge:shin,effector:foot,lowerEnd:foot,kindName:'knee',maxBend:kneeMax,maxSwing:115});
 }
 return limbs;
}

function hingeFlexAngle(limb, axisWorld){
 const start=worldPos(limb.upper),joint=worldPos(limb.hinge),end=worldPos(limb.lowerEnd);
 const upper=joint.sub(start).normalize();const lower=end.sub(worldPos(limb.hinge)).normalize();
 // At extension vectors are parallel; cross direction distinguishes anatomic bend.
 return Math.atan2(upper.clone().cross(lower).dot(axisWorld),upper.dot(lower));
}

function useWorldRotation(bone,delta){
 bone.updateWorldMatrix(true,false);
 const rotated=delta.clone().multiply(worldQ(bone));
 const parent=bone.parent;
 if(!parent) return;
 parent.updateWorldMatrix(true,false);
 const parentQ=worldQ(parent).invert();
 bone.quaternion.copy(parentQ.multiply(rotated).normalize());
 bone.updateMatrixWorld(true);
}

function turnHinge(limb,deltaAngle){
 const bone=limb.hinge;
 const axis=limb.hingeAxisLocal.clone().applyQuaternion(worldQ(bone)).normalize();
 let current=hingeFlexAngle(limb,axis);
 if(!Number.isFinite(current))return;
 const max=limb.maxBend*RAD;
 // Underlying clip may already start bent. Don't clamp by creating a snap when
 // no delta is requested; only limit the proposed pose movement in this call.
 current=clamp(current,-Math.PI,Math.PI);
 const minDelta=-current;
 const maxDelta=max-current;
 const accepted=clamp(deltaAngle,minDelta,maxDelta);
 if(Math.abs(accepted)<1e-6)return;
 useWorldRotation(bone,new THREE.Quaternion().setFromAxisAngle(axis,accepted));
}

function signedAxisAngle(from,to,axis){
 const projectedFrom=from.clone().addScaledVector(axis,-from.dot(axis));
 const projectedTo=to.clone().addScaledVector(axis,-to.dot(axis));
 if(projectedFrom.lengthSq()<EPS||projectedTo.lengthSq()<EPS)return 0;
 projectedFrom.normalize();projectedTo.normalize();
 return Math.atan2(axis.dot(projectedFrom.clone().cross(projectedTo)),projectedFrom.dot(projectedTo));
}

function steerUpper(limb,target,animatedQ){
 const bone=limb.upper;
 const origin=worldPos(bone);
 const from=worldPos(limb.effector).sub(origin);
 const toward=target.clone().sub(origin);
 if(from.lengthSq()<EPS||toward.lengthSq()<EPS)return;
 const delta=new THREE.Quaternion().setFromUnitVectors(from.normalize(),toward.normalize());
 const worldBefore=worldQ(bone);
 const parent=worldQ(bone.parent).invert();
 const localCandidate=parent.multiply(delta.clone().multiply(worldBefore));
 const relative=animatedQ.clone().invert().multiply(localCandidate);
 const swingAngle=2*Math.acos(clamp(Math.abs(relative.w),-1,1));
 const max=limb.maxSwing*RAD;
 if(swingAngle>max && swingAngle>EPS){
  const limited=animatedQ.clone().slerp(localCandidate, max/swingAngle);
  bone.quaternion.copy(limited.normalize());
 } else bone.quaternion.copy(localCandidate.normalize());
 bone.updateMatrixWorld(true);
}

function solveEffector(limb,target,animatedUpper,lockHinge=false){
 // Damped 2-bone CCD. Both joints are reset by AnimationMixer every frame;
 // target stays in spine/hip coordinates, so results are stable across cycles.
 for(let attempt=0;attempt<8;attempt++){
  const tip=worldPos(limb.effector);
  if(tip.distanceToSquared(target)<0.000025)break;
  const joint=worldPos(limb.hinge);
  const axis=limb.hingeAxisLocal.clone().applyQuaternion(worldQ(limb.hinge)).normalize();
  const from=tip.clone().sub(joint),to=target.clone().sub(joint);
  let delta=signedAxisAngle(from,to,axis);
  if(!lockHinge)turnHinge(limb,clamp(delta*0.65,-0.28,0.28));
  steerUpper(limb,target,animatedUpper);
 }
}

/** Move the hinge point physically by steering its parent (shoulder / hip).
 * A hinge's own rotation moves its child, not the hinge itself.
 * Only 3D positions are used: bone scales/centimetres never enter these bounds.
 */
function steerHingePosition(limb,goal,animatedUpper){
 const root=worldPos(limb.upper),joint=worldPos(limb.hinge);
 const from=joint.sub(root),to=goal.clone().sub(root);
 if(from.lengthSq()<EPS||to.lengthSq()<EPS)return;
 const delta=new THREE.Quaternion().setFromUnitVectors(from.normalize(),to.normalize());
 const candidate=worldQ(limb.upper);
 const parent=worldQ(limb.upper.parent).invert();
 const local=parent.multiply(delta.multiply(candidate)).normalize();
 const swing=2*Math.acos(clamp(Math.abs(animatedUpper.clone().invert().multiply(local).w),0,1));
 const maximum=(limb.maxSwing||110)*RAD;
 limb.upper.quaternion.copy(swing>maximum&&swing>EPS
  ?animatedUpper.clone().slerp(local,maximum/swing):local);
 limb.upper.updateMatrixWorld(true);
}

function aimHingeChild(limb,tipGoal){
 const joint=worldPos(limb.hinge);
 const axis=limb.hingeAxisLocal.clone().applyQuaternion(worldQ(limb.hinge)).normalize();
 const from=worldPos(limb.effector).sub(joint),to=tipGoal.clone().sub(joint);
 if(from.lengthSq()<EPS||to.lengthSq()<EPS)return;
 const angle=signedAxisAngle(from,to,axis);
 turnHinge(limb,clamp(angle,-0.4,0.4));
}

function markerMaterial(kind){return new THREE.MeshBasicMaterial({color:kind==='bend'?0xf6b874:0x76e1d1,transparent:true,opacity:0.85,depthTest:false});}

export class AnimatedPosePins {
 constructor({avatar,renderer,camera,controls,medicalProfiles,onStatus=()=>{}}){
  this.avatar=avatar;this.renderer=renderer;this.camera=camera;this.controls=controls;this.onStatus=onStatus;
  this.pins=new Map();this.handles=new Map();this.active=null;this.enabled=true;this.visible=true;
  this.pointerScreen=null;this.hovered=null;
  this.limbs=makeMixamoMaps(avatar,medicalProfiles);
  this.controllers=[renderer.xr.getController(0),renderer.xr.getController(1)];
  this.listeners=[];
  // The first animated frame is the calibration reference. A custom GLB rig
  // needs a separate mapping and axis calibration; name-based matching alone
  // is not sufficient for arbitrary human rigs.
  avatar.updateMatrixWorld(true);
  const hips=pickBone(avatar,'Hips'); const forward=V().set(0,0,1).applyQuaternion(worldQ(hips));
  for(const limb of this.limbs){
   const direction=worldPos(limb.hinge).sub(worldPos(limb.upper)).normalize();
   const expected=forward.clone().multiplyScalar(limb.kindName==='knee'?-1:1);
   let axis=direction.clone().cross(expected).normalize();
   if(axis.lengthSq()<EPS)axis.set(1,0,0);
   limb.hingeAxisLocal=axis.applyQuaternion(worldQ(limb.hinge).invert()).normalize();
   limb.initialBend=hingeFlexAngle(limb,limb.hingeAxisLocal.clone().applyQuaternion(worldQ(limb.hinge)));
   limb.markerBone=limb.kind==='effector'?limb.effector:limb.hinge;
   const material=markerMaterial(limb.kind);
   const marker=new THREE.Mesh(new THREE.SphereGeometry(1,12,10),material);
   // FBX bones may be in centimetres: keep the marker ~2.7cm in the room,
   // irrespective of cumulative source import/fit scaling.
   const ws=V();limb.markerBone.getWorldScale(ws);
   marker.scale.set(0.027/Math.max(1e-8,Math.abs(ws.x)),0.027/Math.max(1e-8,Math.abs(ws.y)),0.027/Math.max(1e-8,Math.abs(ws.z)));
   marker.name='RigyGrip:'+limb.id;
   marker.renderOrder=250;marker.userData.poseHandle=limb;
   limb.markerBone.add(marker);marker.position.set(0,0,0);marker.visible=false;
   this.handles.set(limb.id,marker);
  }
  for(const controller of this.controllers){
   const start=()=>this.onControllerStart(controller),stop=()=>this.release(controller);
   controller.addEventListener('selectstart',start);controller.addEventListener('selectend',stop);
   this.listeners.push(()=>{controller.removeEventListener('selectstart',start);controller.removeEventListener('selectend',stop);});
  }
  this.pointerDown=(e)=>this.onPointerDown(e);
  this.pointerMove=(e)=>{this.pointerScreen={x:e.clientX,y:e.clientY};this.onPointerMove(e);};
  this.pointerUp=()=>this.onPointerUp();
  this.pointerLeave=()=>{this.pointerScreen=null;this.hovered=null;};
  renderer.domElement.addEventListener('pointerdown',this.pointerDown);
  renderer.domElement.addEventListener('pointermove',this.pointerMove);
  renderer.domElement.addEventListener('pointerleave',this.pointerLeave);
  window.addEventListener('pointerup',this.pointerUp);
 }
 setVisible(v){this.visible=!!v;this.updateVisibility();}
 setEnabled(v){this.enabled=!!v;if(!v)this.active=null;}
 reset(){this.pins.clear();this.active=null;}
 destroy(){for(const release of this.listeners)release();this.listeners=[];
  this.renderer.domElement.removeEventListener('pointerdown',this.pointerDown);
  this.renderer.domElement.removeEventListener('pointermove',this.pointerMove);
  this.renderer.domElement.removeEventListener('pointerleave',this.pointerLeave);
  window.removeEventListener('pointerup',this.pointerUp);
  for(const [id,marker] of this.handles){marker.parent?.remove(marker);marker.geometry.dispose();marker.material.dispose();}
  this.handles.clear();this.reset();}
 /** Pick a controller-close joint without requiring the user to point a laser.
  * Unlike Zelda's whole-object side grips, rig editing is deliberately local.
  */
 pickNearby(controller){
  controller.updateWorldMatrix(true,false);
  const hand=worldPos(controller);
  let closest=null,distance=HANDLE_NEAR_METRES;
  for(const marker of this.handles.values()){
   if(!this.visible)continue;
   const d=worldPos(marker).distanceTo(hand);
   if(d<=distance){distance=d;closest=marker.userData.poseHandle;}
  }
  return closest;
 }
 pickRay(origin,direction){
  let best=null,bestDistance=Infinity;
  for(const marker of this.handles.values()){
   if(!this.visible)continue;
   const vec=worldPos(marker).sub(origin),depth=vec.dot(direction);
   if(depth<0.03||depth>15)continue;
   const miss=vec.addScaledVector(direction,-depth).length();
   const allowance=Math.max(0.025,depth*0.02);
   if(miss>allowance)continue;
   const score=miss/Math.max(0.01,depth);
   if(score<bestDistance){bestDistance=score;best=marker.userData.poseHandle;}
  }
  return best;
 }
 updateVisibility(){
  this.avatar.updateMatrixWorld(true);
  const active=this.active?.limb;
  if(!this.enabled||!this.visible){
   for(const marker of this.handles.values())marker.visible=false;
   return;
  }
  const inXR=this.renderer.xr.isPresenting;
  const controllerPositions=inXR?this.controllers.map(controller=>{
   controller.updateWorldMatrix(true,false);return worldPos(controller);
  }):[];
  const rect=!inXR&&this.pointerScreen?this.renderer.domElement.getBoundingClientRect():null;
  const cursor=this.pointerScreen;
  let hovered=null,bestPixel=DESKTOP_HOVER_PIXELS;
  // Desktop does not permanently draw grab spheres either: only the point
  // directly under the cursor (or the dragged point) is highlighted.
  if(rect&&rect.width&&rect.height){
   this.camera.updateWorldMatrix(true,false);
   for(const marker of this.handles.values()){
    const ndc=worldPos(marker).project(this.camera);
    if(ndc.z<-1||ndc.z>1)continue;
    const x=rect.left+(ndc.x+1)*rect.width/2;
    const y=rect.top+(1-ndc.y)*rect.height/2;
    const distance=Math.hypot(x-cursor.x,y-cursor.y);
    if(distance<bestPixel){bestPixel=distance;hovered=marker;}
   }
  }
  this.hovered=hovered?.userData.poseHandle||null;
  for(const marker of this.handles.values()){
   const handle=marker.userData.poseHandle;
   const close=inXR&&controllerPositions.some(p=>p.distanceTo(worldPos(marker))<=HANDLE_NEAR_METRES);
   marker.visible=handle===active||(inXR?close:marker===hovered);
  }
 }
 begin(limb,controller=null,screenPoint=null){
  if(!this.enabled||!limb)return;
  const initial=this.pins.get(limb.id);
  const target=initial?.targetLocal?limb.reference.localToWorld(initial.targetLocal.clone()):worldPos(limb.markerBone);
  const origin=controller?worldPos(controller):worldPos(this.camera);
  const dir=controller?V().set(0,0,-1).applyQuaternion(worldQ(controller)):V().subVectors(target,origin).normalize();
  const initialBend=initial?.bendDegrees??THREE.MathUtils.radToDeg(limb.initialBend);
  const holdTipLocal=initial?.holdTipLocal?.clone()||limb.reference.worldToLocal(worldPos(limb.effector));
  this.active={limb,controller,screenPoint,origin,dir,initialWorld:target.clone(),reach:target.distanceTo(origin),initialBend,holdTipLocal};
  this.onStatus(`${limb.label}: move controller / mouse to set pose; release to pin while idle animation continues.`);
 }
 onControllerStart(controller){
  if(!this.enabled||this.active)return;
  controller.updateWorldMatrix(true,false);
  const origin=worldPos(controller),dir=V().set(0,0,-1).applyQuaternion(worldQ(controller));
  const hit=this.pickNearby(controller);
  if(hit)this.begin(hit,controller);
 }
 release(controller){if(this.active?.controller===controller)this.active=null;}
 onPointerDown(e){
  if(!this.enabled||this.renderer.xr.isPresenting||e.button!==0)return;
  const r=this.renderer.domElement.getBoundingClientRect();
  const ndc=new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);
  const ray=new THREE.Raycaster();ray.setFromCamera(ndc,this.camera);
  const hit=this.pickRay(ray.ray.origin,ray.ray.direction);
  if(!hit)return;
  this.begin(hit,null,{x:e.clientX,y:e.clientY});
  this.controls.enabled=false;e.preventDefault();e.stopPropagation();
 }
 onPointerMove(e){
  if(!this.active||this.active.controller||this.renderer.xr.isPresenting)return;
  const s=this.active,limb=s.limb;
  const origin=worldPos(this.camera),forward=V();this.camera.getWorldDirection(forward);
  const depth=s.initialWorld.clone().sub(origin).dot(forward);
  const rect=this.renderer.domElement.getBoundingClientRect();
  const ndc=new THREE.Vector3((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1,0.5);
  ndc.unproject(this.camera);
  const rayDir=ndc.sub(origin).normalize();
  const t=depth/Math.max(0.02,rayDir.dot(forward));
  const target=origin.addScaledVector(rayDir,t);
  if(limb.kind==='bend')this.storeHingeTarget(limb,target,s.holdTipLocal);
  else this.storeTarget(limb,target);
 }
 onPointerUp(){if(this.active&&!this.active.controller){this.active=null;this.controls.enabled=true;}}
 /** All reach tests are in WORLD METRES.
  * The previous implementation compared FBX-local centimetres against world
  * metres and snapped every wrist/ankle almost to its shoulder/hip.
  */
 storeTarget(limb,target){
  limb.reference.updateWorldMatrix(true,false);
  const start=worldPos(limb.upper),joint=worldPos(limb.hinge),tip=worldPos(limb.effector);
  const maxReach=start.distanceTo(joint)+joint.distanceTo(tip);
  const goal=target.clone(),offset=goal.clone().sub(start);
  if(maxReach>EPS&&offset.length()>maxReach){goal.copy(start).add(offset.setLength(maxReach));}
  this.pins.set(limb.id,{type:'effector',targetLocal:limb.reference.worldToLocal(goal)});
 }
 /** Orange markers are true 3D drag points. The child wrist/ankle tries to
  * remain where it was at grab start, so moving the knee can flex the shin.
  */
 storeHingeTarget(limb,target,holdTipLocal){
  limb.reference.updateWorldMatrix(true,false);
  const start=worldPos(limb.upper),joint=worldPos(limb.hinge);
  const len=start.distanceTo(joint);
  const goal=target.clone().sub(start);
  if(goal.lengthSq()>EPS)goal.setLength(len);
  else goal.copy(joint.sub(start));
  const projected=start.clone().add(goal);
  const existing=this.pins.get(limb.id);
  this.pins.set(limb.id,{type:'bend',targetLocal:limb.reference.worldToLocal(projected),
   holdTipLocal:holdTipLocal?.clone()||existing?.holdTipLocal?.clone()||limb.reference.worldToLocal(worldPos(limb.effector))});
 }
 update(){
  if(!this.enabled)return;
  const s=this.active;
  if(s?.controller){
   const limb=s.limb,controller=s.controller;
   controller.updateWorldMatrix(true,false);
   const pos=worldPos(controller),dir=V().set(0,0,-1).applyQuaternion(worldQ(controller));
   const target=s.initialWorld.clone().add(pos.sub(s.origin));
   // Physical controller displacement controls all eight points. Pointing
   // change remains useful for the cyan effectors, but no snap on selection.
   if(limb.kind==='effector'){
    const aimChange=dir.sub(s.dir).multiplyScalar(Math.min(s.reach,1)*0.5);
    target.add(aimChange);
    this.storeTarget(limb,target);
   }else this.storeHingeTarget(limb,target,s.holdTipLocal);
  }
  // Snapshot fresh animated shoulder/hip rotations *before* imposing pins.
  // AnimationMixer has just written these values. Every frame we re-solve.
  const animatedUpper=new Map(this.limbs.map(l=>[l.upper,l.upper.quaternion.clone()]));
  this.avatar.updateMatrixWorld(true);
  // Move each orange elbow/knee marker in 3D. The upper bone steers the
  // hinge, while the lower hinge rotates to keep the wrist/ankle close to its
  // world position at the beginning of the drag (in moving body coordinates).
  for(const limb of this.limbs){
   const p=this.pins.get(limb.id);
   if(!p||p.type!=='bend'||!p.targetLocal)continue;
   limb.reference.updateWorldMatrix(true,false);
   const goal=limb.reference.localToWorld(p.targetLocal.clone());
   steerHingePosition(limb,goal,animatedUpper.get(limb.upper));
   const tipGoal=limb.reference.localToWorld(p.holdTipLocal.clone());
   aimHingeChild(limb,tipGoal);
  }
  for(const limb of this.limbs){
   const p=this.pins.get(limb.id);
   if(!p||p.type!=='effector')continue;
   limb.reference.updateWorldMatrix(true,false);
   const goal=limb.reference.localToWorld(p.targetLocal.clone());
   const hingeIsPinned=this.pins.has(limb.id.replace(/-wrist$/,'-elbow').replace(/-ankle$/,'-knee'));
   if(hingeIsPinned)aimHingeChild(limb,goal);
   else solveEffector(limb,goal,animatedUpper.get(limb.upper));
  }
  this.avatar.updateMatrixWorld(true);
  this.updateVisibility();
 }
}
