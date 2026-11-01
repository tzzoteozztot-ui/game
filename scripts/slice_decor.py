"""Нарезка листов декора (фон-маджента): art/concepts/decor-<набор>.* -> public/tiles/<набор>/decor/*.png.
Запуск: python3 scripts/slice_decor.py [frontier|swamp|ice|scorched|citadel]  (без аргумента — все наборы; нужны numpy, Pillow, scipy)
Пограничье: только мелкое (камни, кусты, пень, трава); крупные камни, заборы и знамёна не нарезаем (решение Артура 2026-11-01: «мелкий декор»).
Рамки — по ограничивающим прямоугольникам фигур на листе."""
import os
import sys
from PIL import Image
import numpy as np

# набор: (лист, ключ фона, {имя: (x, y, w, h) на листе})
# Ключ 'magenta' — прежний (Пограничье); 'tint' — всё с пурпурным оттенком (min(R, B) − G > 35): так уходят и тени,
# и розовое сияние вокруг светящихся предметов (листы Gemini 2026-11-01)
SETS = {
    'frontier': ('art/concepts/decor-frontier.png', 'magenta', {
    'rock1': (60, 57, 99, 72), 'rock2': (195, 67, 70, 51), 'rock3': (174, 139, 94, 88), 'rock4': (57, 161, 91, 63),
    'tuft': (810, 438, 78, 77), 'bush1': (946, 426, 119, 96), 'bush2': (1220, 273, 149, 136),
    'bush3': (1002, 256, 193, 162), 'stump': (493, 273, 211, 127),
    }),
    'swamp': ('art/concepts/decor-swamp.jpg', 'tint', {
        'rock1': (72, 77, 143, 106), 'rock2': (279, 79, 145, 114), 'grave1': (495, 41, 153, 184),
        'grave2': (735, 40, 227, 248), 'bones': (68, 265, 208, 126), 'shrooms': (350, 225, 144, 181),
        'log': (602, 252, 295, 205), 'snag': (45, 421, 276, 218), 'reeds': (361, 434, 125, 204),
        'bush': (546, 434, 178, 202), 'tuft': (774, 510, 206, 126),
    }),
    'ice': ('art/concepts/decor-ice.jpg', 'tint', {
        'rock1': (50, 52, 200, 152), 'rock2': (304, 51, 186, 155), 'crystal1': (558, 44, 147, 163),
        'crystal2': (797, 59, 149, 141), 'shard': (313, 243, 162, 174), 'bush': (756, 224, 236, 212),
        'stump': (33, 446, 240, 205), 'tuft': (317, 438, 177, 200), 'rune': (570, 477, 130, 156),
        'drift': (766, 498, 222, 126),
    }),
    'scorched': ('art/concepts/decor-scorched.jpg', 'tint', {
        'rock1': (56, 50, 192, 169), 'rock2': (286, 45, 207, 183), 'stump': (528, 39, 245, 214),
        'bush': (798, 41, 198, 186), 'bones': (46, 279, 276, 160), 'sulfur': (421, 272, 265, 156),
        'ember': (770, 277, 187, 158), 'horn': (70, 450, 283, 197), 'tuft': (449, 472, 206, 166),
        'ash': (711, 492, 275, 145),
    }),
    # 'tint_strict': как 'tint', но фон ещё и почти без зелёного — у Цитадели свои фиолетовые цветы и трава
    'citadel': ('art/concepts/decor-citadel.jpg', 'tint_strict', {
        'slab1': (48, 50, 190, 152), 'slab2': (300, 59, 160, 143), 'column': (516, 36, 225, 188),
        'crystal': (777, 30, 207, 203), 'bush': (65, 236, 233, 208), 'tuft': (392, 250, 224, 184),
        'vase1': (745, 263, 213, 180), 'vase2': (62, 467, 204, 173), 'rune': (312, 484, 172, 147),
        'root': (536, 406, 180, 236), 'leaves': (748, 489, 243, 157),
    }),
}

from scipy import ndimage as ndi

# Поправки цвета отдельных предметов: (набор, имя) → доля обесцвечивания, яркость.
# Сера слишком похожа на кучку золота (просьба Артура 2026-11-01: «сделай её серее»)
GREY = {('scorched', 'sulfur'): (0.65, 0.8)}
# Свечение бирюзового кристалла на мадженте даёт сиреневый ореол: у самого кристалла красного мало, а синий близок
# к зелёному; у ореола много красного или синий заметно выше зелёного
HALO_RED = {('citadel', 'crystal'): 15}


def slice_set(name):
    src, key, items = SETS[name]
    out = f'public/tiles/{name}/decor/'
    os.makedirs(out, exist_ok=True)
    im = np.array(Image.open(src).convert('RGB')).astype(int)
    R, G, B = im[..., 0], im[..., 1], im[..., 2]
    if key == 'magenta':
        bg = (R > 90) & (B > 90) & (G < 0.45 * np.minimum(R, B))
        # кайма: у края фона убираем и пурпурные пиксели потемнее, затем сжимаем маску на 1 px
        ring = ndi.binary_dilation(bg, iterations=3) & ~bg
        bg = bg | (ring & (np.minimum(R, B) > G * 1.35 + 8))
    else:
        tint = np.minimum(R, B) - G
        bg = (tint > 35) | ((tint > 8) & (G > 140))  # светлое розовое — сияние на мадженте
        if key == 'tint_strict':
            bg = ((tint > 35) & (G < 0.5 * np.minimum(R, B))) | ((tint > 8) & (G > 140))
    bg = ~ndi.binary_erosion(~bg, iterations=1) | bg
    rgba = np.dstack([im, np.where(bg, 0, 255)]).astype('uint8')
    for item, (x, y, w, h) in items.items():
        pad = 4
        crop = rgba[max(0, y - pad):y + h + pad, max(0, x - pad):x + w + pad].copy()
        if (name, item) in HALO_RED:
            c = crop.astype(int)
            crop[(c[..., 0] > c[..., 1] + HALO_RED[(name, item)]) | (c[..., 2] > c[..., 1] + 40), 3] = 0
        if key != 'magenta':
            # Куски соседних предметов заходят в рамку с края — их убираем
            lab, _ = ndi.label(ndi.binary_dilation(crop[..., 3] > 0, iterations=2))
            sizes = np.bincount(lab.ravel())
            sizes[0] = 0
            edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0, int(sizes.argmax())}
            for e in edge:
                crop[lab == e, 3] = 0
        if (name, item) in GREY:
            k, v = GREY[(name, item)]
            rgb = crop[..., :3].astype(float)
            lum = rgb @ np.array([0.299, 0.587, 0.114])
            crop[..., :3] = np.clip((rgb * (1 - k) + lum[..., None] * k) * v, 0, 255).astype('uint8')
        t = Image.fromarray(crop, 'RGBA')
        bbox = t.getchannel('A').getbbox()
        t = t.crop(bbox)
        k = 96 / max(t.size)
        if k < 1:
            t = t.resize((round(t.width * k), round(t.height * k)), Image.LANCZOS)
        t.save(out + item + '.png', optimize=True)
        print(name, item, t.size)


for n in sys.argv[1:] or SETS:
    slice_set(n)
