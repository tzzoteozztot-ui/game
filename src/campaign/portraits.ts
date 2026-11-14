/**
 * Портреты говорящих и их эмоции (просьба Артура 2026-11-13). У реплики может быть `mood` (`DialogLine`);
 * портрет берётся из `PORTRAITS[имя]`: файл по эмоции, а если для неё нет картинки (или эмоции нет) — `neutral`.
 * Нет записи у говорящего — старый портрет `public/portraits/<имя>.jpg` (`LEGACY_PORTRAITS`) или буква.
 * Чтобы добавить эмоции другому персонажу: положить `public/portraits/<файл>.jpg` и дописать его в `PORTRAITS`;
 * разметка реплик — `moods.ts`.
 */
export type Mood = 'neutral' | 'determined' | 'angry' | 'worried' | 'sad' | 'smile';

export const MOOD_NAMES: Record<Mood, string> = {
  neutral: 'спокойный',
  determined: 'решительный',
  angry: 'гнев',
  worried: 'тревога',
  sad: 'печаль',
  smile: 'улыбка',
};

/** Говорящий → эмоция → файл (без `.jpg`, в public/portraits/). Обязателен `neutral` */
export const PORTRAITS: Record<string, Partial<Record<Mood, string>> & { neutral: string }> = {
  Рен: {
    neutral: 'ren-neutral',
    determined: 'ren-determined',
    angry: 'ren-angry',
    worried: 'ren-worried',
    sad: 'ren-sad',
    smile: 'ren-smile',
  },
  Каллен: {
    neutral: 'kallen-neutral',
    determined: 'kallen-determined',
    angry: 'kallen-angry',
    worried: 'kallen-worried',
    sad: 'kallen-sad',
    smile: 'kallen-smile',
  },
};

/** Говорящие с одним портретом, без эмоций */
export const LEGACY_PORTRAITS: Record<string, string> = {
  Эхо: 'lina',
  Наместник: 'oris',
  Мельхиор: 'melkhior',
  Гарт: 'gart',
  Сефира: 'sefira',
  Осип: 'osip',
  Шаман: 'shaman',
  Ургаш: 'urgash',
  Сорн: 'sorn',
  Фелла: 'fella',
  Сайрит: 'sairit',
};

/** Файл портрета для говорящего и эмоции; `null` — портрета нет (рисуется буква) */
export function portraitFile(who: string, mood?: Mood): string | null {
  const set = PORTRAITS[who];
  if (set) return set[mood ?? 'neutral'] ?? set.neutral;
  return LEGACY_PORTRAITS[who] ?? null;
}

/** Все файлы говорящего — чтобы подгрузить заранее, пока эмоция не сменилась */
export function portraitFiles(who: string): string[] {
  const set = PORTRAITS[who];
  if (set) return [...new Set(Object.values(set))];
  const one = LEGACY_PORTRAITS[who];
  return one ? [one] : [];
}
