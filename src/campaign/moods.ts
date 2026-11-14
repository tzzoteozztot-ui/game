/**
 * Разметка эмоций реплик (просьба Артура 2026-11-13): сцена → номер реплики в сценарии (с нуля, до отбора по флагам) → эмоция.
 * Не размеченные реплики — спокойные (`neutral`). Тексты лежат в script_ch<N>.ts и пересобираются скриптом из сценария,
 * поэтому эмоции хранятся отдельно; тест проверяет, что каждая запись указывает на реплику говорящего с такой эмоцией.
 * Чтобы разметить другого персонажа — дописать его эмоции в `portraits.ts` и номера реплик сюда.
 */
import type { Mood } from './portraits';

const REN_MOODS: Record<string, Record<number, Mood>> = {
  'start': { 7: 'determined', 9: 'determined', 15: 'determined' },
  'sq1': { 1: 'smile' },
  'sq1-after': { 2: 'smile' },
  'chest1': { 1: 'worried', 3: 'smile' },
  'quarry-after': { 2: 'determined' },
  'warcamp': { 1: 'determined' },
  'warcamp-after': { 2: 'worried' },
  'sq7': { 1: 'determined' },
  'stavka': { 1: 'determined' },
  'fortress': { 5: 'determined' },
  'boss': { 2: 'determined', 4: 'determined' },
  'kallen': { 1: 'worried', 6: 'smile' },
  'fortress-after': { 6: 'determined' },
  'start:bog': { 4: 'determined', 6: 'determined', 9: 'smile' },
  'before:bog_sq2': { 1: 'determined' },
  'after:bog_sq2': { 1: 'determined', 8: 'determined', 10: 'determined', 13: 'determined', 15: 'determined' },
  'loot:bog_chest1': { 1: 'determined' },
  'event:bog_event1': { 3: 'sad' },
  'choice:bog_event1:1': { 2: 'sad' },
  'choice:bog_event1:2': { 2: 'sad' },
  'event:bog_forkB': { 1: 'worried', 3: 'determined' },
  'choice:bog_forkB:1': { 0: 'determined' },
  'choice:bog_forkB:2': { 4: 'determined' },
  'choice:bog_forkB:3': { 0: 'determined' },
  'choice:bog_forkB:4': { 0: 'determined' },
  'loot:bog_forkA': { 7: 'sad' },
  'after:bog_node': { 7: 'smile' },
  'before:bog_sq3': { 3: 'determined' },
  'event:bog_event3': { 3: 'worried' },
  'before:bog_guard': { 1: 'worried' },
  'before:bog_fortress': { 3: 'determined', 8: 'determined', 10: 'worried', 12: 'worried' },
  'wave:bog_fortress:12': { 3: 'determined', 5: 'determined', 7: 'determined', 10: 'angry' },
  'after:bog_fortress': { 6: 'determined', 8: 'determined', 12: 'sad', 14: 'sad' },
  'start:ice': { 1: 'worried', 3: 'smile', 5: 'worried' },
  'event:ice_event1': { 2: 'sad', 5: 'determined' },
  'choice:ice_event1:1': { 0: 'sad' },
  'after:ice_sq2': { 1: 'determined', 5: 'angry', 9: 'determined' },
  'after:ice_node': { 1: 'worried', 4: 'determined' },
  'loot:ice_forkA': { 3: 'determined' },
  'after:ice_sq3': { 9: 'worried', 15: 'worried', 17: 'sad', 19: 'determined' },
  'before:ice_event3': { 6: 'determined' },
  'wave:ice_event3:8': { 1: 'worried', 3: 'worried', 6: 'sad', 10: 'sad' },
  'after:ice_event3': { 0: 'sad', 5: 'sad', 7: 'sad', 9: 'sad', 11: 'determined', 14: 'determined', 17: 'worried', 21: 'sad' },
  'before:ice_rich': { 1: 'determined', 3: 'sad' },
  'before:ice_fortress': { 2: 'determined', 4: 'angry', 6: 'determined', 8: 'angry', 10: 'angry', 12: 'angry', 14: 'determined' },
  'wave:ice_fortress:12': { 1: 'determined' },
  'after:ice_fortress': { 3: 'determined', 5: 'sad', 7: 'sad' },
  'start:ash': { 2: 'worried', 5: 'worried', 8: 'determined' },
  'event:ash_event1': { 2: 'determined' },
  'after:ash_event1': { 2: 'sad', 4: 'angry', 6: 'determined', 8: 'determined', 10: 'determined', 12: 'determined' },
  'event:ash_forkA': { 1: 'determined', 5: 'determined', 9: 'sad' },
  'event:ash_forkB': { 2: 'determined' },
  'event:ash_event3': { 1: 'worried' },
  'after:ash_guard': { 1: 'determined', 5: 'determined' },
  'before:ash_fortress': { 1: 'determined', 2: 'determined', 5: 'angry', 8: 'sad', 11: 'angry' },
  'after:ash_fortress': { 3: 'determined' },
  'event:dusk_event1': { 3: 'angry', 5: 'determined', 8: 'determined', 10: 'determined' },
  'after:dusk_node': { 6: 'determined' },
  'event:dusk_forkB': { 3: 'determined' },
  'event:dusk_event3': { 1: 'sad', 3: 'sad', 5: 'sad', 7: 'determined' },
  'before:dusk_fortress': { 1: 'determined', 3: 'sad', 5: 'sad', 8: 'determined' },
  'after:dusk_fortress': { 6: 'sad', 9: 'sad', 11: 'sad' },
  'start:dusk': { 2: 'sad' },
};

/** Эмоции Каллена (Артур 2026-11-14): те же сцены, номера его реплик; у Рена и Каллена в одной сцене записи сливаются */
const KALLEN_MOODS: Record<string, Record<number, Mood>> = {
  'kallen': { 0: 'determined', 2: 'smile', 3: 'smile', 7: 'smile' },
  'fortress-after': { 5: 'smile', 7: 'determined' },
  'start:bog': { 3: 'smile', 5: 'smile', 8: 'smile' },
  'before:bog_sq2': { 0: 'worried' },
  'event:bog_event1': { 1: 'sad', 6: 'sad' },
  'choice:bog_event1:1': { 0: 'determined' },
  'choice:bog_event1:2': { 0: 'determined' },
  'loot:bog_forkA': { 4: 'worried' },
  'before:bog_sq3': { 2: 'worried', 4: 'smile' },
  'before:bog_fortress': { 2: 'worried', 9: 'determined', 11: 'determined', 13: 'smile' },
  'after:bog_fortress': { 11: 'smile', 13: 'sad', 16: 'smile' },
  'start:ice': { 0: 'smile', 2: 'smile', 8: 'smile' },
  'after:ice_sq3': { 1: 'smile', 3: 'smile', 4: 'worried', 7: 'worried', 10: 'worried', 13: 'worried' },
  'wave:ice_event3:8': { 0: 'sad', 2: 'sad', 4: 'worried', 7: 'sad', 8: 'determined' },
  'after:ice_event3': { 1: 'sad', 2: 'sad', 3: 'sad' },
};

export const MOODS: Record<string, Record<number, Mood>> = (() => {
  const all: Record<string, Record<number, Mood>> = {};
  for (const set of [REN_MOODS, KALLEN_MOODS]) for (const [id, byLine] of Object.entries(set)) all[id] = { ...all[id], ...byLine };
  return all;
})();
