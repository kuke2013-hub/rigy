import {test} from 'node:test';
import assert from 'node:assert/strict';
import {motionWeight,relativeMotion} from '../rigy/animated/pelvis-pose-math.mjs';
test('default 15%, and hard cap of 20% animation',()=>{
 assert.equal(motionWeight(.15),.15);
 assert.equal(motionWeight(.85),.2);
 assert.equal(motionWeight(-.5),0);
 assert.throws(()=>motionWeight(NaN),TypeError);
});
test('rebase original programmed displacement around a new pose',()=>{
 const pose={x:10,y:4,z:-2};
 const raw={x:1.15,y:0,z:0},initial={x:1,y:0,z:0};
 const residual=relativeMotion(raw,initial,.2,.05);
 assert(Math.abs((pose.x+residual.x)-10.03)<1e-9);
});
test('clamp micro-motion in metres independently of original amplitude',()=>{
 const v=relativeMotion({x:2,y:0,z:0},{x:0,y:0,z:0},.15,.025);
 assert(Math.abs(v.x-.025)<1e-9);
});
test('zero influence means no underlying movement',()=>{
 assert.deepEqual(relativeMotion({x:12,y:3,z:4},{x:1,y:2,z:3},0),{x:0,y:0,z:0});
});
