/**
 * Список кампаний для окна выбора (просьба Артура 2026-11-12: «в будущем кампании других рас, окно выбора кампании
 * на манер Варкрафта 3»). Играбельна пока одна — поход Рена за людей (`src/campaign/world.ts`); остальные расы — заглушки
 * «Скоро»: у них нет ни сюжета, ни карт, названия и описания придумаются вместе с Лороведом. Новая кампания — новая
 * запись здесь, свой регион и своё сохранение (сейчас сохранение похода одно, `dark_frontier_world`).
 */
import type { RaceId } from '../game/config';

export interface CampaignDef {
  id: string;
  race: RaceId;
  title: string;
  /** Пока нет сюжета — кампания закрыта и в окне выбора показана как «Скоро» */
  ready: boolean;
  blurb: string;
}

export const CAMPAIGNS: CampaignDef[] = [
  { id: 'humans', race: 'humans', title: 'Поход Рена', ready: true, blurb: 'Люди. Экспедиция высаживается на чужом континенте: пять глав, пять артефактов, глобальная карта.' },
  { id: 'orcs', race: 'orcs', title: 'Кампания орков', ready: false, blurb: 'Орки. Скоро.' },
  { id: 'undead', race: 'undead', title: 'Кампания нежити', ready: false, blurb: 'Нежить. Скоро.' },
  { id: 'cultists', race: 'cultists', title: 'Кампания культистов', ready: false, blurb: 'Культисты льда. Скоро.' },
  { id: 'demons', race: 'demons', title: 'Кампания демонов', ready: false, blurb: 'Демоны. Скоро.' },
  { id: 'elves', race: 'elves', title: 'Кампания тёмных эльфов', ready: false, blurb: 'Тёмные эльфы. Скоро.' },
];
