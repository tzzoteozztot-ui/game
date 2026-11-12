/**
 * 60 FPS Game Engine & Canvas Renderer for «Тёмный рубеж»
 */

import { RunLog, LogTower } from './runLog';
import type { FieldView } from '../fieldView';
import { CONFIG, TowerType, TargetPriority, Difficulty, EnemyType, RaceId, TowerBaseDef, BOONS, BoonDef, HERO_ABILITIES, HeroAbilityDef, pickBoons, DamageType, DAMAGE_TYPES } from './config';
import { MAPS, Point, MapDef, isHudCell } from './maps';
import { groundToCellF, cellFToGround, centerX, centerY, castleX, castleY, cellPath, isHex, setHex, hexView, screenToGround, cellAt, neighbours, ring, adjacent, translate } from './grid';
import * as gridModule from './grid';
import { generateMap } from './mapgen';
import { MapDraft, MapEditTool, MAX_EXITS, draftToMap, mapToDraft, inField, isCastle } from './mapEditor';
import {
  calculateDamage,
  calculateFactionDamageMult,
  calculateEffectiveSlow,
  calculateEnemyHp,
  waveDefinition,
  calculateEnemyCount,
  calculateRerollCost,
  calculateKillGold,
  calculateStartingGold,
  calculateWaveClearReward,
  calculateSellRefund,
  calculateSendPrice,
  calculateSendIncome,
  calculateSupplyPower,
  calculateSupplyMult,
  endlessArmorBonus,
  SendType,
  SEND_TYPES,
  canBindLevels,
} from './rules';
import { sound } from './audio';
import { sprites, drawSprite, PreparedSprite, SpritePose, SpriteVariant } from './sprites';
import { bakeHexGround, bakeHexSky, backdropImage } from './hexScene';
import { TILESETS, DECOR_ONLY, loadTileset, loadDecor, bakeField, bakeDecor, Tileset } from './tiles';
// Light rim color (r, g, b) under the pedestal of the dark tower figures
// (people's Стрелок and Маг, all dark elf towers: they sink into dark maps)
const ELF_RIM = '170, 240, 228';
const TOWER_RIMS: Partial<Record<TowerType, string>> = {
  archer: '214, 236, 190', mage: '214, 200, 255',
  elf_archer: ELF_RIM, elf_weaver: ELF_RIM, elf_sphere: ELF_RIM, elf_blade: ELF_RIM,
};
import { attackStats, specBadge, specPower, specsOfType, stackedSlow, towerDamageType } from './towerStats';

// -------------------------------------------------------------
// Entity Interfaces
// -------------------------------------------------------------

// What attacks: a tower has one part, a tower bound by «Связка» has two of different types
export interface TowerPart {
  type: TowerType;
  level: number; // 1, 2, 3
  specs: string[]; // specialization ids; repeats are power, see towerStats.ts
  cooldownTimer: number; // seconds until ready
  smiteTimer: number; // priest smite pulse timer
  shotAt?: number; // real time of the last shot (s), for the recoil animation
}

export interface Tower extends TowerPart {
  id: string;
  x: number; // grid cell x
  y: number; // grid cell y
  priority: TargetPriority;
  frozenTimer: number; // frozen by Ice Priest boss
  facing: number; // 1 = right, -1 = left (towards last target)
  second: TowerPart | null; // bound tower of another type, shoots from the same cell
  // Playable factions
  souls?: number; // Склеп: souls gathered
  holdCd?: number; // Клетка зверя: s until the hound can hold again
  critT?: number; // тёмные эльфы: s since the last crit
  abilityCd?: number; // демоны: s until the ability is ready
  abilityLeft?: number; // демоны: s the ability still works
  auto?: boolean; // демоны: the ability casts by itself
  pulseT?: number; // timer of a repeated effect (Разлом)
  // Культисты: a megatower (or a hypertower of several) built into one tower: the other parts shoot from the same cell
  extra?: { x: number; y: number }[]; // собранная мегабашня П стоит на двух клетках, гипербашня на трёх: остальные клетки
  fused?: { shapes: ('T' | 'P')[]; parts: TowerPart[]; megas: number; level?: number }; // level — только у гипербашни (1–3)
}

/** Every part of a tower that shoots: the tower itself, the parts fused into it and the bound one */
export function towerParts(t: Tower): TowerPart[] {
  return [t, ...(t.fused?.parts ?? []), ...(t.second ? [t.second] : [])];
}

/** Cultist megatower: towers standing in a figure work together */
export interface Mega {
  key: string;
  shape: 'T' | 'P';
  ids: string[];
  center: { x: number; y: number }; // Х: the middle cell; П: the cell between the legs
  centerId: string | null; // Х: the tower in the middle
  timer: number;
}

interface GroundFire {
  x: number;
  y: number;
  r: number; // px
  dps: number;
  t: number;
  towerId: string;
  hot?: boolean; // пятно «Извержения»: урон идёт в счёт способности и после её конца
}

interface Imp {
  x: number;
  y: number;
  t: number;
  dps: number;
  towerId: string;
  gateX: number;
  gateY: number;
  reach: number; // px from the gate
  facing: number;
}

interface Blast {
  x: number;
  y: number;
  t: number;
  r: number; // px
  dmg: number;
  towerId: string;
}

/** Bonuses a tower gets from where it stands (totem, squad, megatower) */
interface TowerMods {
  dmg: number;
  cd: number;
  range: number;
  lines: string[];
}

// «Связка» standing on the field until it is spent on binding two towers
function readAutoStart(): boolean {
  try {
    return localStorage.getItem('dark_frontier_autostart') === '1';
  } catch {
    return false;
  }
}

const ENEMY_DRAW_SCALE = 2.2;
const BOSS_DRAW_SCALE = 3.5;

export interface Binder {
  id: string;
  x: number;
  y: number;
  // «Тройная связка» (three binders merged): raises any tower or pair by one level, up to Ур.3
  triple?: boolean;
}

export interface Enemy {
  id: string;
  type: EnemyType;
  faction: number; // whose enemy it is (trait, boss, look); in a brawl each wave brings the opponent's own
  x: number; // world x in pixels
  y: number; // world y in pixels
  maxHp: number;
  hp: number;
  baseSpeed: number; // pixels per sec
  armor: number;
  magicResist: number;
  gold: number;
  entranceIndex: number;
  pathIndex: number; // index in current map path
  isFlyer: boolean;
  distanceTraveled: number;
  totalPathLengthPixels: number;

  // Status effects
  slowPercent: number;
  slowTimer: number;
  burnDps: number;
  burnSource?: string | null; // tower whose fire burns it, for the wave summary
  burnTimer: number;
  curseTimer: number;
  curseBonus: number;
  rageTriggered: boolean;
  warcryTimer: number;
  hasRevived: boolean; // undead trait
  risen?: boolean; // raised by the Lich: no gold, does not rise again
  isReviving: boolean; // 1s revive delay
  reviveTimer: number;
  invulnerableTimer: number; // dark elf boss
  dashTimer: number;
  repairCalm?: number; // люди: s since the last damage taken
  repairHp?: number; // люди: HP at the end of the previous step, to notice damage from any source
  // Effects of the playable factions' towers
  stunTimer?: number; // held by the hound or frozen: does not move or strike
  heldTimer?: number; // the hound holds it (drawing)
  poisonDps?: number;
  poisonTimer?: number;
  poisonSource?: string | null;
  chill?: number; // Ледяной стрелок: stacked slow
  chillTimer?: number;
  weakTimer?: number; // Ткачиха: strikes the artifact weaker
  seen?: Set<string>; // towers whose reach it has passed (Клинок сумерек)
  pFrozen?: Set<string>; // П megatowers that already froze it

  // Boss ability timer
  bossAbilityTimer: number;

  hitFlashTimer: number;
  // Siege (Артур, 2026-10-31): at the artifact the enemy stops and strikes it until killed
  sieging: boolean; // has reached the artifact at least once (counted as a breach once)
  siegeTimer: number; // s until the next strike
  attackAnim: number; // s left of the strike lunge (drawing only)
  siegeX?: number; // where it settles around the artifact (px), so a crowd spreads around it
  siegeY?: number;
  facing: number; // 1 = right, -1 = left (direction of movement)
  animSeed: number; // phase offset so figures do not step in unison
}

// A killed enemy falling over and fading out (drawn only, no game logic)
interface Corpse {
  name: string;
  tint: string | null;
  x: number;
  footY: number;
  facing: number;
  h: number;
  start: number; // real time, s
  duration: number;
}

// Walking motion by enemy type: px of path per step, hop height (px), lean (radians)
const GAIT: Partial<Record<EnemyType, { stride: number; lift: number; tilt: number }>> = {
  infantry: { stride: 20, lift: 2, tilt: 0.07 },
  scout: { stride: 16, lift: 2.5, tilt: 0.09 },
  heavy: { stride: 28, lift: 1.2, tilt: 0.05 },
  shaman: { stride: 24, lift: 1.5, tilt: 0.05 },
  swarm: { stride: 8, lift: 1.2, tilt: 0.12 },
  imp: { stride: 14, lift: 2.5, tilt: 0.1 },
  boss: { stride: 40, lift: 1.5, tilt: 0.04 },
};
const MAX_CORPSES = 30;
const HEX_BAKE = 2; // гексовое поле запекается вдвое крупнее для чёткости
const HEX_PREF_KEY = 'dark_frontier_hex_field'; // свободный режим: '0' — квадратное поле для сравнения
const SANDBOX_GOLD = 999999; // свободный режим: золото каждый кадр возвращается к этому числу

// Status marks on enemies: slowed (frost, «Оберег», the default priest) and cursed («Проклятие»)
const SLOW_COLOR = '#8fd4ff';
const CURSE_COLOR = '#b07cff';
const LICH_COLOR = '#a98be0'; // Лич: его воскрешение — фиолетовое, собственное «Возрождение» нежити — зелёно-серое

export interface Projectile {
  id: string;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  targetEnemyId: string | null;
  targetX: number;
  targetY: number;
  speed: number; // px/s
  damage: number;
  damageType: DamageType;
  towerType: TowerType;
  specs: string[]; // specializations of this tower type
  isRam: boolean;
  towerId: string; // who shot, for the wave summary
  aoeRadius: number; // cells, 0 = single target
  piercedEnemyIds: Set<string>;
}

export interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  type: 'puff' | 'spark' | 'ring' | 'heal' | 'ice';
  grow: number; // ring: how far the radius grows over its life, px
}

export interface FloatingText {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  life: number; // seconds
  maxLife: number;
}

export interface GrassBlade {
  x: number;
  y: number;
  height: number;
  bendOffset: number;
  phase: number;
}

export interface WaveSummary {
  id: number;
  wave: number; // the wave that was cleared
  killed: number;
  leaked: number;
  gold: number; // earned since the last summary: kills, clear reward, early start
  lives: number; // lives lost
  towers: { type: TowerType; title: string | null; second: TowerType | null; level: number; secondLevel: number; specs: string[]; secondSpecs: string[]; x: number; y: number; damage: number }[];
  other: number; // damage of towers sold during the wave and of unattributed sources
}

export interface RunSummary {
  wave: number; // waves launched
  killed: number;
  leaked: number;
  gold: number;
  lives: number;
  seconds: number; // game time of the run
  towers: WaveSummary['towers'];
  other: number;
}

/** Бой с армией на передышке между этапами: что сохраняется (см. `GameEngine.checkpoint`) */
export interface BattleCheckpoint {
  v: 1;
  gold: number; lives: number; tier: number; guardLevel: number;
  wavesLaunched: number; wave: number; rerollsThisWave: number;
  duelIncome: number; duelOutgoing: Partial<Record<SendType, number>>; duelOutgoingCost: number;
  stageDone: number[];
  countdown: number; // с до следующей волны
  towers: Tower[]; binders: Binder[]; backpack: BackpackItem[];
}

export interface BackpackItem {
  id: string;
  kind: 'tower' | 'binder';
  type: TowerType | null;
  triplet: boolean;
  startLevel: number; // 1 plain, 2 ★ (triplet), 3 a ready Ур.3 tower
  spec: string | null;
  paid: number;
}

export interface GameStateSnapshot {
  /** Стычка похода: число волн (null — обычный бой) */
  waveLimit: number | null;
  lives: number;
  gold: number;
  level: number;
  /** Endless mode on a generated map (its record is kept apart from the fixed map's) */
  randomMap: boolean;
  /** Свободный режим: золото без счёта, состав волн вручную */
  sandbox: boolean;
  /** Поход: своё имя босса этого боя (иначе null — имя по фракции) */
  bossName: string | null;
  hexField: boolean; // свободный режим: опытное гексовое поле с небом
  /** Название карты на поле (свободный режим: готовая, случайная или своя) */
  mapName: string;
  /** Свободный режим: открыт редактор карты — инструмент, местность и что мешает применить */
  mapEdit: { tool: MapEditTool; level: number; errors: string[]; exits: number; roads: number; blocked: number } | null;
  wave: number;
  maxWaves: number;
  tier: number;
  isWaveActive: boolean;
  isSpawning: boolean;
  isGameOver: boolean;
  isVictory: boolean;
  isPaused: boolean;
  allWavesLaunched: boolean;
  endless: boolean;
  duel: boolean;
  duelSendPrices: Record<SendType, number> | null; // duel: price of one more enemy of each type
  duelOutgoing: Partial<Record<SendType, number>>; // duel: bought, leaves with the next wave
  duelOutgoingCost: number;
  duelIncome: number; // duel: gold at the start of every round
  waveCountdown: number | null; // whole seconds left, null while a wave runs
  autoStart: boolean; // the next wave starts as soon as the last one is cleared
  earlyStartBonus: number;
  speed: number;
  selectedTower: Tower | null;
  hyperPlanLeft: number; // гипербашня: сколько клеток ещё выбрать (0 — не выбирает)
  eligibleMergeCount: number;
  mergeUsesBinder: boolean; // two towers and a binder stand in for the third: a plain one, for Ур.1
  selectedBinder: boolean;
  binderCount: number; // plain binders on the field
  selectedBinderTriple: boolean;
  canMergeBinders: boolean; // the selected plain binder and two more can merge
  upgradeTargetCount: number; // towers a triple binder can raise
  supplyPower: number; // value of the towers on the field (endless mode)
  supplyMult: number; // price multiplier of buying towers and binders, 1 outside endless mode
  supplyActive: boolean;
  sellRatio: number;
  backpack: { kind: 'tower' | 'binder'; type: TowerType | null; triplet: boolean; startLevel: number; sell: number; count: number; canMerge: boolean }[]; // одна запись — одна ячейка (стопка одинаковых башен)
  backpackSlots: number;
  faction: number; // whose enemies come (boss picture)
  nextWaveFaction: number; // whose enemies the coming wave brings (in a brawl, the current opponent's)
  runSummary: RunSummary | null; // totals of the whole run, once it is over
  waveSummary: WaveSummary | null; // totals of the last cleared wave
  nextWave: { type: EnemyType; count: number }[] | null; // what the coming wave brings while the timer runs
  placingSlot: number | null; // backpack slot being placed
  supplyNext: number; // power at which the multiplier grows next
  canUpgradeSelected: boolean; // the selected tower can be raised by a triple binder standing on the field
  isUpgrading: boolean; // triple binder waiting for a tap on a tower
  bindPartnerCount: number; // towers the selected one can be bound with
  zoomed: boolean; // the field is zoomed in (the «whole field» button shows)
  selectedDamage: { wave: number; run: number } | null; // damage the selected tower has dealt this wave and this run
  selectedSide: 'left' | 'right' | null; // half of the screen (with the zoom) the selected tower or binder is on
  // The artifact's card (open while the artifact is selected)
  castle: { hp: number; maxHp: number; level: number; maxLevel: number; damage: number; nextDamage: number | null; cost: number | null } | null;
  isBinding: boolean; // waiting for a tap on the second tower
  canMoveTowers: boolean; // between waves towers can be moved to a free cell
  moveCost: number | null; // price of moving a tower now: 0 free, null not now
  boons: BoonDef[]; // brawl: the artifact's boons taken
  stageBreak: { done: number; total: number } | null; // бой с армией: передышка между этапами
  heroSkills: { id: string; name: string; icon: string; desc: string; left: number; cooldown: number }[]; // поход: умения героя
  boonOffer: BoonDef[] | null; // brawl: three to choose one from, while an offer waits
  rerollCost: number; // price of the next shop reroll
  race: RaceId; // the player's faction
  mergeNeed: number; // towers that merge into the next level
  maxLevel: number;
  autoAbilities: boolean; // демоны: all abilities cast by themselves
  // Playable factions: what the selected tower has from its faction (bonuses, souls, crit, ability)
  selectedInfo: {
    lines: string[];
    ability: { name: string; desc: string; cost: number; cooldown: number; left: number; ready: boolean; auto: boolean } | null;
    sacrifice: number | null; // Врата бездны: volley damage of a sacrifice, null without a tower next to it
    fuseNone: string; // подпись приглушённой кнопки «Собрать» / «Гипер»
    title: string | null; // название собранной башни: «Мегабашня Т», «Гипербашня»
    fuseLevel: number | null; // уровень гипербашни
    fuseShapes: ('T' | 'P')[]; // в каких фигурах стоит башня: если больше одной, игрок выбирает, какую собрать
    fuse: 'mega' | 'hyper' | 'hyperup' | 'none' | null; // 'none' — a cultist tower that stands in no figure yet (the card shows the button dimmed, with a hint)
    // культисты: «Собрать» a figure into one tower, or megatowers into a hypertower
  } | null;
}

export class GameEngine {
  public canvas: HTMLCanvasElement | null = null;
  public ctx: CanvasRenderingContext2D | null = null;

  // State
  public level: number = 1;
  // Faction of the enemies (trait, boss, look): the level's own; in a duel the opponent's army
  public faction: number = 1;
  // The player's faction: whose towers the shop sells (Люди by default)
  public race: RaceId = 'humans';
  public megas: Mega[] = [];
  private fires: GroundFire[] = [];
  private imps: Imp[] = [];
  private blasts: Blast[] = [];
  private mods = new Map<string, TowerMods>();
  private modsDirty = true;
  private seenTimer = 0;
  public autoAbilities = false; // демоны: every ability casts by itself
  public difficulty: Difficulty = 'normal';
  public lives: number = CONFIG.lives.start;
  public gold: number = 200;
  public wave: number = 1;
  public tier: number = 1;
  public rerollsThisWave = 0; // shop rerolls since the current wave started
  public isPaused: boolean = false;
  public speedMultiplier: number = 1; // one of CONFIG.speeds
  // Real-time countdown to the next wave (not scaled by game speed); null while a wave runs
  public waveCountdown: number | null = null;
  public autoStart: boolean = readAutoStart();
  public isGameOver: boolean = false;
  public isVictory: boolean = false;
  // Endless mode: the 12 waves repeat, a boss every 12th wave, no victory
  public endless: boolean = false;
  // Duel: performance.now() of the duel start; wave N starts N rounds later (shared clock), null outside a duel
  public duelStart: number | null = null;
  // Бой с армией в походе (просьба Артура 2026-11-12: «в кампании нельзя менять скорость боя»): ни с кем не синхронизирован, поэтому
  // скорость разрешена, а часы раундов идут с той же скоростью (`duelSkew` — сколько мс добавлено к реальному времени)
  public duelSpeedable = false;
  private duelSkew = 0;
  // Пауза боя с армией (просьба Артура 2026-11-12): часы раундов стоят, пока игрок на паузе
  private pausedClock: number | null = null;
  public duelNow(): number {
    return this.clockFrozenAt ?? this.pausedClock ?? performance.now() + this.duelSkew;
  }
  // Передышки боя с армией (просьба Артура 2026-11-12, «этапы»): после этих волн, когда поле чисто, часы раундов стоят,
  // пока игрок не нажмёт «Продолжить»; `stageDone` — пройденные границы
  public stageEnds: number[] = [];
  private stageDone = new Set<number>();
  private clockFrozenAt: number | null = null;
  public stageBreakInfo(): { done: number; total: number } | null {
    if (this.clockFrozenAt === null) return null;
    return { done: this.stageDone.size + 1, total: this.stageEnds.length + 1 };
  }
  public resumeFromBreak(): void {
    if (this.clockFrozenAt === null) return;
    this.duelSkew = this.clockFrozenAt - performance.now();
    this.clockFrozenAt = null;
    const b = this.stageEnds.find((e) => !this.stageDone.has(e));
    if (b !== undefined) this.stageDone.add(b);
    this.logEv('stage-break-end', { wave: this.wavesLaunched });
    this.notifyState();
  }
  /** Сохранение боя на передышке (просьба Артура 2026-11-12): поле чисто, поэтому хватает башен, рюкзака, золота и счёта волн */
  public onCheckpoint?: (cp: BattleCheckpoint) => void;
  public checkpoint(): BattleCheckpoint {
    return {
      v: 1,
      gold: this.gold, lives: this.lives, tier: this.tier, guardLevel: this.guardLevel,
      wavesLaunched: this.wavesLaunched, wave: this.wave, rerollsThisWave: this.rerollsThisWave,
      duelIncome: this.duelIncome, duelOutgoing: { ...this.duelOutgoing }, duelOutgoingCost: this.duelOutgoingCost,
      stageDone: [...this.stageDone],
      countdown: Math.max(0, (this.duelNextWaveAt() - (this.clockFrozenAt ?? this.duelNow())) / 1000),
      towers: JSON.parse(JSON.stringify(this.towers)),
      binders: JSON.parse(JSON.stringify(this.binders)),
      backpack: JSON.parse(JSON.stringify(this.backpack)),
    };
  }
  /** Вызывать сразу после `startDuel` в бою с армией: ставит сохранённое поле и оставляет бой на передышке */
  public restoreCheckpoint(cp: BattleCheckpoint) {
    this.gold = cp.gold; this.lives = cp.lives; this.tier = cp.tier; this.guardLevel = cp.guardLevel;
    this.wavesLaunched = cp.wavesLaunched; this.wave = cp.wave; this.rerollsThisWave = cp.rerollsThisWave;
    this.duelIncome = cp.duelIncome; this.duelOutgoing = cp.duelOutgoing ?? {}; this.duelOutgoingCost = cp.duelOutgoingCost ?? 0;
    this.stageDone = new Set(cp.stageDone);
    this.towers = cp.towers; this.binders = cp.binders; this.backpack = cp.backpack;
    this.enemies = []; this.spawnQueue = []; this.isSpawning = false; this.waveInProgress = false;
    // часы: до следующей волны остаётся столько же, сколько было; часы стоят до «Продолжить бой»
    const now = performance.now();
    this.duelSkew = 0;
    this.duelStart = now + cp.countdown * 1000 - (cp.wavesLaunched + 1) * this.duelRoundLength * 1000;
    this.clockFrozenAt = now;
    this.waveCountdown = cp.countdown;
    this.notifyState();
  }
  public duelRoundLength: number = CONFIG.duel.roundLength; // real seconds per round (the brawl has its own)
  public duelOutgoing: Partial<Record<SendType, number>> = {}; // bought, leaves for the opponent with the next wave
  public duelOutgoingCost = 0;
  public duelIncome = 0; // gold added at the start of every round, grows with every send
  public onDuelSend?: (enemies: Partial<Record<SendType, number>>) => void;
  // Brawl: whose enemies wave N brings (the faction of the opponent faced before it); null keeps `faction`
  public waveFactionFor: ((wave: number) => number) | null = null;

  // Entities
  public towers: Tower[] = [];
  public binders: Binder[] = [];
  public enemies: Enemy[] = [];
  public projectiles: Projectile[] = [];
  public floatingTexts: FloatingText[] = [];
  private particles: Particle[] = [];
  private corpses: Corpse[] = [];
  private grassBlades: GrassBlade[] = [];
  // Поле из тайлов (запечённый холст) для карт, у которых есть набор в tiles.ts; null — рисуем дорогу кодом
  private fieldBake: HTMLCanvasElement | null = null;
  private fieldBakeMap: MapDef | null = null;
  // Декор для карт без тайлов (DECOR_ONLY): загруженные наборы и запечённый слой текущей карты
  private decorSets = new Map<string, Tileset | null>();
  private decorBake: HTMLCanvasElement | null = null;
  private decorBakeMap: MapDef | null = null;
  private tilesRetryAt = 0; // после неудачной загрузки до этого времени рисуем дорогу кодом, потом пробуем снова
  private tilesPending = false; // тайлы карты ещё грузятся: вместо дороги кодом рисуем заставку
  private fieldTiles: Map<string, Tileset | null> = new Map();

  // Spawn state
  public isSpawning: boolean = false;
  public waveInProgress: boolean = false;
  /** Свободный режим (песочница): золото без счёта, башни любого уровня, состав и запуск волн вручную */
  public sandbox = false;
  public wavesLaunched: number = 0; // how many of the 12 waves have been started
  /** Поход по глобальной карте: стычка из первых N волн уровня вместо 12 (null — обычный бой) */
  public waveLimit: number | null = null;
  /** Поход: босс выходит в последней волне боя, даже если она не 12-я (`WorldObj.bossLast`) */
  private worldBossLast = false;
  /** Поход: своё имя и оттенок босса боя (Каллен во главе порабощённых — `WorldObj.bossName`, `bossTint`); имя — подпись над боссом и в составе волны */
  public worldBossName: string | null = null;
  private worldBossTint: string | null = null;

  /** Последняя волна обычного боя: 12, в стычке похода — её N */
  private lastWave(): number {
    return this.waveLimit ?? CONFIG.waves.length;
  }
  public spawnQueue: { type: EnemyType; entrance: number; sent?: boolean; faction?: number }[] = []; // sent: by the duel opponent
  private spawnTimer: number = 0;
  private currentEntranceIndex: number = 0;

  // Undead graveyard for Lich boss resurrection
  private deadEnemiesGraveyard: {
    x: number;
    y: number;
    time: number;
    type: EnemyType;
    entranceIndex: number; // the revived enemy goes on along its own path from where it fell
    pathIndex: number;
    distanceTraveled: number;
  }[] = [];

  // Selection & Placement
  public selectedTowerId: string | null = null;
  public placingTowerType: TowerType | null = null;
  public placingIsTriplet: boolean = false;
  public placingStartLevel: number = 1;
  public pendingTripletSpec: string | null = null;
  public placingBinder: boolean = false;
  public backpack: BackpackItem[] = [];
  // Totals since the last summary (one wave; waves that merged give one summary)
  private waveStats = { killed: 0, leaked: 0, gold: 0, lives: 0, dmg: new Map<string, number>(), other: 0 };
  private dmgSource: string | null = null; // tower whose hit is being applied
  private summarySeq = 0;
  private runStats = { killed: 0, leaked: 0, gold: 0, lives: 0, time: 0, dmg: new Map<string, number>(), other: 0 };
  private abilDmg = new Map<string, number>(); // урон башни за время её способности и пятен «Извержения», за забег (лог)
  private abilSec = new Map<string, number>(); // секунд работы способности, за забег (лог)
  private abilHot = false; // следующий урон идёт в счёт способности
  public lastSummary: WaveSummary | null = null;
  public placingSlot: number | null = null;
  public selectedBinderId: string | null = null;
  public castleSelected = false; // the artifact's card is open
  public guardLevel = 1; // level of the artifact's own defence (CONFIG.siege.guard)
  // Brawl: the artifact's boons (CONFIG.brawl.boons) — one of three after every 3rd wave (просьба Артура 2026-11-01)
  public boonsOn = false;
  /** Поход: уровни пассивок лагеря (id усиления → уровень); каждый уровень — ещё одна доля усиления */
  public campLevels: Record<string, number> = {};
  /** Поход: умения героя на этот бой и их перезарядка (игровые секунды) */
  public heroSkills: { id: HeroAbilityDef['id']; left: number }[] = [];
  private heroOrderLeft = 0; // «Приказ: огонь!» ещё действует, с
  /** Лог партии (runLog.ts): пишется всегда, скачивается с экрана итогов */
  public runLog: RunLog | null = null;
  /** Данные вне движка для среза волны (доска Потасовки) — задаёт App */
  public logExtra: (() => unknown) | null = null;
  public boons: string[] = [];
  private boonOffers: string[][] = []; // offers not chosen yet, oldest first
  private guardTimer = 0;
  public bindingFromId: string | null = null; // tower waiting for its partner
  public upgradingFromBinderId: string | null = null; // triple binder waiting for the tower to raise
  public hoverCell: Point | null = null;
  // Field view: zoom (1 = whole field) and the visible top-left corner in field coordinates.
  // Drawing only: game rules always work in field coordinates
  public viewZoom = 1;
  private selectedDamageDirty = false; // the selected tower dealt damage since the last snapshot
  private selectedDamageShown = 0; // performance.now() of the last snapshot
  private selectedSideShown: 'left' | 'right' | null = null; // selectedSide in the last snapshot
  public viewX = 0;
  public viewY = 0;
  private dpr = 1; // device pixel ratio the canvas bitmap was sized for

  // Callbacks to UI
  public onStateChange?: (snapshot: GameStateSnapshot) => void;
  public onNeedSpecChoice?: (tower: Tower, part: 'main' | 'second') => void;
  public onWaveStarted?: () => void;

  private animFrameId: number | null = null;
  private lastTime: number = 0;
  private currentMap: MapDef = MAPS[0];
  /** Seed of the generated map (endless mode), null — the level's fixed map */
  public mapSeed: number | null = null;
  /** Свободный режим: черновик редактора карты (клетки — ключи «x,y»), null — редактор закрыт */
  private mapEdit: { level: number; name: string; road: Set<string>; exits: Point[]; blocked: Set<string>; tool: MapEditTool; paintAdd: boolean } | null = null;
  private mapEditCheck: ReturnType<typeof draftToMap> | null = null;
  private levelStartTime: number = 0;
  // Road geometry cached per level: ribbon polylines and unique steps for chevrons
  private roadLines: Point[][] = [];
  private roadSteps: { a: Point; b: Point }[] = [];
  // Гексовое поле: запечённая земля (трава, дорога, контуры гексов) и небо над ней
  private hexGround: { map: MapDef; k: number; canvas: HTMLCanvasElement } | null = null;
  private hexSky: { level: number; k: number; img: HTMLImageElement | null; base: HTMLImageElement | null; canvas: HTMLCanvasElement } | null = null;
  /**
   * Поход: сила захватчика в месте боя (0 — природа континента, 1 — биом карты; Артур 2026-11-07: «сделай и там» —
   * как на карте похода, у лагеря главы земля и небо как в Пограничье, к крепости проступает биом). Вне похода — 1.
   */
  private invasion = 1;

  constructor() {
    // Pre-allocate fixed particle pool (zero garbage collection)
    for (let i = 0; i < CONFIG.particles.maxCount; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 2,
        color: '#ffffff',
        alpha: 1,
        life: 0,
        maxLife: 1,
        type: 'spark',
        grow: 28,
      });
    }
  }

  public setCanvas(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resizeCanvas();
    this.generateGrass();
  }

  public resizeCanvas() {
    if (!this.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    this.dpr = dpr;
    // Logical dimensions: CONFIG.grid.totalWidth x totalHeight
    this.canvas.width = CONFIG.grid.totalWidth * dpr;
    this.canvas.height = CONFIG.grid.totalHeight * dpr;
    if (this.ctx) {
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  // Field point under a point of the canvas (both in logical px, 0..totalWidth)
  public screenToField(sx: number, sy: number): Point {
    return { x: this.viewX + sx / this.viewZoom, y: this.viewY + sy / this.viewZoom };
  }

  // Zoom by factor keeping the field point under (sx, sy) in place
  public zoomAt(sx: number, sy: number, factor: number) {
    const p = this.screenToField(sx, sy);
    const wasZoomed = this.viewZoom > 1;
    let zoom = Math.max(1, Math.min(CONFIG.view.maxZoom, this.viewZoom * factor));
    if (zoom < 1.02) zoom = 1; // snap back to the whole field
    this.viewZoom = zoom;
    this.viewX = p.x - sx / zoom;
    this.viewY = p.y - sy / zoom;
    this.clampView();
    if (wasZoomed !== zoom > 1) this.notifyState();
  }

  // Shift the view by a canvas distance (logical px): the field follows the finger
  public panBy(dx: number, dy: number) {
    this.viewX -= dx / this.viewZoom;
    this.viewY -= dy / this.viewZoom;
    this.clampView();
  }

  public resetView() {
    const wasZoomed = this.viewZoom > 1;
    this.viewZoom = 1;
    this.viewX = 0;
    this.viewY = 0;
    if (wasZoomed || this.selectedSide() !== this.selectedSideShown) this.notifyState();
  }

  private clampView() {
    const w = CONFIG.grid.totalWidth;
    const h = CONFIG.grid.totalHeight;
    this.viewX = Math.max(0, Math.min(w - w / this.viewZoom, this.viewX));
    this.viewY = Math.max(0, Math.min(h - h / this.viewZoom, this.viewY));
    // The tower card sits away from the selected tower: tell the UI when the tower crosses the middle of the screen
    if (this.selectedSide() !== this.selectedSideShown) this.notifyState();
  }

  // Half of the screen the selected tower or binder is on, with the zoom
  private selectedSide(): 'left' | 'right' | null {
    const sel =
      this.towers.find((t) => t.id === this.selectedTowerId) ||
      this.binders.find((b) => b.id === this.selectedBinderId) ||
      (this.castleSelected ? CONFIG.grid.castleCells[0] : null);
    if (!sel) return null;
    const sx = ((isHex() ? centerX(sel) * hexView.k() : centerX(sel)) - this.viewX) * this.viewZoom;
    return sx < CONFIG.grid.totalWidth / 2 ? 'left' : 'right';
  }

  /**
   * `faction`: whose enemies come; by default the map's own (endless mode lets one pick another).
   * `mapSeed`: a generated road (mapgen.ts) for this level's biome instead of its fixed map; endless mode only.
   */
  public startLevel(level: number, diff: Difficulty, endless = false, faction?: number, race: RaceId = 'humans', mapSeed: number | null = null, customMap: MapDef | null = null) {
    this.invasion = 1;
    setHex(true); // гексовое поле во всех режимах (выбор Артура 2026-11-06); квадраты — только в свободном режиме по кнопке
    this.race = CONFIG.races[race] ? race : 'humans';
    this.megas = [];
    this.fires = [];
    this.imps = [];
    this.blasts = [];
    this.mods.clear();
    this.modsDirty = true;
    this.autoAbilities = false;
    this.level = Math.max(1, Math.min(CONFIG.levelCount, level));
    this.faction = endless && faction ? Math.max(1, Math.min(CONFIG.factions.length, Math.floor(faction))) : this.level;
    this.waveFactionFor = null;
    this.boonsOn = false;
    this.boons = [];
    this.campLevels = {};
    this.heroSkills = [];
    this.heroOrderLeft = 0;
    this.boonOffers = [];
    this.difficulty = diff;
    this.endless = endless;
    this.sandbox = false;
    this.waveLimit = null;
    this.worldBossLast = false;
    this.worldBossName = null;
    this.worldBossTint = null;
    this.duelStart = null;
    this.duelSpeedable = false;
    this.duelSkew = 0;
    this.pausedClock = null;
    this.stageEnds = [];
    this.stageDone = new Set();
    this.clockFrozenAt = null;
    this.resetView();
    this.duelOutgoing = {};
    this.duelOutgoingCost = 0;
    this.duelIncome = 0;
    this.mapSeed = endless && mapSeed ? mapSeed : null;
    this.currentMap = customMap ?? (this.mapSeed ? generateMap(this.level, this.mapSeed) : MAPS[this.level - 1]);
    this.mapEdit = null;
    this.mapEditCheck = null;
    this.lives = CONFIG.lives.start;
    this.guardLevel = 1;
    this.guardTimer = 0;
    this.castleSelected = false;
    this.gold = calculateStartingGold(this.level, diff);
    this.wave = 1;
    this.tier = 1;
    this.rerollsThisWave = 0;
    this.isPaused = false;
    this.speedMultiplier = 1;
    this.waveCountdown = endless ? CONFIG.endless.between : CONFIG.waveTimer.first;
    this.isGameOver = false;
    this.isVictory = false;

    this.towers = [];
    this.binders = [];
    this.enemies = [];
    this.projectiles = [];
    this.floatingTexts = [];
    this.deadEnemiesGraveyard = [];
    this.corpses = [];
    for (const p of this.particles) p.active = false;

    this.isSpawning = false;
    this.waveInProgress = false;
    this.wavesLaunched = 0;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.currentEntranceIndex = 0;

    this.selectedTowerId = null;
    this.placingTowerType = null;
    this.placingIsTriplet = false;
    this.placingStartLevel = 1;
    this.pendingTripletSpec = null;
    this.placingBinder = false;
    this.backpack = [];
    this.placingSlot = null;
    this.resetWaveStats();
    this.runStats = { killed: 0, leaked: 0, gold: 0, lives: 0, time: 0, dmg: new Map(), other: 0 };
    this.abilDmg = new Map();
    this.abilSec = new Map();
    this.lastSummary = null;
    this.runLog = new RunLog({ mode: 'campaign', map: this.level, mapSeed, difficulty: diff, race: this.race, faction: this.faction });
    this.runLog.data.mode = endless ? 'endless' : 'campaign';
    this.selectedBinderId = null;
    this.bindingFromId = null;
    this.upgradingFromBinderId = null;
    this.hoverCell = null;

    this.levelStartTime = performance.now();
    this.buildRoadGeometry();
    this.generateGrass();
    this.notifyState();
    this.startLoop();
  }

  /**
   * Бой похода по глобальной карте (просьба Артура 2026-11-06): уровень биома, первые `waves` волн,
   * своя дорога из генератора по зерну отряда (крепость — готовая карта уровня, `seed` = null).
   */
  public startWorldBattle(level: number, waves: number, seed: number | null, diff: Difficulty = 'normal', opts: { faction?: number; bossLast?: boolean; bossName?: string; bossTint?: string } = {}) {
    this.startLevel(level, diff, false, undefined, 'humans', null, seed ? generateMap(level, seed) : null);
    this.waveLimit = Math.max(1, Math.min(CONFIG.waves.length, Math.floor(waves)));
    // Поход: чужие враги на биоме карты (порабощённые солдаты экспедиции в главе 3 — люди) и босс последней волны боя (Каллен)
    if (opts.faction && opts.faction >= 1 && opts.faction <= CONFIG.factions.length) this.faction = Math.floor(opts.faction);
    this.worldBossLast = !!opts.bossLast;
    this.worldBossName = opts.bossName ?? null;
    this.worldBossTint = opts.bossTint ?? null;
    if (this.runLog) this.runLog.data.mode = 'world';
    this.notifyState();
  }

  /** Свободный режим: бесконечный режим без таймера волн, с вечным золотом, 5-м ярусом и неубиваемым артефактом */
  public startSandbox(level: number, diff: Difficulty, faction: number, race: RaceId = 'humans', mapSeed: number | null = null, customMap: MapDef | null = null) {
    this.startLevel(customMap?.level ?? level, diff, true, faction, race, mapSeed, customMap);
    this.sandbox = true;
    setHex(GameEngine.readHexPref());
    if (this.runLog) this.runLog.data.mode = 'sandbox';
    this.tier = 5;
    while (this.guardLevel < CONFIG.siege.guard.damage.length) this.raiseGuard();
    this.gold = SANDBOX_GOLD;
    this.waveCountdown = null;
    this.wave = 1;
    this.notifyState();
  }

  /**
   * Свободный режим: запускает волну заданного состава. `counts` — сколько врагов каждого вида (рой — штук, босс — 0 или 1),
   * `wave` — номер волны для здоровья и наград, `faction` — чьи это враги. Волны можно запускать внахлёст.
   */
  public sandboxLaunch(counts: Partial<Record<EnemyType, number>>, wave: number, faction: number): boolean {
    if (!this.sandbox || this.isGameOver) return false;
    const list: EnemyType[] = [];
    for (const t of ['infantry', 'scout', 'heavy', 'flyer', 'shaman'] as EnemyType[]) {
      for (let i = 0; i < Math.max(0, Math.floor(counts[t] ?? 0)); i++) list.push(t);
    }
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    const swarm = Math.max(0, Math.floor(counts.swarm ?? 0));
    const boss = (counts.boss ?? 0) > 0;
    if (list.length + swarm + (boss ? 1 : 0) === 0) return false;
    this.wave = Math.max(1, Math.min(999, Math.floor(wave)));
    this.wavesLaunched++;
    this.rerollsThisWave = 0;
    this.faction = Math.max(1, Math.min(CONFIG.factions.length, Math.floor(faction)));
    const queued0 = this.spawnQueue.length;
    const entrances = this.currentMap.entrances.length;
    let ent = 0;
    for (const type of list) {
      this.spawnQueue.push({ type, entrance: ent % entrances, faction: this.faction });
      ent++;
    }
    for (let i = 0; i < swarm; i++) this.spawnQueue.push({ type: 'swarm', entrance: Math.floor(i / CONFIG.swarmGroupCount) % entrances, faction: this.faction });
    if (boss) this.spawnQueue.push({ type: 'boss', entrance: 0, faction: this.faction });
    this.logWaveStart(queued0);
    this.isSpawning = true;
    this.waveInProgress = true;
    this.spawnTimer = 0;
    this.onWaveStarted?.();
    this.notifyState();
    return true;
  }

  /** Свободный режим, опыт (просьба Артура 2026-11-06): гексовое поле с наклоном и небом, как бой «Героев 3» */
  public setHexField(on: boolean) {
    if (!this.sandbox) return;
    try {
      localStorage.setItem(HEX_PREF_KEY, on ? '1' : '0');
    } catch {
      /* без хранилища — только на эту партию */
    }
    setHex(on);
    this.hexGround = null;
    this.hoverCell = null;
    this.resetView();
    this.notifyState();
  }

  /** Геометрия клеток того же экземпляра модуля, что у движка (для бота баланса и проверок: --hex) */
  public static grid = gridModule;

  private static readHexPref(): boolean {
    try {
      return localStorage.getItem(HEX_PREF_KEY) !== '0';
    } catch {
      return true;
    }
  }

  /** Клетка поля под точкой холста (логические px, с приближением и наклоном) */
  public cellAtScreen(sx: number, sy: number): Point {
    const v = this.screenToField(sx, sy);
    const g = screenToGround(v.x, v.y);
    return cellAt(g.x, g.y);
  }

  /** Свободный режим: начать заново на той же карте (смена расы — тоже отсюда: башни другой расы с поля убираются) */
  public sandboxRestart(race: RaceId = this.race) {
    if (!this.sandbox) return;
    this.startSandbox(this.level, this.difficulty, this.faction, race, this.mapSeed, this.mapSeed ? null : this.currentMap);
  }

  // ----- Редактор карты свободного режима (просьба Артура 2026-11-05) -----

  /** Открыть редактор: черновик — карта на поле */
  public mapEditOpen() {
    if (!this.sandbox) return;
    this.selectTower(null);
    this.mapEditLoad(this.currentMap);
  }

  public mapEditClose() {
    this.mapEdit = null;
    this.mapEditCheck = null;
    this.notifyState();
  }

  public isMapEditing(): boolean {
    return this.mapEdit !== null;
  }

  /** Черновик из готовой карты (одной из пяти, случайной или своей) */
  public mapEditLoad(m: MapDef | MapDraft) {
    const d = 'paths' in m ? mapToDraft(m) : m;
    const k = (p: Point) => `${p.x},${p.y}`;
    this.mapEdit = {
      level: Math.max(1, Math.min(CONFIG.levelCount, d.level)),
      name: d.name,
      road: new Set(d.road.map(k)),
      exits: d.exits.map((p) => ({ x: p.x, y: p.y })),
      blocked: new Set(d.blocked.map(k)),
      tool: this.mapEdit?.tool ?? 'road',
      paintAdd: true,
    };
    this.mapEditChanged();
  }

  /** Случайная дорога местности черновика (mapgen.ts) */
  public mapEditRandom(seed: number) {
    if (!this.mapEdit) return;
    const level = this.mapEdit.level;
    this.mapEditLoad({ ...generateMap(level, seed), name: 'Случайная' });
  }

  public mapEditClear() {
    if (!this.mapEdit) return;
    this.mapEdit.road.clear();
    this.mapEdit.exits = [];
    this.mapEdit.blocked.clear();
    this.mapEditChanged();
  }

  public mapEditTool(tool: MapEditTool) {
    if (!this.mapEdit) return;
    this.mapEdit.tool = tool;
    this.notifyState();
  }

  /** Местность черновика: палитра, тайлы и числа уровня */
  public mapEditLevel(level: number) {
    if (!this.mapEdit) return;
    this.mapEdit.level = Math.max(1, Math.min(CONFIG.levelCount, Math.floor(level)));
    this.mapEditChanged(); // проверка хранит готовую карту с местностью: без пересчёта «Применить» взяла бы прежнюю
  }

  public mapEditDraft(name?: string): MapDraft | null {
    const e = this.mapEdit;
    if (!e) return null;
    const pts = (set: Set<string>) => [...set].map((k) => ({ x: Number(k.split(',')[0]), y: Number(k.split(',')[1]) }));
    return { level: e.level, name: name ?? e.name, road: pts(e.road), exits: e.exits.map((p) => ({ ...p })), blocked: pts(e.blocked) };
  }

  /**
   * Кисть редактора: `start` — первая клетка нажатия. Дорога и «без башен» по первой клетке решают, ставить или стирать,
   * и дальше ведут так же; выход ставится и снимается только касанием.
   */
  public mapEditPaint(x: number, y: number, start: boolean) {
    // Палец или мышь за кадр проходит несколько клеток: кисть ведётся от прошлой клетки шагами по сторонам, без дыр в дороге
    const last = this.mapEditLast;
    if (!start && last && Math.abs(x - last.x) + Math.abs(y - last.y) > 1) {
      let cx = last.x;
      let cy = last.y;
      while (cx !== x || cy !== y) {
        if (Math.abs(x - cx) >= Math.abs(y - cy)) cx += Math.sign(x - cx);
        else cy += Math.sign(y - cy);
        this.mapEditPaintCell(cx, cy, false);
      }
      return;
    }
    if (!start && last && last.x === x && last.y === y) return;
    this.mapEditPaintCell(x, y, start);
  }

  private mapEditLast: Point | null = null;

  private mapEditPaintCell(x: number, y: number, start: boolean) {
    this.mapEditLast = { x, y };
    const e = this.mapEdit;
    const p = { x, y };
    if (!e || !inField(p) || isCastle(p)) return;
    const k = `${x},${y}`;
    const exitIdx = e.exits.findIndex((c) => c.x === x && c.y === y);
    let changed = false;
    if (e.tool === 'exit') {
      if (!start) return;
      if (exitIdx >= 0) e.exits.splice(exitIdx, 1);
      else {
        if (e.exits.length >= MAX_EXITS) {
          this.addFloatingText(`Не больше ${MAX_EXITS} выходов`, centerX({ x, y }), centerY({ x, y }) - CONFIG.grid.cellSize / 2, '#e0452f');
          return;
        }
        e.exits.push(p);
        e.road.add(k);
        e.blocked.delete(k);
      }
      changed = true;
    } else if (e.tool === 'erase') {
      changed = e.road.delete(k) || e.blocked.delete(k) || exitIdx >= 0;
      if (exitIdx >= 0) e.exits.splice(exitIdx, 1);
    } else {
      const set = e.tool === 'road' ? e.road : e.blocked;
      if (start) e.paintAdd = !set.has(k);
      if (e.paintAdd && !set.has(k)) {
        set.add(k);
        (e.tool === 'road' ? e.blocked : e.road).delete(k);
        if (e.tool === 'block' && exitIdx >= 0) e.exits.splice(exitIdx, 1);
        changed = true;
      } else if (!e.paintAdd && set.has(k)) {
        set.delete(k);
        if (e.tool === 'road' && exitIdx >= 0) e.exits.splice(exitIdx, 1);
        changed = true;
      }
    }
    if (changed) this.mapEditChanged();
  }

  private mapEditChanged() {
    const d = this.mapEditDraft();
    this.mapEditCheck = d ? draftToMap(d) : null;
    this.notifyState();
  }

  /**
   * Поставить черновик на поле. Враги на поле и в очереди убираются (их пути — от старой карты),
   * башни и связки на новой дороге и на клетках без башен — тоже. Возвращает false, если в черновике ошибки.
   */
  public mapEditApply(): boolean {
    const map = this.mapEditCheck?.map;
    if (!this.sandbox || !this.mapEdit || !map) {
      sound.playError();
      return false;
    }
    this.level = map.level;
    this.currentMap = map;
    this.mapSeed = null;
    this.enemies = [];
    this.projectiles = [];
    this.spawnQueue = [];
    this.fires = [];
    this.imps = [];
    this.blasts = [];
    this.corpses = [];
    this.isSpawning = false;
    this.waveInProgress = false;
    this.mapEdit = null;
    this.mapEditCheck = null;
    const before = this.towers.length + this.binders.length;
    const cellOk = (c: Point) => this.isCellFree(c.x, c.y);
    this.towers = this.towers.filter((t) => {
      this.ignoreTowers.add(t.id);
      const ok = [{ x: t.x, y: t.y }, ...(t.extra ?? [])].every(cellOk);
      this.ignoreTowers.delete(t.id);
      return ok;
    });
    const binders = this.binders;
    this.binders = [];
    this.binders = binders.filter((b) => cellOk(b));
    const removed = before - this.towers.length - this.binders.length;
    this.markModsDirty();
    this.selectedTowerId = null;
    this.selectedBinderId = null;
    this.buildRoadGeometry();
    this.generateGrass();
    this.logEv('sandbox-map', {
      level: map.level,
      name: map.name,
      paths: map.paths.map((p) => p.map((c) => [c.x, c.y])),
      blocked: (map.blocked ?? []).map((c) => [c.x, c.y]),
      removed,
    });
    if (removed > 0) this.addFloatingText(`Убрано с дороги: ${removed}`, CONFIG.grid.totalWidth / 2, 120, '#f4c06a');
    sound.playBuy();
    this.notifyState();
    return true;
  }

  /** Свободный режим: состав волны N как в бесконечном режиме (для заготовки в окне состава) */
  public sandboxPreset(wave: number): Partial<Record<EnemyType, number>> {
    const def = waveDefinition(wave);
    const c = (n?: number) => (n ? calculateEnemyCount(n, this.level, wave, true, this.difficulty, false) : 0);
    return {
      infantry: c(def.infantry),
      scout: c(def.scout),
      heavy: c(def.heavy),
      flyer: c(def.flyer),
      shaman: c(def.shaman),
      swarm: c(def.swarm) * CONFIG.swarmGroupCount,
      boss: def.boss ? 1 : 0,
    };
  }

  /** Свободный режим: выбранной башне — нужный уровень и свойство (свойство берётся из списка башни) */
  public sandboxSetTower(level: number, spec: string | null): boolean {
    const t = this.towers.find((x) => x.id === this.selectedTowerId);
    if (!this.sandbox || !t) return false;
    const lvl = Math.max(1, Math.min(this.maxLevel(), Math.floor(level)));
    t.level = lvl;
    t.specs = lvl >= 2 && spec ? Array(this.specCountFor(lvl)).fill(spec) : [];
    this.logEv('sandbox-set', { id: t.id, level: lvl, specs: [...t.specs] });
    this.markModsDirty();
    this.notifyState();
    return true;
  }

  /** Сколько свойств хранит готовая башня уровня `level` (люди: три Ур.2 в Ур.3) */
  private specCountFor(level: number): number {
    if (level <= 1) return 0;
    return this.race === 'humans' ? (level === 2 ? 1 : 3) : level - 1;
  }

  /** Скачивание лога из свободного режима: записать срез и отдать файл */
  public saveLog(kind = 'sandbox-save') {
    if (!this.runLog) return;
    this.runLog.data.finalWave = this.wavesLaunched;
    this.runLog.data.seconds = Math.round(this.runStats.time);
    this.logEv(kind, { gold: Math.round(this.gold), towers: this.logTowers(), damageOther: Math.round(this.runStats.other) });
    this.runLog.save();
  }

  // Polylines run through cell centers (in cells), starting just outside the field edge
  // at the entrance and ending inside the castle, so the ribbon visibly enters and leaves.
  private buildRoadGeometry() {
    this.roadLines = [];
    this.roadSteps = [];
    const seen = new Set<string>();
    for (const path of this.currentMap.paths) {
      const pts: Point[] = path.map((c) => ({ x: c.x + 0.5, y: c.y + 0.5 }));
      const dir = this.entranceInward(path[0]);
      pts.unshift({ x: pts[0].x - dir.x * 0.6, y: pts[0].y - dir.y * 0.6 });
      const last = pts[pts.length - 1];
      const castle = CONFIG.grid.castleTarget;
      pts.push({ x: last.x + (castle.x - last.x) * 0.6, y: last.y + (castle.y - last.y) * 0.6 });
      this.roadLines.push(pts);
      for (let i = 1; i < pts.length; i++) {
        const key = `${pts[i - 1].x},${pts[i - 1].y}>${pts[i].x},${pts[i].y}`;
        if (seen.has(key)) continue;
        seen.add(key);
        this.roadSteps.push({ a: pts[i - 1], b: pts[i] });
      }
    }
  }

  private entranceInward(e: Point): Point {
    if (e.x === 0) return { x: 1, y: 0 };
    if (e.y === 0) return { x: 0, y: 1 };
    if (e.y === CONFIG.grid.rows - 1) return { x: 0, y: -1 };
    if (e.x === CONFIG.grid.cols - 1) return { x: -1, y: 0 };
    return { x: 1, y: 0 };
  }

  private generateGrass() {
    this.grassBlades = [];
    const roadSet = new Set<string>();
    for (const path of this.currentMap.paths) {
      for (const c of path) roadSet.add(`${c.x},${c.y}`);
    }
    for (const c of CONFIG.grid.castleCells) roadSet.add(`${c.x},${c.y}`);

    let tries = 0;
    while (this.grassBlades.length < CONFIG.grass.maxBlades && tries < 400) {
      tries++;
      const gx = Math.floor(Math.random() * CONFIG.grid.cols);
      const gy = Math.floor(Math.random() * CONFIG.grid.rows);
      if (!roadSet.has(`${gx},${gy}`)) {
        this.grassBlades.push({
          x: gx * CONFIG.grid.cellSize + 8 + Math.random() * (CONFIG.grid.cellSize - 16),
          y: gy * CONFIG.grid.cellSize + 8 + Math.random() * (CONFIG.grid.cellSize - 16),
          height: 6 + Math.random() * 5,
          bendOffset: (Math.random() - 0.5) * 4,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }
  }

  public startLoop() {
    if (this.animFrameId !== null) cancelAnimationFrame(this.animFrameId);
    this.lastTime = performance.now();
    const frame = (time: number) => {
      const rawDt = (time - this.lastTime) / 1000;
      this.lastTime = time;
      const dt = Math.min(rawDt, 0.05);

      // A duel goes on behind the pause menu: the opponent's clock does not stop
      if (this.spectating) {
        // на чужом поле враги едут по снимкам, а башни стреляют «для вида» (урона нет)
        const gameDt = dt * this.speedMultiplier;
        this.spectateStep(dt);
        this.spectateCombat(gameDt);
      } else if ((!this.isPaused || (this.duelStart !== null && !this.duelSpeedable)) && !this.isGameOver && !this.isVictory) {
        // Game time runs at the chosen speed in steps of at most 0.05 s
        const gameDt = dt * this.speedMultiplier;
        const steps = Math.max(1, Math.ceil(gameDt / 0.05 - 1e-9));
        for (let s = 0; s < steps; s++) {
          this.update(gameDt / steps);
        }
        if (this.duelSpeedable && this.clockFrozenAt === null) this.duelSkew += Math.min(rawDt, 0.25) * 1000 * (this.speedMultiplier - 1);
        this.tickWaveCountdown(Math.min(rawDt, 0.25));
      }

      // The selected tower's card shows its damage: refresh it a few times a second while it hits
      if (this.selectedLive()) this.selectedDamageDirty = true;
      if (this.selectedDamageDirty && time - this.selectedDamageShown > 250) this.notifyState();

      this.render();
      this.animFrameId = requestAnimationFrame(frame);
    };
    this.animFrameId = requestAnimationFrame(frame);
  }

  // The selected tower's card shows timers that run (ability, crit chance, souls)
  private selectedLive(): boolean {
    if (!this.selectedTowerId || this.race === 'humans' || this.race === 'orcs') return false;
    const t = this.towers.find((x) => x.id === this.selectedTowerId);
    return !!t && (t.critT !== undefined || t.souls !== undefined || (t.abilityCd ?? 0) > 0 || (t.abilityLeft ?? 0) > 0);
  }

  /** Duel: an endless game on this map whose waves follow the shared clock from startAt (performance.now()) */
  public startDuel(level: number, startAt: number, opponentArmy: number, race: RaceId = 'humans', roundLength: number = CONFIG.duel.roundLength, mapSeed: number | null = null) {
    this.startLevel(level, 'normal', true, undefined, race, mapSeed);
    this.duelRoundLength = roundLength;
    this.faction = Math.max(1, Math.min(CONFIG.factions.length, Math.floor(opponentArmy) || level));
    this.duelStart = startAt;
    if (this.runLog) this.runLog.data.mode = 'duel';
    this.waveCountdown = this.duelNextWaveAt() / 1000 - this.duelNow() / 1000;
    this.notifyState();
  }

  /** Duel: the opponent's castle fell or the opponent left */
  public winDuel() {
    if (this.duelStart === null || this.isGameOver || this.isVictory) return;
    this.isVictory = true;
    sound.playVictory();
    this.notifyState();
  }

  /** Duel: price of one more enemy of this type for the opponent, on the wave it will join */
  public sendPrice(type: SendType): number {
    return Math.round(calculateSendPrice(type, this.wavesLaunched + 1, this.level) * (1 - this.boon('envoy')));
  }

  /** Duel: buy an enemy for the opponent; it leaves with the next wave */
  public buySend(type: SendType): boolean {
    if (this.duelStart === null || this.isGameOver || this.isVictory) return false;
    const price = this.sendPrice(type);
    if (this.gold < price) {
      sound.playError();
      this.addFloatingText('Не хватает золота!', CONFIG.grid.totalWidth - 120, 100, '#e0452f');
      return false;
    }
    this.gold -= price;
    this.duelOutgoing[type] = (this.duelOutgoing[type] ?? 0) + 1;
    this.duelOutgoingCost += price;
    this.logEv('send', { type, price, gold: Math.round(this.gold) });
    sound.playBuy();
    this.notifyState();
    return true;
  }

  /** Duel: take back the enemies not sent yet, with their gold */
  public clearSends() {
    if (this.duelOutgoingCost === 0) return;
    this.gold += this.duelOutgoingCost;
    this.duelOutgoing = {};
    this.duelOutgoingCost = 0;
    this.notifyState();
  }

  /** Duel: enemies the opponent sent come out after the ones already waiting */
  public receiveSend(enemies: Partial<Record<SendType, number>>, army?: number) {
    const faction = army && army >= 1 && army <= CONFIG.factions.length ? Math.floor(army) : this.faction;
    if (this.duelStart === null || this.isGameOver || this.isVictory) return;
    const entrances = this.currentMap.entrances.length;
    let added = 0;
    for (const type of SEND_TYPES) {
      const n = Math.min(Math.max(0, Math.floor(Number(enemies[type]) || 0)), CONFIG.duel.sendMaxPerType);
      for (let i = 0; i < n; i++) {
        const entrance = this.currentEntranceIndex++ % entrances;
        const group = type === 'swarm' ? CONFIG.swarmGroupCount : 1;
        for (let g = 0; g < group; g++) this.spawnQueue.push({ type, entrance, sent: true, faction });
        added++;
      }
    }
    if (added === 0) return;
    this.addFloatingText(`Соперник прислал врагов: ${added}`, CONFIG.grid.totalWidth / 2, 120, '#e0452f');
    if (!this.isSpawning) this.spawnTimer = 0;
    this.isSpawning = true; // the wave they join is already in progress: no second clear reward
    this.notifyState();
  }

  // Duel, start of a round: the income comes in, the bought enemies leave and raise it from the next round
  /**
   * The wave number shown to the player. In a duel it is the round of the shared clock (the last wave
   * out, 1 before the first), the same for both players and the bot, whether or not the field is
   * clear; elsewhere the current wave, or the next one once it is cleared.
   */
  public shownWave(): number {
    return this.duelStart !== null ? Math.max(1, this.wavesLaunched) : this.wave;
  }

  /** Величина усиления артефакта, 0 — если его не брали */
  public boon(id: string): number {
    const n = (this.boons.includes(id) ? 1 : 0) + (this.campLevels[id] ?? 0);
    return n > 0 ? (BOONS.find((b) => b.id === id)?.value ?? 0) * n : 0;
  }

  /** Поход: умения героя на этот бой (после startWorldBattle / startDuel) */
  public setHeroSkills(ids: HeroAbilityDef['id'][]) {
    this.heroSkills = ids.filter((id) => HERO_ABILITIES.some((d) => d.id === id)).map((id) => ({ id, left: 0 }));
    this.notifyState();
  }

  /** Умение героя: кнопка на поле. false — нет такого, перезаряжается или бой окончен */
  public castHero(id: string): boolean {
    const s = this.heroSkills.find((h) => h.id === id);
    const def = HERO_ABILITIES.find((d) => d.id === id);
    if (!s || !def || s.left > 0 || this.isGameOver || this.isVictory) return false;
    if (def.id === 'stone' && this.lives >= this.livesMax()) {
      this.addFloatingText('Артефакт цел', castleX(), castleY() - 0.8 * CONFIG.grid.cellSize, '#9a96a6');
      return false;
    }
    const cx = castleX();
    const cy = castleY() - 0.8 * CONFIG.grid.cellSize;
    if (def.id === 'order') {
      this.heroOrderLeft = def.duration ?? 8;
      this.markModsDirty();
      for (const t of this.towers) this.spawnRing(centerX(t), centerY(t), '#f4c06a');
    } else if (def.id === 'stone') {
      const heal = Math.min(def.value, Math.max(0, this.livesMax() - this.lives));
      this.lives += heal;
      this.spawnRing(castleX(), castleY(), '#3ed6c4');
    } else if (def.id === 'shard') {
      for (const e of [...this.enemies]) {
        const frac = e.type === 'boss' || e.type === 'heavy' ? def.boss ?? def.value : def.value;
        this.directDamage(e, (e.hp * frac) / Math.max(0.1, 1 - Math.min(0.9, e.magicResist)), 'hero', 'lightning');
        this.spawnRing(e.x, e.y, '#3ed6c4');
      }
    }
    s.left = def.cooldown;
    this.addFloatingText(def.name, cx, cy, '#f4c06a');
    this.logEv('hero', { id });
    sound.playBuy();
    this.notifyState();
    return true;
  }

  private tickHero(dt: number) {
    if (this.heroOrderLeft > 0) {
      this.heroOrderLeft -= dt;
      if (this.heroOrderLeft <= 0) {
        this.heroOrderLeft = 0;
        this.markModsDirty();
      }
    }
    let changed = false;
    for (const h of this.heroSkills) {
      if (h.left <= 0) continue;
      const before = Math.ceil(h.left);
      h.left = Math.max(0, h.left - dt);
      if (Math.ceil(h.left) !== before) changed = true;
    }
    if (changed) this.notifyState();
  }

  /** Поход: пассивки лагеря на весь бой (после startWorldBattle / startDuel) */
  public setCampBoons(levels: Record<string, number>) {
    this.campLevels = { ...levels };
    this.lives = this.livesMax();
    this.markModsDirty();
    if (this.runLog) (this.runLog.data as { camp?: Record<string, number> }).camp = { ...levels };
    this.notifyState();
  }

  /** Three boons not taken and not on offer yet; nothing once the pool runs dry */
  private offerBoons() {
    const busy = new Set([...this.boons, ...this.boonOffers.flat()]);
    const offer = pickBoons(BOONS.filter((b) => !busy.has(b.id)), CONFIG.brawl.boonOffer).map((b) => b.id);
    if (offer.length === 0) return;
    this.boonOffers.push(offer);
    sound.playBuy();
  }

  /** Takes a boon from the oldest offer */
  public chooseBoon(id: string): boolean {
    const offer = this.boonOffers[0];
    if (!offer || !offer.includes(id) || this.isGameOver) return false;
    this.logEv('boon', { id, offered: offer });
    this.runLog?.data.boons.push({ id, wave: this.wavesLaunched, t: Math.round(this.runStats.time) });
    this.boonOffers.shift();
    this.boons.push(id);
    if (id === 'walls') this.lives += this.boon('walls');
    this.markModsDirty();
    this.spawnRing(castleX(), castleY(), '#c9a2ff');
    this.addFloatingText(BOONS.find((b) => b.id === id)?.name ?? '', castleX(), castleY() - 0.8 * CONFIG.grid.cellSize, '#c9a2ff');
    sound.playBuy();
    this.notifyState();
    return true;
  }

  /** The artifact's top HP: CONFIG.lives.start, more with «Крепкие стены» */
  public livesMax(): number {
    return CONFIG.lives.start + this.boon('walls');
  }

  private duelRoundStart() {
    const tithe = this.boon('tithe');
    if (tithe > 0) this.gold += tithe;
    const mendRound = this.wavesLaunched % CONFIG.brawl.mendEvery === 0; // wavesLaunched: this round's wave not counted yet
    const mend = mendRound ? Math.min(this.boon('mend'), Math.max(0, this.livesMax() - this.lives)) : 0;
    if (mend > 0) this.lives += mend;
    if (this.duelIncome > 0) {
      this.gold += this.duelIncome;
      this.addFloatingText(`+${this.duelIncome} золота дохода`, CONFIG.grid.totalWidth / 2, 40, '#f4c06a');
    }
    if (this.duelOutgoingCost > 0) {
      this.duelIncome += calculateSendIncome(this.duelOutgoingCost);
      this.onDuelSend?.(this.duelOutgoing);
      this.duelOutgoing = {};
      this.duelOutgoingCost = 0;
    }
  }

  private duelNextWaveAt(): number {
    return (this.duelStart ?? 0) + (this.wavesLaunched + 1) * this.duelRoundLength * 1000;
  }

  public stopLoop() {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  public setAutoStart(on: boolean) {
    this.autoStart = on;
    try {
      localStorage.setItem('dark_frontier_autostart', on ? '1' : '0');
    } catch {
      // private mode: the switch lives until the page is closed
    }
    this.notifyState();
  }

  public togglePause() {
    if (this.duelSpeedable && this.duelStart !== null && this.clockFrozenAt === null) {
      if (!this.isPaused) this.pausedClock = this.duelNow();
      else if (this.pausedClock !== null) {
        this.duelSkew = this.pausedClock - performance.now();
        this.pausedClock = null;
      }
    }
    this.isPaused = !this.isPaused;
    this.notifyState();
  }

  public setSpeed(speed: number) {
    if (!CONFIG.speeds.includes(speed) || (this.duelStart !== null && !this.duelSpeedable)) return; // a duel runs at ×1 (кроме боя с армией в походе)
    this.speedMultiplier = speed;
    this.notifyState();
  }

  // One step up or down the speed list (keys + and −), without wrapping around
  public stepSpeed(dir: 1 | -1) {
    const speeds = CONFIG.speeds;
    const idx = speeds.indexOf(this.speedMultiplier);
    this.setSpeed(speeds[Math.max(0, Math.min(speeds.length - 1, idx + dir))]);
  }

  // Counts down in real seconds, whatever the game speed; starts the wave at zero
  private tickWaveCountdown(realDt: number) {
    if (this.duelStart !== null) {
      // Duel: the next wave starts on the shared clock, whether or not this one is cleared
      if (this.clockFrozenAt !== null) return; // передышка между этапами
      const before = Math.ceil(this.waveCountdown ?? 0);
      this.waveCountdown = Math.max(0, (this.duelNextWaveAt() - this.duelNow()) / 1000);
      const stage = this.stageEnds.find((e) => e === this.wavesLaunched && !this.stageDone.has(e));
      if (stage !== undefined) {
        // граница этапа: ждём, пока поле станет чистым (следующая волна придержана), и ставим часы на паузу
        if (this.enemies.length === 0 && this.spawnQueue.length === 0 && !this.isSpawning) {
          this.clockFrozenAt = performance.now() + this.duelSkew;
          this.logEv('stage-break', { wave: this.wavesLaunched });
          this.onCheckpoint?.(this.checkpoint());
          sound.playBuy();
          this.notifyState();
        }
        return;
      }
      if (this.waveCountdown <= 0) this.startNextWave(true);
      else if (Math.ceil(this.waveCountdown) !== before) this.notifyState();
      return;
    }
    if (this.waveCountdown === null) return;
    const before = Math.ceil(this.waveCountdown);
    this.waveCountdown = Math.max(0, this.waveCountdown - realDt);
    if (this.waveCountdown <= 0) {
      this.startNextWave();
    } else if (Math.ceil(this.waveCountdown) !== before) {
      this.notifyState();
    }
  }

  /** Gold for starting the next wave now instead of waiting. */
  public earlyStartBonus(): number {
    if (this.duelStart !== null) return 0; // a duel has no early start
    if (this.waveCountdown !== null) {
      return Math.floor(this.waveCountdown) * CONFIG.waveTimer.goldPerSecond;
    }
    return this.enemies.length > 0 ? CONFIG.waveTimer.between * CONFIG.waveTimer.goldPerSecond : 0;
  }

  // -------------------------------------------------------------
  // Wave Spawning
  // -------------------------------------------------------------
  // fromClock: a duel wave started by the shared clock; in a duel it comes out over the unfinished one
  public startNextWave(fromClock = false): boolean {
    if (this.sandbox) return false; // в свободном режиме волну собирает игрок (sandboxLaunch)
    const duel = this.duelStart !== null;
    if (duel !== fromClock) return false; // a duel wave waits for the clock
    if ((this.isSpawning && !duel) || this.isGameOver || this.isVictory) return false;
    if (!this.endless && this.wavesLaunched >= this.lastWave()) return false;

    // Early start: gold for the seconds left on the timer; while enemies are still alive the waves
    // merge, so the cleared-wave reward of the unfinished one is paid now (Артур: награда сразу и +20)
    if (!duel && this.waveInProgress && this.enemies.length > 0 && (this.endless || this.wave <= this.lastWave())) {
      const reward = calculateWaveClearReward(this.wave);
      this.gold += reward;
      this.statGold(reward);
      this.addFloatingText(`Волна ${this.wave}: +${reward} золота`, CONFIG.grid.totalWidth / 2, 80, '#f4c06a');
    }
    const bonus = this.earlyStartBonus();
    if (bonus > 0) {
      this.gold += bonus;
      this.statGold(bonus);
      this.addFloatingText(`+${bonus} за ранний старт`, CONFIG.grid.totalWidth / 2, 40, '#f4c06a');
      sound.playBuy();
    }
    if (!duel) this.waveCountdown = null;
    else {
      // Duel and brawl: waves overlap and the field is rarely empty, so the totals close with each round
      if (this.wavesLaunched > 0) this.publishWaveSummary();
      this.duelRoundStart();
    }

    // An early start launches the next wave, not the current one again
    this.wave = this.wavesLaunched + 1;
    this.wavesLaunched++;
    this.rerollsThisWave = 0;
    if (this.boonsOn && this.wavesLaunched % CONFIG.brawl.boonEvery === 0) this.offerBoons();
    if (duel) this.waveCountdown = Math.max(0, (this.duelNextWaveAt() - this.duelNow()) / 1000);
    const waveDef = waveDefinition(this.wave);
    this.faction = this.factionOfWave(this.wave);
    const faction = this.faction;
    // A duel wave joins the enemies still waiting to come out
    if (!duel) this.spawnQueue = [];
    const queued0 = this.spawnQueue.length;

    // Helper to calculate count
    const getCount = (count?: number) =>
      count ? calculateEnemyCount(count, this.level, this.wave, this.endless, this.difficulty, duel) : 0;

    const list: EnemyType[] = [];
    if (waveDef.infantry) {
      const c = getCount(waveDef.infantry);
      for (let i = 0; i < c; i++) list.push('infantry');
    }
    if (waveDef.scout) {
      const c = getCount(waveDef.scout);
      for (let i = 0; i < c; i++) list.push('scout');
    }
    if (waveDef.heavy) {
      const c = getCount(waveDef.heavy);
      for (let i = 0; i < c; i++) list.push('heavy');
    }
    if (waveDef.flyer) {
      const c = getCount(waveDef.flyer);
      for (let i = 0; i < c; i++) list.push('flyer');
    }
    if (waveDef.shaman) {
      const c = getCount(waveDef.shaman);
      for (let i = 0; i < c; i++) list.push('shaman');
    }

    // Shuffle non-swarm enemies
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }

    // Swarm groups: each group consists of 8 individuals
    const swarmGroupsCount = waveDef.swarm ? getCount(waveDef.swarm) : 0;
    // Interleave swarm items into random positions
    for (let g = 0; g < swarmGroupsCount; g++) {
      const pos = Math.floor(Math.random() * (list.length + 1));
      list.splice(pos, 0, 'swarm'); // 'swarm' marker
    }

    // Boss always last
    const hasBoss = !!waveDef.boss || this.bossInWave(this.wave);

    // Assign entrances in round-robin
    const entrancesCount = this.currentMap.entrances.length;
    let entIdx = 0;

    for (const type of list) {
      if (type === 'swarm') {
        // Queue 8 swarm individuals 0.25s apart at this entrance
        const swarmEnt = entIdx % entrancesCount;
        entIdx++;
        for (let s = 0; s < CONFIG.swarmGroupCount; s++) {
          this.spawnQueue.push({ type: 'swarm', entrance: swarmEnt, faction });
        }
      } else {
        this.spawnQueue.push({ type, entrance: entIdx % entrancesCount, faction });
        entIdx++;
      }
    }

    if (hasBoss) {
      // Boss always comes out last at first entrance (index 0)
      this.spawnQueue.push({ type: 'boss', entrance: 0, faction });
    }

    this.logWaveStart(queued0);
    this.isSpawning = true;
    this.waveInProgress = true;
    this.spawnTimer = 0;
    this.onWaveStarted?.();
    this.notifyState();
    return true;
  }

  /** Поход: босс в последней волне боя, где волн меньше 12 (`startWorldBattle(..., { bossLast })`) */
  private bossInWave(wave: number): boolean {
    return this.worldBossLast && this.waveLimit !== null && wave === this.waveLimit && !waveDefinition(wave).boss;
  }

  // What the coming wave brings (the numbers startNextWave will queue), shown while the timer runs
  /** Whose enemies wave N brings: in a brawl the opponent's, elsewhere `faction` */
  private factionOfWave(wave: number): number {
    if (!this.waveFactionFor) return this.faction;
    const f = Math.floor(this.waveFactionFor(wave));
    return f >= 1 && f <= CONFIG.factions.length ? f : this.faction;
  }

  private nextWaveComposition(): { type: EnemyType; count: number }[] | null {
    if (this.waveCountdown === null || this.isGameOver || this.isVictory) return null;
    const number = this.wavesLaunched + 1;
    if (!this.endless && number > this.lastWave()) return null;
    const def = waveDefinition(number);
    const duel = this.duelStart !== null;
    const count = (n?: number) => (n ? calculateEnemyCount(n, this.level, number, this.endless, this.difficulty, duel) : 0);
    const out: { type: EnemyType; count: number }[] = [];
    const add = (type: EnemyType, c: number) => {
      if (c > 0) out.push({ type, count: c });
    };
    add('infantry', count(def.infantry));
    add('scout', count(def.scout));
    add('heavy', count(def.heavy));
    add('flyer', count(def.flyer));
    add('shaman', count(def.shaman));
    add('swarm', count(def.swarm) * CONFIG.swarmGroupCount);
    if (def.boss || this.bossInWave(number)) add('boss', 1);
    return out;
  }

  // ---- Лог партии (runLog.ts): только запись, на игру не влияет ----
  /** Игровое время забега, с (как `t` в логе) */
  public gameSeconds(): number {
    return Math.round(this.runStats.time * 10) / 10;
  }

  /** Заметка разработчика попадает в лог партии, а сам лог сразу сохраняется: заметка ссылается на него по `startedAt` */
  public logDevNote(note: { id: string; category: string; text: string }) {
    if (!this.runLog) return;
    this.logEv('dev-note', { ...note, gold: Math.round(this.gold), lives: Math.round(this.lives) });
    this.runLog.save();
  }

  private logEv(kind: string, fields: Record<string, unknown> = {}) {
    this.runLog?.event(this.runStats.time, this.wavesLaunched, kind, fields);
  }

  private logTowers(): LogTower[] {
    return this.towers.map((t) => ({
      id: t.id,
      x: t.x,
      y: t.y,
      main: { type: t.type, level: t.level, specs: [...t.specs] },
      second: t.second ? { type: t.second.type, level: t.second.level, specs: [...t.second.specs] } : null,
      ...(t.extra ? { extra: t.extra.map((c) => ({ ...c })) } : {}),
      ...(t.fused ? { fused: { shapes: [...t.fused.shapes], megas: t.fused.megas, parts: t.fused.parts.map((p) => ({ type: p.type, level: p.level, specs: [...p.specs] })) } } : {}),
      damage: Math.round(this.runStats.dmg.get(t.id) || 0),
      ...(CONFIG.towers[t.type].ability ? { abilDmg: Math.round(this.abilDmg.get(t.id) || 0), abilSec: Math.round((this.abilSec.get(t.id) || 0) * 10) / 10 } : {}),
    }));
  }

  private logWaveStart(queued0: number) {
    const log = this.runLog;
    if (!log) return;
    const composition: Record<string, number> = {};
    for (let i = queued0; i < this.spawnQueue.length; i++) {
      const q = this.spawnQueue[i];
      const key = `${q.faction}:${q.type}`;
      composition[key] = (composition[key] || 0) + 1;
    }
    let other = this.runStats.other;
    for (const [id, d] of this.runStats.dmg) if (!this.towers.some((t) => t.id === id)) other += d;
    let brawl: unknown;
    try {
      brawl = this.logExtra?.();
    } catch {
      brawl = undefined;
    }
    log.wave({
      wave: this.wavesLaunched,
      t: Math.round(this.runStats.time * 10) / 10,
      gold: Math.round(this.gold),
      lives: Math.round(this.lives),
      supplyPower: this.supplyPower(),
      killed: this.runStats.killed,
      leaked: this.runStats.leaked,
      goldEarned: this.runStats.gold,
      livesLost: Math.round(this.runStats.lives),
      enemiesOnField: this.enemies.length,
      queued: queued0,
      composition,
      towers: this.logTowers(),
      damageOther: Math.round(other),
      boons: [...this.boons],
      megas: this.megas.map((g) => g.shape),
      brawl,
    });
  }

  private logEnd() {
    const log = this.runLog;
    if (!log || log.data.result !== 'running') return;
    log.event(this.runStats.time, this.wavesLaunched, 'final', { gold: Math.round(this.gold), lives: Math.round(this.lives), towers: this.logTowers(), damageOther: Math.round(this.runStats.other) });
    log.finish(this.isVictory ? 'victory' : 'defeat', this.wavesLaunched, this.runStats.time);
  }

  private resetWaveStats() {
    this.waveStats = { killed: 0, leaked: 0, gold: 0, lives: 0, dmg: new Map(), other: 0 };
    this.dmgSource = null;
  }

  // Adds damage that was really dealt (not the overkill) to the tower that hit
  private recordDamage(amount: number) {
    if (amount <= 0) return;
    const id = this.dmgSource;
    if (id === null) {
      this.waveStats.other += amount;
      this.runStats.other += amount;
    } else {
      this.waveStats.dmg.set(id, (this.waveStats.dmg.get(id) || 0) + amount);
      this.runStats.dmg.set(id, (this.runStats.dmg.get(id) || 0) + amount);
      if (this.abilHot || (this.towers.find((t) => t.id === id)?.abilityLeft ?? 0) > 0) this.abilDmg.set(id, (this.abilDmg.get(id) || 0) + amount);
      if (id === this.selectedTowerId) this.selectedDamageDirty = true;
    }
  }

  private statGold(n: number) {
    this.waveStats.gold += n;
    this.runStats.gold += n;
  }

  private statKill() {
    this.waveStats.killed++;
    this.runStats.killed++;
  }

  // An enemy reached the artifact (counted once per enemy)
  private statLeak() {
    this.waveStats.leaked++;
    this.runStats.leaked++;
  }

  // Artifact HP lost
  private statCastleDamage(hp: number) {
    this.waveStats.lives += hp;
    this.runStats.lives += hp;
  }

  // Totals of the whole run for the end screens: the towers still standing keep their names, the rest go under «other»
  private buildRunSummary(): RunSummary {
    const st = this.runStats;
    let other = st.other;
    const towers: RunSummary['towers'] = [];
    for (const [id, damage] of st.dmg) {
      const t = this.towers.find((x) => x.id === id);
      if (t) towers.push({ type: t.type, second: t.second ? t.second.type : null, level: t.fused?.level ?? t.level, title: this.fusedName(t), secondLevel: t.second ? t.second.level : 0, specs: [...t.specs], secondSpecs: t.second ? [...t.second.specs] : [], x: t.x, y: t.y, damage: Math.round(damage) });
      else other += damage;
    }
    towers.sort((a, b) => b.damage - a.damage);
    return {
      wave: this.wavesLaunched,
      killed: st.killed,
      leaked: st.leaked,
      gold: st.gold,
      lives: st.lives,
      seconds: Math.round(st.time),
      towers,
      other: Math.round(other),
    };
  }

  // Closes the totals of the cleared wave; towers sold since count under «other»
  private publishWaveSummary() {
    const st = this.waveStats;
    let other = st.other;
    const towers: WaveSummary['towers'] = [];
    for (const [id, damage] of st.dmg) {
      const t = this.towers.find((x) => x.id === id);
      if (t) towers.push({ type: t.type, second: t.second ? t.second.type : null, level: t.fused?.level ?? t.level, title: this.fusedName(t), secondLevel: t.second ? t.second.level : 0, specs: [...t.specs], secondSpecs: t.second ? [...t.second.specs] : [], x: t.x, y: t.y, damage: Math.round(damage) });
      else other += damage;
    }
    towers.sort((a, b) => b.damage - a.damage);
    this.lastSummary = {
      id: ++this.summarySeq,
      wave: this.duelStart !== null ? this.wavesLaunched : this.wave, // a duel round: the wave launched last
      killed: st.killed,
      leaked: st.leaked,
      gold: st.gold,
      lives: st.lives,
      towers,
      other: Math.round(other),
    };
    this.resetWaveStats();
  }

  private spawnEnemy(type: EnemyType, entranceIdx: number, sent = false, faction: number = this.faction) {
    const baseDef = CONFIG.enemies[type];
    const entrance = this.currentMap.entrances[entranceIdx];
    const path = this.currentMap.paths[entranceIdx];
    const isFlyer = type === 'flyer';

    // Calculate path length in pixels
    let totalLen = 0;
    if (isFlyer) {
      const startPxX = centerX(entrance);
      const startPxY = centerY(entrance);
      const targetPxX = castleX();
      const targetPxY = castleY();
      totalLen = Math.hypot(targetPxX - startPxX, targetPxY - startPxY);
    } else {
      totalLen = path.length * CONFIG.grid.cellSize;
    }

    const hp = calculateEnemyHp(baseDef.hp, type, this.wave, this.level, this.difficulty, this.endless, faction);
    const armorBonus = this.endless ? endlessArmorBonus(this.wave) : 0;
    const killGold = Math.round(calculateKillGold(baseDef.gold, this.level, this.wave, this.supplyActive()) * (CONFIG.races[this.race].killGoldMult ?? 1) * (1 + this.boon('loot')));
    const gold = sent ? Math.round(killGold * CONFIG.duel.sentKillGoldShare) : killGold;

    if (this.runLog) {
      const st = this.runLog.enemy(`${faction}:${type}`);
      st.spawned++;
      if (sent) st.sent++;
      (st.hpByWave ??= {})[this.wave] = Math.round(hp);
    }
    const enemy: Enemy = {
      id: Math.random().toString(36).substring(2, 9),
      type,
      faction,
      x: centerX(entrance),
      y: centerY(entrance),
      maxHp: hp,
      hp,
      baseSpeed: baseDef.speed * CONFIG.grid.cellSize,
      armor: Math.min(0.9, baseDef.armor + armorBonus),
      magicResist: Math.min(0.9, baseDef.magicResist + armorBonus),
      gold,
      entranceIndex: entranceIdx,
      pathIndex: 0,
      isFlyer,
      distanceTraveled: 0,
      totalPathLengthPixels: totalLen,

      slowPercent: 0,
      slowTimer: 0,
      burnDps: 0,
      burnTimer: 0,
      curseTimer: 0,
      curseBonus: 0.25,
      rageTriggered: false,
      warcryTimer: 0,
      hasRevived: false,
      isReviving: false,
      reviveTimer: 0,
      invulnerableTimer: 0,
      dashTimer: 0,
      bossAbilityTimer: 0,
      hitFlashTimer: 0,
      sieging: false,
      siegeTimer: 0,
      attackAnim: 0,
      animSeed: Math.random() * Math.PI * 2,
      facing: 1,
    };

    if (type === 'boss') {
      sound.playBossSpawn();
      this.addFloatingText(this.worldBossName ? `${this.worldBossName.toUpperCase()}!` : 'ПОЯВИЛСЯ БОСС!', enemy.x, enemy.y - 20, '#e0452f');
    }

    this.enemies.push(enemy);
  }

  // -------------------------------------------------------------
  // Simulation Update
  // -------------------------------------------------------------
  private update(dt: number) {
    if (!this.isGameOver && !this.isVictory) this.runStats.time += dt;
    if (this.sandbox) this.gold = SANDBOX_GOLD;
    if (this.heroSkills.length) this.tickHero(dt);
    // 1. Spawning
    if (this.isSpawning) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        if (this.spawnQueue.length > 0) {
          const next = this.spawnQueue.shift()!;
          this.spawnEnemy(next.type, next.entrance, next.sent, next.faction);
          const interval = next.type === 'swarm' ? CONFIG.swarmInterval : CONFIG.spawnInterval;
          this.spawnTimer = interval;
        } else {
          this.isSpawning = false;
        }
      }
    }

    // 2. Wave completion check
    if (this.waveInProgress && !this.isSpawning && this.enemies.length === 0 && !this.isGameOver && !this.isVictory) {
      this.waveInProgress = false;
      if (this.sandbox) {
        // Свободный режим: ни наград, ни таймера, ни следующей волны сама
        this.publishWaveSummary();
        this.logEv('sandbox-clear', { gold: Math.round(this.gold), towers: this.logTowers() });
        this.runLog?.save();
        this.notifyState();
      } else if (this.endless || this.wave <= this.lastWave()) {
        // Wave cleared!
        const reward = calculateWaveClearReward(this.wave);
        this.gold += reward;
        this.statGold(reward);
        if (this.duelStart === null) this.publishWaveSummary(); // a duel closes them on the clock
        this.addFloatingText(`Волна ${this.wave} зачищена! +${reward} золота`, CONFIG.grid.totalWidth / 2, 80, '#f4c06a');
        sound.playBuy();

        if (!this.endless && this.wave === this.lastWave()) {
          // Level Completed!
          this.isVictory = true;
          sound.playVictory();
          this.notifyState();
          return;
        } else {
          this.wave++;
          // In a duel the clock already counts down to the next wave
          if (this.duelStart === null) this.waveCountdown = this.endless ? CONFIG.endless.between : CONFIG.waveTimer.between;
          this.notifyState();
          if (this.autoStart && this.duelStart === null) this.startNextWave();
        }
      }
    }

    // 3. Update towers & attack
    if (this.modsDirty) this.computeMods();
    if (this.race !== 'humans') this.updateRaceEffects(dt);
    for (const tower of this.towers) {
      if (tower.critT !== undefined) tower.critT += dt;
      if (tower.holdCd !== undefined && tower.holdCd > 0) tower.holdCd -= dt;
      if (tower.abilityCd !== undefined && tower.abilityCd > 0) tower.abilityCd = Math.max(0, tower.abilityCd - dt);
      if (tower.abilityLeft !== undefined && tower.abilityLeft > 0) {
        this.abilSec.set(tower.id, (this.abilSec.get(tower.id) || 0) + Math.min(dt, tower.abilityLeft));
        tower.abilityLeft = Math.max(0, tower.abilityLeft - dt);
        this.abilityTick(tower, dt);
      }
      if (tower.frozenTimer > 0) {
        tower.frozenTimer -= dt;
        continue;
      }
      if (tower.auto && CONFIG.towers[tower.type].ability) this.autoCast(tower);
      for (const part of towerParts(tower)) {
        if (part.cooldownTimer > 0) {
          part.cooldownTimer -= dt;
        }
        const stats = attackStats(part.type, part.level, part.specs);
        if (CONFIG.towers[part.type].special) {
          if (part.cooldownTimer <= 0) this.towerSpecial(tower, stats, part);
          continue;
        }
        if (stats.smiteDamage > 0) {
          part.smiteTimer -= dt;
          if (part.smiteTimer <= 0) {
            this.triggerPriestSmite(tower, part);
            part.smiteTimer = 2.5;
            part.shotAt = performance.now() / 1000;
          }
        }
        if (stats.normalAttack && part.cooldownTimer <= 0) {
          this.towerAttack(tower, part);
        }
      }
    }

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const targetEnemy = p.targetEnemyId ? this.enemies.find((e) => e.id === p.targetEnemyId) || null : null;

      if (p.isRam) {
        // Piercing linear bullet
        const dx = p.targetX - p.startX;
        const dy = p.targetY - p.startY;
        const len = Math.hypot(dx, dy) || 1;
        p.currentX += (dx / len) * p.speed * dt;
        p.currentY += (dy / len) * p.speed * dt;

        // Check enemies along path
        for (const e of this.enemies) {
          if (!p.piercedEnemyIds.has(e.id) && !e.isReviving) {
            const dist = Math.hypot(e.x - p.currentX, e.y - p.currentY);
            if (dist < 24) {
              p.piercedEnemyIds.add(e.id);
              this.dmgSource = p.towerId;
              this.applyDamageToEnemy(e, p.damage, p.damageType, p.towerType, p.specs);
              this.spawnSpark(e.x, e.y, '#c9663a');
            }
          }
        }

        const traveled = Math.hypot(p.currentX - p.startX, p.currentY - p.startY);
        if (traveled > len + 32) {
          // «Таран» + «Осада»: the bolt bursts where it stops
          if (p.aoeRadius > 0) this.handleProjectileImpact(p, null, p.currentX, p.currentY);
          this.projectiles.splice(i, 1);
        }
      } else {
        // Homing projectile towards target
        let destX = p.targetX;
        let destY = p.targetY;
        if (targetEnemy) {
          destX = targetEnemy.x;
          destY = targetEnemy.y;
        }

        const dx = destX - p.currentX;
        const dy = destY - p.currentY;
        const dist = Math.hypot(dx, dy);

        if (dist <= p.speed * dt || dist < 12) {
          // Impact!
          this.handleProjectileImpact(p, targetEnemy, destX, destY);
          this.projectiles.splice(i, 1);
        } else {
          p.currentX += (dx / dist) * p.speed * dt;
          p.currentY += (dy / dist) * p.speed * dt;
        }
      }
    }

    // 5. Update enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];

      // Hit flash decay
      if (e.hitFlashTimer > 0) e.hitFlashTimer -= dt;

      // Revive delay
      if (e.isReviving) {
        e.reviveTimer -= dt;
        if (e.reviveTimer <= 0) {
          e.isReviving = false;
          e.hp = Math.round(e.maxHp * 0.3);
          this.addFloatingText('ВОЗРОЖДЕНИЕ!', e.x, e.y - 12, '#c9d6b0');
          this.spawnRing(e.x, e.y, '#c9d6b0');
        }
        continue;
      }

      // Status timers
      if (e.slowTimer > 0) {
        e.slowTimer -= dt;
        if (e.slowTimer <= 0) e.slowPercent = 0;
      }
      if (e.curseTimer > 0) e.curseTimer -= dt;
      if (e.warcryTimer > 0) e.warcryTimer -= dt;
      if (e.weakTimer) e.weakTimer = Math.max(0, e.weakTimer - dt);
      if (e.heldTimer) e.heldTimer = Math.max(0, e.heldTimer - dt);
      if (e.chillTimer) {
        e.chillTimer -= dt;
        if (e.chillTimer <= 0) e.chill = 0;
      }
      // Poison of the Чумной котёл (ignores resist, like burning; the faction's stance to poison counts)
      if (e.poisonTimer && e.poisonTimer > 0) {
        e.poisonTimer -= dt;
        const dmg = e.invulnerableTimer > 0 ? 0 : (e.poisonDps ?? 0) * dt * calculateFactionDamageMult('poison', e.faction);
        this.dmgSource = e.poisonSource ?? null;
        this.recordDamage(Math.min(e.hp, dmg));
        e.hp -= dmg;
        if (Math.random() < 0.15) this.spawnSpark(e.x, e.y, '#8fd45a');
        if (e.hp <= 0) {
          this.killEnemy(e, i);
          continue;
        }
      }
      if (e.invulnerableTimer > 0) e.invulnerableTimer -= dt;

      // Burn tick
      if (e.burnTimer > 0) {
        e.burnTimer -= dt;
        // Ignores resist; the faction's stance to fire counts (demons ×0,5)
        let burnDmg = e.burnDps * dt * calculateFactionDamageMult('fire', e.faction);
        // The Shadow Queen's invulnerability covers burning too
        if (e.invulnerableTimer > 0) burnDmg = 0;
        this.dmgSource = e.burnSource ?? null;
        this.recordDamage(Math.min(e.hp, burnDmg));
        e.hp -= burnDmg;
        if (Math.random() < 0.2) this.spawnSpark(e.x, e.y, '#ff4a2f');
        if (e.hp <= 0) {
          this.killEnemy(e, i);
          continue;
        }
      }

      // Shaman aura heal (heals others in radius 1.5 cells by 6 hp/s)
      if (e.type === 'shaman') {
        const healRadiusPx = 1.5 * CONFIG.grid.cellSize;
        const healAmt = 6 * dt;
        for (const ally of this.enemies) {
          if (ally.id !== e.id && !ally.isReviving && ally.hp < ally.maxHp) {
            const d = Math.hypot(ally.x - e.x, ally.y - e.y);
            if (d <= healRadiusPx) {
              ally.hp = Math.min(ally.maxHp, ally.hp + healAmt);
              if (Math.random() < 0.05) this.spawnSpark(ally.x, ally.y, '#8fa34a');
            }
          }
        }
      }

      // Люди trait: field repair - unhurt for repairDelay s, the enemy restores repairPerSec of max HP a second
      if (e.faction === 6) {
        const hum = CONFIG.humans;
        if (e.repairHp !== undefined && e.hp < e.repairHp - 1e-6) e.repairCalm = 0;
        else e.repairCalm = (e.repairCalm ?? 0) + dt;
        if (e.repairCalm >= hum.repairDelay && e.hp < e.maxHp) {
          e.hp = Math.min(e.maxHp, e.hp + e.maxHp * hum.repairPerSec * dt);
          if (Math.random() < 0.04) this.spawnSpark(e.x, e.y, '#5b8fd8');
        }
        e.repairHp = e.hp;
      }

      // Boss ability triggers
      if (e.type === 'boss') {
        e.bossAbilityTimer += dt;
        this.updateBossAbilities(e);
      }

      // Calculate effective speed
      let speed = e.baseSpeed * (1 - this.boon('mire'));

      // Orc trait: Rage (HP < 50% -> speed x1.3)
      if (e.faction === 1 && e.hp < e.maxHp * 0.5) {
        speed *= 1.3;
        if (!e.rageTriggered) {
          e.rageTriggered = true;
          this.addFloatingText('ЯРОСТЬ!', e.x, e.y - 12, '#f4c06a');
        }
      }

      // Warcry buff
      if (e.warcryTimer > 0) {
        speed *= 1.4;
      }

      // Slow penalty
      if (e.slowPercent > 0) {
        speed *= 1 - e.slowPercent;
      }

      // Held by the hound or frozen: stands still and does not strike
      if (e.stunTimer && e.stunTimer > 0) {
        e.stunTimer -= dt;
        continue;
      }

      // Siege: within reach of the artifact the enemy stops and strikes it (Артур, 2026-10-31)
      if (e.attackAnim > 0) e.attackAnim -= dt;
      const castlePxX = castleX();
      const castlePxY = castleY();
      const toCastle = Math.hypot(castlePxX - e.x, castlePxY - e.y);
      if (toCastle <= this.siegeReach(e)) {
        if (!e.sieging) {
          e.sieging = true;
          e.siegeTimer = 0.3 + (e.animSeed / (Math.PI * 2)) * 0.4; // first strike soon, not all in unison
          // Settle a little to the side along the ring, so those coming by one road do not stand in one point
          const ang = Math.atan2(e.y - castlePxY, e.x - castlePxX) + (e.animSeed / Math.PI - 1) * 0.7;
          e.siegeX = castlePxX + Math.cos(ang) * toCastle;
          e.siegeY = castlePxY + Math.sin(ang) * toCastle;
          this.statLeak();
          if (this.runLog) this.runLog.enemy(`${e.faction}:${e.type}`).leaked++;
        }
        if (e.siegeX !== undefined && e.siegeY !== undefined) {
          const sx = e.siegeX - e.x;
          const sy = e.siegeY - e.y;
          const sd = Math.hypot(sx, sy);
          const st = Math.min(sd, speed * 0.5 * dt);
          if (sd > 0.5) {
            e.x += (sx / sd) * st;
            e.y += (sy / sd) * st;
          }
        }
        if (Math.abs(castlePxX - e.x) > 1) e.facing = castlePxX < e.x ? -1 : 1;
        e.siegeTimer -= dt;
        if (e.siegeTimer <= 0) {
          const atk = CONFIG.siege.attack[e.type];
          e.siegeTimer += atk.every;
          this.hitCastle(e, atk.dmg);
          if (this.isGameOver) return;
        }
        continue;
      }

      // Movement
      if (e.isFlyer) {
        // Fly directly towards castle center
        const dx = castlePxX - e.x;
        const dy = castlePxY - e.y;
        const dist = toCastle;
        const moveStep = Math.min(speed * dt, dist);
        if (dist > 0.5) {
          e.x += (dx / dist) * moveStep;
          e.y += (dy / dist) * moveStep;
        }
        e.distanceTraveled += moveStep;
        if (Math.abs(dx) > 1) e.facing = dx < 0 ? -1 : 1;
      } else {
        // Follow map road path
        const path = this.currentMap.paths[e.entranceIndex];
        const nextCell = path[e.pathIndex + 1];

        if (!nextCell) {
          // Reached the end of the road next to the castle: walk towards the castle until in reach
          const dx = castlePxX - e.x;
          const dy = castlePxY - e.y;
          const dist = toCastle;
          const moveStep = Math.min(speed * dt, dist);
          if (dist > 0.5) {
            e.x += (dx / dist) * moveStep;
            e.y += (dy / dist) * moveStep;
          }
          e.distanceTraveled += moveStep;
          if (Math.abs(dx) > 1) e.facing = dx < 0 ? -1 : 1;
        } else {
          const targetPxX = centerX(nextCell);
          const targetPxY = centerY(nextCell);
          const dx = targetPxX - e.x;
          const dy = targetPxY - e.y;
          const dist = Math.hypot(dx, dy);
          const moveStep = speed * dt;
          if (Math.abs(dx) > 1) e.facing = dx < 0 ? -1 : 1;

          if (dist <= moveStep) {
            e.x = targetPxX;
            e.y = targetPxY;
            e.distanceTraveled += dist;
            e.pathIndex++;
          } else {
            e.x += (dx / dist) * moveStep;
            e.y += (dy / dist) * moveStep;
            e.distanceTraveled += moveStep;
          }
        }
      }
    }

    // The artifact's own defence
    if (!this.isGameOver && !this.isVictory) this.updateGuard(dt);

    // 6. Update particles
    for (const p of this.particles) {
      if (!p.active) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life += dt;
      p.alpha = Math.max(0, 1 - p.life / p.maxLife);
      if (p.life >= p.maxLife) p.active = false;
    }

    // 7. Update floating text
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y -= 25 * dt;
      ft.life += dt;
      if (ft.life >= ft.maxLife) {
        this.floatingTexts.splice(i, 1);
      }
    }

    // Clean old graveyard entries (> 10s old)
    const gameNow = this.runStats.time;
    this.deadEnemiesGraveyard = this.deadEnemiesGraveyard.filter((g) => gameNow - g.time <= 10);
  }

  // -------------------------------------------------------------
  // Boss Abilities
  // -------------------------------------------------------------
  private updateBossAbilities(boss: Enemy) {
    if (boss.isReviving) return;

    // Level 1: Вождь (Warchief) - every 10s battle cry (+40% speed for 3s to allies in 2.5 cells)
    if (boss.faction === 1 && boss.bossAbilityTimer >= 10) {
      boss.bossAbilityTimer = 0;
      sound.playBossSpawn();
      this.addFloatingText('БОЕВОЙ КЛИЧ!', boss.x, boss.y - 18, '#f4c06a');
      this.spawnRing(boss.x, boss.y, '#f4c06a');
      const cryRadius = 2.5 * CONFIG.grid.cellSize;
      for (const ally of this.enemies) {
        if (Math.hypot(ally.x - boss.x, ally.y - boss.y) <= cryRadius) {
          ally.warcryTimer = 3.0;
        }
      }
    }

    // Level 2: Лич (Lich) - every 12s resurrects up to 3 dead in radius 3 cells from last 10s with 30% HP
    if (boss.faction === 2 && boss.bossAbilityTimer >= 12) {
      boss.bossAbilityTimer = 0;
      const reviveRadius = 3.0 * CONFIG.grid.cellSize;
      const eligible = this.deadEnemiesGraveyard
        .filter((g) => Math.hypot(g.x - boss.x, g.y - boss.y) <= reviveRadius)
        .sort((a, b) => Math.hypot(a.x - boss.x, a.y - boss.y) - Math.hypot(b.x - boss.x, b.y - boss.y)); // nearest to the Lich first
      if (eligible.length > 0) {
        sound.playBossSpawn();
        this.addFloatingText('ВОСКРЕШЕНИЕ ЛИЧА!', boss.x, boss.y - 18, LICH_COLOR);
        this.spawnRing(boss.x, boss.y, LICH_COLOR, 3.0 * CONFIG.grid.cellSize); // the Lich's reach: its own, violet, wider than a plain revive
        const toRevive = eligible.slice(0, 3);
        // a body rises once: the risen leave the graveyard
        this.deadEnemiesGraveyard = this.deadEnemiesGraveyard.filter((g) => !toRevive.includes(g));
        for (const g of toRevive) {
          this.spawnEnemy(g.type, g.entranceIndex, false, boss.faction);
          const newSpawn = this.enemies[this.enemies.length - 1];
          newSpawn.x = g.x;
          newSpawn.y = g.y;
          newSpawn.pathIndex = g.pathIndex;
          newSpawn.distanceTraveled = g.distanceTraveled;
          newSpawn.hp = Math.round(newSpawn.maxHp * 0.3);
          newSpawn.risen = true;
          newSpawn.hasRevived = true;
          newSpawn.gold = 0;
          this.spawnRing(g.x, g.y, LICH_COLOR);
        }
      }
    }

    // Level 3: Ледяной жрец (Ice Priest) - every 12s freezes closest tower for 4s
    if (boss.faction === 3 && boss.bossAbilityTimer >= 12) {
      boss.bossAbilityTimer = 0;
      let closestTower: Tower | null = null;
      let minDist = Infinity;
      for (const t of this.towers) {
        const tx = centerX(t);
        const ty = centerY(t);
        const d = Math.hypot(tx - boss.x, ty - boss.y);
        if (d < minDist) {
          minDist = d;
          closestTower = t;
        }
      }
      if (closestTower) {
        closestTower.frozenTimer = 4.0;
        this.addFloatingText('БАШНЯ ЗАМОРОЖЕНА!', boss.x, boss.y - 18, '#7fc8f0');
        this.spawnRing(centerX(closestTower), centerY(closestTower), '#7fc8f0');
      }
    }

    // Level 4: Владыка бездны (Abyss Lord) - every 10s summons 3 imps
    if (boss.faction === 4 && boss.bossAbilityTimer >= 10) {
      boss.bossAbilityTimer = 0;
      sound.playBossSpawn();
      this.addFloatingText('ПРИЗЫВ БЕСОВ!', boss.x, boss.y - 18, '#e0452f');
      for (let i = 0; i < 3; i++) {
        this.spawnEnemy('imp', boss.entranceIndex, false, boss.faction);
        const imp = this.enemies[this.enemies.length - 1];
        imp.x = boss.x + (Math.random() - 0.5) * 32;
        imp.y = boss.y + (Math.random() - 0.5) * 32;
        imp.pathIndex = boss.pathIndex;
        imp.distanceTraveled = boss.distanceTraveled;
        this.spawnSpark(imp.x, imp.y, '#e0452f');
      }
    }

    // Level 5: Королева теней (Shadow Queen) - every 15s invulnerable for 3s & dashes 3 cells along path
    if (boss.faction === 5 && boss.bossAbilityTimer >= 15) {
      boss.bossAbilityTimer = 0;
      boss.invulnerableTimer = 3.0;
      sound.playBossSpawn();
      this.addFloatingText('ТЕНЕВОЙ РЫВОК!', boss.x, boss.y - 18, '#3ed6c4');
      this.spawnRing(boss.x, boss.y, '#3ed6c4');

      // Advance exactly 3 cells along the road from where she stands (stops short of the castle)
      this.advanceAlongPath(boss, 3);
    }

    // Люди: Командор экспедиции - every gateEvery s carries himself and up to gateCount allies nearby
    // gateCells along the road (the gate of the artifacts; approved by Артур 2026-10-31)
    const hum = CONFIG.humans;
    if (boss.faction === 6 && boss.bossAbilityTimer >= hum.gateEvery) {
      boss.bossAbilityTimer = 0;
      sound.playBossSpawn();
      this.addFloatingText('ВРАТА!', boss.x, boss.y - 18, '#5b8fd8');
      const radius = hum.gateRadius * CONFIG.grid.cellSize;
      const carried = this.enemies
        .filter((e) => e !== boss && !e.isFlyer && !e.isReviving && !e.sieging && Math.hypot(e.x - boss.x, e.y - boss.y) <= radius)
        .sort((a, b) => Math.hypot(a.x - boss.x, a.y - boss.y) - Math.hypot(b.x - boss.x, b.y - boss.y))
        .slice(0, hum.gateCount);
      for (const e of [boss, ...carried]) {
        if (e.sieging) continue;
        this.spawnRing(e.x, e.y, '#5b8fd8');
        this.advanceAlongPath(e, hum.gateCells);
        this.spawnRing(e.x, e.y, '#5b8fd8');
      }
    }
  }

  /** Moves a walking enemy `cells` cells along its road from where it stands (stops short of the castle) */
  private advanceAlongPath(boss: Enemy, cells: number) {
      const path = this.currentMap.paths[boss.entranceIndex];
      let left = cells * CONFIG.grid.cellSize;
      while (left > 0) {
        const next = path[boss.pathIndex + 1];
        const tx = next ? centerX(next) : castleX();
        const ty = next ? centerY(next) : castleY();
        const dx = tx - boss.x;
        const dy = ty - boss.y;
        const dist = Math.hypot(dx, dy);
        if (!next) {
          const step = Math.min(left, Math.max(0, dist - 15));
          if (dist > 0) {
            boss.x += (dx / dist) * step;
            boss.y += (dy / dist) * step;
          }
          boss.distanceTraveled += step;
          break;
        }
        if (dist <= left) {
          boss.x = tx;
          boss.y = ty;
          boss.pathIndex++;
          boss.distanceTraveled += dist;
          left -= dist;
        } else {
          boss.x += (dx / dist) * left;
          boss.y += (dy / dist) * left;
          boss.distanceTraveled += left;
          break;
        }
      }
  }

  // -------------------------------------------------------------
  // Tower Attacks & Targeting
  // -------------------------------------------------------------
  private towerAttack(tower: Tower, part: TowerPart) {
    this.dmgSource = tower.id;
    const baseDef = CONFIG.towers[part.type];
    const towerPxX = centerX(tower);
    const towerPxY = centerY(tower);
    const stats = attackStats(part.type, part.level, part.specs);
    const specs = specsOfType(part.type, part.specs);
    const mods = this.towerMods(tower);
    const rangePx = stats.range * mods.range * CONFIG.grid.cellSize;
    // A tower bound to a priest shoots stronger
    const partner = tower.second ? (part === tower ? tower.second : tower) : null;
    let rawDamage = stats.damage * mods.dmg * (partner?.type === 'priest' && part.type !== 'priest' ? 1 + CONFIG.priestBase.pairBonus : 1);
    const cooldown = stats.cooldown * mods.cd * (this.abilityOn(tower, 'dem_ember') ? 0.5 / CONFIG.raceMech.abilityMult : 1);

    // Find enemies in range
    const inRange = this.enemies.filter((e) => {
      if (e.isReviving || e.invulnerableTimer > 0) return false; // no shots at the invulnerable Shadow Queen
      const d = Math.hypot(e.x - towerPxX, e.y - towerPxY);
      return d <= rangePx;
    });

    if (inRange.length === 0) return;

    // Sort according to priority
    this.sortEnemiesByPriority(inRange, tower.priority, towerPxX, towerPxY);

    const targets = inRange.slice(0, stats.targets);
    if (Math.abs(targets[0].x - towerPxX) > 2) tower.facing = targets[0].x < towerPxX ? -1 : 1;
    rawDamage *= this.rollCrit(tower);

    for (const target of targets) {
      sound.playShot(shotSound(part.type));

      if (stats.pierce) {
        // Fire penetrating line projectile
        this.projectiles.push({
          id: Math.random().toString(36).substring(2, 9),
          startX: towerPxX,
          startY: towerPxY,
          currentX: towerPxX,
          currentY: towerPxY,
          targetEnemyId: null,
          targetX: target.x,
          targetY: target.y,
          speed: 600,
          damage: rawDamage,
          damageType: 'phys',
          towerType: part.type,
          specs,
          towerId: tower.id,
          isRam: true,
          aoeRadius: stats.aoeRadius,
          piercedEnemyIds: new Set<string>(),
        });
      } else if (stats.chain > 0) {
        // Chain lightning: hits the target and bounces on (4 targets, 5 at lvl3, ×n)
        this.triggerLightningChain(stats.chain, specs, target, rawDamage);
      } else {
        // Normal or AoE projectile
        this.projectiles.push({
          id: Math.random().toString(36).substring(2, 9),
          startX: towerPxX,
          startY: towerPxY,
          currentX: towerPxX,
          currentY: towerPxY,
          targetEnemyId: target.id,
          targetX: target.x,
          targetY: target.y,
          speed: part.type === 'ballista' ? 520 : part.type === 'orc_trebuchet' ? 260 : 380,
          damage: rawDamage,
          damageType: towerDamageType(part.type, specs),
          towerType: part.type,
          specs,
          towerId: tower.id,
          isRam: false,
          aoeRadius: stats.aoeRadius,
          piercedEnemyIds: new Set<string>(),
        });
      }
    }

    part.cooldownTimer = cooldown;
    part.shotAt = performance.now() / 1000;
  }

  // -------------------------------------------------------------
  // Playable factions: towers of orcs, undead, cultists, demons, dark elves
  // -------------------------------------------------------------
  private static readonly NO_MODS: TowerMods = { dmg: 1, cd: 1, range: 1, lines: [] };

  /** Bonuses of a tower from where it stands (totem, orc squad, cultist megatower) */
  public towerMods(t: Tower): TowerMods {
    if (this.modsDirty) this.computeMods();
    return this.mods.get(t.id) ?? GameEngine.NO_MODS;
  }

  private markModsDirty() {
    this.modsDirty = true;
  }

  private computeMods() {
    this.modsDirty = false;
    this.mods.clear();
    const mech = CONFIG.raceMech;
    const get = (t: Tower) => {
      let m = this.mods.get(t.id);
      if (!m) {
        m = { dmg: 1, cd: 1, range: 1, lines: [] };
        this.mods.set(t.id, m);
      }
      return m;
    };
    // соседи: 8 клеток вокруг квадрата, 6 вокруг гекса
    const near = (a: Tower, b: Tower) =>
      a !== b && (isHex() ? neighbours(a).some((n) => n.x === b.x && n.y === b.y) : Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1);
    const orcs = this.towers.filter((t) => CONFIG.towers[t.type].race === 'orcs');
    for (const t of orcs) {
      // Тотем предков: the strongest totem next to it hastens it
      let aura = 0;
      for (const o of orcs) if (o.type === 'orc_totem' && near(o, t)) aura = Math.max(aura, mech.totemAura[o.level - 1] ?? 0);
      if (aura > 0) {
        const m = get(t);
        m.cd /= 1 + aura;
        m.lines.push(`Ярость тотема: +${Math.round(aura * 100)} % скорости`);
      }
      // Отряд: it and neighbours of two other kinds
      const kinds = new Set([t.type]);
      for (const o of orcs) if (near(o, t)) kinds.add(o.type);
      if (kinds.size >= 3) {
        const m = get(t);
        m.dmg *= 1 + mech.orcSquad;
        m.lines.push(`Отряд: +${Math.round(mech.orcSquad * 100)} % урона`);
      }
    }
    const old = new Map(this.megas.map((g) => [g.key, g]));
    this.megas = this.findMegas().map((g) => ({ ...g, timer: old.get(g.key)?.timer ?? g.timer }));
    const counted = new Set<string>(); // one bonus of each figure kind per tower, however many figures it is in
    for (const g of this.megas) {
      for (const id of g.ids) {
        const t = this.towers.find((x) => x.id === id);
        if (!t || counted.has(g.shape + id)) continue;
        counted.add(g.shape + id);
        const m = get(t);
        if (g.shape === 'T') {
          m.dmg *= 1 + mech.megaT;
          m.lines.push(`Мегабашня Т: +${Math.round(mech.megaT * 100)} % урона`);
        } else if (g.shape === 'P') {
          m.range *= 1 + mech.megaPRange;
          m.lines.push(`Мегабашня П: +${Math.round(mech.megaPRange * 100)} % радиуса, заморозка между ножками`);
        }
      }
    }
    // A megatower built into one tower: the figures' bonuses of all its parts, plus the bonus of the fusion itself
    for (const t of this.towers) {
      const f = t.fused;
      if (!f) continue;
      const m = get(t);
      const nT = f.shapes.filter((x) => x === 'T').length;
      const nP = f.shapes.filter((x) => x === 'P').length;
      if (nT > 0) {
        m.dmg *= 1 + mech.megaT; // a kind of figure counts once, however many are built into the tower
        m.lines.push(`Мегабашня Т: +${Math.round(mech.megaT * 100)} % урона`);
      }
      if (nP > 0) {
        m.range *= 1 + mech.megaPRange;
        m.lines.push(`Мегабашня П: +${Math.round(mech.megaPRange * 100)} % радиуса, заморозка рядом с башней`);
      }
      const fuse = 1 + mech.fuseDmg * f.megas;
      const hyper = f.level !== undefined ? Math.pow(mech.hyperMult, f.level) : 1;
      m.dmg *= fuse * hyper;
      m.lines.push(f.level !== undefined ? `Гипербашня Ур.${f.level} (${f.megas} мегабашен): +${Math.round((fuse * hyper - 1) * 100)} % урона` : `Слияние: +${Math.round(mech.fuseDmg * 100)} % урона`);
    }
    // Усиления артефакта (потасовка): every tower
    const dmg = this.boon('sharp');
    const haste = this.boon('haste') + (this.heroOrderLeft > 0 ? (HERO_ABILITIES.find((d) => d.id === 'order')?.value ?? 0) : 0);
    const sight = this.boon('sight');
    if (dmg > 0 || haste > 0 || sight > 0) {
      for (const t of this.towers) {
        const m = get(t);
        m.dmg *= 1 + dmg;
        m.cd /= 1 + haste;
        m.range *= 1 + sight;
      }
    }
  }

  /** Cultist towers standing in a figure: Х (plus, 5 cells), П (5), Т (4). Figures may overlap and share towers
   *  (a tower can be in several figures); each figure is counted once. */
  private findMegas(): Mega[] {
    const cells = new Map<string, Tower>();
    // собранные башни в фигуры не входят: мегабашня не растворяется в новой фигуре
    for (const t of this.towers) if (CONFIG.towers[t.type].race === 'cultists' && !t.fused) cells.set(`${t.x},${t.y}`, t);
    const has = (p: { x: number; y: number }) => cells.has(`${p.x},${p.y}`);
    const out: Mega[] = [];
    const seen = new Set<string>();
    const take = (shape: Mega['shape'], pts: { x: number; y: number }[], center: { x: number; y: number }, centerId: string | null) => {
      if (!pts.every(has)) return;
      const key = shape + ':' + pts.map((p) => `${p.x},${p.y}`).sort().join(';');
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ key, shape, ids: pts.map((p) => cells.get(`${p.x},${p.y}`)!.id), center, centerId, timer: 0 });
    };
    const list = [...cells.values()].sort((a, b) => a.y - b.y || a.x - b.x);
    if (isHex()) {
      // Гексы (выбор Артура 2026-11-06): «Клин» вместо Т — три в ряд и одна сбоку от средней;
      // «Подкова» вместо П — пять из шести гексов вокруг одного, в нём враги замерзают
      for (const t of list) {
        const r = ring(t);
        for (let i = 0; i < 3; i++)
          for (let j = 0; j < 6; j++) if (j !== i && j !== i + 3) take('T', [{ x: t.x, y: t.y }, r[i], r[i + 3], r[j]], { x: t.x, y: t.y }, null);
      }
      for (let y = 0; y < CONFIG.grid.rows; y++)
        for (let x = 0; x < CONFIG.grid.cols; x++) {
          const r = ring({ x, y });
          if (r.filter(has).length < 5) continue;
          for (let k = 0; k < 6; k++) take('P', [1, 2, 3, 4, 5].map((d) => r[(k + d) % 6]), { x, y }, null);
        }
      return out;
    }
    for (const t of list) {
      const m = { x: t.x, y: t.y };
      for (const [ax, ay] of [
        [1, 0],
        [0, 1],
      ]) {
        const [px, py] = [ay, ax];
        const a = { x: m.x - ax, y: m.y - ay };
        const b = { x: m.x + ax, y: m.y + ay };
        for (const side of [1, -1]) {
          const off = (p: { x: number; y: number }) => ({ x: p.x + px * side, y: p.y + py * side });
          // П: a bar of three with legs at both ends; the cell between the legs is where enemies freeze
          take('P', [m, a, b, off(a), off(b)], off(m), null);
          // Т: a bar of three with a stem from its middle
          take('T', [m, a, b, off(m)], m, null);
        }
      }
    }
    return out;
  }

  private stun(e: Enemy, time: number) {
    const t = e.type === 'boss' ? time * CONFIG.raceMech.bossHoldShare : time;
    e.stunTimer = Math.max(e.stunTimer ?? 0, t);
  }

  private enemiesNear(x: number, y: number, rangePx: number): Enemy[] {
    return this.enemies.filter((e) => !e.isReviving && e.invulnerableTimer <= 0 && Math.hypot(e.x - x, e.y - y) <= rangePx);
  }

  /** Тёмные эльфы: the chance of a crit grows from 0 to 100 % in critFull s, a crit resets it */
  private rollCrit(tower: Tower): number {
    if (tower.critT === undefined) return 1;
    const mech = CONFIG.raceMech;
    if (Math.random() < Math.min(1, tower.critT / mech.critFull)) {
      tower.critT = 0;
      const cs = CONFIG.grid.cellSize;
      this.addFloatingText('КРИТ!', centerX(tower), (centerY(tower) - CONFIG.grid.cellSize / 2 + 4), '#3ed6c4');
      return mech.critMult;
    }
    return 1;
  }

  /** Towers without a plain shot: Клетка зверя, Алтарь инея, Склеп, Врата бездны */
  private towerSpecial(tower: Tower, stats: ReturnType<typeof attackStats>, part: TowerPart = tower) {
    const def = CONFIG.towers[part.type];
    const mods = this.towerMods(tower);
    const cs = CONFIG.grid.cellSize;
    const tx = centerX(tower);
    const ty = centerY(tower);
    const rangePx = stats.range * mods.range * cs;
    const inRange = this.enemiesNear(tx, ty, rangePx);
    const cooldown = stats.cooldown * mods.cd;
    const mech = CONFIG.raceMech;
    this.dmgSource = tower.id;
    if (inRange.length === 0) return;
    if (def.special === 'cage') {
      this.sortEnemiesByPriority(inRange, tower.priority, tx, ty);
      const e = inRange[0];
      if (Math.abs(e.x - tx) > 2) tower.facing = e.x < tx ? -1 : 1;
      if ((tower.holdCd ?? 0) <= 0) {
        this.stun(e, mech.houndHold);
        e.heldTimer = e.type === 'boss' ? mech.houndHold * mech.bossHoldShare : mech.houndHold;
        tower.holdCd = mech.houndHoldEvery;
      }
      sound.playShot('archer');
      this.spawnSpark(e.x, e.y, def.color);
      this.applyDamageToEnemy(e, stats.damage * mods.dmg, 'phys', tower.type, []);
    } else if (def.special === 'altar') {
      const time = mech.freezeTime * (1 + 0.3 * (part.level - 1));
      for (const e of inRange) this.stun(e, time);
      sound.playShot('priest');
      this.spawnRing(tx, ty, '#d6f0ff', rangePx - 8);
    } else if (def.special === 'crypt') {
      const souls = tower.souls ?? 0;
      if (souls <= 0) {
        part.cooldownTimer = 0.5; // nothing to spend yet: look again soon
        return;
      }
      tower.souls = 0;
      sound.playShot('mage');
      this.spawnRing(tx, ty, '#c9d6b0', rangePx - 8);
      for (const e of inRange) {
        this.dmgSource = tower.id;
        this.applyDamageToEnemy(e, stats.damage * mods.dmg * souls, 'poison', tower.type, []);
        this.spawnSpark(e.x, e.y, '#c9d6b0');
      }
    } else if (def.special === 'gate') {
      this.summonImp(tower, stats.damage * mods.dmg);
    }
    part.cooldownTimer = cooldown;
    part.shotAt = performance.now() / 1000;
  }

  private summonImp(tower: Tower, dps: number) {
    const cs = CONFIG.grid.cellSize;
    const stats = attackStats(tower.type, tower.level, tower.specs);
    const gx = centerX(tower);
    const gy = centerY(tower);
    this.imps.push({ x: gx, y: gy, t: CONFIG.raceMech.impTime, dps, towerId: tower.id, gateX: gx, gateY: gy, reach: stats.range * this.towerMods(tower).range * cs, facing: 1 });
    this.spawnPuff(gx, gy, '#e0452f');
  }

  /** What a hit of a playable faction's tower leaves on the enemy */
  private raceHitEffects(e: Enemy, rawDmg: number, type: TowerType) {
    const mech = CONFIG.raceMech;
    const cs = CONFIG.grid.cellSize;
    const group = () => this.enemies.filter((o) => o === e || Math.hypot(o.x - e.x, o.y - e.y) <= cs);
    if (type === 'und_digger') this.applySlow(e, mech.diggerSlow, mech.diggerTime);
    else if (type === 'und_cauldron') {
      const dps = rawDmg * mech.poisonShare;
      if (!e.poisonTimer || e.poisonTimer <= 0 || dps >= (e.poisonDps ?? 0)) {
        e.poisonDps = dps;
        e.poisonSource = this.dmgSource;
      }
      e.poisonTimer = mech.poisonTime;
    } else if (type === 'cul_archer') {
      e.chill = Math.min(mech.chillMax, (e.chill ?? 0) + mech.chillStep);
      e.chillTimer = mech.chillTime;
      const eff = calculateEffectiveSlow(e.chill, e.faction);
      if (eff >= e.slowPercent) {
        e.slowPercent = eff;
        e.slowTimer = Math.max(e.slowTimer, mech.chillTime);
      }
    } else if (type === 'dem_ember') {
      const tower = this.towers.find((t) => t.id === this.dmgSource);
      const storm = tower ? this.abilityOn(tower, 'dem_ember') : false;
      e.burnDps = rawDmg * mech.burnShare * (storm ? 1.5 * mech.abilityMult : 1);
      e.burnSource = this.dmgSource;
      e.burnTimer = mech.burnTime;
    } else if (type === 'dem_warper') {
      for (const o of group()) {
        if (o.curseTimer <= 0 || mech.warpBonus >= o.curseBonus) {
          o.curseBonus = mech.warpBonus;
          o.curseTimer = mech.warpTime;
        }
      }
      this.spawnRing(e.x, e.y, CURSE_COLOR, cs - 8);
    } else if (type === 'elf_weaver') {
      for (const o of group()) {
        this.applySlow(o, mech.weaverSlow, mech.weaverTime);
        o.weakTimer = mech.weaverTime;
      }
      this.spawnRing(e.x, e.y, '#9a7ae0', cs - 8);
    }
  }

  /** Final death of an enemy: souls for crypts, ghosts of the gravedigger, poison passing on */
  private onEnemyDeath(e: Enemy) {
    const mech = CONFIG.raceMech;
    const cs = CONFIG.grid.cellSize;
    for (const t of this.towers) {
      if (t.type !== 'und_crypt' && t.type !== 'und_digger') continue;
      const st = attackStats(t.type, t.level, t.specs);
      if (Math.hypot(e.x - centerX(t), e.y - centerY(t)) > st.range * this.towerMods(t).range * cs) continue;
      if (t.type === 'und_crypt') t.souls = Math.min(mech.soulsMax, (t.souls ?? 0) + 1);
      else {
        for (const o of this.enemies) if (Math.hypot(o.x - e.x, o.y - e.y) <= cs) this.applySlow(o, mech.ghostSlow, mech.ghostTime);
        this.spawnRing(e.x, e.y, '#c9d6b0', cs - 8);
      }
    }
    if (e.poisonTimer && e.poisonTimer > 0) {
      let next: Enemy | null = null;
      let best = cs;
      for (const o of this.enemies) {
        if (o.isReviving) continue;
        const d = Math.hypot(o.x - e.x, o.y - e.y);
        if (d <= best) {
          best = d;
          next = o;
        }
      }
      if (next) {
        next.poisonDps = Math.max(next.poisonTimer && next.poisonTimer > 0 ? next.poisonDps ?? 0 : 0, e.poisonDps ?? 0);
        next.poisonTimer = Math.max(next.poisonTimer ?? 0, e.poisonTimer);
        next.poisonSource = e.poisonSource;
        this.spawnSpark(next.x, next.y, '#8fd45a');
      }
    }
  }

  /** Damage that does not come from a shot (patches, imps): armor or resist and the faction's stance count, a curse adds */
  private directDamage(e: Enemy, amount: number, source: string, type: DamageType) {
    if (e.invulnerableTimer > 0 || e.isReviving || amount <= 0) return;
    const cut = type === 'phys' ? e.armor : e.magicResist;
    let dmg = amount * calculateFactionDamageMult(type, e.faction) * (1 - Math.min(0.9, cut));
    if (e.curseTimer > 0) dmg *= 1 + e.curseBonus;
    this.dmgSource = source;
    this.recordDamage(Math.min(e.hp, dmg));
    e.hp -= dmg;
    if (e.hp <= 0) {
      const idx = this.enemies.indexOf(e);
      if (idx !== -1) this.killEnemy(e, idx);
    }
  }

  /** Burning patches, imps, sphere bursts, megatower effects, who passed which tower */
  private updateRaceEffects(dt: number) {
    const mech = CONFIG.raceMech;
    const cs = CONFIG.grid.cellSize;
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.t -= dt;
      if (f.t <= 0) {
        this.fires.splice(i, 1);
        continue;
      }
      this.abilHot = !!f.hot;
      for (const e of this.enemiesNear(f.x, f.y, f.r)) this.directDamage(e, f.dps * dt * (e.type === 'flyer' ? mech.demFlyerMult : 1), f.towerId, 'fire');
      this.abilHot = false;
    }
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const b = this.blasts[i];
      b.t -= dt;
      if (b.t > 0) continue;
      this.blasts.splice(i, 1);
      this.spawnRing(b.x, b.y, '#6a5ad8', b.r);
      for (const e of this.enemiesNear(b.x, b.y, b.r)) {
        this.dmgSource = b.towerId;
        this.applyDamageToEnemy(e, b.dmg, 'lightning', 'elf_sphere', []);
      }
    }
    for (let i = this.imps.length - 1; i >= 0; i--) {
      const imp = this.imps[i];
      imp.t -= dt;
      if (imp.t <= 0 || !this.towers.some((t) => t.id === imp.towerId)) {
        this.spawnPuff(imp.x, imp.y, '#e0452f');
        this.imps.splice(i, 1);
        continue;
      }
      let target: Enemy | null = null;
      let best = Infinity;
      for (const e of this.enemiesNear(imp.gateX, imp.gateY, imp.reach)) {
        const d = Math.hypot(e.x - imp.x, e.y - imp.y);
        if (d < best) {
          best = d;
          target = e;
        }
      }
      const tx = target ? target.x : imp.gateX;
      const ty = target ? target.y : imp.gateY;
      const d = Math.hypot(tx - imp.x, ty - imp.y);
      const step = Math.min(d, mech.impSpeed * cs * dt);
      if (d > 1) {
        imp.x += ((tx - imp.x) / d) * step;
        imp.y += ((ty - imp.y) / d) * step;
        if (Math.abs(tx - imp.x) > 1) imp.facing = tx < imp.x ? -1 : 1;
      }
      if (target && d < cs * 0.45) this.directDamage(target, imp.dps * dt, imp.towerId, 'phys');
    }
    for (const g of this.megas) {
      const cx = centerX(g.center);
      const cy = centerY(g.center);
      if (g.shape === 'P') {
        for (const e of this.enemiesNear(cx, cy, cs * 0.55)) {
          if (e.pFrozen?.has(g.key)) continue;
          (e.pFrozen ??= new Set()).add(g.key);
          this.stun(e, mech.megaPFreeze);
          this.spawnSpark(e.x, e.y, '#d6f0ff');
        }
      }
    }
    // Fused megatowers: П freezes around the tower itself
    for (const t of this.towers) {
      const f = t.fused;
      if (!f) continue;
      const cx = centerX(t);
      const cy = centerY(t);
      const nP = f.shapes.filter((x) => x === 'P').length;
      if (nP > 0) {
        for (const e of this.enemiesNear(cx, cy, cs * 1.1)) {
          if (e.pFrozen?.has('f' + t.id)) continue;
          (e.pFrozen ??= new Set()).add('f' + t.id);
          this.stun(e, mech.megaPFreeze);
          this.spawnSpark(e.x, e.y, '#d6f0ff');
        }
      }
    }
    // Клинок сумерек needs to know which towers an enemy has already passed
    if (this.race === 'elves') {
      this.seenTimer -= dt;
      if (this.seenTimer <= 0) {
        this.seenTimer = 0.2;
        for (const t of this.towers) {
          const st = attackStats(t.type, t.level, t.specs);
          const r = st.range * this.towerMods(t).range * cs;
          const tx = centerX(t);
          const ty = centerY(t);
          for (const e of this.enemies) if (Math.hypot(e.x - tx, e.y - ty) <= r) (e.seen ??= new Set()).add(t.id);
        }
      }
    }
  }

  // --- Demons: active abilities

  public abilityOn(tower: Tower, type: TowerType): boolean {
    return tower.type === type && (tower.abilityLeft ?? 0) > 0;
  }

  public abilityReady(tower: Tower): boolean {
    return !!CONFIG.towers[tower.type].ability && (tower.abilityCd ?? 0) <= 0 && (tower.abilityLeft ?? 0) <= 0;
  }

  /** Casts the ability of the tower for gold */
  public castAbility(towerId: string, auto = false): boolean {
    const tower = this.towers.find((t) => t.id === towerId);
    const ab = tower ? CONFIG.towers[tower.type].ability : undefined;
    if (!tower || !ab || this.isGameOver || this.isVictory) return false;
    const cs = CONFIG.grid.cellSize;
    const tx = centerX(tower);
    const ty = centerY(tower);
    if (!this.abilityReady(tower) || this.gold < ab.cost) {
      if (!auto) {
        sound.playError();
        this.addFloatingText(this.abilityReady(tower) ? 'Не хватает золота!' : 'Ещё не готово', tx, ty - 20, '#e0452f');
      }
      return false;
    }
    this.gold -= ab.cost;
    this.logEv('ability', { id: tower.id, type: tower.type, level: tower.level, name: ab.name, paid: ab.cost, auto, x: tower.x, y: tower.y });
    tower.abilityLeft = ab.duration;
    tower.abilityCd = ab.cooldown;
    tower.pulseT = 0;
    const st = attackStats(tower.type, tower.level, tower.specs);
    const mods = this.towerMods(tower);
    if (tower.type === 'dem_gate') {
      for (let i = 0; i < 2 * CONFIG.raceMech.abilityMult; i++) this.summonImp(tower, st.damage * mods.dmg);
    } else if (tower.type === 'dem_rift') {
      const near = this.enemiesNear(tx, ty, st.range * mods.range * cs);
      this.sortEnemiesByPriority(near, tower.priority, tx, ty);
      if (near[0]) {
        const m = CONFIG.raceMech;
        this.fires.push({ x: near[0].x, y: near[0].y, r: m.patchRadius * cs * 3, dps: st.damage * mods.dmg * m.patchShare * 2 * m.abilityMult, t: m.patchTime, towerId: tower.id, hot: true });
      }
    }
    this.spawnRing(tx, ty, '#ff7a3a', 36);
    this.addFloatingText(ab.name.toUpperCase() + '!', tx, ty - 20, '#ff7a3a');
    sound.playBossSpawn();
    this.notifyState();
    return true;
  }

  /** While an ability works: «Разлом» curses everyone within 2 cells every half second */
  private abilityTick(tower: Tower, dt: number) {
    if (tower.type !== 'dem_warper') return;
    tower.pulseT = (tower.pulseT ?? 0) - dt;
    if (tower.pulseT > 0) return;
    tower.pulseT = 0.5;
    const cs = CONFIG.grid.cellSize;
    const bonus = CONFIG.raceMech.warpBonus * 2 * CONFIG.raceMech.abilityMult;
    for (const e of this.enemiesNear(centerX(tower), centerY(tower), 2 * cs)) {
      if (e.curseTimer <= 0 || bonus >= e.curseBonus) {
        e.curseBonus = bonus;
        e.curseTimer = Math.max(e.curseTimer, 1);
      }
    }
    this.spawnRing(centerX(tower), centerY(tower), CURSE_COLOR, 2 * cs - 8);
  }

  /** Auto: the ability goes off when three enemies or a heavy one or a boss are in reach */
  private autoCast(tower: Tower) {
    if (!this.abilityReady(tower)) return;
    const cs = CONFIG.grid.cellSize;
    const st = attackStats(tower.type, tower.level, tower.specs);
    const near = this.enemiesNear(centerX(tower), centerY(tower), st.range * this.towerMods(tower).range * cs);
    if (near.length >= 3 || near.some((e) => e.type === 'boss' || e.type === 'heavy')) this.castAbility(tower.id, true);
  }

  public setAutoAbilities(on: boolean) {
    this.autoAbilities = on;
    for (const t of this.towers) if (CONFIG.towers[t.type].ability) t.auto = on;
    this.notifyState();
  }

  public toggleTowerAuto(towerId: string) {
    const t = this.towers.find((x) => x.id === towerId);
    if (!t || !CONFIG.towers[t.type].ability) return;
    t.auto = !t.auto;
    this.notifyState();
  }

  /** Gold put into a tower: its price times the towers merged into it */
  private towerInvested(t: Tower): number {
    return CONFIG.towers[t.type].cost * Math.pow(CONFIG.races[this.race].merge, t.level - 1);
  }

  /** Towers next to the gate that can be sacrificed (the cheapest goes first) */
  public sacrificeVictims(gate: Tower): Tower[] {
    if (gate.type !== 'dem_gate') return [];
    return this.towers
      .filter((t) => t !== gate && (isHex() ? adjacent(t, gate) : Math.abs(t.x - gate.x) <= 1 && Math.abs(t.y - gate.y) <= 1))
      .sort((a, b) => this.towerInvested(a) - this.towerInvested(b));
  }

  /** Врата бездны: the cheapest tower next to the gate burns, a volley of sacrificeMult × its gold hits all in reach */
  public sacrifice(gateId: string): boolean {
    const gate = this.towers.find((t) => t.id === gateId);
    const victim = gate ? this.sacrificeVictims(gate)[0] : undefined;
    const cs = CONFIG.grid.cellSize;
    if (!gate || !victim) {
      sound.playError();
      if (gate) this.addFloatingText('Рядом нет башни для жертвы', centerX(gate), centerY(gate) - cs / 2, '#e0452f');
      return false;
    }
    const st = attackStats(gate.type, gate.level, gate.specs);
    const gx = centerX(gate);
    const gy = centerY(gate);
    const hit = this.enemiesNear(gx, gy, st.range * this.towerMods(gate).range * cs);
    if (hit.length === 0) {
      sound.playError();
      this.addFloatingText('Нет врагов в радиусе', gx, gy - 20, '#e0452f');
      return false;
    }
    const dmg = CONFIG.raceMech.sacrificeMult * this.towerInvested(victim);
    this.logEv('sacrifice', { id: gate.id, level: gate.level, victim: victim.type, victimLevel: victim.level, dmg: Math.round(dmg), hit: hit.length, x: gate.x, y: gate.y });
    this.towers.splice(this.towers.indexOf(victim), 1);
    this.markModsDirty();
    this.spawnPuff(centerX(victim), centerY(victim), '#ff4a2f');
    this.spawnRing(gx, gy, '#ff4a2f', st.range * cs);
    this.addFloatingText('ЖЕРТВА!', gx, gy - 20, '#ff4a2f');
    sound.playBossSpawn();
    for (const e of hit) {
      this.dmgSource = gate.id;
      this.applyDamageToEnemy(e, dmg, 'fire', gate.type, []);
      this.spawnSpark(e.x, e.y, '#ff4a2f');
    }
    this.notifyState();
    return true;
  }

  // Priest Smite: pulses every 2.5s hitting all enemies in radius with damage * 2.5 (×n)
  private triggerPriestSmite(tower: Tower, part: TowerPart) {
    this.dmgSource = tower.id;
    const towerPxX = centerX(tower);
    const towerPxY = centerY(tower);
    const stats = attackStats('priest', part.level, part.specs);
    const rangePx = stats.range * CONFIG.grid.cellSize;

    sound.playShot('priest');
    this.spawnRing(towerPxX, towerPxY, '#f2f0e0');

    for (const e of [...this.enemies]) {
      if (e.isReviving) continue;
      if (Math.hypot(e.x - towerPxX, e.y - towerPxY) <= rangePx) {
        this.applyDamageToEnemy(e, stats.smiteDamage, 'lightning', 'priest', ['smite']);
        this.spawnSpark(e.x, e.y, '#f2f0e0');
      }
    }
  }

  // Mage Lightning Chain: jumps between targets, each taking 75% of the previous hit
  private triggerLightningChain(maxBounces: number, specs: string[], firstTarget: Enemy, rawDamage: number) {
    const chainTargets: Enemy[] = [firstTarget];
    let curEnemy = firstTarget;

    while (chainTargets.length < maxBounces) {
      let nextClosest: Enemy | null = null;
      let minD = 3.5 * CONFIG.grid.cellSize; // max jump distance
      for (const candidate of this.enemies) {
        if (!candidate.isReviving && candidate.invulnerableTimer <= 0 && !chainTargets.includes(candidate)) {
          const d = Math.hypot(candidate.x - curEnemy.x, candidate.y - curEnemy.y);
          if (d < minD) {
            minD = d;
            nextClosest = candidate;
          }
        }
      }
      if (!nextClosest) break;
      chainTargets.push(nextClosest);
      curEnemy = nextClosest;
    }

    let currentDmg = rawDamage;
    for (const target of chainTargets) {
      this.spawnSpark(target.x, target.y, '#8f6bff');
      this.applyDamageToEnemy(target, currentDmg, 'lightning', 'mage', specs);
      currentDmg *= 0.75;
    }
  }

  private handleProjectileImpact(p: Projectile, target: Enemy | null, impactX: number, impactY: number) {
    this.dmgSource = p.towerId;
    sound.playHit();
    const def = CONFIG.towers[p.towerType];
    this.spawnSpark(impactX, impactY, def.race ? def.color : DAMAGE_TYPES[p.damageType].color);
    const mech = CONFIG.raceMech;
    const cs = CONFIG.grid.cellSize;
    if (p.towerType === 'elf_sphere') {
      // The sphere lands and bursts a moment later
      this.blasts.push({ x: impactX, y: impactY, t: mech.sphereDelay, r: p.aoeRadius * cs, dmg: p.damage, towerId: p.towerId });
      return;
    }
    if (p.towerType === 'dem_rift') {
      // A burning patch stays where the bolt fell; «Извержение» makes it three times wider and twice as hot
      const tower = this.towers.find((t) => t.id === p.towerId);
      const erupt = tower ? this.abilityOn(tower, 'dem_rift') : false;
      this.fires.push({
        x: impactX,
        y: impactY,
        r: mech.patchRadius * cs * (erupt ? 3 : 1),
        dps: p.damage * mech.patchShare * (erupt ? 2 * mech.abilityMult : 1),
        t: mech.patchTime,
        towerId: p.towerId,
        hot: erupt,
      });
    }
    if (p.towerType === 'orc_spear' && target) {
      // The spear goes through: the nearest enemy just behind the target is hit too
      let next: Enemy | null = null;
      let best = mech.spearPierce * cs;
      for (const e of this.enemies) {
        if (e === target || e.isReviving || e.invulnerableTimer > 0) continue;
        const d = Math.hypot(e.x - target.x, e.y - target.y);
        if (d <= best) {
          best = d;
          next = e;
        }
      }
      if (next) {
        this.applyDamageToEnemy(next, p.damage, p.damageType, p.towerType, p.specs);
        this.spawnSpark(next.x, next.y, def.color);
      }
    }

    if (p.aoeRadius > 0) {
      const aoeRadiusPx = p.aoeRadius * CONFIG.grid.cellSize;
      const isFire = p.specs.includes('fire');
      const isFrost = p.specs.includes('frost');
      this.spawnRing(impactX, impactY, isFire ? '#ff4a2f' : isFrost ? '#7fc8f0' : '#8f6bff');

      for (const e of [...this.enemies]) {
        if (e.isReviving) continue;
        if (Math.hypot(e.x - impactX, e.y - impactY) <= aoeRadiusPx) {
          this.applyDamageToEnemy(e, p.damage, p.damageType, p.towerType, p.specs);
        }
      }
    } else if (target && !target.isReviving) {
      this.applyDamageToEnemy(target, p.damage, p.damageType, p.towerType, p.specs);
    }
  }

  private applyDamageToEnemy(
    e: Enemy,
    rawDmg: number,
    dmgType: DamageType,
    towerType: TowerType,
    specs: string[]
  ) {
    if (e.invulnerableTimer > 0) return;
    const n = (id: string) => specPower(specs, id);
    const mech = CONFIG.raceMech;
    // Ледяной шип: harder on the slowed and frozen; Клинок сумерек: harder on those already past two other towers
    if (towerType === 'cul_spike' && (e.slowPercent > 0 || (e.stunTimer ?? 0) > 0)) rawDmg *= mech.spikeSlowedMult;
    if (towerType === 'elf_blade' && e.seen) {
      const others = e.seen.size - (this.dmgSource && e.seen.has(this.dmgSource) ? 1 : 0);
      if (others >= mech.huntTowers) rawDmg *= mech.huntMult;
    }
    // Усиления артефакта (потасовка)
    // Демоны: Метатель углей и Трещина жгут летунов сильнее (по логу Потасовки, просьба Артура 2026-11-02)
    if (e.type === 'flyer' && (towerType === 'dem_ember' || towerType === 'dem_rift')) rawDmg *= mech.demFlyerMult;
    if (e.type === 'heavy' || e.type === 'boss') rawDmg *= 1 + this.boon('slayer');
    if (e.sieging) rawDmg *= 1 + this.boon('bastion');
    const pierce = 1 - this.boon('pierce');

    const res = calculateDamage({
      rawDamage: rawDmg,
      damageType: dmgType,
      targetArmor: e.armor * pierce,
      targetMagicResist: e.magicResist * pierce,
      isCursed: e.curseTimer > 0,
      curseBonus: e.curseBonus,
      factionId: e.faction,
      isTargetHeavyOrBoss: e.type === 'heavy' || e.type === 'boss',
      isHunterSpec: n('hunter') > 0,
      hunterPower: n('hunter'),
      isExecuteSpec: n('execute') > 0,
      executePower: n('execute'),
      isTargetBoss: e.type === 'boss',
      targetCurrentHp: e.hp,
      targetMaxHp: e.maxHp,
    });

    if (res.isEvaded) {
      this.addFloatingText('ПРОМАХ', e.x, e.y - 10, '#c9d6b0');
      return;
    }

    const hpBefore = e.hp;
    if (res.isExecuted) {
      this.addFloatingText('КАЗНЬ!', e.x, e.y - 12, '#e0452f');
      e.hp = 0;
    } else {
      e.hp -= res.damage;
    }
    this.recordDamage(Math.max(0, Math.min(hpBefore, hpBefore - e.hp)));

    e.hitFlashTimer = 0.06;

    // Apply specialization secondary effects (n copies make each stronger):
    if (n('fire')) {
      // Burn 30% of shot damage per second for 3s (non-stacking)
      e.burnDps = rawDmg * 0.3 * n('fire');
      e.burnSource = this.dmgSource;
      e.burnTimer = 3.0;
    }

    if (n('frost')) {
      // Slow 35% for 2s
      this.applySlow(e, stackedSlow(0.35, n('frost')), 2.0);
    }
    if (CONFIG.towers[towerType].race) this.raceHitEffects(e, rawDmg, towerType);

    if (towerType === 'priest') {
      const ps = CONFIG.priestSupport;
      if (n('ward') || n('curse')) {
        // «Оберег» and «Проклятие» reach the target and enemies around it; the ring shows the area
        const reach = ps.radius * CONFIG.grid.cellSize;
        const group = this.enemies.filter((o) => o === e || Math.hypot(o.x - e.x, o.y - e.y) <= reach);
        for (const o of group) {
          // Slow 50% for 3s
          if (n('ward')) this.applySlow(o, stackedSlow(ps.wardSlow, n('ward')), ps.wardTime);
          // Curse +35% damage from all sources for 5s (the strongest one holds)
          if (n('curse')) {
            const bonus = ps.curseBonus * n('curse');
            if (o.curseTimer <= 0 || bonus >= o.curseBonus) {
              o.curseBonus = bonus;
              o.curseTimer = ps.curseTime;
            }
          }
        }
        this.spawnRing(e.x, e.y, n('curse') ? CURSE_COLOR : SLOW_COLOR, reach - 8);
      }
      if (!n('ward') && !n('curse') && !n('smite')) {
        // Default priest: marks the target and the enemies around it, slow and +damage from all towers
        const pb = CONFIG.priestBase;
        const reach = ps.radius * CONFIG.grid.cellSize;
        for (const o of this.enemies) {
          if (o !== e && Math.hypot(o.x - e.x, o.y - e.y) > reach) continue;
          this.applySlow(o, pb.slow, pb.time);
          if (o.curseTimer <= 0 || pb.markBonus >= o.curseBonus) {
            o.curseBonus = pb.markBonus;
            o.curseTimer = pb.time;
          }
        }
        this.spawnRing(e.x, e.y, CURSE_COLOR, reach - 8);
      }
    }

    if (e.hp <= 0) {
      const idx = this.enemies.indexOf(e);
      if (idx !== -1) {
        this.killEnemy(e, idx);
      }
    }
  }

  private applySlow(e: Enemy, slow: number, duration: number) {
    const effectiveSlow = calculateEffectiveSlow(slow, e.faction);
    if (effectiveSlow > e.slowPercent) {
      e.slowPercent = effectiveSlow;
      e.slowTimer = duration;
    }
  }

  private killEnemy(e: Enemy, index: number) {
    // Undead trait: infantry and scout revive once after 1s with 30% HP
    if (e.faction === 2 && !e.hasRevived && (e.type === 'infantry' || e.type === 'scout')) {
      e.hasRevived = true;
      e.isReviving = true;
      e.reviveTimer = 1.0;
      e.hp = 0;
      this.spawnPuff(e.x, e.y, '#4f5a45');
      return;
    }

    // Normal final death
    this.enemies.splice(index, 1);
    sound.playDeath();
    this.addCorpse(e);
    this.spawnPuff(e.x, e.y, CONFIG.palettes[e.faction - 1].enemies);

    // Save to graveyard for Lich boss
    if (e.faction === 2 && e.type !== 'boss' && !e.risen) {
      this.deadEnemiesGraveyard.push({
        x: e.x,
        y: e.y,
        time: this.runStats.time, // game time: pause and speed move it together with the Lich's timer
        type: e.type,
        entranceIndex: e.entranceIndex,
        pathIndex: e.pathIndex,
        distanceTraveled: e.distanceTraveled,
      });
    }

    if (this.race !== 'humans') this.onEnemyDeath(e);
    this.statKill();
    if (this.runLog) this.runLog.enemy(`${e.faction}:${e.type}`).killed++;
    // Reward gold
    if (e.gold > 0) {
      this.gold += e.gold;
      this.statGold(e.gold);
      this.addFloatingText(`+${e.gold}`, e.x, e.y - 10, '#f4c06a');
    }

    this.notifyState();
  }

  /** How close to the artifact centre (px) the enemy stops to strike it: melee at the wall, ranged from 1–3 cells */
  private siegeReach(e: Enemy): number {
    const atk = CONFIG.siege.attack[e.type];
    const ranged = atk.range > 0 && (e.type !== 'scout' || CONFIG.siege.rangedScoutFactions.includes(e.faction));
    const spread = (e.animSeed / (Math.PI * 2)) * 0.2; // a little scatter so the crowd does not stand in one point
    return ((ranged ? atk.range : CONFIG.siege.meleeReach) + spread) * CONFIG.grid.cellSize;
  }

  private lastCastleSound = 0;

  /** One strike of a besieging enemy: the artifact loses HP; ranged enemies send a visible bolt */
  public hitCastle(e: Enemy, dmg: number) {
    // Ткачиха теней: a webbed enemy strikes the artifact weaker
    if (e.weakTimer && e.weakTimer > 0) dmg = Math.max(1, Math.round(dmg * (1 - CONFIG.raceMech.weaverWeaken)));
    const lost = Math.min(this.lives, dmg);
    this.statCastleDamage(lost);
    if (this.runLog) this.runLog.enemy(`${e.faction}:${e.type}`).castleDamage += lost;
    this.lives = Math.max(0, this.lives - dmg);
    e.attackAnim = 0.22;
    const cx = castleX();
    const cy = (castleY() - 0.2 * CONFIG.grid.cellSize);
    const d = Math.hypot(cx - e.x, cy - e.y);
    if (d > CONFIG.grid.cellSize) this.spawnBolt(e.x, e.y - 14, cx, cy, e.type === 'shaman' ? '#b58cf0' : '#e8d9a8');
    else this.spawnSpark(cx + (e.x - cx) * 0.4, cy + (e.y - cy) * 0.4, '#e0452f');
    this.addFloatingText(`-${dmg}`, cx + (Math.random() - 0.5) * 24, cy - 26, '#e0452f');
    const now = performance.now();
    if (now - this.lastCastleSound > 600) {
      this.lastCastleSound = now;
      sound.playError();
    }

    if (this.sandbox) this.lives = this.livesMax();
    if (this.lives <= 0) {
      this.isGameOver = true;
      sound.playDefeat();
    }
    this.notifyState();
  }

  private sortEnemiesByPriority(list: Enemy[], priority: TargetPriority, towerX: number, towerY: number) {
    if (priority === 'first') {
      // Least remaining distance to castle
      list.sort((a, b) => {
        const remA = a.totalPathLengthPixels - a.distanceTraveled;
        const remB = b.totalPathLengthPixels - b.distanceTraveled;
        return remA - remB;
      });
    } else if (priority === 'strongest') {
      // Highest current HP
      list.sort((a, b) => b.hp - a.hp);
    } else if (priority === 'closest') {
      // Closest to tower
      list.sort((a, b) => {
        const dA = Math.hypot(a.x - towerX, a.y - towerY);
        const dB = Math.hypot(b.x - towerX, b.y - towerY);
        return dA - dB;
      });
    }
  }

  // -------------------------------------------------------------
  // Shop & Tower Placement & Merging
  // -------------------------------------------------------------
  public rerollCost(): number {
    if (this.rerollsThisWave === 0 && this.boon('scout') > 0) return 0;
    return calculateRerollCost(this.rerollsThisWave);
  }

  /** Takes the price of a shop reroll; false (and nothing taken) without enough gold */
  public payReroll(): boolean {
    const cost = this.rerollCost();
    if (this.gold < cost) return false;
    this.gold -= cost;
    this.rerollsThisWave++;
    this.logEv('reroll', { paid: cost });
    return true;
  }

  public upgradeTier(): boolean {
    if (this.tier >= 5) return false;
    const cost = CONFIG.shop.tierUpgradeCosts[this.tier - 1];
    if (this.gold < cost) {
      sound.playError();
      return false;
    }
    this.gold -= cost;
    this.tier++;
    if (CONFIG.shop.tierLinksGuard) this.raiseGuard();
    this.logEv('tier', { tier: this.tier, paid: cost });
    sound.playBuy();
    this.notifyState();
    return true;
  }

  // Supply («сила стола»): endless mode and duel (each player counts their own table), the campaign keeps the base prices
  public supplyActive(): boolean {
    return this.endless || this.duelStart !== null;
  }

  // Share of the price paid back when selling: lower where the supply works
  public sellRatio(): number {
    const own = CONFIG.races[this.race].sellRatio;
    if (own !== undefined) return own;
    return this.supplyActive() ? CONFIG.supply.sellRatio : CONFIG.upgrade.sellRatio;
  }

  /** Towers of one kind and level that merge into the next level: люди 3, орки 4, нежить 2 */
  public mergeNeed(): number {
    return CONFIG.races[this.race].merge;
  }

  private supplyRules(): { free: number; step: number; growth: number } {
    return CONFIG.races[this.race].supply ?? CONFIG.supply;
  }

  public supplyPower(): number {
    const levels = this.towers.flatMap((t) => towerParts(t).map((p) => p.level));
    const triple = this.binders.filter((b) => b.triple).length;
    return calculateSupplyPower(levels, this.binders.length - triple, triple, this.mergeNeed());
  }

  public supplyMult(): number {
    return this.supplyActive() ? calculateSupplyMult(this.supplyPower(), this.supplyRules()) : 1;
  }

  // Power at which the next price step comes
  public supplyNext(): number {
    const { free, step } = this.supplyRules();
    const power = this.supplyPower();
    return power < free ? free : free + (Math.floor((power - free) / step) + 1) * step;
  }

  // Shop price of a tower (a triplet is three) or a binder at the current supply
  public towerPrice(type: TowerType, startLevel: boolean | number = false): number {
    const lvl = startLevel === true ? 2 : startLevel === false ? 1 : startLevel; // a ready tower costs as much as the towers it would merge from
    return Math.round(CONFIG.towers[type].cost * Math.pow(this.mergeNeed(), lvl - 1) * this.supplyMult() * (1 - this.boon('trade')));
  }

  public binderPrice(): number {
    return Math.round(CONFIG.binder.cost * this.supplyMult() * (1 - this.boon('trade')));
  }

  public placeTower(cellX: number, cellY: number): boolean {
    if (!this.placingTowerType) return false;

    // Check validity
    if (!this.isCellFree(cellX, cellY)) {
      sound.playError();
      return false;
    }

    // A tower from the backpack is already paid for
    const fromBackpack = this.placingSlot !== null;
    const cost = fromBackpack ? 0 : this.towerPrice(this.placingTowerType, this.placingStartLevel);
    if (this.gold < cost) {
      sound.playError();
      return false;
    }

    this.gold -= cost;
    const newTower: Tower = {
      id: Math.random().toString(36).substring(2, 9),
      x: cellX,
      y: cellY,
      type: this.placingTowerType,
      level: this.placingStartLevel,
      // A ready Ур.3: the chosen property in as many parts as the level keeps (people: three Ур.2 towers' worth)
      specs: this.placingStartLevel >= 2 && this.pendingTripletSpec
        ? Array(this.specCountFor(this.placingStartLevel)).fill(this.pendingTripletSpec)
        : [],
      priority: 'first',
      cooldownTimer: 0,
      frozenTimer: 0,
      smiteTimer: 2.5,
      facing: 1,
      second: null,
    };
    const def = CONFIG.towers[newTower.type];
    if (def.race === 'elves') newTower.critT = 0;
    if (def.special === 'cage') newTower.holdCd = 0;
    if (def.special === 'crypt') newTower.souls = 0;
    if (def.ability) {
      newTower.abilityCd = 0;
      newTower.abilityLeft = 0;
      newTower.auto = this.autoAbilities;
    }

    this.towers.push(newTower);
    this.logEv('tower', { id: newTower.id, type: newTower.type, level: newTower.level, specs: [...newTower.specs], x: cellX, y: cellY, paid: cost, gold: Math.round(this.gold), fromBackpack });
    this.markModsDirty();
    sound.playBuy();
    this.spawnRing(centerX({ x: cellX, y: cellY }), centerY({ x: cellX, y: cellY }), '#d9b44a');

    // Reset placement
    if (this.placingSlot !== null) this.backpack.splice(this.stackItem(this.placingSlot), 1);
    this.clearPlacing();
    this.selectedTowerId = newTower.id;
    // Орки: the new tower picks its tempering
    this.askSpecIfNeeded(newTower);

    this.notifyState();
    return true;
  }

  private ignoreTowers = new Set<string>(); // a tower being moved (or built into a hypertower) does not block its own cells

  /** The tower standing on a cell (a megatower П takes two) */
  public towerAtCell(cx: number, cy: number): Tower | undefined {
    return this.towers.find((t) => (t.x === cx && t.y === cy) || (t.extra && t.extra.some((c) => c.x === cx && c.y === cy)));
  }

  public isCellFree(cx: number, cy: number): boolean {
    if (cx < 0 || cx >= CONFIG.grid.cols || cy < 0 || cy >= CONFIG.grid.rows) return false;
    // Check castle and the corners under the field buttons
    if (CONFIG.grid.castleCells.some((c) => c.x === cx && c.y === cy)) return false;
    // на квадратах кнопки «Волна» и «Авто» лежат на клетках левого верхнего угла; на гексах они над небом (Артур 2026-11-06: «сними»)
    if (!this.sandbox && !isHex() && isHudCell(cx, cy)) return false;
    // Check road
    for (const p of this.currentMap.paths) {
      if (p.some((c) => c.x === cx && c.y === cy)) return false;
    }
    if (this.currentMap.blocked?.some((c) => c.x === cx && c.y === cy)) return false;
    // Check existing tower or binder
    if (this.towers.some((t) => !this.ignoreTowers.has(t.id) && ((t.x === cx && t.y === cy) || (t.extra && t.extra.some((c) => c.x === cx && c.y === cy))))) return false;
    if (this.binders.some((b) => b.x === cx && b.y === cy)) return false;
    return true;
  }

  public selectTower(id: string | null) {
    if (this.overflowPending()) return; // the bought tower must be placed or swapped first
    this.hyperPlan = null;
    this.selectedTowerId = id;
    this.selectedBinderId = null;
    this.castleSelected = false;
    this.bindingFromId = null;
    this.upgradingFromBinderId = null;
    this.clearPlacing();
    this.notifyState();
  }

  private clearPlacing() {
    this.placingSlot = null;
    this.placingTowerType = null;
    this.placingIsTriplet = false;
    this.placingStartLevel = 1;
    this.pendingTripletSpec = null;
    this.placingBinder = false;
  }

  public cancelPlacing() {
    if (this.overflowPending()) return;
    this.clearPlacing();
    this.notifyState();
  }

  // A purchase made with a full backpack waits as one extra item: it must be placed or swapped with a slot
  public overflowPending(): boolean {
    return this.backpackStacks().length > CONFIG.backpack.slots;
  }

  /**
   * Ячейки рюкзака (просьба Артура 2026-11-07): одинаковые башни одного уровня и свойства лежат стопкой до `mergeNeed()` штук
   * (люди 3), связки — по одной. Хранится плоский список, ячейки считаются по порядку первого появления; значения — индексы в `backpack`.
   */
  private backpackStacks(): number[][] {
    const cap = this.mergeNeed();
    const stacks: number[][] = [];
    const open = new Map<string, number[]>();
    this.backpack.forEach((it, i) => {
      const key = it.kind === 'binder' ? `b${it.id}` : `${it.type}|${it.startLevel}|${it.spec ?? ''}`;
      let st = open.get(key);
      if (!st || st.length >= cap) {
        st = [];
        open.set(key, st);
        stacks.push(st);
      }
      st.push(i);
    });
    return stacks;
  }

  /** Индекс в `backpack` той башни ячейки, что берётся в руку, продаётся или ставится (последняя из стопки) */
  private stackItem(slot: number): number {
    const st = this.backpackStacks()[slot];
    return st ? st[st.length - 1] : -1;
  }

  private stackSlotOf(itemIndex: number): number {
    return this.backpackStacks().findIndex((st) => st.includes(itemIndex));
  }

  /** Стопка из `mergeNeed()` одинаковых башен, которую можно собрать в башню следующего уровня */
  private canMergeStack(st: number[]): boolean {
    const first = this.backpack[st[0]];
    return first.kind === 'tower' && st.length >= this.mergeNeed() && first.startLevel < this.maxLevel();
  }

  /** Собрать полную стопку в рюкзаке в одну башню следующего уровня: правила и цена слияния те же, что на поле (уплаченное складывается) */
  public mergeBackpack(slot: number): boolean {
    if (this.overflowPending()) return false;
    const st = this.backpackStacks()[slot];
    if (!st || !this.canMergeStack(st)) return false;
    const first = this.backpack[st[0]];
    const paid = st.reduce((sum, i) => sum + this.backpack[i].paid, 0);
    const level = first.startLevel + 1;
    const gone = new Set(st);
    this.backpack = this.backpack.filter((_, i) => !gone.has(i));
    this.backpack.push({ id: Math.random().toString(36).substring(2, 9), kind: 'tower', type: first.type, triplet: true, startLevel: level, spec: first.spec, paid });
    this.logEv('backpack-merge', { type: first.type, from: first.startLevel, to: level, spec: first.spec, paid });
    sound.playMerge();
    this.clearPlacing();
    this.notifyState();
    return true;
  }

  // Pays at once and puts the purchase into the backpack, ready to be placed
  public buyToBackpack(kind: 'tower' | 'binder', type: TowerType | null, triplet: boolean, spec: string | null, startLevel = triplet ? 2 : 1): boolean {
    if (this.overflowPending()) {
      sound.playError();
      this.addFloatingText('Сначала поставьте купленное!', CONFIG.grid.totalWidth - 120, 100, '#e0452f');
      return false;
    }
    const price = kind === 'binder' ? this.binderPrice() : this.towerPrice(type!, startLevel);
    if (this.gold < price) {
      sound.playError();
      this.addFloatingText('Не хватает золота!', CONFIG.grid.totalWidth - 120, 100, '#e0452f');
      return false;
    }
    this.gold -= price;
    this.backpack.push({ id: Math.random().toString(36).substring(2, 9), kind, type, triplet: startLevel >= 2, startLevel, spec, paid: price });
    this.logEv('buy', { kind, type, triplet: startLevel >= 2, startLevel, spec, paid: price });
    sound.playBuy();
    this.takeInHand(this.stackSlotOf(this.backpack.length - 1));
    return true;
  }

  // Takes the item in hand for placing; the same slot again puts it back
  public selectBackpack(slot: number) {
    const stacks = this.backpackStacks();
    const st = stacks[slot];
    if (!st) return;
    if (this.overflowPending()) {
      // The bought item has no room: a tap on a slot sells what lies there (all paid back, the whole stack) and takes its place
      if (slot >= CONFIG.backpack.slots) return;
      const gone = new Set(st);
      for (const i of st) this.gold += this.backpack[i].paid;
      this.backpack = this.backpack.filter((_, i) => !gone.has(i));
      this.clearPlacing();
      sound.playBuy();
      this.notifyState();
      return;
    }
    if (this.placingSlot === slot) {
      this.cancelPlacing();
      return;
    }
    this.takeInHand(slot);
  }

  private takeInHand(slot: number) {
    const item = this.backpack[this.stackItem(slot)];
    if (!item) return;
    this.selectedTowerId = null;
    this.selectedBinderId = null;
    this.bindingFromId = null;
    this.upgradingFromBinderId = null;
    this.clearPlacing();
    this.placingSlot = slot;
    if (item.kind === 'binder') {
      this.placingBinder = true;
    } else {
      this.placingTowerType = item.type;
      this.placingIsTriplet = item.triplet;
      this.placingStartLevel = item.startLevel;
      this.pendingTripletSpec = item.spec;
    }
    this.notifyState();
  }

  // Returns what was paid
  public sellBackpack(slot: number): boolean {
    const idx = this.stackItem(slot);
    const item = this.backpack[idx];
    if (!item || this.overflowPending()) return false;
    this.gold += item.paid;
    this.backpack.splice(idx, 1);
    this.clearPlacing();
    sound.playBuy();
    this.notifyState();
    return true;
  }

  // Towers can be moved only in the pause between waves: the timer runs and no enemy is on the field
  /** Снимок поля для зрителя Потасовки (src/fieldView.ts): башни и враги в клетках */
  public fieldView(): FieldView {
    return {
      wave: this.wavesLaunched,
      lives: Math.round(this.lives),
      faction: this.faction,
      towers: this.towers.map((t) => [t.x, t.y, t.type, t.level, t.second ? t.second.level : 0]),
      enemies: this.enemies
        .filter((e) => !e.isReviving)
        .slice(0, 160)
        .map((e) => {
          const c = groundToCellF(e.x, e.y);
          return [e.id, Math.round(c.x * 20) / 20, Math.round(c.y * 20) / 20, Math.max(0, Math.round((e.hp / e.maxHp) * 100)), e.type];
        }),
    };
  }

  // -------------------------------------------------------------
  // Чужое поле (просьба Артура 2026-11-09: «как в автошахматах»): второй движок только рисует
  // доску соперника тем же отрисовщиком, что и ваше поле; логика на нём не идёт, а башни и враги
  // берутся из снимков `FieldView` и плавно едут к новым точкам.
  // -------------------------------------------------------------
  public spectating = false;
  private specTargets = new Map<string, { x: number; y: number }>();

  public startSpectate(level: number, mapSeed: number | null, race: RaceId) {
    this.startLevel(level, 'normal', false, undefined, race, null, mapSeed ? generateMap(level, mapSeed) : null);
    this.spectating = true;
    this.isPaused = false;
    this.waveCountdown = null;
    this.specTargets.clear();
  }

  public mapForView(): MapDef {
    return this.currentMap;
  }

  /** Новый снимок чужого поля: башни ставятся и убираются, враги получают новую цель */
  public spectateApply(v: FieldView) {
    this.faction = v.faction;
    const keep: Tower[] = [];
    for (const [x, y, type, level, level2] of v.towers) {
      const old = this.towers.find((t) => t.x === x && t.y === y && t.type === type && t.level === level);
      if (old) {
        keep.push(old);
        continue;
      }
      const t: Tower = { id: `${x},${y},${type},${level}`, x, y, type: type as TowerType, level, specs: [], priority: 'first', cooldownTimer: Math.random() * 0.8, frozenTimer: 0, smiteTimer: 1 + Math.random() * 1.5, facing: 1, second: null };
      if (level2) t.second = { type: 'archer', level: level2, specs: [], cooldownTimer: 0, smiteTimer: 0 };
      keep.push(t);
    }
    this.towers = keep;
    const seen = new Set<string>();
    const next: Enemy[] = [];
    for (const [id, cx, cy, hpPct, type] of v.enemies) {
      seen.add(id);
      const g = cellFToGround(cx, cy);
      this.specTargets.set(id, g);
      let e = this.enemies.find((o) => o.id === id);
      if (!e) {
        e = this.blankEnemy(id, type as EnemyType, v.faction, g.x, g.y);
      }
      e.hp = (e.maxHp * hpPct) / 100;
      next.push(e);
    }
    for (const id of [...this.specTargets.keys()]) if (!seen.has(id)) this.specTargets.delete(id);
    this.enemies = next;
  }

  /** Кадр чужого поля: враги плавно едут к своим целям */
  private spectateStep(dt: number) {
    const k = 1 - Math.exp(-dt / 0.2);
    for (const e of this.enemies) {
      const g = this.specTargets.get(e.id);
      if (!g) continue;
      const dx = (g.x - e.x) * k;
      const dy = (g.y - e.y) * k;
      e.x += dx;
      e.y += dy;
      e.distanceTraveled += Math.hypot(dx, dy);
      if (Math.abs(dx) > 0.02) e.facing = dx > 0 ? 1 : -1;
    }
  }

  /** Живой бой на чужом поле: башни целятся и стреляют, снаряды летят и вспыхивают, но урона нет —
   *  настоящие HP врагов приходят снимками (просьба Артура 2026-11-09). Звука нет. */
  private spectateCombat(dt: number) {
    const cs = CONFIG.grid.cellSize;
    for (const tower of this.towers) {
      const tx = centerX(tower);
      const ty = centerY(tower);
      for (const part of towerParts(tower)) {
        if (part.cooldownTimer > 0) part.cooldownTimer -= dt;
        if (part.cooldownTimer > 0) continue;
        const def = CONFIG.towers[part.type];
        if (def.special) continue;
        const stats = attackStats(part.type, part.level, part.specs);
        const rangePx = stats.range * cs;
        if (stats.smiteDamage > 0) {
          part.smiteTimer -= dt;
          if (part.smiteTimer <= 0) {
            part.smiteTimer = 2.5;
            part.shotAt = performance.now() / 1000;
            this.spawnRing(tx, ty, '#f2f0e0');
            for (const e of this.enemies) {
              if (!e.isReviving && Math.hypot(e.x - tx, e.y - ty) <= rangePx) {
                e.hitFlashTimer = 0.08;
                this.spawnSpark(e.x, e.y, '#f2f0e0');
              }
            }
          }
        }
        if (!stats.normalAttack) continue;
        const inRange = this.enemies.filter((e) => !e.isReviving && Math.hypot(e.x - tx, e.y - ty) <= rangePx);
        if (inRange.length === 0) continue;
        this.sortEnemiesByPriority(inRange, 'first', tx, ty);
        const targets = inRange.slice(0, Math.min(3, Math.max(1, stats.targets)));
        if (Math.abs(targets[0].x - tx) > 2) tower.facing = targets[0].x < tx ? -1 : 1;
        for (const target of targets) {
          if (stats.chain > 0) {
            // молния: искры прыгают по цели и ближайшим врагам
            this.spawnSpark(target.x, target.y, '#8f6bff');
            target.hitFlashTimer = 0.08;
            for (const e of this.enemies) {
              if (e !== target && !e.isReviving && Math.hypot(e.x - target.x, e.y - target.y) < 2 * cs) {
                this.spawnSpark(e.x, e.y, '#8f6bff');
                e.hitFlashTimer = 0.08;
              }
            }
            continue;
          }
          this.projectiles.push({
            id: Math.random().toString(36).substring(2, 9),
            startX: tx, startY: ty, currentX: tx, currentY: ty,
            targetEnemyId: stats.pierce ? null : target.id,
            targetX: target.x, targetY: target.y,
            speed: stats.pierce ? 600 : part.type === 'ballista' ? 520 : part.type === 'orc_trebuchet' ? 260 : 380,
            damage: 0, damageType: stats.pierce ? 'phys' : towerDamageType(part.type, []),
            towerType: part.type, specs: [], isRam: !!stats.pierce, towerId: tower.id,
            aoeRadius: stats.aoeRadius, piercedEnemyIds: new Set<string>(),
          });
        }
        part.cooldownTimer = Math.max(0.15, stats.cooldown);
        part.shotAt = performance.now() / 1000;
      }
    }

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (p.isRam) {
        const dx = p.targetX - p.startX;
        const dy = p.targetY - p.startY;
        const len = Math.hypot(dx, dy) || 1;
        p.currentX += (dx / len) * p.speed * dt;
        p.currentY += (dy / len) * p.speed * dt;
        if (Math.hypot(p.currentX - p.startX, p.currentY - p.startY) > len + 32) this.projectiles.splice(i, 1);
        continue;
      }
      const target = p.targetEnemyId ? this.enemies.find((e) => e.id === p.targetEnemyId) : undefined;
      const destX = target ? target.x : p.targetX;
      const destY = target ? target.y : p.targetY;
      const dx = destX - p.currentX;
      const dy = destY - p.currentY;
      const dist = Math.hypot(dx, dy);
      if (dist <= p.speed * dt || dist < 12) {
        const def = CONFIG.towers[p.towerType];
        this.spawnSpark(destX, destY, def.race ? def.color : DAMAGE_TYPES[p.damageType].color);
        if (target) target.hitFlashTimer = 0.08;
        if (p.aoeRadius > 0) this.spawnRing(destX, destY, '#8f6bff');
        this.projectiles.splice(i, 1);
      } else {
        p.currentX += (dx / dist) * p.speed * dt;
        p.currentY += (dy / dist) * p.speed * dt;
      }
    }

    for (const e of this.enemies) if (e.hitFlashTimer > 0) e.hitFlashTimer -= dt;
    for (const p of this.particles) {
      if (!p.active) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life += dt;
      p.alpha = Math.max(0, 1 - p.life / p.maxLife);
      if (p.life >= p.maxLife) p.active = false;
    }
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y -= 25 * dt;
      ft.life += dt;
      if (ft.life >= ft.maxLife) this.floatingTexts.splice(i, 1);
    }
  }

  private blankEnemy(id: string, type: EnemyType, faction: number, x: number, y: number): Enemy {
    const def = CONFIG.enemies[type] ?? CONFIG.enemies.infantry;
    return {
      id, type, faction, x, y, maxHp: 100, hp: 100, baseSpeed: def.speed * CONFIG.grid.cellSize, armor: 0, magicResist: 0, gold: 0,
      entranceIndex: 0, pathIndex: 0, isFlyer: type === 'flyer', distanceTraveled: 0, totalPathLengthPixels: 1,
      slowPercent: 0, slowTimer: 0, burnDps: 0, burnTimer: 0, curseTimer: 0, curseBonus: 0.25, rageTriggered: false, warcryTimer: 0,
      hasRevived: false, isReviving: false, reviveTimer: 0, invulnerableTimer: 0, dashTimer: 0, bossAbilityTimer: 0, hitFlashTimer: 0,
      sieging: false, siegeTimer: 0, attackAnim: 0, animSeed: Math.random() * Math.PI * 2, facing: 1,
    };
  }

  public canMoveTowers(): boolean {
    return this.waveCountdown !== null && !this.isSpawning && this.enemies.length === 0 && !this.isGameOver;
  }

  /**
   * Price of moving a tower now: 0 between waves; in a duel and a brawl, where the field is rarely clear,
   * CONFIG.duel.moveCost while enemies are on it (просьба Артура 2026-11-01); null — no moving now
   */
  public moveCost(): number | null {
    if (this.canMoveTowers()) return 0;
    if (this.sandbox && !this.isGameOver) return 0; // свободный режим: переставлять можно всегда
    if (this.duelStart !== null && !this.isGameOver && !this.isVictory) return CONFIG.duel.moveCost;
    return null;
  }

  /** The cell the player holds the tower by while dragging (a multi-cell tower moves so that this cell lands on the target) */
  public moveGrab: { x: number; y: number } | null = null;

  /** Cells a tower would take if the cell `grab` of it were dropped on `to`: [main cell, ...extra cells] */
  private moveFootprint(tower: Tower, to: { x: number; y: number }, grab?: { x: number; y: number } | null): { x: number; y: number }[] {
    const from = grab && ((grab.x === tower.x && grab.y === tower.y) || tower.extra?.some((c) => c.x === grab.x && c.y === grab.y)) ? grab : tower;
    return [translate({ x: tower.x, y: tower.y }, from, to), ...(tower.extra ?? []).map((c) => translate(c, from, to))];
  }

  /** Whether the selected tower (all its cells) fits with the held cell on `to`; the hovered preview uses it */
  public moveFits(to: { x: number; y: number }): boolean {
    const tower = this.selectedTowerId ? this.towers.find((t) => t.id === this.selectedTowerId) : null;
    if (!tower) return false;
    this.ignoreTowers = new Set([tower.id]);
    const fits = this.moveFootprint(tower, to, this.moveGrab).every((c) => this.isCellFree(c.x, c.y));
    this.ignoreTowers = new Set();
    return fits;
  }

  /** Moves the selected tower to a free cell; it stays selected. A paid move needs `paid` (a deliberate drag);
   *  `grab` is the cell of the tower the player held (a hyper- or megatower covers several) */
  public moveSelectedTower(cellX: number, cellY: number, paid = false, grab?: { x: number; y: number } | null): boolean {
    const tower = this.selectedTowerId ? this.towers.find((t) => t.id === this.selectedTowerId) : null;
    const cost = this.moveCost();
    if (!tower || cost === null || (cost > 0 && !paid)) return false;
    // a multi-cell tower keeps its other cells at the same offset from the cell it is held by
    const foot = this.moveFootprint(tower, { x: cellX, y: cellY }, grab ?? this.moveGrab);
    const off = tower.extra ? foot.slice(1) : null;
    this.ignoreTowers = new Set([tower.id]);
    const fits = foot.every((c) => this.isCellFree(c.x, c.y));
    this.ignoreTowers = new Set();
    if (!fits) {
      if (tower.extra) {
        sound.playError();
        this.addFloatingText('Не помещается', centerX({ x: cellX, y: cellY }), centerY({ x: cellX, y: cellY }), '#e0452f');
      }
      return false;
    }
    const cs = CONFIG.grid.cellSize;
    if (cost > 0) {
      if (this.gold < cost) {
        sound.playError();
        this.addFloatingText('Не хватает золота!', centerX({ x: cellX, y: cellY }), centerY({ x: cellX, y: cellY }), '#e0452f');
        return false;
      }
      this.gold -= cost;
      this.addFloatingText(`−${cost}`, centerX({ x: cellX, y: cellY }), centerY({ x: cellX, y: cellY }) - 0.3 * cs, '#f4c06a');
    }
    this.logEv('move', { id: tower.id, type: tower.type, fromX: tower.x, fromY: tower.y, x: foot[0].x, y: foot[0].y, paid: cost });
    this.spawnPuff(centerX(tower), centerY(tower), '#f4c06a');
    tower.x = foot[0].x;
    tower.y = foot[0].y;
    if (off) tower.extra = off;
    this.markModsDirty();
    this.spawnRing(centerX({ x: cellX, y: cellY }), centerY({ x: cellX, y: cellY }), '#d9b44a');
    sound.playBuy();
    this.notifyState();
    return true;
  }

  // The artifact's card: its HP and its own defence, which can be raised for gold
  public selectCastle() {
    this.selectTower(null);
    if (this.overflowPending()) return;
    this.castleSelected = true;
    this.notifyState();
  }

  private raiseGuard() {
    if (this.guardLevel >= CONFIG.siege.guard.damage.length) return;
    this.guardLevel++;
    this.spawnRing(castleX(), castleY(), '#7fd6e0');
    this.addFloatingText(`Защита ${this.guardLevel}`, castleX(), castleY() - 0.8 * CONFIG.grid.cellSize, '#7fd6e0');
  }

  public guardUpgradeCost(): number | null {
    if (CONFIG.shop.tierLinksGuard) return null; // the defence rises with the shop tier
    return CONFIG.siege.guard.upgradeCost[this.guardLevel - 1] ?? null;
  }

  public upgradeGuard(): boolean {
    const cost = this.guardUpgradeCost();
    if (cost === null || this.gold < cost) {
      sound.playError();
      return false;
    }
    this.gold -= cost;
    this.raiseGuard();
    this.logEv('guard', { level: this.guardLevel, paid: cost });
    sound.playBuy();
    this.notifyState();
    return true;
  }

  // The artifact's defence strikes the nearest enemy in its radius
  private updateGuard(dt: number) {
    this.guardTimer -= dt;
    if (this.guardTimer > 0) return;
    const g = CONFIG.siege.guard;
    const cx = castleX();
    const cy = castleY();
    let target: Enemy | null = null;
    let best = g.radius * CONFIG.grid.cellSize;
    for (const e of this.enemies) {
      if (e.isReviving || e.invulnerableTimer > 0) continue;
      const d = Math.hypot(e.x - cx, e.y - cy);
      if (d <= best) {
        best = d;
        target = e;
      }
    }
    if (!target) {
      this.guardTimer = 0;
      return;
    }
    this.guardTimer = g.every;
    this.spawnBolt(cx, cy - 0.3 * CONFIG.grid.cellSize, target.x, target.y - 10, '#7fd6e0');
    this.dmgSource = null;
    this.applyDamageToEnemy(target, g.damage[this.guardLevel - 1] * (1 + this.boon('ward')), 'lightning', 'mage', []);
  }

  public selectBinder(id: string | null) {
    this.selectTower(null);
    this.selectedBinderId = id;
    this.upgradingFromBinderId = null;
    this.notifyState();
  }

  public placeBinder(cellX: number, cellY: number): boolean {
    if (!this.placingBinder) return false;
    const price = this.placingSlot !== null ? 0 : this.binderPrice();
    if (!this.isCellFree(cellX, cellY) || this.gold < price) {
      sound.playError();
      return false;
    }
    this.gold -= price;
    const binder: Binder = { id: Math.random().toString(36).substring(2, 9), x: cellX, y: cellY };
    this.binders.push(binder);
    this.logEv('binder', { x: cellX, y: cellY, paid: price });
    sound.playBuy();
    this.spawnRing(centerX({ x: cellX, y: cellY }), centerY({ x: cellX, y: cellY }), CONFIG.binder.color);
    if (this.placingSlot !== null) this.backpack.splice(this.stackItem(this.placingSlot), 1);
    this.clearPlacing();
    this.selectedBinderId = binder.id;
    this.notifyState();
    return true;
  }

  public sellBinder(id: string): boolean {
    const idx = this.binders.findIndex((b) => b.id === id);
    if (idx === -1) return false;
    const b = this.binders[idx];
    const refund = Math.floor(CONFIG.binder.cost * (b.triple ? 3 : 1) * this.sellRatio());
    this.gold += refund;
    this.binders.splice(idx, 1);
    this.selectedBinderId = null;
    sound.playBuy();
    this.addFloatingText(`+${refund} золота`, centerX(b), centerY(b), '#f4c06a');
    this.notifyState();
    return true;
  }

  // Plain binders bind two towers; a triple one only raises levels
  private plainBinders(): Binder[] {
    return this.binders.filter((b) => !b.triple);
  }

  // Towers the given one can be bound with: another type, neither already bound, both Ур.2 or Ур.3
  public getBindPartners(tower: Tower): Tower[] {
    if (tower.second || this.plainBinders().length === 0 || !CONFIG.races[this.race].binders) return [];
    if (!canBindLevels(tower.level, tower.level)) return [];
    // a level-2 tower still choosing its specialization can't be bound yet
    if (tower.level === 2 && tower.specs.length === 0) return [];
    return this.towers.filter(
      (t) =>
        t !== tower && t.type !== tower.type && !t.second && canBindLevels(tower.level, t.level) && (t.level !== 2 || t.specs.length > 0)
    );
  }

  // Selected tower waits for a tap on its partner (tap again to cancel)
  public toggleBinding(): boolean {
    if (this.bindingFromId) {
      this.bindingFromId = null;
      this.notifyState();
      return true;
    }
    const tower = this.selectedTowerId ? this.towers.find((t) => t.id === this.selectedTowerId) : null;
    if (!tower || this.getBindPartners(tower).length === 0) {
      sound.playError();
      if (tower && !tower.second && this.plainBinders().length > 0 && !canBindLevels(tower.level, tower.level)) this.warnBindLevel(tower);
      return false;
    }
    this.bindingFromId = tower.id;
    this.notifyState();
    return true;
  }

  // Binds the waiting tower with `partner`; the partner and the nearest binder leave the field
  public bindWith(partner: Tower): boolean {
    const tower = this.bindingFromId ? this.towers.find((t) => t.id === this.bindingFromId) : null;
    this.bindingFromId = null;
    if (!tower || !this.getBindPartners(tower).includes(partner)) {
      sound.playError();
      if (tower && partner !== tower && partner.type !== tower.type && !partner.second && !canBindLevels(tower.level, partner.level))
        this.warnBindLevel(partner);
      this.notifyState();
      return false;
    }
    const binder = this.nearest(this.plainBinders(), tower)[0];
    this.logEv('bind', { id: tower.id, type: tower.type, level: tower.level, partner: partner.type, partnerLevel: partner.level, x: tower.x, y: tower.y });
    this.binders.splice(this.binders.indexOf(binder), 1);
    this.towers.splice(this.towers.indexOf(partner), 1);
    tower.second = {
      type: partner.type,
      level: partner.level,
      specs: partner.specs,
      cooldownTimer: 0,
      smiteTimer: 2.5,
    };
    const cs = CONFIG.grid.cellSize;
    this.spawnPuff(centerX(partner), centerY(partner), CONFIG.binder.color);
    this.spawnPuff(centerX(binder), centerY(binder), CONFIG.binder.color);
    this.spawnRing(centerX(tower), centerY(tower), CONFIG.binder.color);
    this.addFloatingText('СВЯЗКА!', centerX(tower), centerY(tower) - 16, CONFIG.binder.color);
    sound.playMerge();
    this.selectedTowerId = tower.id;
    this.notifyState();
    return true;
  }

  private warnBindLevel(at: { x: number; y: number }) {
    const cs = CONFIG.grid.cellSize;
    this.addFloatingText('Связка — только Ур.2 и Ур.3', centerX(at), centerY(at) - 16, '#e0452f');
  }

  private nearest<T extends { x: number; y: number }>(list: T[], to: { x: number; y: number }): T[] {
    return [...list].sort((a, b) => Math.hypot(a.x - to.x, a.y - to.y) - Math.hypot(b.x - to.x, b.y - to.y));
  }

  // Three plain binders merge into a triple one: the selected stays, the two nearest leave
  public canMergeBinders(): boolean {
    const sel = this.binders.find((b) => b.id === this.selectedBinderId);
    return !!sel && !sel.triple && this.plainBinders().length >= 3 && this.tier >= CONFIG.binder.tripleFromTier;
  }

  public mergeBinders(): boolean {
    const sel = this.binders.find((b) => b.id === this.selectedBinderId);
    if (!sel || !this.canMergeBinders()) {
      sound.playError();
      if (sel && !sel.triple && this.plainBinders().length >= 3 && this.tier < CONFIG.binder.tripleFromTier) {
        this.addFloatingText(`Тройная связка — с ${CONFIG.binder.tripleFromTier}-го яруса лавки`, centerX(sel), centerY(sel) - 16, '#e0452f');
      }
      return false;
    }
    const cs = CONFIG.grid.cellSize;
    for (const b of this.nearest(this.plainBinders().filter((b) => b !== sel), sel).slice(0, 2)) {
      this.binders.splice(this.binders.indexOf(b), 1);
      this.spawnPuff(centerX(b), centerY(b), CONFIG.binder.color);
    }
    sel.triple = true;
    this.spawnRing(centerX(sel), centerY(sel), CONFIG.binder.color);
    this.addFloatingText('ТРОЙНАЯ СВЯЗКА!', centerX(sel), centerY(sel) - 16, CONFIG.binder.color);
    sound.playMerge();
    this.notifyState();
    return true;
  }

  // A tower or pair a triple binder can raise: some part below Ур.3, none still choosing a specialization
  public getUpgradeTargets(): Tower[] {
    const waiting = (p: TowerPart) => p.level === 2 && p.specs.length === 0;
    return this.towers.filter((t) => {
      const parts: TowerPart[] = t.second ? [t, t.second] : [t];
      return parts.some((p) => p.level < 3) && !parts.some(waiting);
    });
  }

  // The selected tower can be raised by a triple binder that stands on the field
  public canUpgradeSelectedTower(): boolean {
    const tower = this.towers.find((t) => t.id === this.selectedTowerId);
    return !!tower && this.binders.some((b) => b.triple) && this.getUpgradeTargets().includes(tower);
  }

  // Raise the selected tower with the nearest triple binder, without selecting the binder first
  public upgradeSelectedTower(): boolean {
    const tower = this.towers.find((t) => t.id === this.selectedTowerId);
    const binder = tower && this.nearest(this.binders.filter((b) => b.triple), tower)[0];
    if (!tower || !binder) {
      sound.playError();
      return false;
    }
    this.upgradingFromBinderId = binder.id;
    return this.upgradeWithBinder(tower);
  }

  // Selected triple binder waits for a tap on the tower to raise (tap again to cancel)
  public toggleUpgrading(): boolean {
    if (this.upgradingFromBinderId) {
      this.upgradingFromBinderId = null;
      this.notifyState();
      return true;
    }
    const sel = this.binders.find((b) => b.id === this.selectedBinderId);
    if (!sel?.triple || this.getUpgradeTargets().length === 0) {
      sound.playError();
      return false;
    }
    this.upgradingFromBinderId = sel.id;
    this.notifyState();
    return true;
  }

  // Every part of the tower below Ур.3 goes one level up; the triple binder is spent.
  // Ур.1 → Ур.2 asks for a specialization, Ур.2 → Ур.3 repeats the one it has (power ×3)
  public upgradeWithBinder(tower: Tower): boolean {
    const binder = this.binders.find((b) => b.id === this.upgradingFromBinderId);
    this.upgradingFromBinderId = null;
    if (!binder?.triple || !this.getUpgradeTargets().includes(tower)) {
      sound.playError();
      this.notifyState();
      return false;
    }
    this.logEv('upgrade', { id: tower.id, type: tower.type, level: tower.level, x: tower.x, y: tower.y });
    this.binders.splice(this.binders.indexOf(binder), 1);
    for (const part of tower.second ? [tower, tower.second] : [tower]) {
      if (part.level >= 3) continue;
      part.level += 1;
      part.specs = part.level === 3 ? [...part.specs, ...part.specs, ...part.specs] : [];
    }
    const cs = CONFIG.grid.cellSize;
    this.spawnPuff(centerX(binder), centerY(binder), CONFIG.binder.color);
    this.spawnRing(centerX(tower), centerY(tower), '#f4c06a');
    this.addFloatingText('УРОВЕНЬ +1!', centerX(tower), centerY(tower) - 16, '#f4c06a');
    sound.playMerge();
    this.selectedBinderId = null;
    this.selectedTowerId = tower.id;
    this.askSpecIfNeeded(tower);
    this.notifyState();
    return true;
  }

  // A part that just reached Ур.2 without a specialization asks for one: the main part first
  /** A part still has to choose: люди on reaching Ур.2, орки on placing and every new level, нежить on every merge */
  public specPending(part: TowerPart): boolean {
    const race = CONFIG.towers[part.type].race ?? 'humans';
    if (race === 'orcs') return part.specs.length < part.level;
    if (race === 'undead') return part.specs.length < part.level - 1;
    if (race !== 'humans') return false;
    return part.level === 2 && part.specs.length === 0;
  }

  private askSpecIfNeeded(tower: Tower) {
    if (CONFIG.towers[tower.type].race && CONFIG.towers[tower.type].race !== 'humans') {
      if (this.specPending(tower)) this.onNeedSpecChoice?.(tower, 'main');
      return;
    }
    if (tower.level === 2 && tower.specs.length === 0) this.onNeedSpecChoice?.(tower, 'main');
    else if (tower.second && tower.second.level === 2 && tower.second.specs.length === 0)
      this.onNeedSpecChoice?.(tower, 'second');
  }

  public cycleTargetPriority(towerId: string) {
    const tower = this.towers.find((t) => t.id === towerId);
    if (!tower) return;
    if (tower.priority === 'first') tower.priority = 'strongest';
    else if (tower.priority === 'strongest') tower.priority = 'closest';
    else tower.priority = 'first';
    this.notifyState();
  }

  public sellTower(towerId: string): boolean {
    const idx = this.towers.indexOf(this.towers.find((t) => t.id === towerId)!);
    if (idx === -1) return false;
    const tower = this.towers[idx];
    let refund = calculateSellRefund(CONFIG.towers[tower.type].cost, tower.level, this.sellRatio(), this.mergeNeed());
    for (const part of tower.fused?.parts ?? []) refund += calculateSellRefund(CONFIG.towers[part.type].cost, part.level, this.sellRatio(), this.mergeNeed());
    if (tower.second) {
      refund += calculateSellRefund(CONFIG.towers[tower.second.type].cost, tower.second.level, this.sellRatio());
      refund += Math.floor(CONFIG.binder.cost * this.sellRatio());
    }

    this.gold += refund;
    this.logEv('sell', { id: tower.id, type: tower.type, level: tower.level, second: tower.second ? tower.second.type : null, x: tower.x, y: tower.y, refund, damage: Math.round(this.runStats.dmg.get(tower.id) || 0) });
    this.towers.splice(idx, 1);
    this.markModsDirty();
    this.selectedTowerId = null;
    sound.playBuy();
    this.addFloatingText(`+${refund} золота`, centerX(tower), centerY(tower), '#f4c06a');
    this.notifyState();
    return true;
  }

  // Get eligible towers for merging with the selected tower
  /** Highest level a tower of the player's faction reaches: 3, нежить 5 */
  public maxLevel(): number {
    return CONFIG.races[this.race].maxLevel ?? 3;
  }

  /** Cultists: what the selected tower can be built into. A tower standing in a figure → a megatower;
   *  a megatower with another megatower on the field → a hypertower. */
  public fuseKind(t: Tower): 'mega' | 'hyper' | 'hyperup' | null {
    if (this.race !== 'cultists' || CONFIG.towers[t.type].race !== 'cultists') return null;
    if (this.modsDirty) this.computeMods();
    if (t.fused) {
      if (t.fused.level !== undefined) return t.fused.level < CONFIG.raceMech.hyperMaxLevel && this.hyperUpMegas(t) ? 'hyperup' : null;
      return this.hyperPartner(t) ? 'hyper' : null;
    }
    return this.megas.some((g) => g.ids.includes(t.id)) ? 'mega' : null;
  }

  /** A ready Т or П megatower (not a hypertower): a single figure built into one tower */
  private megaShape(t: Tower): 'T' | 'P' | null {
    return t.fused && t.fused.level === undefined && t.fused.megas === 1 ? t.fused.shapes[0] : null;
  }

  /** A hypertower is built only of a Т and a П megatower: the nearest one of the other kind */
  private hyperPartner(t: Tower): Tower | null {
    const mine = this.megaShape(t);
    if (!mine) return null;
    return this.nearest(this.towers.filter((o) => o !== t && this.megaShape(o) !== null && this.megaShape(o) !== mine), t)[0] ?? null;
  }

  /** The level of a hypertower is raised by one other hypertower or by two equal megatowers (two Т or two П) */
  private hyperUpMegas(t: Tower): Tower[] | null {
    const other = this.nearest(this.towers.filter((o) => o !== t && o.fused?.level !== undefined && o.fused.level === t.fused?.level), t)[0]; // только гипербашня того же уровня: низкая не поглощает высокую
    if (other) return [other];
    for (const shape of ['T', 'P'] as const) {
      const same = this.nearest(this.towers.filter((o) => o !== t && this.megaShape(o) === shape), t);
      if (same.length >= 2) return same.slice(0, 2);
    }
    return null;
  }

  /** Name for the card of a built tower */
  public fusedName(t: Tower): string | null {
    const f = t.fused;
    if (!f) return null;
    if (f.level !== undefined) return 'Гипербашня';
    return f.shapes[0] === 'P' ? 'Мегабашня П' : 'Мегабашня Т';
  }

  private partOf(t: Tower): TowerPart {
    return { type: t.type, level: t.level, specs: [...t.specs], cooldownTimer: 0, smiteTimer: 2.5 };
  }

  /** The cultists' «Собрать»: the figure's towers become one tower with all their abilities stacked;
   *  megatowers (also ready ones) fused again become a hypertower */
  public fuseShapes(t: Tower): ('T' | 'P')[] {
    if (this.fuseKind(t) !== 'mega') return [];
    return [...new Set(this.megas.filter((m) => m.ids.includes(t.id)).map((m) => m.shape))];
  }

  /** Hypertower in the making: the player picks three adjacent free cells (the cells of the two joining towers count as free) */
  public hyperPlan: { mainId: string; otherId: string; cells: { x: number; y: number }[] } | null = null;

  public hyperCellFree(x: number, y: number): boolean {
    const plan = this.hyperPlan;
    if (!plan) return false;
    this.ignoreTowers = new Set([plan.mainId, plan.otherId]);
    const ok = this.isCellFree(x, y);
    this.ignoreTowers = new Set();
    return ok;
  }

  /** The cells a tap on (x, y) may add to the plan: free, not picked yet and next to a picked one */
  public hyperCellValid(x: number, y: number): boolean {
    const plan = this.hyperPlan;
    if (!plan || !this.hyperCellFree(x, y) || plan.cells.some((c) => c.x === x && c.y === y)) return false;
    return plan.cells.length === 0 || plan.cells.some((c) => adjacent(c, { x, y }));
  }

  private startHyper(sel: Tower): boolean {
    const other = this.hyperPartner(sel);
    if (!other) return false;
    this.hyperPlan = { mainId: sel.id, otherId: other.id, cells: [] };
    this.notifyState();
    return true;
  }

  public cancelHyper() {
    if (!this.hyperPlan) return;
    this.hyperPlan = null;
    this.notifyState();
  }

  /** A tap on a cell while planning: the third cell builds the tower */
  public pickHyperCell(x: number, y: number): boolean {
    const plan = this.hyperPlan;
    if (!plan) return false;
    if (!this.hyperCellValid(x, y)) {
      sound.playError();
      return false;
    }
    plan.cells.push({ x, y });
    sound.playBuy();
    if (plan.cells.length < 3) {
      this.notifyState();
      return true;
    }
    return this.finishFuse('hyper', null, plan.cells);
  }

  /** Three adjacent free cells near the tower, for a bot (a player picks them by hand) */
  public suggestHyperCells(sel: Tower): { x: number; y: number }[] | null {
    if (!this.hyperPlan && !this.startHyper(sel)) return null;
    const plan = this.hyperPlan!;
    const cells: { x: number; y: number }[] = [];
    const around = (c: { x: number; y: number }) => [{ x: c.x + 1, y: c.y }, { x: c.x - 1, y: c.y }, { x: c.x, y: c.y + 1 }, { x: c.x, y: c.y - 1 }];
    const starts: { x: number; y: number }[] = [];
    for (let y = 0; y < CONFIG.grid.rows; y++) for (let x = 0; x < CONFIG.grid.cols; x++) if (this.hyperCellFree(x, y)) starts.push({ x, y });
    for (const st of this.nearest(starts, sel)) {
      cells.length = 0;
      cells.push(st);
      for (let k = 0; k < 2; k++) {
        const next = this.nearest(around(cells[cells.length - 1]).filter((c) => this.hyperCellFree(c.x, c.y) && !cells.some((d) => d.x === c.x && d.y === c.y)), sel)[0];
        if (!next) break;
        cells.push(next);
      }
      if (cells.length === 3) break;
    }
    if (cells.length < 3) {
      plan.cells = [];
      return null;
    }
    return [...cells];
  }

  public fuseSelected(shape?: 'T' | 'P', hyperCells?: { x: number; y: number }[]): boolean {
    const sel = this.selectedTowerId ? this.towers.find((t) => t.id === this.selectedTowerId) : null;
    if (!sel) return false;
    const kind = this.fuseKind(sel);
    if (!kind) return false;
    if (kind === 'hyperup') {
      const pair = this.hyperUpMegas(sel);
      if (!pair || !sel.fused) return false;
      const cs = CONFIG.grid.cellSize;
      for (const t of pair) {
        sel.fused.parts.push(this.partOf(t), ...t.fused!.parts);
        sel.fused.shapes.push(...t.fused!.shapes);
        sel.fused.megas += t.fused!.megas;
        this.spawnPuff(centerX(t), centerY(t), '#d6f0ff');
        this.towers.splice(this.towers.indexOf(t), 1);
      }
      sel.fused.level = (sel.fused.level ?? 1) + 1;
      this.logEv('fuse', { id: sel.id, kind, level: sel.fused.level, megas: sel.fused.megas, parts: sel.fused.parts.map((p) => `${p.type}${p.level}`), x: sel.x, y: sel.y });
      this.markModsDirty();
      sound.playMerge();
      this.spawnRing(centerX(sel), centerY(sel), '#d6f0ff', cs * 1.8);
      this.addFloatingText(`ГИПЕРБАШНЯ Ур.${sel.fused.level}!`, centerX(sel), centerY(sel) - 16, '#d6f0ff');
      this.notifyState();
      return true;
    }
    if (kind === 'hyper') {
      // the second tap on the button cancels the planning; a bot passes the cells at once
      if (this.hyperPlan && !hyperCells) {
        this.cancelHyper();
        return true;
      }
      if (!this.hyperPlan && !this.startHyper(sel)) return false;
      if (!hyperCells) return true;
      this.hyperPlan!.cells = hyperCells.map((c) => ({ ...c }));
      return this.finishFuse('hyper', null, this.hyperPlan!.cells);
    }
    return this.finishFuse('mega', shape ?? null, []);
  }

  private finishFuse(kind: 'mega' | 'hyper', shape: 'T' | 'P' | null, cells: { x: number; y: number }[]): boolean {
    const cs = CONFIG.grid.cellSize;
    let main: Tower;
    let joined: Tower[];
    let built: 'T' | 'P' | null = null;
    let extra: { x: number; y: number }[] = [];
    if (kind === 'mega') {
      const sel = this.towers.find((t) => t.id === this.selectedTowerId);
      if (!sel) return false;
      const g = [...this.megas].filter((m) => m.ids.includes(sel.id) && (!shape || m.shape === shape)).sort((a, b) => b.ids.length - a.ids.length)[0];
      if (!g) return false;
      joined = g.ids.map((id) => this.towers.find((t) => t.id === id)!).filter(Boolean);
      main = joined[0];
      built = g.shape;
      // П takes two cells: the bar's middle and the next cell of the bar; the other cells of the figure are freed
      if (g.shape === 'P') extra = [{ x: joined[1].x, y: joined[1].y }];
    } else {
      const plan = this.hyperPlan;
      const a = plan && this.towers.find((t) => t.id === plan.mainId);
      const b = plan && this.towers.find((t) => t.id === plan.otherId);
      if (!a || !b || cells.length !== 3) return false;
      main = a;
      joined = [a, b];
      // the tower stands on the three picked cells
      extra = cells.slice(1).map((c) => ({ ...c }));
      this.logEv('move', { id: a.id, type: a.type, fromX: a.x, fromY: a.y, x: cells[0].x, y: cells[0].y, paid: 0 });
    }
    const f: NonNullable<Tower['fused']> = { shapes: [], parts: [], megas: 0 };
    // A megatower is the level of a random tower of the figure (просьба Артура 2026-11-02): the chance of Ур.2 / Ур.3 is the share
    // of such towers in it. The drawn tower becomes the main part (its type, level and properties), the old main goes to the parts
    const mainPart = this.partOf(main);
    let lead: Tower | null = null;
    if (kind === 'mega' && joined.length > 1) {
      lead = joined[Math.floor(Math.random() * joined.length)];
      if (lead !== main) {
        main.type = lead.type;
        main.level = lead.level;
        main.specs = [...lead.specs];
      }
    }
    for (const t of joined) {
      if (t !== main) f.parts.push(t === lead && lead !== main ? mainPart : this.partOf(t));
      if (t.fused) {
        f.shapes.push(...t.fused.shapes);
        f.parts.push(...t.fused.parts);
        f.megas += t.fused.megas;
      }
    }
    if (built) {
      f.shapes.push(built);
      f.megas += 1;
    }
    for (const t of joined) {
      if (t === main) continue;
      this.spawnPuff(centerX(t), centerY(t), '#d6f0ff');
      this.towers.splice(this.towers.indexOf(t), 1);
    }
    if (kind === 'hyper') f.level = 1;
    main.fused = f;
    if (kind === 'hyper') {
      main.x = cells[0].x;
      main.y = cells[0].y;
    }
    main.extra = extra.length > 0 ? extra : undefined;
    this.hyperPlan = null;
    this.logEv('fuse', { id: main.id, kind, shapes: [...f.shapes], megas: f.megas, parts: f.parts.map((p) => `${p.type}${p.level}`), x: main.x, y: main.y, extra });
    this.selectedTowerId = main.id;
    this.markModsDirty();
    sound.playMerge();
    this.spawnRing(centerX(main), centerY(main), '#d6f0ff', cs * 1.6);
    this.addFloatingText(f.level !== undefined ? 'ГИПЕРБАШНЯ!' : 'МЕГАБАШНЯ!', centerX(main), centerY(main) - 16, '#d6f0ff');
    this.notifyState();
    return true;
  }

  public getEligibleMergeTowers(selected: Tower): Tower[] {
    if (selected.level >= this.maxLevel() || selected.second || selected.fused) return [];
    return this.towers.filter(
      (t) =>
        !t.second &&
        !t.fused &&
        t.type === selected.type &&
        t.level === selected.level &&
        // a tower still choosing its specialization (tempering, merge choice) can't merge yet
        !this.specPending(t)
    );
  }

  // The plain binder that can take the place of the third tower of two equal Ур.1 towers (the nearest one).
  // Ур.2 has no stand-in: a triple binder raises one tower by itself («Усилить» / «Уровень!»), which is strictly cheaper
  public mergeStandIn(selected: Tower): Binder | null {
    if (selected.second || selected.level !== 1 || !CONFIG.races[this.race].binders) return null;
    const candidates = this.binders.filter((b) => !b.triple);
    return this.nearest(candidates, selected)[0] ?? null;
  }

  public mergeSelectedTower(): boolean {
    if (!this.selectedTowerId) return false;
    const selected = this.towers.find((t) => t.id === this.selectedTowerId);
    if (!selected || selected.level >= this.maxLevel()) return false;

    const eligible = this.getEligibleMergeTowers(selected);
    const need = this.mergeNeed();
    // Two equal towers and a binder: the binder takes the place of the third tower (люди)
    const standIn = need === 3 && eligible.length === 2 ? this.mergeStandIn(selected) : null;
    if (eligible.length < need && !standIn) return false;

    // Selected tower stays, pick 2 closest eligible to merge into it
    const others = eligible.filter((t) => t.id !== selected.id);
    others.sort((a, b) => {
      const dA = Math.hypot(a.x - selected.x, a.y - selected.y);
      const dB = Math.hypot(b.x - selected.x, b.y - selected.y);
      return dA - dB;
    });

    const mergePair = standIn ? others : others.slice(0, need - 1);
    this.logEv('merge', { id: selected.id, type: selected.type, from: selected.level, to: selected.level + 1, consumed: mergePair.map((m) => m.id), binder: !!standIn, x: selected.x, y: selected.y });

    if (standIn) {
      this.binders.splice(this.binders.indexOf(standIn), 1);
      if (this.selectedBinderId === standIn.id) this.selectedBinderId = null;
      this.spawnPuff(centerX(standIn), centerY(standIn), CONFIG.binder.color);
    }

    // Remove the towers that join (two, or one when a binder stands in)
    for (const m of standIn ? mergePair.slice(0, 1) : mergePair) {
      const idx = this.towers.indexOf(m);
      if (idx !== -1) {
        this.towers.splice(idx, 1);
        this.spawnPuff(centerX(m), centerY(m), '#f4c06a');
      }
    }

    selected.level += 1;
    this.markModsDirty();
    const ownRace = CONFIG.towers[selected.type].race;
    if (ownRace && ownRace !== 'humans') {
      // Other factions keep the selected tower's choices; орки and нежить choose once more
      sound.playMerge();
      this.spawnRing(centerX(selected), centerY(selected), '#f4c06a');
      this.addFloatingText('СЛИЯНИЕ!', centerX(selected), centerY(selected) - 16, '#f4c06a');
      this.askSpecIfNeeded(selected);
      this.notifyState();
      return true;
    }
    // Level 3 keeps every specialization of the three towers (repeats add power)
    if (selected.level === 3) {
      // the binder in the place of the third tower repeats the selected tower's specialization, as a triple binder does
      selected.specs = [...selected.specs, ...mergePair.flatMap((m) => m.specs), ...(standIn ? selected.specs : [])];
    }
    sound.playMerge();
    this.spawnRing(centerX(selected), centerY(selected), '#f4c06a');
    this.addFloatingText(standIn ? 'СЛИЯНИЕ СО СВЯЗКОЙ!' : 'СЛИЯНИЕ!', centerX(selected), centerY(selected) - 16, '#f4c06a');

    if (selected.level === 2 && selected.specs.length === 0) {
      // Immediate mandatory specialization choice modal
      if (this.onNeedSpecChoice) {
        this.onNeedSpecChoice(selected, 'main');
      }
    }

    this.notifyState();
    return true;
  }

  public setTowerSpecialization(towerId: string, specId: string, part: 'main' | 'second' = 'main') {
    const tower = this.towers.find((t) => t.id === towerId);
    if (!tower) return;
    const race = CONFIG.towers[tower.type].race;
    if (race === 'orcs' || race === 'undead') {
      // Each tempering / merge choice adds up
      if (this.specPending(tower)) tower.specs = [...tower.specs, specId];
    } else if (part === 'second' && tower.second) tower.second.specs = [specId];
    else tower.specs = [specId];
    this.logEv('spec', { id: tower.id, type: tower.type, level: tower.level, part, spec: specId, x: tower.x, y: tower.y });
    this.askSpecIfNeeded(tower);
    this.notifyState();
  }

  // -------------------------------------------------------------
  // Particle & FX Helpers
  // -------------------------------------------------------------
  public spawnSpark(x: number, y: number, color: string) {
    for (let i = 0; i < 4; i++) {
      const p = this.particles.find((item) => !item.active);
      if (!p) break;
      p.active = true;
      p.x = x;
      p.y = y;
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 80;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.size = 2.5;
      p.color = color;
      p.alpha = 1;
      p.life = 0;
      p.maxLife = 0.2 + Math.random() * 0.15;
      p.type = 'spark';
    }
  }

  /** A ranged enemy's shot at the artifact: a bright dot flying from (x, y) to (tx, ty) */
  public spawnBolt(x: number, y: number, tx: number, ty: number, color: string) {
    const p = this.particles.find((item) => !item.active);
    if (!p) return;
    const flight = 0.25;
    p.active = true;
    p.x = x;
    p.y = y;
    p.vx = (tx - x) / flight;
    p.vy = (ty - y) / flight;
    p.size = 3;
    p.color = color;
    p.alpha = 1;
    p.life = 0;
    p.maxLife = flight;
    p.type = 'spark';
  }

  public spawnPuff(x: number, y: number, color: string) {
    for (let i = 0; i < 7; i++) {
      const p = this.particles.find((item) => !item.active);
      if (!p) break;
      p.active = true;
      p.x = x + (Math.random() - 0.5) * 12;
      p.y = y + (Math.random() - 0.5) * 12;
      const angle = Math.random() * Math.PI * 2;
      const speed = 15 + Math.random() * 30;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.size = 4 + Math.random() * 4;
      p.color = color;
      p.alpha = 0.8;
      p.life = 0;
      p.maxLife = 0.35 + Math.random() * 0.2;
      p.type = 'puff';
    }
  }

  public spawnRing(x: number, y: number, color: string, grow = 28) {
    const p = this.particles.find((item) => !item.active);
    if (!p) return;
    p.active = true;
    p.x = x;
    p.y = y;
    p.vx = 0;
    p.vy = 0;
    p.size = 8;
    p.color = color;
    p.alpha = 1;
    p.life = 0;
    p.maxLife = 0.4;
    p.type = 'ring';
    p.grow = grow;
  }

  public addFloatingText(text: string, x: number, y: number, color: string) {
    this.floatingTexts.push({
      id: Math.random().toString(36).substring(2, 9),
      text,
      x,
      y,
      color,
      life: 0,
      maxLife: 0.9,
    });
  }

  public notifyState() {
    if (this.isGameOver || this.isVictory) this.logEnd();
    if (!this.onStateChange) return;
    const selected = this.selectedTowerId ? this.towers.find((t) => t.id === this.selectedTowerId) || null : null;
    this.selectedDamageDirty = false;
    this.selectedDamageShown = performance.now();
    this.selectedSideShown = this.selectedSide();
    const eligibleTowers = selected ? this.getEligibleMergeTowers(selected) : [];
    const mergeBinder = selected && eligibleTowers.length === 2 ? this.mergeStandIn(selected) : null;
    const eligibleCount = eligibleTowers.length + (mergeBinder ? 1 : 0);
    const bindPartnerCount = selected ? this.getBindPartners(selected).length : 0;

    this.onStateChange({
      lives: this.lives,
      gold: this.gold,
      level: this.level,
      randomMap: this.mapSeed !== null,
      sandbox: this.sandbox,
      bossName: this.worldBossName,
      hexField: isHex(),
      mapName: this.currentMap.name,
      mapEdit: this.mapEdit
        ? {
            tool: this.mapEdit.tool,
            level: this.mapEdit.level,
            errors: this.mapEditCheck?.errors ?? [],
            exits: this.mapEdit.exits.length,
            roads: this.mapEdit.road.size,
            blocked: this.mapEdit.blocked.size,
          }
        : null,
      wave: this.shownWave(),
      maxWaves: this.endless ? 12 : this.lastWave(),
      tier: this.tier,
      isWaveActive: this.waveInProgress || this.isSpawning || this.enemies.length > 0,
      isSpawning: this.isSpawning,
      isGameOver: this.isGameOver,
      isVictory: this.isVictory,
      isPaused: this.isPaused,
      allWavesLaunched: !this.endless && this.wavesLaunched >= this.lastWave(),
      waveLimit: this.waveLimit,
      endless: this.endless,
      duel: this.duelStart !== null,
      duelSendPrices: this.duelStart === null ? null : Object.fromEntries(SEND_TYPES.map((t) => [t, this.sendPrice(t)])) as Record<SendType, number>,
      duelOutgoing: { ...this.duelOutgoing },
      duelOutgoingCost: this.duelOutgoingCost,
      duelIncome: this.duelIncome,
      waveCountdown: this.waveCountdown === null ? null : Math.ceil(this.waveCountdown),
      autoStart: this.autoStart,
      earlyStartBonus: this.earlyStartBonus(),
      speed: this.speedMultiplier,
      selectedTower: selected,
      hyperPlanLeft: this.hyperPlan ? 3 - this.hyperPlan.cells.length : 0,
      eligibleMergeCount: eligibleCount,
      mergeUsesBinder: !!mergeBinder,
      selectedBinder: this.selectedBinderId !== null,
      binderCount: this.plainBinders().length,
      selectedBinderTriple: !!this.binders.find((b) => b.id === this.selectedBinderId)?.triple,
      canMergeBinders: this.canMergeBinders(),
      upgradeTargetCount: this.getUpgradeTargets().length,
      canUpgradeSelected: this.canUpgradeSelectedTower(),
      supplyPower: this.supplyPower(),
      supplyMult: this.supplyMult(),
      supplyActive: this.supplyActive(),
      sellRatio: this.sellRatio(),
      backpack: this.backpackStacks().map((st) => {
        const top = this.backpack[st[st.length - 1]];
        return { kind: top.kind, type: top.type, triplet: top.triplet, startLevel: top.startLevel, sell: top.paid, count: st.length, canMerge: this.canMergeStack(st) };
      }),
      backpackSlots: CONFIG.backpack.slots,
      faction: this.faction,
      nextWaveFaction: this.factionOfWave(this.wavesLaunched + 1),
      runSummary: this.isGameOver || this.isVictory ? this.buildRunSummary() : null,
      waveSummary: this.lastSummary,
      nextWave: this.nextWaveComposition(),
      placingSlot: this.placingSlot,
      supplyNext: this.supplyNext(),
      isUpgrading: this.upgradingFromBinderId !== null,
      bindPartnerCount,
      isBinding: this.bindingFromId !== null,
      canMoveTowers: this.canMoveTowers(),
      moveCost: this.moveCost(),
      stageBreak: this.stageBreakInfo(),
      heroSkills: this.heroSkills.map((h) => {
        const d = HERO_ABILITIES.find((x) => x.id === h.id)!;
        return { id: h.id, name: d.name, icon: d.icon, desc: d.desc, left: Math.ceil(h.left), cooldown: d.cooldown };
      }),
      boons: [...new Set([...this.boons, ...Object.keys(this.campLevels).filter((id) => this.campLevels[id] > 0)])].map((id) => BOONS.find((b) => b.id === id)!).filter(Boolean),
      boonOffer: this.boonOffers[0]?.map((id) => BOONS.find((b) => b.id === id)!).filter(Boolean) ?? null,
      rerollCost: this.rerollCost(),
      race: this.race,
      mergeNeed: this.mergeNeed(),
      maxLevel: this.maxLevel(),
      autoAbilities: this.autoAbilities,
      selectedInfo: selected ? this.selectedInfo(selected) : null,
      zoomed: this.viewZoom > 1,
      selectedDamage: selected ? { wave: this.waveStats.dmg.get(selected.id) || 0, run: this.runStats.dmg.get(selected.id) || 0 } : null,
      selectedSide: this.selectedSideShown,
      castle: this.castleSelected
        ? {
            hp: this.lives,
            maxHp: this.livesMax(),
            level: this.guardLevel,
            maxLevel: CONFIG.siege.guard.damage.length,
            damage: CONFIG.siege.guard.damage[this.guardLevel - 1] * (1 + this.boon('ward')),
            nextDamage: CONFIG.siege.guard.damage[this.guardLevel] !== undefined ? CONFIG.siege.guard.damage[this.guardLevel] * (1 + this.boon('ward')) : null,
            cost: this.guardUpgradeCost(),
          }
        : null,
    });
  }

  private selectedInfo(t: Tower): GameStateSnapshot['selectedInfo'] {
    const def = CONFIG.towers[t.type];
    if (!def.race || def.race === 'humans') return null;
    const lines = [...this.towerMods(t).lines];
    if (t.souls !== undefined) lines.push(`Души: ${t.souls} из ${CONFIG.raceMech.soulsMax}`);
    if (t.fused) {
      // одинаковые башни (вид + уровень) — одной записью с числом в скобках
      const groups = new Map<string, number>();
      for (const p of [t, ...t.fused.parts]) {
        const k = `${CONFIG.towers[p.type].name} Ур.${p.level}`;
        groups.set(k, (groups.get(k) ?? 0) + 1);
      }
      lines.push(`Состав: ${[...groups].map(([k, n]) => (n > 1 ? `${k} (${n})` : k)).join(', ')}`);
    }
    if (t.critT !== undefined) lines.push(`Шанс крита сейчас: ${Math.round(Math.min(1, t.critT / CONFIG.raceMech.critFull) * 100)} %`);
    const ab = def.ability;
    const victim = t.type === 'dem_gate' ? this.sacrificeVictims(t)[0] : undefined;
    return {
      lines,
      ability: ab
        ? {
            name: ab.name,
            desc: ab.desc,
            cost: ab.cost,
            cooldown: Math.ceil(t.abilityCd ?? 0),
            left: Math.ceil(t.abilityLeft ?? 0),
            ready: this.abilityReady(t),
            auto: !!t.auto,
          }
        : null,
      sacrifice: victim ? CONFIG.raceMech.sacrificeMult * this.towerInvested(victim) : null,
      fuse: this.fuseKind(t) ?? (this.race === 'cultists' ? 'none' : null),
      fuseNone: t.fused ? (t.fused.level !== undefined ? (t.fused.level >= CONFIG.raceMech.hyperMaxLevel ? 'макс. Ур.' : 'нужны 2 мега') : this.megaShape(t) ? `нужна ${this.megaShape(t) === 'T' ? 'П' : 'Т'}` : '') : 'нужна Т/П',
      title: this.fusedName(t),
      fuseLevel: t.fused?.level ?? null,
      fuseShapes: this.fuseShapes(t),
    };
  }

  // -------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------
  public render() {
    const ctx = this.ctx;
    if (!ctx) return;
    // The view (zoom and shift) goes on top of the pixel ratio the bitmap was sized for in resizeCanvas
    const dpr = this.dpr;
    const z = dpr * this.viewZoom;
    ctx.setTransform(z, 0, 0, z, -z * this.viewX, -z * this.viewY);
    if (isHex()) {
      // Небо над полем, затем само поле под наклоном: наземные px → экранные
      this.renderHexSky(ctx);
      const k = hexView.k();
      ctx.transform(k, 0, 0, k * hexView.squash, 0, hexView.sky());
    }
    this.renderField(ctx);
    if (this.mapEdit) this.renderMapEdit(ctx);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Фигура стоит прямо на наклонном гексовом поле: снять сжатие по высоте вокруг её точки на земле */
  private upright(ctx: CanvasRenderingContext2D, x: number, y: number, draw: () => void) {
    if (!isHex()) return draw();
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 1 / hexView.squash);
    ctx.translate(-x, -y);
    draw();
    ctx.restore();
  }

  /** Поход: сила захватчика в месте боя (вызывать после старта боя) */
  public setInvasion(k: number) {
    this.invasion = Math.max(0, Math.min(1, k));
    this.hexGround = null;
    this.hexSky = null;
  }

  /** Тайлы набора, если уже загружены; иначе начинает загрузку */
  private tilesOf(set: string): Tileset | null {
    const t = this.fieldTiles.get(set);
    if (t !== undefined) return t;
    this.fieldTiles.set(set, null);
    loadTileset(set).then((x) => {
      if (x) this.fieldTiles.set(set, x);
      else this.fieldTiles.delete(set);
      this.hexGround = null;
    });
    return null;
  }

  /** Природа континента под биомом: показывается, если бой похода идёт вдали от узла захватчика */
  private get natural(): number {
    return this.currentMap.level === 1 ? 0 : 1 - this.invasion;
  }

  /** Гексовое поле: земля карты (запекается, когда тайлы биома загружены) */
  private hexGroundLayer(): HTMLCanvasElement {
    if (this.hexGround?.map === this.currentMap && this.hexGround.k === this.invasion) return this.hexGround.canvas;
    const set = TILESETS[this.currentMap.level];
    let tiles = set ? this.fieldTiles.get(set) : null;
    if (set && !tiles) {
      this.tiledField(); // начинает загрузку тайлов; пока их нет — земля цветом палитры, без кэша
      tiles = this.fieldTiles.get(set);
    }
    let ready = !set || !!tiles;
    const bake = (level: number, t: Tileset | null) => bakeHexGround(level, this.currentMap.paths, CONFIG.grid.castleCells[0], (e) => this.entranceInward(e), t, HEX_BAKE);
    let canvas = bake(this.currentMap.level, tiles ?? null);
    if (this.natural > 0.01) {
      // Земля Пограничья, поверх — биом карты с долей захватчика
      const base = this.tilesOf(TILESETS[1]);
      ready = ready && !!base;
      const nat = bake(1, base);
      const g = nat.getContext('2d')!;
      g.globalAlpha = this.invasion;
      g.drawImage(canvas, 0, 0);
      canvas = nat;
    }
    if (ready) this.hexGround = { map: this.currentMap, k: this.invasion, canvas };
    return canvas;
  }

  /** Гексовое поле: небо и даль над ним (экранные px, до наклона) */
  private renderHexSky(ctx: CanvasRenderingContext2D) {
    const level = this.currentMap.level;
    const img = backdropImage(level);
    const base = this.natural > 0.01 ? backdropImage(1) : null;
    const k = this.invasion;
    if (this.hexSky?.level !== level || this.hexSky.img !== img || this.hexSky.base !== base || this.hexSky.k !== k) {
      let canvas = bakeHexSky(level, HEX_BAKE, img);
      if (this.natural > 0.01) {
        // Небо Пограничья, поверх — даль биома с долей захватчика
        const nat = bakeHexSky(1, HEX_BAKE, base);
        const g = nat.getContext('2d')!;
        g.globalAlpha = k;
        g.drawImage(canvas, 0, 0);
        canvas = nat;
      }
      this.hexSky = { level, k, img, base, canvas };
    }
    const c = this.hexSky.canvas;
    ctx.drawImage(c, 0, 0, c.width / HEX_BAKE, c.height / HEX_BAKE);
  }


  /** Квадрат или гекс клетки (с отступом внутрь inset px) — заливка или обводка текущим стилем */
  private cellShape(ctx: CanvasRenderingContext2D, mode: 'fill' | 'stroke', p: Point, inset: number) {
    cellPath(ctx, p, inset);
    if (mode === 'fill') ctx.fill();
    else ctx.stroke();
  }

  private renderField(ctx: CanvasRenderingContext2D) {
    const palette = CONFIG.palettes[this.level - 1];
    const cellSize = CONFIG.grid.cellSize;
    const hexGround = isHex() ? this.hexGroundLayer() : null;
    if (hexGround) ctx.drawImage(hexGround, 0, 0, hexGround.width / HEX_BAKE, hexGround.height / HEX_BAKE);
    // Контуры гексов — только пока башня или связка в руке либо выбираются клетки гипербашни (просьба Артура 2026-11-06)
    if (hexGround && (this.placingTowerType || this.placingBinder || this.hyperPlan)) {
      ctx.strokeStyle = 'rgba(255, 236, 170, 0.3)';
      ctx.lineWidth = 1.3;
      for (let y = 0; y < CONFIG.grid.rows; y++)
        for (let x = 0; x < CONFIG.grid.cols; x++) if (this.isCellFree(x, y)) this.cellShape(ctx, 'stroke', { x, y }, 1);
    }
    const baked = hexGround ? null : this.tiledField();
    const waiting = !baked && !hexGround && this.tilesPending;
    if (baked) {
      ctx.drawImage(baked, 0, 0, CONFIG.grid.totalWidth, CONFIG.grid.totalHeight);
    }

    // 1. Background / Ground cells
    // Alternating between 2 tones (2nd tone 4% lighter)
    if (!baked && !hexGround) {
      ctx.fillStyle = palette.ground;
      ctx.fillRect(0, 0, CONFIG.grid.totalWidth, CONFIG.grid.totalHeight);
    }
    if (waiting) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.font = '600 22px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Загрузка текстур…', CONFIG.grid.totalWidth / 2, CONFIG.grid.totalHeight * 0.3);
      ctx.textAlign = 'start';
    }

    // Render checkerboard ground pattern with 4% lightness difference
    for (let cy = 0; !baked && !waiting && !hexGround && cy < CONFIG.grid.rows; cy++) {
      for (let cx = 0; cx < CONFIG.grid.cols; cx++) {
        if ((cx + cy) % 2 === 1) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
          ctx.fillRect(cx * cellSize, cy * cellSize, cellSize, cellSize);
        }
      }
    }

    // Мелкий декор карты без тайлов — под дорогой, на свободных клетках
    const decor = !baked && !waiting && !hexGround ? this.decorLayer() : null;
    if (decor) ctx.drawImage(decor, 0, 0, CONFIG.grid.totalWidth, CONFIG.grid.totalHeight);

    // 2. Roads: solid ribbon with a dark outline, rounded turns and running chevrons
    const outline = mixColor(palette.ground, '#000000', 0.6);
    const rim = mixColor(palette.road, '#ffffff', 0.32);
    const fill = mixColor(palette.road, '#ffffff', 0.14);
    if (!baked && !waiting && !hexGround) {
      this.strokeRoad(ctx, outline, cellSize * 0.94);
      this.strokeRoad(ctx, rim, cellSize * 0.8);
      this.strokeRoad(ctx, fill, cellSize * 0.7);
    }

    const timeSec = performance.now() / 1000;
    const spacing = cellSize / 2;
    const phase = (timeSec * 18) % spacing;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const st of baked || waiting || hexGround ? [] : this.roadSteps) {
      const ax = st.a.x * cellSize;
      const ay = st.a.y * cellSize;
      const dx = st.b.x * cellSize - ax;
      const dy = st.b.y * cellSize - ay;
      const len = Math.hypot(dx, dy);
      const ux = dx / len;
      const uy = dy / len;
      for (let d = phase; d < len; d += spacing) {
        const px = ax + ux * d;
        const py = ay + uy * d;
        ctx.beginPath();
        ctx.moveTo(px - ux * 4 - uy * 6, py - uy * 4 + ux * 6);
        ctx.lineTo(px + ux * 2, py + uy * 2);
        ctx.lineTo(px - ux * 4 + uy * 6, py - uy * 4 - ux * 6);
        ctx.stroke();
      }
    }
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';

    // Клетки без башен: пульсирующий магический нарост (public/tiles/blocked), пока он грузится — тёмная штриховка
    if (this.currentMap.blocked?.length && !this.mapEdit) {
      for (const c of this.currentMap.blocked) {
        if (!this.drawGrowth(ctx, c, cellSize, timeSec)) this.hatchCell(ctx, c, cellSize, 'rgba(0, 0, 0, 0.32)', 'rgba(224, 69, 47, 0.35)');
      }
    }

    // 3. Gates at entrances and the castle
    for (const e of this.currentMap.entrances) {
      this.renderGate(ctx, e, cellSize, palette.light, timeSec);
    }
    this.renderCastle(ctx, cellSize, palette.light, timeSec);

    // 4. Grass blades (swaying gently)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.lineWidth = 1.5;
    for (const g of baked || waiting || hexGround ? [] : this.grassBlades) {
      const sway = Math.sin(timeSec * 2.5 + g.phase) * 3 + g.bendOffset;
      ctx.beginPath();
      ctx.moveTo(g.x, g.y);
      ctx.quadraticCurveTo(g.x + sway * 0.5, g.y - g.height * 0.5, g.x + sway, g.y - g.height);
      ctx.stroke();
    }

    // 5. Eligible merge highlight & range preview
    const selectedTower = this.selectedTowerId ? this.towers.find((t) => t.id === this.selectedTowerId) : null;

    if (selectedTower) {
      // Highlight eligible merge towers, or bind partners while binding
      if (this.bindingFromId === selectedTower.id) {
        const pulse = 0.55 + 0.45 * Math.sin(timeSec * 6);
        ctx.strokeStyle = CONFIG.binder.color;
        ctx.globalAlpha = pulse;
        ctx.lineWidth = 3;
        for (const el of this.getBindPartners(selectedTower)) {
          this.cellShape(ctx, 'stroke', el, 2);
        }
        ctx.globalAlpha = 1;
      } else {
        const eligible = this.getEligibleMergeTowers(selectedTower);
        ctx.strokeStyle = '#f4c06a';
        ctx.lineWidth = 2.5;
        for (const el of eligible) {
          this.cellShape(ctx, 'stroke', el, 2);
        }
      }

      // Attack range circle of each part of the selected tower
      const parts: TowerPart[] = towerParts(selectedTower);
      for (const part of parts) {
        const rangePx = attackStats(part.type, part.level, part.specs).range * this.towerMods(selectedTower).range * cellSize;
        ctx.fillStyle = 'rgba(244, 192, 106, 0.09)';
        ctx.strokeStyle = part === selectedTower ? 'rgba(244, 192, 106, 0.45)' : 'rgba(62, 214, 196, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(centerX(selectedTower), centerY(selectedTower), rangePx, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    if (this.castleSelected) {
      // Reach of the artifact's defence
      ctx.fillStyle = 'rgba(127, 214, 224, 0.08)';
      ctx.strokeStyle = 'rgba(127, 214, 224, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(castleX(), castleY(), CONFIG.siege.guard.radius * cellSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Between waves the selected tower can move: free cells are marked, the hovered one shows the target
    if (selectedTower && !this.bindingFromId && this.moveCost() !== null) {
      ctx.fillStyle = 'rgba(244, 192, 106, 0.045)';
      for (let y = 0; y < CONFIG.grid.rows; y++) {
        for (let x = 0; x < CONFIG.grid.cols; x++) {
          if (this.isCellFree(x, y)) this.cellShape(ctx, 'fill', { x, y }, 6);
        }
      }
      const h = this.hoverCell;
      if (h && selectedTower.extra) {
        // a multi-cell tower: show every cell it would take, red if it does not fit
        const fits = this.moveFits(h);
        const foot = this.moveFootprint(selectedTower, h, this.moveGrab);
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = fits ? '#f4c06a' : '#e0452f';
        ctx.lineWidth = 2;
        for (const c of foot) if (c.x >= 0 && c.x < CONFIG.grid.cols && c.y >= 0 && c.y < CONFIG.grid.rows) this.cellShape(ctx, 'stroke', c, 3);
        ctx.setLineDash([]);
      } else if (h && this.isCellFree(h.x, h.y)) {
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = '#f4c06a';
        ctx.lineWidth = 2;
        this.cellShape(ctx, 'stroke', h, 3);
        ctx.setLineDash([]);
      }
    }

    const selectedBinder = this.selectedBinderId ? this.binders.find((b) => b.id === this.selectedBinderId) : null;
    if (selectedBinder) {
      ctx.strokeStyle = CONFIG.binder.color;
      ctx.lineWidth = 2.5;
      this.cellShape(ctx, 'stroke', selectedBinder, 2);
      // Merging: the binders that would join; raising: the towers it can raise
      const marks: { x: number; y: number }[] = this.upgradingFromBinderId
        ? this.getUpgradeTargets()
        : this.canMergeBinders()
          ? this.nearest(this.plainBinders().filter((b) => b !== selectedBinder), selectedBinder).slice(0, 2)
          : [];
      const pulse = 0.55 + 0.45 * Math.sin(timeSec * 6);
      ctx.strokeStyle = this.upgradingFromBinderId ? '#f4c06a' : CONFIG.binder.color;
      ctx.globalAlpha = this.upgradingFromBinderId ? pulse : 0.6;
      ctx.lineWidth = 3;
      for (const m of marks) this.cellShape(ctx, 'stroke', m, 2);
      ctx.globalAlpha = 1;
    }

    // Hypertower: the cells picked so far and the ones that can still be picked
    if (this.hyperPlan) {
      const pulse = 0.5 + 0.5 * Math.sin(timeSec * 5);
      for (let y = 0; y < CONFIG.grid.rows; y++)
        for (let x = 0; x < CONFIG.grid.cols; x++) {
          if (this.hyperPlan.cells.some((c) => c.x === x && c.y === y)) {
            ctx.fillStyle = 'rgba(159, 216, 245, 0.45)';
            this.cellShape(ctx, 'fill', { x, y }, 2);
          } else if (this.hyperCellValid(x, y)) {
            ctx.strokeStyle = '#9fd8f5';
            ctx.globalAlpha = 0.35 + 0.4 * pulse;
            ctx.lineWidth = 2;
            this.cellShape(ctx, 'stroke', { x, y }, 4);
            ctx.globalAlpha = 1;
          }
        }
    }

    // 6. Placement preview when placing a tower or a binder
    if (this.placingBinder && this.hoverCell) {
      const { x: hx, y: hy } = this.hoverCell;
      const isFree = this.isCellFree(hx, hy);
      ctx.fillStyle = isFree ? 'rgba(62, 214, 196, 0.22)' : 'rgba(224, 69, 47, 0.28)';
      this.cellShape(ctx, 'fill', this.hoverCell, 0);
      ctx.strokeStyle = isFree ? CONFIG.binder.color : '#e0452f';
      ctx.lineWidth = 2;
      this.cellShape(ctx, 'stroke', this.hoverCell, 1);
    }
    if (this.placingTowerType && this.hoverCell) {
      const hx = this.hoverCell.x;
      const hy = this.hoverCell.y;
      const isFree = this.isCellFree(hx, hy);

      ctx.fillStyle = isFree ? 'rgba(143, 163, 74, 0.28)' : 'rgba(224, 69, 47, 0.28)';
      this.cellShape(ctx, 'fill', this.hoverCell, 0);
      ctx.strokeStyle = isFree ? '#8fa34a' : '#e0452f';
      ctx.lineWidth = 2;
      this.cellShape(ctx, 'stroke', this.hoverCell, 1);

      // Draw tower range preview
      const baseDef = CONFIG.towers[this.placingTowerType];
      const rangePx = baseDef.range * cellSize;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.beginPath();
      ctx.arc(centerX(this.hoverCell), centerY(this.hoverCell), rangePx, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    if (this.race !== 'humans') this.renderRaceGround(ctx, cellSize, timeSec);

    // 7. Render Towers
    // Sorted by y so lower figures overlap the ones behind them; flyers on top
    // Binders, towers and the castle sprite share one depth order (castle and binders before towers of their row)
    const figures: { y: number; draw: () => void }[] = [
      { y: CONFIG.grid.castleCells[0].y - 0.2, draw: () => this.upright(ctx, castleX(), castleY(), () => this.renderCastleFigure(ctx, cellSize, timeSec)) },
      ...this.binders.map((b) => ({ y: b.y - 0.1, draw: () => this.upright(ctx, centerX(b), centerY(b), () => this.renderBinder(ctx, b, cellSize, timeSec)) })),
      ...this.towers.map((t) => ({ y: t.y, draw: () => this.upright(ctx, centerX(t), centerY(t), () => this.renderTower(ctx, t, cellSize, timeSec)) })),
    ];
    figures.sort((a, b) => a.y - b.y);
    for (const f of figures) f.draw();

    // 8. Render Enemies
    this.renderCorpses(ctx, timeSec);
    const enemiesByDepth = [...this.enemies].sort((a, b) => Number(a.isFlyer) - Number(b.isFlyer) || a.y - b.y);
    for (const e of enemiesByDepth) {
      this.upright(ctx, e.x, e.y, () => this.renderEnemy(ctx, e, CONFIG.palettes[e.faction - 1].enemies, timeSec));
    }

    if (this.race !== 'humans') this.renderRaceAir(ctx, cellSize, timeSec);

    // 9. Render Projectiles
    for (const p of this.projectiles) {
      this.renderProjectile(ctx, p);
    }

    // 10. Render Particles
    for (const p of this.particles) {
      if (!p.active) continue;
      if (p.type === 'ring') {
        const rad = p.size + (p.life / p.maxLife) * p.grow;
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // 11. Render Floating Texts
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    for (const ft of this.floatingTexts) {
      const alpha = Math.max(0, 1 - ft.life / ft.maxLife);
      if (isHex()) {
        ctx.save();
        ctx.translate(ft.x, ft.y);
        ctx.scale(1, 1 / hexView.squash);
        ctx.translate(-ft.x, -ft.y);
      }
      ctx.fillStyle = `rgba(0, 0, 0, ${alpha * 0.8})`;
      ctx.fillText(ft.text, ft.x + 1, ft.y + 1);
      ctx.fillStyle = ft.color;
      ctx.globalAlpha = alpha;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.globalAlpha = 1;
      if (isHex()) ctx.restore();
    }
  }

  /** Запечённое поле из тайлов для текущей карты; null, пока тайлы грузятся или набора нет */
  private tiledField(): HTMLCanvasElement | null {
    const set = TILESETS[this.currentMap.level];
    this.tilesPending = false;
    if (!set) return null;
    if (this.fieldBakeMap === this.currentMap && this.fieldBake) return this.fieldBake;
    const tiles = this.fieldTiles.get(set);
    if (tiles === undefined) {
      if (performance.now() < this.tilesRetryAt) return null;
      this.fieldTiles.set(set, null);
      this.tilesPending = true;
      loadTileset(set).then((t) => {
        if (t) this.fieldTiles.set(set, t);
        else {
          this.fieldTiles.delete(set);
          this.tilesRetryAt = performance.now() + 15000;
        }
        this.fieldBake = null;
        this.fieldBakeMap = null;
      });
      return null;
    }
    if (!tiles) {
      this.tilesPending = true;
      return null;
    }
    this.fieldBake = bakeField(set, tiles, this.currentMap.paths, CONFIG.grid.castleCells, CONFIG.grid.cols, CONFIG.grid.rows);
    this.fieldBakeMap = this.currentMap;
    return this.fieldBake;
  }

  /** Слой мелкого декора для карты без тайлов; null, пока грузится или набора нет */
  private decorLayer(): HTMLCanvasElement | null {
    const set = DECOR_ONLY[this.currentMap.level];
    if (!set) return null;
    if (this.decorBakeMap === this.currentMap && this.decorBake) return this.decorBake;
    const imgs = this.decorSets.get(set);
    if (imgs === undefined) {
      this.decorSets.set(set, null);
      loadDecor(set).then((t) => this.decorSets.set(set, t));
      return null;
    }
    if (!imgs) return null;
    this.decorBake = bakeDecor(set, imgs, this.currentMap.paths, CONFIG.grid.castleCells, CONFIG.grid.cols, CONFIG.grid.rows);
    this.decorBakeMap = this.currentMap;
    return this.decorBake;
  }

  private strokeRoad(ctx: CanvasRenderingContext2D, color: string, width: number) {
    const cellSize = CONFIG.grid.cellSize;
    const radius = cellSize * 0.5;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'butt';
    for (const pts of this.roadLines) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x * cellSize, pts[0].y * cellSize);
      for (let i = 1; i < pts.length - 1; i++) {
        ctx.arcTo(pts[i].x * cellSize, pts[i].y * cellSize, pts[i + 1].x * cellSize, pts[i + 1].y * cellSize, radius);
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last.x * cellSize, last.y * cellSize);
      ctx.stroke();
    }
    ctx.lineJoin = 'miter';
  }

  /** Магические наросты закрытых клеток: 4 варианта, грузятся один раз */
  private static growthImgs: HTMLImageElement[] | null = null;

  /** Нарост на закрытой клетке: вариант по координатам, бирюзовый ореол и яркость дышат (у каждой клетки своя фаза).
   *  false — картинки ещё не загрузились */
  private drawGrowth(ctx: CanvasRenderingContext2D, c: Point, cellSize: number, timeSec: number): boolean {
    if (!GameEngine.growthImgs) {
      GameEngine.growthImgs = [1, 2, 3, 4].map((i) => {
        const img = new Image();
        img.src = `tiles/blocked/growth${i}.png`;
        return img;
      });
    }
    const img = GameEngine.growthImgs[(c.x * 7 + c.y * 3) % 4];
    if (!img.complete || !img.naturalWidth) return false;
    const cx = centerX(c);
    const cy = centerY(c);
    const pulse = 0.5 + 0.5 * Math.sin(timeSec * 2.2 + c.x * 1.3 + c.y * 0.7);
    const halo = ctx.createRadialGradient(cx, cy, cellSize * 0.1, cx, cy, cellSize * 0.62);
    halo.addColorStop(0, `rgba(110, 240, 235, ${0.22 + 0.2 * pulse})`);
    halo.addColorStop(1, 'rgba(110, 240, 235, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(cx - cellSize * 0.62, cy - cellSize * 0.62, cellSize * 1.24, cellSize * 1.24);
    const size = cellSize * 0.98;
    ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
    // Вспышка: тот же рисунок поверх в режиме сложения, его сила дышит
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.28 * pulse;
    ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
    ctx.restore();
    return true;
  }

  private hatchCell(ctx: CanvasRenderingContext2D, c: Point, cellSize: number, fill: string, line: string) {
    const x0 = centerX(c) - cellSize / 2;
    const y0 = centerY(c) - cellSize / 2;
    ctx.fillStyle = fill;
    ctx.fillRect(x0, y0, cellSize, cellSize);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, cellSize, cellSize);
    ctx.clip();
    ctx.strokeStyle = line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let d = -cellSize; d < cellSize; d += cellSize / 4) {
      ctx.moveTo(x0 + d, y0 + cellSize);
      ctx.lineTo(x0 + d + cellSize, y0);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** Редактор карты: черновик поверх затемнённого поля — дорога, выходы с номерами, клетки без башен, ошибки красным */
  private renderMapEdit(ctx: CanvasRenderingContext2D) {
    const e = this.mapEdit!;
    const cs = CONFIG.grid.cellSize;
    const palette = CONFIG.palettes[e.level - 1];
    const timeSec = performance.now() / 1000;
    ctx.fillStyle = 'rgba(10, 8, 16, 0.82)';
    ctx.fillRect(0, 0, CONFIG.grid.totalWidth, CONFIG.grid.totalHeight);
    // сетка
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < CONFIG.grid.cols; x++) {
      ctx.moveTo(x * cs, 0);
      ctx.lineTo(x * cs, CONFIG.grid.totalHeight);
    }
    for (let y = 1; y < CONFIG.grid.rows; y++) {
      ctx.moveTo(0, y * cs);
      ctx.lineTo(CONFIG.grid.totalWidth, y * cs);
    }
    ctx.stroke();
    const at = (k: string) => ({ x: Number(k.split(',')[0]), y: Number(k.split(',')[1]) });
    const roadFill = mixColor(palette.road, '#ffffff', 0.2);
    for (const k of e.road) {
      const c = at(k);
      ctx.fillStyle = roadFill;
      this.cellShape(ctx, 'fill', c, 3);
    }
    for (const k of e.blocked) this.hatchCell(ctx, at(k), cs, 'rgba(224, 69, 47, 0.12)', 'rgba(224, 69, 47, 0.6)');
    const check = this.mapEditCheck;
    // путь каждого выхода — пунктир от выхода к артефакту
    if (check) {
      const paths = check.map?.paths ?? [];
      ctx.strokeStyle = 'rgba(244, 192, 106, 0.55)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.lineDashOffset = -timeSec * 20;
      for (const p of paths) {
        ctx.beginPath();
        p.forEach((c, i) => (i ? ctx.lineTo(centerX(c), centerY(c)) : ctx.moveTo(centerX(c), centerY(c))));
        ctx.lineTo(castleX(), castleY());
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
      ctx.strokeStyle = '#e0452f';
      ctx.lineWidth = 3;
      for (const c of [...check.unused, ...check.broken]) this.cellShape(ctx, 'stroke', c, 4);
    }
    // артефакт
    const cc = CONFIG.grid.castleCells[0];
    ctx.fillStyle = 'rgba(127, 214, 224, 0.35)';
    this.cellShape(ctx, 'fill', cc, 3);
    ctx.fillStyle = '#e8fbff';
    ctx.font = `700 ${Math.round(cs * 0.22)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Артефакт', centerX(cc), centerY(cc));
    // выходы
    e.exits.forEach((c, i) => {
      const cx = centerX(c);
      const cy = centerY(c);
      ctx.fillStyle = check?.broken.some((b) => b.x === c.x && b.y === c.y) ? '#e0452f' : '#c0392b';
      ctx.beginPath();
      ctx.arc(cx, cy, cs * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffd9a0';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `900 ${Math.round(cs * 0.3)}px system-ui, sans-serif`;
      ctx.fillText(String(i + 1), cx, cy + 1);
    });
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    const h = this.hoverCell;
    if (h) {
      ctx.strokeStyle = '#f4c06a';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      this.cellShape(ctx, 'stroke', h, 2);
      ctx.setLineDash([]);
    }
  }

  private renderGate(ctx: CanvasRenderingContext2D, e: Point, cellSize: number, light: string, timeSec: number) {
    const dir = this.entranceInward(e);
    // Gate sits on the field edge, facing inward
    const gx = (e.x + 0.5 - dir.x * 0.5) * cellSize;
    const gy = (e.y + 0.5 - dir.y * 0.5) * cellSize;
    ctx.save();
    ctx.translate(gx, gy);
    ctx.rotate(Math.atan2(dir.y, dir.x));

    const half = cellSize / 2;
    // Pillars
    for (const side of [-1, 1]) {
      const py = side * (half - 7);
      ctx.fillStyle = '#121118';
      ctx.fillRect(-1, py - 8, 14, 16);
      ctx.fillStyle = '#5b5466';
      ctx.fillRect(0, py - 7, 12, 14);
      ctx.fillStyle = '#7a7287';
      ctx.fillRect(0, py - 7, 12, 3);
    }
    // Lintel shadow across the passage
    ctx.fillStyle = 'rgba(18, 17, 24, 0.55)';
    ctx.fillRect(0, -half + 14, 5, cellSize - 28);

    // Inward arrow: bright during the first 2 s of the level, then a calm pulse
    const sinceStart = (performance.now() - this.levelStartTime) / 1000;
    const intro = sinceStart < 2;
    const alpha = intro ? 0.75 + 0.25 * Math.sin(timeSec * 12) : 0.3 + 0.12 * Math.sin(timeSec * 3);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = light;
    if (intro) {
      ctx.shadowColor = light;
      ctx.shadowBlur = 14;
    }
    ctx.beginPath();
    ctx.moveTo(30, 0);
    ctx.lineTo(18, -9);
    ctx.lineTo(18, 9);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private renderCastle(ctx: CanvasRenderingContext2D, cellSize: number, light: string, timeSec: number) {
    const c = CONFIG.grid.castleCells[0];
    const x0 = centerX(c) - cellSize / 2;
    const y0 = centerY(c) - cellSize / 2;
    const cx = x0 + cellSize / 2;
    const cy = y0 + cellSize / 2;

    // Glow halo
    const halo = ctx.createRadialGradient(cx, cy, cellSize * 0.3, cx, cy, cellSize * 0.95);
    halo.addColorStop(0, light);
    halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.globalAlpha = 0.35 + 0.08 * Math.sin(timeSec * 2);
    ctx.fillStyle = halo;
    ctx.fillRect(x0 - cellSize / 2, y0 - cellSize / 2, cellSize * 2, cellSize * 2);
    ctx.globalAlpha = 1;

    // The castle sprite stands with the towers (renderCastleFigure); here only its ground shadow
    if (sprites.has('castle')) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 22, 34, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    // Keep: square wall with corner towers
    ctx.fillStyle = '#121118';
    ctx.fillRect(x0 + 3, y0 + 3, cellSize - 6, cellSize - 6);
    ctx.fillStyle = '#4b3f5c';
    ctx.fillRect(x0 + 5, y0 + 5, cellSize - 10, cellSize - 10);
    ctx.fillStyle = '#6a5a80';
    for (let bx = x0 + 9; bx < x0 + cellSize - 9; bx += 10) {
      ctx.fillRect(bx, y0 + 5, 6, 5);
      ctx.fillRect(bx, y0 + cellSize - 10, 6, 5);
    }
    for (const [tx, ty] of [
      [x0 + 2, y0 + 2],
      [x0 + cellSize - 16, y0 + 2],
      [x0 + 2, y0 + cellSize - 16],
      [x0 + cellSize - 16, y0 + cellSize - 16],
    ]) {
      ctx.fillStyle = '#121118';
      ctx.fillRect(tx, ty, 14, 14);
      ctx.fillStyle = '#7a6894';
      ctx.fillRect(tx + 1, ty + 1, 12, 12);
    }

    // Gates on the sides where roads arrive
    for (const path of this.currentMap.paths) {
      const end = path[path.length - 1];
      const dx = end.x - c.x;
      const dy = end.y - c.y;
      const gx = cx + dx * (cellSize / 2 - 4);
      const gy = cy + dy * (cellSize / 2 - 4);
      ctx.fillStyle = light;
      ctx.fillRect(gx - 9 - Math.abs(dy) * 2, gy - 9 - Math.abs(dx) * 2, 18 + Math.abs(dy) * 4, 18 + Math.abs(dx) * 4);
      ctx.fillStyle = '#120f18';
      ctx.fillRect(gx - 7 - Math.abs(dy) * 2, gy - 7 - Math.abs(dx) * 2, 14 + Math.abs(dy) * 4, 14 + Math.abs(dx) * 4);
    }

    // Central tower with a banner
    ctx.fillStyle = '#121118';
    ctx.fillRect(cx - 11, cy - 11, 22, 22);
    ctx.fillStyle = '#5a4b6e';
    ctx.fillRect(cx - 10, cy - 10, 20, 20);
    ctx.strokeStyle = '#2a2233';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy - 30);
    ctx.stroke();
    const wave = Math.sin(timeSec * 4) * 3;
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 30);
    ctx.quadraticCurveTo(cx + 9, cy - 26 + wave, cx + 18, cy - 24);
    ctx.lineTo(cx, cy - 18);
    ctx.closePath();
    ctx.fill();
  }

  // Castle sprite (public/sprites/castle.png), drawn in depth order with the towers; larger than its cell
  private renderCastleFigure(ctx: CanvasRenderingContext2D, cellSize: number, timeSec: number) {
    const spr = sprites.get('castle');
    if (!spr) return;
    const c = CONFIG.grid.castleCells[0];
    const breath = Math.sin(timeSec * 1.6) * 0.008;
    drawSprite(ctx, spr, centerX(c), centerY(c) + 30, 1, undefined, { sy: 1 + breath });
    this.renderBoonOrbs(ctx, cellSize, timeSec);
  }

  /** Усиления артефакта: a violet orb per boon circles the artifact */
  private renderBoonOrbs(ctx: CanvasRenderingContext2D, cellSize: number, timeSec: number) {
    const n = this.boons.length;
    if (n === 0) return;
    const c = CONFIG.grid.castleCells[0];
    const cx = centerX(c);
    const cy = centerY(c);
    for (let i = 0; i < n; i++) {
      const a = timeSec * 0.8 + (i / n) * Math.PI * 2;
      const x = cx + Math.cos(a) * cellSize * 0.62;
      const y = cy + Math.sin(a) * cellSize * 0.26;
      const r = 3.2 + 0.6 * Math.sin(timeSec * 3 + i);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.4);
      g.addColorStop(0, 'rgba(232, 214, 255, 0.95)');
      g.addColorStop(0.4, 'rgba(178, 120, 255, 0.7)');
      g.addColorStop(1, 'rgba(120, 60, 220, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r * 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // -------------------------------------------------------------
  // Entity Drawing
  // -------------------------------------------------------------
  // «Связка»: stone plinth with two interlocked rings slowly turning
  private renderBinder(ctx: CanvasRenderingContext2D, b: Binder, cellSize: number, timeSec: number) {
    const cx = centerX(b);
    const cy = centerY(b);
    const color = CONFIG.binder.color;
    // Sprite: a crystal pillar (plain) or a crystal crown (triple) over a pulsing glow
    const spr = sprites.get(b.triple ? 'binder_triple' : 'binder');
    if (spr) {
      const pulse = 0.5 + 0.5 * Math.sin(timeSec * 3 + b.x);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 25, 20, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      const r = b.triple ? 30 : 24;
      const g = ctx.createRadialGradient(cx, cy + 4, 2, cx, cy + 4, r);
      g.addColorStop(0, `rgba(62, 214, 196, ${(b.triple ? 0.4 : 0.28) + 0.2 * pulse})`);
      g.addColorStop(1, 'rgba(62, 214, 196, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy + 4, r, 0, Math.PI * 2);
      ctx.fill();
      const breath = Math.sin(timeSec * 2 + b.x * 1.3 + b.y) * 0.015;
      drawSprite(ctx, spr, cx, cy + 29, 1, undefined, { sy: 1 + breath });
      return;
    }
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 22, 22, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b2838';
    ctx.strokeStyle = '#121118';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 14, cy + 22);
    ctx.lineTo(cx - 10, cy + 6);
    ctx.lineTo(cx + 10, cy + 6);
    ctx.lineTo(cx + 14, cy + 22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    const glow = 0.6 + 0.4 * Math.sin(timeSec * 3 + b.x);
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 10 * glow;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    const turn = timeSec * 0.8;
    if (b.triple) {
      // Three interlocked rings slowly turning, a brighter glow
      ctx.shadowBlur = 16 * glow;
      for (let i = 0; i < 3; i++) {
        const a = turn + (i * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.ellipse(cx + Math.cos(a) * 6, cy - 9 + Math.sin(a) * 4, 9, 12, a * 0.4, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else {
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(cx + side * 6, cy - 8, 10, 13, turn * side * 0.3, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
    ctx.fillStyle = color;
    ctx.globalAlpha = glow;
    ctx.beginPath();
    ctx.arc(cx, cy - 8, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Each level has its own figure (public/sprites/tower_<type>_<level>.png)
  // Towers of the playable factions use a unit of their faction for now (lore/faction-towers-table.md, part 4);
  // a missing faction figure falls back to the common one tinted in the faction's color
  private towerSprite(type: TowerType, level: number): PreparedSprite | null {
    const def = CONFIG.towers[type];
    const drawn = this.ownTowerSprite(type, level);
    if (drawn) return drawn;
    if (def.sprite) {
      const own = sprites.get(def.sprite);
      if (own) return own;
      const base = def.sprite.replace(/_\d+$/, '');
      return sprites.get(base, CONFIG.palettes[CONFIG.races[def.race!].faction - 1].enemies);
    }
    return sprites.get(`tower_${type}_${level}`) ?? sprites.get(`tower_${type}_1`);
  }

  /** A race tower's own figure (tower_<type>_<1..3>, art/concepts/towers-<race>); levels above 3 reuse the third */
  private ownTowerSprite(type: TowerType, level: number): PreparedSprite | null {
    return sprites.get(`tower_${type}_${Math.min(3, level)}`);
  }

  /** Field height of a faction tower's unit figure: a little taller each level; undefined keeps sprites.json */
  private towerDrawH(type: TowerType, level: number): number | undefined {
    return CONFIG.towers[type].sprite && !this.ownTowerSprite(type, level) ? 46 + 7 * (Math.min(3, level) - 1) + 3 * Math.max(0, level - 3) : undefined;
  }

  // Stone pedestal under a faction tower so the unit figure reads as a tower, not as an enemy
  private drawPedestal(ctx: CanvasRenderingContext2D, t: Tower, cx: number, footY: number, timeSec: number) {
    const def = CONFIG.towers[t.type];
    ctx.fillStyle = '#2a2632';
    ctx.beginPath();
    ctx.ellipse(cx, footY - 2, 21, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = def.color;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;
    if ((t.abilityLeft ?? 0) > 0) {
      const pulse = 0.5 + 0.5 * Math.sin(timeSec * 10);
      ctx.strokeStyle = '#ff7a3a';
      ctx.globalAlpha = 0.5 + 0.5 * pulse;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(cx, footY - 2, 25, 10, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (t.abilityCd !== undefined && this.abilityReady(t) && this.gold >= (def.ability?.cost ?? 0)) {
      // A ready ability: a small flame mark at the foot
      ctx.fillStyle = '#ff7a3a';
      ctx.beginPath();
      ctx.arc(cx - 20, footY - 4, 3 + Math.sin(timeSec * 6), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private renderTower(ctx: CanvasRenderingContext2D, t: Tower, cellSize: number, timeSec: number) {
    const spr = this.towerSprite(t.type, t.level);
    if (spr) this.renderTowerSprite(ctx, t, cellSize, spr, timeSec);
    else this.renderTowerShape(ctx, t, cellSize);
    this.renderCritCharge(ctx, t, cellSize);
  }

  // Тёмные эльфы: тонкая полоска у основания башни — шанс крита растёт слева направо и обнуляется выстрелом-критом
  private renderCritCharge(ctx: CanvasRenderingContext2D, t: Tower, cellSize: number) {
    if (t.critT === undefined) return;
    const k = Math.min(1, t.critT / CONFIG.raceMech.critFull);
    const w = cellSize * 0.56;
    const x = centerX(t) - w / 2;
    const y = (t.y + 1) * cellSize - 5;
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(x - 1, y - 1, w + 2, 5);
    ctx.fillStyle = k >= 1 ? '#fff3b0' : '#3ed6c4';
    ctx.fillRect(x, y, w * k, 3);
    ctx.restore();
  }

  // Idle breathing plus a short squash and lean back after each shot
  private towerPose(t: Tower, part: TowerPart, timeSec: number): SpritePose {
    const breath = Math.sin(timeSec * 2.2 + t.x * 1.7 + t.y * 2.3) * 0.012;
    const since = part.shotAt === undefined ? 1 : timeSec - part.shotAt;
    const k = since < 0.18 ? 1 - since / 0.18 : 0;
    return { sy: 1 + breath - 0.07 * k, sx: 1 + 0.04 * k, tilt: -t.facing * 0.05 * k };
  }

  // Dark figures (Archer, Mage) get a light rim around the pedestal so they read on dark maps
  private drawBaseRim(ctx: CanvasRenderingContext2D, type: TowerType, x: number, footY: number, k: number) {
    const rim = TOWER_RIMS[type];
    if (!rim) return;
    const rx = 19 * k;
    const ry = 7 * k;
    const y = footY - 6 * k;
    const g = ctx.createRadialGradient(x, y, rx * 0.4, x, y, rx * 1.35);
    g.addColorStop(0, `rgba(${rim}, 0.32)`);
    g.addColorStop(1, `rgba(${rim}, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, rx * 1.35, ry * 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(${rim}, 0.7)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Binding between the two figures of a pair: glowing bases and a small pulsing crystal between them.
  // `power` 0..1 grows with the levels of both parts.
  private drawBond(
    ctx: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    power: number,
    timeSec: number,
    layer: 'back' | 'front'
  ) {
    const color = CONFIG.binder.color;
    const pulse = 0.5 + 0.5 * Math.sin(timeSec * (3 + power * 2));
    ctx.save();
    ctx.shadowColor = color;
    if (layer === 'back') {
      // Glow under both pedestals
      for (const [x, y] of [[x1, y1], [x2, y2]]) {
        const g = ctx.createRadialGradient(x, y - 4, 2, x, y - 4, 18);
        g.addColorStop(0, `rgba(62, 214, 196, ${0.35 + 0.35 * power})`);
        g.addColorStop(1, 'rgba(62, 214, 196, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(x, y - 4, 18, 8, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      return;
    }
    // Pulsing crystal between the pedestals
    const midX = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2 - 7 - pulse;
    const h = 3.5 + power * 1.5;
    const w = 2 + power;
    ctx.shadowBlur = 5 + 8 * power * pulse;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(midX, cy - h);
    ctx.lineTo(midX + w, cy);
    ctx.lineTo(midX, cy + h * 0.7);
    ctx.lineTo(midX - w, cy);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(230, 255, 251, 0.85)';
    ctx.beginPath();
    ctx.moveTo(midX, cy - h * 0.8);
    ctx.lineTo(midX + w * 0.35, cy - h * 0.15);
    ctx.lineTo(midX - w * 0.35, cy - h * 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private renderTowerSprite(ctx: CanvasRenderingContext2D, t: Tower, cellSize: number, spr: PreparedSprite, timeSec: number) {
    // A megatower П stands between its two cells
    const nCells = 1 + (t.extra?.length ?? 0);
    const cx = (centerX(t) + (t.extra ?? []).reduce((a, c) => a + centerX(c), 0)) / nCells;
    const cy = (centerY(t) + (t.extra ?? []).reduce((a, c) => a + centerY(c), 0)) / nCells;
    const baseDef = CONFIG.towers[t.type];
    const ringY = cy + 22;
    const footY = cy + 30;

    // Ground shadow, level 3 glow, back half of level rings
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 25, 25, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    if (t.level >= 3 && !t.second) {
      ctx.fillStyle = baseDef.color;
      ctx.globalAlpha = 0.28;
      ctx.beginPath();
      ctx.ellipse(cx, cy - 4, 28, 34, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    const rings = (from: number, to: number) => {
      ctx.strokeStyle = '#f4c06a';
      if (t.level >= 2) {
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(cx, ringY, 27, 10, 0, from, to);
        ctx.stroke();
      }
      if (t.level >= 3) {
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(cx, ringY, 31, 12, 0, from, to);
        ctx.stroke();
      }
      // Нежить reaches Ур.5: a ring more for each level past 3
      for (let l = 4; l <= t.level; l++) {
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(cx, ringY, 31 + 4 * (l - 3), 12 + 2 * (l - 3), 0, from, to);
        ctx.stroke();
      }
    };
    rings(Math.PI, Math.PI * 2);

    if (t.second) {
      // Two single figures at full size on a diagonal: the main one behind and higher, the second in front and lower
      const x1 = cx - 13;
      const y1 = footY - 14;
      const x2 = cx + 13;
      const y2 = footY;
      const spr2 = this.towerSprite(t.second.type, t.second.level);
      const power = (t.level + t.second.level - 2) / 4;
      this.drawBond(ctx, x1, y1, x2, y2, power, timeSec, 'back');
      this.drawBaseRim(ctx, t.type, x1, y1, 1);
      drawSprite(ctx, spr, x1, y1, t.facing, undefined, this.towerPose(t, t, timeSec));
      this.drawBaseRim(ctx, t.second.type, x2, y2, 1);
      if (spr2) drawSprite(ctx, spr2, x2, y2, t.facing, undefined, this.towerPose(t, t.second, timeSec));
      this.drawBond(ctx, x1, y1, x2, y2, power, timeSec, 'front');
    } else {
      if (baseDef.sprite && !this.ownTowerSprite(t.type, t.level)) this.drawPedestal(ctx, t, cx, footY, timeSec);
      this.drawBaseRim(ctx, t.type, cx, footY, 1);
      if (t.fused) {
        // A megatower: an icy halo and a bigger figure, the badge tells the figures and what it is
        const pulse = 0.5 + 0.5 * Math.sin(timeSec * 2.4);
        ctx.fillStyle = '#9fd8f5';
        ctx.globalAlpha = 0.22 + 0.12 * pulse;
        ctx.beginPath();
        ctx.ellipse(cx, cy - 2, 33, 38, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        // One figure for the whole built tower: the twin altars of the figure's shape (Т, П; a hypertower — of its first)
        const megaSpr = sprites.get(t.extra ? 'mega_P' : 'mega_T') ?? spr;
        const scale = 1;
        drawSprite(ctx, megaSpr, cx, footY + 4, t.facing, megaSpr === spr ? this.towerDrawH(t.type, t.level) : (nCells >= 3 ? 150 : t.extra ? 112 : 96) * scale, this.towerPose(t, t, timeSec));
        this.drawSpecBadge(ctx, t.fused.level !== undefined ? `Гипер Ур.${t.fused.level}` : `Мега ${t.fused.shapes[0] === 'P' ? 'П' : 'Т'}`, cx, cy - 26, cx, cellSize);
      } else drawSprite(ctx, spr, cx, footY, t.facing, this.towerDrawH(t.type, t.level), this.towerPose(t, t, timeSec));
      if (t.souls) this.drawSpecBadge(ctx, `☠${t.souls}`, cx - 18, cy - 22, cx, cellSize);
    }

    // Front half of the rings over the pedestal
    rings(0, Math.PI);

    // A bound tower has a badge for each part, each at the foot of its own figure (staggered like the figures)
    if (t.second) {
      if (t.specs.length > 0) this.drawSpecBadge(ctx, specBadge(t.specs), cx - 14, cy + 14, cx, cellSize);
      if (t.second.specs.length > 0) this.drawSpecBadge(ctx, specBadge(t.second.specs), cx + 18, cy + 27, cx, cellSize);
    } else if (t.specs.length > 0) {
      this.drawSpecBadge(ctx, specBadge(t.specs), cx + 21, cy + 20, cx, cellSize);
    }

    if (t.frozenTimer > 0) {
      ctx.fillStyle = 'rgba(127, 200, 240, 0.45)';
      this.cellShape(ctx, 'fill', t, 2);
      ctx.strokeStyle = '#7fc8f0';
      ctx.lineWidth = 2;
      this.cellShape(ctx, 'stroke', t, 2);
    }
  }

  // Pill with the specialization codes, kept inside the tower's cell (cellMid: the cell's center x)
  private drawSpecBadge(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, cellMid: number, cellSize: number) {
    ctx.font = 'bold 9px sans-serif';
    const w = ctx.measureText(text).width + 8;
    const half = cellSize / 2 - 1;
    const bx = Math.max(cellMid - half + w / 2, Math.min(cellMid + half - w / 2, x));
    ctx.fillStyle = '#121118';
    ctx.beginPath();
    ctx.roundRect(bx - w / 2, y - 7, w, 14, 7);
    ctx.fill();
    ctx.strokeStyle = '#f4c06a';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#f4c06a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx, y + 0.5);
    ctx.textBaseline = 'alphabetic';
  }

  // Fallback figure when the sprite is not loaded
  private renderTowerShape(ctx: CanvasRenderingContext2D, t: Tower, cellSize: number) {
    const cx = centerX(t);
    const cy = centerY(t);
    const baseDef = CONFIG.towers[t.type];

    // Tower base platform
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.arc(cx, cy + 2, 22, 0, Math.PI * 2);
    ctx.fill();

    // Level 3 Glow Accent
    if (t.level >= 3) {
      ctx.shadowColor = baseDef.color;
      ctx.shadowBlur = 12;
    }

    ctx.fillStyle = baseDef.color;
    ctx.strokeStyle = '#121118';
    ctx.lineWidth = 2;

    // Draw Shape
    // Archer: triangle
    if (t.type === 'archer') {
      ctx.beginPath();
      ctx.moveTo(cx, cy - 16);
      ctx.lineTo(cx + 14, cy + 12);
      ctx.lineTo(cx - 14, cy + 12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    // Mage: rhombus
    else if (t.type === 'mage') {
      ctx.beginPath();
      ctx.moveTo(cx, cy - 16);
      ctx.lineTo(cx + 14, cy);
      ctx.lineTo(cx, cy + 16);
      ctx.lineTo(cx - 14, cy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    // Ballista: square with crossbar/plank
    else if (t.type === 'ballista') {
      ctx.beginPath();
      ctx.rect(cx - 12, cy - 12, 24, 24);
      ctx.fill();
      ctx.stroke();
      // Crossbar / plank
      ctx.fillStyle = '#121118';
      ctx.fillRect(cx - 14, cy - 3, 28, 6);
      ctx.fillStyle = '#d9b44a';
      ctx.fillRect(cx - 2, cy - 14, 4, 28);
    }
    // Priest: circle with ring
    else if (t.type === 'priest') {
      ctx.beginPath();
      ctx.arc(cx, cy, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Inner circle
      ctx.strokeStyle = '#121118';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 7, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.shadowBlur = 0; // reset glow

    // Golden Rings for Levels
    // Level 2: one gold ring
    if (t.level >= 2) {
      ctx.strokeStyle = '#f4c06a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 20, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Level 3: second gold ring
    if (t.level >= 3) {
      ctx.strokeStyle = '#f4c06a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, 24, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Bound tower: small disc of the second type's color
    if (t.second) {
      ctx.fillStyle = CONFIG.towers[t.second.type].color;
      ctx.strokeStyle = CONFIG.binder.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx + 16, cy + 14, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Specialization badge (code of each specialization)
    const allSpecs = t.second ? [...t.specs, ...t.second.specs] : t.specs;
    if (allSpecs.length > 0) this.drawSpecBadge(ctx, specBadge(allSpecs), cx, cy, cx, cellSize);

    // Frozen visual tint (Ice Priest Boss ability)
    if (t.frozenTimer > 0) {
      ctx.fillStyle = 'rgba(127, 200, 240, 0.45)';
      this.cellShape(ctx, 'fill', t, 2);
      ctx.strokeStyle = '#7fc8f0';
      ctx.lineWidth = 2;
      this.cellShape(ctx, 'stroke', t, 2);
    }
  }

  // Faction figure (enemy_<type>_<level>) is drawn in its own colors; otherwise the common one gets the faction tint
  private enemySprite(e: Enemy): { name: string; tint: string | null } {
    const isBoss = e.type === 'boss';
    const isImp = e.type === 'imp';
    const factionName = `enemy_${e.type}_${e.faction}`;
    const hasFaction = !isBoss && !isImp && sprites.has(factionName);
    const ownImp = isImp && sprites.has('enemy_imp');
    const name = isBoss ? `boss_${e.faction}` : ownImp ? 'enemy_imp' : isImp ? 'enemy_scout' : hasFaction ? factionName : `enemy_${e.type}`;
    const tint = isBoss ? this.worldBossTint : hasFaction || ownImp ? null : isImp ? '#e0452f' : CONFIG.palettes[e.faction - 1].enemies;
    return { name, tint };
  }

  private enemyFoot(e: Enemy, h: number): number {
    return e.isFlyer ? e.y + 8 : e.y + h * 0.4;
  }

  // Walking: a hop and a lean per step, driven by the path covered (stops when the enemy stops);
  // flyers hover and flap
  private enemyPose(e: Enemy, timeSec: number): SpritePose {
    if (e.attackAnim > 0) {
      // Strike: a quick lean forward and squash
      const k = Math.sin((1 - e.attackAnim / 0.22) * Math.PI);
      return { lift: e.isFlyer ? 3 : 0, tilt: e.facing * 0.22 * k, sx: 1 + 0.06 * k, sy: 1 - 0.06 * k };
    }
    if (e.isFlyer) {
      const ph = timeSec * 7 + e.animSeed;
      return { lift: 3 + Math.sin(ph) * 3, sy: 1 + Math.sin(ph * 2) * 0.05, tilt: Math.sin(ph * 0.5) * 0.05 };
    }
    const g = GAIT[e.type];
    if (!g) return {};
    const ph = (e.distanceTraveled / g.stride) * Math.PI + e.animSeed;
    const step = Math.abs(Math.sin(ph));
    return { lift: step * g.lift, tilt: Math.sin(ph) * g.tilt, sy: 0.97 + 0.03 * step, sx: 1.03 - 0.03 * step };
  }

  // Height of an enemy's figure on the field: drawing only, radii and balance do not change
  // (Артур, 2026-10-26: all figures a little bigger, bosses more)
  private enemyDrawH(e: Enemy, spriteH: number): number {
    return (e.type === 'imp' ? 24 : spriteH) * (e.type === 'boss' ? BOSS_DRAW_SCALE : ENEMY_DRAW_SCALE);
  }

  private addCorpse(e: Enemy) {
    const { name, tint } = this.enemySprite(e);
    const spr = sprites.get(name, tint);
    if (!spr) return;
    const h = this.enemyDrawH(e, spr.meta.drawH);
    if (this.corpses.length >= MAX_CORPSES) this.corpses.shift();
    this.corpses.push({
      name,
      tint,
      x: e.x,
      footY: this.enemyFoot(e, h),
      facing: e.facing,
      h,
      start: performance.now() / 1000,
      duration: e.type === 'boss' ? 0.9 : 0.45,
    });
  }

  // Killed enemies fall over backwards, sink a little and fade out
  private renderCorpses(ctx: CanvasRenderingContext2D, timeSec: number) {
    this.corpses = this.corpses.filter((c) => timeSec - c.start < c.duration);
    for (const c of this.corpses) {
      const spr = sprites.get(c.name, c.tint);
      if (!spr) continue;
      const p = Math.max(0, (timeSec - c.start) / c.duration);
      ctx.globalAlpha = 1 - p * p;
      this.upright(ctx, c.x, c.footY, () =>
        drawSprite(ctx, spr, c.x, c.footY + p * 3, c.facing, c.h, {
          tilt: -c.facing * Math.pow(p, 0.6) * 1.3,
          sy: 1 - 0.15 * p,
        })
      );
    }
    ctx.globalAlpha = 1;
  }

  private renderEnemy(ctx: CanvasRenderingContext2D, e: Enemy, enemyColor: string, timeSec: number) {
    const isBoss = e.type === 'boss';
    const { name, tint } = this.enemySprite(e);
    const variant: SpriteVariant = e.hitFlashTimer > 0 ? 'flash' : e.invulnerableTimer > 0 ? 'shield' : 'normal';
    const spr = sprites.get(name, tint, variant);

    let topY: number;
    if (spr) {
      const h = this.enemyDrawH(e, spr.meta.drawH);
      const footY = this.enemyFoot(e, h);
      const pose = e.isReviving ? {} : this.enemyPose(e, timeSec);
      if (e.isFlyer) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath();
        ctx.ellipse(e.x, e.y + 18, 13, 5, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath();
        ctx.ellipse(e.x, footY - 1, h * 0.3, h * 0.09, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (e.type === 'shaman' && !e.isReviving) {
        ctx.strokeStyle = enemyColor;
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(e.x, footY - 2, 20, 7, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (e.isReviving) ctx.globalAlpha = 0.35;
      if (!e.isReviving) this.renderStatusUnder(ctx, e, footY, h * 0.32, timeSec);
      drawSprite(ctx, spr, e.x, footY, e.facing, h, pose);
      ctx.globalAlpha = 1;
      if (e.isReviving) return;
      if ((e.stunTimer ?? 0) > 0) this.renderHeld(ctx, e, footY, h, timeSec);
      topY = footY - h - (pose.lift ?? 0);
    } else {
      if (!e.isReviving) this.renderStatusUnder(ctx, e, e.y + (isBoss ? 22 : 10), isBoss ? 26 : 13, timeSec);
      if (!this.renderEnemyShape(ctx, e, enemyColor)) return;
      topY = e.y - (isBoss ? 33 : 15);
    }

    // Cursed: a violet rune over the head that pulses while the curse lasts
    if (e.curseTimer > 0) {
      const pulse = 0.75 + 0.25 * Math.sin(timeSec * 8 + e.animSeed);
      const cy = topY - (isBoss || e.hp < e.maxHp ? 16 : 8);
      ctx.save();
      ctx.globalAlpha = Math.min(1, e.curseTimer / 0.5) * pulse;
      ctx.strokeStyle = CURSE_COLOR;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(e.x, cy - 5);
      ctx.lineTo(e.x + 4, cy);
      ctx.lineTo(e.x, cy + 5);
      ctx.lineTo(e.x - 4, cy);
      ctx.closePath();
      ctx.moveTo(e.x - 6, cy);
      ctx.lineTo(e.x + 6, cy);
      ctx.stroke();
      ctx.restore();
    }

    // Health Bar:
    // Always visible for Boss; for others, only after taking damage (hp < maxHp)
    if (isBoss || e.hp < e.maxHp) {
      const barW = isBoss ? 48 : 24;
      const barH = isBoss ? 5 : 3;
      const barX = e.x - barW / 2;
      const barY = topY - barH - 3;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);

      const pct = Math.max(0, Math.min(1, e.hp / e.maxHp));
      ctx.fillStyle = isBoss ? '#e0452f' : '#8fa34a';
      ctx.fillRect(barX, barY, barW * pct, barH);

      // Поход: имя босса над полосой здоровья (Каллен)
      if (isBoss && this.worldBossName) {
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.strokeText(this.worldBossName, e.x, barY - 2);
        ctx.fillStyle = '#f2e9d8';
        ctx.fillText(this.worldBossName, e.x, barY - 2);
      }
    }
  }

  // Held by the hound: the hound at its side; frozen: an icy shell over the figure
  private renderHeld(ctx: CanvasRenderingContext2D, e: Enemy, footY: number, h: number, timeSec: number) {
    if ((e.heldTimer ?? 0) > 0) {
      const hound = sprites.get('enemy_swarm_1') ?? sprites.get('enemy_swarm', '#8fa34a');
      if (hound) drawSprite(ctx, hound, e.x - e.facing * 12, footY + 2, e.facing, 30, { tilt: Math.sin(timeSec * 14) * 0.12 });
      return;
    }
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#bfe8ff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    const w = Math.min(36, h * 0.45);
    ctx.beginPath();
    ctx.moveTo(e.x, footY - h * 0.85);
    ctx.lineTo(e.x + w / 2, footY - h * 0.45);
    ctx.lineTo(e.x + w / 2.4, footY);
    ctx.lineTo(e.x - w / 2.4, footY);
    ctx.lineTo(e.x - w / 2, footY - h * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.8;
    ctx.stroke();
    ctx.restore();
  }

  // Under the feet: an icy ring while slowed, a violet one while cursed
  private renderStatusUnder(ctx: CanvasRenderingContext2D, e: Enemy, footY: number, rx: number, timeSec: number) {
    const poisoned = (e.poisonTimer ?? 0) > 0;
    if (e.slowPercent <= 0 && e.curseTimer <= 0 && !poisoned) return;
    ctx.save();
    ctx.lineWidth = 2;
    if (poisoned) {
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = 'rgba(143, 212, 90, 0.25)';
      ctx.beginPath();
      ctx.ellipse(e.x, footY - 1, rx * 0.8, rx * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (e.slowPercent > 0) {
      ctx.globalAlpha = 0.35 + 0.5 * Math.min(1, e.slowPercent / 0.5);
      ctx.strokeStyle = SLOW_COLOR;
      ctx.fillStyle = 'rgba(143, 212, 255, 0.18)';
      ctx.beginPath();
      ctx.ellipse(e.x, footY - 1, rx, rx * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (e.faction === 3) {
        // Культисты льда режут замедление вдвое: белое пунктирное кольцо поверх голубого — «лёд не берёт»
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = '#f2f8ff';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.ellipse(e.x, footY - 1, rx * 1.12, rx * 0.38, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    if (e.curseTimer > 0) {
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = CURSE_COLOR;
      ctx.setLineDash([4, 3]);
      ctx.lineDashOffset = -timeSec * 12;
      ctx.beginPath();
      ctx.ellipse(e.x, footY - 1, rx * 1.18, rx * 0.4, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Fallback figure when the sprite is not loaded; false while the enemy is reviving
  private renderEnemyShape(ctx: CanvasRenderingContext2D, e: Enemy, enemyColor: string): boolean {
    if (e.isReviving) {
      // Ghostly reviving state
      ctx.fillStyle = 'rgba(201, 214, 176, 0.4)';
      ctx.beginPath();
      ctx.arc(e.x, e.y, 8, 0, Math.PI * 2);
      ctx.fill();
      return false;
    }

    ctx.save();
    ctx.translate(e.x, e.y);

    // Hit flash
    if (e.hitFlashTimer > 0) {
      ctx.fillStyle = '#ffffff';
    } else if (e.invulnerableTimer > 0) {
      ctx.fillStyle = '#3ed6c4';
    } else {
      ctx.fillStyle = enemyColor;
    }

    ctx.strokeStyle = '#121118';
    ctx.lineWidth = 1.5;

    // Boss size multiplier: 2.2x with spikes
    const isBoss = e.type === 'boss';
    const scale = isBoss ? 2.2 : 1;

    // Flyer shadow on ground
    if (e.isFlyer) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      ctx.ellipse(0, 16, 12, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = e.hitFlashTimer > 0 ? '#ffffff' : enemyColor;
    }

    // Draw Shapes:
    // 1. Infantry: circle
    if (e.type === 'infantry') {
      ctx.beginPath();
      ctx.arc(0, 0, 11 * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // 2. Scout: small triangle
    else if (e.type === 'scout' || e.type === 'imp') {
      ctx.beginPath();
      ctx.moveTo(0, -9 * scale);
      ctx.lineTo(8 * scale, 7 * scale);
      ctx.lineTo(-8 * scale, 7 * scale);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    // 3. Heavy: large square
    else if (e.type === 'heavy') {
      const s = 12 * scale;
      ctx.beginPath();
      ctx.rect(-s, -s, s * 2, s * 2);
      ctx.fill();
      ctx.stroke();
    }
    // 4. Flyer: rhombus
    else if (e.type === 'flyer') {
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.lineTo(12, 0);
      ctx.lineTo(0, 12);
      ctx.lineTo(-12, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    // 5. Shaman: circle with ring-aura
    else if (e.type === 'shaman') {
      ctx.beginPath();
      ctx.arc(0, 0, 11 * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Ring-aura
      ctx.strokeStyle = enemyColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 17 * scale, 0, Math.PI * 2);
      ctx.stroke();
    }
    // 6. Swarm: small dots
    else if (e.type === 'swarm') {
      ctx.beginPath();
      ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // 7. Boss: 2.2x with spikes
    else if (isBoss) {
      // Spikes around body
      ctx.fillStyle = '#e0452f';
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * 16 * scale, Math.sin(ang) * 16 * scale);
        ctx.lineTo(Math.cos(ang + 0.2) * 24 * scale, Math.sin(ang + 0.2) * 24 * scale);
        ctx.lineTo(Math.cos(ang - 0.2) * 24 * scale, Math.sin(ang - 0.2) * 24 * scale);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = e.hitFlashTimer > 0 ? '#ffffff' : enemyColor;
      ctx.beginPath();
      ctx.arc(0, 0, 16 * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
    return true;
  }

  // Under the figures: megatower links, burning patches, the cell of a П between its legs
  private renderRaceGround(ctx: CanvasRenderingContext2D, cs: number, timeSec: number) {
    for (const f of this.fires) {
      const a = Math.min(1, f.t / 0.6);
      const g = ctx.createRadialGradient(f.x, f.y, 2, f.x, f.y, f.r);
      g.addColorStop(0, `rgba(255, 140, 50, ${0.55 * a})`);
      g.addColorStop(1, 'rgba(224, 69, 47, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
      if (Math.random() < 0.1) this.spawnSpark(f.x + (Math.random() - 0.5) * f.r, f.y + (Math.random() - 0.5) * f.r, '#ff8a3a');
    }
    const pulse = 0.55 + 0.45 * Math.sin(timeSec * 3);
    const labels = new Map<Tower, Set<string>>();
    for (const m of this.megas) {
      const pts = m.ids.map((id) => this.towers.find((t) => t.id === id)).filter((t): t is Tower => !!t);
      ctx.save();
      ctx.strokeStyle = '#bfe8ff';
      ctx.shadowColor = '#7fc8f0';
      ctx.shadowBlur = 8;
      ctx.globalAlpha = 0.45 + 0.35 * pulse;
      ctx.lineWidth = 3;
      for (const a of pts)
        for (const b of pts)
          if (a.id < b.id && adjacent(a, b)) {
            ctx.beginPath();
            ctx.moveTo(centerX(a), (centerY(a) + (0.75 - 0.5) * CONFIG.grid.cellSize));
            ctx.lineTo(centerX(b), (centerY(b) + (0.75 - 0.5) * CONFIG.grid.cellSize));
            ctx.stroke();
          }
      if (m.shape === 'P') {
        ctx.setLineDash([5, 4]);
        this.cellShape(ctx, 'stroke', m.center, 6);
        ctx.setLineDash([]);
      }
      ctx.restore();
      const c = pts[0];
      if (c) {
        const l = labels.get(c) ?? new Set<string>();
        l.add(m.shape === 'P' ? 'П' : 'Т');
        labels.set(c, l);
      }
    }
    // Overlapping figures share towers: one label per tower listing its figure kinds («ХТ»)
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#d6f0ff';
    for (const [t, l] of labels) ctx.fillText([...l].sort().join(''), centerX(t), (centerY(t) - CONFIG.grid.cellSize / 2 + 10));
  }

  // Over the enemies: imps of the abyss gate and the spheres about to burst
  private renderRaceAir(ctx: CanvasRenderingContext2D, cs: number, timeSec: number) {
    for (const b of this.blasts) {
      const k = 1 - b.t / CONFIG.raceMech.sphereDelay;
      ctx.strokeStyle = '#8f7aff';
      ctx.fillStyle = `rgba(106, 90, 216, ${0.12 + 0.2 * k})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * (0.3 + 0.7 * k), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    const spr = sprites.get('enemy_imp') ?? sprites.get('enemy_scout', '#e0452f');
    for (const imp of this.imps) {
      ctx.globalAlpha = Math.min(1, imp.t / 0.4);
      if (spr) drawSprite(ctx, spr, imp.x, imp.y + 10, imp.facing, 26, { lift: 4 + Math.sin(timeSec * 9 + imp.t) * 3 });
      else {
        ctx.fillStyle = '#e0452f';
        ctx.beginPath();
        ctx.arc(imp.x, imp.y, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  private renderProjectile(ctx: CanvasRenderingContext2D, p: Projectile) {
    if (p.isRam) {
      // Piercing heavy bolt line
      ctx.strokeStyle = '#c9663a';
      ctx.lineWidth = 3;
      const dx = p.targetX - p.startX;
      const dy = p.targetY - p.startY;
      const len = Math.hypot(dx, dy) || 1;
      ctx.beginPath();
      ctx.moveTo(p.currentX - (dx / len) * 12, p.currentY - (dy / len) * 12);
      ctx.lineTo(p.currentX, p.currentY);
      ctx.stroke();
    } else if (p.towerType === 'archer') {
      ctx.strokeStyle = '#d9b44a';
      ctx.lineWidth = 2;
      const dx = p.targetX - p.startX;
      const dy = p.targetY - p.startY;
      const len = Math.hypot(dx, dy) || 1;
      ctx.beginPath();
      ctx.moveTo(p.currentX - (dx / len) * 8, p.currentY - (dy / len) * 8);
      ctx.lineTo(p.currentX, p.currentY);
      ctx.stroke();
    } else if (p.towerType === 'ballista') {
      ctx.strokeStyle = '#c9663a';
      ctx.lineWidth = 3.5;
      const dx = p.targetX - p.startX;
      const dy = p.targetY - p.startY;
      const len = Math.hypot(dx, dy) || 1;
      ctx.beginPath();
      ctx.moveTo(p.currentX - (dx / len) * 14, p.currentY - (dy / len) * 14);
      ctx.lineTo(p.currentX, p.currentY);
      ctx.stroke();
    } else if (p.towerType === 'mage') {
      ctx.fillStyle = p.specs.includes('fire') ? '#ff4a2f' : p.specs.includes('frost') ? '#7fc8f0' : '#8f6bff';
      ctx.beginPath();
      ctx.arc(p.currentX, p.currentY, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.towerType === 'priest') {
      ctx.fillStyle = '#f2f0e0';
      ctx.beginPath();
      ctx.arc(p.currentX, p.currentY, 3.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Towers of the playable factions: a dart in their color, a ball for magic, a stone for the trebuchet
      const def = CONFIG.towers[p.towerType];
      if (p.damageType === 'phys' && p.towerType !== 'orc_trebuchet') {
        ctx.strokeStyle = def.color;
        ctx.lineWidth = p.towerType === 'cul_spike' ? 3.5 : 2.2;
        const dx = p.targetX - p.startX;
        const dy = p.targetY - p.startY;
        const len = Math.hypot(dx, dy) || 1;
        ctx.beginPath();
        ctx.moveTo(p.currentX - (dx / len) * 10, p.currentY - (dy / len) * 10);
        ctx.lineTo(p.currentX, p.currentY);
        ctx.stroke();
      } else {
        ctx.fillStyle = def.color;
        ctx.beginPath();
        ctx.arc(p.currentX, p.currentY, p.towerType === 'orc_trebuchet' ? 5.5 : 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

// Shot sound of a tower: the playable factions' towers use one of the four
function shotSound(type: TowerType): 'archer' | 'priest' | 'mage' | 'ballista' {
  const def: TowerBaseDef = CONFIG.towers[type];
  return def.sound ?? (type as 'archer' | 'priest' | 'mage' | 'ballista');
}

// Linear blend of two #rrggbb colors, t = 0..1 towards `to`
function mixColor(from: string, to: string, t: number): string {
  const a = parseInt(from.slice(1), 16);
  const b = parseInt(to.slice(1), 16);
  const ch = (shift: number) => {
    const ca = (a >> shift) & 0xff;
    const cb = (b >> shift) & 0xff;
    return Math.round(ca + (cb - ca) * t);
  };
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}
