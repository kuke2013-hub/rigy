/** Rigy pelvis/torso motion must retain 4 spatial endpoint anchors + subtle idle motion. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,args:[
 '--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist',
 '--enable-unsafe-swiftshader'
]});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
const dist=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
try{
 await page.goto('http://127.0.0.1:8765/?rigy_test=1',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>window.__rigyDiagnostics?.().ready===true,null,{timeout:120000});
 const initial=await page.evaluate(()=>window.__rigyDiagnostics());
 assert.equal(initial.handleCount,12);
 assert(initial.animationDuration>10);
 for(const id of ['left-wrist','right-wrist','left-ankle','right-ankle'])
  assert(initial.endpointAnchors[id].anchored,'missing initial endpoint anchor: '+id);
 const pelvis=await page.evaluate(()=>window.__rigyTestControllerDrag('pelvis',[0.040,-0.020,0.015]));
 const after=await page.evaluate(()=>window.__rigyDiagnostics());
 console.log('PELVIS ANCHOR TEST:',JSON.stringify({pelvis,mode:after.bodyAnchorMode,anchors:after.endpointAnchors}));
 console.log('WRIST IK TRACE:',JSON.stringify(after.armSolveTrace));
 assert.equal(after.bodyAnchorMode,true,'pelvis editing must switch wrists to room-fixed anchor frame');
 assert(pelvis.moved>0.01,'pelvis must move physically');
 for(const id of ['left-wrist','right-wrist','left-ankle','right-ankle']){
  const goal=after.endpointAnchors[id],first=initial.endpointAnchors[id];
  assert(dist(goal.baseMetres,first.baseMetres)<0.020,
   id+' global placement anchor moved with pelvis');
  assert(goal.idleOffsetMetres<=(goal.kind==='foot'?.00601:.03001),
   id+' idle movement exceeds configured bounds');
  assert(goal.errorMetres<(goal.kind==='foot'?.027:.025),
   id+' failed to hold placement while pelvis moved: '+goal.errorMetres);
 }
 const base=after.endpointAnchors;
 let subtleBodyMotion=false;
 for(const t of [1.25,3.8,8.6,12.9]){
  const diag=await page.evaluate(t=>window.__rigyTestJumpAnimation(t),t);
  console.log('ANIMATED ANCHORS',t,JSON.stringify(diag.endpointAnchors));
  for(const id of ['left-wrist','right-wrist','left-ankle','right-ankle']){
   const e=diag.endpointAnchors[id],b=base[id];
   assert(dist(e.baseMetres,b.baseMetres)<.001,'base anchor drifted: '+id+' at '+t);
   assert(e.idleOffsetMetres<=(e.kind==='foot'?.00601:.03001));
   assert(e.errorMetres<(e.kind==='foot'?.028:.030),
    id+' failed at '+t+'s: '+e.errorMetres.toFixed(3)+'m');
   if(e.kind==='hand'&&dist(e.goalMetres,b.goalMetres)>.001)throw new Error('Hand should be stationary under animation');
   if(diag.pelvisPose?.animationInfluence>0)subtleBodyMotion=true;
  }
 }
 assert(subtleBodyMotion,'idle clip influence should remain enabled while endpoints are fixed');
 // A manually repositioned wrist must establish a GLOBAL placement anchor,
 // not a point attached to the animated chest that follows pelvis movement.
 await page.evaluate(()=>window.__rigyTestReset());
 await page.waitForTimeout(190);
 const handDrag=await page.evaluate(()=>window.__rigyTestControllerDrag('left-wrist',[0,.028,.014]));
 const manualBefore=(await page.evaluate(()=>window.__rigyDiagnostics())).endpointAnchors['left-wrist'];
 console.log('MANUAL WRIST POSITION',JSON.stringify({handDrag,manualBefore}));
 await page.evaluate(()=>window.__rigyTestControllerDrag('pelvis',[.023,.009,.010]));
 const manualAfter=(await page.evaluate(()=>window.__rigyDiagnostics())).endpointAnchors['left-wrist'];
 console.log('MANUAL WRIST AFTER PELVIS',JSON.stringify(manualAfter));
 assert(dist(manualAfter.baseMetres,manualBefore.baseMetres)<.002,'manually placed hand anchor shifted with pelvis');
 assert(manualAfter.errorMetres<.030,'manually placed hand did not stay close to anchor');
 // Torso edits must not silently reparent the hands to the chest either.
 await page.evaluate(()=>window.__rigyTestReset());
 await page.waitForTimeout(190);
 const beforeTorso=(await page.evaluate(()=>window.__rigyDiagnostics())).endpointAnchors;
 await page.evaluate(()=>window.__rigyTestControllerDrag('torso',[.020,.010,0]));
 const afterTorso=(await page.evaluate(()=>window.__rigyDiagnostics())).endpointAnchors;
 for(const id of ['left-wrist','right-wrist','left-ankle','right-ankle']){
  const e=afterTorso[id],b=beforeTorso[id];
  assert(dist(e.baseMetres,b.baseMetres)<.020,id+' placement moved during torso edit');
  assert(e.errorMetres<(e.kind==='foot'?.028:.030),id+' did not remain near anchor during torso edit');
 }
 assert.deepEqual(errors,[],'uncaught page errors');
 console.log('PASS: pelvis moved while both wrists and feet retained fixed root-space placement with bounded animation offsets');
}finally {await browser.close();}
