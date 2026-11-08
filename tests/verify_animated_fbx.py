#!/usr/bin/env python3
"""Verify source is byte-identical after base64 chunk upload; offline only."""
from pathlib import Path
import json,base64,hashlib,struct
root=Path(__file__).resolve().parents[1]
asset=root/'models'/'standing-idle'
m=json.loads((asset/'manifest.json').read_text())
assert m['parts'], 'Missing FBX chunk list'
for p in m['parts']:
    assert p.startswith('part-') and p.endswith('.txt')
chunks=[base64.b64decode((asset/p).read_text(),validate=True) for p in m['parts']]
b=b''.join(chunks)
assert len(b)==m['bytes']
assert hashlib.sha256(b).hexdigest()==m['sha256']
assert b.startswith(b'Kaydara FBX Binary  \x00\x1a\x00')
version=struct.unpack_from('<I',b,23)[0]
assert version==7700,version
for name in (b'mixamorig:LeftArm',b'mixamorig:LeftForeArm',b'mixamorig:LeftHand',b'mixamorig:RightArm',b'mixamorig:LeftLeg',b'mixamorig:RightLeg',b'mixamorig:Hips'):
    assert name in b, name
print(f'OK: intact FBX version {version}, {len(b)} bytes, {len(chunks)} chunks, source SHA-256 matches')
