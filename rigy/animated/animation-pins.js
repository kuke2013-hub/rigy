import * as THREE from 'three';
import {projectedMiddleJoint} from './pole-circle.mjs';
import {HIP_ENVELOPE_V09,projectHipDirection,projectHipFootGoal,thighSoftTissueOverlap} from '../../anatomy/hip-envelope.mjs';
import {armTorsoIntrusion} from '../../anatomy/torso-collision.mjs';
import {projectShoulderDirection,SHOULDER_ENVELOPE_V07,SHOULDER_GH_ENVELOPE_V07,shoulderGirdleCarryDegrees} from '../../anatomy/shoulder-envelope.mjs';

/**
 * Rigy 0.5 grounded animated-pose overlay.
 * Important update order: AnimationMixer.update() -> PosePins.update() -> render.
 * FEET remain in the unanimated model-anchor reference frame. WRIST/ELBOW
 * pin targets live relative to the animated upper chest (Spine2), so arm poses
 * follow the body through idle animation without shifting behind its back.
 * The source animation clip itself is never edited.
 *
 * Per-bone hinge axes are inferred from first animated pose and body anterior,
 * NOT medically validated anatomical calibration. Shoulder edits are bounded by a conservative torso-relative angular sector.
 * These are provisional rig-specific constraints, not full 3D clinical envelopes.
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
const HIP_MAX_ROOT_SHIFT=0.65;
// Keep overall extremity placement independent of the animated pelvis.
// A small bounded fraction of the original idle motion is retained.
const IDLE_OFFSET={hand:{gain:0.38,max:0.030},foot:{gain:0.20,max:0.006}}; // metres: posture is bounded by the two planted legs
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
  limbs.push({id:`${side.toLowerCase()}-wrist`,kind:'effector',label:`${side} wrist · lift arm`,reference:spine,upper:upperArm,hinge:forearm,effector:hand,lowerEnd:hand,kindName:'elbow',maxBend:elbowMax,maxSwing:SHOULDER_ENVELOPE_V07.addedSwingDeg});
  limbs.push({id:`${side.toLowerCase()}-elbow`,kind:'bend',label:`${side} elbow · bend`,reference:spine,upper:upperArm,hinge:forearm,effector:hand,lowerEnd:hand,kindName:'elbow',maxBend:elbowMax,maxSwing:SHOULDER_ENVELOPE_V07.addedSwingDeg});
  limbs.push({id:`${side.toLowerCase()}-ankle`,kind:'effector',label:`${side} ankle · lift foot`,reference:avatar.parent||avatar,upper:thigh,hinge:shin,effector:foot,lowerEnd:foot,kindName:'knee',maxBend:kneeMax,maxSwing:76});
  limbs.push({id:`${side.toLowerCase()}-knee`,kind:'bend',label:`${side} knee · bend`,reference:avatar.parent||avatar,upper:thigh,hinge:shin,effector:foot,lowerEnd:foot,kindName:'knee',maxBend:kneeMax,maxSwing:76});
 }
 const hipContext={hips,spine,leftHip:pickBone(avatar,'LeftUpLeg'),rightHip:pickBone(avatar,'RightUpLeg'),
  leftKnee:pickBone(avatar,'LeftLeg'),rightKnee:pickBone(avatar,'RightLeg')};
 for(const l of limbs.filter(l=>l.kindName==='knee')) {
  l.side=l.id.startsWith('left-')?'left':'right';
  l.hipContext=hipContext;
 }
 const shoulderContext={hips,spine,leftShoulder:pickBone(avatar,'LeftShoulder'),rightShoulder:pickBone(avatar,'RightShoulder')};
 for(const l of limbs.filter(l=>l.kindName==='elbow')){
  l.side=l.id.startsWith('left-')?'left':'right';
  l.shoulderContext=shoulderContext;
  l.clavicle=l.side==='left'?shoulderContext.leftShoulder:shoulderContext.rightShoulder;
  // Mixamo humeral longitudinal axis measured from child-bone origin, not
  // guessed as arbitrary bone.euler.x or world XYZ.
  l.shoulderAxisLocal=l.hinge.position.clone().normalize();
  if(l.shoulderAxisLocal.lengthSq()<EPS)throw new Error(`Missing ${l.side} upper-arm axis`);
 }
 return limbs;
}

/** Torso reference from ACTUAL shoulder locations and hip/chest geometry.
 * The arm's own rotation does not displace its shoulder joint origin.
 * +X anatomical left, +Y up chest, +Z anterior by right-hand rule.
 */
function torsoBasis(context){
 const up=worldPos(context.spine).sub(worldPos(context.hips)).normalize();
 // Bone origins remain thorax-fixed while the proxy shoulder rotates.
 const left=worldPos(context.leftShoulder).sub(worldPos(context.rightShoulder));
 left.addScaledVector(up,-left.dot(up)).normalize();
 const forward=left.clone().cross(up).normalize();
 if(up.lengthSq()<EPS||left.lengthSq()<EPS||forward.lengthSq()<EPS)
  throw new Error('Cannot calibrate shoulder torso basis');
 // Orthogonalize to guard against animated shear and numerical drift.
 up.crossVectors(forward,left).normalize();
 return {left,up,forward};
}
/** Pelvis-local frame from real hip-bone origins; independent of thigh swing. */
function hipBasis(context){
 const up=worldPos(context.spine).sub(worldPos(context.hips)).normalize();
 const left=worldPos(context.leftHip).sub(worldPos(context.rightHip));
 left.addScaledVector(up,-left.dot(up)).normalize();
 const forward=left.clone().cross(up).normalize();
 if(up.lengthSq()<EPS||left.lengthSq()<EPS||forward.lengthSq()<EPS)
  throw new Error('Cannot establish anatomical pelvis axes');
 up.crossVectors(forward,left).normalize();
 return {left,up,forward};
}
function hipState(limb){
 const frame=hipBasis(limb.hipContext);
 const dir=worldPos(limb.hinge).sub(worldPos(limb.upper)).normalize();
 const evaluated=projectHipDirection({x:dir.dot(frame.left),y:dir.dot(frame.up),z:dir.dot(frame.forward)},limb.side);
 return {frame,dir,evaluated};
}
/** Coarse thigh muscle/fat collision proxy; bounded capsules, not a tissue simulation. */
function thighIntrusion(limb){
 const other=limb.side==='left'
  ?[limb.hipContext.rightHip,limb.hipContext.rightKnee]
  :[limb.hipContext.leftHip,limb.hipContext.leftKnee];
 const [a0,a1,b0,b1]=[worldPos(limb.upper),worldPos(limb.hinge),worldPos(other[0]),worldPos(other[1])];
 const lengthA=a0.distanceTo(a1),lengthB=b0.distanceTo(b1);
 const radiusA=clamp(lengthA*0.115,0.028,0.065);
 const radiusB=clamp(lengthB*0.115,0.028,0.065);
 return thighSoftTissueOverlap(a0,a1,b0,b1,radiusA,radiusB,HIP_ENVELOPE_V09.softTissueClearanceMetres);
}
function constrainUpperLeg(limb){
 if(!limb.hipContext)return;
 const bone=limb.upper;
 const state=hipState(limb),p=state.evaluated;
 if(p.clamped){
  const desired=state.frame.left.clone().multiplyScalar(p.x)
   .addScaledVector(state.frame.up,p.y)
   .addScaledVector(state.frame.forward,p.z).normalize();
  if(state.dir.distanceToSquared(desired)>=1e-12){
   const delta=Q().setFromUnitVectors(state.dir,desired);
   bone.quaternion.copy(worldQ(bone.parent).invert().multiply(delta.multiply(worldQ(bone)))).normalize();
   bone.updateMatrixWorld(true);
  }
 }
 // Avoid growing a thigh intersection once the rig has a previously valid pose.
 // The last feasible local thigh orientation is relative to the animated pelvis.
 const overlap=thighIntrusion(limb);
 if(overlap>0.006&&limb.lastSafeHipQuaternion){
  const desired=bone.quaternion.clone();
  const safe=limb.lastSafeHipQuaternion.clone();
  bone.quaternion.copy(safe);bone.updateMatrixWorld(true);
  if(thighIntrusion(limb)<=0.006){
   let lo=0,hi=1;
   for(let i=0;i<10;i++){
    const mid=(lo+hi)/2;
    bone.quaternion.copy(safe).slerp(desired,mid);bone.updateMatrixWorld(true);
    if(thighIntrusion(limb)<=0.006)lo=mid;else hi=mid;
   }
   bone.quaternion.copy(safe).slerp(desired,lo);bone.updateMatrixWorld(true);
  }
 }
 if(thighIntrusion(limb)<=0.006)limb.lastSafeHipQuaternion=bone.quaternion.clone();
}

function shoulderState(limb){
 const frame=torsoBasis(limb.shoulderContext);
 const direction=worldPos(limb.hinge).sub(worldPos(limb.upper)).normalize();
 const local={x:direction.dot(frame.left),y:direction.dot(frame.up),z:direction.dot(frame.forward)};
 const evaluated=projectShoulderDirection(local,limb.side);
 return {frame,direction,evaluated};
}

/** Mixamo Shoulder bone acts as an approximate scapula/clavicle elevator.
 * Its local rotation never accumulates across animation frames.
 */
function liftShoulderGirdle(limb,target){
 if(!limb.animatedShoulderLocal)return;
 const frame=torsoBasis(limb.shoulderContext);
 const from=worldPos(limb.hinge).sub(worldPos(limb.upper)).normalize();
 const to=target.clone().sub(worldPos(limb.upper)).normalize();
 if(from.lengthSq()<EPS||to.lengthSq()<EPS)return;
 const project=d=>projectShoulderDirection({
  x:d.dot(frame.left),y:d.dot(frame.up),z:d.dot(frame.forward)
 },limb.side,SHOULDER_ENVELOPE_V07);
 const desired=project(to),current=project(from);
 const want=frame.left.clone().multiplyScalar(desired.x).addScaledVector(frame.up,desired.y)
  .addScaledVector(frame.forward,desired.z).normalize();
 const carry=shoulderGirdleCarryDegrees(desired.elevationDeg)-shoulderGirdleCarryDegrees(current.elevationDeg);
 const axis=from.clone().cross(want);
 if(carry<0.1||axis.lengthSq()<EPS)return;
 const angle=Math.min(carry*RAD,from.angleTo(want));
 useWorldRotation(limb.clavicle,new THREE.Quaternion().setFromAxisAngle(axis.normalize(),angle));
}

/**
 * Two-stage projection for a manually edited Mixamo shoulder:
 * 1. Cap added humeral AXIAL TWIST relative to the animated quaternion.
 * 2. Enforce an asymmetric shoulder-to-elbow world DIRECTION measured against
 *    the moving torso, not a 100-degree delta on top of an animated pose.
 * This is deliberately a conservative single-humerus approximation. No
 * independent scapula or clavicle exists in this specific FBX hierarchy.
 */
function constrainUpperArm(limb,animatedQ){
 if(!limb.shoulderContext||!animatedQ)return;
 const bone=limb.upper,axis=limb.shoulderAxisLocal;
 const rel=animatedQ.clone().invert().multiply(bone.quaternion.clone()).normalize();
 const proj=rel.x*axis.x+rel.y*axis.y+rel.z*axis.z;
 const twist=new THREE.Quaternion(axis.x*proj,axis.y*proj,axis.z*proj,rel.w).normalize();
 if(Number.isFinite(twist.w)){
  const swing=rel.clone().multiply(twist.clone().invert());
  let angle=2*Math.atan2(proj,rel.w);
  if(angle>Math.PI)angle-=TWO_PI;
  if(angle< -Math.PI)angle+=TWO_PI;
  const bounded=clamp(angle,-SHOULDER_ENVELOPE_V07.addedAxialTwistDeg*RAD,
    SHOULDER_ENVELOPE_V07.addedAxialTwistDeg*RAD);
  const limitedTwist=new THREE.Quaternion().setFromAxisAngle(axis,bounded);
  bone.quaternion.copy(animatedQ).multiply(swing).multiply(limitedTwist).normalize();
  bone.updateWorldMatrix(true,true);
 }
 const rotateTo=direction=>{
  const now=worldPos(limb.hinge).sub(worldPos(bone)).normalize();
  const out=new THREE.Quaternion().setFromUnitVectors(now,direction).multiply(worldQ(bone));
  bone.quaternion.copy(worldQ(bone.parent).invert().multiply(out)).normalize();
  bone.updateWorldMatrix(true,true);
 };
 const toWorld=(f,v)=>f.left.clone().multiplyScalar(v.x).addScaledVector(f.up,v.y)
  .addScaledVector(f.forward,v.z).normalize();
 let state=shoulderState(limb);
 if(state.evaluated.clamped){
  rotateTo(toWorld(state.frame,state.evaluated));
  state=shoulderState(limb);
 }
 // Separately bound GH rotation relative to the calibrated animated girdle.
 // Total arm elevation can reach overhead only by sharing it with the
 // shoulder proxy; it cannot demand 170 degrees of GH movement alone.
 if(limb.animatedShoulderLocal){
  const base=worldQ(limb.clavicle.parent).multiply(limb.animatedShoulderLocal.clone());
  const added=worldQ(limb.clavicle).multiply(base.invert());
  const neutral=state.direction.clone().applyQuaternion(added.clone().invert());
  const gh=projectShoulderDirection({
   x:neutral.dot(state.frame.left),y:neutral.dot(state.frame.up),
   z:neutral.dot(state.frame.forward)
  },limb.side,SHOULDER_GH_ENVELOPE_V07);
  if(gh.clamped){
   const worldDir=toWorld(state.frame,gh).applyQuaternion(added);
   const total=projectShoulderDirection({
    x:worldDir.dot(state.frame.left),y:worldDir.dot(state.frame.up),
    z:worldDir.dot(state.frame.forward)
   },limb.side,SHOULDER_ENVELOPE_V07);
   rotateTo(toWorld(state.frame,total));
  }
 }
}

/**
 * Evaluate the animated arm against a conservative torso exclusion volume.
 * A pose can satisfy shoulder ROM but still drive a forearm THROUGH the chest.
 * We test both humerus and forearm segments, not merely the wrist endpoint.
 */
function torsoIntrusion(limb){
 const context=limb.shoulderContext;
 const leftShoulder=worldPos(context.leftShoulder),rightShoulder=worldPos(context.rightShoulder);
 const origin=leftShoulder.clone().add(rightShoulder).multiplyScalar(.5);
 const frame=torsoBasis(context);
 const torsoHeight=Math.abs(worldPos(context.hips).sub(origin).dot(frame.up));
 const shoulderSpan=leftShoulder.distanceTo(rightShoulder);
 const local=p=>{
  const d=p.clone().sub(origin);
  return {x:d.dot(frame.left),y:d.dot(frame.up),z:d.dot(frame.forward)};
 };
 return armTorsoIntrusion(
  local(worldPos(limb.upper)),local(worldPos(limb.hinge)),
  local(worldPos(limb.effector)),{shoulderSpan,torsoHeight});
}
/**
 * Reject the penetrating portion of a proposed pose by blending back towards
 * the corresponding animation-frame joint rotations. Unlike an extra angular
 * limit, this constraint depends on where the torso actually is, and can
 * preserve natural arm-crossing when the arm travels IN FRONT of the chest.
 * The FBX is a simplified proxy, not a precise collision mesh.
 */
function restrictTorsoPenetration(limb,animatedPose){
 if(!animatedPose)return 0;
 const bones=[limb.clavicle,limb.upper,limb.hinge];
 const posed=bones.map(b=>b.quaternion.clone());
 const set=(t)=>{
  for(let i=0;i<bones.length;i++)bones[i].quaternion.copy(animatedPose[i]).slerp(posed[i],t);
  limb.clavicle.updateMatrixWorld(true);
 };
 const candidate=torsoIntrusion(limb);
 set(0);
 const baseline=torsoIntrusion(limb);
 set(1);
 // Ignore measurement noise and never make an existing animation collision
 // meaningfully worse. A lower threshold is used for an already-clear pose.
 const tolerance=Math.max(.025,baseline+.008);
 if(candidate<=tolerance)return candidate;
 let safe=0,blocked=1;
 for(let i=0;i<10;i++){
  const mid=(safe+blocked)*.5;
  set(mid);
  if(torsoIntrusion(limb)<=tolerance)safe=mid;
  else blocked=mid;
 }
 set(safe);
 return torsoIntrusion(limb);
}


/**
 * RIGY-V0137: Continuous final shoulder and upper-limb safety.
 * Every animated/pinned/restored pose is validated in the current torso frame.
 * The source animation cannot be considered a safe collision baseline.
 */

/**
 * V0138 absolute shoulder/elbow projection. The calibration is captured ONCE
 * at the initial rig pose and never redefined by an animation frame or pin.
 */
const HARD_SHOULDER_TWIST=75*RAD;
const HARD_GIRDLE_DEVIATION=55*RAD;
const wrapJointAngle=v=>Math.atan2(Math.sin(v),Math.cos(v));
function relativeTwistRadians(relative,axis){
 return wrapJointAngle(2*Math.atan2(
   relative.x*axis.x+relative.y*axis.y+relative.z*axis.z,relative.w));
}
function shoulderTwistAbsolute(limb){
 const relative=limb.upperNeutralLocal.clone().invert()
   .multiply(limb.upper.quaternion).normalize();
 return relativeTwistRadians(relative,limb.shoulderAxisLocal);
}
function elbowDeltaAbsolute(limb){
 const relative=limb.hingeNeutralLocal.clone().invert()
   .multiply(limb.hinge.quaternion).normalize();
 return relativeTwistRadians(relative,limb.hingeAxisLocal);
}
function elbowExactHinge(limb){
 const lower=-limb.initialBend,upper=limb.maxBend*RAD-limb.initialBend;
 const theta=clamp(elbowDeltaAbsolute(limb),lower,upper);
 return limb.hingeNeutralLocal.clone().multiply(
   Q().setFromAxisAngle(limb.hingeAxisLocal,theta)).normalize();
}
function absoluteArmValid(limb){
 if(!limb.upperNeutralLocal||!limb.hingeNeutralLocal)return false;
 return Math.abs(shoulderTwistAbsolute(limb))<=HARD_SHOULDER_TWIST+1e-5
   &&limb.clavicle.quaternion.angleTo(limb.clavicleNeutralLocal)<=HARD_GIRDLE_DEVIATION+1e-5
   &&limb.hinge.quaternion.angleTo(elbowExactHinge(limb))<1e-4;
}
function hardArmJointProjection(limb,animatedUpper){
 const clav=limb.clavicle,clavNeutral=limb.clavicleNeutralLocal;
 const cangle=clavNeutral.angleTo(clav.quaternion);
 if(cangle>HARD_GIRDLE_DEVIATION+1e-8){
   const attempt=clav.quaternion.clone();
   clav.quaternion.copy(clavNeutral).slerp(attempt,HARD_GIRDLE_DEVIATION/cangle);
   clav.updateMatrixWorld(true);
 }
 // Independent anatomical shoulder direction and glenohumeral limits.
 constrainUpperArm(limb,animatedUpper);
 // Correct absolute longitudinal humerus roll, NOT relative to source animation.
 const bone=limb.upper,ref=limb.upperNeutralLocal,axis=limb.shoulderAxisLocal;
 const rel=ref.clone().invert().multiply(bone.quaternion).normalize();
 const twist=relativeTwistRadians(rel,axis);
 const bounded=clamp(twist,-HARD_SHOULDER_TWIST,HARD_SHOULDER_TWIST);
 if(Math.abs(bounded-twist)>1e-8){
   const swing=rel.clone().multiply(Q().setFromAxisAngle(axis,twist).invert());
   bone.quaternion.copy(ref).multiply(swing)
     .multiply(Q().setFromAxisAngle(axis,bounded)).normalize();
   bone.updateMatrixWorld(true);
 }
 // Elbow can ONLY flex/extend about its calibrated one-dimensional hinge,
 // between 0 and 145 degrees. Delete all other rotations, even from FBX.
 limb.hinge.quaternion.copy(elbowExactHinge(limb));
 limb.hinge.updateMatrixWorld(true);
}

const ARM_TORSO_LIMIT=0.025;
function finalArmSafety(limb,animatedUpper){
 const upper=limb.upper,elbow=limb.hinge;
 const priorIntrusion=torsoIntrusion(limb);
 const assign=(a,b)=>{upper.quaternion.copy(a);elbow.quaternion.copy(b);upper.updateMatrixWorld(true);};
 const record=(method)=>{
   const intrusion=torsoIntrusion(limb);
   const valid=absoluteArmValid(limb)&&!shoulderState(limb).evaluated.clamped&&intrusion<=ARM_TORSO_LIMIT;
   limb.armSafety={method,priorIntrusion,intrusion,valid};
   if(valid)limb.lastSafeArm={upper:upper.quaternion.clone(),elbow:elbow.quaternion.clone()};
 };
 hardArmJointProjection(limb,animatedUpper);
 const originalUpper=upper.quaternion.clone(),originalElbow=elbow.quaternion.clone();
 if(absoluteArmValid(limb)&&!shoulderState(limb).evaluated.clamped&&torsoIntrusion(limb)<=ARM_TORSO_LIMIT){
   record('accepted');return;
 }
 // Avoid repeatedly scanning an invalid Mixamo pose if the prior frame
 // already established a clear, anatomically feasible configuration.
 if(limb.lastSafeArm){
   assign(limb.lastSafeArm.upper,limb.lastSafeArm.elbow);
   hardArmJointProjection(limb,animatedUpper);
   if(absoluteArmValid(limb)&&!shoulderState(limb).evaluated.clamped&&torsoIntrusion(limb)<=ARM_TORSO_LIMIT){
     record('previous-safe');return;
   }
 }
 assign(originalUpper,originalElbow);
 let best=null,bestScore=Infinity;
 const consider=()=>{
   const overlap=torsoIntrusion(limb);
   const within=absoluteArmValid(limb)&&!shoulderState(limb).evaluated.clamped;
   const angle=upper.quaternion.angleTo(originalUpper)+.65*elbow.quaternion.angleTo(originalElbow);
   const score=(within&&overlap<=ARM_TORSO_LIMIT?0:100)+overlap*40+angle;
   if(score<bestScore){bestScore=score;best={u:upper.quaternion.clone(),e:elbow.quaternion.clone(),overlap,within};}
 };
 consider();
 const frame=torsoBasis(limb.shoulderContext);
 const outward=frame.left.clone().multiplyScalar(limb.side==='left'?1:-1);
 const targets=[
   outward.clone().multiplyScalar(.7).addScaledVector(frame.up,-.7).addScaledVector(frame.forward,.25),
   outward.clone().multiplyScalar(.45).addScaledVector(frame.up,-.8).addScaledVector(frame.forward,.45),
   outward.clone().multiplyScalar(.95).addScaledVector(frame.up,.10).addScaledVector(frame.forward,.3),
   outward.clone().multiplyScalar(.55).addScaledVector(frame.up,.5).addScaledVector(frame.forward,.65),
   outward.clone().multiplyScalar(.2).addScaledVector(frame.up,-.45).addScaledVector(frame.forward,.9)
 ];
 const from=worldPos(limb.hinge).sub(worldPos(upper)).normalize();
 for(const dir of targets){
   assign(originalUpper,originalElbow);
   useWorldRotation(upper,Q().setFromUnitVectors(from,dir.normalize()));
   const oriented=upper.quaternion.clone();
   for(const t of [.25,.5,.75,1]){
     assign(originalUpper,originalElbow);
     upper.quaternion.slerp(oriented,t);upper.updateMatrixWorld(true);
     hardArmJointProjection(limb,animatedUpper);
     const trialUpper=upper.quaternion.clone();
     for(const bend of [0,-.5,.5,-1.2,1.2]){
       assign(trialUpper,originalElbow);
       if(bend)turnHinge(limb,bend);
       limb.hinge.quaternion.copy(elbowExactHinge(limb));limb.hinge.updateMatrixWorld(true);
       consider();
     }
   }
 }
 if(best)assign(best.u,best.e);
 hardArmJointProjection(limb,animatedUpper);
 record(best?.within&&best.overlap<=ARM_TORSO_LIMIT?'projected':'best-available');
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
 if(limb.kindName==='knee')constrainUpperLeg(limb);
 else constrainUpperArm(limb,animatedQ);
}


/**
 * Solve shoulder–elbow–wrist triangle directly for pinned arms. Elbow position
 * follows the law of cosines with the bend branch chosen near the original
 * animation. Every candidate is re-projected through shoulder complex/GH
 * constraints, and elbow rotation remains a single bounded hinge.
 */
function solveArmIK(limb,target,animatedUpper){
 for(let pass=0;pass<12;pass++){
  const shoulder=worldPos(limb.upper),elbow=worldPos(limb.hinge);
  const wrist=worldPos(limb.effector);
  const a=shoulder.distanceTo(elbow),b=elbow.distanceTo(wrist);
  const aim=target.clone().sub(shoulder),d=aim.length();
  if(a<EPS||b<EPS||d<EPS)return;
  const maxReach=Math.max(.002,a+b-.001);
  const minReach=Math.sqrt(Math.max(0,a*a+b*b+2*a*b*Math.cos(limb.maxBend*RAD)))+.001;
  const reach=clamp(d,Math.min(minReach,maxReach),maxReach);
  const direction=aim.divideScalar(d);
  const along=clamp((reach*reach+a*a-b*b)/(2*reach),-a,a);
  const across=Math.sqrt(Math.max(0,a*a-along*along));
  const pole=elbow.clone().sub(shoulder);
  pole.addScaledVector(direction,-pole.dot(direction));
  if(pole.lengthSq()<1e-10){
   const hingeAxis=limb.hingeAxisLocal.clone().applyQuaternion(worldQ(limb.hinge));
   pole.crossVectors(hingeAxis,direction);
  }
  if(pole.lengthSq()<1e-10)pole.crossVectors(direction,V().set(0,0,1));
  if(pole.lengthSq()<1e-10)pole.crossVectors(direction,V().set(1,0,0));
  pole.normalize();
  const elbowGoal=shoulder.clone().addScaledVector(direction,along)
    .addScaledVector(pole,across);
  const upperNow=elbow.clone().sub(shoulder).normalize();
  const upperTarget=elbowGoal.sub(shoulder).normalize();
  if(upperTarget.lengthSq()<EPS)return;
  useWorldRotation(limb.upper,new THREE.Quaternion().setFromUnitVectors(upperNow,upperTarget));
  constrainUpperArm(limb,animatedUpper);
  const joint=worldPos(limb.hinge),end=worldPos(limb.effector);
  const axis=limb.hingeAxisLocal.clone().applyQuaternion(worldQ(limb.hinge)).normalize();
  const delta=signedAxisAngle(end.clone().sub(joint),target.clone().sub(joint),axis);
  turnHinge(limb,clamp(delta,-.45,.45));
  if(worldPos(limb.effector).distanceToSquared(target)<.000009)break;
 }
}

/** Solve anchored hands against moving pelvis, preserving signed hinge/shoulder
 * constraints. If the geometric branch cannot reach, try bounded CCD and keep
 * the smaller residual. All candidates still go through ROM projection.
 */
function solveAnchoredArm(limb,target,animatedUpper){
 const bones=[limb.clavicle,limb.upper,limb.hinge];
 const start=bones.map(b=>b.quaternion.clone());
 const restore=poses=>{for(let i=0;i<bones.length;i++)bones[i].quaternion.copy(poses[i]);limb.clavicle.updateMatrixWorld(true);};
 solveArmIK(limb,target,animatedUpper);
 const geometric=bones.map(b=>b.quaternion.clone());
 const geomError=worldPos(limb.effector).distanceTo(target);
 if(geomError<.012)return;
 restore(start);
 solveEffector(limb,target,animatedUpper);
 const ccdError=worldPos(limb.effector).distanceTo(target);
 if(ccdError>=geomError)restore(geometric);
}

function solveEffector(limb,target,animatedUpper,lockHinge=false){
 // Damped 2-bone CCD. The arm requires extra convergence passes near
 // 160-degree overhead targets, but both planted legs retain their original
 // capped 8-pass solver to preserve the tested foot contact behaviour.
 const passes=limb.kindName==='elbow'?18:8;
 for(let attempt=0;attempt<passes;attempt++){
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


/** V0149: Treat a held elbow/knee as a persistent 3D POLE TARGET.
 * The original endpoint IK loses the selected sideways bend direction.
 * Here the controller chooses the intersection-circle azimuth, while the
 * hand or foot stays anchored and joint restrictions remain authoritative.
 */
function solveWithMiddlePole(limb,endpoint,requestedPole,animatedUpper,attempt=0){
 const root=worldPos(limb.upper),middle=worldPos(limb.hinge);
 const endNow=worldPos(limb.effector);
 const a=root.distanceTo(middle),b=middle.distanceTo(endNow);
 const initialUpper=limb.upper.quaternion.clone(),initialHinge=limb.hinge.quaternion.clone();
 const projected=projectedMiddleJoint(root,endpoint,a,b,requestedPole,middle);
 if(!projected){solveEffector(limb,endpoint,animatedUpper);return;}
 const wanted=V().set(projected.x,projected.y,projected.z);
 const joints=[limb.upper,limb.hinge];
 const snapshot=()=>joints.map(b=>b.quaternion.clone());
 const restore=pose=>{joints.forEach((b,i)=>b.quaternion.copy(pose[i]));limb.upper.updateMatrixWorld(true);};
 const endpointError=()=>worldPos(limb.effector).distanceTo(endpoint);
 const poleError=()=>worldPos(limb.hinge).distanceTo(wanted);
 const direction=()=>worldPos(limb.hinge).sub(worldPos(limb.upper)).normalize();
 const constrain=()=>limb.kindName==='knee'?
   constrainUpperLeg(limb):constrainUpperArm(limb,animatedUpper);
 let best=snapshot(),bestError=4*endpointError()+poleError();
 const consider=()=>{
   if(limb.kindName==='elbow'&&shoulderState(limb).evaluated.clamped)return;
   if(limb.kindName==='knee'&&hipState(limb).evaluated.clamped)return;
   const score=4*endpointError()+poleError();
   if(score<bestError){bestError=score;best=snapshot();}
 };
 for(let iteration=0;iteration<8;iteration++){
   useWorldRotation(limb.upper,Q().setFromUnitVectors(
     direction(),wanted.clone().sub(worldPos(limb.upper)).normalize()));
   constrain();
   // Upper-bone roll aligns the existing 1-DOF hinge with this NEW spatial
   // bending plane. There is no lateral rotation at the hinge itself.
   const elbow=worldPos(limb.hinge);
   let roll=signedAxisAngle(worldPos(limb.effector).sub(elbow),
     endpoint.clone().sub(elbow),direction());
   const cap=(limb.kindName==='knee'?35:25)*RAD;
   roll=clamp(roll,-cap,cap);
   if(Math.abs(roll)>1e-6){
     useWorldRotation(limb.upper,Q().setFromAxisAngle(direction(),roll));
     constrain();
   }
   const pivot=worldPos(limb.hinge);
   const hingeAxis=limb.hingeAxisLocal.clone().applyQuaternion(worldQ(limb.hinge)).normalize();
   const bend=signedAxisAngle(worldPos(limb.effector).sub(pivot),
     endpoint.clone().sub(pivot),hingeAxis);
   turnHinge(limb,clamp(bend,-.5,.5));
   if(limb.kindName==='elbow')hardArmJointProjection(limb,animatedUpper);
   consider();
   if(endpointError()<.008&&poleError()<.015)break;
 }
 restore(best);
 // A hand anchor is an absolute constraint. If the user sweeps the elbow
 // beyond the feasible shoulder/hinge sector, progressively shorten the
 // requested pole displacement rather than let the wrist detach in space.
 // This fallback occurs ONLY when the endpoint solver exceeds tolerance;
 // normal lateral knee and elbow motion pays no extra calculation cost.
 if(limb.kindName==='elbow'&&endpointError()>.034&&attempt<3){
  limb.upper.quaternion.copy(initialUpper);
  limb.hinge.quaternion.copy(initialHinge);
  limb.upper.updateMatrixWorld(true);
  const nearer=middle.clone().lerp(requestedPole,.5);
  return solveWithMiddlePole(limb,endpoint,nearer,animatedUpper,attempt+1);
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
 if(limb.kindName==='knee')constrainUpperLeg(limb);
 else constrainUpperArm(limb,animatedUpper);
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
  // A pinned arm must no longer inherit its animation-track rotations: keep
  // clavicle, humerus and elbow local pose relative to the animated chest.
  this.armPoseLocks=new Map();
  this.armSafetyVersion='RIGY-V0139';
  this.pointerScreen=null;this.hovered=null;
  this.limbs=makeMixamoMaps(avatar,medicalProfiles);
  this.shoulderBones=[...new Set(this.limbs.filter(l=>l.kindName==='elbow').map(l=>l.clavicle))];
  this.previousShoulderFrames=new Map();
  this.bodyHandles=makeBodyHandles(avatar);
  this.anchorRoot=avatar.parent||avatar;
  this.hips=pickBone(avatar,'Hips');
  this.footAnchors=new Map();
  this.handAnchors=new Map();
  this.animationBaseline=new Map();
  this.animationRaw=new Map();
  this.bodyAnchorMode=false;
  this.reanchorNextFrame=false;
  this.controllers=[renderer.xr.getController(0),renderer.xr.getController(1)];
  this.listeners=[];
  // The first animated frame is the calibration reference. A custom GLB rig
  // needs a separate mapping and axis calibration; name-based matching alone
  // is not sufficient for arbitrary human rigs.
  avatar.updateMatrixWorld(true);
  const hips=pickBone(avatar,'Hips'); const forward=V().set(0,0,1).applyQuaternion(worldQ(hips));
  this.captureFootAnchors();
  this.captureEndpointBaseline();
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
  // First known Mixamo pose is the fixed anatomical baseline for this rig.
  for(const arm of this.limbs.filter(l=>l.kindName==='elbow'&&l.kind==='effector')){
   arm.upperNeutralLocal=arm.upper.quaternion.clone();
   arm.hingeNeutralLocal=arm.hinge.quaternion.clone();
   arm.clavicleNeutralLocal=arm.clavicle.quaternion.clone();
   if(!Number.isFinite(arm.initialBend)||arm.initialBend<0||arm.initialBend>arm.maxBend*RAD)
    throw new Error('Uncalibrated '+arm.side+' elbow hinge');
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
 /** Store the unmodified Mixamo endpoint positions before procedural IK.
  * Each fixed root-local anchor receives only a small, bounded idle offset.
  * ModelAnchor (Zelda whole-object grips) remains free to translate/rotate.
  */
 captureEndpointBaseline(){
  this.avatar.updateMatrixWorld(true);
  for(const limb of this.limbs.filter(l=>l.kind==='effector')){
   const raw=this.anchorRoot.worldToLocal(worldPos(limb.effector));
   this.animationBaseline.set(limb.id,raw.clone());
   this.animationRaw.set(limb.id,raw.clone());
   if(limb.kindName==='elbow'&&!this.handAnchors.has(limb.id))
    this.handAnchors.set(limb.id,{targetLocal:raw.clone()});
  }
 }
 captureAnimatedRaw(){
  this.avatar.updateMatrixWorld(true);
  for(const limb of this.limbs.filter(l=>l.kind==='effector'))
   this.animationRaw.set(limb.id,this.anchorRoot.worldToLocal(worldPos(limb.effector)));
 }
 animatedOffset(limb){
  const origin=this.animationBaseline.get(limb.id),now=this.animationRaw.get(limb.id);
  if(!origin||!now)return V();
  if(limb.kindName==='knee'&&!this.bodyAnchorMode)return V();
  const c=limb.kindName==='knee'?IDLE_OFFSET.foot:IDLE_OFFSET.hand;
  const delta=now.clone().sub(origin).multiplyScalar(c.gain);
  if(delta.length()>c.max)delta.setLength(c.max);
  return delta;
 }
 endpointGoal(limb){
  const anchor=(limb.kindName==='knee'?this.footAnchors:this.handAnchors).get(limb.id);
  if(!anchor)return worldPos(limb.effector);
  return this.anchorRoot.localToWorld(anchor.targetLocal.clone().add(this.animatedOffset(limb)));
 }
 activateBodyAnchors(){
  if(this.bodyAnchorMode)return;
  this.bodyAnchorMode=true;
  this.armPoseLocks.clear();
  for(const limb of this.limbs.filter(l=>l.kind==='effector'&&l.kindName==='elbow')){
   // An explicitly positioned wrist stays at that chosen position.
   // Otherwise anchor the position reached at the moment of body editing.
   if(!this.pins.has(limb.id))
    this.handAnchors.set(limb.id,{targetLocal:this.anchorRoot.worldToLocal(worldPos(limb.effector))});
   const raw=this.animationRaw.get(limb.id);
   if(raw)this.animationBaseline.set(limb.id,raw.clone());
  }
 }
 endpointDiagnostics(){
  this.avatar.updateMatrixWorld(true);
  const result={};
  for(const limb of this.limbs.filter(l=>l.kind==='effector')){
   const goal=this.endpointGoal(limb),actual=worldPos(limb.effector);
   const anchor=(limb.kindName==='knee'?this.footAnchors:this.handAnchors).get(limb.id);
   result[limb.id]={
    kind:limb.kindName==='knee'?'foot':'hand',anchored:!!anchor,
    goalMetres:goal.toArray(),
    baseMetres:anchor?this.anchorRoot.localToWorld(anchor.targetLocal.clone()).toArray():null,
    actualMetres:actual.toArray(),
    errorMetres:actual.distanceTo(goal),
    idleOffsetMetres:this.animatedOffset(limb).length()
   };
  }
  return result;
 }
 setVisible(v){this.visible=!!v;this.updateVisibility();}
 setEnabled(v){this.enabled=!!v;if(!v)this.active=null;}
 reset(){this.pins.clear();this.armPoseLocks.clear();this.active=null;this.bodyAnchorMode=false;this.handAnchors.clear();this.reanchorNextFrame=true;
  for(const l of this.limbs.filter(l=>l.kind==='effector'&&l.kindName==='elbow')){l.lastSafeArm=null;l.armSafety=null;}
 }
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
 /** Mouse picking uses the same 2D metric for hover AND click.
  * Previously an orange elbow or knee could highlight on hover but a
  * different joint was selected by the click-ray metric.
  */
 pickScreenPoint(clientX,clientY){
  if(!this.visible||!this.enabled)return null;
  const rect=this.renderer.domElement.getBoundingClientRect();
  if(!rect.width||!rect.height)return null;
  this.avatar.updateMatrixWorld(true);
  this.camera.updateWorldMatrix(true,false);
  let winner=null,pixels=DESKTOP_HOVER_PIXELS;
  for(const marker of this.handles.values()){
   const p=worldPos(marker).project(this.camera);
   if(p.z<-1||p.z>1)continue;
   const x=rect.left+(p.x+1)*rect.width/2;
   const y=rect.top+(1-p.y)*rect.height/2;
   const distance=Math.hypot(x-clientX,y-clientY);
   if(distance<pixels){pixels=distance;winner=marker.userData.poseHandle;}
  }
  return winner;
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
  const cursor=this.pointerScreen;
  this.hovered=!inXR&&cursor?this.pickScreenPoint(cursor.x,cursor.y):null;
  for(const marker of this.handles.values()){
   const handle=marker.userData.poseHandle;
   const close=inXR&&controllerPositions.some(p=>p.distanceTo(worldPos(marker))<=HANDLE_NEAR_METRES);
   marker.visible=handle===active||(inXR?close:handle===this.hovered);
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
  // The point highlighted during hover MUST be the click target.
  const hit=this.pickScreenPoint(e.clientX,e.clientY);
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
  if(limb.kindName==='elbow')this.armPoseLocks.delete(limb.side);
  limb.reference.updateWorldMatrix(true,false);
  const start=worldPos(limb.upper),joint=worldPos(limb.hinge),tip=worldPos(limb.effector);
  const maxReach=start.distanceTo(joint)+joint.distanceTo(tip);
  const goal=target.clone(),offset=goal.clone().sub(start);
  if(limb.kindName==='knee'&&maxReach>EPS){
   // Reject anatomically impossible foot drags BEFORE establishing a fixed anchor.
   // Angular checks are in the moving pelvis frame and distances in metres.
   const basis=hipBasis(limb.hipContext);
   const restricted=projectHipFootGoal({
    x:offset.dot(basis.left),y:offset.dot(basis.up),z:offset.dot(basis.forward)
   },limb.side,Math.max(0.01,maxReach-0.006));
   goal.copy(start).addScaledVector(basis.left,restricted.x)
    .addScaledVector(basis.up,restricted.y).addScaledVector(basis.forward,restricted.z);
  }else if(maxReach>EPS&&offset.length()>maxReach){goal.copy(start).add(offset.setLength(maxReach));}
  // THREE.worldToLocal mutates its Vector3 input. Keep an untouched WORLD
  // target for the independent hand anchor and NEVER transform a foot twice.
  const worldGoal=goal.clone();
  const targetLocal=limb.reference.worldToLocal(goal);
  this.pins.set(limb.id,{type:'effector',targetLocal});
  if(limb.kindName==='elbow'){
   this.handAnchors.set(limb.id,{
    targetLocal:this.anchorRoot.worldToLocal(worldGoal).sub(this.animatedOffset(limb))
   });
  }
  if(limb.kindName==='knee'){
   const old=this.footAnchors.get(limb.id);
   this.footAnchors.set(limb.id,{targetLocal:targetLocal.clone().sub(this.animatedOffset(limb)),orientationLocal:old.orientationLocal.clone()});
  }
 }
 /** Orange markers are true 3D drag points. The child wrist/ankle tries to
  * remain where it was at grab start, so moving the knee can flex the shin.
  */
 storeHingeTarget(limb,target,holdTipLocal){
  if(limb.kindName==='elbow')this.armPoseLocks.delete(limb.side);
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
  this.activateBodyAnchors();
  handle.reference.updateWorldMatrix(true,false);
  const current=worldPos(handle.marker);
  const reference=this.pins.get(handle.id)?.originalLocal||handle.reference.worldToLocal(current);
  const original=handle.reference.localToWorld(reference.clone());
  const move=target.clone().sub(original);
  if(move.length()>handle.maxMove)move.setLength(handle.maxMove);
  this.pins.set(handle.id,{type:'body',originalLocal:reference.clone(),targetLocal:handle.reference.worldToLocal(original.add(move))});
 }
 hipDiagnostics(){
  this.avatar.updateMatrixWorld(true);
  const result={};
  for(const limb of this.limbs.filter(l=>l.kind==='effector'&&l.kindName==='knee')){
   const p=hipState(limb).evaluated;
   const anchor=this.footAnchors.get(limb.id);
   result[limb.id]={flexionDeg:p.flexionDeg,abductionDeg:p.abductionDeg,
    requestedFlexionDeg:p.requestedFlexionDeg,requestedAbductionDeg:p.requestedAbductionDeg,
    withinEnvelope:!p.clamped,
    footErrorMetres:anchor?worldPos(limb.effector).distanceTo(
      this.anchorRoot.localToWorld(anchor.targetLocal.clone())):null,
    thighOverlapMetres:thighIntrusion(limb)};
  }
  return result;
 }
 shoulderDiagnostics(){
  this.avatar.updateWorldMatrix(true,true);
  const result={};
  for(const l of this.limbs.filter(l=>l.kind==='effector'&&l.kindName==='elbow')){
   const state=shoulderState(l),measured=state.evaluated;
   const pin=this.pins.get(l.id);
   let goalElevationDeg=null;
   if(pin?.targetLocal){
    const goal=l.reference.localToWorld(pin.targetLocal.clone()).sub(worldPos(l.upper)).normalize();
    const frame=state.frame;
    goalElevationDeg=Math.atan2(Math.hypot(goal.dot(frame.left),goal.dot(frame.forward)),-goal.dot(frame.up))/RAD;
   }
   result[l.id]={
    elevationDeg:measured.requestedDeg??measured.elevationDeg,
    limitDeg:measured.maximumDeg,
    excessDeg:Math.max(0,(measured.requestedDeg??measured.elevationDeg)-measured.maximumDeg),
    withinEnvelope:!measured.clamped,
    goalElevationDeg,
    girdleDeltaDeg:l.animatedShoulderLocal?l.clavicle.quaternion.angleTo(l.animatedShoulderLocal)/RAD:0,
    torsoIntrusion:torsoIntrusion(l),
    safety:l.armSafety||null,
    axialTwistFromNeutralDeg:l.upperNeutralLocal?shoulderTwistAbsolute(l)/RAD:null,
    elbowFlexFromNeutralDeg:l.hingeNeutralLocal?(l.initialBend+elbowDeltaAbsolute(l))/RAD:null,
    elbowOffHingeDeg:l.hingeNeutralLocal?l.hinge.quaternion.angleTo(elbowExactHinge(l))/RAD:null,
    girdleFromNeutralDeg:l.clavicleNeutralLocal?l.clavicle.quaternion.angleTo(l.clavicleNeutralLocal)/RAD:null,
    absoluteJointLimitsOK:l.hingeNeutralLocal?absoluteArmValid(l):false,
    elbowFlexDeg:l.hingeAxisLocal?
      hingeFlexAngle(l,l.hingeAxisLocal.clone().applyQuaternion(worldQ(l.hinge)))/RAD:null,
    shoulderWorld:worldPos(l.upper).toArray(),
    elbowWorld:worldPos(l.hinge).toArray(),
    wristWorld:worldPos(l.effector).toArray(),
    wristGoalErrorMetres:pin?.targetLocal?
      worldPos(l.effector).distanceTo(l.reference.localToWorld(pin.targetLocal.clone())):null
   };
  }
  return result;
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
 footReachDiagnostics(){
  this.avatar.updateMatrixWorld(true);
  const result={};
  for(const l of this.limbs.filter(x=>x.kind==='effector'&&x.kindName==='knee')){
   const target=this.anchorRoot.localToWorld(this.footAnchors.get(l.id).targetLocal.clone());
   const start=worldPos(l.upper),joint=worldPos(l.hinge),tip=worldPos(l.effector);
   const first=start.distanceTo(joint),second=joint.distanceTo(tip);
   result[l.id]={distance:start.distanceTo(target),maxReach:first+second,
    minReach:Math.sqrt(Math.max(0,first*first+second*second+2*first*second*Math.cos(l.maxBend*RAD)))};
  }
  return result;
 }
 keepPelvisWithinLegReach(){
  // Rooted-body contact solver: don't ask a finite-length thigh+shin to reach
  // a foot if the posed pelvis would put the ankle beyond its mechanical arc.
  for(let pass=0;pass<6;pass++){
   const deltas=[];
   for(const l of this.limbs.filter(x=>x.kind==='effector'&&x.kindName==='knee')){
    const anchor=this.footAnchors.get(l.id);
    const foot=this.endpointGoal(l);
    const thigh=worldPos(l.upper),knee=worldPos(l.hinge),currentFoot=worldPos(l.effector);
    const first=thigh.distanceTo(knee),second=knee.distanceTo(currentFoot);
    const ray=foot.clone().sub(thigh),d=ray.length();if(d<1e-7)continue;
    const max=Math.max(.001,first+second-.006);
    const min=Math.sqrt(Math.max(0,first*first+second*second+2*first*second*Math.cos(l.maxBend*RAD)))+.006;
    if(d>max)deltas.push(ray.multiplyScalar((d-max)/d));
    else if(d<min)deltas.push(ray.multiplyScalar(-(min-d)/d));
   }
   if(!deltas.length)break;
   const shift=deltas.reduce((sum,v)=>sum.add(v),V()).divideScalar(deltas.length).multiplyScalar(.82);
   if(shift.length()>0.08)shift.setLength(0.08);
   if(shift.length()<.0001)break;
   this.moveHips(shift);
  }
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
   if(this.reanchorNextFrame){this.captureFootAnchors();this.captureEndpointBaseline();this.reanchorNextFrame=false;}
   this.captureAnimatedRaw(); // before modifying hips, knees or shoulders
   // If a shoulder has no animation track, its procedural rotation must not
   // accumulate from the prior frame. Keep a genuine newly animated frame.
   let restored=false;
   for(const b of this.shoulderBones){
    const prev=this.previousShoulderFrames.get(b);
    if(prev&&b.quaternion.angleTo(prev.after)<1e-6){b.quaternion.copy(prev.base);restored=true;}
   }
   if(restored)this.avatar.updateMatrixWorld(true);
   const animatedShoulder=new Map(this.shoulderBones.map(b=>[b,b.quaternion.clone()]));
   for(const l of this.limbs.filter(l=>l.kindName==='elbow'))
    l.animatedShoulderLocal=animatedShoulder.get(l.clavicle);
   const animatedUpper=new Map(this.limbs.map(l=>[l.upper,l.upper.quaternion.clone()]));
   const animatedBody=new Map();
   for(const h of this.bodyHandles)for(const bone of h.chain||[])animatedBody.set(bone,bone.quaternion.clone());
   // Character's animated hip bob and root translation are compensated by the
   // two planted feet. Hips and torso can still move within leg reach via IK.
   const corrections=[];
   for(const limb of this.limbs.filter(l=>l.kind==='effector'&&l.kindName==='knee')){
    const foot=this.footAnchors.get(limb.id);
    if(foot)corrections.push(this.endpointGoal(limb).sub(worldPos(limb.effector)));
   }
   if(corrections.length&&!this.pelvisAnchored){
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
    if(p?.targetLocal){const target=this.jointTarget?this.jointTarget(l,p):this.anchorRoot.localToWorld(p.targetLocal.clone());kneeGoals.push(target.sub(worldPos(l.hinge)));}
   }
   if(kneeGoals.length&&!pelvisPin&&!this.pelvisAnchored){
    const delta=kneeGoals.reduce((a,b)=>a.add(b),V()).divideScalar(kneeGoals.length).multiplyScalar(0.36);
    if(delta.length()>0.24)delta.setLength(0.24);
    this.moveHips(delta);
   }
   if(!this.pelvisAnchored)this.keepPelvisWithinLegReach();
   // The medical-reference hip cone is a hard upper limit on BOTH thighs;
   // it is enforced even when the source animation asks for a larger angle.
   for(const limb of this.limbs.filter(l=>l.kindName==='knee'&&l.kind==='effector'))constrainUpperLeg(limb);
   // Torso, neck and head offsets apply on top of the idle animation and are
   // bounded per vertebral group by conservative rig-specific angular caps.
   for(const h of this.bodyHandles.filter(h=>h.kind==='body')){
    const p=this.pins.get(h.id);if(!p?.targetLocal)continue;
    const desired=this.jointTarget?this.jointTarget(h,p):this.anchorRoot.localToWorld(p.targetLocal.clone());
    steerBodyHandle(h,desired,animatedBody);
   }
   // Leg contact priority: knee position is a secondary constraint while
   // BOTH feet always have world/model-anchor-space position goals. Solve to a
   // measured contact tolerance rather than blindly stopping after two passes.
   // Do NOT repeatedly translate the pelvis while dragging a foot: that
   // introduces a competing target and can fully block a moving ankle.
   for(let pass=0;pass<8;pass++){
    // V0149: bend-direction pole is resolved on EACH anchoring pass.
    for(const limb of this.limbs.filter(l=>l.kindName==='knee'&&l.kind==='effector')){
     const anchor=this.footAnchors.get(limb.id);
     if(!anchor)continue;
     const goal=this.endpointGoal(limb);
     const kneeId=limb.id.replace('-ankle','-knee');
     const kneePin=this.pins.get(kneeId);
     if(kneePin?.targetLocal){
       const control=this.limbs.find(l=>l.id===kneeId);
       const pole=this.jointTarget?this.jointTarget(control,kneePin)
         :control.reference.localToWorld(kneePin.targetLocal.clone());
       solveWithMiddlePole(limb,goal,pole,animatedUpper.get(limb.upper));
     }else solveEffector(limb,goal,animatedUpper.get(limb.upper));
     constrainUpperLeg(limb); // Hip anatomical limits remain mandatory.
     // Preserve foot world orientation (no planted-foot spinning during idle).
     const desiredWorld=worldQ(this.anchorRoot).multiply(anchor.orientationLocal);
     const parentQ=worldQ(limb.effector.parent).invert();
     limb.effector.quaternion.copy(parentQ.multiply(desiredWorld).normalize());
     limb.effector.updateMatrixWorld(true);
    }
    const contactErrors=[];
    for(const l of this.limbs.filter(l=>l.kindName==='knee'&&l.kind==='effector')){
     const anchor=this.footAnchors.get(l.id);
     if(anchor)contactErrors.push(this.endpointGoal(l).sub(worldPos(l.effector)));
    }
    const worst=contactErrors.reduce((m,d)=>Math.max(m,d.length()),0);
    if(worst<0.004)break; // 4mm contact accuracy in this rig's model space
   }
   // During an extreme controller FOOT drag, stop at the physically reached
   // location. Do not plant an unreachable ankle point 25cm away from the
   // actual skinned foot: that creates sliding when the drag is released.
   // Existing stationary foot anchors are never rewritten by torso edits.
   const draggingFoot=this.active?.limb;
   if(draggingFoot?.kind==='effector'&&draggingFoot.kindName==='knee'){
    const anchor=this.footAnchors.get(draggingFoot.id);
    const error=worldPos(draggingFoot.effector).distanceTo(
      this.endpointGoal(draggingFoot));
    if(error>0.012){
     const accepted=this.anchorRoot.worldToLocal(worldPos(draggingFoot.effector)).sub(this.animatedOffset(draggingFoot));
     anchor.targetLocal.copy(accepted);
     const pin=this.pins.get(draggingFoot.id);
     if(pin?.targetLocal)pin.targetLocal.copy(accepted);
    }
   }
   // If an arm is already posed and the user is not dragging it, restore
   // its exact local shoulder / upper-arm / elbow rotations on every frame.
   // This suppresses ONLY those three animation channels, while the animated
   // spine, hips, neck, legs and whole-object transform keep playing.
   // Recomputing IK from each animated elbow frame caused an overhead arm
   // to fall back to the torso during the Mixamo idle cycle.
   // A fixed hand needs a consistent elbow-bend branch as the source clip
   // evolves. Previously the IK restarted from the unrelated animation
   // every frame and could jump 20cm away from a stored overhead hand.
   if(this.bodyAnchorMode&&this.armPoseSeeds){
    for(const limb of this.limbs.filter(l=>l.kind==='effector'&&l.kindName==='elbow')){
     const seed=this.armPoseSeeds.get(limb.side);
     if(!seed)continue;
     limb.clavicle.quaternion.copy(seed.clavicle);
     limb.upper.quaternion.copy(seed.upper);
     limb.hinge.quaternion.copy(seed.hinge);
     limb.clavicle.updateMatrixWorld(true);
    }
   }
   const armSolveSides=new Set();
   for(const arm of this.limbs.filter(l=>l.kindName==='elbow'&&l.kind==='effector')){
    const wrist=this.pins.get(arm.id);
    const elbow=this.pins.get(arm.id.replace('-wrist','-elbow'));
    if(!this.bodyAnchorMode&&!wrist&&!elbow)continue;
    const lock=this.bodyAnchorMode?null:this.armPoseLocks.get(arm.side);
    if(lock){
     arm.clavicle.quaternion.copy(lock.clavicle);
     arm.upper.quaternion.copy(lock.upper);
     arm.hinge.quaternion.copy(lock.hinge);
     arm.clavicle.updateMatrixWorld(true);
    }else armSolveSides.add(arm.side);
   }
   // Apply overhead shoulder-girdle lift once per shoulder BEFORE wrist/elbow
   // IK. Whole-body motion and pinned feet still take priority.
   for(const l of this.limbs.filter(l=>l.kindName==='elbow'&&l.kind==='effector')){
    if(!armSolveSides.has(l.side))continue;
    const wrist=this.pins.get(l.id);
    const elbow=this.pins.get(l.id.replace('-wrist','-elbow'));
    const pin=wrist?.targetLocal?wrist:elbow;
    if(this.bodyAnchorMode)liftShoulderGirdle(l,this.endpointGoal(l));
    else if(pin?.targetLocal)liftShoulderGirdle(l,l.reference.localToWorld(pin.targetLocal.clone()));
   }
   // Upper limbs are lower-priority than the grounded legs and body. Elbows
   // use a constrained hinge; shoulders use bounded swing from animation.
   for(const limb of this.limbs.filter(l=>l.kindName==='elbow'&&l.kind==='bend')){
    if(!armSolveSides.has(limb.side))continue;
    const p=this.pins.get(limb.id);if(!p?.targetLocal)continue;
    const goal=this.jointTarget?this.jointTarget(limb,p):limb.reference.localToWorld(p.targetLocal.clone());
    // V0153: anchored wrists are absolute. The new 3D pole IK below must
    // receive the original arm geometry; the old one-off elbow steer could
    // throw the wrist 24 cm away before pole solving even began.
    if(!this.bodyAnchorMode)steerHingePosition(limb,goal,animatedUpper.get(limb.upper));
   }
   for(const limb of this.limbs.filter(l=>l.kindName==='elbow'&&l.kind==='effector')){
    if(!armSolveSides.has(limb.side))continue;
    const p=this.pins.get(limb.id);
    if(!this.bodyAnchorMode&&!p?.targetLocal)continue;
    const goal=this.bodyAnchorMode?this.endpointGoal(limb):limb.reference.localToWorld(p.targetLocal.clone());
    // Full two-link wrist IK is required when pelvis/torso moves beneath a
    // stationary hand. Its output is still projected through GH/shoulder ROM.
    if(this.bodyAnchorMode){
     const before=worldPos(limb.effector);
     // A previously validated local arm pose that already holds its hand
     // within 18mm must not be re-solved from a different elbow branch.
     const alreadyHeld=this.armPoseSeeds?.has(limb.side)
       &&this.active?.limb?.side!==limb.side
       &&before.distanceTo(goal)<.018;
     if(!alreadyHeld){
      const elbowId=limb.id.replace('-wrist','-elbow');
      const elbowPin=this.pins.get(elbowId);
      if(elbowPin?.targetLocal){
       const control=this.limbs.find(l=>l.id===elbowId);
       const pole=this.jointTarget?this.jointTarget(control,elbowPin)
         :control.reference.localToWorld(elbowPin.targetLocal.clone());
       solveWithMiddlePole(limb,goal,pole,animatedUpper.get(limb.upper));
      }else solveAnchoredArm(limb,goal,animatedUpper.get(limb.upper));
     }
     const solved=worldPos(limb.effector);
     this.lastBodyArmSolve??={};
     this.lastBodyArmSolve[limb.id]={
      beforeMetres:before.toArray(),goalMetres:goal.toArray(),
      solvedMetres:solved.toArray(),solvedErrorMetres:solved.distanceTo(goal),
      intrusionBeforeCorrection:torsoIntrusion(limb)
     };
    }else solveEffector(limb,goal,animatedUpper.get(limb.upper));
   }
   // Always run the final safety pass AFTER IK and pose-lock restoration.
    // It protects free-running animation as well as actively pinned arms.
    for(const limb of this.limbs.filter(l=>l.kindName==='elbow'&&l.kind==='effector')){
      finalArmSafety(limb,animatedUpper.get(limb.upper));
      if(this.bodyAnchorMode&&this.lastBodyArmSolve?.[limb.id]){
        const sample=this.lastBodyArmSolve[limb.id];
        sample.afterCollisionMetres=worldPos(limb.effector).toArray();
        sample.afterCollisionErrorMetres=worldPos(limb.effector).distanceTo(V().fromArray(sample.goalMetres));
        sample.intrusionAfterCorrection=torsoIntrusion(limb);
      }
      const lock=this.armPoseLocks.get(limb.side);
      if(lock&&!armSolveSides.has(limb.side)){
        lock.clavicle.copy(limb.clavicle.quaternion);
        lock.upper.copy(limb.upper.quaternion);
        lock.hinge.copy(limb.hinge.quaternion);
      }
    }
    // Capture the solved pose as a local, torso-following constraint; the
   // next animation frame will restore it instead of fighting with IK.
   for(const limb of this.limbs.filter(l=>l.kindName==='elbow'&&l.kind==='effector')){
    if(!armSolveSides.has(limb.side)||this.bodyAnchorMode)continue;
    this.armPoseLocks.set(limb.side,{
     clavicle:limb.clavicle.quaternion.clone(),
     upper:limb.upper.quaternion.clone(),
     hinge:limb.hinge.quaternion.clone()
    });
   }
   this.avatar.updateMatrixWorld(true);
   for(const b of this.shoulderBones)this.previousShoulderFrames.set(b,{
    base:animatedShoulder.get(b).clone(),after:b.quaternion.clone()
   });
  this.updateVisibility();
 }
}
