/**
 * Генератор карт (roadmap п. 2, Артур 2026-11-01): случайная дорога по тем же правилам, что и у пяти карт
 * в maps.ts (поле 14×8, артефакт (7, 4), путь ≥ 26, дорога ≤ 56 клеток, повороты 90°, входы на краю,
 * участки дороги не соприкасаются, верхний левый угол под кнопками). Карта зависит только от уровня
 * (число входов = уровень + 1, биом, тайлы) и зерна, поэтому одно зерно всегда даёт одну и ту же карту.
 *
 * Строится ствол — путь от края поля до клетки у артефакта, — затем ветки: каждая идёт от своего входа
 * до первой встречной клетки дороги и дальше по уже проложенному пути. Готовую карту проверяет validateMap;
 * неудачная попытка просто повторяется со следующим зерном.
 */
import {
  CASTLE,
  GRID_COLS,
  GRID_ROWS,
  MAX_ROAD_CELLS,
  MIN_PATH_LENGTH,
  MapDef,
  MAPS,
  Point,
  isHudCell,
  validateMap,
} from './maps';

/** Сколько клеток дороги допускаем у случайной карты: как у пяти готовых карт (38–48), с небольшим запасом */
export const GEN_MIN_ROAD = 36;
export const GEN_MAX_ROAD = 54;
/** Входы не ближе этого друг к другу (по клеткам, без диагоналей); шести входам на краю тесно — им 2, иначе поиск в разы дольше */
const entranceGap = (want: number) => (want >= 6 ? 2 : 3);
/** После поворота дорога идёт прямо хотя бы столько шагов: без «лесенок» */
const MIN_RUN = 2;
/** Сколько шагов поиска даём одной ветке */
const BRANCH_STEPS = 400;

const DIRS: Point[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/** Простой генератор случайных чисел с зерном (mulberry32) */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const key = (p: Point) => `${p.x},${p.y}`;
const inField = (p: Point) => p.x >= 0 && p.y >= 0 && p.x < GRID_COLS && p.y < GRID_ROWS;
const onEdge = (p: Point) => p.x === 0 || p.y === 0 || p.x === GRID_COLS - 1 || p.y === GRID_ROWS - 1;
const isCorner = (p: Point) => (p.x === 0 || p.x === GRID_COLS - 1) && (p.y === 0 || p.y === GRID_ROWS - 1);
const isCastle = (p: Point) => p.x === CASTLE.x && p.y === CASTLE.y;
const nextToCastle = (p: Point) => Math.abs(p.x - CASTLE.x) + Math.abs(p.y - CASTLE.y) === 1;
const around = (p: Point) => DIRS.map((d) => ({ x: p.x + d.x, y: p.y + d.y }));

/** Можно ли вообще класть дорогу в клетку */
const buildable = (p: Point) => inField(p) && !isHudCell(p.x, p.y) && !isCastle(p);

interface Walk {
  cells: Point[];
  /** Последний шаг ветки упирается в эту клетку уже проложенной дороги (у ствола — нет) */
  joins: Point | null;
}

/**
 * Случайная прогулка с возвратом (поиск в глубину) от `start`.
 * `road` — уже проложенная дорога, к которой нельзя прикасаться (кроме места слияния у веток).
 * `done(cells)` — подходит ли путь, чтобы остановиться; для веток остановка — слияние с дорогой.
 */
function walk(
  start: Point,
  road: Set<string>,
  rand: () => number,
  maxLen: number,
  done: (cells: Point[]) => boolean,
  canJoin: ((cell: Point, target: Point, cells: Point[]) => boolean) | null,
  budget: { steps: number }
): Walk | null {
  const cells: Point[] = [start];
  const mine = new Set<string>([key(start)]);

  // Касается ли клетка чужой дороги или своих клеток, кроме `prev`
  const touches = (c: Point, prev: Point) =>
    around(c).some((n) => (n.x !== prev.x || n.y !== prev.y) && (mine.has(key(n)) || road.has(key(n))));

  const rec = (dir: Point | null, run: number): Walk | null => {
    if (--budget.steps < 0) return null;
    const cur = cells[cells.length - 1];
    if (!canJoin && done(cells)) return { cells: cells.slice(), joins: null };
    if (cells.length >= maxLen) return null;
    // Направления: прямо чаще, поворот — только после MIN_RUN шагов прямо
    const opts = DIRS.filter((d) => !dir || !(d.x === -dir.x && d.y === -dir.y))
      .filter((d) => !dir || (d.x === dir.x && d.y === dir.y) || run >= MIN_RUN)
      .map((d) => ({ d, w: rand() * (dir && d.x === dir.x && d.y === dir.y ? 2.2 : 1) }))
      .sort((a, b) => b.w - a.w);
    for (const { d } of opts) {
      const n = { x: cur.x + d.x, y: cur.y + d.y };
      if (!buildable(n) || mine.has(key(n)) || road.has(key(n))) continue;
      if (nextToCastle(n)) continue; // к артефакту подходит только конец ствола
      if (canJoin) {
        // Ветка: клетка, касающаяся ровно одной клетки дороги, — место слияния
        const hits = around(n).filter((m) => road.has(key(m)));
        const selfHits = around(n).filter((m) => (m.x !== cur.x || m.y !== cur.y) && mine.has(key(m)));
        if (selfHits.length) continue;
        if (hits.length > 1) continue;
        if (hits.length === 1) {
          cells.push(n);
          if (canJoin(n, hits[0], cells)) return { cells: cells.slice(), joins: hits[0] };
          cells.pop();
          continue;
        }
      } else if (touches(n, cur)) continue;
      cells.push(n);
      mine.add(key(n));
      const same = dir && d.x === dir.x && d.y === dir.y;
      const r = rec(d, same ? run + 1 : 1);
      if (r) return r;
      cells.pop();
      mine.delete(key(n));
    }
    return null;
  };
  return rec(null, MIN_RUN);
}

/** Вход не в углу и не ближе `gap` к другим входам */
const entranceOk = (p: Point, entrances: Point[], gap = 3) =>
  onEdge(p) && !isCorner(p) && entrances.every((e) => Math.abs(e.x - p.x) + Math.abs(e.y - p.y) >= gap);

/** Ветки к стволу: каждая от своего входа до первой встречной клетки дороги */
function branches(
  trunk: Point[],
  want: number,
  rand: () => number,
  budget: { steps: number }
): { paths: Point[][]; entrances: Point[]; roadSize: number } | null {
  const road = new Set(trunk.map(key));
  const next = new Map<string, Point | null>();
  trunk.forEach((c, i) => next.set(key(c), trunk[i + 1] ?? null));
  const paths: Point[][] = [trunk];
  const entrances: Point[] = [trunk[0]];

  // Путь от клетки дороги до артефакта
  const route = (from: Point): Point[] => {
    const out: Point[] = [];
    for (let c: Point | null = from; c; c = next.get(key(c)) ?? null) out.push(c);
    return out;
  };

  // Кандидаты во входы веток: свободные клетки края в случайном порядке
  const edge: Point[] = [];
  for (let x = 0; x < GRID_COLS; x++)
    for (let y = 0; y < GRID_ROWS; y++) {
      const p = { x, y };
      if (onEdge(p) && !isCorner(p) && buildable(p)) edge.push(p);
    }
  for (let i = edge.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [edge[i], edge[j]] = [edge[j], edge[i]];
  }

  for (const s of edge) {
    if (paths.length >= want) break;
    if (road.has(key(s)) || !entranceOk(s, entrances, entranceGap(want))) continue;
    if (around(s).some((n) => road.has(key(n)))) continue;
    const room = GEN_MAX_ROAD - road.size;
    if (room < 2) break;
    const b = walk(
      s,
      road,
      rand,
      Math.min(room, 14),
      () => false,
      (_cell, target, cells) =>
        cells.length >= 2 &&
        !entrances.some((e) => e.x === target.x && e.y === target.y) && // не вливаться во вход другого пути
        cells.length + route(target).length >= MIN_PATH_LENGTH,
      { steps: BRANCH_STEPS } // свой запас шагов: безнадёжный вход бросаем быстро
    );
    if (!b || !b.joins) continue;
    const full = [...b.cells, ...route(b.joins)];
    b.cells.forEach((c, i) => {
      road.add(key(c));
      next.set(key(c), b.cells[i + 1] ?? b.joins);
    });
    paths.push(full);
    entrances.push(s);
  }
  return paths.length === want ? { paths, entrances, roadSize: road.size } : null;
}

/** Одна попытка построить карту; null — не вышло (тогда пробуем следующее зерно) */
function attempt(level: number, rand: () => number): MapDef | null {
  const want = level + 1;
  const budget = { steps: 20000 };

  // Ствол строим от артефакта к краю, потом разворачиваем
  const ends = around(CASTLE).filter(buildable);
  const end = ends[Math.floor(rand() * ends.length)];
  // Длина ствола: чем больше веток, тем короче, чтобы всё влезло в лимит дороги
  const trunkMin = MIN_PATH_LENGTH + (want > 4 ? 0 : want > 3 ? 2 : 4);
  const trunkMax = Math.max(trunkMin + 2, Math.min(44, GEN_MAX_ROAD - 3 * (want - 1)));
  const target = trunkMin + Math.floor(rand() * (trunkMax - trunkMin + 1));
  const trunkWalk = walk(
    end,
    new Set(),
    rand,
    target + 6,
    (cells) => cells.length >= target && entranceOk(cells[cells.length - 1], []),
    null,
    budget
  );
  if (!trunkWalk) return null;
  const trunk = trunkWalk.cells.slice().reverse();

  // Ветки прокладываются жадно; если входов не хватило, пробуем другой порядок у того же ствола
  for (let tryNo = 0; tryNo < 6; tryNo++) {
    const res = branches(trunk, want, rand, budget);
    if (res) return finish(level, res.paths, res.entrances, res.roadSize);
  }
  return null;
}

function finish(level: number, paths: Point[][], entrances: Point[], roadSize: number): MapDef | null {
  if (roadSize < GEN_MIN_ROAD || roadSize > Math.min(GEN_MAX_ROAD, MAX_ROAD_CELLS)) return null;

  const map: MapDef = { level, name: MAPS[level - 1].name, entrances, paths };
  return validateMap(map).valid ? map : null;
}

/**
 * Случайная карта уровня `level` (1–5: число входов, биом, тайлы и числа уровня) по зерну `seed`.
 * Одно и то же зерно — одна и та же карта. Если ни одна попытка не удалась, возвращает готовую карту уровня.
 */
export function generateMap(level: number, seed: number): MapDef {
  const lvl = Math.max(1, Math.min(MAPS.length, Math.floor(level)));
  for (let i = 0; i < 400; i++) {
    const m = attempt(lvl, rng((seed >>> 0) * 7919 + i * 104729 + lvl));
    if (m) return m;
  }
  return MAPS[lvl - 1];
}

/** Новое случайное зерно карты */
export function newMapSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff) + 1;
}
