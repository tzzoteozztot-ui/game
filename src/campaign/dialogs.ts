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
import { SCRIPT_CH2 } from './script_ch2';
import { SCRIPT_CH3 } from './script_ch3';
import { SCRIPT_CH4 } from './script_ch4';
import { SCRIPT_CH5 } from './script_ch5';
import { MOODS } from './moods';
import type { Mood } from './portraits';

export interface DialogLine {
  who: string;
  text: string;
  role?: string; // подпись в скобках, если не обычная (`SPEAKER_ROLES`)
  mood?: Mood; // эмоция говорящего (портрет меняется, `portraits.ts`); нет — спокойный; размечается в `moods.ts`
  hint?: string; // пояснение игроку про кнопки и клавиши: строка под репликой, не слова героя (`{игроку: …}` в сценарии)
  if?: string; // реплика звучит при флагах выбора: «korh-trade», «!korh-fight» — флага нет; через запятую — все сразу
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
  Ургаш: '#c98a4a',
  Сорн: '#a7b4c8',
  Корх: '#a7b4c8',
  Фелла: '#c7a0e0',
  'Бо-Рок': '#c9a26a',
  Исс: '#9fd8f0',
  Ксаар: '#8fcf8a',
  Хельдрим: '#b8e4ff',
  "Мал'кеш": '#ff7a50',
  Сайрит: '#c58cff',
  Голос: '#9a9a9a',
  'Голос льда': '#b8e4ff',
  'Зеркальная тень Каллена': '#9a9a9a',
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
  Ургаш: 'вождь орков',
  Сорн: 'чужое знамя',
  Корх: 'чужое знамя',
  Фелла: 'грибной народ',
  'Бо-Рок': 'обезьянолюди',
  Исс: 'культист',
};


/** Сцены всех глав. Тексты — из сценариев Лороведа (scripts/dialogs_from_md.py пересобирает script_ch<N>.ts) */
export const SCENES: Scene[] = [...SCRIPT_CH1, ...SCRIPT_CH2, ...SCRIPT_CH3, ...SCRIPT_CH4, ...SCRIPT_CH5].map((sc) => {
  const moods = MOODS[sc.id];
  return moods ? { ...sc, lines: sc.lines.map((l, i) => (moods[i] ? { ...l, mood: moods[i] } : l)) } : sc;
});

/** Повод начала главы: в Пограничье — `start`, дальше — `start:<регион>` */
export const startTrigger = (region: string) => (region === 'frontier' ? 'start' : `start:${region}`);
/** Повод прихода в лагерь и объект, после которого он звучит (урок построек) */
export const CAMP_SCENES: Record<string, { trigger: string; after: string }> = {
  frontier: { trigger: 'camp', after: 'quarry' },
  bog: { trigger: 'camp:bog', after: 'bog_mine1' },
};

/** Повод → сцена главы 1 (в главах 2–5 id сцены — сам повод). Развилка у реки: урок уровней звучит у того перехода, который игрок взял первым */
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
export function sceneFor(trigger: string, seen: string[], flags: string[] = []): Scene | null {
  const id = SCENE_AT[trigger] ?? trigger;
  if (seen.includes(id)) return null;
  const sc = SCENES.find((s) => s.id === id);
  if (!sc) return null;
  const ok = (cond?: string) => !cond || cond.split(',').every((c) => (c.startsWith('!') ? !flags.includes(c.slice(1)) : flags.includes(c)));
  const lines = sc.lines.filter((l) => ok(l.if));
  return lines.length ? { ...sc, lines } : null;
}
