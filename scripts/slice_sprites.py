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
SPRITES = {
    'tower_archer': ('towers', (250, 20, 630, 400), (420, 300), 66, 1),
    'tower_mage': ('towers', (930, 40, 1210, 440), (1060, 300), 66, 1),
    'tower_ballista': ('towers', (290, 540, 650, 970), (450, 850), 66, 1),
    'tower_priest': ('towers', (920, 490, 1210, 970), (1060, 850), 66, 1),
    'enemy_infantry': ('enemies', (55, 100, 460, 495), (290, 330), 34, -1),
    'enemy_scout': ('enemies', (585, 130, 915, 485), (760, 300), 32, -1),
    'enemy_heavy': ('enemies', (1035, 55, 1470, 505), (1200, 300), 40, 1),
    'enemy_flyer': ('enemies', (35, 515, 565, 905), (330, 720), 34, 1),
    'enemy_shaman': ('enemies', (605, 485, 910, 965), (720, 800), 36, 1),
    'enemy_swarm': ('enemies', (1105, 695, 1355, 865), (1240, 800), 16, 1),
    'boss_1': ('bosses', (45, 0, 425, 515), (280, 330), 72, 1),
    'boss_2': ('bosses', (585, 0, 925, 525), (760, 330), 72, 1),
    'boss_3': ('bosses', (1085, 15, 1405, 535), (1220, 330), 72, 1),
    'boss_4': ('bosses', (325, 465, 725, 965), (520, 700), 72, 1),
    'boss_5': ('bosses', (795, 555, 1245, 1005), (1030, 750), 72, 1),
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


def sheet_alpha(rgb):
    h, w, _ = rgb.shape
    border = np.concatenate([rgb[:8].reshape(-1, 3), rgb[-8:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    dist = np.sqrt(((rgb - bg) ** 2).sum(-1))

    near = dist < 16
    edge = np.zeros_like(near)
    edge[0, :] = edge[-1, :] = edge[:, 0] = edge[:, -1] = True
    background = reconstruct(edge, near)
    # Замкнутые карманы фона (между ногами, под тетивой): ровные участки цвета фона
    pockets = (box_mean(dist, 4) < 5) & (dist < 8)
    background |= reconstruct(pockets, near)

    alpha = np.ones((h, w))
    soft = np.clip((dist - 5) / 11, 0, 1)
    alpha[background] = soft[background]
    return alpha, bg


def decontaminate(rgb, alpha, bg):
    a = np.maximum(alpha, 1e-3)[..., None]
    clean = (rgb - (1 - a) * bg) / a
    return np.clip(clean, 0, 255)


def main():
    os.makedirs(OUT, exist_ok=True)
    sheets = {}
    meta = {}
    for name, (sheet, rect, seed_pt, draw_h, facing) in SPRITES.items():
        if sheet not in sheets:
            rgb = np.asarray(Image.open(os.path.join(SRC, sheet + '.png')).convert('RGB')).astype(float)
            alpha, bg = sheet_alpha(rgb)
            sheets[sheet] = (decontaminate(rgb, alpha, bg), alpha)
        rgb, alpha = sheets[sheet]

        x0, y0, x1, y1 = rect
        region = np.zeros(alpha.shape, bool)
        region[y0:y1, x0:x1] = True
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
        out_h = draw_h * SCALE
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
