/**
 * Game Configuration & Constants for «Тёмный рубеж»
 */

export type TowerType = 'archer' | 'priest' | 'mage' | 'ballista';
export type TargetPriority = 'first' | 'strongest' | 'closest';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type EnemyType = 'infantry' | 'scout' | 'heavy' | 'flyer' | 'shaman' | 'swarm' | 'boss' | 'imp';

export interface TowerSpecDef {
  id: string;
  name: string;
  desc: string;
}

export interface TowerBaseDef {
  type: TowerType;
  name: string;
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

export const CONFIG = {
  grid: {
    cols: 16,
    rows: 10,
    cellSize: 64, // logical width & height
    totalWidth: 1024, // 16 * 64
    totalHeight: 640, // 10 * 64
    castleCells: [{ x: 8, y: 5 }], // single cell next to the centre
    castleTarget: { x: 8.5, y: 5.5 }, // center of castle for flyers
  },

  lives: {
    start: 20,
    regularCost: 1,
    bossCost: 5,
  },

  difficulty: {
    easy: { hpMult: 0.8, goldMult: 1.25, label: 'Лёгкая' },
    normal: { hpMult: 1.0, goldMult: 1.0, label: 'Обычная' },
    hard: { hpMult: 1.3, goldMult: 0.8, label: 'Тяжёлая' },
  },
  // Hard difficulty: fewer enemies in the first waves (Артур, тест баланса: стена на волнах 1–3)
  hardEarlyWaves: { upTo: 3, countMult: 0.8 },

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
  },

  // Priest support (Артур, тест баланса: жрец — явная поддержка): «Оберег» and «Проклятие» also
  // reach enemies within `radius` cells of the target
  priestSupport: { radius: 1, wardSlow: 0.5, wardTime: 3, curseBonus: 0.35, curseTime: 5 },

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
      speed: 1.1,
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
  ] as LevelPalette[],

  factions: [
    {
      id: 1,
      name: 'Орки',
      location: 'Пограничье',
      traitName: 'Ярость',
      traitDesc: 'При здоровье ниже 50% скорость врагов увеличивается на 30%.',
      bossName: 'Вождь',
      bossDesc: 'Раз в 10 с издаёт боевой клич: враги в радиусе 2,5 кл. бегут на 40% быстрее 3 с.',
    },
    {
      id: 2,
      name: 'Нежить',
      location: 'Болотный склеп',
      traitName: 'Возрождение',
      traitDesc: 'Пехотинец и разведчик один раз встают через 1 с с 30% здоровья.',
      bossName: 'Лич',
      bossDesc: 'Раз в 12 с воскрешает до 3 павших врагов за последние 10 с в радиусе 3 кл. с 30% HP.',
    },
    {
      id: 3,
      name: 'Культисты льда',
      location: 'Ледяные пустоши',
      traitName: 'Закалка',
      traitDesc: 'Все замедления слабее вдвое.',
      bossName: 'Ледяной жрец',
      bossDesc: 'Раз в 12 с замораживает ближайшую башню на 4 с.',
    },
    {
      id: 4,
      name: 'Демоны',
      location: 'Выжженные земли',
      traitName: 'Пепельная кожа',
      traitDesc: 'Урон специализации «Огонь» (удар и поджог) снижен на 50%.',
      bossName: 'Владыка бездны',
      bossDesc: 'Раз в 10 с призывает 3 бесов (HP 20, скорость 1,6).',
    },
    {
      id: 5,
      name: 'Тёмные эльфы',
      location: 'Цитадель сумерек',
      traitName: 'Уклонение',
      traitDesc: '25% физических попаданий (стрелок, баллиста) летят мимо.',
      bossName: 'Королева теней',
      bossDesc: 'Раз в 15 с становится неуязвима на 3 с и совершает рывок на 3 клетки вперёд.',
    },
  ] as FactionDef[],

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
  },

  waveTimer: {
    first: 30, // real seconds before wave 1 starts by itself
    between: 20, // real seconds between a cleared wave and the next one
    goldPerSecond: 1, // early start bonus per second left on the timer
  },
  speeds: [0.5, 1, 1.5, 2, 2.5, 3, 5], // game speed steps, picked from the speed button's list

  // Endless mode (Артур: «после каждой 12 босс, волны бесконечно усиливаются, пауза 45 секунд»).
  // The 12 waves repeat in cycles; HP keeps growing with the wave number (enemyScaling),
  // each finished cycle adds enemies and boss HP.
  endless: {
    between: 45, // real seconds before wave 1 and between waves
    countPerCycle: 0.25, // +25% enemies of every type per finished cycle of 12 waves
    bossHpPerCycle: 0.6, // +60% boss HP per finished cycle
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
