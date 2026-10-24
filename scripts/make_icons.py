"""Значки игры для экрана «Домой» (public/icons/): маг на тёмном фоне с золотым свечением.

Запуск: python3 scripts/make_icons.py  (нужен Pillow; берёт public/sprites/tower_mage.png)
"""

import os

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'icons')
BG = (23, 26, 46)
GLOW = (244, 192, 106)


def icon(size):
    img = Image.new('RGBA', (size, size), BG + (255,))
    glow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    r = size * 0.36
    ImageDraw.Draw(glow).ellipse((size / 2 - r, size * 0.5 - r, size / 2 + r, size * 0.5 + r), fill=GLOW + (90,))
    img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(size * 0.08)))
    fig = Image.open(os.path.join(ROOT, 'public', 'sprites', 'tower_mage.png')).convert('RGBA')
    h = round(size * 0.66)  # inside the maskable safe zone (80 % circle)
    w = round(fig.width * h / fig.height)
    fig = fig.resize((w, h), Image.LANCZOS)
    img.alpha_composite(fig, ((size - w) // 2, round(size * 0.84) - h))
    return img.convert('RGB')


def main():
    os.makedirs(OUT, exist_ok=True)
    for size, name in [(512, 'icon-512.png'), (192, 'icon-192.png'), (180, 'apple-touch-icon.png'), (32, 'favicon-32.png')]:
        icon(size).save(os.path.join(OUT, name), optimize=True)
        print(name)


if __name__ == '__main__':
    main()
