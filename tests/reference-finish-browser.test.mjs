import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
try{
 await page.goto('http://127.0.0.1:8765/?rigy_test=1',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>window.__rigyDiagnostics?.().ready===true,null,{timeout:120000});
 const finish=await page.evaluate(()=>window.__rigyReferenceFinish());
 console.log('FEATURED CHARCOAL-SILVER FINISH',JSON.stringify(finish));
 assert(finish?.applied>0,'Reference surface must be applied to the character');
 assert.equal(finish.reversible,true);
 assert.equal(finish.sourceTexturesPreserved,true);
 assert.equal((await page.evaluate(()=>window.__rigyDiagnostics())).handleCount,12);
 console.log('PASS: reference finish applied; material sources and grab points retained');
}finally{await browser.close();}
