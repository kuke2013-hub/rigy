import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,args:[
 '--use-gl=angle','--use-angle=swiftshader','--enable-webgl',
 '--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
try{
 await page.goto('http://127.0.0.1:8765/?rigy_test=1',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>window.__rigyDiagnostics?.().ready===true,null,{timeout:120000});
 assert.equal((await page.evaluate(()=>window.__rigyDiagnostics())).pelvisPose.version,'RIGY-V0155');
 const failures=[];
 for(const id of ['left-elbow','right-elbow','left-knee','right-knee'])for(const sign of [-1,1]){
  await page.evaluate(()=>window.__rigyTestReset());
  await page.waitForTimeout(100);
  const before=await page.evaluate(()=>window.__rigyDiagnostics());
  const moved=await page.evaluate(({id,sign})=>window.__rigyTestControllerDrag(id,[sign*.12,0,0]),{id,sign});
  const after=await page.evaluate(()=>window.__rigyDiagnostics());
  const delta=moved.after[0]-moved.before[0];
  const endpointId=id.replace('elbow','wrist').replace('knee','ankle');
  const origin=before.endpointAnchors[endpointId],end=after.endpointAnchors[endpointId];
  const anchorDrift=distance(origin.baseMetres,end.baseMetres);
  console.log('LATERAL DRAG',id,sign,JSON.stringify({delta,moved,anchorDrift,endError:end.errorMetres,armSolveTrace:after.armSolveTrace?.[endpointId],safety:after.shoulderDiagnostics?.[endpointId]?.safety}));
  if(!(delta*sign>.008))failures.push(id+' '+sign+' lateral movement '+delta);
  if(anchorDrift>.002)failures.push(id+' '+sign+' endpoint anchor drift '+anchorDrift);
  if(end.errorMetres>.055)failures.push(id+' '+sign+' endpoint IK miss '+end.errorMetres);
  for(const [side,v] of Object.entries(after.shoulderDiagnostics))
   if(!v.absoluteJointLimitsOK)failures.push(id+' '+sign+' '+side+' unsafe shoulder');
  for(const [side,v] of Object.entries(after.hipDiagnostics))
   if(!v.withinEnvelope)failures.push(id+' '+sign+' '+side+' unsafe hip');
  const position=await page.evaluate(id=>window.__rigyTestHandleWorld(id),id);
  await page.evaluate(()=>window.__rigyTestJumpAnimation(6.1));
  const afterAnimation=await page.evaluate(id=>window.__rigyTestHandleWorld(id),id);
  if(distance(position,afterAnimation)>.065)
   failures.push(id+' '+sign+' animation reset lateral pose');
 }
 console.log('LATERAL ERRORS',JSON.stringify(failures));
 assert.deepEqual(errors,[]);
 assert.deepEqual(failures,[]);
 console.log('PASS: each knee and elbow moves laterally both ways with anchored hands/feet');
}finally{await browser.close();}
