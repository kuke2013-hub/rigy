import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:8765/?rigy_test=1',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>window.__rigyDiagnostics?.().ready===true,null,{timeout:120000});
 for(const side of ['left','right']){
   const result=await page.evaluate(s=>window.__rigyTestInjectUnsafeArm(s),side);
   console.log('UNPINNED ARM GUARD',side,JSON.stringify(result));
   assert(result.before.torsoIntrusion>.07,'Unsafe '+side+' test injection must collide');
   assert(result.after.withinEnvelope,side+' shoulder leaves anatomical sector');
   assert(result.after.torsoIntrusion<=.035,side+' torso penetration '+result.after.torsoIntrusion);
   assert.equal(result.after.safety?.valid,true,side+' has no feasible guard result');
   assert.equal((await page.evaluate(()=>window.__rigyDiagnostics())).pinnedCount,0,'Safety requires no pins');
 }
 for(const time of [.25,2.4,5.1,8.6,12.4]){
   const data=await page.evaluate(t=>window.__rigyTestJumpAnimation(t),time);
   for(const side of ['left','right']){
     const arm=data.shoulderDiagnostics[side+'-wrist'];
     console.log('ANIMATED SHOULDER',time,side,JSON.stringify(arm.safety));
     assert(arm.withinEnvelope,side+' animation ROM violation '+time);
     assert(arm.torsoIntrusion<=.035,side+' animation collision '+time);
   }
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: both arms continually bounded during unpinned animation and forced penetration');
}finally{await browser.close();}
