"""Small offline check for link rewriting and fail-closed references."""
import importlib.util
from pathlib import Path
spec = importlib.util.spec_from_file_location('wiki', Path(__file__).with_name('export-wiki.py'))
wiki = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wiki)
ref = 'a' * 40
assert wiki.render('[Start](Getting-started.md#local-first)', ref) == '[Start](https://github.com/zinverno/veynrel/wiki/Getting-started#local-first)'
assert wiki.render('[External](https://example.org/x)', ref) == '[External](https://example.org/x)'
assert '/blob/' + ref + '/CONTRIBUTING.md' in wiki.render('[Contribute](../../CONTRIBUTING.md)', ref)
for path in ['Unknown.md', '../../../outside.md', '../../missing-file.md']:
    try:
        wiki.render('[bad](' + path + ')', ref)
    except ValueError:
        pass
    else:
        raise AssertionError(path)
print('Wiki export link checks passed')
