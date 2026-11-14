#!/usr/bin/env python3
"""Модульный декор карты кампании: PNG из Draw Things (~/Documents/draw-things-assets) → WebP в public/modules/ и public/ui/.
Запуск: python3 scripts/make_modules.py <папка draw-things-assets>
kit/ — как есть (уже небольшие, единый масштаб), nature/clean/ и ui/*_cut — не выше 400 px по длинной стороне."""
import sys, glob, os
from PIL import Image

src = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/Documents/draw-things-assets')
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public')
os.makedirs(os.path.join(root, 'modules'), exist_ok=True)
os.makedirs(os.path.join(root, 'ui'), exist_ok=True)

def save(f, out, maxside):
    im = Image.open(f).convert('RGBA')
    if max(im.size) > maxside:
        im.thumbnail((maxside, maxside), Image.LANCZOS)
    im.save(out, 'WEBP', quality=88, method=6)
    print(out, im.size, os.path.getsize(out))

for f in sorted(glob.glob(os.path.join(src, 'kit', '*.png'))):
    save(f, os.path.join(root, 'modules', os.path.basename(f)[:-4] + '.webp'), 1000)
for f in sorted(glob.glob(os.path.join(src, 'nature', 'clean', '*.png'))):
    save(f, os.path.join(root, 'modules', 'n_' + os.path.basename(f)[:-4] + '.webp'), 400)
for f in sorted(glob.glob(os.path.join(src, 'ui', '*_cut.png'))):
    name = os.path.basename(f)[:-8]
    save(f, os.path.join(root, 'ui', (name[2:] if name.startswith('b_') else name) + '.webp'), 400)
