/**
 * Главы 2–5 похода (Артур, 2026-11-07: «создаёт новые карты для следующих глав без моих подтверждений»).
 * Каждая глава — регион биома своей карты (2 Болотный склеп, 3 Ледяные пустоши, 4 Выжженные земли, 5 Цитадель сумерек),
 * враги — её хозяева. Все четыре строятся по одной схеме тропы (`SLOTS`): лагерь, три отряда до реки, промысел, событие,
 * развилка (святилище или второе событие), переправа, малый узел, отряд, событие, стража, крепость и необязательные
 * сундуки, рудник и богатый лагерь. Схема поворачивается (`flipX`, `flipY`), чтобы карты не были одинаковыми.
 * Названия и события главы 2 — по черновику Лороведа (/mnt/project-files/lore/campaign-ch2-bog.md), главы 3–5 —
 * заготовка до его текстов. Волны, награды и доходы — черновик.
 */
import type { RegionSpec, WorldObj, WorldProp, PropKind } from './world';

type P = { x: number; y: number };
const W = 52;
const H = 32;
const baseRiver = (y: number) => Math.round(26 + 2 * Math.sin(y / 5));

/** Слот схемы: место, вид и замки; содержимое (имя, волны, награда) задаёт глава */
interface Slot {
  key: string;
  at: P;
  kind: WorldObj['kind'];
  needs?: string[];
  needsAny?: string[];
}
const CROSS: P = { x: baseRiver(16), y: 16 };
const SLOTS: Slot[] = [
  { key: 'camp', at: { x: 5, y: 16 }, kind: 'camp' },
  { key: 'sq1', at: { x: 10, y: 15 }, kind: 'squad' },
  { key: 'sq2', at: { x: 14, y: 11 }, kind: 'squad', needs: ['sq1'] },
  { key: 'chest1', at: { x: 12, y: 6 }, kind: 'chest', needs: ['sq2'] },
  { key: 'mine1', at: { x: 7, y: 22 }, kind: 'mine', needs: ['sq1'] },
  { key: 'event1', at: { x: 15, y: 21 }, kind: 'event', needs: ['mine1', 'sq2'] },
  { key: 'forkA', at: { x: 20, y: 25 }, kind: 'shrine', needs: ['event1'] },
  { key: 'forkB', at: { x: 20, y: 9 }, kind: 'event', needs: ['event1'] },
  { key: 'cross', at: CROSS, kind: 'squad', needsAny: ['forkA', 'forkB'] },
  { key: 'node', at: { x: 34, y: 10 }, kind: 'mine', needs: ['cross'] },
  { key: 'gold', at: { x: 30, y: 5 }, kind: 'mine', needs: ['cross'] },
  { key: 'sq3', at: { x: 36, y: 20 }, kind: 'squad', needs: ['node'] },
  { key: 'event3', at: { x: 40, y: 27 }, kind: 'event', needs: ['sq3'] },
  { key: 'rich', at: { x: 46, y: 24 }, kind: 'squad', needs: ['event3'] },
  { key: 'chest2', at: { x: 31, y: 23 }, kind: 'chest' },
  { key: 'chest3', at: { x: 44, y: 6 }, kind: 'chest' },
  { key: 'guard', at: { x: 42, y: 15 }, kind: 'squad', needs: ['sq3'] },
  { key: 'fortress', at: { x: 47, y: 15 }, kind: 'fortress', needs: ['guard'] },
];
const ROADS: (string | P)[][] = [
  ['camp', 'sq1', 'sq2', 'forkB', { x: 23, y: 16 }, 'cross'],
  ['camp', 'mine1', 'event1', 'forkA', { x: 21, y: 19 }, { x: 23, y: 16 }],
  ['sq2', 'chest1'],
  ['sq1', { x: 13, y: 18 }, 'event1'],
  ['cross', { x: 31, y: 14 }, 'node', 'chest3'],
  ['node', 'gold'],
  [{ x: 31, y: 14 }, 'sq3', 'guard', 'fortress'],
  ['sq3', 'chest2'],
  ['sq3', 'event3', 'rich'],
];
const PROPS: { kind: PropKind; at: P }[] = [
  { kind: 'ruins', at: { x: 3, y: 13 } },
  { kind: 'stones', at: { x: 12, y: 18 } },
  { kind: 'graves', at: { x: 22, y: 22 } },
  { kind: 'wreck', at: { x: 33, y: 17 } },
  { kind: 'ruins', at: { x: 38, y: 8 } },
  { kind: 'graves', at: { x: 45, y: 12 } },
];

/** Содержимое слота в главе */
type Fill = Omit<WorldObj, 'id' | 'kind' | 'x' | 'y' | 'needs' | 'needsAny'>;

interface ChapterDef {
  id: string;
  name: string;
  level: number;
  chapter: number;
  prefix: string;
  flipX?: boolean;
  flipY?: boolean;
  seed: number;
  lake?: number;
  rock?: number;
  forest?: number;
  hills?: number;
  wild: PropKind[];
  next?: string;
  fill: Record<string, Fill>;
}

function makeChapter(d: ChapterDef): RegionSpec {
  const tx = (p: P): P => ({ x: d.flipX ? W - 1 - p.x : p.x, y: d.flipY ? H - 1 - p.y : p.y });
  const id = (key: string) => (key === 'camp' ? `${d.prefix}camp` : `${d.prefix}${key}`);
  const at = (k: string | P): P => tx(typeof k === 'string' ? SLOTS.find((s) => s.key === k)!.at : k);
  const objects: WorldObj[] = SLOTS.map((s) => ({
    id: id(s.key),
    kind: s.kind,
    ...tx(s.at),
    ...d.fill[s.key],
    ...(s.needs ? { needs: s.needs.map(id) } : {}),
    ...(s.needsAny ? { needsAny: s.needsAny.map(id) } : {}),
  }));
  const fortress = objects.find((o) => o.kind === 'fortress')!;
  fortress.weakenedBy = id('node');
  const river = (y: number) => {
    const ry = d.flipY ? H - 1 - y : y;
    const x = baseRiver(ry);
    return d.flipX ? W - 2 - x : x;
  };
  const camp = at('camp');
  return {
    id: d.id,
    name: d.name,
    level: d.level,
    chapter: d.chapter,
    w: W,
    h: H,
    start: { x: camp.x + (d.flipX ? -1 : 1), y: camp.y },
    objects,
    roads: ROADS.map((chain) => chain.map(at)),
    props: PROPS.map((p) => ({ kind: p.kind, ...tx(p.at) }) as WorldProp),
    river,
    crossings: [at('cross')],
    seed: d.seed,
    lake: d.lake,
    rock: d.rock,
    forest: d.forest,
    hills: d.hills,
    wild: d.wild,
    next: d.next,
  };
}

// ---------------------------------------------------------------------------------------------- глава 2
const BOG = makeChapter({
  id: 'bog',
  name: 'Болотный склеп',
  level: 2,
  chapter: 2,
  prefix: 'bog_',
  seed: 200,
  lake: 0.66,
  rock: 0.62,
  forest: 0.55,
  wild: ['deadwood', 'castle', 'statue', 'deadwood', 'tower', 'crystals'],
  next: 'ice',
  fill: {
    camp: { name: 'Лагерь у второго узла', text: 'Лагерь перенесли к новому узлу. Вокруг топь и туман.' },
    sq1: { name: 'Топь у входа', waves: 4, reward: { gold: 60 }, text: 'Из тумана идут тела. Не орки и не звери.' },
    sq2: { name: 'Чужое знамя', waves: 3, reward: { gold: 50, crystal: 1 }, text: 'Знамя не наше, но под ним люди. Живые.' },
    chest1: { name: 'Обоз чужого знамени', reward: { gold: 90 } },
    mine1: { name: 'Торфяник', waves: 4, income: { wood: 5 }, text: 'Торф горит долго. Отобьём — топливо и доски каждый день.' },
    event1: {
      name: 'Утонувшая деревня',
      text: 'Деревня орков ушла под воду. В доме старосты — дневник. Тела лежат там, где их застала вода.',
      choices: [
        { label: 'Сжечь тела по обычаю орков', text: 'Мельхиор записал: «Мы сделали по их обычаю». Дым долго стоял над топью.', flag: 'burned' },
        { label: 'Не трогать', text: 'Мельхиор записал: «Мы не стали решать за них». Нежить ушла от деревни без шума.', reward: { crystal: 1 } },
      ],
    },
    forkA: { name: 'Склеп-святилище', reward: { crystal: 3 }, text: 'Старый склеп. Здесь хоронили задолго до орков.' },
    forkB: {
      name: 'Грибная роща',
      text: 'Грибница оплела узел и кормится его силой. Вестница Фелла ждёт у самой большой шляпки.',
      choices: [
        { label: 'Торговля: сведения о Ксааре', text: 'Фелла рассказала, где слабеет склеп. Люди больше не жгут грибницу в этом краю.', reward: { crystal: 2 }, flag: 'fella-trade' },
        { label: 'Поручение: найти семя в склепе', text: 'Фелла дала лечебные споры и ждёт семя. Обещание записано.', reward: { gold: 80 }, flag: 'fella-task' },
        { label: 'Пройти мимо', text: 'Хронист промолчал.' },
      ],
    },
    cross: { name: 'Мертвецы у брода', waves: 6, reward: { gold: 100 }, text: 'Брод держат мертвецы. Другой дороги на тот берег нет.' },
    node: { name: 'Малый узел «Ступень»', waves: 6, income: { crystal: 1 }, text: 'Узел той же сети. Взятый, он ослабит защиту склепа.' },
    gold: { name: 'Затопленная шахта', waves: 5, income: { gold: 25 } },
    sq3: { name: 'Клетка погоста', waves: 7, reward: { gold: 110, crystal: 1 }, text: 'Пока рядом старший, мёртвые встают быстрее.' },
    event3: {
      name: 'Затонувшая казна',
      text: 'Под водой сундуки. Чьи — не знает даже Осип. Рядом никого.',
      choices: [
        { label: 'Поднять казну', text: 'Казна поднята. Осип пересчитал дважды.', reward: { gold: 160 } },
        { label: 'Оставить', text: 'Осип вздохнул, но спорить не стал.', reward: { crystal: 1 }, flag: 'left-treasury' },
      ],
    },
    rich: { name: 'Курган некроманта', waves: 9, reward: { gold: 300, crystal: 5 }, text: 'Необязательный бой. Курган богат, охрана сильна.' },
    chest2: { name: 'Гнилая лодка', reward: { gold: 60, wood: 15 } },
    chest3: { name: 'Сундук утопленника', reward: { gold: 90, crystal: 1 } },
    guard: { name: 'Стража склепа', waves: 9, reward: { gold: 140, crystal: 2 }, text: 'Тяжёлые мертвецы в броне.' },
    fortress: {
      name: 'Склеп Ксаара',
      waves: 12,
      army: 'normal',
      reward: { gold: 250, crystal: 6 },
      text: 'Лич Ксаар. Пока лагерь Некрополя стоит, волны не кончатся.',
    },
  },
});

// ---------------------------------------------------------------------------------------------- глава 3
const ICE = makeChapter({
  id: 'ice',
  name: 'Ледяные пустоши',
  level: 3,
  chapter: 3,
  prefix: 'ice_',
  flipY: true,
  seed: 300,
  lake: 0.74,
  rock: 0.4,
  forest: 0.7,
  hills: 0.55,
  wild: ['crystals', 'cliff', 'statue', 'tower', 'crystals', 'cliff'],
  next: 'ash',
  fill: {
    camp: { name: 'Лагерь у третьего узла', text: 'Снег и ветер. Холод здесь чужой: его принесли культисты.' },
    sq1: { name: 'Ледяной дозор', waves: 5, reward: { gold: 80 } },
    sq2: { name: 'Неофиты у тропы', waves: 5, reward: { gold: 70, crystal: 1 } },
    chest1: { name: 'Вмёрзшие сани', reward: { gold: 110 } },
    mine1: { name: 'Ледяная каменоломня', waves: 5, income: { wood: 5 } },
    event1: {
      name: 'Вмёрзший отряд',
      text: 'Во льду стоят люди. Не наши. На доспехах знаки чужого знамени.',
      choices: [
        { label: 'Вырубить и похоронить', text: 'Гарт работал до темноты. Мельхиор записал имена с жетонов.', flag: 'buried-frozen' },
        { label: 'Забрать снаряжение', text: 'Осип внёс в опись: сталь хорошая. Каллен долго молчал.', reward: { gold: 120 } },
      ],
    },
    forkA: { name: 'Ледяной алтарь', reward: { crystal: 3 }, text: 'Алтарь культа. Лёд на нём не тает даже у костра.' },
    forkB: {
      name: 'Беглец из культа',
      text: 'Неофит без оружия просит еды и укрытия. Говорит, что совет жрецов готовит что-то у переправы.',
      choices: [
        { label: 'Накормить и отпустить', text: 'Он рассказал о засаде у переправы и ушёл на юг.', reward: { crystal: 1 }, flag: 'fed-deserter' },
        { label: 'Взять проводником', text: 'Он провёл отряд коротким путём и исчез ночью.', reward: { gold: 60 } },
      ],
    },
    cross: { name: 'Застава у ледяной переправы', waves: 7, reward: { gold: 130 }, text: 'Река скована льдом только здесь.' },
    node: { name: 'Малый узел во льду', waves: 7, income: { crystal: 1 }, text: 'Узел вморожен в ледник. Взятый, он ослабит храм.' },
    gold: { name: 'Серебряная жила', waves: 6, income: { gold: 30 } },
    sq3: { name: 'Хранители алтаря', waves: 8, reward: { gold: 140, crystal: 2 } },
    event3: {
      name: 'Ледяное зеркало',
      text: 'Гладкий лёд показывает не отражение, а чужой берег. Сефира хочет изучить его.',
      choices: [
        { label: 'Дать Сефире время', text: 'Сефира записала: «Зеркало смотрит в другой мир. Оттуда смотрят в ответ».', reward: { crystal: 2 }, flag: 'mirror' },
        { label: 'Разбить', text: 'Осколки звенели, как узел. Гарт собрал их в мешок.', reward: { gold: 100 } },
      ],
    },
    rich: { name: 'Лагерь совета жрецов', waves: 10, reward: { gold: 380, crystal: 6 }, text: 'Необязательный бой. Здесь хранят дары культу.' },
    chest2: { name: 'Обледенелый тайник', reward: { gold: 80, wood: 20 } },
    chest3: { name: 'Сундук паломника', reward: { gold: 110, crystal: 1 } },
    guard: { name: 'Стража храма', waves: 10, reward: { gold: 170, crystal: 2 } },
    fortress: {
      name: 'Храм Хельдрима',
      waves: 12,
      army: 'normal',
      reward: { gold: 300, crystal: 7 },
      text: 'Ледяной жрец Хельдрим, один из совета. Пока лагерь культа стоит, волны не кончатся.',
    },
  },
});

// ---------------------------------------------------------------------------------------------- глава 4
const ASH = makeChapter({
  id: 'ash',
  name: 'Выжженные земли',
  level: 4,
  chapter: 4,
  prefix: 'ash_',
  flipX: true,
  seed: 400,
  lake: 0.76,
  rock: 0.42,
  forest: 0.78,
  hills: 0.5,
  wild: ['cliff', 'deadwood', 'statue', 'castle', 'cliff', 'crystals'],
  next: 'dusk',
  fill: {
    camp: { name: 'Лагерь у четвёртого узла', text: 'Земля тёплая под ногами. Пепел оседает на палатках.' },
    sq1: { name: 'Исчадия у пепелища', waves: 6, reward: { gold: 100 } },
    sq2: { name: 'Гончие бездны', waves: 6, reward: { gold: 90, crystal: 1 } },
    chest1: { name: 'Обугленный обоз', reward: { gold: 130 } },
    mine1: { name: 'Обсидиановый карьер', waves: 6, income: { wood: 6 } },
    event1: {
      name: 'Выжженная деревня',
      text: 'Здесь жили люди этого мира. Демоны искажают всё, к чему прикасаются. В подвале — живые дети.',
      choices: [
        { label: 'Увести детей в лагерь', text: 'Наместник промолчал. Мельхиор записал: «Мы взяли на себя ещё одну ношу».', flag: 'saved-children' },
        { label: 'Оставить припасы и уйти', text: 'Каллен оставил свой паёк. Рен не стал ему мешать.', reward: { crystal: 1 } },
      ],
    },
    forkA: { name: 'Расколотый идол', reward: { crystal: 3 }, text: 'Идол старше демонов. Трещина светится изнутри.' },
    forkB: {
      name: 'Пленный искажатель',
      text: 'Искажатель в цепях. Его бросили свои. Он предлагает сделку.',
      choices: [
        { label: 'Выслушать', text: 'Он назвал имя: Мал\'кеш — не старший из владык. Сефира побледнела.', reward: { crystal: 2 }, flag: 'heard-demon' },
        { label: 'Добить', text: 'Гарт сделал это быстро. Никто не сказал ни слова.', reward: { gold: 80 } },
      ],
    },
    cross: { name: 'Застава у лавовой реки', waves: 8, reward: { gold: 160 }, text: 'Через лаву ведёт один каменный мост.' },
    node: { name: 'Малый узел в пепле', waves: 8, income: { crystal: 1 }, text: 'Узел искажён, но жив. Взятый, он ослабит врата.' },
    gold: { name: 'Серный рудник', waves: 7, income: { gold: 35 } },
    sq3: { name: 'Разрушители', waves: 9, reward: { gold: 170, crystal: 2 } },
    event3: {
      name: 'Котёл искажения',
      text: 'В котле кипит что-то живое. Сефира говорит, что это можно очистить. Или разлить.',
      choices: [
        { label: 'Очистить', text: 'Сефира провела ночь у котла. Кристалл стал чище.', reward: { crystal: 3 }, flag: 'cleansed' },
        { label: 'Разлить', text: 'Земля шипела до утра. Осип нашёл на дне золото.', reward: { gold: 140 } },
      ],
    },
    rich: { name: 'Логово искажателей', waves: 11, reward: { gold: 450, crystal: 7 }, text: 'Необязательный бой. Здесь копят то, что отняли у мира.' },
    chest2: { name: 'Оплавленный сундук', reward: { gold: 100, wood: 20 } },
    chest3: { name: 'Тайник беглецов', reward: { gold: 130, crystal: 1 } },
    guard: { name: 'Стража врат', waves: 10, reward: { gold: 200, crystal: 3 } },
    fortress: {
      name: 'Врата бездны',
      waves: 12,
      army: 'normal',
      reward: { gold: 350, crystal: 8 },
      text: 'Владыка бездны Мал\'кеш. Пока лагерь демонов стоит, волны не кончатся.',
    },
  },
});

// ---------------------------------------------------------------------------------------------- глава 5
const DUSK = makeChapter({
  id: 'dusk',
  name: 'Цитадель сумерек',
  level: 5,
  chapter: 5,
  prefix: 'dusk_',
  flipX: true,
  flipY: true,
  seed: 500,
  lake: 0.72,
  rock: 0.55,
  forest: 0.6,
  wild: ['tower', 'castle', 'statue', 'crystals', 'tower', 'castle'],
  fill: {
    camp: { name: 'Лагерь у пятого узла', text: 'Последний узел. Сумерки здесь не кончаются.' },
    sq1: { name: 'Отступники у тропы', waves: 6, reward: { gold: 110 } },
    sq2: { name: 'Теневые ловчие', waves: 7, reward: { gold: 100, crystal: 1 } },
    chest1: { name: 'Брошенный пост', reward: { gold: 150 } },
    mine1: { name: 'Каменоломня цитадели', waves: 7, income: { wood: 6 } },
    event1: {
      name: 'Последний светлый эльф',
      text: 'Старый эльф без тени. Он помнит, какими были его сородичи до культа.',
      choices: [
        { label: 'Выслушать', text: 'Мельхиор писал до утра. Эльф ушёл, не попрощавшись.', reward: { crystal: 2 }, flag: 'heard-elf' },
        { label: 'Предложить защиту', text: 'Эльф отказался. «Вы такие же гости, как те, кто нас изменил».', reward: { gold: 80 } },
      ],
    },
    forkA: { name: 'Лунный алтарь', reward: { crystal: 4 }, text: 'Алтарь светлых эльфов, осквернённый, но живой.' },
    forkB: {
      name: 'Посланница Сайрит',
      text: 'Тёмная эльфийка говорит от имени королевы: эльфы мстят и культу, и демонам. Люди могут уйти живыми.',
      choices: [
        { label: 'Договориться о перемирии до крепости', text: 'Посланница ушла. Ловчие на тропе стали реже.', reward: { crystal: 2 }, flag: 'truce' },
        { label: 'Отказать', text: 'Посланница улыбнулась. «Тогда встретимся у стен».', reward: { gold: 120 } },
      ],
    },
    cross: { name: 'Застава у тёмной реки', waves: 8, reward: { gold: 180 }, text: 'Мост из чёрного камня. Его стерегут латники.' },
    node: { name: 'Малый узел в саду', waves: 8, income: { crystal: 1 }, text: 'Узел оплетён тёмными лозами. Взятый, он ослабит цитадель.' },
    gold: { name: 'Серебро сумерек', waves: 7, income: { gold: 40 } },
    sq3: { name: 'Чёрные латники', waves: 10, reward: { gold: 200, crystal: 2 } },
    event3: {
      name: 'Зал зеркал',
      text: 'В зеркалах — другие миры. В одном Рен видит своих людей у других врат.',
      choices: [
        { label: 'Смотреть дальше', text: 'Сефира записала: «Сеть открывает путь дальше. Это не конец похода».', reward: { crystal: 3 }, flag: 'saw-beyond' },
        { label: 'Уйти', text: 'Рен вышел первым. Каллен догнал его у двери.', reward: { gold: 150 } },
      ],
    },
    rich: { name: 'Сокровищница ткачих', waves: 11, reward: { gold: 500, crystal: 8 }, text: 'Необязательный бой. Ткачихи теней берегут добро цитадели.' },
    chest2: { name: 'Разбитый ларец', reward: { gold: 120, wood: 20 } },
    chest3: { name: 'Тайник гарпий', reward: { gold: 150, crystal: 2 } },
    guard: { name: 'Стража цитадели', waves: 11, reward: { gold: 230, crystal: 3 } },
    fortress: {
      name: 'Цитадель сумерек',
      waves: 12,
      army: 'hard',
      reward: { gold: 400, crystal: 10 },
      text: 'Королева теней Сайрит. Пока лагерь цитадели стоит, волны не кончатся.',
    },
  },
});

export const CHAPTER_SPECS: RegionSpec[] = [BOG, ICE, ASH, DUSK];
