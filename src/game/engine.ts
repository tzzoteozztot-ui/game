/**
 * 60 FPS Game Engine & Canvas Renderer for «Тёмный рубеж»
 */

import { CONFIG, TowerType, TargetPriority, Difficulty, EnemyType } from './config';
import { MAPS, Point, MapDef } from './maps';
import {
  calculateDamage,
  calculateEffectiveSlow,
  calculateEnemyHp,
  calculateEnemyCount,
  calculateKillGold,
  calculateWaveClearReward,
  calculateSellRefund,
} from './rules';
import { sound } from './audio';

// -------------------------------------------------------------
// Entity Interfaces
// -------------------------------------------------------------

export interface Tower {
  id: string;
  x: number; // grid cell x
  y: number; // grid cell y
  type: TowerType;
  level: number; // 1, 2, 3
  spec: string | null;
  priority: TargetPriority;
  cooldownTimer: number; // seconds until ready
  frozenTimer: number; // frozen by Ice Priest boss
  smiteTimer: number; // priest smite pulse timer
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
}

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
  spec: string | null;
  isRam: boolean;
  isSiege: boolean;
  isExecute: boolean;
  isFire: boolean;
  isFrost: boolean;
  isCurse: boolean;
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
  selectedTower: Tower | null;
  eligibleMergeCount: number;
}

export class GameEngine {
  public canvas: HTMLCanvasElement | null = null;
  public ctx: CanvasRenderingContext2D | null = null;

  // State
  public level: number = 1;
  public difficulty: Difficulty = 'normal';
  public lives: number = CONFIG.lives.start;
  public gold: number = 200;
  public wave: number = 1;
  public tier: number = 1;
  public isPaused: boolean = false;
  public speedMultiplier: number = 1; // 1 or 2
  public isGameOver: boolean = false;
  public isVictory: boolean = false;

  // Entities
  public towers: Tower[] = [];
  public enemies: Enemy[] = [];
  public projectiles: Projectile[] = [];
  public floatingTexts: FloatingText[] = [];
  private particles: Particle[] = [];
  private grassBlades: GrassBlade[] = [];

  // Spawn state
  public isSpawning: boolean = false;
  public waveInProgress: boolean = false;
  public spawnQueue: { type: EnemyType; entrance: number }[] = [];
  private spawnTimer: number = 0;
  private currentEntranceIndex: number = 0;

  // Undead graveyard for Lich boss resurrection
  private deadEnemiesGraveyard: { x: number; y: number; time: number; type: EnemyType }[] = [];

  // Selection & Placement
  public selectedTowerId: string | null = null;
  public placingTowerType: TowerType | null = null;
  public placingIsTriplet: boolean = false;
  public pendingTripletSpec: string | null = null;
  public hoverCell: Point | null = null;

  // Callbacks to UI
  public onStateChange?: (snapshot: GameStateSnapshot) => void;
  public onNeedSpecChoice?: (tower: Tower) => void;

  private animFrameId: number | null = null;
  private lastTime: number = 0;
  private currentMap: MapDef = MAPS[0];

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
    // Logical dimensions: 768 x 512
    this.canvas.width = CONFIG.grid.totalWidth * dpr;
    this.canvas.height = CONFIG.grid.totalHeight * dpr;
    if (this.ctx) {
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  public startLevel(level: number, diff: Difficulty) {
    this.level = Math.max(1, Math.min(5, level));
    this.difficulty = diff;
    this.currentMap = MAPS[this.level - 1];
    this.lives = CONFIG.lives.start;
    this.gold = Math.floor((200 + 25 * (this.level - 1)) * CONFIG.difficulty[diff].goldMult);
    this.wave = 1;
    this.tier = 1;
    this.isPaused = false;
    this.speedMultiplier = 1;
    this.isGameOver = false;
    this.isVictory = false;

    this.towers = [];
    this.enemies = [];
    this.projectiles = [];
    this.floatingTexts = [];
    this.deadEnemiesGraveyard = [];
    for (const p of this.particles) p.active = false;

    this.isSpawning = false;
    this.waveInProgress = false;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.currentEntranceIndex = 0;

    this.selectedTowerId = null;
    this.placingTowerType = null;
    this.placingIsTriplet = false;
    this.pendingTripletSpec = null;
    this.hoverCell = null;

    this.generateGrass();
    this.notifyState();
    this.startLoop();
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

      if (!this.isPaused && !this.isGameOver && !this.isVictory) {
        const steps = this.speedMultiplier === 2 ? 2 : 1;
        for (let s = 0; s < steps; s++) {
          this.update(dt);
        }
      }

      this.render();
      this.animFrameId = requestAnimationFrame(frame);
    };
    this.animFrameId = requestAnimationFrame(frame);
  }

  public stopLoop() {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  public togglePause() {
    this.isPaused = !this.isPaused;
    this.notifyState();
  }

  public toggleSpeed() {
    this.speedMultiplier = this.speedMultiplier === 1 ? 2 : 1;
    this.notifyState();
  }

  // -------------------------------------------------------------
  // Wave Spawning
  // -------------------------------------------------------------
  public startNextWave(): boolean {
    if (this.isSpawning || this.isGameOver || this.isVictory) return false;
    if (this.wave > 12) return false;

    // Check if enemies from previous wave are still alive -> give +10 early bonus
    if (this.enemies.length > 0) {
      this.gold += 10;
      this.addFloatingText('+10 за ранний старт', CONFIG.grid.totalWidth / 2, 40, '#f4c06a');
      sound.playBuy();
    }

    const waveDef = CONFIG.waves[this.wave - 1];
    this.spawnQueue = [];

    // Helper to calculate count
    const getCount = (count?: number) =>
      count ? calculateEnemyCount(count, this.level) : 0;

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
    this.notifyState();
    return true;
  }

  private spawnEnemy(type: EnemyType, entranceIdx: number) {
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

    const hp = calculateEnemyHp(baseDef.hp, type, this.wave, this.level, this.difficulty);
    const gold = calculateKillGold(baseDef.gold, this.level);

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
      rageTriggered: false,
      warcryTimer: 0,
      hasRevived: false,
      isReviving: false,
      reviveTimer: 0,
      invulnerableTimer: 0,
      dashTimer: 0,
      bossAbilityTimer: 0,
      hitFlashTimer: 0,
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
          this.spawnEnemy(next.type, next.entrance);
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
      if (this.wave <= 12) {
        // Wave cleared!
        const reward = calculateWaveClearReward(this.wave);
        this.gold += reward;
        this.addFloatingText(`Волна ${this.wave} зачищена! +${reward} золота`, CONFIG.grid.totalWidth / 2, 80, '#f4c06a');
        sound.playBuy();

        if (this.wave === 12) {
          // Level Completed!
          this.isVictory = true;
          sound.playVictory();
          this.notifyState();
          return;
        } else {
          this.wave++;
          this.notifyState();
        }
      }
    }

    // 3. Update towers & attack
    for (const tower of this.towers) {
      if (tower.frozenTimer > 0) {
        tower.frozenTimer -= dt;
        continue;
      }
      if (tower.cooldownTimer > 0) {
        tower.cooldownTimer -= dt;
      }
      if (tower.spec === 'smite') {
        tower.smiteTimer -= dt;
        if (tower.smiteTimer <= 0) {
          this.triggerPriestSmite(tower);
          tower.smiteTimer = 2.5;
        }
      } else if (tower.cooldownTimer <= 0) {
        this.towerAttack(tower);
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
              this.applyDamageToEnemy(e, p.damage, p.damageType, p.towerType, p.spec);
              this.spawnSpark(e.x, e.y, '#c9663a');
            }
          }
        }

        const traveled = Math.hypot(p.currentX - p.startX, p.currentY - p.startY);
        if (traveled > len + 32) {
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
        if (this.level === 4) burnDmg *= 0.5;
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
      if (this.level === 1 && e.hp < e.maxHp * 0.5) {
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

        if (dist < 12 || e.x >= 11 * CONFIG.grid.cellSize) {
          // Reached castle!
          this.damageCastle(e, i);
          continue;
        }

        const moveStep = speed * dt;
        e.x += (dx / dist) * moveStep;
        e.y += (dy / dist) * moveStep;
        e.distanceTraveled += moveStep;
      } else {
        // Follow map road path
        const path = this.currentMap.paths[e.entranceIndex];
        const nextCell = path[e.pathIndex + 1];

        if (!nextCell) {
          // Reached end of road at x=10, move straight into castle (x=11)
          e.x += speed * dt;
          e.distanceTraveled += speed * dt;
          if (e.x >= 11 * CONFIG.grid.cellSize) {
            this.damageCastle(e, i);
            continue;
          }
        } else {
          const targetPxX = (nextCell.x + 0.5) * CONFIG.grid.cellSize;
          const targetPxY = (nextCell.y + 0.5) * CONFIG.grid.cellSize;
          const dx = targetPxX - e.x;
          const dy = targetPxY - e.y;
          const dist = Math.hypot(dx, dy);
          const moveStep = speed * dt;

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
    if (this.level === 1 && boss.bossAbilityTimer >= 10) {
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
    if (this.level === 2 && boss.bossAbilityTimer >= 12) {
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
          this.spawnEnemy(g.type, boss.entranceIndex);
          const newSpawn = this.enemies[this.enemies.length - 1];
          newSpawn.x = g.x;
          newSpawn.y = g.y;
          newSpawn.hp = Math.round(newSpawn.maxHp * 0.3);
          this.spawnRing(g.x, g.y, '#c9d6b0');
        }
      }
    }

    // Level 3: Ледяной жрец (Ice Priest) - every 12s freezes closest tower for 4s
    if (this.level === 3 && boss.bossAbilityTimer >= 12) {
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
    if (this.level === 4 && boss.bossAbilityTimer >= 10) {
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
    if (this.level === 5 && boss.bossAbilityTimer >= 15) {
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
  private towerAttack(tower: Tower) {
    const baseDef = CONFIG.towers[tower.type];
    const towerPxX = (tower.x + 0.5) * CONFIG.grid.cellSize;
    const towerPxY = (tower.y + 0.5) * CONFIG.grid.cellSize;

    // Range calculation
    let rangeCells = baseDef.range;
    if (tower.level >= 2) rangeCells *= CONFIG.upgrade.lvl2RangeMult;
    if (tower.level >= 3) rangeCells *= CONFIG.upgrade.lvl3RangeMult;
    if (tower.spec === 'sniper') rangeCells *= 1.6;
    const rangePx = rangeCells * CONFIG.grid.cellSize;

    // Damage calculation
    let rawDamage = baseDef.damage;
    if (tower.level >= 2) rawDamage *= CONFIG.upgrade.lvl2DamageMult;
    if (tower.level >= 3) rawDamage *= CONFIG.upgrade.lvl3DamageMult;
    if (tower.spec === 'sniper') rawDamage *= 1.8;
    if (tower.spec === 'arrow_hail') rawDamage *= 0.8;
    if (tower.spec === 'frost') rawDamage *= 0.8;
    if (tower.spec === 'ram') rawDamage *= 0.8;
    if (tower.spec === 'siege') rawDamage *= 0.9;

    // Cooldown calculation
    let cooldown = baseDef.cooldown;
    if (tower.spec === 'sniper') cooldown *= 1.6;
    if (tower.spec === 'arrow_hail') cooldown *= 0.6;
    if (tower.spec === 'siege') cooldown *= 1.15;

    // Find enemies in range
    const inRange = this.enemies.filter((e) => {
      if (e.isReviving) return false;
      const d = Math.hypot(e.x - towerPxX, e.y - towerPxY);
      return d <= rangePx;
    });

    if (inRange.length === 0) return;

    // Sort according to priority
    this.sortEnemiesByPriority(inRange, tower.priority, towerPxX, towerPxY);

    // Number of targets
    let targetCount = 1;
    if (tower.spec === 'arrow_hail') {
      targetCount = tower.level >= 3 ? 3 : 2;
    }

    const targets = inRange.slice(0, targetCount);

    for (const target of targets) {
      sound.playShot(tower.type);

      if (tower.spec === 'ram') {
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
          towerType: tower.type,
          spec: tower.spec,
          isRam: true,
          isSiege: false,
          isExecute: false,
          isFire: false,
          isFrost: false,
          isCurse: false,
          piercedEnemyIds: new Set<string>(),
        });
      } else if (tower.spec === 'lightning') {
        // Chain lightning: hits target + up to 3 (or 4 at lvl3) additional bounces
        this.triggerLightningChain(tower, target, rawDamage, towerPxX, towerPxY);
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
          speed: tower.type === 'ballista' ? 520 : 380,
          damage: rawDamage,
          damageType: baseDef.damageType,
          towerType: tower.type,
          spec: tower.spec,
          isRam: false,
          isSiege: tower.spec === 'siege',
          isExecute: tower.spec === 'execute',
          isFire: tower.spec === 'fire',
          isFrost: tower.spec === 'frost',
          isCurse: tower.spec === 'curse',
          piercedEnemyIds: new Set<string>(),
        });
      }
    }

    tower.cooldownTimer = cooldown;
  }

  // Priest Smite: pulses every 2.5s hitting all enemies in radius with damage * 2.5
  private triggerPriestSmite(tower: Tower) {
    const baseDef = CONFIG.towers.priest;
    const towerPxX = (tower.x + 0.5) * CONFIG.grid.cellSize;
    const towerPxY = (tower.y + 0.5) * CONFIG.grid.cellSize;

    let rangeCells = baseDef.range;
    if (tower.level >= 2) rangeCells *= CONFIG.upgrade.lvl2RangeMult;
    if (tower.level >= 3) rangeCells *= CONFIG.upgrade.lvl3RangeMult;
    const rangePx = rangeCells * CONFIG.grid.cellSize;

    let rawDamage = baseDef.damage * 2.5;
    if (tower.level >= 2) rawDamage *= CONFIG.upgrade.lvl2DamageMult;
    if (tower.level >= 3) rawDamage *= CONFIG.upgrade.lvl3DamageMult;

    sound.playShot('priest');
    this.spawnRing(towerPxX, towerPxY, '#f2f0e0');

    for (const e of this.enemies) {
      if (e.isReviving) return;
      if (Math.hypot(e.x - towerPxX, e.y - towerPxY) <= rangePx) {
        this.applyDamageToEnemy(e, rawDamage, 'mag', 'priest', 'smite');
        this.spawnSpark(e.x, e.y, '#f2f0e0');
      }
    }
  }

  // Mage Lightning Chain: jumps 4 targets (lvl3: 5), each taking 75% of previous
  private triggerLightningChain(tower: Tower, firstTarget: Enemy, rawDamage: number, startX: number, startY: number) {
    const maxBounces = tower.level >= 3 ? 5 : 4;
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
    let prevX = startX;
    let prevY = startY;

    for (const target of chainTargets) {
      this.spawnSpark(target.x, target.y, '#8f6bff');
      this.applyDamageToEnemy(target, currentDmg, 'mag', 'mage', 'lightning');
      currentDmg *= 0.75;
      prevX = target.x;
      prevY = target.y;
    }
  }

  private handleProjectileImpact(p: Projectile, target: Enemy | null, impactX: number, impactY: number) {
    sound.playHit();
    this.spawnSpark(impactX, impactY, p.damageType === 'mag' ? '#8f6bff' : '#d9b44a');

    const isAoe = p.towerType === 'mage' || p.isSiege;
    if (isAoe) {
      let aoeRadiusCells = 0.9;
      if (p.isFire) aoeRadiusCells = 0.9 * 1.4;
      if (p.isFrost) aoeRadiusCells = 0.9 * 1.2;
      if (p.isSiege) aoeRadiusCells = 1.0;
      const aoeRadiusPx = aoeRadiusCells * CONFIG.grid.cellSize;

      this.spawnRing(impactX, impactY, p.isFire ? '#ff4a2f' : p.isFrost ? '#7fc8f0' : '#8f6bff');

      for (const e of this.enemies) {
        if (e.isReviving) continue;
        if (Math.hypot(e.x - impactX, e.y - impactY) <= aoeRadiusPx) {
          this.applyDamageToEnemy(e, p.damage, p.damageType, p.towerType, p.spec);
        }
      }
    } else if (target && !target.isReviving) {
      this.applyDamageToEnemy(target, p.damage, p.damageType, p.towerType, p.spec);
    }
  }

  private applyDamageToEnemy(
    e: Enemy,
    rawDmg: number,
    dmgType: 'phys' | 'mag',
    towerType: TowerType,
    spec: string | null
  ) {
    if (e.invulnerableTimer > 0) return;

    const res = calculateDamage({
      rawDamage: rawDmg,
      damageType: dmgType,
      targetArmor: e.armor,
      targetMagicResist: e.magicResist,
      isCursed: e.curseTimer > 0,
      isFireSpec: spec === 'fire',
      factionId: this.level,
      isTargetHeavyOrBoss: e.type === 'heavy' || e.type === 'boss',
      isHunterSpec: spec === 'hunter',
      isExecuteSpec: spec === 'execute',
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

    // Apply specialization secondary effects:
    if (spec === 'fire') {
      // Burn 30% of shot damage per second for 3s (non-stacking)
      e.burnDps = rawDmg * 0.3;
      e.burnTimer = 3.0;
    }

    if (spec === 'frost') {
      // Slow 35% for 2s
      const effectiveSlow = calculateEffectiveSlow(0.35, this.level);
      if (effectiveSlow > e.slowPercent) {
        e.slowPercent = effectiveSlow;
        e.slowTimer = 2.0;
      }
    }

    if (towerType === 'priest') {
      if (spec === 'ward') {
        // Slow 50% for 2.5s
        const effectiveSlow = calculateEffectiveSlow(0.5, this.level);
        if (effectiveSlow > e.slowPercent) {
          e.slowPercent = effectiveSlow;
          e.slowTimer = 2.5;
        }
      } else if (spec === 'curse') {
        // Curse +25% damage from all sources for 4s
        e.curseTimer = 4.0;
        this.addFloatingText('ПРОКЛЯТИЕ', e.x, e.y - 10, '#f2f0e0');
      } else if (spec !== 'smite') {
        // Default priest: slow 25% for 2s
        const effectiveSlow = calculateEffectiveSlow(0.25, this.level);
        if (effectiveSlow > e.slowPercent) {
          e.slowPercent = effectiveSlow;
          e.slowTimer = 2.0;
        }
      }
    }

    if (e.hp <= 0) {
      const idx = this.enemies.indexOf(e);
      if (idx !== -1) {
        this.killEnemy(e, idx);
      }
    }
  }

  private killEnemy(e: Enemy, index: number) {
    // Undead trait: infantry and scout revive once after 1s with 30% HP
    if (this.level === 2 && !e.hasRevived && (e.type === 'infantry' || e.type === 'scout')) {
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
    this.spawnPuff(e.x, e.y, CONFIG.palettes[this.level - 1].enemies);

    // Save to graveyard for Lich boss
    if (this.level === 2 && e.type !== 'boss') {
      this.deadEnemiesGraveyard.push({
        x: e.x,
        y: e.y,
        time: performance.now() / 1000,
        type: e.type,
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
    this.addFloatingText(`-${cost} ЖИЗНИ`, CONFIG.grid.totalWidth - 48, (CONFIG.grid.castleTarget.y) * CONFIG.grid.cellSize, '#e0452f');

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
      spec: this.placingIsTriplet ? this.pendingTripletSpec : null,
      priority: 'first',
      cooldownTimer: 0,
      frozenTimer: 0,
      smiteTimer: 2.5,
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
    // Check castle
    if (CONFIG.grid.castleCells.some((c) => c.x === cx && c.y === cy)) return false;
    // Check road
    for (const p of this.currentMap.paths) {
      if (p.some((c) => c.x === cx && c.y === cy)) return false;
    }
    // Check existing tower
    if (this.towers.some((t) => t.x === cx && t.y === cy)) return false;
    return true;
  }

  public selectTower(id: string | null) {
    this.selectedTowerId = id;
    this.placingTowerType = null;
    this.notifyState();
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
    const baseCost = CONFIG.towers[tower.type].cost;
    const refund = calculateSellRefund(baseCost, tower.level);

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
    if (selected.level >= 3) return [];
    return this.towers.filter(
      (t) =>
        t.type === selected.type &&
        t.level === selected.level &&
        (selected.level === 1 || t.spec === selected.spec)
    );
  }

  public mergeSelectedTower(): boolean {
    if (!this.selectedTowerId) return false;
    const selected = this.towers.find((t) => t.id === this.selectedTowerId);
    if (!selected || selected.level >= 3) return false;

    const eligible = this.getEligibleMergeTowers(selected);
    if (eligible.length < 3) return false;

    // Selected tower stays, pick 2 closest eligible to merge into it
    const others = eligible.filter((t) => t.id !== selected.id);
    others.sort((a, b) => {
      const dA = Math.hypot(a.x - selected.x, a.y - selected.y);
      const dB = Math.hypot(b.x - selected.x, b.y - selected.y);
      return dA - dB;
    });

    const mergePair = others.slice(0, 2);

    // Remove the two towers
    for (const m of mergePair) {
      const idx = this.towers.indexOf(m);
      if (idx !== -1) {
        this.towers.splice(idx, 1);
        this.spawnPuff((m.x + 0.5) * CONFIG.grid.cellSize, (m.y + 0.5) * CONFIG.grid.cellSize, '#f4c06a');
      }
    }

    selected.level += 1;
    sound.playMerge();
    this.spawnRing((selected.x + 0.5) * CONFIG.grid.cellSize, (selected.y + 0.5) * CONFIG.grid.cellSize, '#f4c06a');
    this.addFloatingText('СЛИЯНИЕ!', (selected.x + 0.5) * CONFIG.grid.cellSize, (selected.y + 0.5) * CONFIG.grid.cellSize - 16, '#f4c06a');

    if (selected.level === 2 && !selected.spec) {
      // Immediate mandatory specialization choice modal
      if (this.onNeedSpecChoice) {
        this.onNeedSpecChoice(selected);
      }
    }

    this.notifyState();
    return true;
  }

  public setTowerSpecialization(towerId: string, specId: string) {
    const tower = this.towers.find((t) => t.id === towerId);
    if (!tower) return;
    tower.spec = specId;
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

  public spawnRing(x: number, y: number, color: string) {
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
    const eligibleCount = selected ? this.getEligibleMergeTowers(selected).length : 0;

    this.onStateChange({
      lives: this.lives,
      gold: this.gold,
      level: this.level,
      wave: this.wave,
      maxWaves: 12,
      tier: this.tier,
      isWaveActive: this.waveInProgress || this.isSpawning || this.enemies.length > 0,
      isSpawning: this.isSpawning,
      isGameOver: this.isGameOver,
      isVictory: this.isVictory,
      isPaused: this.isPaused,
      selectedTower: selected,
      eligibleMergeCount: eligibleCount,
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

    // 2. Roads
    ctx.fillStyle = palette.road;
    for (const path of this.currentMap.paths) {
      for (const c of path) {
        ctx.fillRect(c.x * cellSize, c.y * cellSize, cellSize, cellSize);
      }
    }

    // Road borders / subtle inner contour
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.lineWidth = 1;
    for (const path of this.currentMap.paths) {
      for (const c of path) {
        ctx.strokeRect(c.x * cellSize + 0.5, c.y * cellSize + 0.5, cellSize - 1, cellSize - 1);
      }
    }

    // 3. Castle Cells (x=11, y=2..5)
    for (const c of CONFIG.grid.castleCells) {
      ctx.fillStyle = '#2a2233';
      ctx.fillRect(c.x * cellSize, c.y * cellSize, cellSize, cellSize);
      ctx.fillStyle = '#3f324c';
      ctx.fillRect(c.x * cellSize + 4, c.y * cellSize + 4, cellSize - 8, cellSize - 8);

      // Battlements
      ctx.fillStyle = '#554266';
      ctx.fillRect(c.x * cellSize + 6, c.y * cellSize + 6, 12, 12);
      ctx.fillRect(c.x * cellSize + cellSize - 18, c.y * cellSize + 6, 12, 12);
      ctx.fillRect(c.x * cellSize + 6, c.y * cellSize + cellSize - 18, 12, 12);
      ctx.fillRect(c.x * cellSize + cellSize - 18, c.y * cellSize + cellSize - 18, 12, 12);
    }

    // Castle Gate / Core Glow
    const castleMidY = CONFIG.grid.castleTarget.y * cellSize;
    ctx.fillStyle = palette.light;
    ctx.beginPath();
    ctx.arc(11 * cellSize + 2, castleMidY, 8, 0, Math.PI * 2);
    ctx.fill();

    // 4. Grass blades (swaying gently)
    const timeSec = performance.now() / 1000;
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
      // Highlight eligible merge towers
      const eligible = this.getEligibleMergeTowers(selectedTower);
      ctx.strokeStyle = '#f4c06a';
      ctx.lineWidth = 2.5;
      for (const el of eligible) {
        ctx.strokeRect(el.x * cellSize + 2, el.y * cellSize + 2, cellSize - 4, cellSize - 4);
      }

      // Draw attack range circle for selected tower
      const baseDef = CONFIG.towers[selectedTower.type];
      let rangeCells = baseDef.range;
      if (selectedTower.level >= 2) rangeCells *= CONFIG.upgrade.lvl2RangeMult;
      if (selectedTower.level >= 3) rangeCells *= CONFIG.upgrade.lvl3RangeMult;
      if (selectedTower.spec === 'sniper') rangeCells *= 1.6;
      const rangePx = rangeCells * cellSize;

      ctx.fillStyle = 'rgba(244, 192, 106, 0.09)';
      ctx.strokeStyle = 'rgba(244, 192, 106, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc((selectedTower.x + 0.5) * cellSize, (selectedTower.y + 0.5) * cellSize, rangePx, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // 6. Placement preview when placing tower
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
    for (const t of this.towers) {
      this.renderTower(ctx, t, cellSize);
    }

    // 8. Render Enemies
    for (const e of this.enemies) {
      this.renderEnemy(ctx, e, palette.enemies);
    }

    // 9. Render Projectiles
    for (const p of this.projectiles) {
      this.renderProjectile(ctx, p);
    }

    // 10. Render Particles
    for (const p of this.particles) {
      if (!p.active) continue;
      if (p.type === 'ring') {
        const rad = p.size + (p.life / p.maxLife) * 28;
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

  // -------------------------------------------------------------
  // Entity Drawing
  // -------------------------------------------------------------
  private renderTower(ctx: CanvasRenderingContext2D, t: Tower, cellSize: number) {
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

    // Specialization badge (small icon/letter on tower)
    if (t.spec) {
      ctx.fillStyle = '#121118';
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f4c06a';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const specLetter = t.spec[0].toUpperCase();
      ctx.fillText(specLetter, cx, cy);
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

  private renderEnemy(ctx: CanvasRenderingContext2D, e: Enemy, enemyColor: string) {
    if (e.isReviving) {
      // Ghostly reviving state
      ctx.fillStyle = 'rgba(201, 214, 176, 0.4)';
      ctx.beginPath();
      ctx.arc(e.x, e.y, 8, 0, Math.PI * 2);
      ctx.fill();
      return;
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

    // Health Bar:
    // Always visible for Boss; for others, only after taking damage (hp < maxHp)
    if (isBoss || e.hp < e.maxHp) {
      const barW = isBoss ? 48 : 24;
      const barH = isBoss ? 5 : 3;
      const barX = e.x - barW / 2;
      const barY = e.y - (isBoss ? 38 : 18);

      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);

      const pct = Math.max(0, Math.min(1, e.hp / e.maxHp));
      ctx.fillStyle = isBoss ? '#e0452f' : '#8fa34a';
      ctx.fillRect(barX, barY, barW * pct, barH);
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
      ctx.fillStyle = p.isFire ? '#ff4a2f' : p.isFrost ? '#7fc8f0' : '#8f6bff';
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
