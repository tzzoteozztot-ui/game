/**
 * Тайлы поля (public/tiles/<набор>/): трава, земля и дорога из пяти тайлов (тупик, прямая, поворот, Т, перекрёсток).
 * Поле запекается один раз на карту в отдельный холст; пока тайлы не загрузились (или файла нет) движок рисует прежнюю
 * дорогу кодом. Пока набор есть только у Пограничья (карта 1) — остальные карты рисуются по-старому.
 */
import type { Point } from './maps';

/** Какие карты уже имеют набор тайлов: уровень → папка */
export const TILESETS: Record<number, string> = { 1: 'frontier' };

const NAMES = ['end', 'straight', 'corner', 't', 'cross', 'grass', 'dirt'] as const;
export type TileName = (typeof NAMES)[number];

// Стороны клетки, по часовой стрелке: влево → вверх → вправо → вниз
const L = 1;
const U = 4;
const R = 2;
const D = 8;
const rotateMask = (m: number) => ((m & L ? U : 0) | (m & U ? R : 0) | (m & R ? D : 0) | (m & D ? L : 0));

// Как нарисован эталон каждого тайла
const BASE: Record<string, number> = { end: L, straight: L | R, corner: L | D, t: L | R | U, cross: L | R | U | D };

// Мелкий декор по краям свободных клеток (решение Артура 2026-11-01): имя файла в decor/ и ширина в долях клетки.
// Клетки остаются строительными, башня стоит поверх.
const DECOR: [string, number][] = [
  ['rock1', 0.3], ['rock2', 0.24], ['rock3', 0.28], ['rock4', 0.28],
  ['tuft', 0.26], ['bush1', 0.36], ['bush2', 0.34], ['bush3', 0.36], ['stump', 0.34],
];
const DECOR_SHARE = 0.32; // доля свободных клеток с декором

export type Tileset = Map<string, HTMLImageElement>;
const sets = new Map<string, Promise<Tileset | null>>();

/** Картинка с тремя повторами: сбой сети или выкладки не должен насовсем оставить поле без тайлов */
function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const attempt = (n: number) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => (n < 3 ? setTimeout(() => attempt(n + 1), 1000 * (n + 1)) : resolve(null));
      img.src = n ? `${url}?retry=${n}` : url;
    };
    attempt(0);
  });
}

/** Начинает загрузку наборов тайлов всех карт сразу при запуске игры, до начала партии */
export function preloadTilesets() {
  for (const name of new Set(Object.values(TILESETS))) void loadTileset(name);
}

export function loadTileset(name: string): Promise<Tileset | null> {
  let p = sets.get(name);
  if (!p) {
    const base = new URL(`tiles/${name}/`, document.baseURI);
    p = Promise.all(
      NAMES.map(
        (n) =>
          new Promise<[TileName, HTMLImageElement] | null>((resolve) => {
            loadImage(new URL(`${n}.jpg`, base).href).then((img) => resolve(img ? [n, img] : null));
          })
      )
    ).then(async (r) => {
      if (!r.every(Boolean)) {
        sets.delete(name); // не вышло — следующий запуск уровня попробует снова
        return null;
      }
      const set: Tileset = new Map(r as [TileName, HTMLImageElement][]);
      // Декор необязателен: не загрузился — поле просто без него
      await Promise.all(
        DECOR.map(
          ([n]) =>
            loadImage(new URL(`decor/${n}.png`, base).href).then((img) => {
              if (img) set.set(`decor/${n}`, img);
            })
        )
      );
      return set;
    });
    sets.set(name, p);
  }
  return p;
}

/** Стороны, куда идёт дорога из каждой клетки: по шагам путей, наружу у входа, к замку у последней клетки */
function connections(paths: Point[][], castle: Point[], cols: number, rows: number): Map<string, number> {
  const bit = (dx: number, dy: number) => (dx === -1 ? L : dx === 1 ? R : dy === -1 ? U : D);
  const m = new Map<string, number>();
  const add = (c: Point, b: number) => m.set(`${c.x},${c.y}`, (m.get(`${c.x},${c.y}`) ?? 0) | b);
  for (const path of paths) {
    for (let i = 0; i < path.length; i++) {
      const c = path[i];
      if (i > 0) {
        const p = path[i - 1];
        add(c, bit(p.x - c.x, p.y - c.y));
        add(p, bit(c.x - p.x, c.y - p.y));
      }
    }
    const first = path[0];
    if (first.x === 0) add(first, L);
    else if (first.y === 0) add(first, U);
    else if (first.x === cols - 1) add(first, R);
    else if (first.y === rows - 1) add(first, D);
    const last = path[path.length - 1];
    for (const cc of castle) {
      const dx = cc.x - last.x;
      const dy = cc.y - last.y;
      if (Math.abs(dx) + Math.abs(dy) === 1) {
        add(last, bit(dx, dy));
        add(cc, bit(-dx, -dy)); // клетка артефакта: тупик, дорога входит в неё
      }
    }
  }
  return m;
}

function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Запекает всё поле в холст (res px на клетку) */
export function bakeField(
  tiles: Tileset,
  paths: Point[][],
  castle: Point[],
  cols: number,
  rows: number,
  res = 128
): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cols * res;
  cv.height = rows * res;
  const ctx = cv.getContext('2d')!;
  const conn = connections(paths, castle, cols, rows);
  const castleSet = new Set(castle.map((c) => `${c.x},${c.y}`));
  const grass = tiles.get('grass')!;
  const gs = grass.naturalWidth;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const key = `${x},${y}`;
      const dx = x * res;
      const dy = y * res;
      const mask = conn.get(key) ?? 0;
      if (castleSet.has(key) && !mask) {
        ctx.drawImage(tiles.get('dirt')!, 0, 0, gs, gs, dx, dy, res, res);
      } else if (!mask) {
        // Трава: случайный кусок и поворот, чтобы узор не повторялся
        const sz = gs * 0.6;
        const sx = hash(x, y) * (gs - sz);
        const sy = hash(y + 91, x + 17) * (gs - sz);
        ctx.save();
        ctx.translate(dx + res / 2, dy + res / 2);
        ctx.rotate((Math.floor(hash(x + 5, y + 3) * 4) * Math.PI) / 2);
        ctx.drawImage(grass, sx, sy, sz, sz, -res / 2, -res / 2, res, res);
        ctx.restore();
        // Мелкий декор в одном из углов клетки
        const decor = DECOR.filter(([n]) => tiles.has(`decor/${n}`));
        if (decor.length && hash(x + 31, y + 7) < DECOR_SHARE) {
          const [dn, wf] = decor[Math.floor(hash(x + 11, y + 53) * decor.length)];
          const img = tiles.get(`decor/${dn}`)!;
          const w = wf * 1.5 * res;
          const h = (w * img.naturalHeight) / img.naturalWidth;
          const cxn = hash(x + 3, y + 29) < 0.5 ? 0.24 : 0.76;
          const cyn = hash(x + 41, y + 13) < 0.5 ? 0.3 : 0.74;
          ctx.drawImage(img, dx + cxn * res - w / 2, dy + cyn * res - h / 2, w, h);
        }
      } else {
        let name: TileName = 'end';
        let m = mask;
        const n = [L, R, U, D].filter((b) => mask & b).length;
        if (n === 4) name = 'cross';
        else if (n === 3) name = 't';
        else if (n === 2) name = mask === (L | R) || mask === (U | D) ? 'straight' : 'corner';
        let rot = 0;
        const base = BASE[name];
        for (m = base; rot < 4 && m !== mask; rot++) m = rotateMask(m);
        ctx.save();
        ctx.translate(dx + res / 2, dy + res / 2);
        ctx.rotate((rot * Math.PI) / 2);
        ctx.drawImage(tiles.get(name)!, -res / 2, -res / 2, res, res);
        ctx.restore();
      }
    }
  }
  return cv;
}
