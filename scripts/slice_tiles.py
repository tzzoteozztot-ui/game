"""Нарезка листа тайлов поля: art/concepts/tiles-<набор>.jpg -> public/tiles/<набор>/*.jpg (256x256).
Запуск: python3 scripts/slice_tiles.py [frontier|swamp]  (без аргумента — frontier)
Лист: ряд 1 — тупик, прямая, поворот, перекрёсток; ряд 2 — перекрёсток, трава, земля.
Т-развилки на листе нет: собирается из перекрёстка (верхняя половина) и прямой (нижняя) с мягким швом.
Ориентация эталонов: тупик/прямая — влево/вправо; поворот — влево+вниз; Т — влево+вправо+вверх."""
import sys
from PIL import Image
import numpy as np

# Рамки тайлов на листе: ряды (y0, y1) и столбцы (x0, x1). Листы swamp и следующие — перекраска листа Пограничья в Gemini
SHEETS = {
    'frontier': ([(27, 348), (420, 729)], [(29, 341), (364, 677), (699, 1012), (1035, 1347)]),
    'swamp': ([(19, 259), (313, 544)], [(21, 254), (271, 504), (520, 753), (770, 1003)]),
}
name = sys.argv[1] if len(sys.argv) > 1 else 'frontier'
out = f'public/tiles/{name}/'
im = Image.open(f'art/concepts/tiles-{name}.jpg').convert('RGB')
ROWS, COLS = SHEETS[name]
S = 256
INSET = 2


def cut(r, c):
    y0, y1 = ROWS[r]
    x0, x1 = COLS[c]
    t = im.crop((x0 + INSET, y0 + INSET, x1 - INSET, y1 - INSET))
    return t.resize((S, S), Image.LANCZOS)


tiles = {
    'end': cut(0, 0),
    'straight': cut(0, 1),
    'corner': cut(0, 2),
    'cross': cut(1, 0),
    'grass': cut(1, 1),
    'dirt': cut(1, 2),
}
# T: сверху — перекрёсток (вверх/влево/вправо), ниже середины дороги — прямая
cross = np.array(tiles['cross']).astype(float)
straight = np.array(tiles['straight']).astype(float)
cut_y, soft = 128, 22
w = np.clip((np.arange(S) - (cut_y - soft / 2)) / soft, 0, 1)[:, None, None]
tiles['t'] = Image.fromarray((cross * (1 - w) + straight * w).astype('uint8'))
for k, t in tiles.items():
    t.save(out + k + '.jpg', quality=90, optimize=True)  # тайлы без прозрачности: JPEG вчетверо легче PNG, поле грузится быстрее
print({k: t.size for k, t in tiles.items()})
