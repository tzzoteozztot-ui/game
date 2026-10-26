/**
 * 60 FPS Game Engine & Canvas Renderer for «Тёмный рубеж»
 */

import { CONFIG, TowerType, TargetPriority, Difficulty, EnemyType } from './config';
import { MAPS, Point, MapDef, isHudCell } from './maps';
import {
  calculateDamage,
  calculateEffectiveSlow,
  calculateEnemyHp,
  waveDefinition,
  calculateEnemyCount,
  calculateRerollCost,
  calculateKillGold,
  calculateWaveClearReward,
  calculateSellRefund,
  calculateSendPrice,
  calculateSendIncome,
  SendType,
  SEND_TYPES,
} from './rules';
import { sound } from './audio';
import { sprites, drawSprite, PreparedSprite, SpritePose, SpriteVariant } from './sprites';
import { attackStats, specBadge, specPower, specsOfType, stackedSlow } from './towerStats';

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
  burnTimer: number;
  curseTimer: number;
  curseBonus: number;
  rageTriggered: boolean;
  warcryTimer: number;
  hasRevived: boolean; // undead trait
  isReviving: boolean; // 1s revive delay
  reviveTimer: number;
  invulnerableTimer: number; // dark elf boss
  dashTimer: number;

  // Boss ability timer
  bossAbilityTimer: number;

  hitFlashTimer: number;
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

// Status marks on enemies: slowed (frost, «Оберег», the default priest) and cursed («Проклятие»)
const SLOW_COLOR = '#8fd4ff';
const CURSE_COLOR = '#b07cff';

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
  damageType: 'phys' | 'mag';
  towerType: TowerType;
  specs: string[]; // specializations of this tower type
  isRam: boolean;
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

export interface GameStateSnapshot {
  lives: number;
  gold: number;
  level: number;
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
  eligibleMergeCount: number;
  mergeUsesBinder: boolean; // two towers and a binder stand in for the third: a plain one for Ур.1, a triple one for Ур.2
  selectedBinder: boolean;
  binderCount: number; // plain binders on the field
  selectedBinderTriple: boolean;
  canMergeBinders: boolean; // the selected plain binder and two more can merge
  upgradeTargetCount: number; // towers a triple binder can raise
  canUpgradeSelected: boolean; // the selected tower can be raised by a triple binder standing on the field
  isUpgrading: boolean; // triple binder waiting for a tap on a tower
  bindPartnerCount: number; // towers the selected one can be bound with
  isBinding: boolean; // waiting for a tap on the second tower
  canMoveTowers: boolean; // between waves towers can be moved to a free cell
  rerollCost: number; // price of the next shop reroll
}

export class GameEngine {
  public canvas: HTMLCanvasElement | null = null;
  public ctx: CanvasRenderingContext2D | null = null;

  // State
  public level: number = 1;
  // Faction of the enemies (trait, boss, look): the level's own; in a duel the opponent's army
  public faction: number = 1;
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
  public duelOutgoing: Partial<Record<SendType, number>> = {}; // bought, leaves for the opponent with the next wave
  public duelOutgoingCost = 0;
  public duelIncome = 0; // gold added at the start of every round, grows with every send
  public onDuelSend?: (enemies: Partial<Record<SendType, number>>) => void;

  // Entities
  public towers: Tower[] = [];
  public binders: Binder[] = [];
  public enemies: Enemy[] = [];
  public projectiles: Projectile[] = [];
  public floatingTexts: FloatingText[] = [];
  private particles: Particle[] = [];
  private corpses: Corpse[] = [];
  private grassBlades: GrassBlade[] = [];

  // Spawn state
  public isSpawning: boolean = false;
  public waveInProgress: boolean = false;
  public wavesLaunched: number = 0; // how many of the 12 waves have been started
  public spawnQueue: { type: EnemyType; entrance: number; sent?: boolean }[] = []; // sent: by the duel opponent
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
  public pendingTripletSpec: string | null = null;
  public placingBinder: boolean = false;
  public selectedBinderId: string | null = null;
  public bindingFromId: string | null = null; // tower waiting for its partner
  public upgradingFromBinderId: string | null = null; // triple binder waiting for the tower to raise
  public hoverCell: Point | null = null;

  // Callbacks to UI
  public onStateChange?: (snapshot: GameStateSnapshot) => void;
  public onNeedSpecChoice?: (tower: Tower, part: 'main' | 'second') => void;
  public onWaveStarted?: () => void;

  private animFrameId: number | null = null;
  private lastTime: number = 0;
  private currentMap: MapDef = MAPS[0];
  private levelStartTime: number = 0;
  // Road geometry cached per level: ribbon polylines and unique steps for chevrons
  private roadLines: Point[][] = [];
  private roadSteps: { a: Point; b: Point }[] = [];

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
    // Logical dimensions: CONFIG.grid.totalWidth x totalHeight
    this.canvas.width = CONFIG.grid.totalWidth * dpr;
    this.canvas.height = CONFIG.grid.totalHeight * dpr;
    if (this.ctx) {
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  public startLevel(level: number, diff: Difficulty, endless = false) {
    this.level = Math.max(1, Math.min(5, level));
    this.faction = this.level;
    this.difficulty = diff;
    this.endless = endless;
    this.duelStart = null;
    this.duelOutgoing = {};
    this.duelOutgoingCost = 0;
    this.duelIncome = 0;
    this.currentMap = MAPS[this.level - 1];
    this.lives = CONFIG.lives.start;
    this.gold = Math.floor((200 + 25 * (this.level - 1)) * CONFIG.difficulty[diff].goldMult);
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
    this.pendingTripletSpec = null;
    this.placingBinder = false;
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
      if ((!this.isPaused || this.duelStart !== null) && !this.isGameOver && !this.isVictory) {
        // Game time runs at the chosen speed in steps of at most 0.05 s
        const gameDt = dt * this.speedMultiplier;
        const steps = Math.max(1, Math.ceil(gameDt / 0.05 - 1e-9));
        for (let s = 0; s < steps; s++) {
          this.update(gameDt / steps);
        }
        this.tickWaveCountdown(Math.min(rawDt, 0.25));
      }

      this.render();
      this.animFrameId = requestAnimationFrame(frame);
    };
    this.animFrameId = requestAnimationFrame(frame);
  }

  /** Duel: an endless game on this map whose waves follow the shared clock from startAt (performance.now()) */
  public startDuel(level: number, startAt: number, opponentArmy: number) {
    this.startLevel(level, 'normal', true);
    this.faction = Math.max(1, Math.min(5, Math.floor(opponentArmy) || level));
    this.duelStart = startAt;
    this.waveCountdown = this.duelNextWaveAt() / 1000 - performance.now() / 1000;
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
    return calculateSendPrice(type, this.wavesLaunched + 1, this.level);
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
  public receiveSend(enemies: Partial<Record<SendType, number>>) {
    if (this.duelStart === null || this.isGameOver || this.isVictory) return;
    const entrances = this.currentMap.entrances.length;
    let added = 0;
    for (const type of SEND_TYPES) {
      const n = Math.min(Math.max(0, Math.floor(Number(enemies[type]) || 0)), CONFIG.duel.sendMaxPerType);
      for (let i = 0; i < n; i++) {
        const entrance = this.currentEntranceIndex++ % entrances;
        const group = type === 'swarm' ? CONFIG.swarmGroupCount : 1;
        for (let g = 0; g < group; g++) this.spawnQueue.push({ type, entrance, sent: true });
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

  private duelRoundStart() {
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
    return (this.duelStart ?? 0) + (this.wavesLaunched + 1) * CONFIG.duel.roundLength * 1000;
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
    this.isPaused = !this.isPaused;
    this.notifyState();
  }

  public setSpeed(speed: number) {
    if (!CONFIG.speeds.includes(speed) || this.duelStart !== null) return; // a duel runs at ×1
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
      const before = Math.ceil(this.waveCountdown ?? 0);
      this.waveCountdown = Math.max(0, (this.duelNextWaveAt() - performance.now()) / 1000);
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
    const duel = this.duelStart !== null;
    if (duel !== fromClock) return false; // a duel wave waits for the clock
    if ((this.isSpawning && !duel) || this.isGameOver || this.isVictory) return false;
    if (!this.endless && this.wavesLaunched >= CONFIG.waves.length) return false;

    // Early start: gold for the seconds left on the timer; while enemies are still alive the waves
    // merge, so the cleared-wave reward of the unfinished one is paid now (Артур: награда сразу и +20)
    if (!duel && this.waveInProgress && this.enemies.length > 0 && (this.endless || this.wave <= 12)) {
      const reward = calculateWaveClearReward(this.wave);
      this.gold += reward;
      this.addFloatingText(`Волна ${this.wave}: +${reward} золота`, CONFIG.grid.totalWidth / 2, 80, '#f4c06a');
    }
    const bonus = this.earlyStartBonus();
    if (bonus > 0) {
      this.gold += bonus;
      this.addFloatingText(`+${bonus} за ранний старт`, CONFIG.grid.totalWidth / 2, 40, '#f4c06a');
      sound.playBuy();
    }
    if (!duel) this.waveCountdown = null;
    else this.duelRoundStart();

    // An early start launches the next wave, not the current one again
    this.wave = this.wavesLaunched + 1;
    this.wavesLaunched++;
    this.rerollsThisWave = 0;
    if (duel) this.waveCountdown = Math.max(0, (this.duelNextWaveAt() - performance.now()) / 1000);
    const waveDef = waveDefinition(this.wave);
    // A duel wave joins the enemies still waiting to come out
    if (!duel) this.spawnQueue = [];

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
    const hasBoss = !!waveDef.boss;

    // Assign entrances in round-robin
    const entrancesCount = this.currentMap.entrances.length;
    let entIdx = 0;

    for (const type of list) {
      if (type === 'swarm') {
        // Queue 8 swarm individuals 0.25s apart at this entrance
        const swarmEnt = entIdx % entrancesCount;
        entIdx++;
        for (let s = 0; s < CONFIG.swarmGroupCount; s++) {
          this.spawnQueue.push({ type: 'swarm', entrance: swarmEnt });
        }
      } else {
        this.spawnQueue.push({ type, entrance: entIdx % entrancesCount });
        entIdx++;
      }
    }

    if (hasBoss) {
      // Boss always comes out last at first entrance (index 0)
      this.spawnQueue.push({ type: 'boss', entrance: 0 });
    }

    this.isSpawning = true;
    this.waveInProgress = true;
    this.spawnTimer = 0;
    this.onWaveStarted?.();
    this.notifyState();
    return true;
  }

  private spawnEnemy(type: EnemyType, entranceIdx: number, sent = false) {
    const baseDef = CONFIG.enemies[type];
    const entrance = this.currentMap.entrances[entranceIdx];
    const path = this.currentMap.paths[entranceIdx];
    const isFlyer = type === 'flyer';

    // Calculate path length in pixels
    let totalLen = 0;
    if (isFlyer) {
      const startPxX = (entrance.x + 0.5) * CONFIG.grid.cellSize;
      const startPxY = (entrance.y + 0.5) * CONFIG.grid.cellSize;
      const targetPxX = CONFIG.grid.castleTarget.x * CONFIG.grid.cellSize;
      const targetPxY = CONFIG.grid.castleTarget.y * CONFIG.grid.cellSize;
      totalLen = Math.hypot(targetPxX - startPxX, targetPxY - startPxY);
    } else {
      totalLen = path.length * CONFIG.grid.cellSize;
    }

    const hp = calculateEnemyHp(baseDef.hp, type, this.wave, this.level, this.difficulty, this.endless, this.faction);
    const killGold = calculateKillGold(baseDef.gold, this.level);
    const gold = sent ? Math.round(killGold * CONFIG.duel.sentKillGoldShare) : killGold;

    const enemy: Enemy = {
      id: Math.random().toString(36).substring(2, 9),
      type,
      x: (entrance.x + 0.5) * CONFIG.grid.cellSize,
      y: (entrance.y + 0.5) * CONFIG.grid.cellSize,
      maxHp: hp,
      hp,
      baseSpeed: baseDef.speed * CONFIG.grid.cellSize,
      armor: baseDef.armor,
      magicResist: baseDef.magicResist,
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
      animSeed: Math.random() * Math.PI * 2,
      facing: 1,
    };

    if (type === 'boss') {
      sound.playBossSpawn();
      this.addFloatingText('ПОЯВИЛСЯ БОСС!', enemy.x, enemy.y - 20, '#e0452f');
    }

    this.enemies.push(enemy);
  }

  // -------------------------------------------------------------
  // Simulation Update
  // -------------------------------------------------------------
  private update(dt: number) {
    // 1. Spawning
    if (this.isSpawning) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        if (this.spawnQueue.length > 0) {
          const next = this.spawnQueue.shift()!;
          this.spawnEnemy(next.type, next.entrance, next.sent);
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
      if (this.endless || this.wave <= 12) {
        // Wave cleared!
        const reward = calculateWaveClearReward(this.wave);
        this.gold += reward;
        this.addFloatingText(`Волна ${this.wave} зачищена! +${reward} золота`, CONFIG.grid.totalWidth / 2, 80, '#f4c06a');
        sound.playBuy();

        if (!this.endless && this.wave === 12) {
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
    for (const tower of this.towers) {
      if (tower.frozenTimer > 0) {
        tower.frozenTimer -= dt;
        continue;
      }
      for (const part of tower.second ? [tower, tower.second] : [tower]) {
        if (part.cooldownTimer > 0) {
          part.cooldownTimer -= dt;
        }
        const stats = attackStats(part.type, part.level, part.specs);
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
      if (e.invulnerableTimer > 0) e.invulnerableTimer -= dt;

      // Burn tick
      if (e.burnTimer > 0) {
        e.burnTimer -= dt;
        let burnDmg = e.burnDps * dt;
        // Demon trait
        if (this.faction === 4) burnDmg *= 0.5;
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

      // Boss ability triggers
      if (e.type === 'boss') {
        e.bossAbilityTimer += dt;
        this.updateBossAbilities(e);
      }

      // Calculate effective speed
      let speed = e.baseSpeed;

      // Orc trait: Rage (HP < 50% -> speed x1.3)
      if (this.faction === 1 && e.hp < e.maxHp * 0.5) {
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

      // Movement
      if (e.isFlyer) {
        // Fly directly towards castle center
        const targetPxX = CONFIG.grid.castleTarget.x * CONFIG.grid.cellSize;
        const targetPxY = CONFIG.grid.castleTarget.y * CONFIG.grid.cellSize;
        const dx = targetPxX - e.x;
        const dy = targetPxY - e.y;
        const dist = Math.hypot(dx, dy);

        if (dist < 12) {
          // Reached castle!
          this.damageCastle(e, i);
          continue;
        }

        const moveStep = speed * dt;
        e.x += (dx / dist) * moveStep;
        e.y += (dy / dist) * moveStep;
        e.distanceTraveled += moveStep;
        if (Math.abs(dx) > 1) e.facing = dx < 0 ? -1 : 1;
      } else {
        // Follow map road path
        const path = this.currentMap.paths[e.entranceIndex];
        const nextCell = path[e.pathIndex + 1];

        if (!nextCell) {
          // Reached the end of the road next to the castle: walk into the castle cell
          const cx = CONFIG.grid.castleTarget.x * CONFIG.grid.cellSize;
          const cy = CONFIG.grid.castleTarget.y * CONFIG.grid.cellSize;
          const dx = cx - e.x;
          const dy = cy - e.y;
          const dist = Math.hypot(dx, dy);
          const moveStep = speed * dt;
          if (dist <= Math.max(moveStep, 14)) {
            this.damageCastle(e, i);
            continue;
          }
          e.x += (dx / dist) * moveStep;
          e.y += (dy / dist) * moveStep;
          e.distanceTraveled += moveStep;
          if (Math.abs(dx) > 1) e.facing = dx < 0 ? -1 : 1;
        } else {
          const targetPxX = (nextCell.x + 0.5) * CONFIG.grid.cellSize;
          const targetPxY = (nextCell.y + 0.5) * CONFIG.grid.cellSize;
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
    const nowSec = performance.now() / 1000;
    this.deadEnemiesGraveyard = this.deadEnemiesGraveyard.filter((g) => nowSec - g.time <= 10);
  }

  // -------------------------------------------------------------
  // Boss Abilities
  // -------------------------------------------------------------
  private updateBossAbilities(boss: Enemy) {
    if (boss.isReviving) return;

    // Level 1: Вождь (Warchief) - every 10s battle cry (+40% speed for 3s to allies in 2.5 cells)
    if (this.faction === 1 && boss.bossAbilityTimer >= 10) {
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
    if (this.faction === 2 && boss.bossAbilityTimer >= 12) {
      boss.bossAbilityTimer = 0;
      const reviveRadius = 3.0 * CONFIG.grid.cellSize;
      const eligible = this.deadEnemiesGraveyard.filter(
        (g) => Math.hypot(g.x - boss.x, g.y - boss.y) <= reviveRadius
      );
      if (eligible.length > 0) {
        sound.playBossSpawn();
        this.addFloatingText('ВОСКРЕШЕНИЕ ЛИЧА!', boss.x, boss.y - 18, '#c9d6b0');
        const toRevive = eligible.slice(0, 3);
        for (const g of toRevive) {
          this.spawnEnemy(g.type, g.entranceIndex);
          const newSpawn = this.enemies[this.enemies.length - 1];
          newSpawn.x = g.x;
          newSpawn.y = g.y;
          newSpawn.pathIndex = g.pathIndex;
          newSpawn.distanceTraveled = g.distanceTraveled;
          newSpawn.hp = Math.round(newSpawn.maxHp * 0.3);
          this.spawnRing(g.x, g.y, '#c9d6b0');
        }
      }
    }

    // Level 3: Ледяной жрец (Ice Priest) - every 12s freezes closest tower for 4s
    if (this.faction === 3 && boss.bossAbilityTimer >= 12) {
      boss.bossAbilityTimer = 0;
      let closestTower: Tower | null = null;
      let minDist = Infinity;
      for (const t of this.towers) {
        const tx = (t.x + 0.5) * CONFIG.grid.cellSize;
        const ty = (t.y + 0.5) * CONFIG.grid.cellSize;
        const d = Math.hypot(tx - boss.x, ty - boss.y);
        if (d < minDist) {
          minDist = d;
          closestTower = t;
        }
      }
      if (closestTower) {
        closestTower.frozenTimer = 4.0;
        this.addFloatingText('БАШНЯ ЗАМОРОЖЕНА!', boss.x, boss.y - 18, '#7fc8f0');
        this.spawnRing((closestTower.x + 0.5) * CONFIG.grid.cellSize, (closestTower.y + 0.5) * CONFIG.grid.cellSize, '#7fc8f0');
      }
    }

    // Level 4: Владыка бездны (Abyss Lord) - every 10s summons 3 imps
    if (this.faction === 4 && boss.bossAbilityTimer >= 10) {
      boss.bossAbilityTimer = 0;
      sound.playBossSpawn();
      this.addFloatingText('ПРИЗЫВ БЕСОВ!', boss.x, boss.y - 18, '#e0452f');
      for (let i = 0; i < 3; i++) {
        this.spawnEnemy('imp', boss.entranceIndex);
        const imp = this.enemies[this.enemies.length - 1];
        imp.x = boss.x + (Math.random() - 0.5) * 32;
        imp.y = boss.y + (Math.random() - 0.5) * 32;
        imp.pathIndex = boss.pathIndex;
        this.spawnSpark(imp.x, imp.y, '#e0452f');
      }
    }

    // Level 5: Королева теней (Shadow Queen) - every 15s invulnerable for 3s & dashes 3 cells along path
    if (this.faction === 5 && boss.bossAbilityTimer >= 15) {
      boss.bossAbilityTimer = 0;
      boss.invulnerableTimer = 3.0;
      sound.playBossSpawn();
      this.addFloatingText('ТЕНЕВОЙ РЫВОК!', boss.x, boss.y - 18, '#3ed6c4');
      this.spawnRing(boss.x, boss.y, '#3ed6c4');

      // Advance 3 cells along path
      const path = this.currentMap.paths[boss.entranceIndex];
      boss.pathIndex = Math.min(path.length - 1, boss.pathIndex + 3);
      const targetCell = path[boss.pathIndex];
      boss.x = (targetCell.x + 0.5) * CONFIG.grid.cellSize;
      boss.y = (targetCell.y + 0.5) * CONFIG.grid.cellSize;
      boss.distanceTraveled += 3 * CONFIG.grid.cellSize;
    }
  }

  // -------------------------------------------------------------
  // Tower Attacks & Targeting
  // -------------------------------------------------------------
  private towerAttack(tower: Tower, part: TowerPart) {
    const baseDef = CONFIG.towers[part.type];
    const towerPxX = (tower.x + 0.5) * CONFIG.grid.cellSize;
    const towerPxY = (tower.y + 0.5) * CONFIG.grid.cellSize;
    const stats = attackStats(part.type, part.level, part.specs);
    const specs = specsOfType(part.type, part.specs);
    const rangePx = stats.range * CONFIG.grid.cellSize;
    // A tower bound to a priest shoots stronger
    const partner = tower.second ? (part === tower ? tower.second : tower) : null;
    const rawDamage = stats.damage * (partner?.type === 'priest' && part.type !== 'priest' ? 1 + CONFIG.priestBase.pairBonus : 1);
    const cooldown = stats.cooldown;

    // Find enemies in range
    const inRange = this.enemies.filter((e) => {
      if (e.isReviving) return false;
      const d = Math.hypot(e.x - towerPxX, e.y - towerPxY);
      return d <= rangePx;
    });

    if (inRange.length === 0) return;

    // Sort according to priority
    this.sortEnemiesByPriority(inRange, tower.priority, towerPxX, towerPxY);

    const targets = inRange.slice(0, stats.targets);
    if (Math.abs(targets[0].x - towerPxX) > 2) tower.facing = targets[0].x < towerPxX ? -1 : 1;

    for (const target of targets) {
      sound.playShot(part.type);

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
          speed: part.type === 'ballista' ? 520 : 380,
          damage: rawDamage,
          damageType: baseDef.damageType,
          towerType: part.type,
          specs,
          isRam: false,
          aoeRadius: stats.aoeRadius,
          piercedEnemyIds: new Set<string>(),
        });
      }
    }

    part.cooldownTimer = cooldown;
    part.shotAt = performance.now() / 1000;
  }

  // Priest Smite: pulses every 2.5s hitting all enemies in radius with damage * 2.5 (×n)
  private triggerPriestSmite(tower: Tower, part: TowerPart) {
    const towerPxX = (tower.x + 0.5) * CONFIG.grid.cellSize;
    const towerPxY = (tower.y + 0.5) * CONFIG.grid.cellSize;
    const stats = attackStats('priest', part.level, part.specs);
    const rangePx = stats.range * CONFIG.grid.cellSize;

    sound.playShot('priest');
    this.spawnRing(towerPxX, towerPxY, '#f2f0e0');

    for (const e of [...this.enemies]) {
      if (e.isReviving) continue;
      if (Math.hypot(e.x - towerPxX, e.y - towerPxY) <= rangePx) {
        this.applyDamageToEnemy(e, stats.smiteDamage, 'mag', 'priest', ['smite']);
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
        if (!candidate.isReviving && !chainTargets.includes(candidate)) {
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
      this.applyDamageToEnemy(target, currentDmg, 'mag', 'mage', specs);
      currentDmg *= 0.75;
    }
  }

  private handleProjectileImpact(p: Projectile, target: Enemy | null, impactX: number, impactY: number) {
    sound.playHit();
    this.spawnSpark(impactX, impactY, p.damageType === 'mag' ? '#8f6bff' : '#d9b44a');

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
    dmgType: 'phys' | 'mag',
    towerType: TowerType,
    specs: string[]
  ) {
    if (e.invulnerableTimer > 0) return;
    const n = (id: string) => specPower(specs, id);

    const res = calculateDamage({
      rawDamage: rawDmg,
      damageType: dmgType,
      targetArmor: e.armor,
      targetMagicResist: e.magicResist,
      isCursed: e.curseTimer > 0,
      curseBonus: e.curseBonus,
      isFireSpec: n('fire') > 0,
      factionId: this.faction,
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

    if (res.isExecuted) {
      this.addFloatingText('КАЗНЬ!', e.x, e.y - 12, '#e0452f');
      e.hp = 0;
    } else {
      e.hp -= res.damage;
    }

    e.hitFlashTimer = 0.06;

    // Apply specialization secondary effects (n copies make each stronger):
    if (n('fire')) {
      // Burn 30% of shot damage per second for 3s (non-stacking)
      e.burnDps = rawDmg * 0.3 * n('fire');
      e.burnTimer = 3.0;
    }

    if (n('frost')) {
      // Slow 35% for 2s
      this.applySlow(e, stackedSlow(0.35, n('frost')), 2.0);
    }

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
    const effectiveSlow = calculateEffectiveSlow(slow, this.faction);
    if (effectiveSlow > e.slowPercent) {
      e.slowPercent = effectiveSlow;
      e.slowTimer = duration;
    }
  }

  private killEnemy(e: Enemy, index: number) {
    // Undead trait: infantry and scout revive once after 1s with 30% HP
    if (this.faction === 2 && !e.hasRevived && (e.type === 'infantry' || e.type === 'scout')) {
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
    this.spawnPuff(e.x, e.y, CONFIG.palettes[this.faction - 1].enemies);

    // Save to graveyard for Lich boss
    if (this.faction === 2 && e.type !== 'boss') {
      this.deadEnemiesGraveyard.push({
        x: e.x,
        y: e.y,
        time: performance.now() / 1000,
        type: e.type,
        entranceIndex: e.entranceIndex,
        pathIndex: e.pathIndex,
        distanceTraveled: e.distanceTraveled,
      });
    }

    // Reward gold
    if (e.gold > 0) {
      this.gold += e.gold;
      this.addFloatingText(`+${e.gold}`, e.x, e.y - 10, '#f4c06a');
    }

    this.notifyState();
  }

  private damageCastle(e: Enemy, index: number) {
    this.enemies.splice(index, 1);
    const cost = e.type === 'boss' ? CONFIG.lives.bossCost : CONFIG.lives.regularCost;
    this.lives = Math.max(0, this.lives - cost);
    sound.playError();
    this.addFloatingText(
      `-${cost} ЖИЗНИ`,
      CONFIG.grid.castleTarget.x * CONFIG.grid.cellSize,
      (CONFIG.grid.castleTarget.y - 0.7) * CONFIG.grid.cellSize,
      '#e0452f'
    );

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
    return calculateRerollCost(this.rerollsThisWave);
  }

  /** Takes the price of a shop reroll; false (and nothing taken) without enough gold */
  public payReroll(): boolean {
    const cost = this.rerollCost();
    if (this.gold < cost) return false;
    this.gold -= cost;
    this.rerollsThisWave++;
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
    sound.playBuy();
    this.notifyState();
    return true;
  }

  public placeTower(cellX: number, cellY: number): boolean {
    if (!this.placingTowerType) return false;

    // Check validity
    if (!this.isCellFree(cellX, cellY)) {
      sound.playError();
      return false;
    }

    const baseDef = CONFIG.towers[this.placingTowerType];
    const cost = this.placingIsTriplet ? baseDef.cost * 3 : baseDef.cost;
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
      level: this.placingIsTriplet ? 2 : 1,
      specs: this.placingIsTriplet && this.pendingTripletSpec ? [this.pendingTripletSpec] : [],
      priority: 'first',
      cooldownTimer: 0,
      frozenTimer: 0,
      smiteTimer: 2.5,
      facing: 1,
      second: null,
    };

    this.towers.push(newTower);
    sound.playBuy();
    this.spawnRing((cellX + 0.5) * CONFIG.grid.cellSize, (cellY + 0.5) * CONFIG.grid.cellSize, '#d9b44a');

    // Reset placement
    this.placingTowerType = null;
    this.placingIsTriplet = false;
    this.pendingTripletSpec = null;
    this.selectedTowerId = newTower.id;

    this.notifyState();
    return true;
  }

  public isCellFree(cx: number, cy: number): boolean {
    if (cx < 0 || cx >= CONFIG.grid.cols || cy < 0 || cy >= CONFIG.grid.rows) return false;
    // Check castle and the corners under the field buttons
    if (CONFIG.grid.castleCells.some((c) => c.x === cx && c.y === cy)) return false;
    if (isHudCell(cx, cy)) return false;
    // Check road
    for (const p of this.currentMap.paths) {
      if (p.some((c) => c.x === cx && c.y === cy)) return false;
    }
    // Check existing tower or binder
    if (this.towers.some((t) => t.x === cx && t.y === cy)) return false;
    if (this.binders.some((b) => b.x === cx && b.y === cy)) return false;
    return true;
  }

  public selectTower(id: string | null) {
    this.selectedTowerId = id;
    this.selectedBinderId = null;
    this.bindingFromId = null;
    this.upgradingFromBinderId = null;
    this.placingTowerType = null;
    this.placingBinder = false;
    this.notifyState();
  }

  // Towers can be moved only in the pause between waves: the timer runs and no enemy is on the field
  public canMoveTowers(): boolean {
    return this.waveCountdown !== null && !this.isSpawning && this.enemies.length === 0 && !this.isGameOver;
  }

  // Moves the selected tower to a free cell; it stays selected
  public moveSelectedTower(cellX: number, cellY: number): boolean {
    const tower = this.selectedTowerId ? this.towers.find((t) => t.id === this.selectedTowerId) : null;
    if (!tower || !this.canMoveTowers() || !this.isCellFree(cellX, cellY)) return false;
    const cs = CONFIG.grid.cellSize;
    this.spawnPuff((tower.x + 0.5) * cs, (tower.y + 0.5) * cs, '#f4c06a');
    tower.x = cellX;
    tower.y = cellY;
    this.spawnRing((cellX + 0.5) * cs, (cellY + 0.5) * cs, '#d9b44a');
    sound.playBuy();
    this.notifyState();
    return true;
  }

  public selectBinder(id: string | null) {
    this.selectTower(null);
    this.selectedBinderId = id;
    this.upgradingFromBinderId = null;
    this.notifyState();
  }

  public placeBinder(cellX: number, cellY: number): boolean {
    if (!this.placingBinder) return false;
    if (!this.isCellFree(cellX, cellY) || this.gold < CONFIG.binder.cost) {
      sound.playError();
      return false;
    }
    this.gold -= CONFIG.binder.cost;
    const binder: Binder = { id: Math.random().toString(36).substring(2, 9), x: cellX, y: cellY };
    this.binders.push(binder);
    sound.playBuy();
    this.spawnRing((cellX + 0.5) * CONFIG.grid.cellSize, (cellY + 0.5) * CONFIG.grid.cellSize, CONFIG.binder.color);
    this.placingBinder = false;
    this.selectedBinderId = binder.id;
    this.notifyState();
    return true;
  }

  public sellBinder(id: string): boolean {
    const idx = this.binders.findIndex((b) => b.id === id);
    if (idx === -1) return false;
    const b = this.binders[idx];
    const refund = Math.floor(CONFIG.binder.cost * (b.triple ? 3 : 1) * CONFIG.upgrade.sellRatio);
    this.gold += refund;
    this.binders.splice(idx, 1);
    this.selectedBinderId = null;
    sound.playBuy();
    this.addFloatingText(`+${refund} золота`, (b.x + 0.5) * CONFIG.grid.cellSize, (b.y + 0.5) * CONFIG.grid.cellSize, '#f4c06a');
    this.notifyState();
    return true;
  }

  // Plain binders bind two towers; a triple one only raises levels
  private plainBinders(): Binder[] {
    return this.binders.filter((b) => !b.triple);
  }

  // Towers the given one can be bound with: another type, neither already bound
  public getBindPartners(tower: Tower): Tower[] {
    if (tower.second || this.plainBinders().length === 0) return [];
    // a level-2 tower still choosing its specialization can't be bound yet
    if (tower.level === 2 && tower.specs.length === 0) return [];
    return this.towers.filter(
      (t) => t !== tower && t.type !== tower.type && !t.second && (t.level !== 2 || t.specs.length > 0)
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
      this.notifyState();
      return false;
    }
    const binder = this.nearest(this.plainBinders(), tower)[0];
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
    this.spawnPuff((partner.x + 0.5) * cs, (partner.y + 0.5) * cs, CONFIG.binder.color);
    this.spawnPuff((binder.x + 0.5) * cs, (binder.y + 0.5) * cs, CONFIG.binder.color);
    this.spawnRing((tower.x + 0.5) * cs, (tower.y + 0.5) * cs, CONFIG.binder.color);
    this.addFloatingText('СВЯЗКА!', (tower.x + 0.5) * cs, (tower.y + 0.5) * cs - 16, CONFIG.binder.color);
    sound.playMerge();
    this.selectedTowerId = tower.id;
    this.notifyState();
    return true;
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
        this.addFloatingText(`Тройная связка — с ${CONFIG.binder.tripleFromTier}-го яруса лавки`, (sel.x + 0.5) * CONFIG.grid.cellSize, (sel.y + 0.5) * CONFIG.grid.cellSize - 16, '#e0452f');
      }
      return false;
    }
    const cs = CONFIG.grid.cellSize;
    for (const b of this.nearest(this.plainBinders().filter((b) => b !== sel), sel).slice(0, 2)) {
      this.binders.splice(this.binders.indexOf(b), 1);
      this.spawnPuff((b.x + 0.5) * cs, (b.y + 0.5) * cs, CONFIG.binder.color);
    }
    sel.triple = true;
    this.spawnRing((sel.x + 0.5) * cs, (sel.y + 0.5) * cs, CONFIG.binder.color);
    this.addFloatingText('ТРОЙНАЯ СВЯЗКА!', (sel.x + 0.5) * cs, (sel.y + 0.5) * cs - 16, CONFIG.binder.color);
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
    this.binders.splice(this.binders.indexOf(binder), 1);
    for (const part of tower.second ? [tower, tower.second] : [tower]) {
      if (part.level >= 3) continue;
      part.level += 1;
      part.specs = part.level === 3 ? [...part.specs, ...part.specs, ...part.specs] : [];
    }
    const cs = CONFIG.grid.cellSize;
    this.spawnPuff((binder.x + 0.5) * cs, (binder.y + 0.5) * cs, CONFIG.binder.color);
    this.spawnRing((tower.x + 0.5) * cs, (tower.y + 0.5) * cs, '#f4c06a');
    this.addFloatingText('УРОВЕНЬ +1!', (tower.x + 0.5) * cs, (tower.y + 0.5) * cs - 16, '#f4c06a');
    sound.playMerge();
    this.selectedBinderId = null;
    this.selectedTowerId = tower.id;
    this.askSpecIfNeeded(tower);
    this.notifyState();
    return true;
  }

  // A part that just reached Ур.2 without a specialization asks for one: the main part first
  private askSpecIfNeeded(tower: Tower) {
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
    let refund = calculateSellRefund(CONFIG.towers[tower.type].cost, tower.level);
    if (tower.second) {
      refund += calculateSellRefund(CONFIG.towers[tower.second.type].cost, tower.second.level);
      refund += Math.floor(CONFIG.binder.cost * CONFIG.upgrade.sellRatio);
    }

    this.gold += refund;
    this.towers.splice(idx, 1);
    this.selectedTowerId = null;
    sound.playBuy();
    this.addFloatingText(`+${refund} золота`, (tower.x + 0.5) * CONFIG.grid.cellSize, (tower.y + 0.5) * CONFIG.grid.cellSize, '#f4c06a');
    this.notifyState();
    return true;
  }

  // Get eligible towers for merging with the selected tower
  public getEligibleMergeTowers(selected: Tower): Tower[] {
    if (selected.level >= 3 || selected.second) return [];
    return this.towers.filter(
      (t) =>
        !t.second &&
        t.type === selected.type &&
        t.level === selected.level &&
        // a level-2 tower waiting for its specialization can't merge yet
        (selected.level === 1 || t.specs.length > 0)
    );
  }

  // The binder that can take the place of the third tower: a plain one for two equal Ур.1 towers,
  // a triple one for two equal Ур.2 towers (the nearest of its kind)
  public mergeStandIn(selected: Tower): Binder | null {
    if (selected.second || selected.level >= 3) return null;
    const candidates = this.binders.filter((b) => (selected.level === 1 ? !b.triple : !!b.triple));
    return this.nearest(candidates, selected)[0] ?? null;
  }

  public mergeSelectedTower(): boolean {
    if (!this.selectedTowerId) return false;
    const selected = this.towers.find((t) => t.id === this.selectedTowerId);
    if (!selected || selected.level >= 3) return false;

    const eligible = this.getEligibleMergeTowers(selected);
    // Two equal towers and a binder: the binder takes the place of the third tower
    const standIn = eligible.length === 2 ? this.mergeStandIn(selected) : null;
    if (eligible.length < 3 && !standIn) return false;

    // Selected tower stays, pick 2 closest eligible to merge into it
    const others = eligible.filter((t) => t.id !== selected.id);
    others.sort((a, b) => {
      const dA = Math.hypot(a.x - selected.x, a.y - selected.y);
      const dB = Math.hypot(b.x - selected.x, b.y - selected.y);
      return dA - dB;
    });

    const mergePair = standIn ? others : others.slice(0, 2);

    if (standIn) {
      this.binders.splice(this.binders.indexOf(standIn), 1);
      if (this.selectedBinderId === standIn.id) this.selectedBinderId = null;
      this.spawnPuff((standIn.x + 0.5) * CONFIG.grid.cellSize, (standIn.y + 0.5) * CONFIG.grid.cellSize, CONFIG.binder.color);
    }

    // Remove the towers that join (two, or one when a binder stands in)
    for (const m of standIn ? mergePair.slice(0, 1) : mergePair) {
      const idx = this.towers.indexOf(m);
      if (idx !== -1) {
        this.towers.splice(idx, 1);
        this.spawnPuff((m.x + 0.5) * CONFIG.grid.cellSize, (m.y + 0.5) * CONFIG.grid.cellSize, '#f4c06a');
      }
    }

    selected.level += 1;
    // Level 3 keeps every specialization of the three towers (repeats add power)
    if (selected.level === 3) {
      // the binder in the place of the third tower repeats the selected tower's specialization, as a triple binder does
      selected.specs = [...selected.specs, ...mergePair.flatMap((m) => m.specs), ...(standIn ? selected.specs : [])];
    }
    sound.playMerge();
    this.spawnRing((selected.x + 0.5) * CONFIG.grid.cellSize, (selected.y + 0.5) * CONFIG.grid.cellSize, '#f4c06a');
    this.addFloatingText(standIn ? 'СЛИЯНИЕ СО СВЯЗКОЙ!' : 'СЛИЯНИЕ!', (selected.x + 0.5) * CONFIG.grid.cellSize, (selected.y + 0.5) * CONFIG.grid.cellSize - 16, '#f4c06a');

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
    if (part === 'second' && tower.second) tower.second.specs = [specId];
    else tower.specs = [specId];
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
    if (!this.onStateChange) return;
    const selected = this.selectedTowerId ? this.towers.find((t) => t.id === this.selectedTowerId) || null : null;
    const eligibleTowers = selected ? this.getEligibleMergeTowers(selected) : [];
    const mergeBinder = selected && eligibleTowers.length === 2 ? this.mergeStandIn(selected) : null;
    const eligibleCount = eligibleTowers.length + (mergeBinder ? 1 : 0);
    const bindPartnerCount = selected ? this.getBindPartners(selected).length : 0;

    this.onStateChange({
      lives: this.lives,
      gold: this.gold,
      level: this.level,
      wave: this.shownWave(),
      maxWaves: 12,
      tier: this.tier,
      isWaveActive: this.waveInProgress || this.isSpawning || this.enemies.length > 0,
      isSpawning: this.isSpawning,
      isGameOver: this.isGameOver,
      isVictory: this.isVictory,
      isPaused: this.isPaused,
      allWavesLaunched: !this.endless && this.wavesLaunched >= CONFIG.waves.length,
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
      eligibleMergeCount: eligibleCount,
      mergeUsesBinder: !!mergeBinder,
      selectedBinder: this.selectedBinderId !== null,
      binderCount: this.plainBinders().length,
      selectedBinderTriple: !!this.binders.find((b) => b.id === this.selectedBinderId)?.triple,
      canMergeBinders: this.canMergeBinders(),
      upgradeTargetCount: this.getUpgradeTargets().length,
      canUpgradeSelected: this.canUpgradeSelectedTower(),
      isUpgrading: this.upgradingFromBinderId !== null,
      bindPartnerCount,
      isBinding: this.bindingFromId !== null,
      canMoveTowers: this.canMoveTowers(),
      rerollCost: this.rerollCost(),
    });
  }

  // -------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------
  public render() {
    const ctx = this.ctx;
    if (!ctx) return;

    const palette = CONFIG.palettes[this.level - 1];
    const cellSize = CONFIG.grid.cellSize;

    // 1. Background / Ground cells
    // Alternating between 2 tones (2nd tone 4% lighter)
    ctx.fillStyle = palette.ground;
    ctx.fillRect(0, 0, CONFIG.grid.totalWidth, CONFIG.grid.totalHeight);

    // Render checkerboard ground pattern with 4% lightness difference
    for (let cy = 0; cy < CONFIG.grid.rows; cy++) {
      for (let cx = 0; cx < CONFIG.grid.cols; cx++) {
        if ((cx + cy) % 2 === 1) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
          ctx.fillRect(cx * cellSize, cy * cellSize, cellSize, cellSize);
        }
      }
    }

    // 2. Roads: solid ribbon with a dark outline, rounded turns and running chevrons
    const outline = mixColor(palette.ground, '#000000', 0.6);
    const rim = mixColor(palette.road, '#ffffff', 0.32);
    const fill = mixColor(palette.road, '#ffffff', 0.14);
    this.strokeRoad(ctx, outline, cellSize * 0.94);
    this.strokeRoad(ctx, rim, cellSize * 0.8);
    this.strokeRoad(ctx, fill, cellSize * 0.7);

    const timeSec = performance.now() / 1000;
    const spacing = cellSize / 2;
    const phase = (timeSec * 18) % spacing;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const st of this.roadSteps) {
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

    // 3. Gates at entrances and the castle
    for (const e of this.currentMap.entrances) {
      this.renderGate(ctx, e, cellSize, palette.light, timeSec);
    }
    this.renderCastle(ctx, cellSize, palette.light, timeSec);

    // 4. Grass blades (swaying gently)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.lineWidth = 1.5;
    for (const g of this.grassBlades) {
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
          ctx.strokeRect(el.x * cellSize + 2, el.y * cellSize + 2, cellSize - 4, cellSize - 4);
        }
        ctx.globalAlpha = 1;
      } else {
        const eligible = this.getEligibleMergeTowers(selectedTower);
        ctx.strokeStyle = '#f4c06a';
        ctx.lineWidth = 2.5;
        for (const el of eligible) {
          ctx.strokeRect(el.x * cellSize + 2, el.y * cellSize + 2, cellSize - 4, cellSize - 4);
        }
      }

      // Attack range circle of each part of the selected tower
      const parts: TowerPart[] = selectedTower.second ? [selectedTower, selectedTower.second] : [selectedTower];
      for (const part of parts) {
        const rangePx = attackStats(part.type, part.level, part.specs).range * cellSize;
        ctx.fillStyle = 'rgba(244, 192, 106, 0.09)';
        ctx.strokeStyle = part === selectedTower ? 'rgba(244, 192, 106, 0.45)' : 'rgba(62, 214, 196, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc((selectedTower.x + 0.5) * cellSize, (selectedTower.y + 0.5) * cellSize, rangePx, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // Between waves the selected tower can move: free cells are marked, the hovered one shows the target
    if (selectedTower && !this.bindingFromId && this.canMoveTowers()) {
      ctx.fillStyle = 'rgba(244, 192, 106, 0.045)';
      for (let y = 0; y < CONFIG.grid.rows; y++) {
        for (let x = 0; x < CONFIG.grid.cols; x++) {
          if (this.isCellFree(x, y)) ctx.fillRect(x * cellSize + 6, y * cellSize + 6, cellSize - 12, cellSize - 12);
        }
      }
      const h = this.hoverCell;
      if (h && this.isCellFree(h.x, h.y)) {
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = '#f4c06a';
        ctx.lineWidth = 2;
        ctx.strokeRect(h.x * cellSize + 3, h.y * cellSize + 3, cellSize - 6, cellSize - 6);
        ctx.setLineDash([]);
      }
    }

    const selectedBinder = this.selectedBinderId ? this.binders.find((b) => b.id === this.selectedBinderId) : null;
    if (selectedBinder) {
      ctx.strokeStyle = CONFIG.binder.color;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(selectedBinder.x * cellSize + 2, selectedBinder.y * cellSize + 2, cellSize - 4, cellSize - 4);
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
      for (const m of marks) ctx.strokeRect(m.x * cellSize + 2, m.y * cellSize + 2, cellSize - 4, cellSize - 4);
      ctx.globalAlpha = 1;
    }

    // 6. Placement preview when placing a tower or a binder
    if (this.placingBinder && this.hoverCell) {
      const { x: hx, y: hy } = this.hoverCell;
      const isFree = this.isCellFree(hx, hy);
      ctx.fillStyle = isFree ? 'rgba(62, 214, 196, 0.22)' : 'rgba(224, 69, 47, 0.28)';
      ctx.fillRect(hx * cellSize, hy * cellSize, cellSize, cellSize);
      ctx.strokeStyle = isFree ? CONFIG.binder.color : '#e0452f';
      ctx.lineWidth = 2;
      ctx.strokeRect(hx * cellSize + 1, hy * cellSize + 1, cellSize - 2, cellSize - 2);
    }
    if (this.placingTowerType && this.hoverCell) {
      const hx = this.hoverCell.x;
      const hy = this.hoverCell.y;
      const isFree = this.isCellFree(hx, hy);

      ctx.fillStyle = isFree ? 'rgba(143, 163, 74, 0.28)' : 'rgba(224, 69, 47, 0.28)';
      ctx.fillRect(hx * cellSize, hy * cellSize, cellSize, cellSize);
      ctx.strokeStyle = isFree ? '#8fa34a' : '#e0452f';
      ctx.lineWidth = 2;
      ctx.strokeRect(hx * cellSize + 1, hy * cellSize + 1, cellSize - 2, cellSize - 2);

      // Draw tower range preview
      const baseDef = CONFIG.towers[this.placingTowerType];
      const rangePx = baseDef.range * cellSize;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.beginPath();
      ctx.arc((hx + 0.5) * cellSize, (hy + 0.5) * cellSize, rangePx, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // 7. Render Towers
    // Sorted by y so lower figures overlap the ones behind them; flyers on top
    for (const b of this.binders) {
      this.renderBinder(ctx, b, cellSize, timeSec);
    }
    const towersByDepth = [...this.towers].sort((a, b) => a.y - b.y);
    for (const t of towersByDepth) {
      this.renderTower(ctx, t, cellSize, timeSec);
    }

    // 8. Render Enemies
    this.renderCorpses(ctx, timeSec);
    const enemiesByDepth = [...this.enemies].sort((a, b) => Number(a.isFlyer) - Number(b.isFlyer) || a.y - b.y);
    for (const e of enemiesByDepth) {
      this.renderEnemy(ctx, e, CONFIG.palettes[this.faction - 1].enemies, timeSec);
    }

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
      ctx.fillStyle = `rgba(0, 0, 0, ${alpha * 0.8})`;
      ctx.fillText(ft.text, ft.x + 1, ft.y + 1);
      ctx.fillStyle = ft.color;
      ctx.globalAlpha = alpha;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.globalAlpha = 1;
    }
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
    const x0 = c.x * cellSize;
    const y0 = c.y * cellSize;
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

  // -------------------------------------------------------------
  // Entity Drawing
  // -------------------------------------------------------------
  // «Связка»: stone plinth with two interlocked rings slowly turning
  private renderBinder(ctx: CanvasRenderingContext2D, b: Binder, cellSize: number, timeSec: number) {
    const cx = (b.x + 0.5) * cellSize;
    const cy = (b.y + 0.5) * cellSize;
    const color = CONFIG.binder.color;
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

  private renderTower(ctx: CanvasRenderingContext2D, t: Tower, cellSize: number, timeSec: number) {
    const spr = sprites.get(`tower_${t.type}`);
    if (spr) {
      this.renderTowerSprite(ctx, t, cellSize, spr, timeSec);
      return;
    }
    this.renderTowerShape(ctx, t, cellSize);
  }

  // Idle breathing plus a short squash and lean back after each shot
  private towerPose(t: Tower, part: TowerPart, timeSec: number): SpritePose {
    const breath = Math.sin(timeSec * 2.2 + t.x * 1.7 + t.y * 2.3) * 0.012;
    const since = part.shotAt === undefined ? 1 : timeSec - part.shotAt;
    const k = since < 0.18 ? 1 - since / 0.18 : 0;
    return { sy: 1 + breath - 0.07 * k, sx: 1 + 0.04 * k, tilt: -t.facing * 0.05 * k };
  }

  private renderTowerSprite(ctx: CanvasRenderingContext2D, t: Tower, cellSize: number, spr: PreparedSprite, timeSec: number) {
    const cx = (t.x + 0.5) * cellSize;
    const cy = (t.y + 0.5) * cellSize;
    const baseDef = CONFIG.towers[t.type];
    const ringY = cy + 22;

    // Ground shadow, level 3 glow, back half of level rings
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 25, 25, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    if (t.level >= 3) {
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
    };
    if (t.second) {
      // Binding ring under both figures
      ctx.strokeStyle = CONFIG.binder.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cx, ringY + 2, 30, 9, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    rings(Math.PI, Math.PI * 2);

    if (t.second) {
      // Second figure smaller, at the right; the main one shifted left
      const spr2 = sprites.get(`tower_${t.second.type}`);
      drawSprite(ctx, spr, cx - 9, cy + 30, t.facing, 56, this.towerPose(t, t, timeSec));
      if (spr2) drawSprite(ctx, spr2, cx + 15, cy + 30, t.facing, 48, this.towerPose(t, t.second, timeSec));
    } else {
      drawSprite(ctx, spr, cx, cy + 30, t.facing, 62, this.towerPose(t, t, timeSec));
    }

    // Front half of the rings over the pedestal
    rings(0, Math.PI);

    const allSpecs = t.second ? [...t.specs, ...t.second.specs] : t.specs;
    if (allSpecs.length > 0) {
      const badge = specBadge(allSpecs);
      // A bound tower keeps the badge above the second figure
      const bx = cx + 21 - (badge.length - 1) * 3;
      const by = t.second ? cy - 24 : cy + 20;
      const halfW = (badge.length - 1) * 3.5;
      ctx.fillStyle = '#121118';
      ctx.beginPath();
      ctx.roundRect(bx - 7 - halfW, by - 7, 14 + halfW * 2, 14, 7);
      ctx.fill();
      ctx.strokeStyle = '#f4c06a';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#f4c06a';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badge, bx, by + 0.5);
      ctx.textBaseline = 'alphabetic';
    }

    if (t.frozenTimer > 0) {
      ctx.fillStyle = 'rgba(127, 200, 240, 0.45)';
      ctx.fillRect(t.x * cellSize + 2, t.y * cellSize + 2, cellSize - 4, cellSize - 4);
      ctx.strokeStyle = '#7fc8f0';
      ctx.lineWidth = 2;
      ctx.strokeRect(t.x * cellSize + 2, t.y * cellSize + 2, cellSize - 4, cellSize - 4);
    }
  }

  // Fallback figure when the sprite is not loaded
  private renderTowerShape(ctx: CanvasRenderingContext2D, t: Tower, cellSize: number) {
    const cx = (t.x + 0.5) * cellSize;
    const cy = (t.y + 0.5) * cellSize;
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

    // Specialization badge (small icon/letter on tower)
    const allSpecs = t.second ? [...t.specs, ...t.second.specs] : t.specs;
    if (allSpecs.length > 0) {
      const specLetters = specBadge(allSpecs);
      const halfW = (specLetters.length - 1) * 3.5;
      ctx.fillStyle = '#121118';
      ctx.beginPath();
      ctx.roundRect(cx - 6 - halfW, cy - 6, 12 + halfW * 2, 12, 6);
      ctx.fill();
      ctx.fillStyle = '#f4c06a';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(specLetters, cx, cy);
      ctx.textBaseline = 'alphabetic';
    }

    // Frozen visual tint (Ice Priest Boss ability)
    if (t.frozenTimer > 0) {
      ctx.fillStyle = 'rgba(127, 200, 240, 0.45)';
      ctx.fillRect(t.x * cellSize + 2, t.y * cellSize + 2, cellSize - 4, cellSize - 4);
      ctx.strokeStyle = '#7fc8f0';
      ctx.lineWidth = 2;
      ctx.strokeRect(t.x * cellSize + 2, t.y * cellSize + 2, cellSize - 4, cellSize - 4);
    }
  }

  // Faction figure (enemy_<type>_<level>) is drawn in its own colors; otherwise the common one gets the faction tint
  private enemySprite(e: Enemy): { name: string; tint: string | null } {
    const isBoss = e.type === 'boss';
    const isImp = e.type === 'imp';
    const factionName = `enemy_${e.type}_${this.faction}`;
    const hasFaction = !isBoss && !isImp && sprites.has(factionName);
    const name = isBoss ? `boss_${this.faction}` : isImp ? 'enemy_scout' : hasFaction ? factionName : `enemy_${e.type}`;
    const tint = isBoss || hasFaction ? null : isImp ? '#e0452f' : CONFIG.palettes[this.faction - 1].enemies;
    return { name, tint };
  }

  private enemyFoot(e: Enemy, h: number): number {
    return e.isFlyer ? e.y + 8 : e.y + h * 0.4;
  }

  // Walking: a hop and a lean per step, driven by the path covered (stops when the enemy stops);
  // flyers hover and flap
  private enemyPose(e: Enemy, timeSec: number): SpritePose {
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
      drawSprite(ctx, spr, c.x, c.footY + p * 3, c.facing, c.h, {
        tilt: -c.facing * Math.pow(p, 0.6) * 1.3,
        sy: 1 - 0.15 * p,
      });
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
    }
  }

  // Under the feet: an icy ring while slowed, a violet one while cursed
  private renderStatusUnder(ctx: CanvasRenderingContext2D, e: Enemy, footY: number, rx: number, timeSec: number) {
    if (e.slowPercent <= 0 && e.curseTimer <= 0) return;
    ctx.save();
    ctx.lineWidth = 2;
    if (e.slowPercent > 0) {
      ctx.globalAlpha = 0.35 + 0.5 * Math.min(1, e.slowPercent / 0.5);
      ctx.strokeStyle = SLOW_COLOR;
      ctx.fillStyle = 'rgba(143, 212, 255, 0.18)';
      ctx.beginPath();
      ctx.ellipse(e.x, footY - 1, rx, rx * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
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
    }
  }
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
