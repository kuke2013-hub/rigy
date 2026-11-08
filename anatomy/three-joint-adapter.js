import * as THREE from 'three';
import {constrainAnatomicalAngles, getJointProfile} from './constraint-core.mjs';

const rad = THREE.MathUtils.degToRad, deg = THREE.MathUtils.radToDeg;
const qTemp = new THREE.Quaternion();
const qParent = new THREE.Quaternion();

/**
 * Explicit rig calibration is required; bone naming alone cannot establish
 * physiological axes. Anatomical frame maps +X flexion, +Y longitudinal twist,
 * +Z abduction into this specific GLB bone's LOCAL REST frame.
 * This is a prototype XYZ decomposition and not a complete ISB JCS solver.
 */
export function calibrateRig(root, calibration, medicalData) {
  if(calibration?.schemaVersion!==1 || !Array.isArray(calibration.joints))
    throw new Error('Invalid calibration file schema');
  if(!calibration.confirmedByHuman)throw new Error('Calibration requires confirmedByHuman=true after actual inspection');
  const joints=new Map();
  for(const c of calibration.joints){
    if(c.confirmed!==true)throw new Error(`Joint not confirmed: ${c.bone||'<unnamed>'}`);
    if(typeof c.bone!=='string'||!c.bone)throw new Error('Bone name missing');
    const candidates=[];
    root.traverse(obj=>{if(obj.isBone&&obj.name===c.bone)candidates.push(obj);});
    if(candidates.length!==1)throw new Error(`Bone ${c.bone} has ${candidates.length} matches; requires exactly 1`);
    const bone=candidates[0];
    if(joints.has(bone))throw new Error(`Duplicate bone entry: ${c.bone}`);
    if(!Array.isArray(c.anatomicalFrameQuat)||c.anatomicalFrameQuat.length!==4 ||
       c.anatomicalFrameQuat.some(v=>!Number.isFinite(v)))
      throw new Error(`Invalid frame quaternion for ${c.bone}`);
    const magnitude=Math.hypot(...c.anatomicalFrameQuat);
    if(Math.abs(magnitude-1)>1e-3)throw new Error(`Frame quaternion must be unit length: ${c.bone}`);
    const profile=getJointProfile(medicalData,c.profile);
    const frame=new THREE.Quaternion(...c.anatomicalFrameQuat).normalize();
    // Capture bind pose from the loaded file before any procedural or animated
    // manipulation. User must supply a static neutral rig; no auto bone inference.
    joints.set(bone,{bone,profile,frame,bind:bone.quaternion.clone(),
      frameInverse:frame.clone().invert(),bindInverse:bone.quaternion.clone().invert(),
      name:c.bone});
  }
  if(!joints.size)throw new Error('Calibration has no usable joints');
  return joints;
}

export function constrainBoneLocal(joint, desiredLocal) {
  const relative = joint.bindInverse.clone().multiply(desiredLocal).normalize();
  const anat=joint.frameInverse.clone().multiply(relative).multiply(joint.frame).normalize();
  const e=new THREE.Euler().setFromQuaternion(anat,'XYZ');
  const requested={flexion:deg(e.x),twist:deg(e.y),abduction:deg(e.z)};
  const bounded=constrainAnatomicalAngles(joint.profile,requested);
  const boundedQuaternion=new THREE.Quaternion().setFromEuler(new THREE.Euler(
    rad(bounded.flexion),rad(bounded.twist),rad(bounded.abduction),'XYZ'));
  const local=joint.bind.clone().multiply(joint.frame).multiply(boundedQuaternion)
    .multiply(joint.frameInverse).normalize();
  joint.bone.quaternion.copy(local);
  joint.bone.updateMatrixWorld(true);
  return bounded;
}

export function setConstrainedWorldOrientation(joint, requestedWorld) {
  const parent=joint.bone.parent;
  if(!parent)throw new Error(`Orphan joint ${joint.name}`);
  parent.updateWorldMatrix(true,false);
  parent.getWorldQuaternion(qParent);
  const local=qTemp.copy(qParent).invert().multiply(requestedWorld);
  return constrainBoneLocal(joint,local);
}
