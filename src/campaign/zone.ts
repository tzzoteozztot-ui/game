/**
 * Зона отряда (просьба Артура 2026-11-12: «враги на карте», нельзя пройти мимо): отряд и крепость цепочки крепости
 * держат соседние гексы — шагнуть к ним, не вступив в бой, нельзя. Необязательные отряды (вне цепочки замков крепости)
 * мимо пройти можно. Состояния не меняет.
 */
import { WorldObj, WorldState, RegionDef, hexNeighbours, isHostile, isLocked, objectAt } from './world';
import { requiredIds } from './journal';

const adjacent = (a: { x: number; y: number }, b: { x: number; y: number }) => hexNeighbours(a.x, a.y).some((n) => n.x === b.x && n.y === b.y);

/** Отряд, который не пускает героя с гекса `from` на гекс `to`: гекс `to` — рядом с ним, а `from` — нет */
export function blockerFor(st: WorldState, region: RegionDef, from: { x: number; y: number }, to: { x: number; y: number }): WorldObj | null {
  const req = requiredIds(region);
  for (const n of hexNeighbours(to.x, to.y)) {
    const o = objectAt(st, region, n.x, n.y);
    if (!o || (o.kind !== 'squad' && o.kind !== 'fortress')) continue;
    if (!req.has(o.id) || !isHostile(st, o) || isLocked(st, o)) continue;
    if (adjacent(from, o) || (from.x === o.x && from.y === o.y)) continue;
    return o;
  }
  return null;
}
