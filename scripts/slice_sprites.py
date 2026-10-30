"""Нарезка листов концептов art/concepts/*.png на спрайты с прозрачным фоном.

Запуск: python3 scripts/slice_sprites.py  (нужны numpy и Pillow)
Результат: public/sprites/*.png и public/sprites/sprites.json.

Фон листов ровный светло-серый. Пиксели фона, связанные с краем листа, и
крупные замкнутые «карманы» фона становятся прозрачными; переходный ободок
получает частичную прозрачность, а его цвет очищается от серого (без ореола).
Каждая фигура выделяется заливкой от точки внутри неё в пределах своей рамки.
Спрайты сохраняются втрое крупнее игрового размера (drawH в sprites.json).
"""

import json
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art', 'concepts')
OUT = os.path.join(ROOT, 'public', 'sprites')
SCALE = 3  # спрайт втрое крупнее, чем рисуется в игре

# name: (лист, рамка x0, y0, x1, y1, точка внутри фигуры, высота в игре в px, куда смотрит фигура)
# Точка None — берётся всё непрозрачное в рамке (искры, флаги); высота None — по масштабу листа (SHEET_OPTS 'px'),
# чтобы ярусы одной башни сохранили соотношение размеров и общую линию основания.
TOWER_COLUMNS = {'archer': (60, 420), 'priest': (430, 790), 'mage': (790, 1150), 'ballista': (1150, 1520)}
TOWER_ROWS = {1: (5, 228), 2: (228, 440), 3: (440, 690)}

SPRITES = {
    **{
        f'tower_{kind}_{tier}': ('towers-tiers', (x0, y0, x1, y1), None, None, 1)
        for kind, (x0, x1) in TOWER_COLUMNS.items()
        for tier, (y0, y1) in TOWER_ROWS.items()
    },
    'enemy_infantry': ('enemies', (55, 100, 460, 495), (290, 330), 34, -1),
    'enemy_scout': ('enemies', (585, 130, 915, 485), (760, 300), 32, -1),
    'enemy_heavy': ('enemies', (1035, 55, 1470, 505), (1200, 300), 40, 1),
    'enemy_flyer': ('enemies', (35, 515, 565, 905), (330, 720), 34, 1),
    'enemy_shaman': ('enemies', (605, 485, 910, 965), (720, 800), 36, 1),
    'enemy_swarm': ('enemies', (1105, 695, 1355, 865), (1240, 800), 16, 1),
    # Враги фракций (art/concepts/enemies): enemy_<тип>_<уровень>; остальные типы — общие спрайты выше
    'enemy_heavy_1': ('enemies/factions', (30, 82, 227, 332), (128, 219), 40, 1),
    'enemy_scout_1': ('enemies/factions', (252, 104, 387, 329), (319, 228), 32, 1),
    'enemy_infantry_1': ('enemies/factions', (400, 105, 571, 330), (485, 229), 34, 1),
    'enemy_shaman_1': ('enemies/factions', (569, 55, 733, 335), (651, 209), 36, 1),
    'enemy_infantry_2': ('enemies/factions', (772, 117, 957, 328), (864, 233), 34, 1),
    'enemy_scout_2': ('enemies/factions', (977, 104, 1122, 336), (1047, 233), 32, 1),
    'enemy_shaman_2': ('enemies/factions', (1138, 104, 1290, 328), (1214, 227), 36, 1),
    'enemy_heavy_2': ('enemies/factions', (1294, 54, 1477, 342), (1385, 212), 40, 1),
    'enemy_infantry_3': ('enemies/ice-legion', (823, 137, 1062, 512), (939, 343), 34, 1),
    'enemy_scout_3': ('enemies/ice-legion', (1075, 207, 1276, 510), (1174, 374), 32, 1),
    'enemy_heavy_3': ('enemies/ice-legion', (40, 540, 361, 942), (201, 761), 40, 1),
    'enemy_flyer_3': ('enemies/ice-legion', (595, 553, 1020, 896), (807, 738), 34, 1),
    'enemy_shaman_3': ('enemies/ice-legion', (565, 153, 786, 512), (676, 352), 36, 1),
    'enemy_swarm_3': ('enemies/ice-legion', (404, 659, 653, 950), (521, 820), 16, 1),
    'enemy_infantry_4': ('enemies/factions', (752, 404, 944, 644), (848, 536), 34, 1),
    'enemy_flyer_4': ('enemies/factions', (958, 372, 1156, 646), (1057, 523), 34, 1),
    'enemy_heavy_4': ('enemies/factions', (1139, 471, 1313, 649), (1226, 569), 40, 1),
    'enemy_shaman_4': ('enemies/factions', (1323, 339, 1483, 654), (1403, 512), 36, 1),
    'enemy_infantry_5': ('enemies/factions', (302, 714, 493, 951), (397, 844), 34, 1),
    'enemy_heavy_5': ('enemies/factions', (520, 728, 734, 965), (627, 858), 40, 1),
    'enemy_scout_5': ('enemies/factions', (759, 718, 973, 963), (866, 853), 32, 1),
    'boss_1': ('bosses', (45, 0, 425, 515), (280, 330), 72, 1),
    'boss_2': ('bosses', (585, 0, 925, 525), (760, 330), 72, 1),
    'boss_3': ('bosses', (1085, 15, 1405, 535), (1220, 330), 72, 1),
    'boss_4': ('bosses', (325, 465, 725, 965), (520, 700), 72, 1),
    'boss_5': ('bosses', (795, 555, 1245, 1005), (1030, 750), 72, 1),
    # Связки и замок (art/concepts/props): снимки экрана на тёмном фоне-градиенте, по одной фигуре на лист
    'binder': ('props/binder', (0, 0, 620, 1030), None, 44, 1),
    'binder_triple': ('props/binder_triple', (0, 0, 690, 1100), None, 50, 1),
    'castle': ('props/castle', (0, 0, 770, 870), None, 84, 1),
}


def dilate(mask, r=1):
    out = mask.copy()
    for _ in range(r):
        m = out.copy()
        m[1:, :] |= out[:-1, :]
        m[:-1, :] |= out[1:, :]
        m[:, 1:] |= out[:, :-1]
        m[:, :-1] |= out[:, 1:]
        out = m
    return out


def reconstruct(seed, mask):
    """Заливка: все пиксели mask, связанные с seed."""
    cur = seed & mask
    while True:
        nxt = dilate(cur, 4) & mask
        if (nxt == cur).all():
            return cur
        cur = nxt


def box_mean(a, r):
    """Среднее в окне (2r+1)^2 через интегральную картинку."""
    padded = np.pad(a, r, mode='edge')
    p = np.zeros((padded.shape[0] + 1, padded.shape[1] + 1))
    p[1:, 1:] = padded.cumsum(0).cumsum(1)
    k = 2 * r + 1
    s = p[k:, k:] - p[:-k, k:] - p[k:, :-k] + p[:-k, :-k]
    return s / (k * k)


# Листы с менее ровным фоном: тени в «карманах» темнее фона, вокруг фигур светлый серый ободок
SHEET_OPTS = {
    # Лист ярусов башен: фон — нарисованная шахматка (белый и светло-серый)
    'towers-tiers': {'checker': True, 'px': 0.28},
    'enemies/factions': {'pocket': (9, 13), 'light_rim': True},
    'enemies/ice-legion': {'pocket': (9, 13), 'light_rim': True},
    'props/binder': {'gradient': True},
    'props/binder_triple': {'gradient': True},
    'props/castle': {'gradient': True},
}


def gradient_bg(rgb, band=24):
    """Тёмный фон с плавным градиентом: по каждому каналу плоскость второй степени,
    подогнанная по полосе у края листа."""
    h, w, _ = rgb.shape
    yy, xx = np.mgrid[0:h, 0:w]
    edge = np.zeros((h, w), bool)
    edge[:band] = edge[-band:] = edge[:, :band] = edge[:, -band:] = True
    x, y = xx / w, yy / h
    basis = np.stack([np.ones_like(x), x, y, x * x, x * y, y * y], -1)
    coef, *_ = np.linalg.lstsq(basis[edge], rgb[edge], rcond=None)
    return basis @ coef


def sheet_alpha(rgb, pocket=(5, 8), light_rim=False, gradient=False):
    h, w, _ = rgb.shape
    if gradient:
        bg = gradient_bg(rgb)
    else:
        border = np.concatenate([rgb[:8].reshape(-1, 3), rgb[-8:].reshape(-1, 3)])
        bg = np.median(border, axis=0)
    dist = np.sqrt(((rgb - bg) ** 2).sum(-1))

    near = dist < 16
    grey = (rgb.max(-1) - rgb.min(-1)) < 14
    if light_rim:
        near |= grey & (rgb.mean(-1) > bg.mean() - 2)
    edge = np.zeros_like(near)
    edge[0, :] = edge[-1, :] = edge[:, 0] = edge[:, -1] = True
    background = reconstruct(edge, near)
    # Замкнутые карманы фона (между ногами, под тетивой): ровные участки цвета фона
    pockets = (box_mean(dist, 4) < pocket[0]) & (dist < pocket[1])
    if light_rim:
        pockets &= grey
    background |= reconstruct(pockets, near)

    alpha = np.ones((h, w))
    soft = np.clip((dist - 5) / 11, 0, 1)
    if light_rim:
        soft[grey & (rgb.mean(-1) > bg.mean() - 2)] = 0
    alpha[background] = soft[background]
    if gradient:
        # Шумный край снимка: резкая маска без крошек (размыкание на 2 px) и сглаживание в 1 px
        m = alpha > 0.5
        m = dilate(~dilate(~m, 2), 2)
        alpha = np.clip(box_mean(m.astype(float), 1), 0, 1)
    return alpha, bg


def checker_alpha(rgb):
    """Фон-шахматка: почти белые серые пиксели, связанные с краем, и крупные карманы того же цвета."""
    lo, sat = rgb.min(-1), rgb.max(-1) - rgb.min(-1)
    near = (lo > 222) & (sat < 12)
    edge = np.zeros_like(near)
    edge[0, :] = edge[-1, :] = edge[:, 0] = edge[:, -1] = True
    background = reconstruct(edge, near)
    background |= reconstruct(box_mean(near.astype(float), 2) > 0.99, near)
    bg = np.array([244.0, 244.0, 244.0])
    dist = np.sqrt(((rgb - bg) ** 2).sum(-1))
    alpha = np.ones(near.shape)
    alpha[background] = 0
    # Ободок в 2 px вокруг фона: частичная прозрачность по удалённости от цвета фона
    rim = dilate(background, 2) & ~background
    alpha[rim] = np.clip((dist[rim] - 14) / 40, 0, 1)
    return alpha, bg


def decontaminate(rgb, alpha, bg):
    a = np.maximum(alpha, 1e-3)[..., None]
    clean = (rgb - (1 - a) * bg) / a
    return np.clip(clean, 0, 255)


def rect_parts(alpha, rect, reach=120):
    """Все части фигуры, чей центр лежит в рамке. Части ищутся в рамке, расширенной на reach, чтобы
    флаги и сияние соседних рядов, заходящие за границу, не обрезались и не попадали сюда.
    Части считаются по плотным пикселям (без расширения: сияние фонаря почти касается
    постамента ряда выше), полупрозрачный край потом добирается в 2 px вокруг них."""
    x0, y0, x1, y1 = rect
    ey0, ey1 = max(0, y0 - reach), min(alpha.shape[0], y1 + reach)
    sub = alpha[ey0:ey1, x0:x1]
    left = sub > 0.5
    keep = np.zeros_like(left)
    other = np.zeros_like(left)
    while left.any():
        seed = np.zeros_like(left)
        ys, xs = np.nonzero(left)
        seed[ys[0], xs[0]] = True
        part = reconstruct(seed, left)
        left &= ~part
        py = np.nonzero(part)[0]
        if part.sum() > 30 and y0 <= ey0 + py.mean() < y1:
            keep |= part
        else:
            other |= part
    keep = dilate(keep, 2) & ~dilate(other, 1) & (sub > 0)
    obj = np.zeros(alpha.shape, bool)
    obj[ey0:ey1, x0:x1] = keep
    return obj


def main():
    os.makedirs(OUT, exist_ok=True)
    sheets = {}
    meta = {}
    for name, (sheet, rect, seed_pt, draw_h, facing) in SPRITES.items():
        if sheet not in sheets:
            rgb = np.asarray(Image.open(os.path.join(SRC, sheet + '.png')).convert('RGB')).astype(float)
            opts = {k: v for k, v in SHEET_OPTS.get(sheet, {}).items() if k != 'px'}
            alpha, bg = checker_alpha(rgb) if opts.pop('checker', False) else sheet_alpha(rgb, **opts)
            sheets[sheet] = (decontaminate(rgb, alpha, bg), alpha)
        rgb, alpha = sheets[sheet]

        x0, y0, x1, y1 = rect
        region = np.zeros(alpha.shape, bool)
        region[y0:y1, x0:x1] = True
        if seed_pt is None:
            obj = rect_parts(alpha, rect)
        else:
            solid = dilate(alpha > 0.15, 3) & region
            seed = np.zeros_like(solid)
            sx, sy = seed_pt
            seed[sy - 3:sy + 4, sx - 3:sx + 4] = True
            obj = reconstruct(seed, solid)
        a = np.where(obj, alpha, 0)
        # Срезаем внешний ободок в 1 px: в нём остаётся серый фон листа
        e = a.copy()
        e[1:, :] = np.minimum(e[1:, :], a[:-1, :])
        e[:-1, :] = np.minimum(e[:-1, :], a[1:, :])
        e[:, 1:] = np.minimum(e[:, 1:], a[:, :-1])
        e[:, :-1] = np.minimum(e[:, :-1], a[:, 1:])
        a = e
        a[a < 0.04] = 0

        ys, xs = np.nonzero(a)
        top, bottom, left, right = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        pad = 4
        top, left = max(0, top - pad), max(0, left - pad)
        bottom, right = min(a.shape[0], bottom + pad), min(a.shape[1], right + pad)

        rgba = np.dstack([rgb[top:bottom, left:right], a[top:bottom, left:right] * 255]).round().astype(np.uint8)
        img = Image.fromarray(rgba, 'RGBA')
        if draw_h is None:
            draw_h = round((bottom - top) * SHEET_OPTS[sheet]['px'], 1)
        out_h = round(draw_h * SCALE)
        out_w = max(1, round(img.width * out_h / img.height))
        img = img.convert('RGBa').resize((out_w, out_h), Image.LANCZOS).convert('RGBA')
        img.save(os.path.join(OUT, name + '.png'), optimize=True)

        # Точка привязки: середина нижней десятой части фигуры, по низу
        crop = a[top:bottom, left:right]
        foot = crop[int(crop.shape[0] * 0.9):]
        cols = foot.sum(0)
        anchor_x = float((cols * np.arange(cols.size)).sum() / cols.sum() / crop.shape[1])

        meta[name] = {
            'file': name + '.png',
            'w': out_w,
            'h': out_h,
            'drawH': draw_h,
            'anchorX': round(anchor_x, 3),
            'anchorY': 1,
            'facing': facing,
        }
        print(f'{name}: {out_w}x{out_h}')

    with open(os.path.join(OUT, 'sprites.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
        f.write('\n')


if __name__ == '__main__':
    main()
