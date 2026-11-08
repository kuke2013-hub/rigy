import test from 'node:test';
import assert from 'node:assert/strict';
import {SHOULDER_ENVELOPE_V06 as L,projectShoulderDirection as project,shoulderElevationLimit} from '../anatomy/shoulder-envelope.mjs';
const radians=d=>d*Math.PI/180;
const direction=(angle,side,plane)=>{
 const a=radians(angle), k=side==='left'?1:-1;
 if(plane==='lateral')return{x:k*Math.sin(a),y:-Math.cos(a),z:0};
 if(plane==='anterior')return{x:0,y:-Math.cos(a),z:Math.sin(a)};
 if(plane==='posterior')return{x:0,y:-Math.cos(a),z:-Math.sin(a)};
 if(plane==='medial')return{x:-k*Math.sin(a),y:-Math.cos(a),z:0};
 throw Error('plane');
};
test('anatomical directional limits are asymmetric and documented',()=>{
 assert(L.backwardDeg<L.outwardDeg && L.acrossBodyDeg<L.forwardDeg);
 assert.equal(shoulderElevationLimit(1,0),90);
 assert.equal(shoulderElevationLimit(0,-1),35);
 assert.equal(shoulderElevationLimit(0,1),100);
});
for(const side of ['left','right'])for(const plane of ['lateral','anterior','posterior','medial']){
 test(`${side} shoulder ${plane} rejects excessive elevation`,()=>{
  const out=project(direction(135,side,plane),side);
  const limit={lateral:90,anterior:100,posterior:35,medial:45}[plane];
  assert.equal(out.clamped,true);
  assert(Math.abs(out.elevationDeg-limit)<1e-8);
  assert(Math.abs(Math.hypot(out.x,out.y,out.z)-1)<1e-8);
 });
 test(`${side} shoulder ${plane} preserves ordinary reachable movement`,()=>{
  const normal=direction(25,side,plane);
  const out=project(normal,side);
  assert.equal(out.clamped,false);
  assert(Math.abs(out.x-normal.x)<1e-8);
 });
}
test('diagonal posterior/outward has tighter reach than pure outward',()=>{
 const bound=shoulderElevationLimit(Math.SQRT1_2,-Math.SQRT1_2);
 assert(bound>35&&bound<90);
});
test('bad inputs fail closed',()=>{
 assert.throws(()=>project({x:0,y:0,z:0},'left'),RangeError);
 assert.throws(()=>project({x:NaN,y:1,z:0},'left'),TypeError);
 assert.throws(()=>project({x:1,y:0,z:0},'unknown'),TypeError);
});
