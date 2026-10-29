"""Build a fresh r2 review folder/ZIP from tracked smoke sources and reviewed evidence."""
import argparse
import hashlib
import html
import json
from pathlib import Path
import re
import shutil
import subprocess
import zipfile

REPO = Path(__file__).resolve().parents[2]
SMOKE = Path(__file__).resolve().parent
EXPECTED = {
    'main.js': 'c8549e2af58e5d93a14ecb8f2f75fe0d59d6204a2145404eb948a6d638b684d9',
    'styles.css': '0a56930f3846b7c4ff047a63aaddf4dd471624df91a2bb0388b85bde5c561c71',
    'manifest.json': '03001af2b852b53a31721fee83b353ad2d6496f55d327c150f0540bb5371c93b',
}

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def build_smoke(destination):
    destination.mkdir()
    for name in ['loopback.py', 'synthetic-response.md', 'README.md', 'SOURCE-SHA256SUMS']:
        shutil.copyfile(SMOKE / name, destination / name)
    shutil.copytree(SMOKE / 'vault', destination / 'vault')

def build(output):
    assert output.name.endswith('-r2') and not output.exists()
    archive = output.with_suffix('.zip')
    assert not archive.exists()
    for name, expected in EXPECTED.items():
        assert digest(REPO / name) == expected, name
    output.mkdir(parents=True)
    (output / 'build').mkdir()
    for name in EXPECTED:
        shutil.copyfile(REPO / name, output / 'build' / name)
    build_smoke(output / 'smoke-kit')
    shutil.copytree(REPO / 'docs/studio-source-preservation-v1', output / 'docs')
    evidence = output / 'docs/evidence-r2'
    report = json.loads((evidence / 'native-source-report.json').read_text())
    smoke = json.loads((evidence / 'native-smoke-report.json').read_text())
    assert report['status'] == smoke['status'] == 'PASS'
    assert report['artifacts'] == smoke['artifacts'] == EXPECTED
    for name in ['loopback.py', 'synthetic-response.md', 'vault/Source.md']:
        assert digest(output / 'smoke-kit' / name) == smoke['smokeKitHashes'][name]
    for name in ['http-checks.json', 'screenshot-checks.json']:
        assert json.loads((evidence / name).read_text())['status'] == 'PASS'
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=REPO, text=True).strip()
    meta = {'revision': 'r2', 'final': head, 'runtime': '9c5b55491ab9e4462a10d4b59b5011ce9ce1ec16',
            'previousHead': '96db41f5eb8a7e9ef20c8d11c4e0a39143c24855', 'build': EXPECTED, 'runtimeUnchanged': True,
            'pullRequest': 'https://github.com/zinverno/veynrel/pull/128', 'modelQuality': 'NOT RE-EVALUATED',
            'remoteInferenceRequests': 0, 'newChargesUSD': 0, 'automaticInstallation': False,
            'rerun': {'sourcePreservation': len(report['checks']), 'smokeUI': len(smoke['checks']), 'httpCases': 10, 'themeMatrixFrames': 16},
            'notRerun': ['full Markdown native', 'Community native', 'diagram native'],
            'superseded': 'r1 Source Preservation light-theme labels and smoke responder; originals retained'}
    (output / 'REVIEW.json').write_text(json.dumps(meta, indent=2) + '\n')
    (output / 'README.md').write_text('''# Studio Source Preservation review — r2

PR: https://github.com/zinverno/veynrel/pull/128 . Two delivery/test fixes only; all three runtime hashes are unchanged. Real-model quality: **NOT RE-EVALUATED**.

Verify `sha256sum -c SHA256SUMS`. Build files are in `build/`. Copy only main.js/styles.css/manifest.json manually into a separate synthetic vault if needed; no automatic installation is included. See `smoke-kit/README.md` for the local-only Ollama route with an empty key. The shipped responder accepts no Authorization or exactly `Bearer ollama`, rejects others without logging their values, and has no remote backend.

Run `python3 -m http.server 8797 --bind 127.0.0.1` here; open http://127.0.0.1:8797/gallery/ . All gallery images have verified theme classes, computed colors, dimensions and screenshot-pixel checks. Prior r1 files are retained as historical evidence, not current light-theme proof.

Source Preservation native and the shipped-smoke UI route were rerun. Full Markdown, Community and diagram native suites were NOT rerun in r2. See docs/review-followup-r2.md and REVIEW.json for exact scope, hashes and limitations. No merge/release/deploy or remote inference.
''')
    gallery = output / 'gallery'
    (gallery / 'assets').mkdir(parents=True)
    cards = []
    frames = [f for f in report['themeCaptures'] if re.fullmatch(r'(review|confirmation)-(en|ru)-(light|dark)-(390|1300)-r2.png', f['file'])]
    assert len(frames) == 16
    for frame in frames:
        name = frame['file']
        shutil.copyfile(evidence / name, gallery / 'assets' / name)
        caption = f"{frame['language'].upper()} · {frame['requested']} · {frame['stage']} · {frame['viewport']} px"
        details = f"{' '.join(frame['classes'])}; surface {frame['background']}; text {frame['text']}"
        cards.append(f'<article data-theme="{frame["requested"]}"><h2>{html.escape(caption)}</h2><p>{html.escape(details)}</p><a href="assets/{name}"><img src="assets/{name}" alt="{html.escape(caption)}" loading="lazy"></a></article>')
    page = '''<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Studio review r2 — verified themes</title><style>body{font:16px/1.5 system-ui;background:#f4f3ef;color:#25282b;margin:0}main{max-width:1200px;margin:auto;padding:28px 20px}h1{font-size:32px}h2{font-size:19px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,470px),1fr));gap:20px}article{background:white;padding:18px;border:1px solid #ccc;border-radius:6px}img{width:100%;height:420px;object-fit:contain;object-position:top;background:#eee}a{color:#075da7}button{font:inherit;margin:10px 8px 20px 0;padding:8px 18px}button[aria-pressed=true]{background:#25282b;color:white}article[hidden]{display:none}a:focus-visible,button:focus-visible{outline:3px solid #075da7}</style><main><h1>Studio Source Preservation — r2</h1><p>Реальный Obsidian, synthetic loopback. Light/dark подтверждены классами документа, вычисленными цветами и пикселями PNG. Runtime не изменён.</p><p><strong>Качество модели: NOT RE-EVALUATED.</strong> Предыдущие неверные light-метки r1 не используются как подтверждение.</p><p><a href="../smoke-kit/README.md">Рабочий smoke-kit</a> · <a href="../docs/review-followup-r2.md">Отчёт r2</a> · <a href="../REVIEW.json">SHA / scope</a> · <a href="../SHA256SUMS">SHA256SUMS</a></p><nav><button data-filter="all" aria-pressed="true">Все</button><button data-filter="light" aria-pressed="false">Light</button><button data-filter="dark" aria-pressed="false">Dark</button></nav><section class="grid">'''
    page += ''.join(cards) + '''</section></main><script>document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));document.querySelectorAll('article').forEach(a=>a.hidden=b.dataset.filter!=='all'&&a.dataset.theme!==b.dataset.filter)}));</script></html>'''
    (gallery / 'index.html').write_text(page)
    files = sorted(p for p in output.rglob('*') if p.is_file())
    secrets = [rb'sk-(?:or-v1-)?[A-Za-z0-9_-]{20,}', rb'gh[pousr]_[A-Za-z0-9]{30,}', rb'-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----']
    for path in files:
        assert not path.is_symlink()
        assert not any(x in path.name.lower() for x in ['keyfortest', '.env', 'credentials'])
        assert not any(re.search(pattern, path.read_bytes()) for pattern in secrets), path.name
    (output / 'SHA256SUMS').write_text(''.join(f'{digest(p)}  {p.relative_to(output).as_posix()}\n' for p in files))
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as zipped:
        for path in sorted(output.rglob('*')):
            if path.is_file():
                zipped.write(path, path.relative_to(output).as_posix())
    with zipfile.ZipFile(archive) as zipped:
        assert zipped.testzip() is None
        for line in zipped.read('SHA256SUMS').decode().splitlines():
            sha, name = line.split('  ', 1)
            assert hashlib.sha256(zipped.read(name)).hexdigest() == sha, name
    archive.with_suffix('.zip.sha256').write_text(f'{digest(archive)}  {archive.name}\n')
    print(json.dumps({'zip': str(archive), 'sha256': digest(archive), 'files': len(files) + 1, 'runtimeUnchanged': True}))

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    build(parser.parse_args().output)
