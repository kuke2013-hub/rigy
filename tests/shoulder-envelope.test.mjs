import test from 'node:test';
import assert from 'node:assert/strict';
import {SHOULDER_ENVELOPE_V07 as S,SHOULDER_GH_ENVELOPE_V07 as G,
  shoulderGirdleCarryDegrees as carry,projectShoulderDirection as project} from '../anatomy/shoulder-envelope.mjs';
const rad=d=>d*Math.PI/180;
const direction=(angle,side,plane)=>{
 const a=rad(angle),k=side==='left'?1:-1;
 if(plane==='lateral')return{x:k*Math.sin(a),y:-Math.cos(a),z:0};
 if(plane==='forward')return{x:0,y:-Math.cos(a),z:Math.sin(a)};
 if(plane==='backward')return{x:0,y:-Math.cos(a),z:-Math.sin(a)};
 return{x:-k*Math.sin(a),y:-Math.cos(a),z:0};
};
test('high total elevation is physically possible with a moving shoulder girdle',()=>{
 assert(S.forwardDeg>=170&&S.outwardDeg>=160);
 assert(S.outwardDeg>G.outwardDeg&&S.forwardDeg>G.forwardDeg);
 assert(carry(30)===0&&carry(90)>0&&carry(170)>=45&&carry(180)<=50);
});
for(const side of ['left','right']){
 for(const plane of ['forward','lateral']){
  test(`${side} full shoulder complex permits overhead ${plane} reach`,()=>{
   const permitted=project(direction(160,side,plane),side,S);
   assert.equal(permitted.clamped,false);
   const blockedGH=project(direction(160,side,plane),side,G);
   assert.equal(blockedGH.clamped,true);
   assert(blockedGH.elevationDeg<=125.001);
  });
 }
 for(const plane of ['backward','medial']){
  test(`${side} ${plane} hypermobility is restricted`,()=>{
   const p=project(direction(125,side,plane),side,S);
   assert.equal(p.clamped,true);
   assert(p.elevationDeg <= (plane==='backward'?40:65)+1e-6);
  });
 }
}
test('full shoulder sector stops beyond the selected overhead range',()=>{
 for(const side of ['left','right']){
  const p=project(direction(179,side,'lateral'),side,S);
  assert(p.clamped && Math.abs(p.elevationDeg-170)<1e-6);
 }
});
test('invalid directions rejected',()=>{
 assert.throws(()=>project({x:NaN,y:-1,z:0},'left'),TypeError);
 assert.throws(()=>project({x:0,y:0,z:0},'right'),RangeError);
 assert.throws(()=>carry(NaN),TypeError);
});