"""Package the verified first-open evidence; never copy a profile, settings or credentials."""
import argparse
import hashlib
import html
import json
from pathlib import Path
import re
import shutil
import subprocess
import zipfile

REPO = Path(__file__).resolve().parents[1]
DOC = Path('docs/studio-excalidraw-first-open-v1')

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def build(output):
    archive = output.with_suffix('.zip')
    assert not output.exists() and not archive.exists()
    before, after = [json.loads((REPO / DOC / 'evidence' / p / 'native-report.json').read_text()) for p in ['before', 'after']]
    assert before['outcome'] == after['outcome'] == 'PASS'
    assert after['remoteInferenceRequests'] == 0
    validation = json.loads((REPO / DOC / 'validation.json').read_text())
    disclosed = validation['nativeHostExceptions']
    assert len(after['exceptions']) == disclosed['count']
    assert all(disclosed['message'] in e['exceptionDetails']['exception']['description'] for e in after['exceptions'])
    output.mkdir(parents=True)
    (output / 'build').mkdir()
    runtime = {}
    for name in ['main.js', 'styles.css', 'manifest.json']:
        runtime[name] = sha(REPO / name)
        assert runtime[name] == after['artifacts']['ai-knowledge-hub/' + name]
        shutil.copyfile(REPO / name, output / 'build' / name)
    shutil.copytree(REPO / DOC, output / DOC)
    shutil.copyfile(REPO / (str(DOC) + '.md'), output / (str(DOC) + '.md'))
    kit = output / 'smoke-kit'
    (kit / 'scripts').mkdir(parents=True)
    for name in ['studio-excalidraw-first-open-native.mjs', 'studio-excalidraw-first-open-fixtures.json']:
        shutil.copyfile(REPO / 'scripts' / name, kit / 'scripts' / name)
    shutil.copytree(REPO / 'scripts/studio-first-open-legacy', kit / 'scripts/studio-first-open-legacy')
    shutil.copytree(REPO / DOC / 'smoke-vault', kit / 'vault')
    shutil.copyfile(REPO / DOC / 'manual-smoke.md', kit / 'README.md')
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=REPO, text=True).strip()
    (output / 'REVIEW.json').write_text(json.dumps({
        'head': head, 'runtimeCommit': validation['runtimeCommit'], 'base': 'be8f1a8862b377d777a96149b306b8ecf7915a2c',
        'branch': 'fix/studio-excalidraw-first-open-v1', 'build': runtime,
        'modelQuality': 'NOT RE-EVALUATED', 'remoteInferenceRequests': 0,
        'automaticInstallation': False, 'nativeVersions': after['versions'],
        'nativeRequests': len(after['requests']), 'nativeRendererExceptions': len(after['exceptions'])
    }, indent=2) + '\n')
    gallery = output / 'gallery'
    gallery.mkdir()
    cards = []
    for a in after['frames']:
        if 'key' not in a:
            continue
        b = next(f for f in before['frames'] if (f['key'], f['width']) == (a['key'], a['width']))
        assert all(a[k] == b[k] for k in ['mode', 'language', 'direction', 'style', 'viewport', 'classes'])
        assert a['titleBelowToolbar'] and not a['clipped'] and not a['dirty']
        title = f"{a['key']} · {a['width']} · {a['language'].upper()} · {a['mode']}"
        pair = []
        for phase, label, frame in [('before', 'ДО', b), ('after', 'ПОСЛЕ', a)]:
            src = f'../{DOC}/evidence/{phase}/{frame["file"]}'
            assert (gallery / src).is_file()
            pair.append(f'<figure><figcaption>{label} · {frame["zoom"]:.2f}× · clipped: {len(frame["clipped"])}</figcaption><a href="{src}"><img src="{src}" alt="{html.escape(title)} {label}"></a></figure>')
        cards.append(f'<article><h2>{html.escape(title)}</h2><div class="pair">{"".join(pair)}</div></article>')
    assert len(cards) == 9
    (gallery / 'index.html').write_text('''<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Veynrel — Excalidraw first open</title><style>body{font:16px/1.5 system-ui;margin:0;background:#f5f4f0;color:#20232a}main{max-width:1500px;margin:auto;padding:24px}article{background:white;border:1px solid #bbb;margin:24px 0;padding:16px}h2{font-size:20px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0}img{width:100%;height:480px;object-fit:contain;object-position:top;background:#eee}a{color:#064fa1}a:focus-visible{outline:3px solid #734dcc}@media(max-width:700px){.pair{grid-template-columns:1fr}}</style><main><h1>Excalidraw: первое открытие — ДО / ПОСЛЕ</h1><p>Реальный Obsidian 1.13.7 + Excalidraw 2.29.0. Синтетические схемы, одинаковые окна и реальные host themes. У stress/390 текст мал: нужен ручной zoom/pan для чтения. Качество модели: <strong>NOT RE-EVALUATED</strong>.</p><p><a href="../docs/studio-excalidraw-first-open-v1.md">Результаты и ограничения</a> · <a href="../smoke-kit/README.md">Локальный smoke-kit</a> · <a href="../REVIEW.json">HEAD и build</a> · <a href="../SHA256SUMS">SHA256SUMS</a></p>''' + ''.join(cards) + '</main></html>')
    (output / 'README.md').write_text('''# Excalidraw first-open review

Verify `sha256sum -c SHA256SUMS`. The build is in `build/`; native evidence and limitations are in `docs/studio-excalidraw-first-open-v1.md`. No automatic installation, merge or release.

Run `python3 -m http.server 8799 --bind 127.0.0.1` from this folder, then open http://127.0.0.1:8799/gallery/ . Relative image paths also work from the unpacked folder. See `smoke-kit/README.md` for offline/manual and isolated loopback checks. Model quality: NOT RE-EVALUATED.
''')
    files = sorted(p for p in output.rglob('*') if p.is_file())
    for p in files:
        assert not p.is_symlink() and not any(n in p.name.lower() for n in ['keyfortest', 'credentials', '.env'])
        assert not re.search(rb'sk-(?:or-v1-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----', p.read_bytes()), p
    (output / 'SHA256SUMS').write_text(''.join(f'{sha(p)}  {p.relative_to(output).as_posix()}\n' for p in files))
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for p in sorted(output.rglob('*')):
            if p.is_file():
                z.write(p, p.relative_to(output).as_posix())
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        for line in z.read('SHA256SUMS').decode().splitlines():
            digest, name = line.split('  ', 1)
            assert hashlib.sha256(z.read(name)).hexdigest() == digest
    archive.with_suffix('.zip.sha256').write_text(f'{sha(archive)}  {archive.name}\n')
    print(json.dumps({'zip': str(archive), 'sha256': sha(archive), 'files': len(files) + 1, 'head': head}))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('output', type=Path)
    build(parser.parse_args().output.resolve())
