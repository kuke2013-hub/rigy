import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,args:[
 '--use-gl=angle','--use-angle=swiftshader','--enable-webgl',
 '--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:8765/?rigy_test=1',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>window.__rigyDiagnostics?.().ready===true,null,{timeout:120000});
 for(const side of ['left','right'])for(const part of ['shoulder-twist','elbow-swing','clavicle'])for(const pinned of [false,true]){
   const res=await page.evaluate(({side,part,pinned})=>window.__rigyTestIllegalJoint(side,part,pinned),
     {side,part,pinned});
   console.log('HARD JOINT OVERRIDE',side,part,pinned,JSON.stringify(res));
   assert.equal(res.after.absoluteJointLimitsOK,true,side+' '+part+' invalid saved rotation');
   assert(Math.abs(res.after.axialTwistFromNeutralDeg)<=75.1,side+' shoulder twist invalid');
   assert(res.after.elbowOffHingeDeg<.08,side+' elbow swung off hinge');
   assert(res.after.elbowFlexFromNeutralDeg>=-.08&&res.after.elbowFlexFromNeutralDeg<=145.1,side+' elbow flex beyond 0–145');
   assert(res.after.girdleFromNeutralDeg<=55.1,side+' clavicle too far from neutral');
   assert(res.after.withinEnvelope,side+' shoulder sector invalid');
   assert(res.after.torsoIntrusion<=.036,side+' arm intersects torso');
 }
 for(const time of [0,2.2,5.3,9,13.7]){
  const out=await page.evaluate(t=>{window.__rigyTestReset();return window.__rigyTestJumpAnimation(t);},time);
  for(const side of ['left','right'])
   assert(out.shoulderDiagnostics[side+'-wrist'].absoluteJointLimitsOK,side+' unguarded animation '+time);
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: source animation and saved poses cannot override absolute shoulder/elbow limits');
}finally{await browser.close();}
