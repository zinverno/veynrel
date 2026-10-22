"""Find a visible neutral circular node in a native Graph View screenshot, never inspect its internals."""
import json
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB')
r = json.loads(sys.argv[2])
x0, y0 = int(r['x']) + 25, int(r['y']) + 80
x1, y1 = int(r['x'] + r['width']) - 25, int(r['y'] + r['height']) - 40
seen, found = set(), []
for y in range(y0, y1):
    for x in range(x0, x1):
        red, green, blue = im.getpixel((x, y))
        if (x, y) in seen or max(red, green, blue) - min(red, green, blue) > 32 or red < 150:
            continue
        todo, points = [(x, y)], []
        seen.add((x, y))
        while todo:
            px, py = todo.pop()
            points.append((px, py))
            for q in ((px-1, py), (px+1, py), (px, py-1), (px, py+1)):
                if not (x0 <= q[0] < x1 and y0 <= q[1] < y1) or q in seen:
                    continue
                a, b, c = im.getpixel(q)
                if max(a, b, c)-min(a, b, c) <= 32 and a >= 150:
                    seen.add(q)
                    todo.append(q)
        xs, ys = [p[0] for p in points], [p[1] for p in points]
        width, height = max(xs)-min(xs)+1, max(ys)-min(ys)+1
        if 10 <= width <= 32 and abs(width-height) < 3 and len(points)/(width*height) > .65:
            found.append({'x': (min(xs)+max(xs))/2, 'y': (min(ys)+max(ys))/2})
assert found, 'No unambiguous visible reference circle'
found.sort(key=lambda p: abs(p['x']-(x0+x1)/2)+abs(p['y']-(y0+y1)/2))
print(json.dumps(found[0]))
