import * as THREE from 'three';
import {calibrateRig, setConstrainedWorldOrientation} from './three-joint-adapter.js';

/**
 * Experimental opt-in trigger posing. Zelda v13 SIDE GRIPS remain bound to
 * whole-object motion and never change. No model / no calibration -> no posing.
 * A ray-selected skinned surface is associated with its highest weighted bone.
 * CCD follows the controller position; selected-bone orientation follows the
 * tracked controller, then passes through calibrated angle constraints.
 * Prototype limitations: no shoulder-girdle model, full ISB JCS, collision,
 * skin collision/contact, accurate muscle stiffness, or Quest validation.
 */
export function createPoseLayer({renderer, avatar, calibration, medicalData, onStatus,
                                isWholeObjectHeld=()=>false}) {
  if(!avatar)throw new Error('Load a character before creating the pose layer');
  const joints=calibrateRig(avatar,calibration,medicalData);
  const surfaces=[];
  avatar.traverse(o=>{if(o.isSkinnedMesh&&o.skeleton&&o.geometry?.attributes?.skinIndex)surfaces.push(o);});
  if(!surfaces.length)throw new Error('This model has no SkinnedMesh with skin indexes');
  const raycaster=new THREE.Raycaster(), rayDir=new THREE.Vector3(), rayOrigin=new THREE.Vector3();
  const ctrlQuat=new THREE.Quaternion(),worldQ=new THREE.Quaternion();
  const v0=new THREE.Vector3(),v1=new THREE.Vector3(),v2=new THREE.Vector3();
  const qDelta=new THREE.Quaternion();
  let enabled=false,active=null;
  const listeners=[];

  function dominantBone(hit) {
    const mesh=hit.object,face=hit.face,geometry=mesh.geometry;
    if(!mesh.isSkinnedMesh || !face)return null;
    const skinIdx=geometry.attributes.skinIndex,skinWeights=geometry.attributes.skinWeight;
    if(!skinIdx||!skinWeights)return null;
    const tally=new Map();
    for(const vertex of [face.a,face.b,face.c]){
      for(let slot=0;slot<4;slot++){
        const index=Math.round(skinIdx.getComponent(vertex,slot));
        const weight=skinWeights.getComponent(vertex,slot);
        if(weight>0)tally.set(index,(tally.get(index)||0)+weight);
      }
    }
    const sorted=[...tally.entries()].sort((a,b)=>b[1]-a[1]);
    const index=sorted[0]?.[0];
    return index===undefined?null:mesh.skeleton.bones[index]||null;
  }

  function pickFromController(controller) {
    avatar.updateWorldMatrix(true,true);
    controller.updateWorldMatrix(true,false);
    controller.getWorldPosition(rayOrigin);
    controller.getWorldQuaternion(ctrlQuat);
    rayDir.set(0,0,-1).applyQuaternion(ctrlQuat);
    raycaster.ray.origin.copy(rayOrigin);raycaster.ray.direction.copy(rayDir);
    for(const hit of raycaster.intersectObjects(surfaces,false)){
      const bone=dominantBone(hit);
      if(!bone)continue;
      const chain=[];
      for(let candidate=bone;candidate;candidate=candidate.parent){
        if(joints.has(candidate))chain.push(joints.get(candidate));
        if(candidate===avatar)break;
      }
      if(!chain.length)continue;
      // Associate the exact hit point with the closest selected skeleton bone.
      const boneLocalPoint=bone.worldToLocal(hit.point.clone());
      bone.getWorldQuaternion(worldQ);
      return {bone,chain,localPoint:boneLocalPoint,initialHit:hit.point.clone(),
        initialControllerPos:rayOrigin.clone(),initialAim:rayDir.clone(),
        reach:hit.distance,initialControllerQuat:ctrlQuat.clone(),
        grabbedBoneWorldQuat:worldQ.clone(),controller};
    }
    return null;
  }

  function start(controller) {
    if(!enabled||isWholeObjectHeld())return;
    if(active)return;
    active=pickFromController(controller);
    if(active)onStatus?.(`POSE (experimental): ${active.bone.name} selected with trigger. Side grips still move whole model.`);
    else onStatus?.('Pose selection missed a calibrated skinned joint. Whole-object grips remain available.');
  }
  function stop(controller){if(active?.controller===controller)active=null;}
  for(let i=0;i<2;i++){
    const controller=renderer.xr.getController(i);
    const onStart=()=>start(controller),onEnd=()=>stop(controller);
    controller.addEventListener('selectstart',onStart);
    controller.addEventListener('selectend',onEnd);
    listeners.push({controller,onStart,onEnd});
  }

  function update(){
    if(!enabled||!active||isWholeObjectHeld())return;
    const s=active,controller=s.controller;
    controller.updateWorldMatrix(true,false);
    controller.getWorldPosition(rayOrigin);
    controller.getWorldQuaternion(ctrlQuat);
    rayDir.set(0,0,-1).applyQuaternion(ctrlQuat);
    // Absolute grip displacement + change of aim direction at the initial reach.
    // This is an experimental pose target, not a change to original Zelda far-grab.
    const target=s.initialHit.clone().add(v0.subVectors(rayOrigin,s.initialControllerPos));
    const aimDelta=v1.subVectors(rayDir,s.initialAim);
    aimDelta.addScaledVector(s.initialAim,-aimDelta.dot(s.initialAim));
    target.addScaledVector(aimDelta,Math.min(20,s.reach));
    for(let iteration=0;iteration<7;iteration++){
      const effector=s.bone.localToWorld(s.localPoint.clone());
      if(effector.distanceToSquared(target)<0.000004)break;
      for(const j of s.chain){
        j.bone.updateWorldMatrix(true,true);
        j.bone.getWorldPosition(v0);
        const current=s.bone.localToWorld(s.localPoint.clone());
        v1.subVectors(current,v0);
        v2.subVectors(target,v0);
        if(v1.lengthSq()<1e-10||v2.lengthSq()<1e-10)continue;
        qDelta.setFromUnitVectors(v1.normalize(),v2.normalize());
        // Damped CCD iteration to reduce snapping near singular configurations.
        qDelta.slerp(new THREE.Quaternion(),0.35);
        j.bone.getWorldQuaternion(worldQ);
        setConstrainedWorldOrientation(j,qDelta.multiply(worldQ));
      }
    }
    // Orientation is an independent target; only the selected bone is assigned
    // controller twist. The anatomical frame limits the resulting wrist etc.
    const selectedJoint=joints.get(s.bone);
    if(selectedJoint){
      const rotationOffset=s.initialControllerQuat.clone().invert().multiply(s.grabbedBoneWorldQuat);
      const desiredWorld=ctrlQuat.clone().multiply(rotationOffset);
      setConstrainedWorldOrientation(selectedJoint,desiredWorld);
    }
    avatar.updateMatrixWorld(true);
  }

  return {
    setEnabled(next){enabled=!!next; if(!enabled)active=null;return enabled;},
    update,
    resetPose(){active=null;for(const j of joints.values())j.bone.quaternion.copy(j.bind);avatar.updateMatrixWorld(true);},
    dispose(){active=null;enabled=false;for(const {controller,onStart,onEnd} of listeners){
      controller.removeEventListener('selectstart',onStart);
      controller.removeEventListener('selectend',onEnd);
    }},
    jointCount:joints.size
  };
}
