import test from 'node:test';
import assert from 'node:assert/strict';
import {torsoPenetrationLocal as depth,armSegmentIntrusion,armTorsoIntrusion} from '../anatomy/torso-collision.mjs';
const shape={shoulderSpan:0.38,torsoHeight:0.57};
test('Core torso interior is excluded, exterior is allowed',()=>{
 assert(depth({x:0,y:-.20,z:0},shape)>.99);
 assert.equal(depth({x:.32,y:-.20,z:0},shape),0);
 assert.equal(depth({x:0,y:-.20,z:.25},shape),0);
 assert.equal(depth({x:0,y:.10,z:0},shape),0);
});
test('Cross-chest motion in front of torso is allowed',()=>{
 const start={x:.19,y:-.09,z:.18},elbow={x:0,y:-.17,z:.23},wrist={x:-.12,y:-.19,z:.24};
 assert.equal(armTorsoIntrusion(start,elbow,wrist,shape),0);
});
test('Forearm penetrating chest is rejected even if wrist exits opposite side',()=>{
 const shoulder={x:.2,y:-.01,z:0},elbow={x:.20,y:-.19,z:0};
 const wrist={x:-.2,y:-.25,z:0};
 assert(armTorsoIntrusion(shoulder,elbow,wrist,shape)>.6);
});
test('No false contact above shoulders or near legs',()=>{
 assert.equal(armSegmentIntrusion({x:0,y:.2,z:0},{x:0,y:.07,z:0},shape),0);
 assert.equal(armSegmentIntrusion({x:0,y:-.54,z:0},{x:0,y:-.6,z:0},shape),0);
});
test('Invalid anatomy dimensions fail closed',()=>{
 assert.throws(()=>depth({x:0,y:0,z:0},{shoulderSpan:0,torsoHeight:.55}),TypeError);
});
