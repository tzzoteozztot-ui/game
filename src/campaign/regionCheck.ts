/**
 * Проверка карты из редактора (просьба Артура 2026-11-12): ошибки по-русски. Состояния не меняет.
 * Главное — «пройдём ли»: герой с нуля, по очереди берёт всё, что открыто и до чего можно дойти
 * (враждебный объект стоит на пути, пока не разбит; замки `needs` и `needsAny` — как в игре).
 */
import { RegionDef, WorldObj, newWorld, isLocked, isCleared, winBattle, terrainAt, TERRAIN_COST, regionW, regionH, findPath, isHidden } from './world';

export interface CheckResult {
  errors: string[];
  warnings: string[];
}

const passable = (r: RegionDef, x: number, y: number) => {
  const t = terrainAt(r, x, y);
  return !!t && TERRAIN_COST[t] !== null;
};

export function checkRegion(r: RegionDef): CheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Set<string>();
  const cells = new Map<string, string>();
  if (!passable(r, r.start.x, r.start.y)) errors.push('Старт стоит на непроходимой местности.');
  for (const o of r.objects) {
    if (!o.id.trim()) errors.push(`У объекта «${o.name}» нет идентификатора.`);
    if (ids.has(o.id)) errors.push(`Повторяется идентификатор «${o.id}».`);
    ids.add(o.id);
    if (!passable(r, o.x, o.y)) errors.push(`«${o.name}» (${o.id}) стоит на непроходимой местности.`);
    const k = `${o.x},${o.y}`;
    if (cells.has(k)) errors.push(`«${o.name}» и «${cells.get(k)}» стоят в одном гексе.`);
    cells.set(k, o.name);
    if ((o.kind === 'squad' || o.kind === 'fortress' || (o.kind === 'mine' && o.waves)) && !(o.waves && o.waves > 0) && !o.army) warnings.push(`У «${o.name}» не задано число волн.`);
  }
  for (const o of r.objects)
    for (const id of [...(o.needs ?? []), ...(o.needsAny ?? [])]) if (!ids.has(id)) errors.push(`«${o.name}» требует несуществующий объект «${id}».`);
  if (r.objects.filter((o) => o.kind === 'camp').length !== 1) warnings.push('На карте должен быть ровно один лагерь.');
  if (!r.objects.some((o) => o.kind === 'fortress')) warnings.push('Нет крепости: поход в этой главе нечем закончить.');
  if (errors.length) return { errors, warnings };

  // Прохождение: каждый круг берём всё доступное
  const st = newWorld(r);
  st.seen = Array.from({ length: regionW(r) * regionH(r) }, (_, i) => i);
  const reachable = (o: WorldObj) => {
    const prevHero = st.hero;
    st.hero = { ...r.start };
    const p = o.x === r.start.x && o.y === r.start.y ? [o] : findPath(st, r, o);
    st.hero = prevHero;
    return !!p;
  };
  for (let guard = 0; guard < 200; guard++) {
    let moved = false;
    for (const o of r.objects) {
      if (isHidden(st, o) || isCleared(st, o.id) || isLocked(st, o)) continue;
      if (o.kind === 'camp' || (st.done.includes(o.id) && o.kind !== 'mine')) continue;
      if (!reachable(o)) continue;
      if (o.kind === 'event') {
        st.done.push(o.id);
        for (const c of o.choices ?? []) {
          if (c.flag) st.flags.push(c.flag);
          for (const f of c.flags ?? []) st.flags.push(f);
        }
      } else if (o.kind === 'mine' && !o.waves) st.owned.push(o.id);
      else winBattle(st, r, o.id);
      moved = true;
    }
    if (!moved) break;
  }
  for (const o of r.objects) {
    if (o.kind === 'camp' || isCleared(st, o.id) || (o.needsFlag && !st.flags.includes(o.needsFlag) && !isHidden(st, o))) continue;
    if (isHidden(st, o)) {
      warnings.push(`«${o.name}» появляется только после выбора с отметкой «${o.needsFlag}», которого нет ни в одном событии.`);
      continue;
    }
    errors.push(`«${o.name}» недостижим${isLocked(st, o) ? ': замки по порядку не открываются' : ': нет пути (всё перекрыто местностью или врагами)'}.`);
  }
  const fort = r.objects.find((o) => o.kind === 'fortress');
  if (fort && !st.done.includes(fort.id) && !errors.some((e) => e.includes(fort.name))) errors.push('Крепость взять нельзя.');
  return { errors, warnings };
}
