/**
 * Core Game Rules & Formulas for «Тёмный рубеж»
 */

import { CONFIG, TowerType, Difficulty, EnemyType, WaveDef } from './config';

export function calculateStartingGold(level: number, difficulty: Difficulty): number {
  const diffMult = CONFIG.difficulty[difficulty].goldMult;
  return Math.floor((200 + 25 * (level - 1)) * diffMult);
}

export function calculateEnemyHp(
  baseHp: number,
  type: EnemyType,
  wave: number,
  level: number,
  difficulty: Difficulty,
  endless = false,
  faction = level // the enemies' faction: the level's own, in a duel the opponent's army
): number {
  const sc = CONFIG.enemyScaling;
  const diffMult = CONFIG.difficulty[difficulty].hpMult;
  const levelMult = 1 + sc.level * (level - 1);
  // Second half of the campaign is tougher (endless mode keeps its own growth)
  const lateMult = !endless && wave >= sc.lateFrom ? sc.lateHpMult : 1;
  const factionMult = endless ? CONFIG.endless.factionHpMult[faction] ?? 1 : 1;
  if (type === 'boss') {
    // Boss does not scale with wave; in endless mode it grows with every finished cycle
    const cycleMult = endless ? 1 + CONFIG.endless.bossHpPerCycle * endlessCycle(wave) : 1;
    return Math.round(baseHp * sc.hpMult * levelMult * diffMult * cycleMult * lateMult * factionMult);
  }
  const waveMult = enemyWaveMult(wave);
  return Math.round(baseHp * sc.hpMult * waveMult * levelMult * diffMult * lateMult * factionMult);
}

/** How much enemy HP grows with the wave number: 1 on wave 1 */
export function enemyWaveMult(wave: number): number {
  const sc = CONFIG.enemyScaling;
  const w = wave - 1;
  return 1 + sc.waveLinear * w + sc.waveQuad * w * w;
}

/** Enemies a duel player can send to the opponent; a swarm is sent as a whole group */
export type SendType = 'infantry' | 'scout' | 'heavy' | 'flyer' | 'shaman' | 'swarm';
export const SEND_TYPES: SendType[] = ['infantry', 'scout', 'heavy', 'flyer', 'shaman', 'swarm'];

/** Duel: price of one sent enemy (a swarm group) on this wave: 2 × kill gold, growing like its HP */
export function calculateSendPrice(type: SendType, wave: number, level: number): number {
  const group = type === 'swarm' ? CONFIG.swarmGroupCount : 1;
  const killGold = calculateKillGold(CONFIG.enemies[type].gold, level) * group;
  return Math.round(CONFIG.duel.sendPriceMult * killGold * enemyWaveMult(wave));
}

/** Duel: gold added to every later round by a send that cost `cost` */
export function calculateSendIncome(cost: number): number {
  return Math.floor(cost * CONFIG.duel.sendIncomeShare);
}

export function calculateEnemyCount(
  tableCount: number,
  level: number,
  wave = 1,
  endless = false,
  difficulty: Difficulty = 'normal',
  duel = false
): number {
  const cycleMult = endless ? 1 + CONFIG.endless.countPerCycle * endlessCycle(wave) : 1;
  const early = CONFIG.hardEarlyWaves;
  const earlyMult = difficulty === 'hard' && wave <= early.upTo ? early.countMult : 1;
  // Duel: half of the usual wave, the opponent's sends come on top (Артур)
  const duelMult = duel ? CONFIG.duel.waveCountMult : 1;
  return Math.ceil(tableCount * (1 + 0.2 * (level - 1)) * cycleMult * earlyMult * duelMult);
}

/** Endless mode: finished cycles of 12 waves before this wave (waves 1–12 → 0, 13–24 → 1…) */
export function endlessCycle(wave: number): number {
  return Math.floor((wave - 1) / CONFIG.waves.length);
}

/** Wave table entry: campaign waves 1–12; endless mode repeats them, the boss on every 12th */
export function waveDefinition(wave: number): WaveDef {
  return CONFIG.waves[(wave - 1) % CONFIG.waves.length];
}

export function calculateKillGold(baseGold: number, level: number): number {
  return Math.round(baseGold * (1 + 0.15 * (level - 1)));
}

/** Shop reroll price: grows with every reroll since the current wave started (Артур, тест баланса) */
export function calculateRerollCost(rerollsThisWave: number): number {
  return CONFIG.shop.rerollCost + CONFIG.shop.rerollStep * rerollsThisWave;
}

export function calculateWaveClearReward(wave: number): number {
  return 20 + 3 * wave;
}

export function calculateSellRefund(baseCost: number, level: number): number {
  // Lvl 1: 1 tower invested
  // Lvl 2: 3 towers invested (merged or bought as triplet)
  // Lvl 3: 9 towers invested (3 lvl2 towers)
  const count = level === 1 ? 1 : level === 2 ? 3 : 9;
  const totalInvested = baseCost * count;
  return Math.floor(totalInvested * CONFIG.upgrade.sellRatio);
}

export function calculateStars(remainingLives: number): number {
  if (remainingLives >= 15) return 3;
  if (remainingLives >= 8) return 2;
  return 1;
}

export interface DamageCalculationParams {
  rawDamage: number;
  damageType: 'phys' | 'mag';
  targetArmor: number;
  targetMagicResist: number;
  isCursed?: boolean;
  curseBonus?: number; // extra damage while cursed, default 0.25
  isFireSpec?: boolean;
  factionId: number; // 1: Orcs, 2: Undead, 3: Ice Cultists, 4: Demons, 5: Dark Elves
  isTargetHeavyOrBoss?: boolean;
  isHunterSpec?: boolean;
  hunterPower?: number; // copies of «Охотник», default 1
  isRamSpec?: boolean;
  isSiegeSpec?: boolean;
  isExecuteSpec?: boolean;
  executePower?: number; // copies of «Казнь», default 1
  isTargetBoss?: boolean;
  targetCurrentHp?: number;
  targetMaxHp?: number;
  // Deterministic random check for evasion:
  evasionRoll?: number; // 0..1
}

export interface DamageCalculationResult {
  damage: number;
  isEvaded: boolean;
  isExecuted: boolean;
}

export function calculateDamage(params: DamageCalculationParams): DamageCalculationResult {
  // Dark Elves (faction 5): 25% physical hits miss
  if (params.damageType === 'phys' && params.factionId === 5) {
    const roll = params.evasionRoll !== undefined ? params.evasionRoll : Math.random();
    if (roll < 0.25) {
      return { damage: 0, isEvaded: true, isExecuted: false };
    }
  }

  let baseDmg = params.rawDamage;

  // Hunter specialization (Archer): x2 against heavy & boss; each extra copy adds another x1
  if (params.isHunterSpec && params.isTargetHeavyOrBoss) {
    baseDmg *= 1 + (params.hunterPower ?? 1);
  }

  // Execute specialization (Ballista):
  // Target with hp < 25% max dies immediately; boss instead takes +50% damage
  // (n copies: threshold 25% + 10%·(n−1), at most 45%; boss bonus +50%·n)
  if (params.isExecuteSpec) {
    const power = params.executePower ?? 1;
    if (params.isTargetBoss) {
      baseDmg *= 1 + 0.5 * power;
    } else if (
      params.targetCurrentHp !== undefined &&
      params.targetMaxHp !== undefined &&
      params.targetCurrentHp < params.targetMaxHp * (0.25 + 0.1 * (power - 1))
    ) {
      return { damage: params.targetCurrentHp, isEvaded: false, isExecuted: true };
    }
  }

  // Demons (faction 4): Fire specialization damage (shot & burn) x0.5
  if (params.isFireSpec && params.factionId === 4) {
    baseDmg *= 0.5;
  }

  // Armor and Magic Resist reduction
  let finalDmg = 0;
  if (params.damageType === 'phys') {
    finalDmg = baseDmg * (1 - Math.min(0.9, params.targetArmor));
  } else {
    finalDmg = baseDmg * (1 - Math.min(0.9, params.targetMagicResist));
  }

  // Priest Curse: +25% damage from all sources for 4s
  if (params.isCursed) {
    finalDmg *= 1 + (params.curseBonus ?? 0.25);
  }

  return {
    damage: Math.max(1, Math.round(finalDmg * 10) / 10),
    isEvaded: false,
    isExecuted: false,
  };
}

export function calculateEffectiveSlow(slowFraction: number, factionId: number): number {
  // Cultists of ice (faction 3): all slows are half as effective
  if (factionId === 3) {
    return slowFraction * 0.5;
  }
  return slowFraction;
}
