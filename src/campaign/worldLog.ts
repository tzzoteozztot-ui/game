/**
 * Лог похода (просьба Артура 2026-11-10): все действия игрока на глобальной карте и все числа — для разбора
 * баланса и геймплея кампании по присланному файлу. Только записывает, на игру не влияет.
 *
 * Состав файла: шапка (числа правил похода, объекты пройденных регионов с волнами, наградами и доходом),
 * события карты по порядку (каждое — что изменилось: ресурсы, ходы, опыт, предметы, отметки) и бои.
 * Бой — полный лог партии того же вида, что в Потасовке (`runLog.ts`: срезы волн, башни, покупки, урон, враги),
 * плюс с чем герой вошёл (доли усилений лагеря и предметов, умения, открытые башни) и чем кончилось.
 *
 * Хранится на устройстве в IndexedDB (бои крупные, в localStorage не поместятся): `head:<id>` — шапка и события,
 * `battle:<id>:<n>` — бой. «Заново» начинает новый лог, прежний стирается (окно «Заново» об этом предупреждает).
 */
import type { RunLogData } from '../game/runLog';
import {
  type WorldState,
  type WorldObj,
  type RegionDef,
  type Resources,
  type ResKey,
  REGIONS,
  FRONTIER,
  MOVES_PER_DAY,
  SIGHT,
  TERRAIN_COST,
  CAMP_MAX_LEVEL,
  HERO_LEVELS,
  campCost,
  heroLevel,
  battlePerks,
  terrainAt,
} from './world';

const MAX_EVENTS = 20000;
const DB_NAME = 'dark_frontier_logs';
const STORE = 'kv';

export interface CampaignEvent {
  n: number;
  at: number; // секунд настоящего времени от начала лога
  kind: string;
  region: string;
  day: number;
  moves: number; // очков хода после события
  res: Resources; // ресурсы после события
  [key: string]: unknown;
}

export interface CampaignBattle {
  n: number;
  at: number;
  region: string;
  day: number;
  obj: string;
  name: string;
  attempt: number; // какая по счёту попытка боя с этим объектом
  outcome: 'victory' | 'defeat' | 'left' | 'restart';
  entry: Record<string, unknown>; // с чем вошли: усиления, умения, башни лавки, сила армии
  log: RunLogData | null; // полный лог боя, как у партии Потасовки
}

export interface CampaignLogHead {
  version: 1;
  game: 'Тёмный рубеж';
  kind: 'campaign';
  id: string;
  startedAt: string;
  updatedAt: string;
  /** Правила похода на момент записи: всё, от чего зависят числа событий */
  rules: Record<string, unknown>;
  /** Объекты регионов, где герой побывал: волны, награды, доход, замки */
  regions: Record<string, unknown>;
  events: CampaignEvent[];
  eventsDropped: number;
  battleCount: number;
}

export interface CampaignLogFile extends CampaignLogHead {
  state: Record<string, unknown> | null; // состояние похода на момент скачивания
  battles: CampaignBattle[];
}

// ------------------------------------------------------------- разность состояний (чистая, для теста)
const RES: ResKey[] = ['gold', 'wood', 'crystal'];
const added = (a: string[], b: string[]) => b.filter((x) => !a.includes(x));

function objBrief(o: WorldObj) {
  return {
    id: o.id,
    kind: o.kind,
    name: o.name,
    x: o.x,
    y: o.y,
    ...(o.waves !== undefined ? { waves: o.waves } : {}),
    ...(o.army ? { army: o.army } : {}),
    ...(o.reward ? { reward: o.reward } : {}),
    ...(o.income ? { income: o.income } : {}),
    ...(o.item ? { item: o.item } : {}),
  };
}

/** Состояние без карты тумана: вместо списка гексов — их число */
export function stateBrief(st: WorldState) {
  const { seen, ...rest } = st;
  return { ...JSON.parse(JSON.stringify(rest)), seen: seen.length, heroLevel: heroLevel(st), perks: battlePerks(st) };
}

/**
 * Что изменилось между двумя состояниями похода: вид события и поле `d` со всеми разностями.
 * null — ничего существенного (например, перерисовка). `reason` — подсказка места, где сделано действие.
 */
export function diffWorld(prev: WorldState, next: WorldState, reason?: { kind: string; [key: string]: unknown }): { kind: string; [key: string]: unknown } | null {
  if (prev.region !== next.region || reason?.kind === 'slot-load' || reason?.kind === 'new') {
    return { ...(reason ?? {}), kind: reason?.kind ?? 'region', from: prev.region, to: next.region, state: stateBrief(next) };
  }
  const region = REGIONS[next.region] ?? FRONTIER;
  const obj = (id: string) => region.objects.find((o) => o.id === id);
  const d: Record<string, unknown> = {};
  const res: Partial<Resources> = {};
  for (const k of RES) if (next.res[k] !== prev.res[k]) res[k] = next.res[k] - prev.res[k];
  if (Object.keys(res).length) d.res = res;
  if (next.moves !== prev.moves) d.moves = next.moves - prev.moves;
  if (next.xp !== prev.xp) d.xp = next.xp - prev.xp;
  if (heroLevel(next) !== heroLevel(prev)) d.heroLevel = heroLevel(next);
  const done = added(prev.done, next.done);
  const owned = added(prev.owned, next.owned);
  const items = added(prev.items, next.items);
  const flags = added(prev.flags, next.flags);
  const scenes = added(prev.scenes, next.scenes);
  if (done.length) d.done = done;
  if (owned.length) d.owned = owned;
  if (items.length) d.items = items;
  if (flags.length) d.flags = flags;
  if (scenes.length) d.scenes = scenes;
  if (next.seen.length !== prev.seen.length) d.seen = next.seen.length - prev.seen.length;
  if (next.won !== prev.won) d.won = next.won;
  const camp: Record<string, number> = {};
  for (const k of Object.keys(next.camp)) if (next.camp[k] !== (prev.camp[k] ?? 0)) camp[k] = next.camp[k];
  if (Object.keys(camp).length) d.camp = camp;
  const equip: Record<string, { from: string | null; to: string | null }> = {};
  for (const slot of new Set([...Object.keys(prev.equip), ...Object.keys(next.equip)])) {
    const a = (prev.equip as Record<string, string | undefined>)[slot] ?? null;
    const b = (next.equip as Record<string, string | undefined>)[slot] ?? null;
    if (a !== b) equip[slot] = { from: a, to: b };
  }
  const moved = prev.hero.x !== next.hero.x || prev.hero.y !== next.hero.y;
  const dayChanged = next.day !== prev.day;
  if (!Object.keys(d).length && !Object.keys(equip).length && !moved && !dayChanged) return null;

  const base = { ...(reason ?? {}), d };
  const first = [...done, ...owned].map(obj).find(Boolean);
  if (reason?.kind === 'battle-won') return { ...base, kind: 'battle-won', obj: first ? objBrief(first) : reason.obj, hero: { ...next.hero } };
  if (reason?.kind === 'event-choice') return { ...base, kind: 'event-choice', hero: { ...next.hero } };
  if (dayChanged) return { ...base, kind: 'day', newDay: next.day, movesLeft: prev.moves, income: res };
  if (Object.keys(camp).length) return { ...base, kind: 'camp', perk: Object.keys(camp)[0], level: Object.values(camp)[0], perks: battlePerks(next) };
  if (Object.keys(equip).length && !moved) return { ...base, kind: 'equip', equip, perks: battlePerks(next) };
  if (moved) {
    const step = { x: next.hero.x, y: next.hero.y };
    const what = first ? (owned.length ? 'capture' : 'loot') : 'move';
    return {
      ...base,
      kind: what,
      from: { ...prev.hero },
      to: step,
      terrain: terrainAt(region, step.x, step.y),
      ...(first ? { obj: objBrief(first) } : {}),
      ...(Object.keys(equip).length ? { equip } : {}),
    };
  }
  if (scenes.length && Object.keys(d).length === 1) return { ...base, kind: 'scene', scene: scenes[0] };
  if (d.moves !== undefined && Object.keys(d).length === 1) return { ...base, kind: 'spend-moves' };
  return { ...base, kind: reason?.kind ?? 'change' };
}

// ------------------------------------------------------------- хранилище (IndexedDB), всё молча
let dbPromise: Promise<IDBDatabase | null> | null = null;
function db(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | null): Promise<T | null> {
  const d = await db();
  if (!d) return null;
  return new Promise((resolve) => {
    try {
      const tx = d.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req ? req.result : null);
      tx.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}
const put = (key: string, value: unknown) => idb('readwrite', (s) => s.put(value, key));
const get = <T>(key: string) => idb<T>('readonly', (s) => s.get(key) as IDBRequest<T>);
const prefixRange = (p: string) => IDBKeyRange.bound(p, p + '￿');

// ------------------------------------------------------------- текущий лог
let head: CampaignLogHead | null = null;
let loaded = false;
let queue: (() => void)[] = [];
const memBattles: CampaignBattle[] = []; // запас, если IndexedDB нет: бои этого запуска страницы
let reason: { kind: string; [key: string]: unknown } | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function rules() {
  return {
    movesPerDay: MOVES_PER_DAY,
    sight: SIGHT,
    terrainCost: TERRAIN_COST,
    campMaxLevel: CAMP_MAX_LEVEL,
    campCost: [1, 2, 3].map((l) => campCost(l)),
    heroLevels: HERO_LEVELS,
  };
}

function regionBrief(r: RegionDef) {
  return { id: r.id, name: r.name, level: r.level, chapter: r.chapter ?? 1, start: r.start, next: r.next ?? null, objects: r.objects };
}

function newHead(): CampaignLogHead {
  const now = new Date();
  return {
    version: 1,
    game: 'Тёмный рубеж',
    kind: 'campaign',
    id: String(now.getTime()),
    startedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    rules: rules(),
    regions: {},
    events: [],
    eventsDropped: 0,
    battleCount: 0,
  };
}

function persist() {
  if (!head) return;
  head.updatedAt = new Date().toISOString();
  if (saveTimer) return;
  saveTimer = setTimeout(flush, 400);
}

function flush() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  if (!head) return;
  void put(`head:${head.id}`, head);
  void put('current', head.id);
}

function whenLoaded(fn: () => void) {
  if (loaded) fn();
  else queue.push(fn);
}

async function load() {
  const id = await get<string>('current');
  const h = id ? await get<CampaignLogHead>(`head:${id}`) : null;
  if (h && h.version === 1 && Array.isArray(h.events)) head = h;
  loaded = true;
  const q = queue;
  queue = [];
  for (const fn of q) fn();
  listeners.forEach((l) => l());
}
if (typeof window !== 'undefined') {
  void load();
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
} else loaded = true;

const at = () => (head ? Math.round((Date.now() - Date.parse(head.startedAt)) / 100) / 10 : 0);

/** Лог начинается с первого действия: если поход уже шёл (старое сохранение) — с его полного состояния */
function ensure(st: WorldState, fresh = false) {
  if (!head) {
    head = newHead();
    push(st, { kind: 'start', fresh, state: stateBrief(st) });
  }
  const r = REGIONS[st.region] ?? FRONTIER;
  if (!head.regions[r.id]) head.regions[r.id] = regionBrief(r);
}

function push(st: WorldState, ev: { kind: string; [key: string]: unknown }) {
  if (!head) return;
  if (head.events.length >= MAX_EVENTS) {
    head.eventsDropped++;
    return;
  }
  const last = head.events[head.events.length - 1];
  // Подряд идущие шаги — одной записью: путь, число шагов, сумма разностей
  if (ev.kind === 'move' && last?.kind === 'move' && last.day === st.day && last.region === st.region) {
    const path = (last.path ??= [last.from, last.to]) as unknown[];
    path.push(ev.to);
    last.to = ev.to;
    last.steps = ((last.steps as number) ?? 1) + 1;
    const a = last.d as Record<string, number>;
    const b = ev.d as Record<string, number>;
    for (const k of ['moves', 'seen']) if (b[k]) a[k] = (a[k] ?? 0) + b[k];
    last.moves = st.moves;
    last.at2 = at();
    persist();
    return;
  }
  head.events.push({ n: head.events.length + head.eventsDropped + 1, at: at(), region: st.region, day: st.day, moves: st.moves, res: { ...st.res }, ...ev });
  persist();
}

/** Подсказка к следующему изменению состояния: что это было (выбор события, победа, загрузка ячейки) */
export function logReason(kind: string, fields: Record<string, unknown> = {}) {
  reason = { kind, ...fields };
}

/** Изменение состояния похода (вызывает App при каждом `setWorld`) */
export function logWorldChange(prev: WorldState | null, next: WorldState | null) {
  const why = reason;
  reason = null;
  if (!next) return;
  whenLoaded(() => {
    if (why?.kind === 'new' || !prev) {
      // Новый поход — новый лог, прежний стирается
      if (head && why?.kind === 'new') {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = null;
        const old = head.id;
        void idb('readwrite', (s) => {
          s.delete(`head:${old}`);
          return s.delete(prefixRange(`battle:${old}:`));
        });
        head = null;
        memBattles.length = 0;
      }
      ensure(next, true);
      return;
    }
    ensure(prev);
    const ev = diffWorld(prev, next, why ?? undefined);
    if (ev) push(next, ev);
    ensure(next); // новый регион — его объекты в шапку
  });
}

/** Действие без изменения состояния: сохранение в ячейку, закрытый объект, вход на карту, начало боя */
export function logWorldNote(st: WorldState | null, kind: string, fields: Record<string, unknown> = {}) {
  if (!st) return;
  whenLoaded(() => {
    ensure(st);
    push(st, { kind, ...fields });
  });
}

/** Начало боя: с чем герой вошёл. Возвращает номер попытки через событие `battle-start` */
export function logBattleStart(st: WorldState | null, o: WorldObj, entry: Record<string, unknown>) {
  if (!st) return;
  whenLoaded(() => {
    ensure(st);
    const attempt = head!.events.filter((e) => e.kind === 'battle-start' && (e.obj as { id?: string })?.id === o.id && e.region === st.region).length + 1;
    push(st, { kind: 'battle-start', obj: objBrief(o), attempt, entry: { heroLevel: heroLevel(st), xp: st.xp, perks: battlePerks(st), camp: { ...st.camp }, equip: { ...st.equip }, ...entry } });
  });
}

/** Конец боя (победа, поражение, выход, «Повторить»): полный лог боя уходит в хранилище */
export function logBattleEnd(st: WorldState | null, o: WorldObj, outcome: CampaignBattle['outcome'], log: RunLogData | null) {
  if (!st) return;
  const copy = log ? (JSON.parse(JSON.stringify(log)) as RunLogData) : null;
  whenLoaded(() => {
    ensure(st);
    const h = head!;
    const start = [...h.events].reverse().find((e) => e.kind === 'battle-start' && (e.obj as { id?: string })?.id === o.id);
    const n = ++h.battleCount;
    const battle: CampaignBattle = {
      n,
      at: at(),
      region: st.region,
      day: st.day,
      obj: o.id,
      name: o.name,
      attempt: (start?.attempt as number) ?? 1,
      outcome,
      entry: (start?.entry as Record<string, unknown>) ?? {},
      log: copy,
    };
    const lastWave = copy?.waves[copy.waves.length - 1];
    push(st, {
      kind: 'battle-end',
      obj: objBrief(o),
      attempt: battle.attempt,
      outcome,
      battle: n,
      wave: copy?.finalWave || lastWave?.wave || 0,
      seconds: copy?.seconds ?? 0,
      lives: lastWave?.lives ?? null, // прочность артефакта на начало последней волны; точная — в событии `final` лога боя
      killed: copy ? Object.values(copy.enemies).reduce((s, e) => s + e.killed, 0) : 0,
      leaked: copy ? Object.values(copy.enemies).reduce((s, e) => s + e.leaked, 0) : 0,
      castleDamage: copy ? Math.round(Object.values(copy.enemies).reduce((s, e) => s + e.castleDamage, 0)) : 0,
    });
    memBattles.push(battle);
    if (memBattles.length > 12) memBattles.shift();
    void put(`battle:${h.id}:${String(n).padStart(4, '0')}`, battle);
    flush();
  });
}

export function hasCampaignLog(): boolean {
  return !!head && head.events.length > 0;
}

/** Перерисовать кнопку, когда лог прочитан из хранилища */
export function onCampaignLogReady(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Собирает файл лога: шапка, события, все бои, состояние похода сейчас */
export async function buildCampaignLog(st: WorldState | null): Promise<CampaignLogFile | null> {
  if (!head) return null;
  flush();
  const stored = (await idb<CampaignBattle[]>('readonly', (s) => s.getAll(prefixRange(`battle:${head!.id}:`)) as IDBRequest<CampaignBattle[]>)) ?? [];
  const byN = new Map<number, CampaignBattle>();
  for (const b of [...stored, ...memBattles]) byN.set(b.n, b);
  return { ...head, state: st ? stateBrief(st) : null, battles: [...byN.values()].sort((a, b) => a.n - b.n) };
}

/** Скачивает лог похода файлом JSON; false — лога нет */
export async function downloadCampaignLog(st: WorldState | null): Promise<boolean> {
  const file = await buildCampaignLog(st);
  if (!file) return false;
  const name = `pohod-${st?.region ?? 'x'}-den${st?.day ?? 0}-boev${file.battles.length}-${file.startedAt.slice(0, 16).replace(/[:T]/g, '-')}`;
  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `temny-rubezh-${name}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/** Для теста: лог в памяти с нуля */
export function resetCampaignLogForTest() {
  head = null;
  memBattles.length = 0;
  reason = null;
}
export const campaignLogHead = () => head;
