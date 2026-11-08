import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { loadBundledFbx } from '../rigy/animated/model-bundle.js';

const asset = join(dirname(fileURLToPath(import.meta.url)), '..', 'models', 'standing-idle');
const manifest = JSON.parse(readFileSync(join(asset,'manifest.json'),'utf8'));
const expected = readFileSync(join(asset,'standing-idle.fbx'));
Object.defineProperty(globalThis,'location',{configurable:true,value:{href:'https://example.com/rigy/'}});
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const originalFetch=globalThis.fetch;

test('bundled FBX: direct binary, SHA verified', async () => {
  globalThis.fetch=async (input)=>{
    const path = String(input);
    if(path.endsWith('manifest.json'))return new Response(JSON.stringify(manifest),{status:200});
    if(path.endsWith('standing-idle.fbx'))return new Response(expected,{status:200});
    return new Response('unexpected file',{status:500});
  };
  try{
    const binary = new Uint8Array(await loadBundledFbx('models/standing-idle/manifest.json'));
    assert.deepEqual(Buffer.from(binary),expected);
  }finally{globalThis.fetch=originalFetch;}
});

test('bundled FBX: six-concurrent fallback parts, SHA verified',async()=>{
  let inFlight=0,maxInFlight=0,parts=0;
  globalThis.fetch=async input=>{
    const path = String(input).split('/').pop();
    if(path==='manifest.json')return new Response(JSON.stringify(manifest));
    if(path==='standing-idle.fbx')return new Response('',{status:404});
    inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);
    await new Promise(resolve=>setTimeout(resolve,1));
    const value=readFileSync(join(asset,path),'utf8');
    parts++;inFlight--;
    return new Response(value);
  };
  try{
    const binary = new Uint8Array(await loadBundledFbx('models/standing-idle/manifest.json'));
    assert.deepEqual(Buffer.from(binary),expected);
    assert.equal(parts,manifest.parts.length);
    assert(maxInFlight>1 && maxInFlight<=6,`concurrency ${maxInFlight}`);
  }finally{globalThis.fetch=originalFetch;}
});

test('bundled FBX: reject corrupted direct binary',async()=>{
  const corrupted=Buffer.from(expected);corrupted[100]^=0xff;
  globalThis.fetch=async input=>String(input).endsWith('manifest.json')
    ?new Response(JSON.stringify(manifest)) :new Response(corrupted);
  try{await assert.rejects(loadBundledFbx('models/standing-idle/manifest.json'),/SHA-256 mismatch/);}
  finally{globalThis.fetch=originalFetch;}
});
