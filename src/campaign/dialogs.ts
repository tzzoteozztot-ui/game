/**
 * Диалоги похода: глава 1 «Поющий камень» — она же обучение (сценарий Лороведа,
 * /mnt/project-files/lore/campaign-ch1-tutorial.md; решения Артура 2026-11-06: тропа почти строго, две развилки;
 * в бою за крепость врывается Каллен и открывает армию; порядок уроков — сначала башни, потом уровни, потом связка).
 *
 * Сцена играется один раз (id сцены пишется в `WorldState.scenes`). Поводы (`SCENE_AT`):
 * `start` — начало похода; `before:<объект>` — перед боем; `after:<объект>` — после победы или захвата;
 * `loot:<объект>` — сундук, святилище; `camp` — приход в лагерь; `wave:<объект>:<N>` — волна N в бою (крепость).
 */
import { SCRIPT_CH1 } from './script_ch1';

export interface DialogLine {
  who: string;
  text: string;
}
export interface Scene {
  id: string;
  lines: DialogLine[];
}

/** Цвет имени говорящего */
export const SPEAKER_COLORS: Record<string, string> = {
  Рен: '#f2c75c',
  Эхо: '#6fe0d2',
  Каллен: '#f08a5d',
  Наместник: '#c9b48a',
  Мельхиор: '#b49be6',
  Гарт: '#e0a060',
  Сефира: '#8fb8ff',
  Осип: '#d8d27a',
  Шаман: '#9bd17a',
};

/** Кто говорит — подпись в скобках после имени (литературная редакция Лороведа) */
export const SPEAKER_ROLES: Record<string, string> = {
  Рен: 'капитан',
  Эхо: 'Лина',
  Каллен: 'друг Рена',
  Наместник: 'Орис Вельд',
  Мельхиор: 'хронист',
  Гарт: 'кузнец',
  Сефира: 'маг',
  Осип: 'казначей',
  Шаман: 'через Мельхиора',
};


/** Сцены всех глав. Тексты — из сценариев Лороведа (scripts/dialogs_from_md.py пересобирает script_ch<N>.ts) */
export const SCENES: Scene[] = [...SCRIPT_CH1];

/** Повод → сцена. Развилка у реки: урок уровней звучит у того перехода, который игрок взял первым */
export const SCENE_AT: Record<string, string> = {
  start: 'start',
  'before:sq1': 'sq1',
  'after:sq1': 'sq1-after',
  'loot:chest1': 'chest1',
  'before:sq2': 'sq2',
  'after:sq2': 'sq2-after',
  'after:quarry': 'quarry-after',
  camp: 'camp',
  'before:saw': 'saw',
  'loot:shrine': 'shrine',
  'before:sq3': 'sq3',
  'before:warcamp': 'warcamp',
  'after:warcamp': 'warcamp-after',
  'before:ford': 'levels',
  'before:bridge': 'levels',
  'before:sq4': 'sq4',
  'before:sq5': 'sq5',
  'after:goldmine': 'goldmine-after',
  'after:node': 'node-after',
  'before:sq6': 'sq6',
  'before:sq7': 'sq7',
  'before:guard': 'guard',
  'before:stavka': 'stavka',
  'before:fortress': 'fortress',
  'wave:fortress:8': 'kallen',
  'wave:fortress:12': 'boss',
  'after:fortress': 'fortress-after',
};

/** Сцена повода, если её ещё не показывали */
export function sceneFor(trigger: string, seen: string[]): Scene | null {
  const id = SCENE_AT[trigger];
  if (!id || seen.includes(id)) return null;
  return SCENES.find((s) => s.id === id) ?? null;
}
