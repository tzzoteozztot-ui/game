/**
 * Сохранение боя с армией на передышке между этапами (просьба Артура 2026-11-12, «сохранения из варианта 4»).
 * Одно на устройстве: после победы стирается, после отступления и поражения остаётся — с него можно начать снова.
 */

import type { BattleCheckpoint } from '../game/engine';

const KEY = 'dark_frontier_battle_save';

export interface BattleSave {
  obj: string;
  region: string;
  at: number;
  stage: number; // сколько этапов позади
  total: number;
  engine: BattleCheckpoint;
  bot: unknown;
  shop: unknown[];
}

export function loadBattleSave(): BattleSave | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as BattleSave;
    if (!s || s.engine?.v !== 1 || typeof s.obj !== 'string' || !Array.isArray(s.engine.towers)) return null;
    return s;
  } catch {
    return null;
  }
}

export function saveBattleSave(s: BattleSave) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* нет места или запрещено — бой просто не сохранится */
  }
}

export function clearBattleSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ничего */
  }
}
