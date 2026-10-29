"""Check captured PNG pixels against native theme evidence. Pillow is validation-only, not a plugin dependency."""
import json
from pathlib import Path
import re
import sys
from PIL import Image

root = Path(sys.argv[1])
report = json.loads((root / 'native-report.json').read_text())
frames = [f for f in report['themeCaptures'] if re.fullmatch(r'(review|confirmation)-(en|ru)-(light|dark)-(390|1300)-r2.png', f['file'])]
assert len(frames) == 16
assert {(f['language'], f['requested'], f['viewport'], f['stage']) for f in frames} == {(language, mode, width, stage) for language in ['en', 'ru'] for mode in ['light', 'dark'] for width in [390, 1300] for stage in ['review', 'confirmation']}
results = []
for frame in frames:
    mode = frame['requested']
    assert f'theme-{mode}' in frame['classes']
    assert f"theme-{'dark' if mode == 'light' else 'light'}" not in frame['classes']
    rgb = lambda color: tuple(int(x) for x in re.findall(r'\d+', color)[:3])
    background, text = rgb(frame['background']), rgb(frame['text'])
    image = Image.open(root / frame['file']).convert('RGB')
    assert image.width == frame['viewport'], frame['file']
    x, y = max(0, int(frame['x'])), max(0, int(frame['y']))
    right, bottom = min(image.width, int(frame['x'] + frame['width'])), min(image.height, int(frame['y'] + frame['height']))
    assert right > x and bottom > y
    crop = image.crop((x, y, right, bottom))
    counts = dict((color, count) for count, color in crop.getcolors(crop.width * crop.height))
    fraction = counts.get(background, 0) / (crop.width * crop.height)
    assert fraction > 0.15, (frame['file'], fraction)
    assert counts.get(text, 0) > 10, frame['file']
    assert (sum(background) > sum(text)) == (mode == 'light')
    results.append({'file': frame['file'], 'requested': mode, 'classes': frame['classes'], 'surfaceRGB': background, 'textRGB': text,
                    'pngWidth': image.width, 'pngHeight': image.height, 'matchingSurfaceFraction': fraction, 'matchingTextPixels': counts.get(text, 0)})
output = {'status': 'PASS', 'frames': results, 'note': 'Native computed classes/colors plus matching PNG pixels; no recoloring or class injection.'}
Path(sys.argv[2]).write_text(json.dumps(output, indent=2) + '\n')
print(f'{len(results)} theme screenshots match native classes, computed colors and PNG pixels.')
