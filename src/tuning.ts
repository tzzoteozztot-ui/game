/**
 * Свои наборы правок (просьба Артура 2026-11-15, первый шаг к редактору режимов): пресет хранит только отличия
 * от стандартного баланса и действует лишь в тестовом запуске из «Редактора». Стандарт в `config.ts` не меняется:
 * перед каждым применением значения возвращаются к снимку, а при выходе в меню — сбрасываются.
 *
 * Структура расширяема: у пресета отдельные разделы (`towers`, `upgrade`); враги, волны и правила режима
 * добавляются новыми разделами и новой парой «снимок → применение» в `applyPreset`.
 */

import { CONFIG, TowerType } from './game/config';

export const TOWER_FIELDS = ['cost', 'damage', 'cooldown', 'range', 'aoe'] as const;
export type TowerField = (typeof TOWER_FIELDS)[number];
export const UPGRADE_FIELDS = ['lvl2DamageMult', 'lvl2RangeMult', 'lvl3DamageMult', 'lvl3RangeMult', 'sellRatio'] as const;
export type UpgradeField = (typeof UPGRADE_FIELDS)[number];

export const TOWER_FIELD_LABELS: Record<TowerField, string> = {
  cost: 'Цена',
  damage: 'Урон',
  cooldown: 'Период, с',
  range: 'Радиус, кл.',
  aoe: 'Площадь, кл.',
};
export const UPGRADE_FIELD_LABELS: Record<UpgradeField, string> = {
  lvl2DamageMult: 'Урон Ур.2 (×)',
  lvl2RangeMult: 'Радиус Ур.2 (×)',
  lvl3DamageMult: 'Урон Ур.3 (×)',
  lvl3RangeMult: 'Радиус Ур.3 (×)',
  sellRatio: 'Возврат при продаже (доля)',
};

export interface TuningPreset {
  id: string;
  name: string;
  towers: Partial<Record<TowerType, Partial<Record<TowerField, number>>>>;
  upgrade: Partial<Record<UpgradeField, number>>;
}

export interface TuningStore {
  version: 1;
  activeId: string | null;
  presets: TuningPreset[];
}

const KEY = 'dark_frontier_tuning_presets';

export function loadTuning(): TuningStore {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (raw && raw.version === 1 && Array.isArray(raw.presets)) {
      const presets: TuningPreset[] = raw.presets
        .filter((p: any) => p && typeof p.id === 'string' && typeof p.name === 'string')
        .map((p: any) => ({ id: p.id, name: p.name, towers: cleanTowers(p.towers), upgrade: cleanUpgrade(p.upgrade) }));
      const activeId = presets.some((p) => p.id === raw.activeId) ? raw.activeId : presets[0]?.id ?? null;
      return { version: 1, activeId, presets };
    }
  } catch {
    /* повреждённое хранилище — начинаем с пустого */
  }
  return { version: 1, activeId: null, presets: [] };
}

export function saveTuning(store: TuningStore) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* хранилище недоступно — набор живёт до закрытия вкладки */
  }
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

function cleanTowers(raw: any): TuningPreset['towers'] {
  const out: TuningPreset['towers'] = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const type of Object.keys(CONFIG.towers) as TowerType[]) {
    const src = raw[type];
    if (!src || typeof src !== 'object') continue;
    const patch: Partial<Record<TowerField, number>> = {};
    for (const f of TOWER_FIELDS) {
      const v = num(src[f]);
      if (v !== null && (f !== 'aoe' || CONFIG.towers[type].aoe !== undefined)) patch[f] = v;
    }
    if (Object.keys(patch).length) out[type] = patch;
  }
  return out;
}

function cleanUpgrade(raw: any): TuningPreset['upgrade'] {
  const out: TuningPreset['upgrade'] = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const f of UPGRADE_FIELDS) {
    const v = num(raw[f]);
    if (v !== null) out[f] = v;
  }
  return out;
}

export function newPreset(name: string, from?: TuningPreset): TuningPreset {
  return {
    id: `p${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`,
    name,
    towers: from ? JSON.parse(JSON.stringify(from.towers)) : {},
    upgrade: from ? { ...from.upgrade } : {},
  };
}

// ---------------- стандарт и применение ----------------

type Snapshot = { towers: Record<string, Partial<Record<TowerField, number>>>; upgrade: Record<string, number> };
let defaults: Snapshot | null = null;

/** Снимок стандартного баланса; снимается один раз, до первой подмены. */
function takeDefaults(): Snapshot {
  if (defaults) return defaults;
  const towers: Snapshot['towers'] = {};
  for (const [type, def] of Object.entries(CONFIG.towers)) {
    const s: Partial<Record<TowerField, number>> = {};
    for (const f of TOWER_FIELDS) {
      const v = (def as any)[f];
      if (typeof v === 'number') s[f] = v;
    }
    towers[type] = s;
  }
  const upgrade: Snapshot['upgrade'] = {};
  for (const f of UPGRADE_FIELDS) upgrade[f] = CONFIG.upgrade[f];
  defaults = { towers, upgrade };
  return defaults;
}

export function towerDefault(type: TowerType, f: TowerField): number | undefined {
  return takeDefaults().towers[type]?.[f];
}
export function upgradeDefault(f: UpgradeField): number {
  return takeDefaults().upgrade[f];
}

let applied = false;
export function tuningApplied(): boolean {
  return applied;
}

/** Возвращает стандартные значения. */
export function resetTuning() {
  if (!defaults) return;
  for (const [type, s] of Object.entries(defaults.towers)) Object.assign((CONFIG.towers as any)[type], s);
  for (const f of UPGRADE_FIELDS) CONFIG.upgrade[f] = defaults.upgrade[f];
  applied = false;
}

/** Ставит набор поверх стандарта (сначала сбрасывает прежний). */
export function applyPreset(p: TuningPreset) {
  takeDefaults();
  resetTuning();
  for (const [type, patch] of Object.entries(p.towers)) {
    const def = (CONFIG.towers as any)[type];
    if (def && patch) Object.assign(def, patch);
  }
  for (const [f, v] of Object.entries(p.upgrade)) (CONFIG.upgrade as any)[f] = v;
  applied = true;
}

/** Сколько значений набор меняет. */
export function presetChangeCount(p: TuningPreset): number {
  let n = Object.keys(p.upgrade).length;
  for (const patch of Object.values(p.towers)) n += Object.keys(patch ?? {}).length;
  return n;
}
