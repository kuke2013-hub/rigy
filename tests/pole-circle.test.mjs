import {test} from 'node:test';
import assert from 'node:assert/strict';
import {projectedMiddleJoint as solve} from '../rigy/animated/pole-circle.mjs';
const len=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const a={x:0,y:0,z:0},b={x:0,y:-1.7,z:0};
for(const axis of ['x','z'])for(const s of [-1,1]){
 test('midpoint moves sideways on '+axis+' '+s+' without moving endpoints',()=>{
  const requested={x:axis==='x'?s:0,y:-.85,z:axis==='z'?s:0};
  const p=solve(a,b,1,1,requested,{x:0,y:-.85,z:1});
  assert(p&&Math.sign(p[axis])===s);
  assert(Math.abs(len(a,p)-1)<1e-8&&Math.abs(len(b,p)-1)<1e-8);
 });
}
test('unreachable endpoints rejected without stretching bones',()=>{
 assert.equal(solve(a,{x:0,y:-3,z:0},1,1,{x:1,y:0,z:0},{x:0,y:0,z:1}),null);
});
