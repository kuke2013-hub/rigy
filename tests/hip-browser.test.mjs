/** Independent FBX browser regression for hip limits, unrelated to the arm solver's remaining tests. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:8765/?rigy_test=1',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>window.__rigyDiagnostics?.().ready===true,null,{timeout:120000});
 const initial=await page.evaluate(()=>window.__rigyDiagnostics());
 assert.equal(initial.handleCount,12);
 assert.equal(initial.plantedFeet,2);
 for(const side of ['left','right']){
  const id=side+'-ankle',outward=side==='left'?1:-1;
  for(const [label,offset] of [
   ['excessive_side_split',[outward*1.75,0,0]],
   ['cross_midline',[-outward*1.4,0,0]],
   ['backwards_hyperextension',[0,0,-1.25]],
   ['combined_elevated_split',[outward*1.0,0.9,0.8]]
  ]){
   await page.evaluate(()=>window.__rigyTestReset());
   await page.waitForTimeout(170);
   const moved=await page.evaluate(({id,offset})=>window.__rigyTestControllerDrag(id,offset),{id,offset});
   const report=(await page.evaluate(()=>window.__rigyDiagnostics()));
   const hip=report.hipDiagnostics?.[id];
   console.log('HIP_REGRESSION',id,label,JSON.stringify({hip,goal:moved.goal,moved:moved.moved,footErrors:report.footErrors}));
   assert(hip,`${id} missing hip diagnostics`);
   assert(hip.withinEnvelope,`${id} violates enforced hip envelope`);
   assert(hip.abductionDeg<=42.02&&hip.abductionDeg>=-18.02,`${id}: bad abduction ${hip.abductionDeg}`);
   assert(hip.flexionDeg<=120.02&&hip.flexionDeg>=-15.02,`${id}: bad flexion ${hip.flexionDeg}`);
   assert(moved.goal.every(Number.isFinite)&&moved.after.every(Number.isFinite),`${id}: invalid joint pose`);
   assert(Number.isFinite(hip.footErrorMetres),`${id}: invalid planted foot error`);
   // Even a controller movement several metres beyond the ROM envelope
   // must leave the pinned ankle on its ACTUAL skin/bone point.
   assert(hip.footErrorMetres<.025,
    `${id} ${label}: impossible target left foot anchor ${hip.footErrorMetres.toFixed(3)}m off mesh`);
  }
 }
 assert.deepEqual(errors,[],`Browser errors: ${errors.join('; ')}`);
 console.log('PASS: both legs restricted in 3D during extreme controller drags; original FBX still animated');
}finally{await browser.close();}