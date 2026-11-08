import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const b=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
const page=await b.newPage({viewport:{width:1440,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:8765/?rigy_test=1',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>window.__rigyDiagnostics?.().ready===true,null,{timeout:120000});
 for(const t of [.2,2.4,6.1,9.3,13.7]){
  const x=await page.evaluate(t=>window.__rigyTestJumpAnimation(t),t);
  for(const id of ['left-ankle','right-ankle']){
   const k=x.hipDiagnostics[id];
   console.log('KNEE ANATOMY CLIP',t,id,JSON.stringify(k));
   assert.equal(k.kneeWithinLimits,true,id+' invalid knee hinge under original animation');
   assert.equal(k.withinEnvelope,true,id+' hip 3D direction invalid');
  }
 }
 for(const id of ['left-knee','right-knee'])for(const sign of [-1,1]){
  await page.evaluate(()=>window.__rigyTestReset());
  const m=await page.evaluate(({id,sign})=>window.__rigyTestControllerDrag(id,[.12*sign,0,0]),{id,sign});
  const x=(await page.evaluate(()=>window.__rigyDiagnostics())).hipDiagnostics[id.replace('knee','ankle')];
  const dx=m.after[0]-m.before[0];
  console.log('KNEE ANATOMY GRAB',id,sign,JSON.stringify({dx,x}));
  assert(dx*sign>.005,id+' sideways movement disabled');
  assert.equal(x.kneeWithinLimits,true,id+' knee twist or flexion outside medical reference');
  assert.equal(x.withinEnvelope,true,id+' hip direction outside coupled envelope');
  assert(x.kneeOffAxisDeg<=.06);
  assert(x.kneeFlexionDeg>=-.06&&x.kneeFlexionDeg<=138.06);
  assert(Math.abs(x.hipAxialTwistDeg)<=35.06);
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: knee hinges and hip axial envelope enforced during animation and bilateral sideways drags');
}finally{await b.close();}
