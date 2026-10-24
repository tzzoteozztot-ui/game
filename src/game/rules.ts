/**
 * Core Game Rules & Formulas for «Тёмный рубеж»
 */

import { CONFIG, TowerType, Difficulty, EnemyType } from './config';

export function calculateStartingGold(level: number, difficulty: Difficulty): number {
  const diffMult = CONFIG.difficulty[difficulty].goldMult;
  return Math.floor((200 + 25 * (level - 1)) * diffMult);
}

export function calculateEnemyHp(
  baseHp: number,
  type: EnemyType,
  wave: number,
  level: number,
  difficulty: Difficulty
): number {
  const diffMult = CONFIG.difficulty[difficulty].hpMult;
  const levelMult = 1 + 0.3 * (level - 1);
  if (type === 'boss') {
    // Boss does not scale with wave
    return Math.round(baseHp * levelMult * diffMult);
  }
  const waveMult = 1 + 0.15 * (wave - 1);
  return Math.round(baseHp * waveMult * levelMult * diffMult);
}

export function calculateEnemyCount(tableCount: number, level: number): number {
  return Math.ceil(tableCount * (1 + 0.2 * (level - 1)));
}

export function calculateKillGold(baseGold: number, level: number): number {
  return Math.round(baseGold * (1 + 0.15 * (level - 1)));
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
  isFireSpec?: boolean;
  factionId: number; // 1: Orcs, 2: Undead, 3: Ice Cultists, 4: Demons, 5: Dark Elves
  isTargetHeavyOrBoss?: boolean;
  isHunterSpec?: boolean;
  isRamSpec?: boolean;
  isSiegeSpec?: boolean;
  isExecuteSpec?: boolean;
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

  // Hunter specialization (Archer): x2 against heavy & boss
  if (params.isHunterSpec && params.isTargetHeavyOrBoss) {
    baseDmg *= 2.0;
  }

  // Execute specialization (Ballista):
  // Target with hp < 25% max dies immediately; boss instead takes +50% damage
  if (params.isExecuteSpec) {
    if (params.isTargetBoss) {
      baseDmg *= 1.5;
    } else if (
      params.targetCurrentHp !== undefined &&
      params.targetMaxHp !== undefined &&
      params.targetCurrentHp < params.targetMaxHp * 0.25
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
    finalDmg *= 1.25;
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
