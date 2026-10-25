import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS, makePath, validateMap, validateAllMaps, MAX_ROAD_CELLS, MIN_FREE_CELLS, MIN_PATH_LENGTH, CASTLE, isHudCell } from './maps';
import { CONFIG } from './config';
import { attackStats, specSummary, stackedSlow } from './towerStats';

test('all 5 maps meet the game rules', () => {
  for (const m of MAPS) {
    const res = validateMap(m);
    assert.equal(res.valid, true, `Map for level ${m.level} failed validation: ${res.errors.join('; ')}`);
  }
});

test('road stretches must not touch by a side except at merges', () => {
  // A snake whose parallel runs lie side by side: (1..9,2) and (2..9,3) touch along their length
  const touching = makePath([
    { x: 0, y: 2 },
    { x: 9, y: 2 },
    { x: 9, y: 3 },
    { x: 2, y: 3 },
    { x: 2, y: 5 },
    { x: 10, y: 5 },
  ]);
  const bad = validateMap({ level: 1, name: 'test', entrances: [touching[0], touching[0]], paths: [touching, touching] });
  assert.equal(bad.valid, false);
  assert.ok(bad.errors.some((e) => e.includes('соприкасаются')), bad.errors.join('; '));

  // The same rule holds for every shipped map, including branch merges
  for (const m of MAPS) {
    const res = validateMap(m);
    assert.ok(!res.errors.some((e) => e.includes('соприкасаются')), `Level ${m.level}: ${res.errors.join('; ')}`);
  }
});

test('cells under the field buttons stay free of road', () => {
  assert.equal(isHudCell(0, 0), true);
  assert.equal(isHudCell(16, 0), true);
  assert.equal(isHudCell(8, 0), false);
  assert.equal(isHudCell(0, 1), false);
  for (const m of MAPS) {
    for (const path of m.paths) {
      for (const p of path) assert.equal(isHudCell(p.x, p.y), false, `уровень ${m.level}: (${p.x}, ${p.y})`);
    }
  }
});

test('map constraints by level', () => {
  for (const m of MAPS) {
    const { stats } = validateMap(m);
    assert.equal(stats.entrancesCount, m.level + 1);
    assert.ok(stats.roadCellsCount <= MAX_ROAD_CELLS);
    assert.ok(stats.freeCellsCount >= MIN_FREE_CELLS);
    for (const len of stats.pathLengths) assert.ok(len >= MIN_PATH_LENGTH);
    for (const p of m.paths) {
      const end = p[p.length - 1];
      assert.equal(Math.abs(end.x - CASTLE.x) + Math.abs(end.y - CASTLE.y), 1, `Level ${m.level}: path must end next to the castle`);
    }
  }
  assert.equal(validateAllMaps(), true);
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
  endlessCycle,
  waveDefinition,
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
  assert.equal(calculateEnemyHp(30, 'infantry', 1, 1, 'normal'), 39); // 30 * 1.3
  // wave 5, level 2, normal: 30 * 1.3 * (1 + 0.18*4 + 0.012*16) * (1 + 0.3*1) = 30 * 1.3 * 1.912 * 1.3 = 96.9 -> 97
  assert.equal(calculateEnemyHp(30, 'infantry', 5, 2, 'normal'), 97);
  // wave 12, level 1: 30 * 1.3 * (1 + 0.18*11 + 0.012*121) * 1.12 = 30 * 1.3 * 4.432 * 1.12 = 193.6 -> 194
  assert.equal(calculateEnemyHp(30, 'infantry', 12, 1, 'normal'), 194);
  // Campaign waves 7–12 get ×1.12: wave 6 = 30 * 1.3 * 2.2 = 85.8, wave 7 = 30 * 1.3 * 2.512 * 1.12 = 109.7
  assert.equal(calculateEnemyHp(30, 'infantry', 6, 1, 'normal'), 86);
  assert.equal(calculateEnemyHp(30, 'infantry', 7, 1, 'normal'), 110);

  // Boss does NOT have wave multiplier (only the ×1.12 of waves 7–12)
  assert.equal(calculateEnemyHp(1200, 'boss', 12, 1, 'normal'), 1747);
  assert.equal(calculateEnemyHp(1200, 'boss', 12, 2, 'normal'), 2271);

  // Enemy count scaling: ceil(table * (1 + 0.2*(lvl-1)))
  assert.equal(calculateEnemyCount(6, 1), 6);
  assert.equal(calculateEnemyCount(6, 2), 8); // 6 * 1.2 = 7.2 -> 8
  // Hard difficulty: waves 1–3 have 20% fewer enemies, later waves are unchanged
  assert.equal(calculateEnemyCount(6, 1, 1, false, 'hard'), 5); // 6 * 0.8 = 4.8 -> 5
  assert.equal(calculateEnemyCount(8, 1, 3, false, 'hard'), 7); // 6.4 -> 7
  assert.equal(calculateEnemyCount(10, 1, 4, false, 'hard'), 10);
  assert.equal(calculateEnemyCount(6, 1, 1, false, 'normal'), 6);

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

test('one specialization keeps the single-spec numbers', () => {
  const base = CONFIG.towers.archer;
  const lvl2 = CONFIG.upgrade.lvl2DamageMult;
  const sniper = attackStats('archer', 2, ['sniper']);
  assert.ok(Math.abs(sniper.damage - base.damage * lvl2 * 1.8) < 1e-9);
  assert.ok(Math.abs(sniper.cooldown - base.cooldown * 1.6) < 1e-9);
  assert.ok(Math.abs(sniper.range - base.range * CONFIG.upgrade.lvl2RangeMult * 1.6) < 1e-9);
  assert.equal(attackStats('archer', 2, ['arrow_hail']).targets, 2);
  assert.equal(attackStats('mage', 2, ['lightning']).chain, 4);
  assert.equal(attackStats('ballista', 2, ['siege']).aoeRadius, 1);
  assert.equal(attackStats('priest', 2, ['smite']).normalAttack, false);
});

test('triplet specializations add up, the same one three times is ×3', () => {
  const base = CONFIG.towers.archer;
  const lvl3 = CONFIG.upgrade.lvl2DamageMult * CONFIG.upgrade.lvl3DamageMult;
  const tripleSniper = attackStats('archer', 3, ['sniper', 'sniper', 'sniper']);
  assert.ok(Math.abs(tripleSniper.damage - base.damage * lvl3 * (1 + 0.8 * 3)) < 1e-9);
  assert.ok(Math.abs(tripleSniper.cooldown - base.cooldown * 1.6) < 1e-9, 'drawbacks are not tripled');
  assert.equal(attackStats('archer', 3, ['arrow_hail', 'arrow_hail', 'arrow_hail']).targets, 9);
  assert.equal(attackStats('mage', 3, ['lightning', 'lightning', 'lightning']).chain, 15);

  const mixed = attackStats('archer', 3, ['sniper', 'arrow_hail', 'hunter']);
  assert.equal(mixed.targets, 3);
  assert.ok(mixed.range > attackStats('archer', 3, []).range);

  // «Кара» plus another priest specialization keeps the normal shot too
  const smiteWard = attackStats('priest', 3, ['smite', 'ward', 'ward']);
  assert.equal(smiteWard.normalAttack, true);
  assert.ok(smiteWard.smiteDamage > 0);

  assert.ok(Math.abs(stackedSlow(0.5, 1) - 0.5) < 1e-9);
  assert.ok(Math.abs(stackedSlow(0.5, 3) - 0.875) < 1e-9);
  assert.equal(specSummary(['fire', 'frost', 'fire']), 'Огонь ×2 · Мороз');
});

test('hunter and execute power', () => {
  const hit = (extra: Partial<Parameters<typeof calculateDamage>[0]>) =>
    calculateDamage({ rawDamage: 10, damageType: 'phys', targetArmor: 0, targetMagicResist: 0, factionId: 1, ...extra });
  assert.equal(hit({ isHunterSpec: true, isTargetHeavyOrBoss: true }).damage, 20);
  assert.equal(hit({ isHunterSpec: true, hunterPower: 3, isTargetHeavyOrBoss: true }).damage, 40);
  assert.equal(hit({ isExecuteSpec: true, isTargetBoss: true }).damage, 15);
  assert.equal(hit({ isExecuteSpec: true, executePower: 3, isTargetBoss: true }).damage, 25);
  assert.equal(hit({ isExecuteSpec: true, targetCurrentHp: 50, targetMaxHp: 100 }).isExecuted, false);
  // three copies: threshold 45%, not 75%
  assert.equal(hit({ isExecuteSpec: true, executePower: 3, targetCurrentHp: 44, targetMaxHp: 100 }).isExecuted, true);
  assert.equal(hit({ isExecuteSpec: true, executePower: 3, targetCurrentHp: 50, targetMaxHp: 100 }).isExecuted, false);
});

test('endless mode: waves repeat in cycles and keep getting stronger', () => {
  assert.equal(endlessCycle(1), 0);
  assert.equal(endlessCycle(12), 0);
  assert.equal(endlessCycle(13), 1);
  assert.equal(endlessCycle(25), 2);
  // The boss comes on every 12th wave and only then
  for (let w = 1; w <= 48; w++) assert.equal(!!waveDefinition(w).boss, w % 12 === 0, `wave ${w}`);
  assert.deepEqual(waveDefinition(13), CONFIG.waves[0]);
  // HP keeps growing past wave 12
  assert.equal(calculateEnemyHp(30, 'infantry', 13, 1, 'normal', true), 191);
  assert.ok(calculateEnemyHp(30, 'infantry', 40, 1, 'normal', true) > calculateEnemyHp(30, 'infantry', 28, 1, 'normal', true));
  // Boss: +60% per finished cycle, campaign boss unchanged
  assert.equal(calculateEnemyHp(1200, 'boss', 12, 1, 'normal', true), 1560);
  assert.equal(calculateEnemyHp(1200, 'boss', 24, 1, 'normal', true), 2496);
  assert.equal(calculateEnemyHp(1200, 'boss', 24, 1, 'normal'), 1747);
  // Counts: +25% per finished cycle
  assert.equal(calculateEnemyCount(20, 1, 12, true), 20);
  assert.equal(calculateEnemyCount(20, 1, 13, true), 25);
  assert.equal(calculateEnemyCount(20, 1, 25, true), 30);
  assert.equal(calculateEnemyCount(20, 1, 13), 20);
});
