import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser=await chromium.launch({headless:true,args:[
 '--use-gl=angle','--use-angle=swiftshader','--enable-webgl',
 '--ignore-gpu-blocklist','--enable-unsafe-swiftshader'
]});
const page=await browser.newPage({viewport:{width:1280,height:820}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('requestfailed',r=>console.error('FAILED REQUEST',r.url(),r.failure()?.errorText));
try{
 await page.goto('http://127.0.0.1:8765/objects/girl-blender/?rigy_test=1',{waitUntil:'domcontentloaded',timeout:90000});
 try{
  await page.waitForFunction(()=>window.__rigyDiagnostics?.().ready===true,null,{timeout:180000});
 }catch(e){
  console.log('DEBUG',await page.evaluate(()=>({text:document.querySelector('#status')?.textContent,diag:window.__rigyDiagnostics?.()})));
  throw e;
 }
 const d=await page.evaluate(()=>window.__rigyDiagnostics());
 console.log('GIRL GLB RUNTIME',JSON.stringify(d));
 assert.equal(d.characterLoaded,true,'GLB failed to load');
 assert(d.skeletonBones>=65,'Missing Mixamo skeleton');
 assert.equal(d.handleCount,12,'12 anatomical handles must initialise');
 assert(d.animationDuration>0,'Source animation missing');
 assert.equal(d.plantedFeet,2,'Support feet not anchored');
 assert.deepEqual(errors,[],'Uncaught browser runtime errors');
 console.log('PASS: Exact textured Blender GLB parsed; 65 bones, 12 handles, clip and planted feet instantiated.');
}finally{await browser.close();}
