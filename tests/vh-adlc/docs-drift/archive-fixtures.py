"""Generate synthetic archive bytes with Python's standard ZIP writer."""
import base64
import io
import json
import struct
import warnings
import zipfile

warnings.simplefilter('ignore', UserWarning)

def archive(entries, method=zipfile.ZIP_DEFLATED):
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, 'w', compression=method) as writer:
        for name, data, mode in entries:
            info = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
            info.compress_type = method
            info.create_system = 3
            info.external_attr = mode << 16
            writer.writestr(info, data)
    return stream.getvalue()

report = ('report.json', b'{"schema":"fixture","items":[]}', 0o100600)
provenance = ('provenance.json', b'{"run_id":101}', 0o100600)
valid = archive([report, provenance])
fixtures = {'deflate': valid, 'stored': archive([report, provenance], zipfile.ZIP_STORED),
            'missing': archive([report]), 'duplicate': archive([report, report, provenance]),
            'unexpected': archive([report, provenance, ('extra.json', b'{}', 0o100600)]),
            'traversal': archive([('../report.json', report[1], report[2]), provenance]),
            'absolute': archive([('/report.json', report[1], report[2]), provenance]),
            'backslash': archive([('dir\\report.json', report[1], report[2]), provenance]),
            'symlink': archive([('report.json', b'target', 0o120777), provenance]),
            'directory': archive([('report.json/', b'', 0o040700), provenance]),
            'fifo': archive([('report.json', report[1], 0o010600), provenance]),
            'bad-json': archive([('report.json', b'{', report[2]), provenance]),
            'bad-utf8': archive([('report.json', b'\xff', report[2]), provenance]),
            'null-json': archive([('report.json', b'null', report[2]), provenance]),
            'expanded': archive([('report.json', b'{"data":"' + b'x' * 100000 + b'"}', report[2]), provenance]),
            'bzip2': archive([report, provenance], zipfile.ZIP_BZIP2),
            'truncated': valid[:-12]}
for name, flags, method in [('encrypted', 1, 8), ('strong-encrypted', 64, 8), ('unsupported', 0, 99)]:
    changed = bytearray(valid)
    for signature, flag_offset, method_offset in [(b'PK\x03\x04', 6, 8), (b'PK\x01\x02', 8, 10)]:
        offset = changed.find(signature)
        struct.pack_into('<H', changed, offset + flag_offset, flags)
        struct.pack_into('<H', changed, offset + method_offset, method)
    fixtures[name] = bytes(changed)
changed = bytearray(valid)
central = changed.find(b'PK\x01\x02')
struct.pack_into('<I', changed, central + 24, 1)
fixtures['false-size'] = bytes(changed)
print(json.dumps({key: base64.b64encode(value).decode('ascii') for key, value in fixtures.items()}, sort_keys=True, indent=2))
