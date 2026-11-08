import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
try{
 await page.goto('http://127.0.0.1:8765/?rigy_test=1',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>window.__rigyDiagnostics?.().ready===true,null,{timeout:120000});
 const texture=await page.evaluate(()=>window.__rigyReferenceFinish());
 const report=await page.evaluate(()=>window.__rigyAtlasMaterialReport());
 console.log('ORIGINAL JPEG ATLAS',JSON.stringify({texture,report}));
 assert.equal(texture?.name,'Image_0.jpg');
 assert.equal(texture.textureWidth,2048);
 assert.equal(texture.textureHeight,2048);
 assert.equal(texture.unlit,true);
 assert.equal(texture.shadows,false);
 assert.equal(texture.sourceTexturesPreserved,true);
 assert(report.meshes>0,'Renderable FBX meshes must load');
 assert.equal(report.uvMeshes,report.meshes,'All visible meshes must retain UVs');
 assert.equal(report.atlasMeshes,report.meshes,'Every mesh must use only the supplied JPEG');
 assert.equal(report.unlitMeshes,report.meshes,'Every mesh must be unlit, no wireframe or tone mapping');
 assert.equal(report.shadowMeshes,0,'Character must not cast or receive shadows');
 assert.equal(report.nonJpegMaterials,0,'No other material allowed');
 assert.equal((await page.evaluate(()=>window.__rigyDiagnostics())).handleCount,12);
 console.log('PASS: 2048 JPEG only, correct UV meshes, zero shading/shadows, rig and pins intact');
}finally{await browser.close();}
