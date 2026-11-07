/**
 * Поход по глобальной карте кампании (просьба Артура 2026-11-06, вариант В — регионы из гексов).
 * Чистая логика без React и холста: регион, туман, ход героя по дням, объекты, ресурсы.
 * Гексы «остриём вверх», нечётные ряды сдвинуты на полклетки вправо (как поле боя в grid.ts).
 * Числа (волны отрядов, награды, доход промыслов) — черновик прототипа, меняются по слову Артура.
 */
import { SCENE_AT } from './dialogs';
import { CHAPTER_SPECS } from './chapters';

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

export type WorldObjKind = 'camp' | 'squad' | 'fortress' | 'chest' | 'mine' | 'shrine' | 'event';

/** Выбор в событии: что сделать, что вышло, награда и отметка для будущих глав (`WorldState.flags`) */
export interface EventChoice {
  label: string;
  text: string;
  reward?: Partial<Resources>;
  flag?: string;
  /** Ещё отметки сразу (Корх: обмен и сопровождение) */
  flags?: string[];
  item?: string; // предмет героя (HERO_ITEMS)
  /** Разведданные: туман рассеивается в этом радиусе вокруг крепости и её стражи */
  scout?: number;
}

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
  /** Предмет героя: лежит в сундуке или святилище, дают за победу */
  item?: string;
  /** Бой с армией, как в Потасовке: враги за золото уходят на поле врага, победа — когда падёт его артефакт. Сила бота врага */
  army?: 'easy' | 'normal' | 'hard';
  /** Строка хрониста при встрече */
  text?: string;
  /** Тропа обучения (глава 1 — обучение, решение Артура 2026-11-06): объект закрыт, пока не пройдены все `needs` и хотя бы один из `needsAny` */
  needs?: string[];
  needsAny?: string[];
  /** Башни, которые открываются с боя здесь (до того в лавке похода их нет); Стрелок открыт всегда */
  teach?: string[];
  /** Бой с армией: вкладка «Армия» закрыта до этой волны, потом врывается Каллен (сцена `wave:<id>:<N>`) */
  armyAt?: number;
  /** Промысел, захват которого ослабляет защиту этого лагеря: бот армии на ступень слабее (малый узел и крепость, сценарий Г1-18б) */
  weakenedBy?: string;
  /** Событие: выборы (глава 2+, сценарий Лороведа) */
  choices?: EventChoice[];
  /** Объект есть на карте, только если сделан выбор с этой отметкой (сопровождение Корха) */
  needsFlag?: string;
  /** Бой: враги этой фракции вместо хозяев карты (6 — порабощённые солдаты экспедиции, люди) */
  faction?: number;
  /** Бой: в последней волне выходит босс, даже если волн меньше 12 (Каллен в обороне лагеря) */
  bossLast?: boolean;
}

export interface RegionDef {
  id: string;
  name: string;
  level: number; // биом и враги: номер карты кампании (1 — Пограничье, орки)
  terrain: string[]; // ряды символов: . трава, = дорога, f лес, h холмы, w вода, r горы, d чаща
  start: { x: number; y: number };
  objects: WorldObj[];
  props?: WorldProp[];
  chapter?: number; // номер главы похода
  next?: string; // регион следующей главы
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
  xp: number; // опыт героя
  items: string[]; // найденные предметы героя (id из HERO_ITEMS)
  equip: Partial<Record<ItemSlot, string>>; // надетые: слот → id предмета
  scenes: string[]; // показанные сцены диалогов (src/campaign/dialogs.ts)
  flags: string[]; // выборы в событиях — для будущих глав
}

// -------------------------------------------------------------
// Пограничье (карта 1, орки) — первый регион прототипа. Просьба Артура 2026-11-06: карта больше, а ходить
// можно меньше — как в Героях: дороги и поляны вокруг объектов, всё остальное непроходимо (горы, чаща,
// озёра) и заполнено крупными украшениями (руины замков, башни, скалы, кристаллы). Местность строится по
// зерну — одна и та же каждый раз; река с двумя переправами (брод и мост под охраной отрядов).
// -------------------------------------------------------------
const FW = 52;
const FH = 32;

/** Как строить местность региона: размер, зерна шума и пороги (глава 1 — числа Пограничья) */
export interface RegionSpec {
  id: string;
  name: string;
  level: number;
  chapter: number;
  w: number;
  h: number;
  start: { x: number; y: number };
  objects: WorldObj[];
  roads: { x: number; y: number }[][];
  props: WorldProp[];
  /** Ось реки по рядам (нет — без реки); перейти её можно только через гексы `crossings` */
  river?: (y: number) => number;
  crossings?: { x: number; y: number }[];
  /** Зерно и доли: lake — порог озёр (меньше — больше воды), rock — порог гор (меньше — больше гор), forest/hills — пороги леса и холмов */
  seed?: number;
  lake?: number;
  rock?: number;
  forest?: number;
  hills?: number;
  /** Крупные украшения глуши, по кругу */
  wild?: PropKind[];
  /** Следующая глава после взятия крепости */
  next?: string;
}

function mulberry(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Гладкий шум 0..1 по сетке узлов шага `step` */
function valueNoise(seed: number, step: number, w = FW, h = FH) {
  const r = mulberry(seed);
  const gw = Math.ceil(w / step) + 2;
  const gh = Math.ceil(h / step) + 2;
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

/** Прямая по гексам. `legacy` — прежнее округление с ошибкой (бывают пропуски гекса): по нему построено Пограничье, менять нельзя — сдвинутся дороги в сохранениях */
export function hexLine(a: { x: number; y: number }, b: { x: number; y: number }, legacy = false): { x: number; y: number }[] {
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
    else if (legacy ? !(dr > ds) : dr > ds) rr = -rq - rs;
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
  { id: 'sq2', kind: 'squad', x: 12, y: 20, name: 'Охотники рода', waves: 3, reward: { gold: 40, wood: 10 }, needs: ['sq1'], teach: ['priest'] },
  { id: 'sq3', kind: 'squad', x: 16, y: 9, name: 'Дозор рода', waves: 4, reward: { gold: 50, crystal: 1 }, needs: ['shrine'], teach: ['ballista'] },
  { id: 'chest1', kind: 'chest', x: 8, y: 10, name: 'Брошенный обоз', reward: { gold: 50 }, needs: ['sq1'] },
  { id: 'chest2', kind: 'chest', x: 4, y: 22, name: 'Сложенный лес', reward: { wood: 20 }, needs: ['sq2'] },
  { id: 'chest3', kind: 'chest', x: 14, y: 4, name: 'Тайник контрабандистов', reward: { gold: 60 }, item: 'crossbow', needs: ['sq3'] },
  { id: 'chest4', kind: 'chest', x: 17, y: 27, name: 'Разбитая телега', reward: { gold: 30, crystal: 1 }, item: 'mail' },
  { id: 'quarry', kind: 'mine', x: 6, y: 6, name: 'Каменоломня', waves: 3, income: { wood: 4 }, needs: ['sq2'], text: 'Старая каменоломня, орки держат здесь пост.' },
  { id: 'saw', kind: 'mine', x: 8, y: 26, name: 'Лесопилка', waves: 3, income: { wood: 5 }, needs: ['quarry'], teach: ['mage'], text: 'Орки рубят здесь лес. Отобьём — будет дерево каждый день.' },
  { id: 'shrine', kind: 'shrine', x: 19, y: 16, name: 'Камень предков', reward: { crystal: 2 }, item: 'idol', needs: ['saw'], text: 'Орки приносят сюда дары. Камень звенит так же, как наш узел.' },
  {
    id: 'warcamp', kind: 'squad', x: 21, y: 3, name: 'Военный лагерь рода', waves: 6, reward: { gold: 250, wood: 30, crystal: 4 }, item: 'warbanner', needsAny: ['ford', 'bridge'], // ярус лавки и защита — после уроков уровней (Лоровед, 2026-11-06)
    text: 'Здесь орки собирают силы для набега. Бой не обязателен, но лагерь богат.',
  },
  // Переправы
  { id: 'ford', kind: 'squad', x: FORD.x, y: FORD.y, name: 'Застава у брода', waves: 5, reward: { gold: 70 }, needs: ['sq3'], text: 'Брод через реку держат воины рода. Другого пути на тот берег почти нет.' },
  { id: 'bridge', kind: 'squad', x: BRIDGE.x, y: BRIDGE.y, name: 'Засада у моста', waves: 5, reward: { gold: 60, wood: 10 }, needs: ['sq3'] },
  // Восточный берег
  { id: 'goldmine', kind: 'mine', x: 31, y: 4, name: 'Рудник', waves: 5, income: { gold: 20 }, needs: ['sq4'] },
  { id: 'node', kind: 'mine', x: 38, y: 28, name: 'Малый узел', waves: 6, income: { crystal: 1 }, item: 'shard', needs: ['sq5'], needsAny: ['goldmine', 'shrine2'], text: 'Осколок той же сети, что наш артефакт. Орки охраняют его, как святыню.' },
  { id: 'sq4', kind: 'squad', x: 33, y: 13, name: 'Боевой отряд', waves: 6, reward: { gold: 80, crystal: 1 }, needsAny: ['ford', 'bridge'] },
  { id: 'sq5', kind: 'squad', x: 33, y: 22, name: 'Стая гончих', waves: 6, reward: { gold: 80 }, needsAny: ['ford', 'bridge'] },
  { id: 'sq6', kind: 'squad', x: 40, y: 8, name: 'Шаманы ущелья', waves: 7, reward: { gold: 90, crystal: 2 }, needs: ['node'] },
  { id: 'sq7', kind: 'squad', x: 41, y: 22, name: 'Всадники на волках', waves: 7, reward: { gold: 90 }, needs: ['sq5'] },
  { id: 'guard', kind: 'squad', x: 42, y: 15, name: 'Стража Вождя', waves: 8, reward: { gold: 120, crystal: 2 }, needs: ['sq6', 'sq7'] },
  {
    id: 'stavka', kind: 'squad', x: 48, y: 6, name: 'Ставка вожака', waves: 8, reward: { gold: 300, crystal: 6 }, item: 'plate', needs: ['sq6'],
    text: 'Шатры вожака, что водит набеги на юг. Можно обойти, можно разорить.',
  },
  { id: 'chest5', kind: 'chest', x: 35, y: 7, name: 'Сундук наёмника', reward: { gold: 80 } },
  { id: 'chest6', kind: 'chest', x: 30, y: 18, name: 'Запас брёвен', reward: { wood: 20 } },
  { id: 'chest7', kind: 'chest', x: 45, y: 3, name: 'Добыча набега', reward: { gold: 100 }, item: 'banner' },
  { id: 'chest8', kind: 'chest', x: 45, y: 28, name: 'Тайник шамана', reward: { crystal: 2 } },
  { id: 'shrine2', kind: 'shrine', x: 48, y: 22, name: 'Старый идол', reward: { crystal: 3 }, text: 'Идол старше орков. На его камне — те же знаки, что на нашем узле.' },
  {
    id: 'fortress', kind: 'fortress', x: 47, y: 15, name: 'Крепость Вождя', waves: 12, army: 'normal', armyAt: 8, weakenedBy: 'node', reward: { gold: 200, crystal: 5 }, needs: ['guard'],
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

/** Местность региона по описанию: дороги, обочины и поляны проходимы, остальное — горы, чаща, озёра, река */
export function buildRegion(spec: RegionSpec): RegionDef {
  const FW = spec.w;
  const FH = spec.h;
  const sd = spec.seed ?? 0;
  const g: string[][] = Array.from({ length: FH }, () => Array(FW).fill(''));
  const inside = (x: number, y: number) => x > 0 && y > 0 && x < FW - 1 && y < FH - 1;
  const rv = spec.river;
  const isRiver = (x: number, y: number) => {
    if (!rv) return false;
    const rx = rv(y);
    return x === rx || x === rx + 1 || (y > 0 && rv(y - 1) !== rx && x === Math.min(rx, rv(y - 1)) + 1);
  };
  // 1. Дороги
  for (const chain of spec.roads)
    for (let i = 0; i + 1 < chain.length; i++) for (const p of hexLine(chain[i], chain[i + 1], spec.id === 'frontier')) if (inside(p.x, p.y)) g[p.y][p.x] = '=';
  // 2. Обочины: дорога шириной в 1–3 гекса (по шуму), поляны вокруг объектов
  const wide = valueNoise(51 + sd, 3, FW, FH);
  for (let y = 0; y < FH; y++)
    for (let x = 0; x < FW; x++) {
      if (g[y][x] !== '=') continue;
      for (const n of hexNeighbours(x, y)) if (inside(n.x, n.y) && !g[n.y][n.x] && !isRiver(n.x, n.y) && wide(n.x, n.y) > 0.42) g[n.y][n.x] = '.';
    }
  for (const o of spec.objects) {
    const rad = o.kind === 'camp' || o.kind === 'fortress' ? 2 : 1;
    for (let y = o.y - rad; y <= o.y + rad; y++)
      for (let x = o.x - rad - 1; x <= o.x + rad + 1; x++)
        if (inside(x, y) && !g[y][x] && !isRiver(x, y) && hexDistance(o, { x, y }) <= rad) g[y][x] = '.';
    if (g[o.y][o.x] !== '=') g[o.y][o.x] = '.';
  }
  for (const p of spec.props) if (!g[p.y][p.x]) g[p.y][p.x] = '.';
  // 3. Всё прочее непроходимо: река, озёра, горы, чаща
  const mtn = valueNoise(23 + sd, 5, FW, FH);
  const lake = valueNoise(77 + sd, 4, FW, FH);
  for (let y = 0; y < FH; y++)
    for (let x = 0; x < FW; x++) {
      if (g[y][x]) continue;
      if (isRiver(x, y)) g[y][x] = 'w';
      else if (!inside(x, y)) g[y][x] = 'r';
      else if (lake(x, y) > (spec.lake ?? 0.8)) g[y][x] = 'w';
      else g[y][x] = mtn(x, y) > (spec.rock ?? 0.5) ? 'r' : 'd';
    }
  // 4. Проходимое разнообразим: лес и холмы (дороже по ходу)
  const forest = valueNoise(11 + sd, 4, FW, FH);
  const hills = valueNoise(31 + sd, 5, FW, FH);
  const busy = new Set([...spec.objects, ...spec.props].map((o) => `${o.x},${o.y}`));
  for (let y = 0; y < FH; y++)
    for (let x = 0; x < FW; x++) {
      if (g[y][x] !== '.' || busy.has(`${x},${y}`)) continue;
      if (forest(x, y) > (spec.forest ?? 0.66)) g[y][x] = 'f';
      else if (hills(x, y) > (spec.hills ?? 0.68)) g[y][x] = 'h';
    }
  // 4б. Переправы: на тот берег — только через гекс отряда у брода или моста. Гексы берега, через которые
  // дорога в реке обходит отряд, зарастают чащей
  const crossing = new Set((spec.crossings ?? []).map((c) => `${c.x},${c.y}`));
  const walkable = (x: number, y: number) => '.=fh'.includes(g[y]?.[x] ?? 'r');
  for (let guard = 0; rv && guard < 20; guard++) {
    const seen = new Set<string>();
    const start = spec.objects[0];
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
    if (g[leak.y][leak.x] === '=') throw new Error(`${spec.name}: дорога обходит переправу у ${leak.x},${leak.y}`);
    g[leak.y][leak.x] = 'd';
  }
  // 5. Крупные украшения: в глуши, но в 2–3 гексах от проходимого, чтобы их было видно с дороги
  const passable = (x: number, y: number) => '.=fh'.includes(g[y]?.[x] ?? 'r');
  const near = (x: number, y: number, d: number) => {
    for (let j = y - d; j <= y + d; j++) for (let i = x - d - 1; i <= x + d + 1; i++) if (passable(i, j) && hexDistance({ x, y }, { x: i, y: j }) <= d) return true;
    return false;
  };
  const rnd = mulberry(97 + sd);
  const wild = spec.wild ?? WILD_KINDS;
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
    props.push({ kind: wild[props.length % wild.length], x: c.x, y: c.y });
  }
  return {
    id: spec.id,
    name: spec.name,
    level: spec.level,
    chapter: spec.chapter,
    next: spec.next,
    terrain: g.map((row) => row.join('')),
    start: spec.start,
    objects: spec.objects,
    props: [...spec.props, ...props],
  };
}

export const FRONTIER: RegionDef = buildRegion({
  id: 'frontier',
  name: 'Пограничье',
  level: 1,
  chapter: 1,
  w: FW,
  h: FH,
  start: { x: 6, y: 16 },
  objects: FRONTIER_OBJECTS,
  roads: FRONTIER_ROADS,
  props: FRONTIER_PROPS,
  river: riverX,
  crossings: [FORD, BRIDGE],
  next: 'bog',
});

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

export const REGIONS: Record<string, RegionDef> = Object.fromEntries([FRONTIER, ...CHAPTER_SPECS.map(buildRegion)].map((r) => [r.id, r]));

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
    xp: 0,
    items: ['sword'],
    equip: { weapon: 'sword' },
    scenes: [],
    flags: [],
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

/** Открыть туман вокруг точек (разведданные события) */
export function revealAround(st: WorldState, region: RegionDef, points: { x: number; y: number }[], radius: number) {
  const w = regionW(region);
  const seen = new Set(st.seen);
  for (let y = 0; y < regionH(region); y++)
    for (let x = 0; x < w; x++) if (points.some((p) => hexDistance(p, { x, y }) <= radius)) seen.add(y * w + x);
  st.seen = [...seen].sort((a, b) => a - b);
}

const seenSets = new WeakMap<number[], Set<number>>();
export function isSeen(st: WorldState, region: RegionDef, x: number, y: number): boolean {
  let set = seenSets.get(st.seen);
  if (!set) seenSets.set(st.seen, (set = new Set(st.seen)));
  return set.has(y * regionW(region) + x);
}

/** Объект ещё не появился: нужен выбор с отметкой `needsFlag` */
export const isHidden = (st: WorldState, o: WorldObj) => !!o.needsFlag && !st.flags.includes(o.needsFlag);

/** Объект в гексе, который ещё что-то значит (разбитые отряды и пустые сундуки исчезают; промыслы и лагерь остаются) */
export function objectAt(st: WorldState, region: RegionDef, x: number, y: number): WorldObj | null {
  const o = region.objects.find((ob) => ob.x === x && ob.y === y && !isHidden(st, ob));
  if (!o) return null;
  if (st.done.includes(o.id) && (o.kind === 'squad' || o.kind === 'chest' || o.kind === 'fortress' || o.kind === 'event')) return null;
  return o;
}

/** Нужен ли бой, чтобы войти в гекс объекта */
export function isHostile(st: WorldState, o: WorldObj): boolean {
  if (o.kind === 'squad' || o.kind === 'fortress') return !st.done.includes(o.id);
  if (o.kind === 'mine') return !!o.waves && !st.owned.includes(o.id);
  return false;
}

/** Пройден ли объект: отряд разбит, промысел захвачен, сундук открыт */
export const isCleared = (st: WorldState, id: string) => st.done.includes(id) || st.owned.includes(id);

/** Закрыт ли объект тропой обучения: не пройдены его `needs` или ни один из `needsAny`. Пройденный не закрывается */
export function isLocked(st: WorldState, o: WorldObj): boolean {
  if (isCleared(st, o.id)) return false;
  if (o.needs?.some((id) => !isCleared(st, id))) return true;
  return !!o.needsAny && !o.needsAny.some((id) => isCleared(st, id));
}

/** Что ещё нужно пройти, чтобы открыть объект: «Дозор рода», «Рудник или Старый идол» */
export function lockText(st: WorldState, region: RegionDef, o: WorldObj): string {
  const name = (id: string) => region.objects.find((ob) => ob.id === id)?.name ?? id;
  const parts = (o.needs ?? []).filter((id) => !isCleared(st, id)).map(name);
  if (o.needsAny && !o.needsAny.some((id) => isCleared(st, id))) parts.push(o.needsAny.map(name).join(' или '));
  return parts.join(', ');
}

/** Башни людей в бою похода: Стрелок и всё, чему учили пройденные бои и этот бой (`teach`) */
export function allowedTowers(st: WorldState, region: RegionDef, battle: WorldObj | null): string[] {
  if ((region.chapter ?? 1) > 1) return ['archer', 'priest', 'mage', 'ballista']; // обучение — только в главе 1
  const out = new Set(['archer']);
  for (const o of region.objects) if (o.teach && (isCleared(st, o.id) || o.id === battle?.id)) o.teach.forEach((t) => out.add(t));
  return [...out];
}

/** Сила бота вражеского лагеря в бою с армией: захваченный `weakenedBy` снимает одну ступень */
export function armyLevel(st: WorldState, o: WorldObj): 'easy' | 'normal' | 'hard' | undefined {
  if (!o.army) return undefined;
  if (!o.weakenedBy || !st.owned.includes(o.weakenedBy)) return o.army;
  return o.army === 'hard' ? 'normal' : 'easy';
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
      if (o && (isHostile(st, o) || isLocked(st, o))) continue; // сквозь врага и закрытое не пройти
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
  | { kind: 'visit'; obj: WorldObj }
  | { kind: 'locked'; obj: WorldObj }
  | { kind: 'event'; obj: WorldObj };

/**
 * Один шаг героя по пути. Возвращает null, если не хватает очков хода. Шаг во враждебный гекс тратит ход,
 * но герой остаётся на месте до исхода боя (`winBattle` переводит его туда).
 */
export function stepHero(st: WorldState, region: RegionDef, to: { x: number; y: number }): Arrival | null {
  const c = stepCost(region, to);
  if (st.moves < c) return null;
  const o = objectAt(st, region, to.x, to.y);
  if (o && isLocked(st, o)) return { kind: 'locked', obj: o };
  st.moves -= c;
  if (o && isHostile(st, o)) return { kind: 'battle', obj: o, from: { ...st.hero } };
  st.hero = { ...to };
  reveal(st, region);
  if (!o) return { kind: 'none' };
  return arrive(st, o);
}

function arrive(st: WorldState, o: WorldObj): Arrival {
  if (o.kind === 'event') return st.done.includes(o.id) ? { kind: 'visit', obj: o } : { kind: 'event', obj: o };
  if (o.kind === 'chest' || o.kind === 'shrine') {
    if (st.done.includes(o.id)) return { kind: 'visit', obj: o };
    st.done.push(o.id);
    addRes(st, o.reward);
    giveItem(st, o.item);
    return { kind: 'loot', obj: o, got: o.reward ?? {} };
  }
  if (o.kind === 'mine' && !st.owned.includes(o.id)) {
    st.owned.push(o.id);
    return { kind: 'captured', obj: o };
  }
  return { kind: 'visit', obj: o };
}

/** Выбор в событии: событие пройдено, награда, отметка выбора */
export function chooseEvent(st: WorldState, region: RegionDef, objId: string, i: number): EventChoice | null {
  const o = region.objects.find((ob) => ob.id === objId);
  const c = o?.choices?.[i];
  if (!o || !c || st.done.includes(o.id)) return null;
  st.done.push(o.id);
  addRes(st, c.reward);
  for (const f of [c.flag, ...(c.flags ?? [])]) if (f && !st.flags.includes(f)) st.flags.push(f);
  giveItem(st, c.item);
  if (c.scout) {
    const f = region.objects.find((ob) => ob.kind === 'fortress');
    if (f) revealAround(st, region, [f, ...region.objects.filter((ob) => f.needs?.includes(ob.id))], c.scout);
  }
  return c;
}

/** Переход в следующую главу: новый регион, герой у его лагеря; лагерь, герой, предметы, ресурсы и выборы остаются */
export function enterRegion(st: WorldState, region: RegionDef) {
  st.region = region.id;
  st.hero = { ...region.start };
  st.done = [];
  st.owned = [];
  st.seen = [];
  st.won = false;
  st.moves = MOVES_PER_DAY;
  reveal(st, region);
}

/** Победа в бою: объект разбит (промысел — захвачен), награда, герой входит в гекс */
export function winBattle(st: WorldState, region: RegionDef, objId: string): Arrival {
  const o = region.objects.find((ob) => ob.id === objId);
  if (!o) return { kind: 'none' };
  if (o.kind === 'mine') {
    if (!st.owned.includes(o.id)) st.owned.push(o.id);
  } else if (!st.done.includes(o.id)) st.done.push(o.id);
  addRes(st, o.reward);
  giveItem(st, o.item);
  st.xp += battleXp(o);
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
    xp: Math.max(0, Math.floor(num(o.xp))),
    items: [],
    equip: {},
    scenes: Array.isArray(o.scenes) ? o.scenes.filter((x): x is string => typeof x === 'string') : [],
    flags: Array.isArray(o.flags) ? o.flags.filter((x): x is string => typeof x === 'string') : [],
  };
  // Сохранение до диалогов: пролог уже позади
  if (!Array.isArray(o.scenes) && (st.done.length || st.day > 1)) {
    // …и сцены уже пройденного не догоняют игрока все разом
    const old = ['start', ...region.objects.filter((ob) => isCleared(st, ob.id)).flatMap((ob) => [`before:${ob.id}`, `after:${ob.id}`, `loot:${ob.id}`])];
    st.scenes = [...new Set(old.map((t) => SCENE_AT[t]).filter(Boolean))];
  }
  const items = Array.isArray(o.items) ? o.items.filter((id, i, a) => HERO_ITEMS.some((d) => d.id === id) && a.indexOf(id) === i) : ['sword'];
  st.items = items;
  for (const [slot, id] of Object.entries(o.equip ?? (Array.isArray(o.items) ? {} : { weapon: 'sword' }))) {
    const def = HERO_ITEMS.find((d) => d.id === id);
    if (def && def.slot === slot && items.includes(def.id)) st.equip[def.slot] = def.id;
  }
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

// -------------------------------------------------------------
// Герой (просьба Артура 2026-11-06, выбор «умения кнопками»): Рен Корвин не стоит на поле. Опыт за победы
// поднимает уровень, уровень открывает умения (HERO_ABILITIES в config.ts — кнопки в бою). Предметы — 4 слота,
// каждый даёт доли усилений, как уровни лагеря. Числа — черновик.
// -------------------------------------------------------------
export type ItemSlot = 'weapon' | 'armor' | 'amulet' | 'banner';
export const SLOT_NAMES: Record<ItemSlot, string> = { weapon: 'Оружие', armor: 'Доспех', amulet: 'Амулет', banner: 'Знамя' };
export interface HeroItem {
  id: string;
  slot: ItemSlot;
  name: string;
  icon: string;
  text: string;
  perks: Record<string, number>; // id усиления → доли
}
export const HERO_ITEMS: HeroItem[] = [
  { id: 'sword', slot: 'weapon', name: 'Меч Корвинов', icon: '🗡', text: 'Родовой клинок. С ним Рен ушёл в первую экспедицию.', perks: { sharp: 1 } },
  { id: 'crossbow', slot: 'weapon', name: 'Арбалет разведчика', icon: '🏹', text: 'Лёгкий, бьёт далеко. Контрабандисты знали толк в оружии.', perks: { sight: 1, slayer: 1 } },
  { id: 'mail', slot: 'armor', name: 'Кольчуга заставы', icon: '🥋', text: 'Снята с телеги прежнего дозора людей.', perks: { walls: 2 } },
  { id: 'plate', slot: 'armor', name: 'Латы вожака', icon: '🛡', text: 'Орочья работа, грубая и крепкая.', perks: { walls: 2, bastion: 1 } },
  { id: 'idol', slot: 'amulet', name: 'Знак предков', icon: '🪬', text: 'Орочий оберег с Камня предков. Звенит, как узел.', perks: { pierce: 1 } },
  { id: 'shard', slot: 'amulet', name: 'Осколок узла', icon: '💎', text: 'Кусок малого узла. Тёплый на ощупь.', perks: { ward: 1, mire: 1 } },
  { id: 'banner', slot: 'banner', name: 'Знамя экспедиции', icon: '🚩', text: 'Под ним солдаты бьют быстрее.', perks: { haste: 1 } },
  { id: 'token', slot: 'amulet', name: 'Жетон чужого знамени', icon: '🔰', text: 'Лейтенант Сорн оставил его в болоте. Чужая экспедиция узнает этот знак.', perks: { envoy: 1, loot: 1 } },
  { id: 'mirror', slot: 'amulet', name: 'Тёмное зеркало', icon: '🪞', text: 'Трофей из Цитадели сумерек. Его свойства ещё не изучены.', perks: { pierce: 1, slayer: 1, sight: 1 } },
  { id: 'warbanner', slot: 'banner', name: 'Трофейное знамя рода', icon: '🏴', text: 'Взято в военном лагере. Орки узнают его издалека.', perks: { loot: 1, envoy: 1 } },
];

/** Опыт до уровня: уровень 1 — с начала, 2 — 60, 3 — 180 */
export const HERO_LEVELS = [0, 60, 180];
export const heroLevel = (st: WorldState) => HERO_LEVELS.filter((x) => st.xp >= x).length;

/** Опыт за победу: 10 за волну, бой с армией и крепость — 100 */
export function battleXp(o: WorldObj): number {
  if (o.army || o.kind === 'fortress') return 100;
  return (o.waves ?? 0) * 10;
}

export function giveItem(st: WorldState, id: string | undefined) {
  const def = HERO_ITEMS.find((d) => d.id === id);
  if (!def || st.items.includes(def.id)) return;
  st.items = [...st.items, def.id];
  if (!st.equip[def.slot]) st.equip = { ...st.equip, [def.slot]: def.id };
}

/** Надеть предмет (в его слот) или снять, если он уже надет */
export function toggleEquip(st: WorldState, id: string) {
  const def = HERO_ITEMS.find((d) => d.id === id);
  if (!def || !st.items.includes(id)) return;
  const eq = { ...st.equip };
  if (eq[def.slot] === id) delete eq[def.slot];
  else eq[def.slot] = id;
  st.equip = eq;
}

/** Все доли усилений на бой: уровни лагеря и надетые предметы */
export function battlePerks(st: WorldState): Record<string, number> {
  const out: Record<string, number> = { ...st.camp };
  for (const id of Object.values(st.equip)) {
    const def = HERO_ITEMS.find((d) => d.id === id);
    if (def) for (const [k, n] of Object.entries(def.perks)) out[k] = (out[k] ?? 0) + n;
  }
  return out;
}

// -------------------------------------------------------------
// Захватчик и природа края
// -------------------------------------------------------------
const hash01 = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + 7777 * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * Сила захватчика в гексе (Артур, 2026-11-07: «карты перетекают друг в друга»): демоны, культисты и прочие пришлые
 * не переделывают весь край, а искажают его вокруг узла. 0 — природа континента (у лагеря главы), 1 — биом
 * захватчика (у крепости). Пограничье — родной край орков: там всё своё, 1 везде.
 */
export function invasion(r: RegionDef): (x: number, y: number) => number {
  const f = r.objects.find((o) => o.kind === 'fortress');
  const c = r.objects.find((o) => o.kind === 'camp');
  if (r.level === 1 || !f || !c) return () => 1;
  return (x, y) => {
    const df = Math.hypot(x - f.x, (y - f.y) * 0.87);
    const dc = Math.hypot(x - c.x, (y - c.y) * 0.87);
    const t = dc / (dc + df + 1e-6) + (hash01(x >> 1, y >> 1) - 0.5) * 0.12;
    const k = Math.max(0, Math.min(1, (t - 0.32) / 0.55));
    return k * k * (3 - 2 * k);
  };
}
