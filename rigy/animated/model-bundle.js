/** Reconstruct byte-identical FBX from GitHub Pages-friendly base64 parts.
 * The original uploaded FBX is stored in chunks, not converted or changed.
 * GitHub API upload limit workaround. SHA-256 verification before FBX parse.
 */
export async function loadBundledFbx(url,progress=()=>{}) {
 const manifestResponse=await fetch(url,{cache:'no-cache'});
 if(!manifestResponse.ok)throw new Error('Character manifest HTTP '+manifestResponse.status);
 const manifest=await manifestResponse.json();
 if(manifest.format!=='FBX-binary' || !Array.isArray(manifest.parts) || manifest.parts.length>80)throw new Error('Invalid bundled model manifest');
 const base=new URL(url,location.href);
 let received=0;
 const chunks=[];
 for(let i=0;i<manifest.parts.length;i++){
  const part=manifest.parts[i];
  if(!/^part-\d{3}\.txt$/.test(part))throw new Error('Unexpected FBX part name');
  const response=await fetch(new URL(part,base),{cache:'force-cache'});
  if(!response.ok)throw new Error(`${part}: HTTP ${response.status}`);
  const text=(await response.text()).replace(/\s/g,'');
  const binary=atob(text);
  const bytes=new Uint8Array(binary.length);
  for(let j=0;j<binary.length;j++)bytes[j]=binary.charCodeAt(j);
  chunks.push(bytes); received+=bytes.length;
  progress(i+1,manifest.parts.length,received);
 }
 if(received!==manifest.bytes)throw new Error(`FBX byte count mismatch (${received} instead of ${manifest.bytes})`);
 const result=new Uint8Array(received);
 let pos=0;
 for(const c of chunks){result.set(c,pos);pos+=c.length;}
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',result));
 const hex=[...digest].map(v=>v.toString(16).padStart(2,'0')).join('');
 if(hex!==manifest.sha256)throw new Error('FBX SHA-256 checksum mismatch; not parsing corrupted model');
 return result.buffer;
}
