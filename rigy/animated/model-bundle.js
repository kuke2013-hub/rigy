/**
 * Load the exact original FBX, preferring a single Pages-hosted .fbx file.
 * GitHub Actions reconstructs this binary from the committed text fragments.
 * If the direct binary is absent (e.g. reviewing a raw GitHub checkout), fetch
 * the fragments concurrently. In both cases check the source's SHA-256 before
 * allowing FBXLoader to parse it. No mesh/rig/animation conversion occurs.
 */
export async function loadBundledFbx(url, progress = () => {}) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Character manifest HTTP ${response.status}`);
  const manifest = await response.json();
  if (manifest.format !== 'FBX-binary' ||
      !Number.isSafeInteger(manifest.bytes) || manifest.bytes < 1000 ||
      !/^[a-f0-9]{64}$/.test(manifest.sha256) ||
      !Array.isArray(manifest.parts) || !manifest.parts.length || manifest.parts.length > 80) {
    throw new Error('Invalid bundled model manifest');
  }
  const base = new URL(url, location.href);
  const direct = new URL('standing-idle.fbx', base);
  let bytes;
  // Prefer one HTTPS binary request over 26 separate text requests on Quest.
  // HTTP 404 is normal before the build generates the file, so fall back safely.
  try {
    const raw = await fetch(direct, { cache: 'force-cache' });
    if (raw.ok) {
      bytes = new Uint8Array(await raw.arrayBuffer());
      progress(1, 1, bytes.byteLength);
    }
  } catch (_) { /* The verified text-part fallback remains available. */ }

  if (!bytes) {
    const chunks = new Array(manifest.parts.length);
    let received = 0, completed = 0;
    const concurrency = Math.min(6, manifest.parts.length);
    await Promise.all(Array.from({ length: concurrency }, (_, worker) => (async () => {
      for (let i = worker; i < manifest.parts.length; i += concurrency) {
        const part = manifest.parts[i];
        if (!/^part-\d{3}\.txt$/.test(part)) throw new Error('Unexpected FBX part name');
        const r = await fetch(new URL(part, base), { cache: 'force-cache' });
        if (!r.ok) throw new Error(`${part}: HTTP ${r.status}`);
        const text = (await r.text()).replace(/\s/g, '');
        const decoded = atob(text);
        const chunk = new Uint8Array(decoded.length);
        for (let j = 0; j < decoded.length; j++) chunk[j] = decoded.charCodeAt(j);
        chunks[i] = chunk;
        completed++;
        received += chunk.byteLength;
        progress(completed, manifest.parts.length, received);
      }
    })()));
    bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
  }

  if (bytes.byteLength !== manifest.bytes) {
    throw new Error(`FBX byte count mismatch (${bytes.byteLength} vs ${manifest.bytes})`);
  }
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const hex = [...digest].map(v => v.toString(16).padStart(2, '0')).join('');
  if (hex !== manifest.sha256) throw new Error('Character SHA-256 mismatch: corrupt asset');
  return bytes.buffer;
}
