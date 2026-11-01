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
  // The Abyss Lord's imp is a third of an infantryman of the same wave (Артур, 2026-10-27)
  if (type === 'imp') {
    const infantry = calculateEnemyHp(CONFIG.enemies.infantry.hp, 'infantry', wave, level, difficulty, endless, faction);
    return Math.round(infantry * CONFIG.impHpShare);
  }
  const sc = CONFIG.enemyScaling;
  const diffMult = CONFIG.difficulty[difficulty].hpMult;
  const levelMult = 1 + sc.level * (level - 1);
  // Second half of the campaign is tougher (endless mode keeps its own growth)
  const lateMult = !endless && wave >= sc.lateFrom ? sc.lateHpMult : 1;
  const factionMult = endless ? CONFIG.endless.factionHpMult[faction] ?? 1 : 1;
  if (type === 'boss') {
    // The campaign boss does not scale with wave; in endless mode it grows with the wave like the others,
    // and from the second cycle on is tougher by bossFactor (the first boss, wave 12, is the campaign one)
    const growth = endless ? (enemyWaveMult(wave) / enemyWaveMult(CONFIG.waves.length)) * endlessGrowth(wave) : 1;
    const factor = endless && wave > CONFIG.waves.length ? CONFIG.endless.bossFactor : 1;
    return Math.round(baseHp * sc.hpMult * levelMult * diffMult * growth * factor * lateMult * factionMult);
  }
  const waveMult = enemyWaveMult(wave) * (endless ? endlessGrowth(wave) : 1);
  return Math.round(baseHp * sc.hpMult * waveMult * levelMult * diffMult * lateMult * factionMult);
}

/** Endless mode: extra HP growth of every wave past the 12th, 1 up to wave 12 */
export function endlessGrowth(wave: number): number {
  return Math.pow(1 + CONFIG.endless.hpGrowthPerWave, Math.max(0, wave - CONFIG.waves.length));
}

/** Endless mode: armor and magic resist added to every enemy, growing per finished cycle */
export function endlessArmorBonus(wave: number): number {
  return Math.min(CONFIG.endless.armorCap, CONFIG.endless.armorPerCycle * endlessCycle(wave));
}

/** Value of one tower or binder on the table: a bought Ур.1 is 1, merged Ур.2 is 3, Ур.3 is 9 */
export function calculateSupplyPower(towerLevels: number[], binders: number, tripleBinders: number, merge = 3): number {
  const s = CONFIG.supply;
  let power = binders * s.binderPower + tripleBinders * s.tripleBinderPower;
  // Люди: 1/3/9; other factions count the towers merged into one: merge^(level−1)
  for (const level of towerLevels) {
    const l = Math.min(3, Math.max(1, level));
    power += merge === 3 ? s.towerPower[l - 1] : Math.pow(merge, l - 1);
  }
  return power;
}

/** Price multiplier of buying towers and binders at this supply: ×growth for every full step above `free` */
export function calculateSupplyMult(power: number, own?: { free: number; step: number; growth: number }): number {
  const s = own ?? CONFIG.supply;
  return Math.pow(s.growth, Math.floor(Math.max(0, power - s.free) / s.step));
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

export function calculateKillGold(baseGold: number, level: number, wave = 0, decay = false): number {
  const s = CONFIG.supply;
  const mult = decay && wave > s.killDecayFrom ? Math.max(s.killFloor, Math.pow(s.killDecay, wave - s.killDecayFrom)) : 1;
  return Math.round(baseGold * (1 + 0.15 * (level - 1)) * mult);
}

/** Shop reroll price: grows with every reroll since the current wave started (Артур, тест баланса) */
export function calculateRerollCost(rerollsThisWave: number): number {
  return CONFIG.shop.rerollCost + CONFIG.shop.rerollStep * rerollsThisWave;
}

export function calculateWaveClearReward(wave: number): number {
  return 20 + 3 * wave;
}

// A binder joins two towers only when both are Ур.2 or Ур.3
export function canBindLevels(levelA: number, levelB: number): boolean {
  return levelA >= CONFIG.binder.minLevel && levelB >= CONFIG.binder.minLevel;
}

export function calculateSellRefund(baseCost: number, level: number, ratio = CONFIG.upgrade.sellRatio, merge = 3): number {
  // Towers invested: merge^(level−1) — люди 1/3/9, орки 1/4/16, нежить 1/2/4
  const count = Math.pow(merge, Math.min(3, Math.max(1, level)) - 1);
  const totalInvested = baseCost * count;
  return Math.floor(totalInvested * ratio);
}

// Звёзды по доле уцелевшей прочности артефакта: ≥ 75 % — 3, ≥ 40 % — 2 (те же пороги, что 15 и 8 из 20 жизней)
export function calculateStars(remainingHp: number, maxHp: number = CONFIG.lives.start): number {
  const share = remainingHp / maxHp;
  if (share >= 0.75) return 3;
  if (share >= 0.4) return 2;
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
