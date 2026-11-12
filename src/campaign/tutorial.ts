/**
 * Обучение в бою (просьба Артура 2026-11-12: «как во многих мобильных играх: подсвечивается кнопка, таймер замирает»).
 * Шаги боёв главы 1: подсказка Эхо над полем, подсвеченная кнопка (`mark` — значение `data-tut` у элемента),
 * таймер волны стоит, пока шаг не сделан (`freeze`); шаг с `lines` — диалог посреди боя (бой на паузе).
 * Шаг засчитывается по снимку состояния боя (`done`); пройденные шаги не возвращаются. «Пропустить обучение» —
 * на кнопке подсказки. Баланса не трогает.
 */
import type { GameStateSnapshot } from '../game/engine';
import type { DialogLine } from './dialogs';

export interface TutCtx {
  gs: GameStateSnapshot;
  /** Виды башен в карточках лавки */
  inShop: string[];
  /** Показанные сцены (для диалогов посреди боя) */
  scenes: string[];
  /** Что игрок уже делал за бой: 'speed' — менял скорость или ставил паузу */
  used: Set<string>;
}

export interface TutStep {
  id: string;
  /** Подсказка Эхо */
  text?: string;
  /** Подсвеченный элемент: значение `data-tut`; несколько — через «|» */
  mark?: string;
  /** Диалог посреди боя вместо подсказки */
  lines?: DialogLine[];
  /** Шаг нужен только при условии (иначе пропускается) */
  when?: (c: TutCtx) => boolean;
  /** Шаг сделан */
  done: (c: TutCtx) => boolean;
  /** Таймер волны стоит, пока шаг не сделан */
  freeze?: boolean;
  /** Выдать в рюкзак в начале шага (связка: готовые башни) */
  grant?: { type: string; startLevel: number }[]; // type: 'binder' — связка
}

const owned = (c: TutCtx, type: string) =>
  c.gs.towerList.filter((t) => t.type === type).length + c.gs.backpack.filter((b) => b.kind === 'tower' && b.type === type).length;
const placed = (c: TutCtx, type: string) => c.gs.towerList.filter((t) => t.type === type).length;
const waveStarted = (c: TutCtx) => c.gs.isWaveActive || c.gs.isSpawning || c.gs.wave > 1;

const startWave: TutStep = { id: 'start', text: 'Когда будете готовы, запускайте волну.', mark: 'wave', done: waveStarted, freeze: true };

const buyAndPlace = (id: string, type: string, name: string, extra = ''): TutStep[] => [
  { id: `reroll-${id}`, text: `Нужной башни нет. Обновите лавку: каждый следующий раз это дороже.`, mark: 'reroll', when: (c) => !c.inShop.includes(type) && owned(c, type) === 0, done: (c) => c.inShop.includes(type) || owned(c, type) > 0, freeze: true },
  { id: `buy-${id}`, text: `Лавка — справа от поля. Купите: ${name}.${extra}`, mark: `shop-${type}`, done: (c) => owned(c, type) > 0, freeze: true },
  { id: `place-${id}`, text: `Поставьте её на свободную клетку рядом с дорогой.`, done: (c) => placed(c, type) > 0, freeze: true },
];

const LEVELS: TutStep[] = [
  { id: 'buy3', text: 'Купите три одинаковые башни: Стрелков. Покупки ждут в рюкзаке под лавкой, пока вы их не поставите.', mark: 'shop-archer|backpack', done: (c) => owned(c, 'archer') >= 3, freeze: true },
  { id: 'place3', text: 'Поставьте все три на поле.', done: (c) => placed(c, 'archer') >= 3 || c.gs.towerList.some((t) => t.level >= 2), freeze: true },
  { id: 'merge', text: 'Выберите одну из них и нажмите «Слить».', mark: 'merge', done: (c) => c.gs.towerList.some((t) => t.level >= 2), freeze: true },
  {
    id: 'level2',
    lines: [
      { who: 'Сефира', text: 'Башня дошла до второго уровня, и теперь её силе можно придать форму. Огонь, молния или мороз. Выбор за вами.' },
      { who: 'Рен', text: 'Передумать потом получится?' },
      { who: 'Сефира', text: 'Нет. Выбранное направление магия не забывает.' },
    ],
    done: (c) => c.scenes.includes('tut:level2'),
  },
  { id: 'spec', text: 'Выберите свойство башни.', done: (c) => c.gs.towerList.some((t) => t.specs > 0), freeze: true },
  {
    id: 'move',
    lines: [{ who: 'Гарт', text: 'А если поставили башню неудачно — не беда. Между волнами её можно переставить. Без платы.' }],
    done: (c) => c.scenes.includes('tut:move'),
  },
  startWave,
];

export const TUTORIAL: Record<string, TutStep[]> = {
  sq1: [
    ...buyAndPlace('archer', 'archer', 'Стрелка', ' Он прост, зато надёжен: хорошо держит дорогу.'),
    startWave,
  ],
  sq2: [
    ...buyAndPlace('priest', 'priest', 'Жреца', ' Сам он никого не убьёт, зато укажет остальным, кого бить первым.'),
    { id: 'speed', text: 'Бой можно ускорить или поставить на паузу. Попробуйте кнопки скорости и паузы.', mark: 'speed|pause', done: (c) => c.used.has('speed') },
    startWave,
  ],
  saw: [...buyAndPlace('mage', 'mage', 'Мага'), startWave],
  sq3: [
    ...buyAndPlace('ballista', 'ballista', 'Баллисту'),
    {
      id: 'priority',
      text: 'Коснитесь Баллисты и нажмите «Цель»: можно выбрать, кого она ищет первым — ближнего, дальнего или самого сильного.',
      mark: 'priority',
      done: (c) => c.gs.towerList.some((t) => t.type === 'ballista' && t.priority !== 'first'),
      freeze: true,
    },
    startWave,
  ],
  ford: LEVELS,
  bridge: LEVELS,
  warcamp: [
    { id: 'tier', text: 'Поднимите ярус лавки: откроются сильные башни, а артефакт получит больше защиты. Нажмите «Ярус».', mark: 'tier', done: (c) => c.gs.tier >= 2, freeze: true },
    startWave,
  ],
  sq4: [
    {
      id: 'bind-place',
      text: 'Сефира дала осколок-связку и две готовые башни. Поставьте их на поле: связку и обе башни.',
      mark: 'backpack',
      grant: [{ type: 'binder', startLevel: 1 }, { type: 'archer', startLevel: 2 }, { type: 'mage', startLevel: 2 }],
      done: (c) => c.gs.towerList.filter((t) => t.level >= 2).length >= 2 && c.gs.binderCount >= 1,
      freeze: true,
    },
    { id: 'bind', text: 'Выберите первую башню, нажмите «Связать», затем коснитесь второй.', mark: 'bind', done: (c) => c.gs.towerList.some((t) => t.bound), freeze: true },
    startWave,
  ],
  sq7: [{ id: 'auto', text: 'Если оборона готова, включите автостарт: следующая волна начнётся сама.', mark: 'auto', done: (c) => c.gs.autoStart }],
};

/** Шаги для боя: недоделанные первыми, `null` — обучения здесь нет */
export const tutorialFor = (battleId: string): TutStep[] | null => TUTORIAL[battleId] ?? null;
