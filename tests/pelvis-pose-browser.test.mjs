import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,args:['--use-gl=angle',
 '--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const failures=[];page.on('pageerror',e=>failures.push(e.message));
const distance=(a,b)=>Math.hypot(...a.map((n,i)=>n-b[i]));
const IDs=['left-wrist','right-wrist','left-ankle','right-ankle'];
try{
 await page.goto('http://127.0.0.1:8765/?rigy_test=1',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>window.__rigyDiagnostics?.().ready===true,null,{timeout:120000});
 let d=await page.evaluate(()=>window.__rigyDiagnostics());
 assert.equal(d.pelvisPose?.version,'RIGY-V0147');
 assert.equal(d.pelvisPose?.animationInfluence,.15);
 assert.equal(d.pelvisPose?.anchoredFeet,2);
 assert.equal(d.pelvisPose?.anchoredHands,2);
 assert(d.pelvisPose.pelvisDriftMetres<.005);
 const initial=d.pelvisPose.pelvisWorld,anchor0=d.endpointAnchors;
 // The original FBX must NEVER animate the pelvic translation.
 for(const t of [0.2,2.4,6.1,10.0,13.7]){
  d=await page.evaluate(t=>window.__rigyTestJumpAnimation(t),t);
  console.log('LOCKED PELVIS',t,JSON.stringify(d.pelvisPose));
  assert(distance(initial,d.pelvisPose.pelvisWorld)<.005,'Idle moves pelvis at '+t);
  for(const id of IDs){
   const a=d.endpointAnchors[id];
   assert(distance(a.baseMetres,anchor0[id].baseMetres)<.00001,'Endpoint anchor drifts '+id);
   assert(a.idleOffsetMetres<.00001,'Animation displaces endpoint '+id);
  }
 }
 // A manual pelvis move MUST move the pelvis, NEVER the hands or feet.
 // Downward/sideways motion is feasible with both legs already extended.
 const pelvis=await page.evaluate(()=>window.__rigyTestControllerDrag('pelvis',[.04,-.025,.015]));
 d=await page.evaluate(()=>window.__rigyDiagnostics());
 console.log('MOVED PELVIS',JSON.stringify({pelvis,pose:d.pelvisPose,anchors:d.endpointAnchors}));
 assert(pelvis.moved>.01,'Pelvis controller could not move');
 assert(d.pelvisPose.pelvisDriftMetres<.006,'Pelvis does not stay at its chosen position');
 for(const id of IDs){
  assert(distance(d.endpointAnchors[id].baseMetres,anchor0[id].baseMetres)<.00001,id+' moved with pelvis');
  assert(d.endpointAnchors[id].errorMetres<.045,id+' failed to remain near the anchor');
 }
 const afterMove=d.pelvisPose.pelvisWorld;
 for(const t of [1.6,7.1,12.4]){
  d=await page.evaluate(t=>window.__rigyTestJumpAnimation(t),t);
  assert(distance(d.pelvisPose.pelvisWorld,afterMove)<.005,'Moved pelvis drifted at '+t);
  for(const id of IDs){
   assert(distance(d.endpointAnchors[id].baseMetres,anchor0[id].baseMetres)<.00001,
    'Hand or foot anchor followed animation: '+id);
   assert(d.endpointAnchors[id].errorMetres<.035,
    'Rendered joint drifted from anchor: '+id+' error '+d.endpointAnchors[id].errorMetres);
  }
 }
 await page.evaluate(()=>window.__rigyTestReset());
 const hand=await page.evaluate(()=>window.__rigyTestControllerDrag('left-wrist',[.02,.02,.01]));
 assert(hand.pinCount>0);
 const handAnchor=(await page.evaluate(()=>window.__rigyDiagnostics())).endpointAnchors['left-wrist'].baseMetres;
 await page.evaluate(()=>window.__rigyTestControllerDrag('pelvis',[.023,.010,.010]));
 d=await page.evaluate(()=>window.__rigyDiagnostics());
 assert(distance(d.endpointAnchors['left-wrist'].baseMetres,handAnchor)<.00001,
  'Placed wrist follows pelvis instead of remaining an anchor');
 // Raised hand should remain anchored when the underlying animation
 // advances. The V0144 elbow-branch reset produced a 20cm displacement.
 // Let the mixer advance after reset, as in the original overhead smoke.
 await page.evaluate(()=>window.__rigyTestReset());
 await page.waitForTimeout(180);
 await page.evaluate(()=>window.__rigyTestOverhead('left-wrist',160,'forward'));
 console.log('IMMEDIATE RAISED WRIST',
  JSON.stringify((await page.evaluate(()=>window.__rigyDiagnostics())).shoulderDiagnostics['left-wrist']));
 await page.waitForTimeout(170);
 let raised=(await page.evaluate(()=>window.__rigyDiagnostics())).shoulderDiagnostics['left-wrist'];
 console.log('INITIAL OVERHEAD HAND',JSON.stringify(raised));
 assert(raised.wristGoalErrorMetres<.075,
  'Failed to establish raised arm: '+raised.wristGoalErrorMetres);
 raised=(await page.evaluate(()=>window.__rigyTestJumpAnimation(6.4))).shoulderDiagnostics['left-wrist'];
 console.log('OVERHEAD HAND CONTINUITY',JSON.stringify(raised));
 assert(raised.wristGoalErrorMetres<.075,
  'Pinned wrist drifted on animated frame: '+raised.wristGoalErrorMetres);
 assert.deepEqual(failures,[]);
 console.log('PASS: stationary pelvis, both hands/feet anchored, animation reduced and raised hand retained');
}finally{await browser.close();}
