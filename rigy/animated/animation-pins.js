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
  limbs.push({id:`${side.toLowerCase()}-elbow`,kind:'bend',label:`${side} elbow · bend`,reference:spine,upper:upperArm,hinge:forearm,effector:hand,lowerEnd:hand,kindName:'elbow',maxBend:elbowMax});
  limbs.push({id:`${side.toLowerCase()}-ankle`,kind:'effector',label:`${side} ankle · lift foot`,reference:hips,upper:thigh,hinge:shin,effector:foot,lowerEnd:foot,kindName:'knee',maxBend:kneeMax,maxSwing:115});
  limbs.push({id:`${side.toLowerCase()}-knee`,kind:'bend',label:`${side} knee · bend`,reference:hips,upper:thigh,hinge:shin,effector:foot,lowerEnd:foot,kindName:'knee',maxBend:kneeMax});
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

function markerMaterial(kind){return new THREE.MeshBasicMaterial({color:kind==='bend'?0xf6b874:0x76e1d1,transparent:true,opacity:0.85,depthTest:false});}

export class AnimatedPosePins {
 constructor({avatar,renderer,camera,controls,medicalProfiles,onStatus=()=>{}}){
  this.avatar=avatar;this.renderer=renderer;this.camera=camera;this.controls=controls;this.onStatus=onStatus;
  this.pins=new Map();this.handles=new Map();this.active=null;this.enabled=true;this.visible=true;
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
   limb.markerBone.add(marker);marker.position.set(0,0,0);
   this.handles.set(limb.id,marker);
  }
  for(const controller of this.controllers){
   const start=()=>this.onControllerStart(controller),stop=()=>this.release(controller);
   controller.addEventListener('selectstart',start);controller.addEventListener('selectend',stop);
   this.listeners.push(()=>{controller.removeEventListener('selectstart',start);controller.removeEventListener('selectend',stop);});
  }
  this.pointerDown=(e)=>this.onPointerDown(e);
  this.pointerMove=(e)=>this.onPointerMove(e);
  this.pointerUp=()=>this.onPointerUp();
  renderer.domElement.addEventListener('pointerdown',this.pointerDown);
  renderer.domElement.addEventListener('pointermove',this.pointerMove);
  window.addEventListener('pointerup',this.pointerUp);
 }
 setVisible(v){this.visible=!!v;for(const mesh of this.handles.values())mesh.visible=this.visible;}
 setEnabled(v){this.enabled=!!v;if(!v)this.active=null;}
 reset(){this.pins.clear();this.active=null;}
 destroy(){for(const release of this.listeners)release();this.listeners=[];
  this.renderer.domElement.removeEventListener('pointerdown',this.pointerDown);
  this.renderer.domElement.removeEventListener('pointermove',this.pointerMove);
  window.removeEventListener('pointerup',this.pointerUp);
  for(const [id,marker] of this.handles){marker.parent?.remove(marker);marker.geometry.dispose();marker.material.dispose();}
  this.handles.clear();this.reset();}
 pickRay(origin,direction){
  let best=null;let bestAngle=Infinity;
  for(const marker of this.handles.values()){
   if(!marker.visible)continue;
   const c=worldPos(marker),vec=c.sub(origin),depth=vec.dot(direction);
   if(depth<0.03||depth>12)continue;
   const miss=vec.addScaledVector(direction,-depth).length();
   const allowance=Math.max(0.05,depth*0.045);
   if(miss>allowance)continue;
   const score=miss/depth;
   if(score<bestAngle){bestAngle=score;best=marker.userData.poseHandle;}
  }
  return best;
 }
 begin(limb,controller=null,screenPoint=null){
  if(!this.enabled||!limb)return;
  const initial=this.pins.get(limb.id);
  const target=initial?.targetLocal?limb.reference.localToWorld(initial.targetLocal.clone()):worldPos(limb.markerBone);
  const origin=controller?worldPos(controller):worldPos(this.camera);
  const dir=controller?V().set(0,0,-1).applyQuaternion(worldQ(controller)):V().subVectors(target,origin).normalize();
  const initialBend=initial?.bendDegrees??THREE.MathUtils.radToDeg(limb.initialBend);
  this.active={limb,controller,screenPoint,origin,dir,initialWorld:target.clone(),reach:target.distanceTo(origin),initialBend};
  this.onStatus(`${limb.label}: move controller / mouse to set pose; release to pin while idle animation continues.`);
 }
 onControllerStart(controller){
  if(!this.enabled||this.active)return;
  controller.updateWorldMatrix(true,false);
  const origin=worldPos(controller),dir=V().set(0,0,-1).applyQuaternion(worldQ(controller));
  const hit=this.pickRay(origin,dir);
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
  if(limb.kind==='bend'){
   const dy=s.screenPoint.y-e.clientY;
   const bend=clamp(s.initialBend+dy*0.45,0,limb.maxBend);
   this.pins.set(limb.id,{type:'bend',bendDegrees:bend});
  }else{
   const origin=worldPos(this.camera),forward=V();this.camera.getWorldDirection(forward);
   const depth=s.initialWorld.clone().sub(origin).dot(forward);
   const rect=this.renderer.domElement.getBoundingClientRect();
   const ndc=new THREE.Vector3((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1,0.5);
   ndc.unproject(this.camera);
   const rayDir=ndc.sub(origin).normalize();
   const t=depth/Math.max(0.02,rayDir.dot(forward));
   const target=origin.addScaledVector(rayDir,t);
   this.storeTarget(limb,target);
  }
 }
 onPointerUp(){if(this.active&&!this.active.controller){this.active=null;this.controls.enabled=true;}}
 storeTarget(limb,target){
  limb.reference.updateWorldMatrix(true,false);
  const local=limb.reference.worldToLocal(target.clone());
  // Bound target radius to a plausible small editing region; 2-bone IK also
  // naturally saturates at full extension.
  const origin=limb.reference.worldToLocal(worldPos(limb.upper));
  const rel=local.clone().sub(origin),limit=Math.max(0.3,worldPos(limb.upper).distanceTo(worldPos(limb.hinge))*3.3);
  if(rel.length()>limit)local.copy(origin.add(rel.setLength(limit)));
  this.pins.set(limb.id,{type:'effector',targetLocal:local});
 }
 update(){
  if(!this.enabled)return;
  const s=this.active;
  if(s?.controller){
   const limb=s.limb,controller=s.controller;
   controller.updateWorldMatrix(true,false);
   const pos=worldPos(controller),dir=V().set(0,0,-1).applyQuaternion(worldQ(controller));
   if(limb.kind==='bend'){
    const vertical=pos.y-s.origin.y;
    const aimTurn=(dir.y-s.dir.y)*0.5;
    const bend=clamp(s.initialBend+(vertical+aimTurn)*130,0,limb.maxBend);
    this.pins.set(limb.id,{type:'bend',bendDegrees:bend});
   }else{
    const target=s.initialWorld.clone().add(pos.sub(s.origin));
    const aimChange=dir.sub(s.dir).multiplyScalar(Math.min(s.reach,5)*0.8);
    target.add(aimChange);
    this.storeTarget(limb,target);
   }
  }
  // Snapshot fresh animated shoulder/hip rotations *before* imposing pins.
  // AnimationMixer has just written these values. Every frame we re-solve.
  const animatedUpper=new Map(this.limbs.map(l=>[l.upper,l.upper.quaternion.clone()]));
  this.avatar.updateMatrixWorld(true);
  // Persistent direct bend pins before downstream effector goals.
  for(const limb of this.limbs){
   const p=this.pins.get(limb.id);
   if(!p||p.type!=='bend')continue;
   const axis=limb.hingeAxisLocal.clone().applyQuaternion(worldQ(limb.hinge)).normalize();
   const current=hingeFlexAngle(limb,axis);
   turnHinge(limb,p.bendDegrees*RAD-current);
  }
  for(const limb of this.limbs){
   const p=this.pins.get(limb.id);
   if(!p||p.type!=='effector')continue;
   limb.reference.updateWorldMatrix(true,false);
   const goal=limb.reference.localToWorld(p.targetLocal.clone());
   const locked=this.pins.has(limb.id.replace(/-wrist$/,"-elbow").replace(/-ankle$/,"-knee"));
   solveEffector(limb,goal,animatedUpper.get(limb.upper),locked);
  }
  this.avatar.updateMatrixWorld(true);
 }
}