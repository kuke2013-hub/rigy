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
  assert.equal(before.handleCount,12, '8 limb points plus head, neck, torso and hips');
  assert.equal(before.plantedFeet,2,'Both feet must be planted by default');
  assert(before.animationDuration>5);
  const pin=await page.evaluate(()=>window.__rigyTestPin('left-wrist',[0,0.05,0]));
  assert.equal(pin.pinCount,1);
  await page.waitForTimeout(800);
  const after=await page.evaluate(()=>window.__rigyDiagnostics());
  console.log('After pin:',JSON.stringify(after));
  assert(after.animationTime>before.animationTime+.2,'Animation must continue advancing');
  assert.equal(after.pinnedCount,1,'Pin must persist while clip keeps playing');
  console.log('Foot contact after animation:',JSON.stringify(after.footErrors));
  for(const [id,error] of Object.entries(after.footErrors||{}))assert(error<0.015,`${id}: planted-foot drift ${error.toFixed(3)} metres`);
  // Sample the WHOLE 13.93-second Mixamo clip, including nearly a full cycle.
  // Pins must remain in the unanimated foot reference frame throughout.
  for(const sampleTime of [1.5,4.2,7.7,11.3,13.65]){
    const sample=await page.evaluate(t=>window.__rigyTestJumpAnimation(t),sampleTime);
    console.log('Grounding over full clip',sampleTime,JSON.stringify(sample.footErrors));
    for(const [id,error] of Object.entries(sample.footErrors||{}))
      assert(error<0.015,`${id}: foot sliding at ${sampleTime}s: ${error.toFixed(4)}m`);
  }
  assert.deepEqual(errors,[],'No uncaught browser runtime exception');
  // v0.4 regression: a stationary controller grab must NEVER collapse the
  // target onto the parent joint (FBX centimetres vs world metres bug).
  await page.evaluate(()=>window.__rigyTestReset());
  await page.waitForTimeout(150);
  let visible=await page.evaluate(()=>window.__rigyDiagnostics().visibleHandleCount);
  assert.equal(visible,0,'All edit bubbles must be hidden until mouse/controller proximity');
  for(const id of ['left-wrist','right-wrist','left-ankle','right-ankle','left-elbow','right-elbow','left-knee','right-knee','torso','neck','head','pelvis']){
    await page.evaluate(()=>window.__rigyTestReset());
    await page.waitForTimeout(110);
    const stationary=await page.evaluate(id=>window.__rigyTestControllerDrag(id,[0,0,0]),id);
    const initialDistance=Math.hypot(...stationary.before.map((x,i)=>x-stationary.goal[i]));
    console.log('Stationary grab',id,JSON.stringify({initialDistance,poseDeviation:stationary.deviation}));
    assert(initialDistance<.014,`${id}: stationary pin target must not jump (${initialDistance.toFixed(4)}m)`);
    await page.evaluate(()=>window.__rigyTestReset());
    await page.waitForTimeout(110);
    const moved=await page.evaluate(id=>window.__rigyTestControllerDrag(id,[0.09,0.04,0.07]),id);
    console.log('Controller drag',id,JSON.stringify({moved:moved.moved,deviation:moved.deviation}));
    assert(moved.goal.every(Number.isFinite)&&moved.after.every(Number.isFinite),`${id}: finite limb pose required`);
    assert(moved.moved>.008,`${id}: controller translation must physically move edited point`);
    assert(moved.deviation<.27,`${id}: pose should not collapse away from drag goal`);
    const grounded=await page.evaluate(()=>window.__rigyDiagnostics().footErrors);
    for(const [foot,error] of Object.entries(grounded||{})){
      console.log('Foot contact',id,foot,error);
      assert(Number.isFinite(error)&&error<.028,`${id} must not unplant ${foot}: ${error}`);
    }
  }
  const continuing=await page.evaluate(()=>window.__rigyDiagnostics().animationTime);
  assert(continuing>after.animationTime,'Animation should remain active during edit tests');
  console.log('PASS: animation and all 12 handles, both feet anchored, joint edits remain bounded and markers hide until nearby');
}finally{await browser.close();}
