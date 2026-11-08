#!/usr/bin/env python3
"""Verify unchanged GitHub source files in the portable Zelda VR environment ZIP."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent
manifest = json.loads((root / 'SOURCE_CHECKSUMS.json').read_text(encoding='utf-8'))
errors = []
for filename, info in manifest['files'].items():
    path = root / filename
    if not path.is_file():
        errors.append(f'MISSING: {filename}')
        continue
    data = path.read_bytes()
    blob = hashlib.sha1(f'blob {len(data)}\0'.encode('ascii') + data).hexdigest()
    digest = hashlib.sha256(data).hexdigest()
    if blob != info['github_blob_sha1'] or digest != info['sha256'] or len(data) != info['bytes']:
        errors.append(f'MODIFIED / CHECKSUM MISMATCH: {filename}')
    else:
        print(f'OK: {filename}')
if errors:
    raise SystemExit('\n'.join(errors))
print('All original GitHub file checksums match.')
