/** Actual browser smoke for importing the complete FBX and keeping a posed limb pinned. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({headless:true,args:[
  '--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist',
  '--enable-unsafe-swiftshader'
]});
const page = await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];
// rawgit.hack displays a protective HTML confirmation. Automated checks use
// its documented HttpOnly cookie; a human visitor taps "Open the page" once.
if(process.env.RIGY_URL){
  await page.context().addCookies([{name:'__Http-phish',value:'1',url:new URL(process.env.RIGY_URL).origin,secure:true,httpOnly:true,sameSite:'Lax'}]);
}
page.on('pageerror',err=>{errors.push(err.message);console.error('BROWSER PAGE ERROR:',err.message);});
page.on('requestfailed',r=>console.error('BROWSER REQUEST FAILED:',r.url(),r.failure()?.errorText));
page.on('console',message=>{if(message.type()==='error')console.error('BROWSER CONSOLE:',message.text());});
try{
  await page.goto(process.env.RIGY_URL || 'http://127.0.0.1:8765/?rigy_test=1',{waitUntil:'domcontentloaded',timeout:60000});
  try {
    await page.waitForFunction(()=>window.__rigyDiagnostics?.().ready===true,null,{timeout:process.env.RIGY_URL?30000:120000});
  }catch(error){
    console.error('BROWSER DEBUG:',JSON.stringify(await page.evaluate(() => ({url:location.href,title:document.title,text:document.body?.innerText?.slice(0,1200),diag:window.__rigyDiagnostics?.()||null})).catch(e=>({error:String(e)}))));
    console.error('PAGE ERRORS:',errors);
    throw error;
  }
  const before=await page.evaluate(()=>window.__rigyDiagnostics());
  console.log('Loaded rig:',JSON.stringify(before));
  assert(before.skeletonBones>=20,`missing bones: ${before.skeletonBones}`);
  assert.equal(before.handleCount,8);
  assert(before.animationDuration>5);
  const pin=await page.evaluate(()=>window.__rigyTestPin('left-wrist',[0,0.05,0]));
  assert.equal(pin.pinCount,1);
  await page.waitForTimeout(800);
  const after=await page.evaluate(()=>window.__rigyDiagnostics());
  console.log('After pin:',JSON.stringify(after));
  assert(after.animationTime>before.animationTime+.2,'Animation must continue advancing');
  assert.equal(after.pinnedCount,1,'Pin must persist while clip keeps playing');
  assert.deepEqual(errors,[],'No uncaught browser runtime exception');
  console.log('PASS: FBX parsed, full rig played, 8 markers, and wrist pin persisted');
}finally{await browser.close();}