"""Нарезка листа магических наростов (закрытые клетки) art/concepts/blocked-growth.jpg → public/tiles/blocked/growth1..4.webp (без потерь).

Лист Gemini: 4 панели на мадженте, в каждой кристаллы на серой земле. Землю убираем: остаются бирюзовые
кристаллы, их светлые ядра, прожилки и тёмный контур вокруг них. Каждая панель обрезается в квадрат вокруг
кристаллов, края гаснут, чтобы прожилки не обрывались резко. Запуск: python3 scripts/slice_blocked.py
"""
import os

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art', 'concepts', 'blocked-growth.jpg')
OUT = os.path.join(ROOT, 'public', 'tiles', 'blocked')
SIZE = 256


def main():
    a = np.asarray(Image.open(SRC).convert('RGB')).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    h, w = r.shape
    mag = (r > 180) & (b > 180) & (g < 120)
    panels = []
    for x0, x1 in ((0, w // 2), (w // 2, w)):
        for y0, y1 in ((0, h // 2), (h // 2, h)):
            ys, xs = np.nonzero(~mag[y0:y1, x0:x1])
            panels.append((x0 + xs.min() + 6, y0 + ys.min() + 6, x0 + xs.max() - 6, y0 + ys.max() - 6))
    lum = a.mean(-1)
    teal = (g - r > 45) & (b - r > 45)
    keep = teal | ((lum > 200) & ~mag)
    keep = ndimage.binary_fill_holes(ndimage.binary_closing(keep, iterations=2))
    keep = ndimage.binary_opening(keep, iterations=1)
    m = Image.fromarray((keep * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(1.2))
    alpha = np.asarray(m).astype(float)
    os.makedirs(OUT, exist_ok=True)
    for i, (x0, y0, x1, y1) in enumerate(panels):
        sub = a[y0:y1, x0:x1]
        cryst = teal[y0:y1, x0:x1] & (lum[y0:y1, x0:x1] > 150)
        ys, xs = np.nonzero(cryst)
        side = y1 - y0
        sx = int(min(max(0, xs.mean() - side / 2), (x1 - x0) - side))
        al = alpha[y0:y1, x0:x1][:, sx:sx + side]
        yy, xx = np.mgrid[0:side, 0:side]
        edge = np.minimum.reduce([xx, yy, side - 1 - xx, side - 1 - yy]) / (side * 0.12)
        al = al * np.clip(edge, 0, 1)
        img = Image.fromarray(np.dstack([sub[:, sx:sx + side], al]).astype(np.uint8), 'RGBA')
        img.convert('RGBa').resize((SIZE, SIZE), Image.LANCZOS).convert('RGBA').save(os.path.join(OUT, f'growth{i + 1}.webp'), lossless=True, quality=100, method=6, exact=True)
        print(f'growth{i + 1}')


if __name__ == '__main__':
    main()
