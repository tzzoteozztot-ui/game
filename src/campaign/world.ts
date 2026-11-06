/**
 * Поход по глобальной карте кампании (просьба Артура 2026-11-06, вариант В — регионы из гексов).
 * Чистая логика без React и холста: регион, туман, ход героя по дням, объекты, ресурсы.
 * Гексы «остриём вверх», нечётные ряды сдвинуты на полклетки вправо (как поле боя в grid.ts).
 * Числа (волны отрядов, награды, доход промыслов) — черновик прототипа, меняются по слову Артура.
 */

export type Terrain = 'grass' | 'road' | 'forest' | 'hills' | 'water' | 'rock' | 'wood';
export type ResKey = 'gold' | 'wood' | 'crystal';
export type Resources = Record<ResKey, number>;

export const RES_NAMES: Record<ResKey, string> = { gold: 'Золото', wood: 'Дерево и камень', crystal: 'Кристаллы' };
export const RES_ICONS: Record<ResKey, string> = { gold: '🪙', wood: '🪵', crystal: '💎' };

/** Сколько очков хода стоит войти в гекс; null — непроходимо. Дорога вдвое быстрее леса */
export const TERRAIN_COST: Record<Terrain, number | null> = { road: 2, grass: 3, forest: 4, hills: 4, water: null, rock: null, wood: null };
export const TERRAIN_NAMES: Record<Terrain, string> = { road: 'Дорога', grass: 'Луг', forest: 'Лес', hills: 'Холмы', water: 'Вода', rock: 'Горы', wood: 'Чаща' };
const TERRAIN_CHARS: Record<string, Terrain> = { '.': 'grass', '=': 'road', f: 'forest', h: 'hills', w: 'water', r: 'rock', d: 'wood' };

export const MOVES_PER_DAY = 30; // ≈ 15 гексов по дороге, 10 по лугу
export const SIGHT = 4; // радиус обзора героя, гексов

export type WorldObjKind = 'camp' | 'squad' | 'fortress' | 'chest' | 'mine' | 'shrine';

/** Украшения карты без действия: мельница, руины, могилы, костры… (только отрисовка) */
export type PropKind = 'windmill' | 'ruins' | 'graves' | 'orcCamp' | 'stones' | 'farm' | 'wreck'
  // крупные, в непроходимой местности
  | 'castle' | 'cliff' | 'tower' | 'crystals' | 'deadwood' | 'statue';
export interface WorldProp {
  kind: PropKind;
  x: number;
  y: number;
}

export interface WorldObj {
  id: string;
  kind: WorldObjKind;
  x: number;
  y: number;
  name: string;
  /** Отряд, крепость, охрана промысла: бой из первых N волн уровня (крепость — 12, с боссом) */
  waves?: number;
  /** Награда за победу, сундук, святилище */
  reward?: Partial<Resources>;
  /** Промысел: что и сколько даёт каждый новый день */
  income?: Partial<Resources>;
  /** Бой с армией, как в Потасовке: враги за золото уходят на поле врага, победа — когда падёт его артефакт. Сила бота врага */
  army?: 'easy' | 'normal' | 'hard';
  /** Строка хрониста при встрече */
  text?: string;
}

export interface RegionDef {
  id: string;
  name: string;
  level: number; // биом и враги: номер карты кампании (1 — Пограничье, орки)
  terrain: string[]; // ряды символов: . трава, = дорога, f лес, h холмы, w вода, r горы, d чаща
  start: { x: number; y: number };
  objects: WorldObj[];
  props?: WorldProp[];
}

export interface WorldState {
  v: 3;
  region: string;
  hero: { x: number; y: number };
  day: number;
  moves: number;
  res: Resources;
  done: string[]; // разбитые отряды, открытые сундуки, посещённые святилища
  owned: string[]; // захваченные промыслы
  seen: number[]; // открытые туманом гексы: y * ширина + x
  won: boolean; // крепость взята
  camp: Record<string, number>; // уровни пассивок лагеря: id усиления → 1..CAMP_MAX_LEVEL
}

// -------------------------------------------------------------
// Пограничье (карта 1, орки) — первый регион прототипа. Просьба Артура 2026-11-06: карта больше, а ходить
// можно меньше — как в Героях: дороги и поляны вокруг объектов, всё остальное непроходимо (горы, чаща,
// озёра) и заполнено крупными украшениями (руины замков, башни, скалы, кристаллы). Местность строится по
// зерну — одна и та же каждый раз; река с двумя переправами (брод и мост под охраной отрядов).
// -------------------------------------------------------------
const FW = 52;
const FH = 32;

function mulberry(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Гладкий шум 0..1 по сетке узлов шага `step` */
function valueNoise(seed: number, step: number) {
  const r = mulberry(seed);
  const gw = Math.ceil(FW / step) + 2;
  const gh = Math.ceil(FH / step) + 2;
  const g = Array.from({ length: gw * gh }, () => r());
  const sm = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const fx = x / step;
    const fy = y / step;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = sm(fx - ix);
    const ty = sm(fy - iy);
    const v = (i: number, j: number) => g[j * gw + i];
    const a = v(ix, iy) * (1 - tx) + v(ix + 1, iy) * tx;
    const b = v(ix, iy + 1) * (1 - tx) + v(ix + 1, iy + 1) * tx;
    return a * (1 - ty) + b * ty;
  };
}

/** Ось реки: по одному x на ряд, течёт с севера на юг */
export const riverX = (y: number) => Math.round(26 + 2 * Math.sin(y / 4.2));

function hexLine(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number }[] {
  const n = hexDistance(a, b);
  const A = toCube(a.x, a.y);
  const B = toCube(b.x, b.y);
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const t = n ? i / n : 0;
    const q = A.q + (B.q - A.q) * t + 1e-6;
    const r = A.r + (B.r - A.r) * t + 1e-6;
    const s = -q - r;
    let rq = Math.round(q);
    let rr = Math.round(r);
    const rs = Math.round(s);
    const dq = Math.abs(rq - q);
    const dr = Math.abs(rr - r);
    const ds = Math.abs(rs - s);
    if (dq > dr && dq > ds) rq = -rr - rs;
    else if (!(dr > ds)) rr = -rq - rs;
    out.push({ x: rq + (rr - (rr & 1)) / 2, y: rr });
  }
  return out;
}

const FORD = { x: riverX(10), y: 10 };
const BRIDGE = { x: riverX(23), y: 23 };

const FRONTIER_OBJECTS: WorldObj[] = [
  { id: 'camp', kind: 'camp', x: 5, y: 16, name: 'Лагерь экспедиции', text: 'Здесь встанут кузня, казна и стены. Пока лагерь только разбит.' },
  // Западный берег: слабые отряды, обучение
  { id: 'sq1', kind: 'squad', x: 10, y: 14, name: 'Разведка орков', waves: 3, reward: { gold: 40 }, text: 'Несколько разведчиков рода. Слабые, но они нас уже видели.' },
  { id: 'sq2', kind: 'squad', x: 12, y: 20, name: 'Охотники рода', waves: 3, reward: { gold: 40, wood: 10 } },
  { id: 'sq3', kind: 'squad', x: 16, y: 9, name: 'Дозор рода', waves: 4, reward: { gold: 50, crystal: 1 } },
  { id: 'chest1', kind: 'chest', x: 8, y: 10, name: 'Брошенный обоз', reward: { gold: 50 } },
  { id: 'chest2', kind: 'chest', x: 4, y: 22, name: 'Сложенный лес', reward: { wood: 20 } },
  { id: 'chest3', kind: 'chest', x: 14, y: 4, name: 'Тайник контрабандистов', reward: { gold: 60 } },
  { id: 'chest4', kind: 'chest', x: 17, y: 27, name: 'Разбитая телега', reward: { gold: 30, crystal: 1 } },
  { id: 'quarry', kind: 'mine', x: 6, y: 6, name: 'Каменоломня', waves: 3, income: { wood: 4 }, text: 'Старая каменоломня, орки держат здесь пост.' },
  { id: 'saw', kind: 'mine', x: 8, y: 26, name: 'Лесопилка', waves: 3, income: { wood: 5 }, text: 'Орки рубят здесь лес. Отобьём — будет дерево каждый день.' },
  { id: 'shrine', kind: 'shrine', x: 19, y: 16, name: 'Камень предков', reward: { crystal: 2 }, text: 'Орки приносят сюда дары. Камень звенит так же, как наш узел.' },
  {
    id: 'warcamp', kind: 'squad', x: 21, y: 3, name: 'Военный лагерь рода', waves: 6, army: 'easy', reward: { gold: 250, wood: 30, crystal: 4 },
    text: 'Здесь орки собирают силы для набега. Бой не обязателен, но лагерь богат.',
  },
  // Переправы
  { id: 'ford', kind: 'squad', x: FORD.x, y: FORD.y, name: 'Застава у брода', waves: 5, reward: { gold: 70 }, text: 'Брод через реку держат воины рода. Другого пути на тот берег почти нет.' },
  { id: 'bridge', kind: 'squad', x: BRIDGE.x, y: BRIDGE.y, name: 'Засада у моста', waves: 5, reward: { gold: 60, wood: 10 } },
  // Восточный берег
  { id: 'goldmine', kind: 'mine', x: 31, y: 4, name: 'Рудник', waves: 5, income: { gold: 20 } },
  { id: 'node', kind: 'mine', x: 38, y: 28, name: 'Малый узел', waves: 6, income: { crystal: 1 }, text: 'Осколок той же сети, что наш артефакт. Орки охраняют его, как святыню.' },
  { id: 'sq4', kind: 'squad', x: 33, y: 13, name: 'Боевой отряд', waves: 6, reward: { gold: 80, crystal: 1 } },
  { id: 'sq5', kind: 'squad', x: 33, y: 22, name: 'Стая гончих', waves: 6, reward: { gold: 80 } },
  { id: 'sq6', kind: 'squad', x: 40, y: 8, name: 'Шаманы ущелья', waves: 7, reward: { gold: 90, crystal: 2 } },
  { id: 'sq7', kind: 'squad', x: 41, y: 22, name: 'Всадники на волках', waves: 7, reward: { gold: 90 } },
  { id: 'guard', kind: 'squad', x: 42, y: 15, name: 'Стража Вождя', waves: 8, reward: { gold: 120, crystal: 2 } },
  {
    id: 'stavka', kind: 'squad', x: 48, y: 6, name: 'Ставка вожака', waves: 8, army: 'easy', reward: { gold: 300, crystal: 6 },
    text: 'Шатры вожака, что водит набеги на юг. Можно обойти, можно разорить.',
  },
  { id: 'chest5', kind: 'chest', x: 35, y: 7, name: 'Сундук наёмника', reward: { gold: 80 } },
  { id: 'chest6', kind: 'chest', x: 30, y: 18, name: 'Запас брёвен', reward: { wood: 20 } },
  { id: 'chest7', kind: 'chest', x: 45, y: 3, name: 'Добыча набега', reward: { gold: 100 } },
  { id: 'chest8', kind: 'chest', x: 45, y: 28, name: 'Тайник шамана', reward: { crystal: 2 } },
  { id: 'shrine2', kind: 'shrine', x: 48, y: 22, name: 'Старый идол', reward: { crystal: 3 }, text: 'Идол старше орков. На его камне — те же знаки, что на нашем узле.' },
  {
    id: 'fortress', kind: 'fortress', x: 47, y: 15, name: 'Крепость Вождя', waves: 12, army: 'normal', reward: { gold: 200, crystal: 5 },
    text: 'Вождь Ургаш ждёт за частоколом. Это последний бой главы.',
  },
];

/** Дороги: цепочки точек, между ними — прямые по гексам */
const FRONTIER_ROADS: { x: number; y: number }[][] = [
  [{ x: 5, y: 16 }, { x: 10, y: 14 }, { x: 16, y: 9 }, FORD, { x: 30, y: 10 }, { x: 33, y: 13 }, { x: 42, y: 15 }, { x: 47, y: 15 }],
  [{ x: 5, y: 16 }, { x: 12, y: 20 }, { x: 18, y: 23 }, BRIDGE, { x: 33, y: 22 }, { x: 41, y: 22 }, { x: 42, y: 15 }],
  [{ x: 10, y: 14 }, { x: 8, y: 10 }, { x: 6, y: 6 }],
  [{ x: 12, y: 20 }, { x: 8, y: 26 }],
  [{ x: 5, y: 16 }, { x: 4, y: 22 }],
  [{ x: 12, y: 20 }, { x: 19, y: 16 }],
  [{ x: 18, y: 23 }, { x: 17, y: 27 }],
  [{ x: 16, y: 9 }, { x: 14, y: 4 }, { x: 21, y: 3 }],
  [{ x: 30, y: 10 }, { x: 35, y: 7 }, { x: 31, y: 4 }],
  [{ x: 35, y: 7 }, { x: 40, y: 8 }, { x: 45, y: 3 }],
  [{ x: 40, y: 8 }, { x: 48, y: 6 }],
  [{ x: 33, y: 13 }, { x: 30, y: 18 }, { x: 33, y: 22 }],
  [{ x: 33, y: 22 }, { x: 38, y: 28 }, { x: 45, y: 28 }],
  [{ x: 41, y: 22 }, { x: 48, y: 22 }],
];

/** Украшения на полянах (у дорог) — мельница, хутора, костры */
const FRONTIER_PROPS: WorldProp[] = [
  { kind: 'windmill', x: 3, y: 14 },
  { kind: 'farm', x: 7, y: 18 },
  { kind: 'stones', x: 13, y: 15 },
  { kind: 'wreck', x: 21, y: 22 },
  { kind: 'graves', x: 36, y: 25 },
  { kind: 'orcCamp', x: 45, y: 13 },
  { kind: 'orcCamp', x: 46, y: 18 },
  { kind: 'ruins', x: 37, y: 9 },
];

/** Крупные украшения в непроходимой местности: занимают гекс и соседей (`BIG_PROPS` — радиус 1) */
const BIG_PROPS: PropKind[] = ['castle', 'cliff'];
const WILD_KINDS: PropKind[] = ['castle', 'cliff', 'tower', 'crystals', 'deadwood', 'statue', 'cliff', 'tower', 'castle', 'deadwood'];

function buildFrontier(): { terrain: string[]; props: WorldProp[] } {
  const g: string[][] = Array.from({ length: FH }, () => Array(FW).fill(''));
  const inside = (x: number, y: number) => x > 0 && y > 0 && x < FW - 1 && y < FH - 1;
  const isRiver = (x: number, y: number) => {
    const rx = riverX(y);
    return x === rx || x === rx + 1 || (y > 0 && riverX(y - 1) !== rx && x === Math.min(rx, riverX(y - 1)) + 1);
  };
  // 1. Дороги
  for (const chain of FRONTIER_ROADS)
    for (let i = 0; i + 1 < chain.length; i++) for (const p of hexLine(chain[i], chain[i + 1])) if (inside(p.x, p.y)) g[p.y][p.x] = '=';
  // 2. Обочины: дорога шириной в 1–3 гекса (по шуму), поляны вокруг объектов
  const wide = valueNoise(51, 3);
  for (let y = 0; y < FH; y++)
    for (let x = 0; x < FW; x++) {
      if (g[y][x] !== '=') continue;
      for (const n of hexNeighbours(x, y)) if (inside(n.x, n.y) && !g[n.y][n.x] && !isRiver(n.x, n.y) && wide(n.x, n.y) > 0.42) g[n.y][n.x] = '.';
    }
  for (const o of FRONTIER_OBJECTS) {
    const rad = o.kind === 'camp' || o.kind === 'fortress' ? 2 : 1;
    for (let y = o.y - rad; y <= o.y + rad; y++)
      for (let x = o.x - rad - 1; x <= o.x + rad + 1; x++)
        if (inside(x, y) && !g[y][x] && !isRiver(x, y) && hexDistance(o, { x, y }) <= rad) g[y][x] = '.';
    if (g[o.y][o.x] !== '=') g[o.y][o.x] = '.';
  }
  for (const p of FRONTIER_PROPS) if (!g[p.y][p.x]) g[p.y][p.x] = '.';
  // 3. Всё прочее непроходимо: река, озёра, горы, чаща
  const mtn = valueNoise(23, 5);
  const lake = valueNoise(77, 4);
  for (let y = 0; y < FH; y++)
    for (let x = 0; x < FW; x++) {
      if (g[y][x]) continue;
      if (isRiver(x, y)) g[y][x] = 'w';
      else if (!inside(x, y)) g[y][x] = 'r';
      else if (lake(x, y) > 0.8) g[y][x] = 'w';
      else g[y][x] = mtn(x, y) > 0.5 ? 'r' : 'd';
    }
  // 4. Проходимое разнообразим: лес и холмы (дороже по ходу)
  const forest = valueNoise(11, 4);
  const hills = valueNoise(31, 5);
  const busy = new Set([...FRONTIER_OBJECTS, ...FRONTIER_PROPS].map((o) => `${o.x},${o.y}`));
  for (let y = 0; y < FH; y++)
    for (let x = 0; x < FW; x++) {
      if (g[y][x] !== '.' || busy.has(`${x},${y}`)) continue;
      if (forest(x, y) > 0.66) g[y][x] = 'f';
      else if (hills(x, y) > 0.68) g[y][x] = 'h';
    }
  // 4б. Переправы: на тот берег — только через гекс отряда у брода или моста. Гексы берега, через которые
  // дорога в реке обходит отряд, зарастают чащей
  const crossing = new Set([`${FORD.x},${FORD.y}`, `${BRIDGE.x},${BRIDGE.y}`]);
  const walkable = (x: number, y: number) => '.=fh'.includes(g[y]?.[x] ?? 'r');
  for (let guard = 0; guard < 20; guard++) {
    const seen = new Set<string>();
    const start = FRONTIER_OBJECTS[0];
    const queue = [{ x: start.x, y: start.y }];
    seen.add(`${start.x},${start.y}`);
    let leak: { x: number; y: number } | null = null;
    while (queue.length && !leak) {
      const c = queue.shift()!;
      for (const n of hexNeighbours(c.x, c.y)) {
        const k = `${n.x},${n.y}`;
        if (seen.has(k) || crossing.has(k) || !walkable(n.x, n.y)) continue;
        if (isRiver(n.x, n.y)) {
          leak = c;
          break;
        }
        seen.add(k);
        queue.push(n);
      }
    }
    if (!leak) break;
    if (g[leak.y][leak.x] === '=') throw new Error(`Пограничье: дорога обходит переправу у ${leak.x},${leak.y}`);
    g[leak.y][leak.x] = 'd';
  }
  // 5. Крупные украшения: в глуши, но в 2–3 гексах от проходимого, чтобы их было видно с дороги
  const passable = (x: number, y: number) => '.=fh'.includes(g[y]?.[x] ?? 'r');
  const near = (x: number, y: number, d: number) => {
    for (let j = y - d; j <= y + d; j++) for (let i = x - d - 1; i <= x + d + 1; i++) if (passable(i, j) && hexDistance({ x, y }, { x: i, y: j }) <= d) return true;
    return false;
  };
  const rnd = mulberry(97);
  const props: WorldProp[] = [];
  const cand: { x: number; y: number }[] = [];
  for (let y = 2; y < FH - 2; y++)
    for (let x = 2; x < FW - 2; x++) {
      const solid = [{ x, y }, ...hexNeighbours(x, y)].every((p) => g[p.y][p.x] === 'r' || g[p.y][p.x] === 'd');
      if (solid && !near(x, y, 1) && near(x, y, 3)) cand.push({ x, y });
    }
  for (let i = cand.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [cand[i], cand[j]] = [cand[j], cand[i]];
  }
  for (const c of cand) {
    if (props.some((p) => hexDistance(p, c) < 5)) continue;
    props.push({ kind: WILD_KINDS[props.length % WILD_KINDS.length], x: c.x, y: c.y });
  }
  return { terrain: g.map((row) => row.join('')), props: [...FRONTIER_PROPS, ...props] };
}

const FRONTIER_BUILT = buildFrontier();

export const FRONTIER: RegionDef = {
  id: 'frontier',
  name: 'Пограничье',
  level: 1,
  terrain: FRONTIER_BUILT.terrain,
  start: { x: 6, y: 16 },
  objects: FRONTIER_OBJECTS,
  props: FRONTIER_BUILT.props,
};

/** Гекс занят крупным украшением (само украшение и, для замка и скалы, соседи) — там не рисуются деревья и горы */
export function bigPropHexes(r: RegionDef): Set<string> {
  const out = new Set<string>();
  for (const p of r.props ?? []) {
    if (!WILD.includes(p.kind)) continue;
    out.add(`${p.x},${p.y}`);
    if (BIG_PROPS.includes(p.kind)) for (const n of hexNeighbours(p.x, p.y)) out.add(`${n.x},${n.y}`);
  }
  return out;
}
const WILD: PropKind[] = ['castle', 'cliff', 'tower', 'crystals', 'deadwood', 'statue'];

export const REGIONS: Record<string, RegionDef> = { frontier: FRONTIER };

// -------------------------------------------------------------
// Геометрия гексов (odd-r)
// -------------------------------------------------------------
export const regionW = (r: RegionDef) => r.terrain[0].length;
export const regionH = (r: RegionDef) => r.terrain.length;

export function terrainAt(r: RegionDef, x: number, y: number): Terrain | null {
  if (y < 0 || y >= regionH(r) || x < 0 || x >= regionW(r)) return null;
  return TERRAIN_CHARS[r.terrain[y][x]] ?? 'grass';
}

export function hexNeighbours(x: number, y: number): { x: number; y: number }[] {
  const odd = y & 1;
  return [
    { x: x + 1, y },
    { x: x - 1, y },
    { x: x - 1 + odd, y: y - 1 },
    { x: x + odd, y: y - 1 },
    { x: x - 1 + odd, y: y + 1 },
    { x: x + odd, y: y + 1 },
  ];
}

function toCube(x: number, y: number) {
  const q = x - (y - (y & 1)) / 2;
  return { q, r: y, s: -q - y };
}

export function hexDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const A = toCube(a.x, a.y);
  const B = toCube(b.x, b.y);
  return Math.max(Math.abs(A.q - B.q), Math.abs(A.r - B.r), Math.abs(A.s - B.s));
}

// -------------------------------------------------------------
// Состояние похода
// -------------------------------------------------------------
export function newWorld(region: RegionDef = FRONTIER): WorldState {
  const st: WorldState = {
    v: 3,
    region: region.id,
    hero: { ...region.start },
    day: 1,
    moves: MOVES_PER_DAY,
    res: { gold: 0, wood: 0, crystal: 0 },
    done: [],
    owned: [],
    seen: [],
    won: false,
    camp: {},
  };
  reveal(st, region);
  return st;
}

export function reveal(st: WorldState, region: RegionDef) {
  const w = regionW(region);
  const seen = new Set(st.seen);
  for (let y = 0; y < regionH(region); y++)
    for (let x = 0; x < w; x++) if (hexDistance(st.hero, { x, y }) <= SIGHT) seen.add(y * w + x);
  st.seen = [...seen].sort((a, b) => a - b);
}

const seenSets = new WeakMap<number[], Set<number>>();
export function isSeen(st: WorldState, region: RegionDef, x: number, y: number): boolean {
  let set = seenSets.get(st.seen);
  if (!set) seenSets.set(st.seen, (set = new Set(st.seen)));
  return set.has(y * regionW(region) + x);
}

/** Объект в гексе, который ещё что-то значит (разбитые отряды и пустые сундуки исчезают; промыслы и лагерь остаются) */
export function objectAt(st: WorldState, region: RegionDef, x: number, y: number): WorldObj | null {
  const o = region.objects.find((ob) => ob.x === x && ob.y === y);
  if (!o) return null;
  if (st.done.includes(o.id) && (o.kind === 'squad' || o.kind === 'chest' || o.kind === 'fortress')) return null;
  return o;
}

/** Нужен ли бой, чтобы войти в гекс объекта */
export function isHostile(st: WorldState, o: WorldObj): boolean {
  if (o.kind === 'squad' || o.kind === 'fortress') return !st.done.includes(o.id);
  if (o.kind === 'mine') return !!o.waves && !st.owned.includes(o.id);
  return false;
}

/**
 * Кратчайший путь героя до гекса (без самого старта). Сквозь враждебные объекты путь не идёт —
 * только в них самих последним шагом. Неоткрытые туманом гексы считаются травой: что там, герой узнает, дойдя.
 */
export function findPath(st: WorldState, region: RegionDef, to: { x: number; y: number }): { x: number; y: number }[] | null {
  const w = regionW(region);
  const key = (x: number, y: number) => y * w + x;
  const goal = key(to.x, to.y);
  const cost = (x: number, y: number) => {
    if (!isSeen(st, region, x, y)) return terrainAt(region, x, y) === null ? null : 1;
    const t = terrainAt(region, x, y);
    return t ? TERRAIN_COST[t] : null;
  };
  if (cost(to.x, to.y) === null) return null;
  const dist = new Map<number, number>([[key(st.hero.x, st.hero.y), 0]]);
  const prev = new Map<number, number>();
  const open: { k: number; d: number }[] = [{ k: key(st.hero.x, st.hero.y), d: 0 }];
  while (open.length) {
    open.sort((a, b) => a.d - b.d);
    const cur = open.shift()!;
    if (cur.d > (dist.get(cur.k) ?? Infinity)) continue;
    if (cur.k === goal) break;
    const cx = cur.k % w;
    const cy = Math.floor(cur.k / w);
    if (cur.k !== key(st.hero.x, st.hero.y)) {
      const o = objectAt(st, region, cx, cy);
      if (o && isHostile(st, o)) continue; // сквозь врага не пройти
    }
    for (const n of hexNeighbours(cx, cy)) {
      const c = cost(n.x, n.y);
      if (c === null) continue;
      const nk = key(n.x, n.y);
      const nd = cur.d + c;
      if (nd < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, nd);
        prev.set(nk, cur.k);
        open.push({ k: nk, d: nd });
      }
    }
  }
  if (!dist.has(goal) || goal === key(st.hero.x, st.hero.y)) return null;
  const path: { x: number; y: number }[] = [];
  for (let k = goal; k !== key(st.hero.x, st.hero.y); k = prev.get(k)!) path.unshift({ x: k % w, y: Math.floor(k / w) });
  return path;
}

export function stepCost(region: RegionDef, p: { x: number; y: number }): number {
  const t = terrainAt(region, p.x, p.y);
  return (t && TERRAIN_COST[t]) || 1;
}

export function addRes(st: WorldState, r: Partial<Resources> | undefined) {
  if (!r) return;
  for (const k of Object.keys(r) as ResKey[]) st.res[k] += r[k] ?? 0;
}

export function resText(r: Partial<Resources> | undefined): string {
  if (!r) return '';
  return (Object.keys(r) as ResKey[])
    .filter((k) => r[k])
    .map((k) => `${RES_ICONS[k]} ${r[k]}`)
    .join('  ');
}

/** Что случилось, когда герой вошёл в гекс */
export type Arrival =
  | { kind: 'none' }
  | { kind: 'battle'; obj: WorldObj; from: { x: number; y: number } }
  | { kind: 'loot'; obj: WorldObj; got: Partial<Resources> }
  | { kind: 'captured'; obj: WorldObj }
  | { kind: 'visit'; obj: WorldObj };

/**
 * Один шаг героя по пути. Возвращает null, если не хватает очков хода. Шаг во враждебный гекс тратит ход,
 * но герой остаётся на месте до исхода боя (`winBattle` переводит его туда).
 */
export function stepHero(st: WorldState, region: RegionDef, to: { x: number; y: number }): Arrival | null {
  const c = stepCost(region, to);
  if (st.moves < c) return null;
  const o = objectAt(st, region, to.x, to.y);
  st.moves -= c;
  if (o && isHostile(st, o)) return { kind: 'battle', obj: o, from: { ...st.hero } };
  st.hero = { ...to };
  reveal(st, region);
  if (!o) return { kind: 'none' };
  return arrive(st, o);
}

function arrive(st: WorldState, o: WorldObj): Arrival {
  if (o.kind === 'chest' || o.kind === 'shrine') {
    if (st.done.includes(o.id)) return { kind: 'visit', obj: o };
    st.done.push(o.id);
    addRes(st, o.reward);
    return { kind: 'loot', obj: o, got: o.reward ?? {} };
  }
  if (o.kind === 'mine' && !st.owned.includes(o.id)) {
    st.owned.push(o.id);
    return { kind: 'captured', obj: o };
  }
  return { kind: 'visit', obj: o };
}

/** Победа в бою: объект разбит (промысел — захвачен), награда, герой входит в гекс */
export function winBattle(st: WorldState, region: RegionDef, objId: string): Arrival {
  const o = region.objects.find((ob) => ob.id === objId);
  if (!o) return { kind: 'none' };
  if (o.kind === 'mine') {
    if (!st.owned.includes(o.id)) st.owned.push(o.id);
  } else if (!st.done.includes(o.id)) st.done.push(o.id);
  addRes(st, o.reward);
  if (o.kind === 'fortress') st.won = true;
  st.hero = { x: o.x, y: o.y };
  reveal(st, region);
  return o.kind === 'mine' ? { kind: 'captured', obj: o } : { kind: 'loot', obj: o, got: o.reward ?? {} };
}

/** Доход промыслов за день */
export function dailyIncome(st: WorldState, region: RegionDef): Partial<Resources> {
  const out: Resources = { gold: 0, wood: 0, crystal: 0 };
  for (const id of st.owned) {
    const o = region.objects.find((ob) => ob.id === id);
    if (o?.income) for (const k of Object.keys(o.income) as ResKey[]) out[k] += o.income[k] ?? 0;
  }
  return out;
}

/** Новый день: очки хода заново, доход промыслов */
export function endDay(st: WorldState, region: RegionDef): Partial<Resources> {
  st.day++;
  st.moves = MOVES_PER_DAY;
  const inc = dailyIncome(st, region);
  addRes(st, inc);
  return inc;
}

/** Зерно дороги для боя отряда: одно и то же у одного отряда (повтор после поражения — та же дорога) */
export function battleSeed(o: WorldObj): number | null {
  if (o.kind === 'fortress') return null; // крепость — готовая карта уровня
  let h = 2166136261;
  for (const ch of o.id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) % 1_000_000 || 1;
}

// -------------------------------------------------------------
// Сохранение на устройстве
// -------------------------------------------------------------
export const WORLD_KEY = 'dark_frontier_world';

export function normalizeWorld(v: unknown): WorldState | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Partial<WorldState>;
  const region = REGIONS[o.region ?? ''];
  if (o.v !== 3 || !region || !o.hero || !o.res) return null;
  const inside = (p: { x: number; y: number }) => terrainAt(region, p.x, p.y) !== null;
  if (!inside(o.hero)) return null;
  const num = (n: unknown, d = 0) => (typeof n === 'number' && isFinite(n) ? n : d);
  const ids = new Set(region.objects.map((ob) => ob.id));
  const st: WorldState = {
    v: 3,
    region: region.id,
    hero: { x: o.hero.x, y: o.hero.y },
    day: Math.max(1, Math.floor(num(o.day, 1))),
    moves: Math.max(0, Math.min(MOVES_PER_DAY, num(o.moves, MOVES_PER_DAY))),
    res: { gold: num(o.res.gold), wood: num(o.res.wood), crystal: num(o.res.crystal) },
    done: (o.done ?? []).filter((id) => ids.has(id)),
    owned: (o.owned ?? []).filter((id) => ids.has(id)),
    seen: (o.seen ?? []).filter((n) => Number.isInteger(n)),
    won: !!o.won,
    camp: Object.fromEntries(
      Object.entries(o.camp ?? {}).filter(([id, n]) => CAMP_PERKS.includes(id) && Number.isInteger(n) && n > 0).map(([id, n]) => [id, Math.min(campMax(id), n as number)])
    ),
  };
  reveal(st, region);
  return st;
}

export function loadWorld(): WorldState | null {
  try {
    const raw = localStorage.getItem(WORLD_KEY);
    return raw ? normalizeWorld(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveWorld(st: WorldState | null) {
  try {
    if (st) localStorage.setItem(WORLD_KEY, JSON.stringify(st));
    else localStorage.removeItem(WORLD_KEY);
  } catch {
    // нет хранилища — поход живёт до закрытия страницы
  }
}

// -------------------------------------------------------------
// Ячейки сохранения (просьба Артура 2026-11-06): поход сохраняется сам, а в ячейку — по кнопке
// -------------------------------------------------------------
export const SLOTS_KEY = 'dark_frontier_world_slots';
export const SLOT_COUNT = 3;
export interface WorldSlot {
  at: number; // время сохранения, мс
  day: number;
  state: WorldState;
}

export function loadSlots(): (WorldSlot | null)[] {
  let raw: unknown = null;
  try {
    raw = JSON.parse(localStorage.getItem(SLOTS_KEY) ?? 'null');
  } catch {
    raw = null;
  }
  const arr = Array.isArray(raw) ? raw : [];
  return Array.from({ length: SLOT_COUNT }, (_, i) => {
    const v = arr[i] as Partial<WorldSlot> | null;
    const state = v ? normalizeWorld(v.state) : null;
    return v && state ? { at: Number(v.at) || 0, day: state.day, state } : null;
  });
}

export function saveSlot(i: number, st: WorldState) {
  const slots = loadSlots();
  slots[i] = { at: Date.now(), day: st.day, state: JSON.parse(JSON.stringify(st)) };
  try {
    localStorage.setItem(SLOTS_KEY, JSON.stringify(slots));
  } catch {
    // нет хранилища
  }
}

// -------------------------------------------------------------
// Лагерь (просьба Артура 2026-11-06): за ресурсы качаются пассивки — те же усиления, что в Потасовке
// (BOONS в config.ts), каждый уровень — ещё одна доля усиления на все бои похода. Постройки — по людям
// лагеря из лора (Гарт — Кузня, Сефира Ноль — Башня магов, Осип — Казна). Цены — черновик.
// -------------------------------------------------------------
export interface CampBuilding {
  id: string;
  name: string;
  keeper: string; // кто ведёт постройку
  text: string;
  perks: string[]; // id усилений из BOONS
}

export const CAMP_BUILDINGS: CampBuilding[] = [
  { id: 'forge', name: 'Кузня', keeper: 'Гарт', text: 'Клинки, наконечники и тетивы для всех башен.', perks: ['sharp', 'haste', 'pierce', 'slayer'] },
  { id: 'tower', name: 'Башня магов', keeper: 'Сефира Ноль', text: 'Чары узла: дальше видеть, вязнуть врагу, сильнее бить у артефакта.', perks: ['sight', 'mire', 'ward', 'bastion'] },
  { id: 'treasury', name: 'Казна', keeper: 'Осип', text: 'Золото с боя, скидки в лавке и вербовка.', perks: ['loot', 'trade', 'scout', 'envoy'] },
  { id: 'walls', name: 'Стены', keeper: 'Наместник Орис Вельд', text: 'Камень для стен вокруг артефакта.', perks: ['walls'] },
];
export const CAMP_PERKS = CAMP_BUILDINGS.flatMap((b) => b.perks);
export const CAMP_MAX_LEVEL = 3;
/** Сколько уровней у пассивки: «Разведка» — да или нет, у остальных три */
export const campMax = (perk: string) => (perk === 'scout' ? 1 : CAMP_MAX_LEVEL);

/** Цена следующего уровня пассивки (уровень 1..3) */
export function campCost(level: number): Resources {
  return [
    { gold: 100, wood: 15, crystal: 0 },
    { gold: 200, wood: 30, crystal: 2 },
    { gold: 350, wood: 50, crystal: 4 },
  ][Math.max(0, Math.min(CAMP_MAX_LEVEL, level) - 1)];
}

export function canAfford(st: WorldState, cost: Resources): boolean {
  return (Object.keys(cost) as ResKey[]).every((k) => st.res[k] >= cost[k]);
}

/** Поднять пассивку на уровень, если хватает ресурсов. Возвращает новый уровень или null */
export function upgradeCamp(st: WorldState, perk: string): number | null {
  if (!CAMP_PERKS.includes(perk)) return null;
  const next = (st.camp[perk] ?? 0) + 1;
  if (next > campMax(perk)) return null;
  const cost = campCost(next);
  if (!canAfford(st, cost)) return null;
  for (const k of Object.keys(cost) as ResKey[]) st.res[k] -= cost[k];
  st.camp = { ...st.camp, [perk]: next };
  return next;
}
