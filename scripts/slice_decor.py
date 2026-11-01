"""Нарезка листа декора Пограничья: art/concepts/decor-frontier.png (фон-маджента) -> public/tiles/frontier/decor/*.png.
Берём только мелкое (камни, кусты, пень, трава); крупные камни, заборы и знамёна не нарезаем (решение Артура 2026-11-01: «мелкий декор»).
Рамки — по ограничивающим прямоугольникам фигур на листе."""
import sys
from PIL import Image
import numpy as np

src = sys.argv[1] if len(sys.argv) > 1 else 'art/concepts/decor-frontier.png'
out = 'public/tiles/frontier/decor/'
# имя: (x, y, w, h) на листе
ITEMS = {
    'rock1': (60, 57, 99, 72), 'rock2': (195, 67, 70, 51), 'rock3': (174, 139, 94, 88), 'rock4': (57, 161, 91, 63),
    'tuft': (810, 438, 78, 77), 'bush1': (946, 426, 119, 96), 'bush2': (1220, 273, 149, 136),
    'bush3': (1002, 256, 193, 162), 'stump': (493, 273, 211, 127),
}
im = np.array(Image.open(src).convert('RGB')).astype(int)
R, G, B = im[..., 0], im[..., 1], im[..., 2]
bg = (R > 90) & (B > 90) & (G < 0.45 * np.minimum(R, B))
from scipy import ndimage as ndi
# кайма: у края фона убираем и пурпурные пиксели потемнее, затем сжимаем маску на 1 px
ring = ndi.binary_dilation(bg, iterations=3) & ~bg
bg = bg | (ring & (np.minimum(R, B) > G * 1.35 + 8))
bg = ~ndi.binary_erosion(~bg, iterations=1) | bg
rgba = np.dstack([im, np.where(bg, 0, 255)]).astype('uint8')
for name, (x, y, w, h) in ITEMS.items():
    pad = 4
    t = Image.fromarray(rgba[max(0, y - pad):y + h + pad, max(0, x - pad):x + w + pad], 'RGBA')
    bbox = t.getchannel('A').getbbox()
    t = t.crop(bbox)
    k = 96 / max(t.size)
    if k < 1:
        t = t.resize((round(t.width * k), round(t.height * k)), Image.LANCZOS)
    t.save(out + name + '.png', optimize=True)
    print(name, t.size)
