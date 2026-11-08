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
 const pelvis=await page.evaluate(()=>window.__rigyTestControllerDrag('pelvis',[0.040,0.020,0.015]));
 const after=await page.evaluate(()=>window.__rigyDiagnostics());
 console.log('PELVIS ANCHOR TEST:',JSON.stringify({pelvis,mode:after.bodyAnchorMode,anchors:after.endpointAnchors}));
 assert.equal(after.bodyAnchorMode,true,'pelvis editing must switch wrists to room-fixed anchor frame');
 assert(pelvis.moved>0.01,'pelvis must move physically');
 for(const id of ['left-wrist','right-wrist','left-ankle','right-ankle']){
  const goal=after.endpointAnchors[id],first=initial.endpointAnchors[id];
  assert(dist(goal.baseMetres,first.baseMetres)<0.020,
   id+' global placement anchor moved with pelvis');
  assert(goal.idleOffsetMetres<=(goal.kind==='foot'?.00601:.03001),
   id+' idle movement exceeds configured bounds');
  assert(goal.errorMetres<(goal.kind==='foot'?.027:.090),
   id+' failed to hold placement while pelvis moved: '+goal.errorMetres);
 }
 const base=after.endpointAnchors;
 let subtlemotion=false;
 for(const t of [1.25,3.8,8.6,12.9]){
  const diag=await page.evaluate(t=>window.__rigyTestJumpAnimation(t),t);
  console.log('ANIMATED ANCHORS',t,JSON.stringify(diag.endpointAnchors));
  for(const id of ['left-wrist','right-wrist','left-ankle','right-ankle']){
   const e=diag.endpointAnchors[id],b=base[id];
   assert(dist(e.baseMetres,b.baseMetres)<.001,'base anchor drifted: '+id+' at '+t);
   assert(e.idleOffsetMetres<=(e.kind==='foot'?.00601:.03001));
   assert(e.errorMetres<(e.kind==='foot'?.028:.10),
    id+' failed at '+t+'s: '+e.errorMetres.toFixed(3)+'m');
   if(e.kind==='hand'&&dist(e.goalMetres,b.goalMetres)>.001)subtlemotion=true;
  }
 }
 assert(subtlemotion,'idle clip should still contribute subtle hand motion');
 assert.deepEqual(errors,[],'uncaught page errors');
 console.log('PASS: pelvis moved while both wrists and feet retained fixed root-space placement with bounded animation offsets');
}finally {await browser.close();}
