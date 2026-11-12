/**
 * Главы 2–5 похода (Артур, 2026-11-07: «создаёт новые карты для следующих глав без моих подтверждений»).
 * Каждая глава — регион биома своей карты (2 Болотный склеп, 3 Ледяные пустоши, 4 Выжженные земли, 5 Цитадель сумерек),
 * враги — её хозяева. Все четыре строятся по одной схеме тропы (`SLOTS`): лагерь, три отряда до реки, промысел, событие,
 * развилка (святилище или второе событие), переправа, малый узел, отряд, событие, стража, крепость и необязательные
 * сундуки, рудник и богатый лагерь. Схема поворачивается (`flipX`, `flipY`), чтобы карты не были одинаковыми.
 * Названия, события и порядок встреч — по черновикам Лороведа (/mnt/project-files/lore/campaign-ch2-bog.md … ch5-citadel.md):
 * глава может поменять вид слота (`kind`: встреча вместо святилища, оборона лагеря вместо события) и его замки (`needs`).
 * Волны, награды и доходы — черновик.
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
type Fill = Omit<WorldObj, 'id' | 'kind' | 'x' | 'y' | 'needs' | 'needsAny'> & { kind?: WorldObj['kind'] };

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
  /** Свои объекты главы сверх схемы (сопровождение Корха): место в координатах схемы, до поворота; `needs` — ключи слотов */
  extra?: (Fill & { key: string; at: P; kind: WorldObj['kind']; needs?: string[] })[];
  /** Свои дороги главы сверх схемы */
  extraRoads?: (string | P)[][];
  /** Свои замки слота вместо схемы (ключи слотов): строгий порядок там, где у Лороведа нет развилки */
  needs?: Record<string, { needs?: string[]; needsAny?: string[] }>;
}

function makeChapter(d: ChapterDef): RegionSpec {
  const tx = (p: P): P => ({ x: d.flipX ? W - 1 - p.x : p.x, y: d.flipY ? H - 1 - p.y : p.y });
  const id = (key: string) => (key === 'camp' ? `${d.prefix}camp` : `${d.prefix}${key}`);
  const slotAt = (k: string) => (SLOTS.find((s) => s.key === k) ?? d.extra?.find((e) => e.key === k))!.at;
  const at = (k: string | P): P => tx(typeof k === 'string' ? slotAt(k) : k);
  const objects: WorldObj[] = SLOTS.map((s) => {
    const lock = d.needs?.[s.key] ?? s;
    return {
      kind: s.kind,
      ...d.fill[s.key],
      id: id(s.key),
      ...tx(s.at),
      ...(lock.needs ? { needs: lock.needs.map(id) } : {}),
      ...(lock.needsAny ? { needsAny: lock.needsAny.map(id) } : {}),
    };
  });
  for (const { key, at: p, needs, ...fill } of d.extra ?? []) objects.push({ ...fill, id: id(key), ...tx(p), ...(needs ? { needs: needs.map(id) } : {}) });
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
    roads: [...ROADS, ...(d.extraRoads ?? [])].map((chain) => chain.map(at)),
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
  // Грибная роща — основной путь (редакция Артура 2026-11-07), святилище — необязательное
  needs: { cross: { needs: ['forkB'] } },
  fill: {
    camp: { name: 'Лагерь у второго артефакта', text: 'Лагерь перенесли к новому артефакту. Вокруг топь и туман.' },
    sq1: { name: 'Топь у входа', waves: 4, reward: { gold: 60 }, text: 'Из тумана идут тела. Не орки и не звери.' },
    sq2: { name: 'Чужое знамя', waves: 3, reward: { gold: 50, crystal: 1 }, item: 'token', text: 'Знамя не наше, но под ним люди. Живые, и идут на нас.' },
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
    forkA: {
      name: 'Склеп-святилище',
      reward: { crystal: 3 },
      text: 'Необязательно. В старом святилище держится остаточная магия: Сефира хочет её коснуться.',
    },
    forkB: {
      name: 'Грибная роща',
      text: 'Грибница оплела артефакт и кормится его силой. Вестница Фелла ждёт у самой большой шляпки.',
      choices: [
        { label: 'Торговля: доступ к артефакту за знание', text: 'Грибницу без нужды не жгут. Фелла рассказала, кто такой Ксаар.', reward: { crystal: 2 }, flag: 'fella-trade' },
        { label: 'Поручение: принести семя из склепа', text: 'Фелла ждёт потерянное семя и рассказала о склепе.', reward: { gold: 80 }, flag: 'fella-task' },
        { label: 'Пройти мимо', text: 'Фелла не стала удерживать.' },
        { label: 'Выжечь грибницу', text: 'Заросли у артефакта выжжены. Фелла ушла молча.', reward: { crystal: 3 }, flag: 'fella-burn' },
      ],
    },
    cross: { name: 'Мертвецы у брода', waves: 6, reward: { gold: 100 }, text: 'Брод держат мертвецы. Другой дороги на тот берег нет.' },
    node: { name: 'Малый артефакт «Ступень»', waves: 6, income: { crystal: 1 }, text: 'Ступень к большому артефакту. Взятая, она ослабит защиту склепа.' },
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
// «Лёд и совет» (campaign-ch3-ice.md): до порабощения — дозор, неофит Исс, караван, стела, узел; у Алтаря инея связь
// с отрядом Каллена обрывается, потом оборона лагеря от порабощённых (Каллен — последняя волна), ущелье, стража, Цитадель инея
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
  needs: { rich: { needs: ['event3'] }, guard: { needs: ['rich'] } },
  fill: {
    camp: { name: 'Лагерь у третьего артефакта', text: 'Снег и ветер. Холод здесь чужой: его держит чья-то воля.' },
    sq1: { name: 'Ледяной дозор', waves: 5, reward: { gold: 80 }, text: 'Неофиты культа. Мороз их не берёт.' },
    sq2: { name: 'Застава неофитов', waves: 5, reward: { gold: 70, crystal: 1 }, text: 'Один из неофитов бросит оружие, когда застава падёт.' },
    chest1: { name: 'Вмёрзшие сани', reward: { gold: 110 } },
    mine1: { name: 'Ледяная каменоломня', waves: 5, income: { wood: 5 } },
    event1: {
      name: 'Замёрзший караван',
      text: 'Люди замёрзли на ходу, с поклажей. Вокруг каждого — круг из инея.',
      choices: [
        { label: 'Похоронить', text: 'Рен велел не задерживаться. Тела наскоро укрыли снегом, Мельхиор переписал имена с жетонов.', flag: 'buried-caravan' },
        { label: 'Забрать поклажу', text: 'Осип внёс в опись: меха, сталь, соль.', reward: { gold: 120 } },
      ],
    },
    forkA: { name: 'Мёртвая стела', reward: { crystal: 3 }, text: 'Стела культа. Надпись старше лагеря.' },
    forkB: {
      name: 'Ледяное зеркало',
      text: 'Гладкий лёд показывает не отражение, а чужой берег. Сефира хочет изучить его.',
      choices: [
        { label: 'Дать Сефире время', text: 'Сефира записала: «Зеркало смотрит в другой мир. Оттуда смотрят в ответ».', reward: { crystal: 2 }, flag: 'ice-mirror' },
        { label: 'Разбить', text: 'Осколки звенели, как артефакт. Гарт собрал их в мешок.', reward: { gold: 100 } },
      ],
    },
    cross: { name: 'Застава у ледяной переправы', waves: 7, reward: { gold: 130 }, text: 'Река скована льдом только здесь.' },
    node: { name: 'Малый артефакт', waves: 7, income: { crystal: 1 }, text: 'Артефакт вморожен в ледник. Взятый, он ослабит Цитадель инея.' },
    gold: { name: 'Серебряная жила', waves: 6, income: { gold: 30 } },
    sq3: { name: 'Алтарь инея', waves: 8, reward: { gold: 140, crystal: 2 }, text: 'Жрецы культа. Отряд Каллена ушёл разведать алтарь.' },
    event3: {
      kind: 'squad',
      name: 'Нападение порабощённых',
      waves: 8,
      faction: 6, // порабощённые солдаты экспедиции — враги людей
      bossLast: true, // Каллен — босс последней волны
      bossName: 'Каллен',
      bossTint: '#9fd4ff', // иней на доспехах
      reward: { gold: 120, crystal: 2 },
      text: 'На лагерь идут наши: доспехи экспедиции, иней на лицах. Последняя волна — Каллен.',
    },
    rich: { name: 'Заморозка у ущелья', waves: 9, reward: { gold: 200, crystal: 3 }, text: 'Ущелье держат жрецы. Обойти его нельзя.' },
    chest2: { name: 'Обледенелый тайник', reward: { gold: 80, wood: 20 } },
    chest3: { name: 'Сундук паломника', reward: { gold: 110, crystal: 1 } },
    guard: { name: 'Стража совета', waves: 10, reward: { gold: 170, crystal: 2 }, text: 'Личная стража совета жрецов.' },
    fortress: {
      name: 'Цитадель инея',
      waves: 12,
      army: 'normal',
      reward: { gold: 300, crystal: 7 },
      text: 'Жрец Хельдрим, один из совета жрецов. Пока лагерь культа стоит, волны не кончатся.',
    },
  },
});

// ---------------------------------------------------------------------------------------------- глава 4
// «Пепел голосов» (campaign-ch4-ash.md): Жаровня, выжженный лагерь и знакомый голос, две встречи с выбором подряд
// (командор Корх — его выбор аукнется в главе 5, старец Бо-Рок), узел-якорь, гряда, осколок, бесы, стража, Врата Мал'кеша
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
  needs: { forkB: { needs: ['forkA'] }, cross: { needs: ['forkA', 'forkB'] }, rich: { needs: ['event3'] }, guard: { needs: ['rich'] } },
  // «Обменяться и сопроводить отряд» (Г4-04, Артур 2026-11-07): бой из 6 волн демонов у дороги к малому артефакту
  extra: [
    {
      key: 'escort',
      at: { x: 16, y: 28 },
      kind: 'squad',
      name: 'Сопровождение Корха',
      waves: 6,
      reward: { gold: 120, crystal: 2 },
      needs: ['forkA'],
      needsFlag: 'korh-escort',
      text: 'Отряд Корха идёт к малому артефакту. Демоны ждут на дороге: удержать позиции, пока чужаки проходят.',
    },
  ],
  extraRoads: [['forkA', { x: 18, y: 27 }, 'escort']],
  fill: {
    camp: { name: 'Лагерь у четвёртого артефакта', text: 'Земля тёплая под ногами. Пепел оседает на палатках, кристалл мутнеет.' },
    sq1: { name: 'Жаровня', waves: 6, reward: { gold: 100 }, text: 'Первые демоны. Огонь для них родной.' },
    sq2: { name: 'Гончие бездны', waves: 6, reward: { gold: 90, crystal: 1 } },
    chest1: { name: 'Обугленный обоз', reward: { gold: 130 } },
    mine1: { name: 'Обсидиановый карьер', waves: 6, income: { wood: 6 } },
    event1: {
      name: 'Выжженный лагерь',
      text: 'Лагерь людей, не наш. Бросили в спешке, золото нетронуто.',
      choices: [
        { label: 'Забрать золото', text: 'Осип пересчитал. «Уходили не за добычей. Значит, бежали».', reward: { gold: 140 } },
        { label: 'Оставить как есть', text: 'Мельхиор записал следы бегства и следы тех, кто догнал.', reward: { crystal: 1 } },
      ],
    },
    forkA: {
      kind: 'event',
      name: 'Командор Корх',
      text: 'Разбитый лагерь чужой экспедиции. Командор Айден Корх, командир Сорна, собирает уцелевших и предлагает обмен: сведения о Мал\'кеше за сведения о двух наших артефактах.',
      choices: [
        { label: 'Обменяться разведданными', text: 'Корх передал сведения о Мал\'кеше. Туман над Вратами рассеялся. Раненых он поведёт домой сам.', flag: 'korh-trade', scout: 6 },
        {
          label: 'Обменяться и сопроводить отряд',
          text: 'Корх передал сведения о Мал\'кеше, туман над Вратами рассеялся. Его отряд ждёт у дороги к малому артефакту: путь держат демоны.',
          flags: ['korh-trade', 'korh-escort'],
          scout: 6,
        },
        { label: 'Отказаться от сделки', text: 'Рен не стал делиться и задерживаться. Экспедиция Корха отступает сама.' },
      ],
    },
    forkB: {
      kind: 'event',
      name: 'Старец вершин',
      text: 'Бо-Рок, старец обезьянолюдей: наш лагерь стоит на камне, где его деды говорили с небом.',
      choices: [{ label: 'Пройти, не трогая камней', text: 'Бо-Рок уступил тропу. Камни на вершине остались на своих местах.' }],
    },
    cross: { name: 'Застава у лавовой реки', waves: 8, reward: { gold: 160 }, text: 'Через лаву ведёт один каменный мост.' },
    node: { name: 'Малый артефакт', waves: 8, income: { crystal: 1 }, text: 'Артефакт искажён, но держит. Взятый, он ослабит Врата и заглушит голоса.' },
    gold: { name: 'Серный рудник', waves: 7, income: { gold: 35 } },
    sq3: { name: 'Пепельная гряда', waves: 9, reward: { gold: 170, crystal: 2 } },
    event3: {
      name: 'Осколок поёт',
      text: 'Осколок нагревается рядом с капитаном. Он на что-то отвечает.',
      choices: [
        { label: 'Дать Сефире изучить', text: 'Сефира провела ночь у осколка. Кристалл связи стал чище.', reward: { crystal: 3 }, flag: 'shard-studied' },
        { label: 'Убрать в свинцовый ларец', text: 'Гарт запаял ларец. Осколок затих, а Осип нашёл в пепле золото.', reward: { gold: 140 } },
      ],
    },
    rich: { name: 'Стая бесов', waves: 10, reward: { gold: 220, crystal: 3 }, text: 'Много мелких. Дорогие выстрелы на них не тратьте.' },
    chest2: { name: 'Оплавленный сундук', reward: { gold: 100, wood: 20 } },
    chest3: { name: 'Тайник беглецов', reward: { gold: 130, crystal: 1 } },
    guard: { name: 'Стража бездны', waves: 10, reward: { gold: 200, crystal: 3 }, text: 'Тяжёлые. Огонь им не страшен.' },
    fortress: {
      name: 'Врата Мал\'кеша',
      waves: 12,
      army: 'normal',
      reward: { gold: 350, crystal: 8 },
      text: 'Владыка бездны Мал\'кеш и лагерь «Алтарь бездны». Пока лагерь стоит, волны не кончатся.',
    },
  },
});

// ---------------------------------------------------------------------------------------------- глава 5
// «Последний узел» (campaign-ch5-citadel.md): тропа теней, Чёрное озеро (голос Сайрит), Корх по выбору главы 4,
// Зеркальный зал (взять Тёмное зеркало или оставить), узел, дозор, зеркальная тень, стража и секрет Ориса, Цитадель
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
  needs: { forkB: { needs: ['forkA'] }, cross: { needs: ['forkA', 'forkB'] }, guard: { needs: ['event3'] } },
  fill: {
    camp: { name: 'Лагерь у последнего артефакта', text: 'Пятый артефакт. Дальше только врата и то, что за ними.' },
    sq1: { name: 'Тропа теней', waves: 6, reward: { gold: 110 }, text: 'Эльфы-отступники. Часть выстрелов летит мимо.' },
    sq2: { name: 'Чёрные латники', waves: 7, reward: { gold: 100, crystal: 1 } },
    chest1: { name: 'Брошенный пост', reward: { gold: 150 } },
    mine1: { name: 'Каменоломня цитадели', waves: 7, income: { wood: 6 } },
    event1: {
      name: 'Чёрное озеро',
      text: 'В чёрной воде лежит зеркальный осколок. Через него говорит королева теней.',
      choices: [{ label: 'Уйти от озера', text: 'Сефира завернула осколок в ткань. Голос Сайрит стих, но не исчез.' }],
    },
    forkA: {
      kind: 'event',
      name: 'Командор Корх',
      text: 'Командор Корх собрал уцелевших и ждёт у дороги.',
      choices: [{ label: 'Идти дальше', text: 'Корх остался у своего костра. Экспедиция пошла дальше.' }],
    },
    forkB: {
      kind: 'event',
      name: 'Зеркальный зал',
      text: 'Древний зал. На каменном постаменте — тёмное зеркало, артефакт старше экспедиции.',
      choices: [{ label: 'Забрать зеркало', text: 'Рен получает артефакт «Тёмное зеркало». Оно усиливает башни, но откуда эта сила, Сефира не знает.', item: 'mirror', flag: 'took-mirror' }],
    },
    cross: { name: 'Застава у тёмной реки', waves: 8, reward: { gold: 180 }, text: 'Мост из чёрного камня. Его стерегут латники.' },
    node: { name: 'Малый артефакт', waves: 8, income: { crystal: 1 }, text: 'Артефакт оплетён тёмными лозами. Взятый, он ослабит Цитадель.' },
    gold: { name: 'Серебро сумерек', waves: 7, income: { gold: 40 } },
    sq3: { name: 'Сумеречный дозор', waves: 10, reward: { gold: 200, crystal: 2 }, text: 'Укреплённый дозор на дороге к Цитадели. Эти не отступят.' },
    event3: {
      name: 'Последняя стоянка',
      text: 'Перед последним участком пути экспедиция разбивает лагерь. Следующая встреча может стать решающей.',
      choices: [{ label: 'Готовиться к штурму', text: 'Башни проверены, люди отдохнули. Утром — к Цитадели.' }],
    },
    rich: { name: 'Сокровищница ткачих', waves: 11, reward: { gold: 500, crystal: 8 }, text: 'Необязательный бой. Ткачихи теней берегут добро Цитадели.' },
    chest2: { name: 'Разбитый ларец', reward: { gold: 120, wood: 20 } },
    chest3: { name: 'Тайник гарпий', reward: { gold: 150, crystal: 2 } },
    guard: { name: 'Стража королевы', waves: 11, reward: { gold: 230, crystal: 3 }, text: 'Последняя линия обороны. За ней уже Цитадель.' },
    fortress: {
      name: 'Цитадель сумерек',
      waves: 12,
      army: 'hard',
      reward: { gold: 400, crystal: 10 },
      text: 'Королева теней Сайрит. Пока лагерь Цитадели стоит, волны не кончатся.',
    },
  },
});

export const CHAPTER_SPECS: RegionSpec[] = [BOG, ICE, ASH, DUSK];
