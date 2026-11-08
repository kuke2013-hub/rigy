import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveTwoHandScale as scale,MIN_TRACKED_HAND_SEPARATION_METRES as floor} from '../rigy/controls/grip-scale.mjs';
const almostEqual=(actual,expected)=>assert(Math.abs(actual-expected)<1e-12,`${actual} differs from ${expected}`);

test('two-grip scaling remains linear in Quest-tracked hand distance',()=>{
  assert.equal(floor,0.035);
  almostEqual(scale(1,0.20,0.20),1);
  almostEqual(scale(1,0.20,0.30),1.5);
  almostEqual(scale(1,0.06,0.09),1.5);
  almostEqual(scale(1,0.04,0.08),2);
});
test('both ends clamp to 10–350%, including close-grip starts',()=>{
  almostEqual(scale(1,0.20,0.001),0.175);
  almostEqual(scale(1,0.20,1.0),3.5);
  almostEqual(scale(0.1,0.4,0.035),0.1);
  almostEqual(scale(3.5,0.04,0.10),3.5);
});
test('nonfinite XR positions cannot generate corrupt scale',()=>{
  assert(Number.isNaN(scale(1,Number.NaN,0.1)));
});
