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

# Дополнительные листы: набор → [(лист, ключ фона, предметы)]. Лист GPT 2026-11-05 — по ряду на карту (просьба Артура: разнообразнее)
ALL_V2 = 'art/concepts/decor-all-v2.jpg'
ALL_V3 = 'art/concepts/decor-all-v3.jpg'  # ещё два листа GPT 2026-11-05, фон — градиент
ALL_V4 = 'art/concepts/decor-all-v4.jpg'
EXTRA = {
    'frontier': [(ALL_V2, 'tint', {'flowers': (45, 21, 170, 104), 'fern': (302, 19, 166, 108),
                                   'berries': (554, 19, 167, 111), 'branch': (773, 20, 225, 101)}),
        (ALL_V3, 'grad', {'molehill': (42, 27, 192, 102), 'clover': (297, 14, 186, 121), 'wheel': (557, 20, 163, 117), 'burdock': (789, 13, 194, 126)}),
        (ALL_V4, 'grad', {'thistle': (55, 13, 170, 112), 'strawberry': (307, 18, 163, 118), 'spear': (522, 36, 234, 97), 'hay': (795, 33, 198, 99)})],
    'swamp': [(ALL_V2, 'tint', {'sedge': (43, 137, 188, 124), 'lily': (280, 154, 212, 108),
                                'shrooms2': (563, 144, 140, 116), 'helmet': (783, 137, 204, 139)}),
        (ALL_V3, 'grad', {'duckweed': (26, 138, 225, 133), 'cotton': (300, 140, 179, 135), 'oar': (530, 140, 221, 133), 'lantern': (813, 151, 150, 120)}),
        (ALL_V4, 'grad', {'wisps': (26, 135, 225, 136), 'berrylog': (288, 144, 203, 127), 'snails': (530, 142, 216, 131), 'sword': (783, 142, 220, 131)})],
    'ice': [(ALL_V2, 'tint', {'hummock': (18, 289, 237, 107), 'icebits': (300, 296, 175, 91),
                              'flower': (548, 289, 174, 103), 'branch': (786, 276, 198, 128)}),
        (ALL_V3, 'grad', {'puddle': (19, 294, 240, 104), 'berries': (301, 286, 178, 105), 'shield': (534, 283, 212, 123), 'lichen': (817, 290, 142, 94)}),
        (ALL_V4, 'grad', {'hide': (19, 291, 240, 107), 'iceshrooms': (302, 272, 177, 119), 'lantern': (534, 280, 212, 126), 'fish': (786, 278, 213, 123)})],
    'scorched': [(ALL_V2, 'tint', {'coal': (38, 425, 194, 98), 'obsidian': (299, 415, 175, 112),
                                   'thorns': (543, 404, 189, 137), 'chain': (787, 424, 195, 104)}),
        (ALL_V3, 'grad', {'lava': (19, 415, 245, 121), 'sword': (296, 418, 186, 109), 'ashshrooms': (552, 415, 176, 114), 'firepit': (778, 423, 221, 108)}),
        (ALL_V4, 'grad', {'charlog': (44, 403, 178, 124), 'drops': (296, 427, 186, 100), 'flower': (551, 427, 177, 102), 'cauldron': (778, 408, 221, 123)})],
    'citadel': [(ALL_V2, 'tint', {'flower': (55, 543, 160, 125), 'tile': (297, 551, 180, 114),
                                  'mushroom': (567, 551, 139, 111), 'branch': (782, 539, 213, 129)}),
        (ALL_V3, 'grad', {'pool': (43, 561, 200, 106), 'bells': (312, 534, 157, 136), 'web': (551, 538, 175, 134), 'carving': (786, 556, 199, 115)}),
        (ALL_V4, 'grad', {'petals': (43, 560, 200, 107), 'mirror': (312, 542, 157, 128), 'vine': (546, 544, 196, 128), 'bowl': (785, 557, 200, 114)})],
}

from scipy import ndimage as ndi

# Поправки цвета отдельных предметов: (набор, имя) → доля обесцвечивания, яркость.
# Сера слишком похожа на кучку золота (просьба Артура 2026-11-01: «сделай её серее»)
GREY = {('scorched', 'sulfur'): (0.65, 0.8)}
# Свечение бирюзового кристалла на мадженте даёт сиреневый ореол: у самого кристалла красного мало, а синий близок
# к зелёному; у ореола много красного или синий заметно выше зелёного
HALO_RED = {('citadel', 'crystal'): 15}
# Бледное сияние вокруг поганок: светлые пиксели вне замкнутого тёмного контура фигур
HALO_PALE = {('swamp', 'shrooms2')}
# Светлые полупрозрачные предметы на градиентном фоне: фон не «растёт» по светлому (иначе съедает лёд и снег), сияние остаётся
NO_GROW = {('ice', 'iceshrooms'), ('ice', 'fish'), ('ice', 'hide'), ('scorched', 'lava')}


def slice_set(name):
    for src, key, items in [SETS[name]] + EXTRA.get(name, []):
        slice_sheet(name, src, key, items)


def slice_sheet(name, src, key, items):
    out = f'public/tiles/{name}/decor/'
    os.makedirs(out, exist_ok=True)
    im = np.array(Image.open(src).convert('RGB')).astype(int)
    R, G, B = im[..., 0], im[..., 1], im[..., 2]
    if key == 'magenta':
        bg = (R > 90) & (B > 90) & (G < 0.45 * np.minimum(R, B))
        # кайма: у края фона убираем и пурпурные пиксели потемнее, затем сжимаем маску на 1 px
        ring = ndi.binary_dilation(bg, iterations=3) & ~bg
        bg = bg | (ring & (np.minimum(R, B) > G * 1.35 + 8))
    elif key == 'grad':
        # Фон-градиент (листы GPT 2026-11-05: сверху маджента, ниже серый): цвет фона строки — по краям листа;
        # фоном считаем близкие к нему пиксели, связанные с краем листа (серые предметы внутри контура остаются)
        edge = np.concatenate([im[:, :8], im[:, -8:]], axis=1)
        bgc = ndi.uniform_filter1d(np.median(edge, axis=1), 9, axis=0)[:, None, :]
        dist = np.abs(im - bgc).max(-1)
        lab, _ = ndi.label(dist < 30)
        border = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
        bg = np.isin(lab, border[border > 0])
        bg0 = bg.copy()
        # Сияние и розовая кайма вокруг предметов: фон «растёт» по светлым или пурпурным пикселям, пока не упрётся
        # в тёмный контур фигуры
        lum = im @ np.array([0.299, 0.587, 0.114])
        blum = bgc @ np.array([0.299, 0.587, 0.114])
        tint = np.minimum(R, B) - G
        btint = (np.minimum(bgc[..., 0], bgc[..., 2]) - bgc[..., 1])
        grow = ((lum >= blum - 25) & (lum <= blum + 70) & (dist < 90)) | ((tint > 40) & (tint > 0.3 * btint))
        bg = ndi.binary_dilation(bg, mask=grow | bg, iterations=0)
        # Дыры фона внутри предметов (колесо, кольцо фонаря) — только в пурпурной части листа: в серой серые предметы
        holes = ndi.binary_opening((dist < 40) & ~bg & (btint > 60), iterations=1)
        hl, hn = ndi.label(holes)
        hs = np.bincount(hl.ravel())
        bg |= np.isin(hl, np.nonzero(hs > 40)[0][1:])
        bg |= (btint > 60) & (tint > 0.6 * btint)  # пурпурные карманы между листьями
    else:
        tint = np.minimum(R, B) - G
        bg = (tint > 35) | ((tint > 8) & (G > 140))  # светлое розовое — сияние на мадженте
        if key == 'tint_strict':
            bg = ((tint > 35) & (G < 0.5 * np.minimum(R, B))) | ((tint > 8) & (G > 140))
    bg = ~ndi.binary_erosion(~bg, iterations=1) | bg
    rgba = np.dstack([im, np.where(bg, 0, 255)]).astype('uint8')
    if key == 'grad':
        bg0 = ~ndi.binary_erosion(~bg0, iterations=1) | bg0
        rgba0 = np.dstack([im, np.where(bg0, 0, 255)]).astype('uint8')
    for item, (x, y, w, h) in items.items():
        pad = 4
        src_rgba = rgba0 if (name, item) in NO_GROW and key == 'grad' else rgba
        crop = src_rgba[max(0, y - pad):y + h + pad, max(0, x - pad):x + w + pad].copy()
        if (name, item) in HALO_RED:
            c = crop.astype(int)
            crop[(c[..., 0] > c[..., 1] + HALO_RED[(name, item)]) | (c[..., 2] > c[..., 1] + 40), 3] = 0
        if (name, item) in HALO_PALE:
            c = crop.astype(int)
            inside = ndi.binary_fill_holes(ndi.binary_dilation(c[..., :3].sum(-1) < 240, iterations=1))
            crop[~inside & (c[..., :3].sum(-1) > 330), 3] = 0
            crop[(np.minimum(c[..., 0], c[..., 2]) > c[..., 1] + 12), 3] = 0  # розовые крапины у ножек
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
