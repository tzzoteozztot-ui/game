import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS, makePath, validateMap, validateAllMaps, MAX_ROAD_CELLS, MIN_FREE_CELLS, MIN_PATH_LENGTH, CASTLE, isHudCell, GRID_COLS, GRID_ROWS } from './maps';
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
  assert.equal(isHudCell(11, 0), true);
  assert.equal(isHudCell(8, 0), true);
  assert.equal(isHudCell(7, 0), false);
  assert.equal(isHudCell(4, 0), false);
  assert.equal(isHudCell(0, 1), false);
  for (const m of MAPS) {
    for (const path of m.paths) {
      for (const p of path) assert.equal(isHudCell(p.x, p.y), false, `уровень ${m.level}: (${p.x}, ${p.y})`);
    }
  }
});

test('map constraints by level', () => {
  // Field 16×10, the same in maps and in the engine config
  assert.equal(GRID_COLS, 12);
  assert.equal(GRID_ROWS, 9);
  assert.equal(CONFIG.grid.cols, GRID_COLS);
  assert.equal(CONFIG.grid.rows, GRID_ROWS);
  assert.equal(CONFIG.grid.totalWidth, GRID_COLS * CONFIG.grid.cellSize);
  assert.equal(CONFIG.grid.totalHeight, GRID_ROWS * CONFIG.grid.cellSize);
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
  calculateRerollCost,
  calculateKillGold,
  calculateSendPrice,
  calculateSendIncome,
  calculateWaveClearReward,
  calculateSellRefund,
  calculateStars,
  calculateDamage,
  calculateEffectiveSlow,
  endlessCycle,
  endlessGrowth,
  enemyWaveMult,
  endlessArmorBonus,
  waveDefinition,
} from './rules';

test('economy and reward calculations', () => {
  // Shop reroll: 10, 15, 20… within a wave
  assert.equal(calculateRerollCost(0), 10);
  assert.equal(calculateRerollCost(1), 15);
  assert.equal(calculateRerollCost(4), 30);
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
  // Duel: half of the usual wave, rounded up; endless growth per cycle still applies
  assert.equal(calculateEnemyCount(6, 1, 1, true, 'normal', true), 3);
  assert.equal(calculateEnemyCount(7, 1, 1, true, 'normal', true), 4); // 3.5 -> 4
  assert.equal(calculateEnemyCount(8, 1, 13, true, 'normal', true), 5); // 8 * 1.25 * 0.5 = 5

  // Duel send price: 2 × kill gold (a swarm group of 8), × the wave's HP growth
  assert.equal(calculateSendPrice('infantry', 1, 1), 10);
  assert.equal(calculateSendPrice('swarm', 1, 1), 16);
  assert.equal(calculateSendPrice('heavy', 3, 1), 34); // 24 × 1.408 = 33.8 -> 34
  assert.equal(calculateSendPrice('infantry', 1, 2), 12); // kill gold 6 on level 2
  // Each send adds 1/5 of its price to every later round
  assert.equal(calculateSendIncome(60), 12);
  assert.equal(calculateSendIncome(34), 6);

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
  // «Град стрел»: 2 targets keep ×0,8, each target beyond two −5% per arrow (9 targets: ×0,8 × 0,65)
  const hail = (lvl: number, specs: string[]) => attackStats('archer', lvl, specs).damage;
  assert.ok(Math.abs(hail(2, ['arrow_hail']) - base.damage * CONFIG.upgrade.lvl2DamageMult * 0.8) < 1e-9);
  assert.ok(Math.abs(hail(3, ['arrow_hail', 'arrow_hail', 'arrow_hail']) - base.damage * lvl3 * 0.8 * 0.65) < 1e-9);
  assert.ok(Math.abs(hail(3, ['arrow_hail', 'sniper', 'hunter']) - base.damage * lvl3 * 1.8 * 0.8 * 0.95) < 1e-9);
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
  // HP keeps growing past wave 12: the usual wave formula and 3,5 % more for every wave after the 12th
  assert.equal(calculateEnemyHp(30, 'infantry', 12, 1, 'normal', true), Math.round(30 * 1.3 * enemyWaveMult(12)));
  assert.equal(
    calculateEnemyHp(30, 'infantry', 13, 1, 'normal', true),
    Math.round(30 * 1.3 * enemyWaveMult(13) * 1.035)
  );
  assert.ok(calculateEnemyHp(30, 'infantry', 40, 1, 'normal', true) > calculateEnemyHp(30, 'infantry', 28, 1, 'normal', true));
  assert.ok(Math.abs(endlessGrowth(48) - Math.pow(1.035, 36)) < 1e-9);
  // Boss: the campaign one unchanged on wave 12; later it grows with the wave like the others, ×1,5
  assert.equal(calculateEnemyHp(1200, 'boss', 12, 1, 'normal', true), 1560);
  const bossGrowth = (w: number) => (enemyWaveMult(w) / enemyWaveMult(12)) * Math.pow(1.035, w - 12);
  assert.equal(calculateEnemyHp(1200, 'boss', 24, 1, 'normal', true), Math.round(1560 * bossGrowth(24) * 1.5));
  assert.ok(calculateEnemyHp(1200, 'boss', 84, 1, 'hard', true) > 50 * calculateEnemyHp(1200, 'boss', 12, 1, 'hard', true));
  assert.equal(calculateEnemyHp(1200, 'boss', 24, 1, 'normal'), 1747);
  // Demons (4) and dark elves (5): −7% HP in endless mode only
  const hp4 = calculateEnemyHp(30, 'infantry', 30, 4, 'normal');
  assert.equal(
    calculateEnemyHp(30, 'infantry', 30, 4, 'normal', true),
    Math.round((hp4 / 1.12) * 0.93 * endlessGrowth(30))
  );
  // Armor and magic resist of every enemy: +4 % per finished cycle up to 60 %
  assert.equal(endlessArmorBonus(12), 0);
  assert.ok(Math.abs(endlessArmorBonus(13) - 0.04) < 1e-9);
  assert.equal(endlessArmorBonus(500), 0.6);
  // Counts: +25% per finished cycle
  assert.equal(calculateEnemyCount(20, 1, 12, true), 20);
  assert.equal(calculateEnemyCount(20, 1, 13, true), 25);
  assert.equal(calculateEnemyCount(20, 1, 25, true), 30);
  assert.equal(calculateEnemyCount(20, 1, 13), 20);
});

import { mergeProgress, normalizeProgress } from '../progress';

test('progress from two devices merges to the best of both', () => {
  const none = { easy: {}, normal: {}, hard: {} };
  const phone = { unlocked: 3, stars: { ...none, normal: { 1: 3, 2: 1 } }, endlessBest: { ...none, normal: { 1: 20 } } };
  const mac = {
    unlocked: 2,
    stars: { ...none, normal: { 1: 2, 2: 2, 3: 1 }, hard: { 1: 1 } },
    endlessBest: { ...none, normal: { 1: 14, 2: 9 }, hard: { 1: 30 } },
  };
  assert.deepEqual(mergeProgress(phone, mac), {
    unlocked: 3,
    stars: { ...none, normal: { 1: 3, 2: 2, 3: 1 }, hard: { 1: 1 } },
    endlessBest: { ...none, normal: { 1: 20, 2: 9 }, hard: { 1: 30 } },
  });
  // Junk from an old save or a broken row turns into valid progress
  assert.deepEqual(normalizeProgress({ unlocked: 9, stars: { 1: 2, 7: 3, x: 1 }, endlessBest: null }), {
    unlocked: 5,
    stars: { ...none, normal: { 1: 2 } },
    endlessBest: none,
  });
  assert.deepEqual(normalizeProgress(undefined), { unlocked: 1, stars: none, endlessBest: none });
});

test('old flat stars and records move to the normal difficulty, per-difficulty ones stay apart', () => {
  const old = normalizeProgress({ unlocked: 3, stars: { 1: 3, 2: 2 }, endlessBest: { 1: 40 } });
  assert.deepEqual(old.stars, { easy: {}, normal: { 1: 3, 2: 2 }, hard: {} });
  assert.deepEqual(old.endlessBest, { easy: {}, normal: { 1: 40 }, hard: {} });
  const mixed = normalizeProgress({ stars: { easy: { 1: 3 }, hard: { 1: 1 }, 1: 2 }, endlessBest: { hard: { 2: 55 } } });
  assert.deepEqual(mixed.stars, { easy: { 1: 3 }, normal: { 1: 2 }, hard: { 1: 1 } });
  assert.deepEqual(mixed.endlessBest, { easy: {}, normal: {}, hard: { 2: 55 } });
});

import { BOT_LEVELS, BotLevel, botStrength, waveWeight } from '../duelBot';

test('duel bot: the defence outgrows early waves and falls behind later ones, stronger levels hold longer', () => {
  const firstOverload = (d: BotLevel) => {
    for (let r = 1; r <= 60; r++) if (waveWeight(r, 1) > botStrength(d, r)) return r;
    return 61;
  };
  const easy = firstOverload('easy');
  const normal = firstOverload('normal');
  const hard = firstOverload('hard');
  assert.ok(easy >= 5 && easy < normal && normal < hard && hard <= 40, `${easy} ${normal} ${hard}`);
  // Sends scale with the wave's weight, a harder bot buys more
  assert.ok(BOT_LEVELS.easy.sendShare < BOT_LEVELS.normal.sendShare && BOT_LEVELS.normal.sendShare < BOT_LEVELS.hard.sendShare);
  assert.ok(waveWeight(12, 1) > waveWeight(11, 1));
});

test('priest without a specialization marks enemies; a tower bound to a priest shoots stronger', () => {
  assert.equal(CONFIG.priestBase.slow, 0.3);
  assert.equal(CONFIG.priestBase.markBonus, 0.15);
  assert.equal(CONFIG.priestBase.pairBonus, 0.2);
  // the mark is the same +damage as the curse, only weaker and shorter
  assert.ok(CONFIG.priestBase.markBonus < CONFIG.priestSupport.curseBonus && CONFIG.priestBase.time < CONFIG.priestSupport.curseTime);
  assert.ok(CONFIG.priestBase.slow < CONFIG.priestSupport.wardSlow);
});

test('three binders merge into a triple one only from shop tier 5', () => {
  assert.equal(CONFIG.binder.tripleFromTier, 5);
});

import { specBadge } from './towerStats';

test('field badge shows a short code per specialization with its power', () => {
  assert.equal(specBadge([]), '');
  assert.equal(specBadge(['fire']), 'Ог');
  assert.equal(specBadge(['fire', 'fire', 'fire']), 'Ог×3');
  assert.equal(specBadge(['fire', 'frost', 'fire']), 'Ог×2·Мр');
  assert.equal(specBadge(['sniper', 'hunter', 'arrow_hail']), 'Сн·Ох·Гр');
});

import { calculateSupplyMult, calculateSupplyPower, calculateSellRefund as sellRefund } from './rules';

test('supply: towers add up by level, prices grow ×1,12 per 20 power above 30, selling pays 60 %', () => {
  // Ур.1 = 1, Ур.2 = 3, Ур.3 = 9; a binder 1, a triple one 3
  assert.equal(calculateSupplyPower([1, 2, 3], 2, 1), 1 + 3 + 9 + 2 + 3);
  assert.equal(calculateSupplyMult(0), 1);
  assert.equal(calculateSupplyMult(30), 1);
  assert.equal(calculateSupplyMult(49), 1);
  assert.ok(Math.abs(calculateSupplyMult(50) - 1.12) < 1e-9);
  assert.ok(Math.abs(calculateSupplyMult(110) - Math.pow(1.12, 4)) < 1e-9);
  // The refund is paid from the base price: it does not depend on the supply, only on the ratio
  assert.equal(sellRefund(50, 1), 35);
  assert.equal(sellRefund(50, 1, CONFIG.supply.sellRatio), 30);
});

test('kill gold: after wave 12 it falls ×0,985 per wave to a floor, only where the supply works', () => {
  assert.equal(calculateKillGold(100, 1, 24, false), 100);
  assert.equal(calculateKillGold(100, 1, 12, true), 100);
  assert.equal(calculateKillGold(100, 1, 24, true), Math.round(100 * Math.pow(0.985, 12)));
  assert.equal(calculateKillGold(100, 1, 500, true), 30);
});
