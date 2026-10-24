import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS, validateMap, validateAllMaps } from './maps';
import { CONFIG } from './config';

test('all 5 maps meet the game rules', () => {
  for (const m of MAPS) {
    const res = validateMap(m);
    assert.equal(res.valid, true, `Map for level ${m.level} failed validation: ${res.errors.join('; ')}`);
  }
});

import {
  calculateStartingGold,
  calculateEnemyHp,
  calculateEnemyCount,
  calculateKillGold,
  calculateWaveClearReward,
  calculateSellRefund,
  calculateStars,
  calculateDamage,
  calculateEffectiveSlow,
} from './rules';

test('economy and reward calculations', () => {
  // Level 1 normal: (200 + 0) * 1.0 = 200
  assert.equal(calculateStartingGold(1, 'normal'), 200);
  // Level 1 easy: 200 * 1.25 = 250
  assert.equal(calculateStartingGold(1, 'easy'), 250);
  // Level 2 hard: (200 + 25) * 0.8 = 180
  assert.equal(calculateStartingGold(2, 'hard'), 180);

  // Wave clear reward: 20 + 3 * wave
  assert.equal(calculateWaveClearReward(1), 23);
  assert.equal(calculateWaveClearReward(12), 56);

  // Sale refund: 70% of base costs invested
  // Archer base cost = 50
  assert.equal(calculateSellRefund(50, 1), Math.floor(50 * 0.7)); // 35
  assert.equal(calculateSellRefund(50, 2), Math.floor(150 * 0.7)); // 105
  assert.equal(calculateSellRefund(50, 3), Math.floor(450 * 0.7)); // 315

  // Stars: >=15 -> 3, >=8 -> 2, else 1
  assert.equal(calculateStars(20), 3);
  assert.equal(calculateStars(15), 3);
  assert.equal(calculateStars(14), 2);
  assert.equal(calculateStars(8), 2);
  assert.equal(calculateStars(7), 1);
  assert.equal(calculateStars(1), 1);
});

test('enemy scaling and damage formulas', () => {
  // Regular enemy HP scaling
  // base=30, wave=1, level=1, normal -> 30
  assert.equal(calculateEnemyHp(30, 'infantry', 1, 1, 'normal'), 30);
  // wave 5, level 2, normal: 30 * (1 + 0.15*4) * (1 + 0.3*1) * 1 = 30 * 1.6 * 1.3 = 62.4 -> 62
  assert.equal(calculateEnemyHp(30, 'infantry', 5, 2, 'normal'), 62);

  // Boss does NOT have wave multiplier
  assert.equal(calculateEnemyHp(1200, 'boss', 12, 1, 'normal'), 1200);
  assert.equal(calculateEnemyHp(1200, 'boss', 12, 2, 'normal'), 1560);

  // Enemy count scaling: ceil(table * (1 + 0.2*(lvl-1)))
  assert.equal(calculateEnemyCount(6, 1), 6);
  assert.equal(calculateEnemyCount(6, 2), 8); // 6 * 1.2 = 7.2 -> 8

  // Kill gold: round(base * (1 + 0.15*(lvl-1)))
  assert.equal(calculateKillGold(5, 1), 5);
  assert.equal(calculateKillGold(5, 2), 6); // 5 * 1.15 = 5.75 -> 6

  // Physical damage with armor
  const res1 = calculateDamage({
    rawDamage: 100,
    damageType: 'phys',
    targetArmor: 0.40,
    targetMagicResist: 0,
    factionId: 1,
  });
  assert.equal(res1.damage, 60);

  // Magical damage with resist
  const res2 = calculateDamage({
    rawDamage: 100,
    damageType: 'mag',
    targetArmor: 0,
    targetMagicResist: 0.25,
    factionId: 1,
  });
  assert.equal(res2.damage, 75);

  // Curse: +25% damage
  const resCurse = calculateDamage({
    rawDamage: 100,
    damageType: 'phys',
    targetArmor: 0,
    targetMagicResist: 0,
    factionId: 1,
    isCursed: true,
  });
  assert.equal(resCurse.damage, 125);

  // Demon fire resistance: x0.5
  const resFire = calculateDamage({
    rawDamage: 100,
    damageType: 'mag',
    targetArmor: 0,
    targetMagicResist: 0,
    factionId: 4,
    isFireSpec: true,
  });
  assert.equal(resFire.damage, 50);

  // Dark Elf evasion: 25% miss
  const resEvaded = calculateDamage({
    rawDamage: 100,
    damageType: 'phys',
    targetArmor: 0,
    targetMagicResist: 0,
    factionId: 5,
    evasionRoll: 0.1, // < 0.25 -> evaded
  });
  assert.equal(resEvaded.isEvaded, true);
  assert.equal(resEvaded.damage, 0);

  // Hunter spec vs Heavy / Boss: x2
  const resHunter = calculateDamage({
    rawDamage: 10,
    damageType: 'phys',
    targetArmor: 0,
    targetMagicResist: 0,
    factionId: 1,
    isHunterSpec: true,
    isTargetHeavyOrBoss: true,
  });
  assert.equal(resHunter.damage, 20);

  // Ballista Execute spec: <25% HP kills instantly
  const resExec = calculateDamage({
    rawDamage: 10,
    damageType: 'phys',
    targetArmor: 0.4,
    targetMagicResist: 0,
    factionId: 1,
    isExecuteSpec: true,
    targetCurrentHp: 15,
    targetMaxHp: 100,
  });
  assert.equal(resExec.isExecuted, true);

  // Ice cultists slow halved
  assert.equal(calculateEffectiveSlow(0.5, 3), 0.25);
  assert.equal(calculateEffectiveSlow(0.5, 1), 0.5);
});
