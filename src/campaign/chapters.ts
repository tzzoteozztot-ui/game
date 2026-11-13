/**
 * Главы 2–5 похода (Артур, 2026-11-07: «создаёт новые карты для следующих глав без моих подтверждений»).
 * Каждая глава — регион биома своей карты (2 Болотный склеп, 3 Ледяные пустоши, 4 Выжженные земли, 5 Цитадель сумерек),
 * враги — её хозяева. Все четыре строятся по одной схеме тропы (`SLOTS`): лагерь, три отряда до реки, промысел, событие,
 * развилка (святилище или второе событие), переправа, малый узел, отряд, событие, стража, крепость и необязательные
 * сундуки, рудник и богатый лагерь. С 2026-11-13 (Артур одобрил пять схем) у каждой главы своя форма и своё место объектов — `layouts.ts`:
 * змейка, острова и гати, петля и ущелье, спираль, зеркало; здесь остались только содержимое слотов и порядок замков.
 * Названия, события и порядок встреч — по черновикам Лороведа (/mnt/project-files/lore/campaign-ch2-bog.md … ch5-citadel.md):
 * глава может поменять вид слота (`kind`: встреча вместо святилища, оборона лагеря вместо события) и его замки (`needs`).
 * Волны, награды и доходы — черновик.
 */
import type { RegionSpec, RegionLayout, WorldObj, WorldProp, PropKind } from './world';
import { snapHex } from './world';
import { BOG_LAYOUT, ICE_LAYOUT, ASH_LAYOUT, DUSK_LAYOUT } from './layouts';

const W = 52;
const H = 32;

/** Слот схемы: вид и замки; место задаёт схема главы (`layouts.ts`), содержимое — глава */
interface Slot {
  key: string;
  kind: WorldObj['kind'];
  needs?: string[];
  needsAny?: string[];
}
/** Порядок встреч по умолчанию; главы меняют его своими `needs` (схемы Артура 2026-11-13) */
const SLOTS: Slot[] = [
  { key: 'camp', kind: 'camp' },
  { key: 'sq1', kind: 'squad' },
  { key: 'sq2', kind: 'squad', needs: ['sq1'] },
  { key: 'chest1', kind: 'chest', needs: ['sq2'] },
  { key: 'mine1', kind: 'mine', needs: ['sq1'] },
  { key: 'event1', kind: 'event', needs: ['mine1', 'sq2'] },
  { key: 'forkA', kind: 'shrine', needs: ['event1'] },
  { key: 'forkB', kind: 'event', needs: ['event1'] },
  { key: 'cross', kind: 'squad', needsAny: ['forkA', 'forkB'] },
  { key: 'node', kind: 'mine', needs: ['cross'] },
  { key: 'gold', kind: 'mine', needs: ['cross'] },
  { key: 'sq3', kind: 'squad', needs: ['node'] },
  { key: 'event3', kind: 'event', needs: ['sq3'] },
  { key: 'rich', kind: 'squad', needs: ['event3'] },
  { key: 'chest2', kind: 'chest' },
  { key: 'chest3', kind: 'chest' },
  { key: 'guard', kind: 'squad', needs: ['sq3'] },
  { key: 'fortress', kind: 'fortress', needs: ['guard'] },
];
type Prop = { kind: PropKind; near: string; dx: number; dy: number };
/** Украшения полян: рядом со слотом, ближайший свободный гекс выбирает построитель (`settleProps`) */
const PROPS: Prop[] = [
  { kind: 'ruins', near: 'camp', dx: -2, dy: -2 },
  { kind: 'stones', near: 'sq1', dx: 2, dy: 1 },
  { kind: 'graves', near: 'event1', dx: 2, dy: 2 },
  { kind: 'wreck', near: 'cross', dx: -2, dy: 2 },
  { kind: 'ruins', near: 'node', dx: 3, dy: -2 },
  { kind: 'graves', near: 'guard', dx: 0, dy: 3 },
];

/** Содержимое слота в главе */
type Fill = Omit<WorldObj, 'id' | 'kind' | 'x' | 'y' | 'needs' | 'needsAny'> & { kind?: WorldObj['kind'] };

interface ChapterDef {
  id: string;
  name: string;
  level: number;
  chapter: number;
  prefix: string;
  /** Схема карты (`layouts.ts`): ключи — слоты */
  layout: RegionLayout;
  seed: number;
  lake?: number;
  rock?: number;
  forest?: number;
  hills?: number;
  wild: PropKind[];
  next?: string;
  fill: Record<string, Fill>;
  /** Свои объекты главы сверх слотов (сопровождение Корха, отряд «Гончие бездны»): место — в схеме, `needs` — ключи слотов */
  extra?: (Fill & { key: string; kind: WorldObj['kind']; needs?: string[] })[];
  /** Свои замки слота вместо схемы (ключи слотов): строгий порядок там, где у Лороведа нет развилки */
  needs?: Record<string, { needs?: string[]; needsAny?: string[] }>;
}

function makeChapter(d: ChapterDef): RegionSpec {
  const id = (key: string) => `${d.prefix}${key}`;
  const hex = (key: string) => {
    const q = d.layout.at[key];
    if (!q) throw new Error(`${d.id}: в схеме нет места для «${key}»`);
    return snapHex(q[0], q[1]);
  };
  const objects: WorldObj[] = SLOTS.map((s) => {
    const lock = d.needs?.[s.key] ?? s;
    return {
      kind: s.kind,
      ...d.fill[s.key],
      id: id(s.key),
      ...hex(s.key),
      ...(lock.needs ? { needs: lock.needs.map(id) } : {}),
      ...(lock.needsAny ? { needsAny: lock.needsAny.map(id) } : {}),
    };
  });
  for (const { key, needs, ...fill } of d.extra ?? []) objects.push({ ...fill, id: id(key), ...hex(key), ...(needs ? { needs: needs.map(id) } : {}) });
  const fortress = objects.find((o) => o.kind === 'fortress')!;
  fortress.weakenedBy = id('node');
  const camp = hex('camp');
  const L = d.layout;
  const ren = (p: string | [number, number]) => (typeof p === 'string' ? id(p) : p);
  const layout: RegionLayout = {
    ...L,
    at: Object.fromEntries(Object.entries(L.at).map(([k, v]) => [id(k), v])),
    edges: L.edges.map((e) => ({ ...e, pts: e.pts.map(ren) })),
    isles: L.isles && Object.fromEntries(Object.entries(L.isles).map(([k, v]) => [id(k), v])),
    chokes: L.chokes?.map(id),
  };
  return {
    id: d.id,
    name: d.name,
    level: d.level,
    chapter: d.chapter,
    w: W,
    h: H,
    start: { x: camp.x + 1, y: camp.y },
    objects,
    roads: [],
    props: PROPS.map((p) => {
      const c = hex(p.near);
      return { kind: p.kind, x: c.x + p.dx, y: c.y + p.dy } as WorldProp;
    }),
    layout,
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
  layout: BOG_LAYOUT,
  seed: 200,
  lake: 0.22, // вокруг мостков в основном вода
  rock: 0.62,
  forest: 0.55,
  wild: ['deadwood', 'castle', 'statue', 'deadwood', 'tower', 'crystals'],
  next: 'ice',
  // Грибная роща — основной путь (редакция Артура 2026-11-07), святилище — необязательное; круг у лагеря: отряды и обоз, потом по гати в деревню
  needs: { event1: { needs: ['sq2', 'chest1'] }, forkA: { needs: ['forkB'] }, cross: { needs: ['forkB'] } },
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
  layout: ICE_LAYOUT,
  seed: 300,
  lake: 0.74,
  rock: 0.4,
  forest: 0.7,
  hills: 0.55,
  wild: ['crystals', 'cliff', 'statue', 'tower', 'crystals', 'cliff'],
  next: 'ash',
  // Петля вокруг озера: дозор, караван, застава, малый артефакт, стела, Алтарь инея, назад в лагерь на оборону; потом ущелье и переправа
  needs: {
    event1: { needs: ['sq1'] },
    sq2: { needs: ['event1'] },
    node: { needs: ['sq2'] },
    forkA: { needs: ['node'] },
    forkB: { needs: ['node'] },
    sq3: { needs: ['forkA'] },
    rich: { needs: ['event3'] },
    cross: { needs: ['rich'] },
    guard: { needs: ['cross'] },
  },
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
  layout: ASH_LAYOUT,
  seed: 400,
  lake: 0.76,
  rock: 0.42,
  forest: 0.78,
  hills: 0.5,
  wild: ['cliff', 'deadwood', 'statue', 'castle', 'cliff', 'crystals'],
  next: 'dusk',
  // Спираль: малый артефакт — раньше моста, дальше по витку к Вратам
  needs: {
    event1: { needs: ['sq2'] },
    forkB: { needs: ['forkA'] },
    node: { needs: ['forkB'] },
    gold: { needs: ['node'] },
    cross: { needs: ['node'] },
    sq3: { needs: ['cross'] },
    rich: { needs: ['event3'] },
    guard: { needs: ['rich'] },
  },
  // «Обменяться и сопроводить отряд» (Г4-04, Артур 2026-11-07): бой из 6 волн демонов у дороги к малому артефакту
  extra: [
    {
      key: 'escort',
      kind: 'squad',
      name: 'Сопровождение Корха',
      waves: 6,
      reward: { gold: 120, crystal: 2 },
      needs: ['forkA'],
      needsFlag: 'korh-escort',
      text: 'Отряд Корха идёт к малому артефакту. Демоны ждут на дороге: удержать позиции, пока чужаки проходят.',
    },
  ],
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
  layout: DUSK_LAYOUT,
  seed: 500,
  lake: 0.72,
  rock: 0.55,
  forest: 0.6,
  wild: ['tower', 'castle', 'statue', 'crystals', 'tower', 'castle'],
  // Два крыла вокруг Чёрного озера в любом порядке: север — Корх и малый артефакт, юг — латники и зал; потом мост и прямая дорога штурма
  needs: {
    event1: { needs: ['sq1'] },
    sq2: { needs: ['event1'] },
    node: { needs: ['forkA'] },
    forkB: { needs: ['sq2'] },
    cross: { needs: ['node', 'forkB'] },
    sq3: { needs: ['cross'] },
    guard: { needs: ['event3'] },
  },
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
