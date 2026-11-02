"""Offline Docker-save layer/history inspection. Never extracts files or starts Docker."""
import argparse
import hashlib
import json
import re
import tarfile
from pathlib import Path

PRIVATE_PEM = re.compile(rb'-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----\s+[A-Za-z0-9+/=\r\n]{64,32768}-----END (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----')
TOKEN = re.compile(rb'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})\b')
PROTECTED_PATH = re.compile(r'(^|/)(?:\.git/|\.aws/credentials$|\.docker/config\.json$|\.ssh/id_[^/.]+$|private-keys/)|(^|/)\.env(?:\.[^/]+)?$')


def audit_archive(path, known_secrets=()):
    secrets = tuple(set(s for s in known_secrets if len(s) >= 16))
    findings, seen = [], set()
    count = 0

    def finding(kind, entry, layer):
        nonlocal count
        item = (kind, entry, layer)
        if item not in seen:
            seen.add(item)
            count += 1
            if len(findings) < 200:
                findings.append({'kind': kind, 'path': entry, 'layer': layer})

    def scan(data, entry, layer):
        if PRIVATE_PEM.search(data):
            finding('private-key-material', entry, layer)
        if TOKEN.search(data):
            finding('github-token-shaped-material', entry, layer)
        if any(secret in data for secret in secrets):
            finding('known-protected-input', entry, layer)

    layers, configs, files, byte_count = {}, [], 0, 0
    with tarfile.open(path, 'r:*') as archive:
        manifest = json.load(archive.extractfile('manifest.json'))
        for image in manifest:
            config_bytes = archive.extractfile(image['Config']).read()
            config = json.loads(config_bytes)
            config_id = 'sha256:' + hashlib.sha256(config_bytes).hexdigest()
            if Path(image['Config']).stem != config_id.removeprefix('sha256:'):
                raise ValueError('CONFIG_HASH_MISMATCH')
            configs.append(config_id)
            scan(config_bytes, image['Config'], 'config')
            for value in config.get('config', {}).get('Env', []):
                scan(value.encode(), 'config/environment', config_id)
            for history in config.get('history', []):
                scan(history.get('created_by', '').encode(), 'config/history', config_id)
            diff_ids = config['rootfs']['diff_ids']
            if len(diff_ids) != len(image['Layers']):
                raise ValueError('LAYER_COUNT_MISMATCH')
            for name, expected in zip(image['Layers'], diff_ids):
                if name in layers and layers[name] != expected:
                    raise ValueError('SHARED_LAYER_IDENTITY_CONFLICT')
                layers[name] = expected
        for name, expected in layers.items():
            layer = archive.extractfile(name)
            digest = hashlib.sha256()

            class Reader:
                def read(self, size=-1):
                    data = layer.read(size)
                    digest.update(data)
                    return data

            reader = Reader()
            with tarfile.open(fileobj=reader, mode='r|*') as entries:
                for entry in entries:
                    if not entry.isfile():
                        continue
                    files += 1
                    entry_name = entry.name.removeprefix('./')
                    if PROTECTED_PATH.search(entry_name) and not entry_name.endswith(('.example', '.sample')):
                        finding('protected-path', entry_name, expected)
                    source, tail = entries.extractfile(entry), b''
                    while data := source.read(262144):
                        byte_count += len(data)
                        scan(tail + data, entry_name, expected)
                        tail = (tail + data)[-33000:]
            while reader.read(1048576):
                pass
            if 'sha256:' + digest.hexdigest() != expected:
                raise ValueError('LAYER_HASH_MISMATCH')
    return {'version': 1, 'status': 'PASS' if count == 0 else 'BLOCKED',
            'imageConfigIds': configs, 'uniqueLayers': len(layers), 'regularFilesScanned': files,
            'regularFileBytesScanned': byte_count, 'knownProtectedValueCount': len(secrets),
            'findingCount': count, 'findings': findings, 'findingsTruncated': count > len(findings),
            'scope': 'Every saved layer, including deleted files, plus config/history; known inputs and recognizable private-key/token material. Not a general malware or exhaustive secret audit.',
            'secretValuesPrinted': False, 'servicesStarted': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    report = audit_archive(args.archive)
    with args.output.open('x') as output:
        json.dump(report, output, indent=2)
        output.write('\n')
    print(json.dumps({'status': report['status'], 'findings': report['findingCount']}))
    raise SystemExit(0 if report['status'] == 'PASS' else 2)
