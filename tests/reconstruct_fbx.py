#!/usr/bin/env python3
"""Rebuild the exact uploaded FBX from committed base64 parts, fail closed.

Usage: python3 tests/reconstruct_fbx.py
Generates models/standing-idle/standing-idle.fbx (not an altered export).
"""
from pathlib import Path
import base64
import hashlib
import json
import struct

folder = Path(__file__).resolve().parents[1] / 'models' / 'standing-idle'
manifest = json.loads((folder / 'manifest.json').read_text(encoding='utf-8'))
assert manifest['format'] == 'FBX-binary'
parts = manifest['parts']
assert len(parts) == len(set(parts)) and 0 < len(parts) <= 80
assembled = bytearray()
for index, part in enumerate(parts):
    assert part == f'part-{index:03d}.txt', part
    assembled.extend(base64.b64decode((folder / part).read_text(encoding='ascii'), validate=True))
assert len(assembled) == manifest['bytes'], f"Size mismatch {len(assembled)}"
assert hashlib.sha256(assembled).hexdigest() == manifest['sha256'], 'Source hash mismatch'
assert assembled[:23] == b'Kaydara FBX Binary  \x00\x1a\x00'
assert struct.unpack_from('<I', assembled, 23)[0] == 7700
output = folder / 'standing-idle.fbx'
if not output.exists() or hashlib.sha256(output.read_bytes()).hexdigest() != manifest['sha256']:
    output.write_bytes(assembled)
print(f'OK: {output} is {len(assembled)} bytes, SHA-256 {manifest["sha256"]}')
