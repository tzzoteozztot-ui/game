/**
 * Дневник похода (просьба Артура 2026-11-12: «не маркер, а дневник с задачами»): список задач региона,
 * собранный из объектов карты и их замков (`needs`, `needsAny`). Своих данных не хранит, состояние похода не меняет.
 * Главная задача — взять крепость; «обязательно» — всё, без чего её не открыть; остальное — по желанию.
 */
import { WorldObj, WorldState, RegionDef, isCleared, isHidden, isLocked, lockText, hexDistance, findPath, isSeen, EventChoice } from './world';

export interface JournalTask {
  obj: WorldObj;
  /** Нужна для крепости (иначе — необязательная) */
  required: boolean;
  /** Закрыта: что нужно пройти раньше (`lockText`) */
  locked: string | null;
  /** Расстояние от героя в гексах */
  dist: number;
}

export interface Journal {
  /** Главная цель: крепость главы */
  goal: JournalTask | null;
  /** Можно идти сейчас: сначала обязательные, потом по близости */
  open: JournalTask[];
  /** Ещё закрыты */
  locked: JournalTask[];
  /** Выполнено / всего */
  done: number;
  total: number;
  /** Решения в событиях главы с отметкой: что выбрали */
  choices: { name: string; text: string }[];
}

/** Объекты, без которых крепость не открыть: все её замки по цепочке (для `needsAny` — любой из вариантов) */
function requiredIds(region: RegionDef): Set<string> {
  const byId = new Map(region.objects.map((o) => [o.id, o]));
  const out = new Set<string>();
  const walk = (id: string) => {
    if (out.has(id)) return;
    out.add(id);
    const o = byId.get(id);
    for (const n of [...(o?.needs ?? []), ...(o?.needsAny ?? [])]) walk(n);
  };
  const f = region.objects.find((o) => o.kind === 'fortress');
  if (f) walk(f.id);
  return out;
}

export function buildJournal(st: WorldState, region: RegionDef): Journal {
  const req = requiredIds(region);
  // Путь считаем по настоящей местности, без тумана (в тумане findPath считает любой гекс травой)
  const all = { ...st, seen: Array.from({ length: region.terrain.length * region.terrain[0].length }, (_, i) => i) };
  // В дневнике только то, что уже видно на карте (и крепость — главная цель): туман не спойлерим
  const tasks = region.objects.filter((o) => o.kind !== 'camp' && !isHidden(st, o) && (o.kind === 'fortress' || isCleared(st, o.id) || isSeen(st, region, o.x, o.y)));
  // Замок тропы или нет пути (другой берег, закрытый переход): тогда задача пока недоступна
  const mk = (o: WorldObj): JournalTask => ({
    obj: o,
    required: req.has(o.id),
    locked: isLocked(st, o) ? lockText(st, region, o) : findPath(all, region, o) || (o.x === st.hero.x && o.y === st.hero.y) ? null : 'путь закрыт отрядом или рекой',
    dist: hexDistance(st.hero, o),
  });
  const todo = tasks.filter((o) => !isCleared(st, o.id)).map(mk);
  const byDist = (a: JournalTask, b: JournalTask) => Number(b.required) - Number(a.required) || a.dist - b.dist;
  const goal = todo.find((t) => t.obj.kind === 'fortress') ?? null;
  const choices: Journal['choices'] = [];
  for (const o of region.objects) {
    if (!st.done.includes(o.id)) continue;
    const c = (o.choices ?? []).find((x: EventChoice) => [x.flag, ...(x.flags ?? [])].some((f) => f && st.flags.includes(f)));
    if (c) choices.push({ name: o.name, text: c.label });
  }
  return {
    goal,
    open: todo.filter((t) => !t.locked && t !== goal).sort(byDist),
    locked: todo.filter((t) => t.locked && t !== goal).sort(byDist),
    done: tasks.length - todo.length,
    total: tasks.length,
    choices,
  };
}
