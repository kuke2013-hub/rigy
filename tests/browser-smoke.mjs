/** Actual browser smoke for importing the complete FBX and keeping a posed limb pinned. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({headless:true,args:[
  '--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist',
  '--enable-unsafe-swiftshader'
]});
const page = await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];
// rawgit.hack presents a protective HTML confirmation. A test client can
// bypass it using the documented secure HttpOnly cookie; human users must
// choose "Open the page" once. No bypass occurs on the real Quest page.
if(process.env.RIGY_URL){
  const origin=new URL(process.env.RIGY_URL).origin;
  await page.context().addCookies([{
    name:'__Http-phish',value:'1',url:origin,secure:true,httpOnly:true,sameSite:'Lax'
  }]);
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
  // v0.4 regression: a stationary controller grab must NEVER collapse the
  // target onto the parent joint (FBX centimetres vs world metres bug).
  await page.evaluate(()=>window.__rigyTestReset());
  await page.waitForTimeout(150);
  let visible=await page.evaluate(()=>window.__rigyDiagnostics().visibleHandleCount);
  assert.equal(visible,0,'All edit bubbles must be hidden until mouse/controller proximity');
  for(const id of ['left-wrist','right-wrist','left-ankle','right-ankle','left-elbow','right-elbow','left-knee','right-knee']){
    await page.evaluate(()=>window.__rigyTestReset());
    await page.waitForTimeout(110);
    const stationary=await page.evaluate(id=>window.__rigyTestControllerDrag(id,[0,0,0]),id);
    const initialDistance=Math.hypot(...stationary.before.map((x,i)=>x-stationary.goal[i]));
    console.log('Stationary grab',id,JSON.stringify({initialDistance,poseDeviation:stationary.deviation}));
    assert(initialDistance<.012,`${id}: stationary pin target must not jump (${initialDistance.toFixed(4)}m)`);
    await page.evaluate(()=>window.__rigyTestReset());
    await page.waitForTimeout(110);
    const moved=await page.evaluate(id=>window.__rigyTestControllerDrag(id,[0.09,0.04,0.07]),id);
    console.log('Controller drag',id,JSON.stringify({moved:moved.moved,deviation:moved.deviation}));
    assert(moved.goal.every(Number.isFinite)&&moved.after.every(Number.isFinite),`${id}: finite limb pose required`);
    assert(moved.moved>.008,`${id}: controller translation must physically move edited point`);
    assert(moved.deviation<.26,`${id}: pose should not collapse away from drag goal`);
  }
  const continuing=await page.evaluate(()=>window.__rigyDiagnostics().animationTime);
  assert(continuing>after.animationTime,'Animation should remain active during edit tests');
  console.log('PASS: FBX parsed, animated, all 8 points drag in 3D without snapping; markers hidden until nearby');
}finally{await browser.close();}
