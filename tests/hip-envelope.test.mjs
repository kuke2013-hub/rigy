import test from 'node:test';
import assert from 'node:assert/strict';
import {HIP_ENVELOPE_V09,hipDirectionalAngles,projectHipDirection,projectHipFootGoal} from '../anatomy/hip-envelope.mjs';
const R=Math.PI/180;
const direction=(side,ab=0,flex=0)=>{let k=side==='left'?1:-1;
 return {x:k*Math.sin(ab*R),y:-Math.cos(ab*R)*Math.cos(flex*R),z:Math.cos(ab*R)*Math.sin(flex*R)};};
for(const side of ['left','right']){
 test(`${side}: 90° forced side split clamped to strict realistic abduction`,()=>{
  const result=projectHipDirection(direction(side,89),side);
  assert(result.clamped);
  assert(result.abductionDeg<=42.0001);
  assert(result.abductionDeg>30);
 });
 test(`${side}: pure 120° front hip flexion can occur`,()=>{
  const r=projectHipDirection(direction(side,0,120),side);
  assert(!r.clamped);
  assert(Math.abs(r.flexionDeg-120)<.001);
 });
 test(`${side}: extreme backwards hip extension rejected`,()=>{
  const r=projectHipDirection(direction(side,0,-110),side);
  assert(r.clamped);assert(r.flexionDeg>=-15.001);
 });
 test(`${side}: across-midline adduction cannot exceed 18°`,()=>{
  const r=projectHipDirection(direction(side,-60),side);
  assert(r.clamped);assert(r.abductionDeg>=-18.001);
 });
 test(`${side}: no simultaneous extreme flexion and spread`,()=>{
  const r=projectHipDirection(direction(side,40,120),side);
  assert(r.clamped);assert(r.flexionDeg<120);assert(r.abductionDeg<40);
 });
 test(`${side}: impossible foot target projects into reachable hip sector`,()=>{
  const r=projectHipFootGoal(direction(side,89,0),side,.75);
  assert(r.clamped);assert(Math.hypot(r.x,r.y,r.z)<=.750001);
  assert(hipDirectionalAngles(r,side).abductionDeg<=42.0001);
 });
}
test('bad directions rejected',()=>{
 assert.throws(()=>projectHipDirection({x:NaN,y:0,z:1},'left'),TypeError);
 assert.throws(()=>projectHipDirection({x:0,y:0,z:0},'left'),RangeError);
 assert.throws(()=>projectHipDirection({x:0,y:-1,z:0},'neither'),TypeError);
 assert(HIP_ENVELOPE_V09.highFlexionAbductionReduction>0);
});
import {thighSoftTissueOverlap} from '../anatomy/hip-envelope.mjs';
test('thick thigh capsules do not occupy same swept volume',()=>{
 const leftA={x:.09,y:1,z:0},leftB={x:.12,y:.60,z:0};
 const rightA={x:-.09,y:1,z:0},rightB={x:-.12,y:.60,z:0};
 assert.equal(thighSoftTissueOverlap(leftA,leftB,rightA,rightB,.045,.045),0);
 const intruding={x:.085,y:.60,z:0};
 assert(thighSoftTissueOverlap(leftA,leftB,rightA,intruding,.045,.045)>.02);
});