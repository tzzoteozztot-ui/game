/**
 * Поход по глобальной карте кампании (просьба Артура 2026-11-06, вариант В — регионы из гексов).
 * Чистая логика без React и холста: регион, туман, ход героя по дням, объекты, ресурсы.
 * Гексы «остриём вверх», нечётные ряды сдвинуты на полклетки вправо (как поле боя в grid.ts).
 * Числа (волны отрядов, награды, доход промыслов) — черновик прототипа, меняются по слову Артура.
 */

export type Terrain = 'grass' | 'forest' | 'hills' | 'water' | 'rock';
export type ResKey = 'gold' | 'wood' | 'crystal';
export type Resources = Record<ResKey, number>;

export const RES_NAMES: Record<ResKey, string> = { gold: 'Золото', wood: 'Дерево и камень', crystal: 'Кристаллы' };
export const RES_ICONS: Record<ResKey, string> = { gold: '🪙', wood: '🪵', crystal: '💎' };

/** Сколько очков хода стоит войти в гекс; null — непроходимо */
export const TERRAIN_COST: Record<Terrain, number | null> = { grass: 1, forest: 2, hills: 2, water: null, rock: null };
const TERRAIN_CHARS: Record<string, Terrain> = { '.': 'grass', f: 'forest', h: 'hills', w: 'water', r: 'rock' };

export const MOVES_PER_DAY = 6;
export const SIGHT = 2; // радиус обзора героя, гексов

export type WorldObjKind = 'camp' | 'squad' | 'fortress' | 'chest' | 'mine' | 'shrine';

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
  /** Строка хрониста при встрече */
  text?: string;
}

export interface RegionDef {
  id: string;
  name: string;
  level: number; // биом и враги: номер карты кампании (1 — Пограничье, орки)
  terrain: string[]; // ряды символов: . трава, f лес, h холмы, w вода, r скалы
  start: { x: number; y: number };
  objects: WorldObj[];
}

export interface WorldState {
  v: 1;
  region: string;
  hero: { x: number; y: number };
  day: number;
  moves: number;
  res: Resources;
  done: string[]; // разбитые отряды, открытые сундуки, посещённые святилища
  owned: string[]; // захваченные промыслы
  seen: number[]; // открытые туманом гексы: y * ширина + x
  won: boolean; // крепость взята
}

// -------------------------------------------------------------
// Пограничье (карта 1, орки) — первый регион прототипа
// -------------------------------------------------------------
export const FRONTIER: RegionDef = {
  id: 'frontier',
  name: 'Пограничье',
  level: 1,
  terrain: [
    'rrff..ffrrrff',
    'r..f...w..ffr',
    'f....f.w..h.r',
    '...f...w....r',
    '.....f.......',
    'f.f..h.w.f..f',
    'r...f.......r',
    'rrfff.rwrffrr',
  ],
  start: { x: 2, y: 4 },
  objects: [
    { id: 'camp', kind: 'camp', x: 1, y: 4, name: 'Лагерь экспедиции', text: 'Здесь встанут кузня, казна и стены. Пока лагерь только разбит.' },
    { id: 'chest1', kind: 'chest', x: 1, y: 1, name: 'Брошенный обоз', reward: { gold: 50 } },
    { id: 'chest2', kind: 'chest', x: 2, y: 6, name: 'Сложенный лес', reward: { wood: 20 } },
    { id: 'sq1', kind: 'squad', x: 3, y: 2, name: 'Разведка орков', waves: 3, reward: { gold: 40 }, text: 'Несколько разведчиков рода. Слабые, но они нас уже видели.' },
    { id: 'saw', kind: 'mine', x: 4, y: 6, name: 'Лесопилка', waves: 3, income: { wood: 5 }, text: 'Орки рубят здесь лес. Отобьём — будет дерево каждый день.' },
    { id: 'sq2', kind: 'squad', x: 5, y: 3, name: 'Дозор рода', waves: 4, reward: { gold: 50, crystal: 1 } },
    { id: 'ford', kind: 'squad', x: 7, y: 4, name: 'Застава у брода', waves: 5, reward: { gold: 70 }, text: 'Брод через реку держат воины рода. Другого пути на тот берег почти нет.' },
    { id: 'bridge', kind: 'squad', x: 7, y: 6, name: 'Засада у моста', waves: 5, reward: { gold: 60, wood: 10 } },
    { id: 'goldmine', kind: 'mine', x: 9, y: 1, name: 'Рудник', waves: 4, income: { gold: 20 } },
    { id: 'sq3', kind: 'squad', x: 9, y: 3, name: 'Боевой отряд', waves: 6, reward: { gold: 80, crystal: 1 } },
    { id: 'shrine', kind: 'shrine', x: 11, y: 5, name: 'Камень предков', reward: { crystal: 3 }, text: 'Орки приносят сюда дары. Камень звенит так же, как наш узел.' },
    { id: 'chest3', kind: 'chest', x: 12, y: 4, name: 'Тайник шамана', reward: { crystal: 2 } },
    { id: 'sq4', kind: 'squad', x: 10, y: 6, name: 'Стая гончих', waves: 6, reward: { gold: 80 } },
    { id: 'fortress', kind: 'fortress', x: 11, y: 3, name: 'Крепость Вождя', waves: 12, reward: { gold: 200, crystal: 5 }, text: 'Вождь Ургаш ждёт за частоколом. Это бой на все двенадцать волн.' },
  ],
};

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
    v: 1,
    region: region.id,
    hero: { ...region.start },
    day: 1,
    moves: MOVES_PER_DAY,
    res: { gold: 0, wood: 0, crystal: 0 },
    done: [],
    owned: [],
    seen: [],
    won: false,
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

export function isSeen(st: WorldState, region: RegionDef, x: number, y: number): boolean {
  return st.seen.includes(y * regionW(region) + x);
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
  if (o.v !== 1 || !region || !o.hero || !o.res) return null;
  const inside = (p: { x: number; y: number }) => terrainAt(region, p.x, p.y) !== null;
  if (!inside(o.hero)) return null;
  const num = (n: unknown, d = 0) => (typeof n === 'number' && isFinite(n) ? n : d);
  const ids = new Set(region.objects.map((ob) => ob.id));
  const st: WorldState = {
    v: 1,
    region: region.id,
    hero: { x: o.hero.x, y: o.hero.y },
    day: Math.max(1, Math.floor(num(o.day, 1))),
    moves: Math.max(0, Math.min(MOVES_PER_DAY, num(o.moves, MOVES_PER_DAY))),
    res: { gold: num(o.res.gold), wood: num(o.res.wood), crystal: num(o.res.crystal) },
    done: (o.done ?? []).filter((id) => ids.has(id)),
    owned: (o.owned ?? []).filter((id) => ids.has(id)),
    seen: (o.seen ?? []).filter((n) => Number.isInteger(n)),
    won: !!o.won,
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
