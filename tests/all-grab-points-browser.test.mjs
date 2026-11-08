import assert from 'node:assert/strict';
import {chromium} from 'playwright';
// Regression independent of known preexisting lateral-overhead IK test failure.
const browser=await chromium.launch({headless:true,args:[
 '--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist',
 '--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:8765/?rigy_test=1',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>window.__rigyDiagnostics?.().ready===true,null,{timeout:120000});
 const handles=['left-wrist','left-elbow','right-wrist','right-elbow',
  'left-knee','left-ankle','right-knee','right-ankle','head','neck','torso','pelvis'];
 assert.equal((await page.evaluate(()=>window.__rigyDiagnostics())).handleCount,12);
 const failures=[];
 for(const id of handles){
  const move=id.endsWith('-ankle')?[0,0.1,0]:
   id.endsWith('-knee')?[0.05,0.03,0.05]:id==='pelvis'?[0.05,-0.04,0]:[0.09,0.04,0.07];
  const r=await page.evaluate(({id,move})=>window.__rigyTestActualGrip(id,move),{id,move});
  console.log('ACTUAL TRIGGER GRIP',id,JSON.stringify(r));
  if(r.selected!==id)failures.push(id+' trigger selected '+r.selected);
  if(!r.pinned)failures.push(id+' did not pin');
  if(r.moved<.008)failures.push(id+' was immovable '+r.moved.toFixed(5)+' m');
  const status=await page.evaluate(()=>window.__rigyDiagnostics());
  for(const [arm,d] of Object.entries(status.shoulderDiagnostics||{}))
   if(!d.absoluteJointLimitsOK)failures.push(id+' broke '+arm+' anatomy');
 }
 // Verify desktop hover agrees with click without changing limb mechanics.
 for(const id of handles){
  await page.evaluate(()=>window.__rigyTestReset());
  const p=await page.evaluate(id=>window.__rigyTestHandleScreen(id),id);
  if(p.z<-1||p.z>1){failures.push(id+' outside camera');continue;}
  await page.mouse.move(p.x,p.y);
  await page.waitForTimeout(80);
  await page.mouse.down();
  const active=(await page.evaluate(()=>window.__rigyDiagnostics())).activeJoint;
  console.log('MOUSE SELECT',id,active);
  if(active!==id)failures.push(id+' click chose '+active);
  await page.mouse.up();
 }
 console.log('GRAB TEST FAILURES',JSON.stringify(failures));
 assert.deepEqual(errors,[]);
 assert.deepEqual(failures,[],'Every existing grab point must be accessible');
 console.log('PASS: 12 handles selectable, draggable and maintain anatomy');
}finally{await browser.close();}
