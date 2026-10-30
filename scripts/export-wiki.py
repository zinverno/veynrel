#!/usr/bin/env python3
"""Export the owned user-guide pages; dry-run by default. Never commit or push."""
import argparse
import hashlib
import json
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGES = ('Home', 'Getting-started', 'Installation-and-updates', 'Vault-health-and-connections',
         'Studio-recipes', 'Community-library', 'Excalidraw-diagrams', 'Recall',
         'Providers-and-privacy', 'Safety-history-and-recovery', 'Troubleshooting',
         'Contributing', '_Sidebar', '_Footer')
REPO = 'https://github.com/zinverno/veynrel'


def render(raw, ref):
    def link(m):
        url = m[1]
        if url.startswith(('http:', 'https:', '#')):
            return m[0]
        path, _, anchor = url.partition('#')
        if path.endswith('.md') and '/' not in path:
            if path[:-3] not in PAGES:
                raise ValueError('Unknown Wiki page: ' + path)
            dest = REPO + '/wiki/' + path[:-3]
        else:
            resolved = (ROOT / 'docs/wiki' / path).resolve()
            rel = resolved.relative_to(ROOT).as_posix()
            if not resolved.is_file() or resolved.is_symlink():
                raise ValueError('Missing or unsafe source: ' + path)
            dest = ('https://raw.githubusercontent.com/zinverno/veynrel/' + ref + '/' + rel
                    if rel.startswith('assets/') else REPO + '/blob/' + ref + '/' + rel)
        return '](' + dest + ('#' + anchor if anchor else '') + ')'
    return re.sub(r'\]\(([^)]+)\)', link, raw)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source-ref', required=True, help='Exact 40-character source commit')
    p.add_argument('--target', required=True, type=Path, help='Existing empty export directory or clean Wiki clone')
    p.add_argument('--write', action='store_true')
    p.add_argument('--backup', type=Path, help='New external backup directory, required for writes')
    a = p.parse_args()
    if not re.fullmatch('[0-9a-f]{40}', a.source_ref):
        p.error('Use an exact source SHA')
    subprocess.run(['git', 'cat-file', '-e', a.source_ref + '^{commit}'], cwd=ROOT, check=True)
    target = a.target.absolute()
    if target.is_symlink() or not target.is_dir() or target.resolve() != target:
        p.error('Target must be an existing real directory with no symlink components')
    if target == ROOT or ROOT in target.parents:
        p.error('Export outside the source checkout')
    git = (target / '.git').exists()
    old_ref = None
    if git:
        remote = subprocess.check_output(['git', 'remote', 'get-url', 'origin'], cwd=target, text=True).strip()
        if remote not in (REPO + '.wiki.git', 'git@github.com:zinverno/veynrel.wiki.git'):
            p.error('Unexpected Wiki remote')
        if subprocess.check_output(['git', 'status', '--porcelain'], cwd=target):
            p.error('Wiki clone must be clean')
        old_ref = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=target, text=True).strip()
    rendered = {}
    originals = {}
    for name in PAGES:
        filename = name + '.md'
        source = ROOT / 'docs/wiki' / filename
        # Refuse to publish uncommitted content under an older source URL.
        committed = subprocess.check_output(['git', 'show', a.source_ref + ':docs/wiki/' + filename], cwd=ROOT)
        if source.read_bytes() != committed:
            p.error('Source differs from pinned commit: ' + filename)
        dest = target / filename
        if dest.is_symlink() or (dest.exists() and not dest.is_file()):
            p.error('Unsafe owned page: ' + filename)
        originals[filename] = dest.read_bytes() if dest.exists() else None
        rendered[filename] = render(committed.decode(), a.source_ref).encode()
    changes = [n for n in rendered if rendered[n] != originals[n]]
    print(json.dumps({'mode': 'write' if a.write else 'dry-run', 'oldWikiCommit': old_ref,
                      'sourceCommit': a.source_ref, 'ownedPages': list(rendered), 'changed': changes,
                      'unknownPages': sorted(x.name for x in target.glob('*.md') if x.stem not in PAGES)}, indent=2))
    if not a.write:
        return
    if not a.backup or a.backup.exists() or target in a.backup.absolute().parents:
        p.error('Provide a new external backup directory')
    a.backup.mkdir(parents=True)
    if git:
        subprocess.run(['git', 'bundle', 'create', str(a.backup.absolute() / 'before.bundle'), '--all'], cwd=target, check=True)
    for name, raw in originals.items():
        if raw is not None:
            (a.backup / name).write_bytes(raw)
    (a.backup / 'reference.json').write_text(json.dumps({'oldWikiCommit': old_ref, 'sourceCommit': a.source_ref}, indent=2))
    for name in changes:
        dest = target / name
        if dest.is_symlink() or (dest.read_bytes() if dest.exists() else None) != originals[name]:
            raise RuntimeError('Target changed during export: ' + name)
        dest.write_bytes(rendered[name])
        assert dest.read_bytes() == rendered[name]
    print('Exported. Review git diff, commit owned pages, then ordinary push explicitly. No pages deleted.')


if __name__ == '__main__':
    main()
