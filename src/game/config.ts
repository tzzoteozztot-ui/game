/**
 * Game Configuration & Constants for «Тёмный рубеж»
 */

export type HumanTowerType = 'archer' | 'priest' | 'mage' | 'ballista';
// Towers of the playable factions (выбор Артура 2026-11-01, числа — прикидка из lore/faction-towers-table.md)
export type RaceTowerType =
  | 'orc_spear' | 'orc_totem' | 'orc_trebuchet' | 'orc_cage'
  | 'und_archer' | 'und_digger' | 'und_cauldron' | 'und_crypt'
  | 'cul_archer' | 'cul_altar' | 'cul_pillar' | 'cul_spike'
  | 'dem_ember' | 'dem_warper' | 'dem_rift' | 'dem_gate'
  | 'elf_archer' | 'elf_weaver' | 'elf_sphere' | 'elf_blade';
export type TowerType = HumanTowerType | RaceTowerType;
/** The player's faction: whose towers the shop sells */
export type RaceId = 'humans' | 'orcs' | 'undead' | 'cultists' | 'demons' | 'elves';
export const RACE_IDS: RaceId[] = ['humans', 'orcs', 'undead', 'cultists', 'demons', 'elves'];
export type TargetPriority = 'first' | 'strongest' | 'closest';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type EnemyType = 'infantry' | 'scout' | 'heavy' | 'flyer' | 'shaman' | 'swarm' | 'boss' | 'imp';

export interface TowerSpecDef {
  id: string;
  name: string;
  desc: string;
}

export interface AbilityDef {
  name: string;
  desc: string;
  duration: number; // s
  cooldown: number; // s
  cost: number; // gold
}

export interface TowerBaseDef {
  type: TowerType;
  race?: RaceId; // default humans
  name: string;
  desc?: string; // what it does, one line (shop, card, bestiary)
  sprite?: string; // field figure for a tower without its own tower_<type>_<level> sprite (a unit of its faction)
  aoe?: number; // splash radius, cells
  minTier?: number; // appears in the shop from this tier
  special?: 'cage' | 'altar' | 'crypt' | 'gate'; // no plain shot: its own routine in the engine
  ability?: AbilityDef; // demons: active ability
  sound?: HumanTowerType; // which shot sound it uses
  cost: number;
  damage: number;
  damageType: 'phys' | 'mag';
  cooldown: number; // in seconds
  range: number; // in grid cells (64px each)
  shape: 'triangle' | 'circle' | 'rhombus' | 'square';
  color: string;
  specs: TowerSpecDef[];
}

export interface EnemyBaseDef {
  type: EnemyType;
  name: string;
  hp: number;
  speed: number; // cells per second
  armor: number; // fraction 0..1
  magicResist: number; // fraction 0..1
  gold: number;
  shape: 'circle' | 'small_triangle' | 'large_square' | 'rhombus' | 'shaman_circle' | 'swarm_dot' | 'boss_spiked';
}

export interface WaveDef {
  infantry?: number;
  scout?: number;
  heavy?: number;
  flyer?: number;
  shaman?: number;
  swarm?: number; // groups of swarmGroupCount
  boss?: boolean;
}

export interface LevelPalette {
  ground: string;
  road: string;
  enemies: string;
  light: string;
}

export interface FactionDef {
  id: number;
  name: string;
  location: string;
  traitName: string;
  traitDesc: string;
  bossName: string;
  bossDesc: string;
}

// Орки: закалка при постановке и на каждом новом уровне (выбор Артура 2026-11-01)
const ORC_SPECS: TowerSpecDef[] = [
  { id: 'orc_dmg', name: 'Сила', desc: '+12 % урона' },
  { id: 'orc_speed', name: 'Быстрота', desc: '+12 % скорости атаки' },
  { id: 'orc_range', name: 'Зоркость', desc: '+0,3 клетки радиуса' },
];
// Нежить: при слиянии двух башен объединённая усиливает урон или скорость ×2,4
const UNDEAD_SPECS: TowerSpecDef[] = [
  { id: 'und_dmg', name: 'Урон', desc: 'Урон ×2,4' },
  { id: 'und_speed', name: 'Скорость', desc: 'Скорость атаки ×2,4' },
];

export interface RaceDef {
  id: RaceId;
  name: string;
  faction: number; // CONFIG.factions id: colors and unit sprites
  towers: TowerType[];
  merge: number; // towers of one kind and level that merge into the next level
  maxLevel?: number; // default 3
  levelDamage: number; // damage per level (нежить: the chosen stat)
  levelRange: number;
  binders: boolean; // «Связка» in the shop (люди)
  triplets: boolean; // ★ cards (a ready Ур.2) in the shop
  sellRatio?: number; // overrides the share paid back on sale (campaign and endless)
  killGoldMult?: number;
  supply?: { free: number; step: number; growth: number }; // overrides CONFIG.supply numbers
  features: string[]; // what makes the faction different (menu, bestiary)
}

/** Усиления артефакта в потасовке: id, название, описание, величина (смысл — в engine.ts, `boon`) */
export interface BoonDef {
  id: string;
  name: string;
  desc: string;
  value: number;
  // What it gives a brawl bot (its defence is one number): power — defence ×(1 + power), lives — HP now and at most,
  // mend — HP a wave, sends — a bigger share for sends (выбор Артура 2026-11-01: «пусть боты тоже их получают»)
  bot: { power?: number; lives?: number; mend?: number; sends?: number };
  weight?: number; // how often it is offered against the others (1 by default)
}

/** `n` distinct boons from `pool`, each drawn by its weight */
export function pickBoons(pool: BoonDef[], n: number, rand: () => number = Math.random): BoonDef[] {
  const left = [...pool];
  const out: BoonDef[] = [];
  while (out.length < n && left.length > 0) {
    const total = left.reduce((s, b) => s + (b.weight ?? 1), 0);
    let r = rand() * total;
    let i = 0;
    while (i < left.length - 1 && r >= (left[i].weight ?? 1)) r -= left[i++].weight ?? 1;
    out.push(left.splice(i, 1)[0]);
  }
  return out;
}
export const BOONS: BoonDef[] = [
  { id: 'sharp', name: 'Острые клинки', desc: '+10 % урона всех башен', value: 0.1, bot: { power: 0.1 } },
  { id: 'haste', name: 'Быстрые руки', desc: '+10 % скорости атаки всех башен', value: 0.1, bot: { power: 0.1 } },
  { id: 'sight', name: 'Дальний взор', desc: '+10 % радиуса всех башен', value: 0.1, bot: { power: 0.06 } },
  { id: 'slayer', name: 'Гроза великанов', desc: '+25 % урона по тяжёлым и боссам', value: 0.25, bot: { power: 0.08 } },
  { id: 'bastion', name: 'Последний рубеж', desc: '+30 % урона по врагам у артефакта', value: 0.3, bot: { power: 0.08 } },
  { id: 'pierce', name: 'Бронебой', desc: 'Броня и сопротивление магии врагов −25 %', value: 0.25, bot: { power: 0.1 } },
  { id: 'mire', name: 'Вязкая земля', desc: 'Враги идут на 8 % медленнее', value: 0.08, bot: { power: 0.06 } },
  { id: 'loot', name: 'Мародёр', desc: '+15 % золота за убийство', value: 0.15, bot: { power: 0.05 } },
  { id: 'tithe', name: 'Подать', desc: '+20 золота в начале каждого раунда', value: 20, bot: { power: 0.05 } },
  { id: 'walls', name: 'Крепкие стены', desc: '+5 к прочности артефакта (и к её пределу)', value: 5, bot: { lives: 5 }, weight: 0.4 }, // +5 и реже — выбор Артура 2026-11-01
  { id: 'mend', name: 'Каменщики', desc: 'Артефакт чинится на 5 раз в 3 раунда', value: 5, bot: { mend: 5 } }, // слабее и реже — выбор Артура 2026-11-01
  { id: 'ward', name: 'Страж', desc: 'Защита артефакта бьёт вдвое сильнее', value: 1, bot: { power: 0.03 } },
  { id: 'trade', name: 'Торговый пост', desc: 'Башни и связки в лавке на 10 % дешевле', value: 0.1, bot: { power: 0.05 } },
  { id: 'scout', name: 'Разведка', desc: 'Первое обновление лавки в каждом раунде бесплатно', value: 1, bot: { power: 0.03 } },
  { id: 'envoy', name: 'Вербовщик', desc: 'Враги в «Армии» на 15 % дешевле', value: 0.15, bot: { sends: 0.18 } },
];

export const CONFIG = {
  grid: {
    cols: 14,
    rows: 8,
    cellSize: 64, // logical width & height
    totalWidth: 896, // 14 * 64
    totalHeight: 512, // 8 * 64
    castleCells: [{ x: 7, y: 4 }], // single cell next to the centre
    castleTarget: { x: 7.5, y: 4.5 }, // center of castle for flyers
  },
  // Field zoom (drawing only, Артур 2026-10-30): pinch, wheel or +/−; 1 = whole field
  view: {
    maxZoom: 2.5,
  },

  // Прочность артефакта (бывший замок; поле по-прежнему `lives`). Артур, 2026-10-31: 200 HP,
  // враги у артефакта не исчезают, а стоят и бьют (CONFIG.siege)
  lives: {
    start: 200,
  },

  // Осада артефакта (Артур, 2026-10-31): ближние бьют в упор, дальние — с 1–3 клеток; башни их добивают.
  // dmg — урон за удар, every — секунд между ударами, range — дальность в клетках от центра артефакта (0 — в упор).
  // Бот на тяжёлой (бесконечный): дальние с 1 клетки — почти как до осады; с 2 — ранние поражения ×4 (ур. 5),
  // шаманы с 3 клеток — медиана 20 волн вместо 43
  siege: {
    meleeReach: 0.55, // клеток от центра артефакта, где останавливаются ближние (плюс разброс до 0,2)
    attack: {
      infantry: { dmg: 2, every: 1.0, range: 0 },
      scout: { dmg: 1, every: 1.0, range: 1 },
      heavy: { dmg: 4, every: 1.2, range: 0 },
      flyer: { dmg: 2, every: 1.0, range: 1 },
      shaman: { dmg: 2, every: 1.5, range: 1 },
      swarm: { dmg: 1, every: 1.5, range: 0 },
      boss: { dmg: 10, every: 1.0, range: 0 },
      imp: { dmg: 1, every: 1.0, range: 0 },
    } as Record<EnemyType, { dmg: number; every: number; range: number }>,
    // Защита артефакта (Артур, 2026-10-31: «слабая защита с возможностью прокачивать»): раз в every секунд бьёт
    // магией ближайшего врага в радиусе radius клеток; уровень поднимается за золото в карточке артефакта
    guard: {
      radius: 1.6,
      every: 1.0,
      damage: [6, 12, 20, 30, 45], // урон по уровням 1–5
      upgradeCost: [240, 420, 660, 960], // цена перехода на уровни 2–5 (×3 к первой пробе, Артур 2026-10-31)
    },
    // Разведчик стреляет издали только там, где он лучник (нежить, культисты, тёмные эльфы, следопыт людей); у орков и демонов бьёт в упор
    rangedScoutFactions: [2, 3, 5, 6],
  },

  difficulty: {
    easy: { hpMult: 0.8, goldMult: 1.25, label: 'Лёгкая' },
    normal: { hpMult: 1.0, goldMult: 1.0, label: 'Обычная' },
    hard: { hpMult: 1.3, goldMult: 0.8, label: 'Тяжёлая' },
  },

  towers: {
    archer: {
      type: 'archer',
      name: 'Стрелок',
      cost: 50,
      damage: 8,
      damageType: 'phys',
      cooldown: 0.6,
      range: 2.8,
      shape: 'triangle',
      color: '#d9b44a',
      specs: [
        { id: 'sniper', name: 'Снайпер', desc: 'Радиус ×1,6, урон ×1,8, период ×1,6' },
        { id: 'arrow_hail', name: 'Град стрел', desc: 'Период ×0,6, урон ×0,8, бьёт 2 цели (Ур.3: 3); каждая цель сверх двух −5% урона' },
        { id: 'hunter', name: 'Охотник', desc: 'Урон по тяжёлым и боссам ×2' },
      ],
    } as TowerBaseDef,
    priest: {
      type: 'priest',
      name: 'Жрец',
      cost: 60,
      damage: 3,
      damageType: 'mag',
      cooldown: 1.0,
      range: 2.5,
      shape: 'circle',
      color: '#f2f0e0',
      specs: [
        { id: 'ward', name: 'Оберег', desc: 'Замедление 50% на 3 с цели и врагов в 1 клетке от неё' },
        { id: 'curse', name: 'Проклятие', desc: '+35% урона 5 с цели и врагам в 1 клетке от неё (не складывается)' },
        { id: 'smite', name: 'Кара', desc: 'Раз в 2,5 с импульс по всем врагам в радиусе, урон ×2,5' },
      ],
    } as TowerBaseDef,
    mage: {
      type: 'mage',
      name: 'Маг',
      cost: 75,
      damage: 14,
      damageType: 'mag',
      cooldown: 1.4,
      range: 2.6,
      shape: 'rhombus',
      color: '#8f6bff',
      specs: [
        { id: 'fire', name: 'Огонь', desc: 'Площадь ×1,4, поджог 30% урона в сек на 3 с' },
        { id: 'lightning', name: 'Молния', desc: 'Цепь на 4 цели (Ур.3: 5), каждая след. 75% урона' },
        { id: 'frost', name: 'Мороз', desc: 'Площадь ×1,2, урон ×0,8, замедление 35% на 2 с' },
      ],
    } as TowerBaseDef,
    ballista: {
      type: 'ballista',
      name: 'Баллиста',
      cost: 100,
      damage: 45,
      damageType: 'phys',
      cooldown: 2.2,
      range: 3.6,
      shape: 'square',
      color: '#c9663a',
      specs: [
        { id: 'ram', name: 'Таран', desc: 'Урон ×0,8, снаряд пробивает всех на линии выстрела' },
        { id: 'siege', name: 'Осада', desc: 'Урон ×0,9, период ×1,15, взрыв радиусом 1 клетка' },
        { id: 'execute', name: 'Казнь', desc: 'Цель с HP < 25% гибнет сразу; босс получает +50% урона' },
      ],
    } as TowerBaseDef,

    // ---------------- Орки: рост от 4 башен, закалка при постановке ----------------
    orc_spear: {
      type: 'orc_spear', race: 'orcs', name: 'Метатель копий', cost: 55, damage: 9, damageType: 'phys', cooldown: 0.8, range: 2.8,
      shape: 'triangle', color: '#a9bf5a', sprite: 'enemy_scout_1', sound: 'archer', specs: ORC_SPECS,
      desc: 'Копьё пробивает цель и бьёт ещё одного врага за ней (в 1 клетке).',
    } as TowerBaseDef,
    orc_totem: {
      type: 'orc_totem', race: 'orcs', name: 'Тотем предков', cost: 60, damage: 3, damageType: 'mag', cooldown: 1.0, range: 2.5,
      shape: 'circle', color: '#e0c26a', sprite: 'enemy_shaman_1', sound: 'priest', specs: ORC_SPECS,
      desc: 'Ярость: орочьи башни в соседних клетках стреляют на 10 % быстрее (Ур.2 — 15 %, Ур.3 — 20 %).',
    } as TowerBaseDef,
    orc_trebuchet: {
      type: 'orc_trebuchet', race: 'orcs', name: 'Требушет', cost: 90, damage: 36, damageType: 'phys', cooldown: 2.6, range: 4.0, aoe: 0.9,
      shape: 'square', color: '#b98a52', sprite: 'enemy_heavy_1', sound: 'ballista', specs: ORC_SPECS,
      desc: 'Медленный камень по области 0,9 клетки, далеко бьёт.',
    } as TowerBaseDef,
    orc_cage: {
      type: 'orc_cage', race: 'orcs', name: 'Клетка зверя', cost: 100, damage: 6, damageType: 'phys', cooldown: 0.5, range: 2.0,
      shape: 'rhombus', color: '#c96a3a', sprite: 'enemy_swarm_1', sound: 'archer', special: 'cage', specs: ORC_SPECS,
      desc: 'Гончая кусает раз в 0,5 с и раз в 6 с держит врага на месте 3 с (босса — 1 с).',
    } as TowerBaseDef,

    // ---------------- Нежить: слияние двух, выбор «урон или скорость» ----------------
    und_archer: {
      type: 'und_archer', race: 'undead', name: 'Костяной лучник', cost: 40, damage: 9, damageType: 'phys', cooldown: 0.7, range: 2.7,
      shape: 'triangle', color: '#c9d6b0', sprite: 'enemy_scout_2', sound: 'archer', specs: UNDEAD_SPECS,
      desc: 'Дешёвый дальний стрелок.',
    } as TowerBaseDef,
    und_digger: {
      type: 'und_digger', race: 'undead', name: 'Могильщик', cost: 55, damage: 5, damageType: 'mag', cooldown: 1.0, range: 2.5,
      shape: 'circle', color: '#9fb88a', sprite: 'enemy_infantry_2', sound: 'priest', specs: UNDEAD_SPECS,
      desc: 'Замедляет цель на 30 % на 3 с. Враг, убитый в его радиусе, становится призраком: соседи замедлены на 20 % на 1 с.',
    } as TowerBaseDef,
    und_cauldron: {
      type: 'und_cauldron', race: 'undead', name: 'Чумной котёл', cost: 70, damage: 6, damageType: 'mag', cooldown: 1.4, range: 2.6, aoe: 0.9,
      shape: 'rhombus', color: '#8fd45a', sprite: 'enemy_shaman_2', sound: 'mage', specs: UNDEAD_SPECS,
      desc: 'Яд по области: 25 % урона в секунду 4 с; при гибели отравленного яд переходит на соседа.',
    } as TowerBaseDef,
    und_crypt: {
      type: 'und_crypt', race: 'undead', name: 'Склеп', cost: 90, damage: 6, damageType: 'mag', cooldown: 8, range: 2.0, minTier: 2,
      shape: 'square', color: '#7a8a6a', sprite: 'enemy_heavy_2', sound: 'mage', special: 'crypt', specs: UNDEAD_SPECS,
      desc: 'Копит души убитых в радиусе (до 10); раз в 8 с залп по всем в радиусе: 6 урона за каждую душу. В лавке со 2-го яруса.',
    } as TowerBaseDef,

    // ---------------- Культисты: мегабашни из фигур Т, Х, П ----------------
    cul_archer: {
      type: 'cul_archer', race: 'cultists', name: 'Ледяной стрелок', cost: 55, damage: 12, damageType: 'phys', cooldown: 0.7, range: 2.8,
      shape: 'triangle', color: '#9fd8f5', sprite: 'enemy_scout_3', sound: 'archer', specs: [],
      desc: 'Каждое попадание добавляет 8 % замедления (до 40 %) на 2 с.',
    } as TowerBaseDef,
    cul_altar: {
      type: 'cul_altar', race: 'cultists', name: 'Алтарь инея', cost: 80, damage: 0, damageType: 'mag', cooldown: 5, range: 1.6,
      shape: 'circle', color: '#d6f0ff', sprite: 'enemy_shaman_3', sound: 'priest', special: 'altar', specs: [],
      desc: 'Раз в 5 с замораживает всех врагов в радиусе на 1,5 с (босса — на 0,5 с).',
    } as TowerBaseDef,
    cul_pillar: {
      type: 'cul_pillar', race: 'cultists', name: 'Ритуальный столп', cost: 40, damage: 8, damageType: 'mag', cooldown: 1.0, range: 2.2,
      shape: 'rhombus', color: '#7fc8f0', sprite: 'enemy_infantry_3', sound: 'mage', specs: [],
      desc: 'Дешёвый модуль мегабашни; один слаб.',
    } as TowerBaseDef,
    cul_spike: {
      type: 'cul_spike', race: 'cultists', name: 'Ледяной шип', cost: 100, damage: 65, damageType: 'phys', cooldown: 2.2, range: 3.6,
      shape: 'square', color: '#5d9fd0', sprite: 'enemy_heavy_3', sound: 'ballista', specs: [],
      desc: 'Тяжёлый выстрел; по замедленным и замороженным ×1,3.',
    } as TowerBaseDef,

    // ---------------- Демоны: активные способности, больше золота ----------------
    dem_ember: {
      type: 'dem_ember', race: 'demons', name: 'Метатель углей', cost: 55, damage: 9, damageType: 'mag', cooldown: 0.8, range: 2.8,
      shape: 'triangle', color: '#ff7a3a', sprite: 'enemy_scout_4', sound: 'archer', specs: [],
      desc: 'Поджигает: 25 % урона в секунду 3 с.',
      ability: { name: 'Огненный шторм', desc: 'Стреляет вдвое чаще, поджог ×1,5', duration: 5, cooldown: 30, cost: 4 },
    } as TowerBaseDef,
    dem_warper: {
      type: 'dem_warper', race: 'demons', name: 'Искажатель', cost: 70, damage: 2, damageType: 'mag', cooldown: 1.0, range: 2.5,
      shape: 'circle', color: '#e05a8a', sprite: 'enemy_shaman_4', sound: 'priest', specs: [],
      desc: 'Цель и враги в 1 клетке от неё получают +30 % урона от всех башен 4 с.',
      ability: { name: 'Разлом', desc: 'Враги в 2 клетках от башни получают +60 % урона', duration: 4, cooldown: 35, cost: 5 },
    } as TowerBaseDef,
    dem_rift: {
      type: 'dem_rift', race: 'demons', name: 'Огненная трещина', cost: 85, damage: 12, damageType: 'mag', cooldown: 1.6, range: 2.6,
      shape: 'rhombus', color: '#ff4a2f', sprite: 'enemy_infantry_4', sound: 'mage', specs: [],
      desc: 'Оставляет горящее пятно на 4 с: 40 % урона в секунду всем в нём.',
      ability: { name: 'Извержение', desc: 'Пятна втрое шире и бьют вдвое сильнее', duration: 5, cooldown: 40, cost: 6 },
    } as TowerBaseDef,
    dem_gate: {
      type: 'dem_gate', race: 'demons', name: 'Врата бездны', cost: 120, damage: 20, damageType: 'mag', cooldown: 6, range: 2.5,
      shape: 'square', color: '#b0302a', sprite: 'enemy_heavy_4', sound: 'ballista', special: 'gate', specs: [],
      desc: 'Раз в 6 с зовёт беса на 5 с (20 урона в секунду). «Жертва»: башня рядом сгорает ради залпа ×4 её цены.',
      ability: { name: 'Зов', desc: 'Сразу призывает двух бесов', duration: 5, cooldown: 20, cost: 8 },
    } as TowerBaseDef,

    // ---------------- Тёмные эльфы: крит копится 10 с ----------------
    elf_archer: {
      type: 'elf_archer', race: 'elves', name: 'Теневой лучник', cost: 55, damage: 6, damageType: 'phys', cooldown: 0.5, range: 2.7,
      shape: 'triangle', color: '#3ed6c4', sprite: 'enemy_scout_5', sound: 'archer', specs: [],
      desc: 'Быстрый дальний стрелок.',
    } as TowerBaseDef,
    elf_weaver: {
      type: 'elf_weaver', race: 'elves', name: 'Ткачиха теней', cost: 65, damage: 3, damageType: 'mag', cooldown: 1.0, range: 2.5,
      shape: 'circle', color: '#9a7ae0', sprite: 'enemy_shaman_5', sound: 'priest', specs: [],
      desc: 'Паутина на цель и врагов в 1 клетке: замедление 25 % и −30 % урона по артефакту, 3 с.',
    } as TowerBaseDef,
    elf_sphere: {
      type: 'elf_sphere', race: 'elves', name: 'Сумеречная сфера', cost: 80, damage: 12, damageType: 'mag', cooldown: 1.5, range: 2.6, aoe: 0.9,
      shape: 'rhombus', color: '#6a5ad8', sprite: 'enemy_heavy_5', sound: 'mage', specs: [],
      desc: 'Сфера взрывается через 0,5 с после падения, по области 0,9 клетки.',
    } as TowerBaseDef,
    elf_blade: {
      type: 'elf_blade', race: 'elves', name: 'Клинок сумерек', cost: 60, damage: 7, damageType: 'phys', cooldown: 0.4, range: 1.3,
      shape: 'square', color: '#e8c76a', sprite: 'enemy_infantry_5', sound: 'archer', specs: [],
      desc: 'Ближний и быстрый. «Охота на отставших»: ×1,3 по врагу, который уже прошёл мимо двух других башен.',
    } as TowerBaseDef,
  },

  // Priest support (Артур, тест баланса: жрец — явная поддержка): «Оберег» and «Проклятие» also
  // reach enemies within `radius` cells of the target
  priestSupport: { radius: 1, wardSlow: 0.5, wardTime: 3, curseBonus: 0.35, curseTime: 5 },
  // Priest without a specialization (Артур, 2026-10-26, вариант А): marks the target and the enemies
  // within `radius` cells: slow and extra damage from all towers; a tower bound to a priest shoots stronger
  priestBase: { slow: 0.3, markBonus: 0.15, time: 3, pairBonus: 0.2 },

  // «Град стрел»: damage of each arrow drops with the number of targets (Артур, тест баланса)
  arrowHail: { perExtraTarget: 0.05 },

  upgrade: {
    lvl2DamageMult: 3.3,
    lvl2RangeMult: 1.1,
    lvl3DamageMult: 3.3,
    lvl3RangeMult: 1.1,
    sellRatio: 0.7,
  },

  // Enemy HP: base × hpMult × (1 + waveLinear·(w−1) + waveQuad·(w−1)²) × (1 + level·(L−1)) × difficulty
  // (the boss skips the wave factor)
  // Raised at Артур's request («враги очень быстро умирают»): was hpMult 1, waveLinear 0.15, waveQuad 0
  // Abyss Lord's imps: share of an infantryman's HP in the same wave
  impHpShare: 1 / 3,

  enemyScaling: {
    hpMult: 1.3,
    waveLinear: 0.18,
    waveQuad: 0.012,
    level: 0.3,
    // Campaign only: waves from `lateFrom` on get extra HP (Артур, тест баланса: обычная слишком лёгкая)
    lateFrom: 7,
    lateHpMult: 1.12,
  },

  enemies: {
    infantry: {
      type: 'infantry',
      name: 'Пехотинец',
      hp: 30,
      speed: 0.9,
      armor: 0,
      magicResist: 0,
      gold: 5,
      shape: 'circle',
    } as EnemyBaseDef,
    scout: {
      type: 'scout',
      name: 'Разведчик',
      hp: 20,
      speed: 1.6,
      armor: 0,
      magicResist: 0,
      gold: 4,
      shape: 'small_triangle',
    } as EnemyBaseDef,
    heavy: {
      type: 'heavy',
      name: 'Тяжёлый',
      hp: 100,
      speed: 0.6,
      armor: 0.40,
      magicResist: 0,
      gold: 12,
      shape: 'large_square',
    } as EnemyBaseDef,
    flyer: {
      type: 'flyer',
      name: 'Летун',
      hp: 40,
      speed: 0.825, // было 1,1, ×0,75 (Артур, 2026-10-26)
      armor: 0,
      magicResist: 0.25,
      gold: 8,
      shape: 'rhombus',
    } as EnemyBaseDef,
    shaman: {
      type: 'shaman',
      name: 'Шаман',
      hp: 60,
      speed: 0.8,
      armor: 0,
      magicResist: 0.30,
      gold: 10,
      shape: 'shaman_circle',
    } as EnemyBaseDef,
    swarm: {
      type: 'swarm',
      name: 'Рой',
      hp: 8,
      speed: 1.2,
      armor: 0,
      magicResist: 0,
      gold: 1,
      shape: 'swarm_dot',
    } as EnemyBaseDef,
    boss: {
      type: 'boss',
      name: 'Босс',
      hp: 1200,
      speed: 0.5,
      armor: 0.20,
      magicResist: 0.20,
      gold: 100,
      shape: 'boss_spiked',
    } as EnemyBaseDef,
    imp: {
      type: 'imp',
      name: 'Бес',
      hp: 20,
      speed: 1.6,
      armor: 0,
      magicResist: 0,
      gold: 0,
      shape: 'small_triangle',
    } as EnemyBaseDef,
  },

  palettes: [
    { ground: '#2e2227', road: '#7a5238', enemies: '#8fa34a', light: '#f4c06a' }, // Level 1
    { ground: '#1f2a24', road: '#4f5a45', enemies: '#c9d6b0', light: '#b7e08a' }, // Level 2
    { ground: '#1f2733', road: '#5d7084', enemies: '#7fc8f0', light: '#d6f0ff' }, // Level 3
    { ground: '#241818', road: '#4a3a38', enemies: '#e0452f', light: '#ff8a5a' }, // Level 4
    { ground: '#171a2e', road: '#3b3f66', enemies: '#3ed6c4', light: '#e8c76a' }, // Level 5
    // Faction 6 (люди) has no map of its own: only `enemies` is used (tint, puffs); the rest copies level 1
    { ground: '#2e2227', road: '#7a5238', enemies: '#5b8fd8', light: '#f4c06a' },
  ] as LevelPalette[],

  // Maps (levels) 1..levelCount; factions 1..levelCount are the hosts of those maps, factions past it
  // (люди) have no map and come only in endless mode and duel, on any map (Артур, 2026-10-31)
  levelCount: 5,


  factions: [
    {
      id: 1,
      name: 'Орки',
      location: 'Пограничье',
      traitName: 'Ярость',
      traitDesc: 'При здоровье ниже 50% скорость врагов увеличивается на 30%.',
      bossName: 'Вождь Ургаш',
      bossDesc: 'Раз в 10 с издаёт боевой клич: враги в радиусе 2,5 кл. бегут на 40% быстрее 3 с.',
    },
    {
      id: 2,
      name: 'Нежить',
      location: 'Болотный склеп',
      traitName: 'Возрождение',
      traitDesc: 'Пехотинец и разведчик один раз встают через 1 с с 30% здоровья.',
      bossName: 'Лич Ксаар',
      bossDesc: 'Раз в 12 с воскрешает до 3 павших врагов за последние 10 с в радиусе 3 кл. с 30% HP.',
    },
    {
      id: 3,
      name: 'Культисты льда',
      location: 'Ледяные пустоши',
      traitName: 'Закалка',
      traitDesc: 'Все замедления слабее вдвое.',
      bossName: 'Ледяной жрец Хельдрим',
      bossDesc: 'Раз в 12 с замораживает ближайшую башню на 4 с.',
    },
    {
      id: 4,
      name: 'Демоны',
      location: 'Выжженные земли',
      traitName: 'Пепельная кожа',
      traitDesc: 'Огонь вдвое слабее: специализация «Огонь» (удар и поджог) и горящая земля наносят на 50% меньше. Остальной урон — обычный.',
      bossName: 'Владыка бездны Мал’кеш',
      bossDesc: 'Раз в 10 с призывает 3 бесов: скорость 1,6, здоровье — треть пехотинца той же волны.',
    },
    {
      id: 5,
      name: 'Тёмные эльфы',
      location: 'Цитадель сумерек',
      traitName: 'Уклонение',
      traitDesc: '25% физических попаданий (стрелок, баллиста) летят мимо.',
      bossName: 'Королева теней Сайрит',
      bossDesc: 'Раз в 15 с становится неуязвима на 3 с и совершает рывок на 3 клетки вперёд.',
    },
    {
      id: 6,
      name: 'Люди',
      location: 'Любая карта', // своей карты нет
      traitName: 'Полевое восстановление',
      traitDesc: 'Враг, которого 3 с никто не ранил, восстанавливает 2% здоровья в секунду.',
      bossName: 'Командор экспедиции',
      bossDesc: 'Раз в 12 с открывает врата: до 5 врагов в радиусе 3 кл. и он сам переносятся на 2 клетки вперёд.',
    },
  ] as FactionDef[],

  // Люди (faction 6): предложение Claude, утвердил Артур 2026-10-31
  humans: {
    repairDelay: 3, // s without damage before repair starts
    repairPerSec: 0.02, // share of max HP restored per second
    gateEvery: 12, // s between the commander's gates
    gateRadius: 3, // cells around the commander
    gateCount: 5, // allies carried besides the commander
    gateCells: 2, // how far along the road
  },

  // Играбельные фракции (выбор Артура 2026-11-01): у каждой свои башни и способ роста. Числа — прикидка,
  // проверяются ботом (scripts/balance_sim.mjs --race=…). Культисты, демоны и эльфы растут слиянием трёх,
  // как люди, но без свойств и связок (их особенности — мегабашни, способности, крит)
  races: {
    humans: {
      id: 'humans', name: 'Люди', faction: 6, towers: ['archer', 'priest', 'mage', 'ballista'],
      merge: 3, levelDamage: 3.3, levelRange: 1.1, binders: true, triplets: true,
      features: ['Три одинаковые башни сливаются в следующий уровень; на Ур.2 — свойство на выбор, Ур.3 хранит три.', '«Связка» ставит две башни Ур.2–3 разных видов в одну клетку, тройная связка поднимает уровень.'],
    },
    orcs: {
      id: 'orcs', name: 'Орки', faction: 1, towers: ['orc_spear', 'orc_totem', 'orc_trebuchet', 'orc_cage'],
      merge: 4, levelDamage: 4.4, levelRange: 1.1, binders: false, triplets: false,
      features: ['Каждая башня при постановке и на каждом новом уровне получает закалку на выбор: сила, быстрота или зоркость.', 'Уровень растёт от четырёх одинаковых башен (урон ×4,4).', 'Отряд: три орочьи башни разных видов в соседних клетках — +10 % урона каждой.'],
    },
    undead: {
      id: 'undead', name: 'Нежить', faction: 2, towers: ['und_archer', 'und_digger', 'und_cauldron', 'und_crypt'],
      merge: 2, maxLevel: 5, levelDamage: 2.4, levelRange: 1.05, binders: false, triplets: false, sellRatio: 0.8,
      supply: { free: 30, step: 20, growth: 1.06 },
      features: ['Две одинаковые башни сливаются в одну: на выбор урон или скорость ×2,4 (слияние выгоднее двух отдельных). Уровней пять.', 'Продажа возвращает 80 %, сила стола дорожает мягче (×1,06).', 'Слабое начало, сила к поздним волнам.'],
    },
    cultists: {
      id: 'cultists', name: 'Культисты льда', faction: 3, towers: ['cul_archer', 'cul_altar', 'cul_pillar', 'cul_spike'],
      merge: 3, levelDamage: 3.3, levelRange: 1.1, binders: false, triplets: true,
      features: ['Мегабашни: башни культистов, поставленные фигурой, работают вместе.', 'Т (4 клетки): +30 % урона всем. Х (5 клеток, плюс): раз в 4 с взрыв холода у центра, урон ×3. П (5 клеток): +30 % радиуса и заморозка 1 с врагов между ножками.', 'Уровень — слиянием трёх, без свойств.'],
    },
    demons: {
      id: 'demons', name: 'Демоны', faction: 4, towers: ['dem_ember', 'dem_warper', 'dem_rift', 'dem_gate'],
      merge: 3, levelDamage: 3.3, levelRange: 1.1, binders: false, triplets: true, sellRatio: 0.7, killGoldMult: 1.25,
      supply: { free: 24, step: 14, growth: 1.18 },
      features: ['У каждой башни активная способность за золото (клавиша A), можно включить автоприменение.', 'Золота за убийства +25 %, но сила стола дорожает быстрее (×1,18 каждые 14 выше 24).', 'Продажа возвращает 70 %.'],
    },
    elves: {
      id: 'elves', name: 'Тёмные эльфы', faction: 5, towers: ['elf_archer', 'elf_weaver', 'elf_sphere', 'elf_blade'],
      merge: 3, levelDamage: 3.3, levelRange: 1.1, binders: false, triplets: true,
      features: ['Крит: шанс каждого выстрела растёт от 0 до 100 % за 10 с, крит бьёт ×2,5 и сбрасывает счётчик.', 'Уровень — слиянием трёх, без свойств.'],
    },
  } as Record<RaceId, RaceDef>,

  // Механики башен фракций (числа из lore/faction-towers-table.md)
  raceMech: {
    orcUpgrade: { dmg: 0.12, speed: 0.12, range: 0.3 },
    orcSquad: 0.1, // +damage for three orc towers of different kinds side by side
    totemAura: [0.1, 0.15, 0.2], // attack speed of orc towers next to a totem, by its level
    spearPierce: 1.0, // cells behind the target the spear reaches
    houndHold: 3, // s the hound holds an enemy
    houndHoldEvery: 6,
    bossHoldShare: 1 / 3, // bosses: holds and freezes last this share
    diggerSlow: 0.3,
    diggerTime: 3,
    ghostSlow: 0.2,
    ghostTime: 1,
    poisonShare: 0.25, // of the hit per second
    poisonTime: 4,
    soulsMax: 10,
    chillStep: 0.08,
    chillMax: 0.4,
    chillTime: 2,
    freezeTime: 1.5,
    spikeSlowedMult: 1.3,
    megaT: 0.3,
    megaXEvery: 4,
    megaXRadius: 1.2,
    megaXMult: 3,
    megaPRange: 0.3,
    megaPFreeze: 1,
    burnShare: 0.25,
    burnTime: 3,
    warpBonus: 0.3,
    warpTime: 4,
    patchShare: 0.4,
    patchTime: 4,
    patchRadius: 0.7,
    impTime: 5,
    impSpeed: 3, // cells/s
    sacrificeMult: 4, // volley = this × gold put into the sacrificed tower
    critFull: 10, // s to a sure crit
    critMult: 2.5,
    weaverSlow: 0.25,
    weaverWeaken: 0.3,
    weaverTime: 3,
    sphereDelay: 0.5,
    huntMult: 1.3,
    huntTowers: 2,
  },

  waves: [
    { infantry: 6 },
    { infantry: 8, scout: 4 },
    { infantry: 8, scout: 6, swarm: 1 },
    { infantry: 10, scout: 6, heavy: 2 },
    { infantry: 10, scout: 8, heavy: 3, flyer: 3 },
    { infantry: 12, scout: 8, heavy: 3, flyer: 4, swarm: 2 },
    { infantry: 12, scout: 8, heavy: 5, flyer: 4, shaman: 2 },
    { infantry: 14, heavy: 6, flyer: 5, shaman: 3, swarm: 3 },
    { infantry: 16, scout: 12, heavy: 8, flyer: 6, shaman: 4 },
    { infantry: 18, heavy: 10, flyer: 8, shaman: 5, swarm: 4 },
    { infantry: 20, scout: 14, heavy: 12, flyer: 10, shaman: 6, swarm: 4 },
    { infantry: 20, heavy: 14, flyer: 10, shaman: 8, swarm: 5, boss: true },
  ] as WaveDef[],

  shop: {
    slotsCount: 5,
    rerollCost: 10,
    rerollStep: 5, // each reroll within a wave costs 5 more (10, 15, 20…), back to 10 when a wave starts
    tierUpgradeCosts: [30, 60, 100, 150], // for 1->2, 2->3, 3->4, 4->5
    tripletChances: [0, 0.03, 0.06, 0.10, 0.15], // for tier 1..5
    binderChances: [0, 0, 0.06, 0.12, 0.18], // «Связка» card per slot, for tier 1..5
  },

  // «Связка»: rare figure that binds two towers of different types into one cell
  binder: {
    name: 'Связка',
    cost: 80,
    color: '#3ed6c4',
    tripleFromTier: 5, // three binders merge into a triple one only from this shop tier (Артур, 2026-10-26)
    minLevel: 2, // both towers of a pair must be at least this level (Артур, 2026-10-30)
  },

  waveTimer: {
    first: 30, // real seconds before wave 1 starts by itself
    between: 20, // real seconds between a cleared wave and the next one
    goldPerSecond: 1, // early start bonus per second left on the timer
  },
  speeds: [0.5, 1, 1.5, 2, 2.5, 3, 5], // game speed steps, picked from the speed button's list

  // Supply («сила стола», Артур, 2026-10-26; endless mode only): the value of towers on the field.
  // Above `free` every `step` of power makes buying towers and binders in the shop ×`growth` dearer;
  // selling is paid from the base price and does not change.
  // Backpack: bought towers and binders wait here until placed (a wave start does not reset them)
  backpack: { slots: 6 },
  // Артур, 2026-10-26 («В. Средний путь»): after wave 12 a kill pays ×killDecay per wave (down to killFloor) and
  // the table is dearer and selling pays less. Endless mode and duel only.
  supply: {
    free: 30,
    step: 20,
    growth: 1.12,
    maxMult: 999, // ceiling of the price multiplier (no ceiling yet; trial numbers via --set)
    sellRatio: 0.6,
    killDecay: 0.985,
    killFloor: 0.3,
    killDecayFrom: 12,
    towerPower: [1, 3, 9], // by tower level
    binderPower: 1,
    tripleBinderPower: 3,
  },

  // Endless mode (Артур: «после каждой 12 босс, волны бесконечно усиливаются, пауза 45 секунд»).
  // The 12 waves repeat in cycles; HP keeps growing with the wave number (enemyScaling),
  // each finished cycle adds enemies and boss HP.
  endless: {
    between: 45, // real seconds before wave 1 and between waves
    countPerCycle: 0.25, // +25% enemies of every type per finished cycle of 12 waves
    // Past wave 12 enemy HP grows on top of enemyScaling by this share per wave (Артур, 2026-10-26)
    hpGrowthPerWave: 0.035,
    // The boss grows with the wave like the others, times this factor from the second cycle on
    bossFactor: 1.5,
    armorPerCycle: 0.04, // armor and magic resist of every enemy grow per finished cycle…
    armorCap: 0.6, // …up to this value
    // HP of every enemy by level (faction id); Артур, тест баланса: демонам и эльфам −7 %
    factionHpMult: { 4: 0.93, 5: 0.93 } as Record<number, number>,
  },

  // Duel (Артур, 2026-10-25): two players, each on their own field, rounds on a shared clock.
  // Waves grow without end as in endless mode; the next wave comes out over the unfinished one.
  duel: {
    roundLength: 60, // real seconds per round; wave N starts N rounds after the duel starts
    waveCountMult: 0.5, // half of the usual wave (the opponent's sends come on top)
    stateInterval: 2, // real seconds between state messages to the opponent
    peerTimeout: 30, // real seconds without a message from the opponent: the duel is won
    // Sending enemies to the opponent for gold (Артур: 3А 4А 5А 6Б)
    sendPriceMult: 2 / 1.5, // price = 4/3 × kill gold (was 2 ×; Артур 2026-11-01: «слишком дорого, уменьшим в 1,5 раза»), × the wave's HP multiplier
    botWeightMult: 2, // the bots' wave weight is still counted in the old 2 × kill gold, so their balance did not move with the send price
    sendWaveCap: 999, // ceiling of the wave's HP multiplier in the send price (no ceiling yet; trial numbers via --set)
    sendIncomeShare: 0.2, // each send adds 1/5 of its price to the gold of every later round
    sentKillGoldShare: 0.5, // the defender gets half the kill gold for a sent enemy
    sendMaxPerType: 200, // a send message with more is cut down (a broken or forged message)
    moveCost: 10, // moving a tower while enemies are on the field (duel, brawl; Артур 2026-11-01: «10 монет условно»)
  },

  // «Потасовка» (Артур, 2026-11-01): eight on the duel's clock, the opponents change every wave
  brawl: {
    players: 8,
    roundLength: 40, // real seconds per round (Артур, 2026-11-01: короче дуэли)
    // Bot defence in the brawl: skill × its wave's weight on this map × e^(−wave / fade), ×0,8 on a boss wave —
    // a bot fits any map and falls behind with time, like a player (Артур, 2026-11-01: «боты под карту»)
    botSkill: { easy: 1.6, normal: 2.1, hard: 3.4 },
    botFade: 25,
    botBossFactor: 0.8,
    botFormSpread: 0.2, // each bot's skill ×0,8–1,2 for the whole game
    hpDrain: 8, // real seconds for a bot's whole HP to drain on the board (only the look)
    // The seven bots' strengths (duelBot.ts BOT_LEVELS) by the difficulty picked in the menu
    bots: {
      easy: ['easy', 'easy', 'easy', 'easy', 'normal', 'normal', 'normal'],
      normal: ['easy', 'easy', 'normal', 'normal', 'normal', 'hard', 'hard'],
      hard: ['normal', 'normal', 'normal', 'hard', 'hard', 'hard', 'hard'],
    },
    // Усиления артефакта (просьба Артура 2026-11-01): после каждой 3-й волны — одно на выбор из трёх, каждое один раз;
    // числа — черновик, ждут выбора Артура
    boonEvery: 4, // каждые 4 раунда (выбор Артура 2026-11-01; было 3)
    mendEvery: 3, // «Каменщики» чинят раз в столько раундов
    boonOffer: 3,
    boons: BOONS,
    botBoonScale: 1, // bots' boons ×this (power, sends, HP); 1 — as the player's
  },

  spawnInterval: 0.8, // seconds between spawns
  swarmInterval: 0.25, // seconds between swarm individuals
  swarmGroupCount: 8, // individuals per swarm group

  particles: {
    maxCount: 150,
  },
  grass: {
    maxBlades: 60,
  },
};
