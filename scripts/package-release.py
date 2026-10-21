#!/usr/bin/env python3
"""Bundle the inspected installer scripts and npm archive; never include credentials."""
import argparse
import hashlib
import json
import pathlib
import tarfile
import zipfile

root = pathlib.Path(__file__).resolve().parent.parent
version = json.loads((root / 'package.json').read_text())['version']
name = f'striking-lions-zc-{version}.tgz'
p = argparse.ArgumentParser()
p.add_argument('--package', type=pathlib.Path, default=root / name)
p.add_argument('--output', type=pathlib.Path, default=root / 'dist' / f'zc-{version}-install.zip')
a = p.parse_args()
with tarfile.open(a.package, 'r:gz') as archive:
    entry = archive.extractfile('package/package.json')
    if entry is None:
        raise SystemExit('Missing package metadata.')
    manifest = json.load(entry)
    if manifest.get('name') != '@striking-lions/zc' or manifest.get('version') != version:
        raise SystemExit('Refusing a package with different identity or version.')
files = {name: a.package.read_bytes(), 'install.sh': (root / 'install/install.sh').read_bytes(),
         'install.ps1': (root / 'install/install.ps1').read_bytes()}
files['QUICKSTART.md'] = f'''# ZC {version}

Extract this ZIP before installing. Review install.sh or install.ps1 first.

macOS, Linux, WSL: `bash install.sh --add-path`

Windows PowerShell: `powershell -NoProfile -ExecutionPolicy Bypass -File .\\install.ps1 -AddPath`

Open a new terminal. Run `zc login`, change into your project, then run `zc`.
On Windows use `zc.cmd` if a PowerShell shim conflicts with execution policy.
For remote login use `zc login --oauth --no-browser` on the server and open its URL privately locally.

The installer downloads and verifies a private Node engine and installs the pinned ZCode dependency.
Internet is required. System Node and upstream credentials are not deleted. Close active tasks before upgrading.
Use `/model` inside ZC to select a model and `/mode yolo` to request full access explicitly.
There is no OS sandbox. Guarded mode does not ask before every command.

Guide: https://github.com/imthesniper/zai-cli#readme
Readiness: https://github.com/imthesniper/zai-cli/blob/main/docs/RELEASE-READINESS.md
This is an integration release, not a signed offline binary or an npm registry publication.
'''.encode()
files['SHA256SUMS.txt'] = ''.join(f'{hashlib.sha256(data).hexdigest()}  {path}\n' for path, data in sorted(files.items())).encode()
a.output.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(a.output, 'w', zipfile.ZIP_DEFLATED) as output:
    for path, data in sorted(files.items()):
        info = zipfile.ZipInfo(path)
        info.external_attr = (0o100755 if path == 'install.sh' else 0o100644) << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        output.writestr(info, data)
print(a.output)
