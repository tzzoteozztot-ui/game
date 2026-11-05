/**
 * Свои карты свободного режима (просьба Артура 2026-11-05): хранятся на устройстве в localStorage
 * `dark_frontier_custom_maps` — список черновиков (местность, дорога, выходы, клетки без башен).
 */

import { MapDraft } from './game/mapEditor';
import { Point } from './game/maps';

export interface SavedMap extends MapDraft {
  id: string;
  saved: number; // время сохранения, мс
}

const KEY = 'dark_frontier_custom_maps';

const points = (v: unknown): Point[] =>
  Array.isArray(v) ? v.filter((p) => p && Number.isInteger(p.x) && Number.isInteger(p.y)).map((p) => ({ x: p.x, y: p.y })) : [];

export function loadCustomMaps(): SavedMap[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((m) => m && typeof m.id === 'string')
      .map((m) => ({
        id: m.id,
        name: String(m.name || 'Своя карта').slice(0, 40),
        level: Number.isInteger(m.level) ? m.level : 1,
        road: points(m.road),
        exits: points(m.exits),
        blocked: points(m.blocked),
        saved: Number(m.saved) || 0,
      }));
  } catch {
    return [];
  }
}

function store(list: SavedMap[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* хранилище недоступно — карта живёт до конца партии */
  }
}

/** Сохранить черновик; карта с тем же названием перезаписывается. Возвращает новый список */
export function saveCustomMap(draft: MapDraft): SavedMap[] {
  const list = loadCustomMaps();
  const name = draft.name.trim().slice(0, 40) || 'Своя карта';
  const old = list.find((m) => m.name === name);
  const entry: SavedMap = { ...draft, name, id: old?.id ?? `m${Date.now().toString(36)}`, saved: Date.now() };
  const next = old ? list.map((m) => (m === old ? entry : m)) : [...list, entry];
  store(next);
  return next;
}

export function deleteCustomMap(id: string): SavedMap[] {
  const next = loadCustomMaps().filter((m) => m.id !== id);
  store(next);
  return next;
}
