import * as THREE from 'three';

/**
 * Rigy 0.5 grounded animated-pose overlay.
 * Important update order: AnimationMixer.update() -> PosePins.update() -> render.
 * Limb and body targets live in the unanimated model-anchor frame. Two planted
 * feet remain in that frame while the pelvis, spine and other animated bones
 * adjust to reach them. The source clip itself is never edited.
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
// Provisional RIG-SPECIFIC engineering limits on the added pose relative to
// the running animation. These are deliberately NOT claimed as medical per-bone
// maxima; aggregate cervical/shoulder clinical ranges cannot be assigned to
// each of these FBX bones.
const BODY_DELTA_LIMIT_DEG={Spine:12,Spine1:12,Spine2:16,Neck:34,Head:24};
const FEET=['left-ankle','right-ankle'];
const HIP_MAX_ROOT_SHIFT=0.65; // metres: posture is bounded by the two planted legs
function worldToParentPosition(bone,targetWorld){
 const parent=bone.parent; if(!parent)return;
 parent.updateWorldMatrix(true,false);
 bone.position.copy(parent.worldToLocal(targetWorld.clone()));
 bone.updateMatrixWorld(true);
}
function shiftBoneWorld(bone,delta){
 if(delta.lengthSq()<1e-16)return;
 worldToParentPosition(bone,worldPos(bone).add(delta));
}
function limitToAnimated(bone,animated,limitDeg){
 if(!animated)return;
 let angle=animated.angleTo(bone.quaternion);
 if(angle>limitDeg*RAD){const candidate=bone.quaternion.clone();bone.quaternion.copy(animated).slerp(candidate,limitDeg*RAD/angle);}
 bone.updateMatrixWorld(true);
}


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
  limbs.push({id:`${side.toLowerCase()}-wrist`,kind:'effector',label:`${side} wrist · lift arm`,reference:avatar.parent||avatar,upper:upperArm,hinge:forearm,effector:hand,lowerEnd:hand,kindName:'elbow',maxBend:elbowMax,maxSwing:100});
  limbs.push({id:`${side.toLowerCase()}-elbow`,kind:'bend',label:`${side} elbow · bend`,reference:avatar.parent||avatar,upper:upperArm,hinge:forearm,effector:hand,lowerEnd:hand,kindName:'elbow',maxBend:elbowMax,maxSwing:100});
  limbs.push({id:`${side.toLowerCase()}-ankle`,kind:'effector',label:`${side} ankle · lift foot`,reference:avatar.parent||avatar,upper:thigh,hinge:shin,effector:foot,lowerEnd:foot,kindName:'knee',maxBend:kneeMax,maxSwing:76});
  limbs.push({id:`${side.toLowerCase()}-knee`,kind:'bend',label:`${side} knee · bend`,reference:avatar.parent||avatar,upper:thigh,hinge:shin,effector:foot,lowerEnd:foot,kindName:'knee',maxBend:kneeMax,maxSwing:76});
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

function markerMaterial(kind){return new THREE.MeshBasicMaterial({color:kind==='bend'?0xf6b874:kind==='body'?0xb7a3f5:kind==='pelvis'?0xc8eaa0:0x76e1d1,transparent:true,opacity:0.85,depthTest:false});}

// The three requested new controls are real 3D targets, NOT unrestricted bone
// rotations. Each grip steers a short calibrated chain with a conservative
// per-segment quaternion angle bound measured from that animation frame.
function makeBodyHandles(avatar){
 const base=avatar.parent||avatar;
 const spine=pickBone(avatar,'Spine'),spine1=pickBone(avatar,'Spine1');
 const spine2=pickBone(avatar,'Spine2'),neck=pickBone(avatar,'Neck');
 const head=pickBone(avatar,'Head'),hips=pickBone(avatar,'Hips');
 return [
  {id:'torso',kind:'body',label:'Torso · bend / lean',reference:base,markerBone:spine2,chain:[spine1,spine],maxMove:0.28},
  {id:'neck',kind:'body',label:'Neck · bend / turn',reference:base,markerBone:neck,chain:[spine2,spine1,spine],maxMove:0.20},
  {id:'head',kind:'body',label:'Head · turn / tilt',reference:base,markerBone:head,chain:[head,neck,spine2],maxMove:0.26,headTip:true},
  {id:'pelvis',kind:'pelvis',label:'Hips · shift above planted feet',reference:base,markerBone:hips,maxMove:HIP_MAX_ROOT_SHIFT}
 ];
}
function steerBodyHandle(handle,desired,animated){
 // Every iteration projects each proposed rotation back inside its permitted
 // angular deviation, preventing unbounded 360-degree spine/neck twisting.
 for(let pass=0;pass<5;pass++){
  for(const bone of handle.chain){
   bone.updateWorldMatrix(true,true);
   const pivot=worldPos(bone),tip=worldPos(handle.marker);
   const from=tip.sub(pivot),to=desired.clone().sub(pivot);
   if(from.lengthSq()<1e-12||to.lengthSq()<1e-12)continue;
   const delta=Q().setFromUnitVectors(from.normalize(),to.normalize());
   delta.slerp(Q(),0.52); // damped CCD to avoid hand-tracking jitter
   const goal=delta.multiply(worldQ(bone));
   const local=worldQ(bone.parent).invert().multiply(goal).normalize();
   bone.quaternion.copy(local);
   limitToAnimated(bone,animated.get(bone),BODY_DELTA_LIMIT_DEG[bone.name.replace(/^.*?(Spine2|Spine1|Spine|Neck|Head).*$/, '$1')]||20);
  }
 }
}


export class AnimatedPosePins {
 constructor({avatar,renderer,camera,controls,medicalProfiles,onStatus=()=>{}}){
  this.avatar=avatar;this.renderer=renderer;this.camera=camera;this.controls=controls;this.onStatus=onStatus;
  this.pins=new Map();this.handles=new Map();this.active=null;this.enabled=true;this.visible=true;
  this.pointerScreen=null;this.hovered=null;
  this.limbs=makeMixamoMaps(avatar,medicalProfiles);
  this.bodyHandles=makeBodyHandles(avatar);
  this.anchorRoot=avatar.parent||avatar;
  this.hips=pickBone(avatar,'Hips');
  this.footAnchors=new Map();
  this.reanchorNextFrame=false;
  this.controllers=[renderer.xr.getController(0),renderer.xr.getController(1)];
  this.listeners=[];
  // The first animated frame is the calibration reference. A custom GLB rig
  // needs a separate mapping and axis calibration; name-based matching alone
  // is not sufficient for arbitrary human rigs.
  avatar.updateMatrixWorld(true);
  const hips=pickBone(avatar,'Hips'); const forward=V().set(0,0,1).applyQuaternion(worldQ(hips));
  this.captureFootAnchors();
  for(const limb of [...this.limbs,...this.bodyHandles]){
   if(limb.kind==='effector'||limb.kind==='bend'){
   const direction=worldPos(limb.hinge).sub(worldPos(limb.upper)).normalize();
   const expected=forward.clone().multiplyScalar(limb.kindName==='knee'?-1:1);
   let axis=direction.clone().cross(expected).normalize();
   if(axis.lengthSq()<EPS)axis.set(1,0,0);
   limb.hingeAxisLocal=axis.applyQuaternion(worldQ(limb.hinge).invert()).normalize();
   limb.initialBend=hingeFlexAngle(limb,limb.hingeAxisLocal.clone().applyQuaternion(worldQ(limb.hinge)));
   limb.markerBone=limb.kind==='effector'?limb.effector:limb.hinge;
   }
   const material=markerMaterial(limb.kind);
   const marker=new THREE.Mesh(new THREE.SphereGeometry(1,12,10),material);
   // FBX bones may be in centimetres: keep the marker ~2.7cm in the room,
   // irrespective of cumulative source import/fit scaling.
   const ws=V();limb.markerBone.getWorldScale(ws);
   marker.scale.set(0.027/Math.max(1e-8,Math.abs(ws.x)),0.027/Math.max(1e-8,Math.abs(ws.y)),0.027/Math.max(1e-8,Math.abs(ws.z)));
   marker.name='RigyGrip:'+limb.id;
   marker.renderOrder=250;marker.userData.poseHandle=limb;
   limb.markerBone.add(marker);marker.position.set(0,0,0);
   if(limb.headTip){
    const crown=worldPos(limb.markerBone).add(V().set(0,0.085,0));
    marker.position.copy(limb.markerBone.worldToLocal(crown));
   }
   limb.marker=marker;marker.visible=false;
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
 captureFootAnchors(){
  this.avatar.updateMatrixWorld(true);
  this.anchorRoot.updateWorldMatrix(true,false);
  const anchorQ=worldQ(this.anchorRoot).invert();
  for(const limb of this.limbs.filter(l=>l.kind==='effector'&&l.kindName==='knee')){
   this.footAnchors.set(limb.id,{
    targetLocal:this.anchorRoot.worldToLocal(worldPos(limb.effector)),
    orientationLocal:anchorQ.clone().multiply(worldQ(limb.effector))
   });
  }
 }
 setVisible(v){this.visible=!!v;this.updateVisibility();}
 setEnabled(v){this.enabled=!!v;if(!v)this.active=null;}
 reset(){this.pins.clear();this.active=null;this.reanchorNextFrame=true;}
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
  const target=initial?.targetLocal?limb.reference.localToWorld(initial.targetLocal.clone())
   :limb.kind==='effector'&&limb.kindName==='knee'&&this.footAnchors.has(limb.id)
    ?this.anchorRoot.localToWorld(this.footAnchors.get(limb.id).targetLocal.clone())
    :worldPos(limb.marker||limb.markerBone);
  const origin=controller?worldPos(controller):worldPos(this.camera);
  const dir=controller?V().set(0,0,-1).applyQuaternion(worldQ(controller)):V().subVectors(target,origin).normalize();
  const initialBend=initial?.bendDegrees??THREE.MathUtils.radToDeg(limb.initialBend||0);
  const holdTipLocal=initial?.holdTipLocal?.clone()||limb.reference.worldToLocal(worldPos(limb.effector||limb.markerBone));
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
  else if(limb.kind==='body'||limb.kind==='pelvis')this.storeBodyTarget(limb,target);
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
  if(limb.kindName!=='knee'&&maxReach>EPS&&offset.length()>maxReach){goal.copy(start).add(offset.setLength(maxReach));}
  const targetLocal=limb.reference.worldToLocal(goal);
  this.pins.set(limb.id,{type:'effector',targetLocal});
  if(limb.kindName==='knee'){
   const old=this.footAnchors.get(limb.id);
   this.footAnchors.set(limb.id,{targetLocal:targetLocal.clone(),orientationLocal:old.orientationLocal.clone()});
  }
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
 storeBodyTarget(handle,target){
  handle.reference.updateWorldMatrix(true,false);
  const current=worldPos(handle.marker);
  const reference=this.pins.get(handle.id)?.originalLocal||handle.reference.worldToLocal(current);
  const original=handle.reference.localToWorld(reference.clone());
  const move=target.clone().sub(original);
  if(move.length()>handle.maxMove)move.setLength(handle.maxMove);
  this.pins.set(handle.id,{type:'body',originalLocal:reference.clone(),targetLocal:handle.reference.worldToLocal(original.add(move))});
 }
 footErrors(){
  this.avatar.updateMatrixWorld(true);
  const errors={};
  for(const id of FEET){
   const l=this.limbs.find(x=>x.id===id);
   const point=this.footAnchors.get(id);
   if(l&&point)errors[id]=worldPos(l.effector).distanceTo(this.anchorRoot.localToWorld(point.targetLocal.clone()));
  }
  return errors;
 }
 moveHips(delta){
  if(delta.length()>HIP_MAX_ROOT_SHIFT)delta.setLength(HIP_MAX_ROOT_SHIFT);
  shiftBoneWorld(this.hips,delta);
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
   }else if(limb.kind==='bend')this.storeHingeTarget(limb,target,s.holdTipLocal);
   else this.storeBodyTarget(limb,target);
  }
   // Fresh animated base first: the mixer already wrote a new pose. A reset
   // reanchors to *that* animated frame, not the previously IK-adjusted frame.
   this.avatar.updateMatrixWorld(true);
   if(this.reanchorNextFrame){this.captureFootAnchors();this.reanchorNextFrame=false;}
   const animatedUpper=new Map(this.limbs.map(l=>[l.upper,l.upper.quaternion.clone()]));
   const animatedBody=new Map();
   for(const h of this.bodyHandles)for(const bone of h.chain||[])animatedBody.set(bone,bone.quaternion.clone());
   // Character's animated hip bob and root translation are compensated by the
   // two planted feet. Hips and torso can still move within leg reach via IK.
   const corrections=[];
   for(const limb of this.limbs.filter(l=>l.kind==='effector'&&l.kindName==='knee')){
    const foot=this.footAnchors.get(limb.id);
    if(foot)corrections.push(this.anchorRoot.localToWorld(foot.targetLocal.clone()).sub(worldPos(limb.effector)));
   }
   if(corrections.length){
    const average=corrections.reduce((a,b)=>a.add(b),V()).divideScalar(corrections.length);
    this.moveHips(average);
   }
   // Direct hip/pelvis manipulation moves the whole character above the feet;
   // it never drags the planted foot locations along with the hips.
   const pelvisHandle=this.bodyHandles.find(h=>h.kind==='pelvis');
   const pelvisPin=this.pins.get('pelvis');
   if(pelvisPin?.targetLocal){
    const goal=this.anchorRoot.localToWorld(pelvisPin.targetLocal.clone());
    const delta=goal.sub(worldPos(this.hips));
    this.moveHips(delta);
   }
   // Knee handles influence the pelvis as well as the upper leg, otherwise
   // fixed-length hip/knee/foot triangle can't change its bend with two fixed
   // endpoints. Limit shift to an attainable lean, then recover foot contact.
   const kneeGoals=[];
   for(const l of this.limbs.filter(l=>l.kind==='bend'&&l.kindName==='knee')){
    const p=this.pins.get(l.id);
    if(p?.targetLocal)kneeGoals.push(this.anchorRoot.localToWorld(p.targetLocal.clone()).sub(worldPos(l.hinge)));
   }
   if(kneeGoals.length&&!pelvisPin){
    const delta=kneeGoals.reduce((a,b)=>a.add(b),V()).divideScalar(kneeGoals.length).multiplyScalar(0.36);
    if(delta.length()>0.24)delta.setLength(0.24);
    this.moveHips(delta);
   }
   // Torso, neck and head offsets apply on top of the idle animation and are
   // bounded per vertebral group by conservative rig-specific angular caps.
   for(const h of this.bodyHandles.filter(h=>h.kind==='body')){
    const p=this.pins.get(h.id);if(!p?.targetLocal)continue;
    const desired=this.anchorRoot.localToWorld(p.targetLocal.clone());
    steerBodyHandle(h,desired,animatedBody);
   }
   // Leg contact priority: knee position is a secondary constraint while
   // BOTH feet always have world/model-anchor-space position goals.
   for(let pass=0;pass<2;pass++){
    for(const limb of this.limbs.filter(l=>l.kindName==='knee'&&l.kind==='bend')){
     const pin=this.pins.get(limb.id);
     if(!pin?.targetLocal)continue;
     const goal=this.anchorRoot.localToWorld(pin.targetLocal.clone());
     steerHingePosition(limb,goal,animatedUpper.get(limb.upper));
    }
    for(const limb of this.limbs.filter(l=>l.kindName==='knee'&&l.kind==='effector')){
     const anchor=this.footAnchors.get(limb.id);
     if(!anchor)continue;
     const goal=this.anchorRoot.localToWorld(anchor.targetLocal.clone());
     solveEffector(limb,goal,animatedUpper.get(limb.upper));
     // Preserve foot world orientation (no planted-foot spinning during idle).
     const desiredWorld=worldQ(this.anchorRoot).multiply(anchor.orientationLocal);
     const parentQ=worldQ(limb.effector.parent).invert();
     limb.effector.quaternion.copy(parentQ.multiply(desiredWorld).normalize());
     limb.effector.updateMatrixWorld(true);
    }
   }
   // Upper limbs are lower-priority than the grounded legs and body. Elbows
   // use a constrained hinge; shoulders use bounded swing from animation.
   for(const limb of this.limbs.filter(l=>l.kindName==='elbow'&&l.kind==='bend')){
    const p=this.pins.get(limb.id);if(!p?.targetLocal)continue;
    const goal=this.anchorRoot.localToWorld(p.targetLocal.clone());
    steerHingePosition(limb,goal,animatedUpper.get(limb.upper));
   }
   for(const limb of this.limbs.filter(l=>l.kindName==='elbow'&&l.kind==='effector')){
    const p=this.pins.get(limb.id);if(!p?.targetLocal)continue;
    const goal=this.anchorRoot.localToWorld(p.targetLocal.clone());
    solveEffector(limb,goal,animatedUpper.get(limb.upper));
   }
   this.avatar.updateMatrixWorld(true);
  this.updateVisibility();
 }
}
