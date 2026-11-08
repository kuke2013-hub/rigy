import * as THREE from 'three';
import {AnimatedPosePins} from './animation-pins.js?v=rigy-1.5.5';
import {motionWeight,relativeMotion} from './pelvis-pose-math.mjs';

/**
 * RIGY V0141: pelvis-centred animation compositor with stable endpoints.
 *
 * The Mixamo clip remains unchanged. An immutable t=0 pose is used every
 * frame, so rotations from an earlier IK solve cannot become an animation
 * reference. The FBX's original motion is blended at 15% amplitude.
 * The pelvis is stationary unless explicitly moved by the user.
 * Both hands and both feet hold root-space placement targets; head, torso,
 * neck, elbows and knees follow the pelvis and retain subtle source motion.
 *
 * The anatomically limited IK and the existing 12 Quest grab dispatchers are
 * reused as low-level solvers; this class owns the NEW authoritative state.
 */
const V=()=>new THREE.Vector3();
const world=b=>b.getWorldPosition(V());
export class PelvisPoseEngine extends AnimatedPosePins {
 constructor(options){
  super(options);
  this.engineVersion='RIGY-V0155';
  this.animationInfluence=motionWeight(.15);
  this.pelvisAnchored=true;
  this.bodyAnchorMode=true;
  this.armPoseLocks.clear();
  this.armPoseSeeds=new Map();
  this.reanchorNextFrame=false;
  this.anchorRoot.updateWorldMatrix(true,false);
  this.pelvisHomeLocal=this.anchorRoot.worldToLocal(world(this.hips));
  this.boneNeutral=new Map();
  this.sourcePose=new Map();
  this.avatar.traverse(b=>{
   if(!b.isBone)return;
   const initial={q:b.quaternion.clone(),p:b.position.clone()};
   this.boneNeutral.set(b,initial);
   this.sourcePose.set(b,{q:initial.q.clone(),p:initial.p.clone()});
  });
  // These four root-relative end positions are the canonical anchors.
  // Their absolute positions change only through an explicit endpoint grip
  // or a whole-model Zelda grip, NEVER through pelvis reposition or idle.
  this.homeEndpoints=new Map();
  for(const limb of this.limbs.filter(l=>l.kind==='effector')){
   const anchor=(limb.kindName==='knee'?this.footAnchors:this.handAnchors).get(limb.id);
   this.homeEndpoints.set(limb.id,{targetLocal:anchor.targetLocal.clone(),
     orientationLocal:anchor.orientationLocal?.clone()});
  }
  // Knee/elbow/body edits should travel with the pelvis, not remain fixed
  // to the whole-object anchor as they did in older patch-based versions.
  for(const l of this.limbs.filter(l=>l.kind==='bend'&&l.kindName==='knee'))
   l.reference=this.hips;
  for(const h of this.bodyHandles.filter(h=>h.kind==='body'))
   h.reference=this.hips;
  this.homeJointPelvis=new Map();
  this.rawJointPelvis=new Map();
  this.jointMicroMotion=new Map();
  this.avatar.updateMatrixWorld(true);
  for(const h of [...this.limbs,...this.bodyHandles]){
   const p=this.hips.worldToLocal(world(h.marker));
   this.homeJointPelvis.set(h.id,p.clone());
   this.rawJointPelvis.set(h.id,p);
  }
 }
 setAnimationInfluence(value){this.animationInfluence=motionWeight(Number(value));}
 /**
  * Keep the pelvis within the intersection of all four anchored limb-reach
  * spheres. When a requested translation is unreachable, move part-way
  * along the requested direction instead of moving an anchored hand/foot.
  *
  * Translation moves each limb root with the pelvis without changing bone
  * lengths. We keep the maximal achievable step with a small reach reserve.
  */
 limitPelvisWorldGoal(requested){
  const start=world(this.hips),shift=requested.clone().sub(start);
  this.lastPelvisRejectedMetres=0;
  if(shift.lengthSq()<1e-12)return requested;
  const constraints=[];
  for(const limb of this.limbs.filter(l=>l.kind==='effector')){
   const root=world(limb.upper),joint=world(limb.hinge),tip=world(limb.effector);
   const end=this.endpointGoal(limb);
   const max=root.distanceTo(joint)+joint.distanceTo(tip);
   // If animated joints are already marginally beyond full extension,
   // a pelvis drag must not make that distance any worse.
   const permitted=Math.max(max-0.003,root.distanceTo(end));
   constraints.push({root,end,permitted});
  }
  const within=factor=>constraints.every(c=>
    c.root.clone().addScaledVector(shift,factor).distanceTo(c.end)<=c.permitted+1e-7);
  if(within(1))return requested;
  let low=0,high=1;
  for(let step=0;step<20;step++){
   const middle=(low+high)*.5;
   if(within(middle))low=middle;else high=middle;
  }
  this.lastPelvisRejectedMetres=shift.length()*(1-low);
  return start.addScaledVector(shift,low);
 }
 // Intercept pelvis drags BEFORE they become saved pose targets. All 12
 // existing handles still use the original controller/pointer dispatchers.
 storeBodyTarget(handle,target){
  super.storeBodyTarget(handle,handle.id==='pelvis'
    ?this.limitPelvisWorldGoal(target):target);
 }
 // Never let a clip displace an anchored wrist or foot.
 animatedOffset(){return V();}
 endpointGoal(limb){
  const anchor=(limb.kindName==='knee'?this.footAnchors:this.handAnchors).get(limb.id);
  return anchor?this.anchorRoot.localToWorld(anchor.targetLocal.clone()):world(limb.effector);
 }
 // Middle joint targets use pelvis motion as the reference and retain 15% of
 // the ORIGINAL programmed clip around a manually chosen resting position.
 jointTarget(handle,pin){
  const desired=handle.reference.localToWorld(pin.targetLocal.clone());
  const residual=this.jointMicroMotion.get(handle.id);
  if(residual&&handle.id!=='pelvis'){
   const pivot=world(this.hips);
   desired.add(this.hips.localToWorld(residual.clone()).sub(pivot));
  }
  return desired;
 }
 // Called immediately BEFORE advancing the animation mixer.
 prepareAnimationFrame(){
  for(const [b,neutral] of this.boneNeutral){
   b.quaternion.copy(neutral.q);
   b.position.copy(neutral.p);
  }
  this.avatar.updateMatrixWorld(true);
 }
 // Called immediately AFTER the mixer, BEFORE constraint solving.
 captureSourceAnimation(){
  for(const [b] of this.boneNeutral)
   this.sourcePose.set(b,{q:b.quaternion.clone(),p:b.position.clone()});
  this.avatar.updateMatrixWorld(true);
  for(const h of [...this.limbs,...this.bodyHandles])
   this.rawJointPelvis.set(h.id,this.hips.worldToLocal(world(h.marker)));
 }
 applyAnimatedPose(){
  const intensity=this.animationInfluence;
  for(const [b,base] of this.boneNeutral){
   const source=this.sourcePose.get(b)||base;
   b.quaternion.copy(base.q).slerp(source.q,intensity);
   b.position.copy(base.p).lerp(source.p,intensity);
  }
  this.avatar.updateMatrixWorld(true);
  this.jointMicroMotion.clear();
  for(const [id,base] of this.homeJointPelvis){
   if(id==='pelvis'||id.endsWith('-wrist')||id.endsWith('-ankle'))continue;
   const source=this.rawJointPelvis.get(id);
   if(!source)continue;
   const residual=relativeMotion(source,base,intensity,.025);
   this.jointMicroMotion.set(id,new THREE.Vector3(residual.x,residual.y,residual.z));
  }
  // Only a user-set pelvis pin may change the pelvis world position.
  const pin=this.pins.get('pelvis');
  const targetLocal=pin?.targetLocal||this.pelvisHomeLocal;
  this.anchorRoot.updateWorldMatrix(true,false);
  const target=this.anchorRoot.localToWorld(targetLocal.clone());
  const parent=this.hips.parent;
  parent.updateWorldMatrix(true,false);
  this.hips.position.copy(parent.worldToLocal(target));
  this.hips.updateMatrixWorld(true);
 }
 /**
  * A persistent wrist is an endpoint constraint, not a new animation pose.
  * Seed each new IK frame from the last validated elbow/shoulder pose, and
  * keep that pose if a fresh branch cannot keep the wrist near its anchor.
  */
 reconcileArms(){
  for(const arm of this.limbs.filter(l=>l.kind==='effector'&&l.kindName==='elbow')){
   const b=[arm.clavicle,arm.upper,arm.hinge],target=this.endpointGoal(arm);
   const existing=this.armPoseSeeds.get(arm.side);
   const error=()=>world(arm.effector).distanceTo(target);
   const valid=()=>{
    const state=this.shoulderDiagnostics()[arm.id];
    return state.withinEnvelope&&state.absoluteJointLimitsOK&&state.torsoIntrusion<=.035;
   };
   let actual=error();
   const moving=this.active?.limb?.side===arm.side;
   if(existing&&actual>.05&&!moving){
    const candidate=b.map(bone=>bone.quaternion.clone());
    b[0].quaternion.copy(existing.clavicle);
    b[1].quaternion.copy(existing.upper);
    b[2].quaternion.copy(existing.hinge);
    b[0].updateMatrixWorld(true);
    const recovered=error();
    if(recovered+.006<actual&&valid()){
     actual=recovered;
     arm.armSafety={method:'validated-prior-IK-branch',valid:true,
      intrusion:this.shoulderDiagnostics()[arm.id].torsoIntrusion};
    }else{
     b.forEach((bone,i)=>bone.quaternion.copy(candidate[i]));
     b[0].updateMatrixWorld(true);
    }
   }
   if(actual<.055&&valid()){
    this.armPoseSeeds.set(arm.side,{
     clavicle:arm.clavicle.quaternion.clone(),
     upper:arm.upper.quaternion.clone(),
     hinge:arm.hinge.quaternion.clone()
    });
   }
  }
 }
 storeTarget(limb,target){
  if(limb.kindName==='elbow')this.armPoseSeeds?.delete(limb.side);
  super.storeTarget(limb,target);
 }
 storeHingeTarget(limb,target,holdTipLocal){
  if(limb.kindName==='elbow')this.armPoseSeeds?.delete(limb.side);
  super.storeHingeTarget(limb,target,holdTipLocal);
 }
 update(){
  if(!this.enabled)return;
  this.applyAnimatedPose();
  super.update();
  this.reconcileArms();
 }
 reset(){
  super.reset();
  this.bodyAnchorMode=true;
  this.reanchorNextFrame=false;
  if(!this.homeEndpoints)return;
  this.handAnchors.clear();this.footAnchors.clear();
  for(const [id,saved] of this.homeEndpoints){
   const value={targetLocal:saved.targetLocal.clone()};
   if(saved.orientationLocal)value.orientationLocal=saved.orientationLocal.clone();
   (id.endsWith('-ankle')?this.footAnchors:this.handAnchors).set(id,value);
  }
  this.jointMicroMotion.clear();
  this.armPoseSeeds?.clear();
  this.lastPelvisRejectedMetres=0;
 }
 pelvisDiagnostics(){
  const actual=world(this.hips);
  const pin=this.pins.get('pelvis');
  const local=pin?.targetLocal||this.pelvisHomeLocal;
  const intended=this.anchorRoot.localToWorld(local.clone());
  return {
   version:this.engineVersion,animationInfluence:this.animationInfluence,
   pelvisWorld:actual.toArray(),pelvisGoalWorld:intended.toArray(),
   pelvisDriftMetres:actual.distanceTo(intended),
   anchoredHands:this.handAnchors.size,anchoredFeet:this.footAnchors.size,
   rejectedPelvisTravelMetres:this.lastPelvisRejectedMetres||0,
   rootRelativeAnchorIds:[...this.homeEndpoints.keys()]
  };
 }
}
