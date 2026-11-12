import { setHex, cellAt, centerX, centerY, neighbours } from './grid';
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS, makePath, validateMap, validateAllMaps, MAX_ROAD_CELLS, MIN_FREE_CELLS, MIN_PATH_LENGTH, CASTLE, isHudCell, GRID_COLS, GRID_ROWS } from './maps';
import { CONFIG } from './config';
import { generateMap, GEN_MAX_ROAD, GEN_MIN_ROAD } from './mapgen';
import { endlessRecordKey } from '../progress';
import { attackStats, specSummary, stackedSlow, towerDamageType } from './towerStats';
import { emptyPairState, nextHost, pairRound, placesForFallen, type PairState } from '../brawl';

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
  assert.equal(isHudCell(3, 0), true);
  assert.equal(isHudCell(13, 0), false);
  assert.equal(isHudCell(10, 0), false);
  assert.equal(isHudCell(4, 0), false);
  assert.equal(isHudCell(0, 1), false);
  for (const m of MAPS) {
    for (const path of m.paths) {
      for (const p of path) assert.equal(isHudCell(p.x, p.y), false, `уровень ${m.level}: (${p.x}, ${p.y})`);
    }
  }
});

test('map constraints by level', () => {
  // Field 14×8, the same in maps and in the engine config
  assert.equal(GRID_COLS, 14);
  assert.equal(GRID_ROWS, 8);
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
  calculateFactionDamageMult,
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
  // Level 1 normal: 250 * 1.0 = 250
  assert.equal(calculateStartingGold(1, 'normal'), 250);
  // Level 1 easy: 250 * 1.25 = 312
  assert.equal(calculateStartingGold(1, 'easy'), 312);
  // Level 2 hard: 250 * 0.8 = 200
  assert.equal(calculateStartingGold(2, 'hard'), 200);

  // Wave clear reward: 20 + 3 * wave
  assert.equal(calculateWaveClearReward(1), 23);
  assert.equal(calculateWaveClearReward(12), 56);

  // Sale refund: 70% of base costs invested
  // Archer base cost = 50
  assert.equal(calculateSellRefund(50, 1), Math.floor(50 * 0.7)); // 35
  assert.equal(calculateSellRefund(50, 2), Math.floor(150 * 0.7)); // 105
  assert.equal(calculateSellRefund(50, 3), Math.floor(450 * 0.7)); // 315

  // Stars: >=15 -> 3, >=8 -> 2, else 1
  // артефакт 200 HP: 3 звезды от 150, 2 — от 80
  assert.equal(calculateStars(200), 3);
  assert.equal(calculateStars(150), 3);
  assert.equal(calculateStars(149), 2);
  assert.equal(calculateStars(80), 2);
  assert.equal(calculateStars(79), 1);
  assert.equal(calculateStars(1), 1);
  assert.equal(calculateStars(15, 20), 3);
  assert.equal(calculateStars(7, 20), 1);
});

test('enemy scaling and damage formulas', () => {
  // Regular enemy HP scaling
  // base=30, wave=1, level=1, normal -> 30
  assert.equal(calculateEnemyHp(30, 'infantry', 1, 1, 'normal'), 39); // 30 * 1.3
  // wave 5, level 2, normal: 30 * 1.3 * (1 + 0.18*4 + 0.012*16) * (1 + 0.3*1) = 30 * 1.3 * 1.912 * 1.3 = 96.9 -> 97
  assert.equal(calculateEnemyHp(30, 'infantry', 5, 2, 'normal'), 97);
  // An imp is a third of an infantryman of the same wave (wave 5, level 2: 97 / 3 = 32.3)
  assert.equal(calculateEnemyHp(20, 'imp', 5, 2, 'normal'), 32);
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
  assert.equal(calculateEnemyCount(6, 1, 1, false, 'hard'), 6); // тяжёлая не меняет число врагов (убрано ×0,8, 2026-11-01)
  assert.equal(calculateEnemyCount(8, 1, 3, false, 'hard'), 8);
  assert.equal(calculateEnemyCount(10, 1, 4, false, 'hard'), 10);
  assert.equal(calculateEnemyCount(6, 1, 1, false, 'normal'), 6);
  // Duel: half of the usual wave, rounded up; endless growth per cycle still applies
  assert.equal(calculateEnemyCount(6, 1, 1, true, 'normal', true), 3);
  assert.equal(calculateEnemyCount(7, 1, 1, true, 'normal', true), 4); // 3.5 -> 4
  assert.equal(calculateEnemyCount(8, 1, 13, true, 'normal', true), 5); // 8 * 1.25 * 0.5 = 5

  // Duel send price: 2 × kill gold (a swarm group of 8), × the wave's HP growth
  assert.equal(calculateSendPrice('infantry', 1, 1), 8); // kill gold 6 (5 × 1,15), × 4/3 = 8
  assert.equal(calculateSendPrice('swarm', 1, 1), 11);
  assert.equal(calculateSendPrice('heavy', 3, 1), 26); // kill gold 14 × 4/3 × 1.408 = 26.3 -> 26
  assert.equal(calculateSendPrice('infantry', 1, 2), 8); // карта на цену не влияет (Артур, 2026-11-02)
  assert.equal(calculateSendPrice('heavy', 3, 5), calculateSendPrice('heavy', 3, 1));
  // Each send adds 1/5 of its price to every later round
  assert.equal(calculateSendIncome(60), 12);
  assert.equal(calculateSendIncome(34), 6);

  // Kill gold: round(base × 1,15) на любой карте
  assert.equal(calculateKillGold(5, 1), 6); // 5 * 1.15 = 5.75 -> 6
  assert.equal(calculateKillGold(5, 5), 6);
  assert.equal(calculateKillGold(100, 3), 115);

  // Physical damage with armor
  const res1 = calculateDamage({
    rawDamage: 100,
    damageType: 'phys',
    targetArmor: 0.40,
    targetMagicResist: 0,
    factionId: 1,
  });
  assert.equal(res1.damage, 60);

  // Elemental damage with magic resist (orcs have no stance to lightning)
  const res2 = calculateDamage({
    rawDamage: 100,
    damageType: 'lightning',
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

  // Demon fire resistance
  const resFire = calculateDamage({
    rawDamage: 100,
    damageType: 'fire',
    targetArmor: 0,
    targetMagicResist: 0,
    factionId: 4,
  });
  assert.equal(resFire.damage, 100 * CONFIG.damage.resistMult);
  // …and weak to ice: ×1.25, before magic resist
  assert.equal(calculateDamage({ rawDamage: 100, damageType: 'ice', targetArmor: 0, targetMagicResist: 0.2, factionId: 4 }).damage, 100);
  // armor does not cut the elements, magic resist does not cut physical damage
  assert.equal(calculateDamage({ rawDamage: 100, damageType: 'poison', targetArmor: 0.4, targetMagicResist: 0, factionId: 3 }).damage, 100);
  assert.equal(calculateDamage({ rawDamage: 100, damageType: 'phys', targetArmor: 0, targetMagicResist: 0.3, factionId: 3 }).damage, 100);

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

test('five damage types: every faction has a stance, the Mage takes its type from its specializations', () => {
  for (const f of CONFIG.factions) {
    assert.ok(f.resist.length > 0 && f.weak.length > 0, f.name);
    assert.ok(!f.resist.some((t) => f.weak.includes(t)), f.name);
  }
  assert.equal(calculateFactionDamageMult('fire', 4), CONFIG.damage.resistMult);
  assert.equal(calculateFactionDamageMult('ice', 4), CONFIG.damage.weakMult);
  assert.equal(calculateFactionDamageMult('phys', 4), 1);
  assert.equal(towerDamageType('archer', []), 'phys');
  assert.equal(towerDamageType('mage', []), 'lightning');
  assert.equal(towerDamageType('mage', ['fire']), 'fire');
  assert.equal(towerDamageType('mage', ['frost', 'fire', 'frost']), 'ice');
  assert.equal(towerDamageType('mage', ['fire', 'frost', 'ward']), 'fire');
  assert.equal(towerDamageType('mage', ['fire', 'lightning']), 'lightning');
  assert.equal(towerDamageType('und_cauldron', []), 'poison');
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
  assert.ok(Math.abs(calculateSupplyMult(90) - Math.pow(1.12, 3)) < 1e-9);
  // The refund is paid from the base price: it does not depend on the supply, only on the ratio
  assert.equal(sellRefund(50, 1), 35);
  assert.equal(sellRefund(50, 1, CONFIG.supply.sellRatio), 30);
});

test('kill gold: after wave 12 it falls ×0,985 per wave to a floor, only where the supply works', () => {
  assert.equal(calculateKillGold(100, 1, 24, false), 115);
  assert.equal(calculateKillGold(100, 1, 12, true), 115);
  assert.equal(calculateKillGold(100, 1, 24, true), Math.round(115 * Math.pow(0.985, 12)));
  assert.equal(calculateKillGold(100, 1, 500, true), 34);
});

test('isEmptyProgress: пустой прогресс отличается от начатого', async () => {
  const { isEmptyProgress, EMPTY_PROGRESS } = await import('../progress');
  assert.equal(isEmptyProgress(EMPTY_PROGRESS), true);
  assert.equal(isEmptyProgress(normalizeProgress({ unlocked: 2 })), false);
  assert.equal(isEmptyProgress(normalizeProgress({ stars: { hard: { 1: 1 } } })), false);
});

import { canBindLevels } from './rules';

test('a binder joins only towers of Ур.2 and Ур.3, in any mix (Артур, 2026-10-30)', () => {
  assert.equal(CONFIG.binder.minLevel, 2);
  assert.equal(canBindLevels(2, 2), true);
  assert.equal(canBindLevels(2, 3), true);
  assert.equal(canBindLevels(3, 2), true);
  assert.equal(canBindLevels(3, 3), true);
  assert.equal(canBindLevels(1, 2), false);
  assert.equal(canBindLevels(3, 1), false);
  assert.equal(canBindLevels(1, 1), false);
});

test('endless records: own faction keeps the map key, another faction gets map×10+faction', () => {
  assert.equal(endlessRecordKey(1, 1), 1);
  assert.equal(endlessRecordKey(1, 6), 16);
  assert.equal(endlessRecordKey(5, 3), 53);
  const p = normalizeProgress({ endlessBest: { hard: { 1: 20, 16: 14, 53: 9, 17: 5, 60: 3 } } });
  assert.deepEqual(p.endlessBest.hard, { 1: 20, 16: 14, 53: 9 });
});

test('endless records on a generated road are kept apart: 100 + map×10 + faction', () => {
  assert.equal(endlessRecordKey(1, 1, true), 111);
  assert.equal(endlessRecordKey(5, 6, true), 156);
  const p = normalizeProgress({ endlessBest: { normal: { 1: 20, 111: 12, 156: 4, 160: 3, 107: 2 } } });
  assert.deepEqual(p.endlessBest.normal, { 1: 20, 111: 12, 156: 4 });
});

test('generated maps meet the same rules as the fixed ones, for every level', () => {
  for (let level = 1; level <= MAPS.length; level++) {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const m = generateMap(level, seed);
      assert.notEqual(m, MAPS[level - 1], `level ${level}, seed ${seed}: fell back to the fixed map`);
      const res = validateMap(m);
      assert.equal(res.valid, true, `level ${level}, seed ${seed}: ${res.errors.join('; ')}`);
      assert.equal(m.entrances.length, level + 1);
      assert.ok(res.stats.roadCellsCount >= GEN_MIN_ROAD && res.stats.roadCellsCount <= GEN_MAX_ROAD);
      seen.add(JSON.stringify(m.paths));
    }
    assert.ok(seen.size >= 55, `level ${level}: only ${seen.size} different maps out of 60`);
  }
});

test('one seed always gives the same map', () => {
  assert.deepEqual(generateMap(3, 12345), generateMap(3, 12345));
  assert.notDeepEqual(generateMap(3, 12345), generateMap(3, 12346));
});

test('every faction has a palette; factions past the maps have no map of their own', () => {
  assert.equal(CONFIG.palettes.length, CONFIG.factions.length);
  assert.equal(MAPS.length, CONFIG.levelCount);
  CONFIG.factions.forEach((f, i) => assert.equal(f.id, i + 1));
});

test('playable races: every race has four towers of its own and a valid faction', () => {
  for (const id of Object.keys(CONFIG.races) as (keyof typeof CONFIG.races)[]) {
    const r = CONFIG.races[id];
    assert.equal(r.towers.length, 4, `${id}: four towers`);
    assert.ok(CONFIG.factions[r.faction - 1], `${id}: faction ${r.faction}`);
    for (const t of r.towers) {
      const def = CONFIG.towers[t];
      assert.ok(def, `${id}: tower ${t}`);
      if (id !== 'humans') assert.equal(def.race, id, `${t} belongs to ${id}`);
    }
  }
});

test('sell refund and supply count the towers merged in by the race rule', () => {
  // орки сливают по 4, нежить по 2
  assert.equal(calculateSellRefund(50, 2, 0.7, 4), Math.floor(200 * 0.7));
  assert.equal(calculateSellRefund(50, 3, 0.8, 2), Math.floor(200 * 0.8));
  assert.equal(calculateSupplyPower([1, 2, 3], 0, 0, 4), 1 + 4 + 16);
  assert.equal(calculateSupplyPower([1, 2, 5], 0, 0, 2), 1 + 2 + 16);
  // люди — прежняя таблица 1/3/9
  assert.equal(calculateSupplyPower([1, 2, 3], 0, 0), 1 + 3 + 9);
});

test('race tower stats: level growth, orc tempering, undead merge choice', () => {
  const orcs = CONFIG.races.orcs;
  const spear = CONFIG.towers.orc_spear;
  const s2 = attackStats('orc_spear', 2, []);
  assert.ok(Math.abs(s2.damage - spear.damage * orcs.levelDamage) < 1e-9);
  const tempered = attackStats('orc_spear', 1, ['orc_dmg', 'orc_dmg']);
  assert.ok(Math.abs(tempered.damage - spear.damage * (1 + 2 * CONFIG.raceMech.orcUpgrade.dmg)) < 1e-9);
  const und = CONFIG.races.undead;
  const archer = CONFIG.towers.und_archer;
  const u = attackStats('und_archer', 3, ['und_dmg', 'und_speed']);
  assert.ok(Math.abs(u.damage - archer.damage * und.levelDamage) < 1e-9);
  assert.ok(Math.abs(u.cooldown - archer.cooldown / und.levelDamage) < 1e-9);
  // особые башни без обычной атаки
  assert.equal(attackStats('und_crypt', 1, []).normalAttack, false);
});

// «Потасовка»: pairs every wave, the ghost for the odd one out

test('brawl: eight players pair up, avoiding last wave\'s opponent', () => {
  const alive = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, lives: 200 }));
  let st = emptyPairState();
  for (let wave = 0; wave < 30; wave++) {
    const prev = { ...st.lastOpp };
    const res = pairRound(alive, st);
    assert.equal(res.ghostFoe, null);
    for (const p of alive) {
      const o = res.opp[p.id];
      assert.ok(o && o !== p.id, `${p.id} has an opponent`);
      assert.equal(res.opp[o], p.id, 'pairs are mutual');
      if (wave > 0) assert.notEqual(o, prev[p.id], 'not the same opponent twice in a row');
    }
    st = res.state;
  }
});

test('brawl: with an odd count the ghost goes from the weakest to the strongest, never twice in a row', () => {
  const alive = [
    { id: 'a', lives: 50 },
    { id: 'b', lives: 120 },
    { id: 'c', lives: 90 },
    { id: 'd', lives: 200 },
    { id: 'e', lives: 10 },
  ];
  let st: PairState = { ...emptyPairState(), ghost: 'x' };
  const order: string[] = [];
  for (let i = 0; i < 6; i++) {
    const res = pairRound(alive, st);
    assert.ok(res.ghostFoe);
    assert.equal(res.opp[res.ghostFoe!], 'x');
    for (const p of alive) if (p.id !== res.ghostFoe) assert.equal(res.opp[res.opp[p.id]], p.id);
    order.push(res.ghostFoe!);
    st = res.state;
  }
  assert.deepEqual(order.slice(0, 5), ['e', 'a', 'c', 'b', 'd']);
  assert.notEqual(order[5], order[4], 'a new turn order does not start with the last one');
  assert.equal(order[5], 'e');

  // Equal HP: random, but never the same one twice in a row
  const tied = [{ id: 'a', lives: 100 }, { id: 'b', lives: 100 }, { id: 'c', lives: 100 }];
  st = { ...emptyPairState(), ghost: 'x' };
  let last = '';
  for (let i = 0; i < 20; i++) {
    const res = pairRound(tied, st);
    assert.notEqual(res.ghostFoe, last);
    last = res.ghostFoe!;
    st = res.state;
  }
});

test('brawl: players who fall on one wave take the last places, more HP before it places higher', () => {
  const places = placesForFallen([{ id: 'a', livesBefore: 30 }, { id: 'b', livesBefore: 80 }], 6);
  assert.deepEqual(places, { b: 5, a: 6 });
});

test('brawl online: the next host is the first player still online in the lobby order', () => {
  const seats = [
    { id: 'h', human: true, online: true },
    { id: 'bot1', human: false, online: false },
    { id: 'a', human: true, online: false },
    { id: 'b', human: true, online: true },
  ];
  assert.equal(nextHost(seats, new Set(['h'])), 'b');
  assert.equal(nextHost(seats, new Set(['h', 'b'])), null);
});

test('усиления: pickBoons даёт разные и реже берёт лёгкие по весу', async () => {
  const { BOONS, pickBoons } = await import('./config');
  const three = pickBoons(BOONS, 3);
  assert.equal(new Set(three.map((b) => b.id)).size, 3);
  let walls = 0;
  let sharp = 0;
  for (let i = 0; i < 4000; i++) {
    const ids = pickBoons(BOONS, 3).map((b) => b.id);
    if (ids.includes('walls')) walls++;
    if (ids.includes('sharp')) sharp++;
  }
  assert.ok(walls < sharp * 0.6, `walls ${walls}, sharp ${sharp}`);
});

test('потолок цен: башни ×1,5, армия — множитель волны не выше 8', () => {
  assert.equal(calculateSupplyMult(1000), 1.5);
  assert.ok(calculateSupplyMult(110) > 1.5 - 1e-9 || Math.abs(calculateSupplyMult(90) - Math.pow(1.12, 3)) < 1e-9);
  assert.equal(calculateSendPrice('heavy', 40, 1), calculateSendPrice('heavy', 25, 1));
  assert.ok(calculateSendPrice('heavy', 40, 1, false) > calculateSendPrice('heavy', 40, 1));
});

import { rollShop } from './shop';
test('лавка: гарантия готовой башни — за 10 обновлений на 3-м ярусе, за 5 на 4-м', () => {
  const types = ['archer', 'priest', 'mage', 'ballista'] as const;
  // всегда «не повезло»: rnd = 0,99 — ни связок, ни ★
  const unlucky = () => 0.99;
  for (const [tier, limit] of [[3, 10], [4, 5], [5, 5]] as const) {
    const pity = { since: 0 };
    let first = 0;
    for (let i = 1; i <= limit; i++) {
      const cards = rollShop(tier, [...types], { triplets: true, binders: true }, pity, unlucky);
      if (cards.some((c) => c.isTriplet || c.level3)) { first = i; break; }
    }
    assert.equal(first, limit);
  }
  // 1–2-й ярус: гарантии нет
  const p = { since: 0 };
  for (let i = 0; i < 30; i++) assert.ok(!rollShop(2, [...types], { triplets: true, binders: true }, p, unlucky).some((c) => c.isTriplet));
  // башни Ур.3 только на 5-м ярусе
  assert.ok(!rollShop(4, [...types], { triplets: true, binders: false }, { since: 0 }, () => 0.01).some((c) => c.level3));
  assert.ok(rollShop(5, [...types], { triplets: true, binders: false }, { since: 0 }, () => 0.01).some((c) => c.level3));
});

// ----- Редактор карты свободного режима -----
import { draftToMap, mapToDraft } from './mapEditor';

test('редактор карты: готовые карты проходят через черновик', () => {
  for (const m of MAPS) {
    const res = draftToMap(mapToDraft(m));
    assert.deepEqual(res.errors, [], m.name);
    assert.equal(res.map!.entrances.length, m.entrances.length);
    for (const p of res.map!.paths) {
      const end = p[p.length - 1];
      assert.equal(Math.abs(end.x - 7) + Math.abs(end.y - 4), 1);
    }
  }
});

test('редактор карты: ошибки черновика', () => {
  const empty = draftToMap({ level: 1, name: '', road: [], exits: [], blocked: [] });
  assert.equal(empty.map, null);
  assert.ok(empty.errors.length > 0);
  // дорога (0,4)→(6,4) к артефакту, выход слева, лишняя клетка (3,0) и выход без пути (13,0)
  const road = Array.from({ length: 7 }, (_, x) => ({ x, y: 4 }));
  const ok = draftToMap({ level: 1, name: 'т', road, exits: [{ x: 0, y: 4 }], blocked: [{ x: 2, y: 2 }] });
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.map!.paths[0].length, 7);
  assert.deepEqual(ok.map!.blocked, [{ x: 2, y: 2 }]);
  const bad = draftToMap({ level: 1, name: 'т', road: [...road, { x: 3, y: 0 }, { x: 13, y: 0 }], exits: [{ x: 0, y: 4 }, { x: 13, y: 0 }], blocked: [] });
  assert.equal(bad.map, null);
  assert.equal(bad.broken.length, 1);
  assert.equal(bad.unused.length, 2);
});

test('гексовое поле (опыт): центр клетки возвращает ту же клетку, все шесть соседей на расстоянии клетки', () => {
  setHex(true);
  try {
    for (let y = 0; y < CONFIG.grid.rows; y++)
      for (let x = 0; x < CONFIG.grid.cols; x++) {
        const c = { x, y };
        assert.deepEqual(cellAt(centerX(c), centerY(c)), c);
        for (const n of neighbours(c)) assert.ok(Math.abs(Math.hypot(centerX(n) - centerX(c), centerY(n) - centerY(c)) - CONFIG.grid.cellSize) < 1e-6);
      }
    // ход по квадратной сетке (в том числе вверх-вниз) — всегда соседние гексы, поэтому старые карты годятся для опыта
    for (const map of MAPS)
      for (const path of map.paths)
        for (let i = 1; i < path.length; i++) assert.ok(neighbours(path[i - 1]).some((n) => n.x === path[i].x && n.y === path[i].y));
  } finally {
    setHex(false);
  }
});

// -------------------------------------------------------------
// Поход по глобальной карте (src/campaign/world.ts)
// -------------------------------------------------------------
import * as D from '../campaign/dialogs';
import * as W from '../campaign/world';

test('world: every object of a region stands on passable ground, ids are unique', () => {
  for (const r of Object.values(W.REGIONS)) {
    const ids = new Set<string>();
    for (const o of r.objects) {
      const t = W.terrainAt(r, o.x, o.y);
      assert.ok(t && W.TERRAIN_COST[t] !== null, `${r.id}/${o.id} on ${t}`);
      assert.ok(!ids.has(o.id), `duplicate ${o.id}`);
      ids.add(o.id);
    }
    assert.ok(r.terrain.every((row) => row.length === r.terrain[0].length), `${r.id}: ragged rows`);
  }
});

test('world: the river is crossed only through the ford or the bridge squad', () => {
  const r = W.FRONTIER;
  const st = W.newWorld(r);
  st.seen = r.terrain.flatMap((row, y) => [...row].map((_, x) => y * row.length + x)); // без тумана
  const fort = r.objects.find((o) => o.kind === 'fortress')!;
  assert.equal(W.findPath(st, r, fort), null, 'the east bank is closed while the ford and the bridge stand');
  const toFord = W.findPath(st, r, r.objects.find((o) => o.id === 'ford')!)!;
  assert.ok(toFord);
  for (const p of toFord.slice(0, -1)) {
    const o = W.objectAt(st, r, p.x, p.y);
    assert.ok(!o || !W.isHostile(st, o), 'a path never goes through an enemy');
  }
  W.winBattle(st, r, 'ford');
  st.hero = { ...r.start };
  const toFort = W.findPath(st, r, fort);
  assert.ok(toFort, 'the ford opens the way');
});

test('world: the region is mostly wild — the hero walks roads and clearings, every object is reachable', () => {
  const r = W.FRONTIER;
  let open = 0;
  for (const row of r.terrain) for (const c of row) if ('.=fh'.includes(c)) open++;
  assert.ok(open / (W.regionW(r) * W.regionH(r)) < 0.4, `walkable share ${open}`);
  assert.ok(r.objects.filter((o) => o.army).length >= 1, 'the fortress is a battle with an army');
  assert.ok((r.props ?? []).filter((p) => p.kind === 'castle').length >= 2, 'castles fill the wild');
  // Without enemies every object can be reached from the camp
  const st = W.newWorld(r);
  st.seen = r.terrain.flatMap((row, y) => [...row].map((_, x) => y * row.length + x));
  st.done = r.objects.map((o) => o.id);
  st.owned = r.objects.filter((o) => o.kind === 'mine').map((o) => o.id);
  for (const o of r.objects) if (o.id !== 'camp') assert.ok(W.findPath(st, r, o), `${o.id} is reachable`);
});

test('world: moves, battle, loot, mines and days', () => {
  const r = W.FRONTIER;
  const st = W.newWorld(r);
  assert.equal(st.moves, W.MOVES_PER_DAY);
  const sq = r.objects.find((o) => o.id === 'sq1')!;
  const path = W.findPath(st, r, sq)!;
  let res: W.Arrival | null = null;
  for (const p of path) res = W.stepHero(st, r, p);
  assert.equal(res?.kind, 'battle');
  assert.notDeepEqual(st.hero, { x: sq.x, y: sq.y }, 'the hero waits next to the squad until the battle ends');
  W.winBattle(st, r, 'sq1');
  assert.deepEqual(st.hero, { x: sq.x, y: sq.y });
  assert.equal(st.res.gold, 40);
  assert.equal(W.objectAt(st, r, sq.x, sq.y), null);
  W.winBattle(st, r, 'saw');
  const inc = W.endDay(st, r);
  assert.equal(inc.wood, 5);
  assert.equal(st.day, 2);
  assert.equal(st.moves, W.MOVES_PER_DAY);
  // Without moves left the hero does not step
  st.moves = 0;
  assert.equal(W.stepHero(st, r, W.hexNeighbours(st.hero.x, st.hero.y).find((p) => { const t = W.terrainAt(r, p.x, p.y); return !!t && W.TERRAIN_COST[t] !== null; })!), null);
});

test('world: a rest of a chosen length returns moves in proportion, the full night starts a new day', async () => {
  const W = await import('../campaign/world');
  const st = W.newWorld();
  st.moves = 0;
  assert.equal(W.restHero(st, W.FRONTIER, 1), null);
  assert.equal(st.moves, W.REST_MOVES);
  assert.equal(st.day, 1);
  assert.equal(W.restHero(st, W.FRONTIER, 1), null);
  assert.equal(st.moves, W.REST_MOVES * 2);
  // the third part ends the day: income and full moves
  assert.notEqual(W.restHero(st, W.FRONTIER, 1), null);
  assert.equal(st.day, 2);
  assert.equal(st.moves, W.MOVES_PER_DAY);
  assert.equal(st.dayPart, 0);
  // «до утра» at once
  st.moves = 3;
  W.restHero(st, W.FRONTIER, W.REST_PARTS);
  assert.equal(st.day, 3);
});

test('world: a squad of the fortress chain holds the hexes around it, an optional one does not', async () => {
  const W = await import('../campaign/world');
  const { blockerFor } = await import('../campaign/zone');
  const st = W.newWorld();
  const near = (o: { x: number; y: number }) => {
    const ring = W.hexNeighbours(o.x, o.y);
    for (const to of ring) for (const from of W.hexNeighbours(to.x, to.y)) {
      if (!ring.some((q) => q.x === from.x && q.y === from.y) && !(from.x === o.x && from.y === o.y)) return { from, to };
    }
    throw new Error('no hex');
  };
  const sq1 = W.FRONTIER.objects.find((o) => o.id === 'sq1')!;
  const a = near(sq1);
  assert.equal(blockerFor(st, W.FRONTIER, a.from, a.to)?.id, 'sq1');
  assert.equal(blockerFor(st, W.FRONTIER, a.to, a.to), null, 'already next to it: not blocked again');
  W.winBattle(st, W.FRONTIER, 'sq1');
  assert.equal(blockerFor(st, W.FRONTIER, a.from, a.to), null, 'a beaten squad holds nothing');
  const optional = W.FRONTIER.objects.find((o) => o.id === 'stavka')!;
  const b = near(optional);
  assert.equal(blockerFor(W.newWorld(), W.FRONTIER, b.from, b.to), null);
});

test('world: the camp sells perk levels for resources, up to the top level, and saves them', async () => {
  const { BOONS } = await import('./config');
  const st = W.newWorld();
  assert.equal(W.upgradeCamp(st, 'sharp'), null, 'no resources — no upgrade');
  st.res = { gold: 2000, wood: 500, crystal: 50 };
  assert.equal(W.upgradeCamp(st, 'sharp'), 1);
  assert.equal(st.res.gold, 2000 - W.campCost(1).gold);
  assert.equal(W.upgradeCamp(st, 'sharp'), 2);
  assert.equal(W.upgradeCamp(st, 'sharp'), 3);
  assert.equal(W.upgradeCamp(st, 'sharp'), null, 'top level');
  assert.equal(W.upgradeCamp(st, 'nope'), null);
  const back = W.normalizeWorld(JSON.parse(JSON.stringify({ ...st, camp: { ...st.camp, junk: 2, haste: 9 } })))!;
  assert.deepEqual(back.camp, { sharp: 3, haste: W.CAMP_MAX_LEVEL });
  for (const id of W.CAMP_PERKS) assert.ok(BOONS.some((b) => b.id === id), `${id} is a boon`);
});

test('world: the hero gains xp and levels, finds items and wears one per slot', () => {
  const r = W.FRONTIER;
  const st: W.WorldState = W.newWorld(r);
  assert.equal(W.heroLevel(st), 1);
  assert.equal(st.equip.weapon, 'sword');
  assert.equal(Object.keys(st.equip).length, 1);
  W.winBattle(st, r, 'sq1'); // 3 волны — 30 опыта
  assert.equal(st.xp, 30);
  W.winBattle(st, r, 'warcamp'); // бой с армией — 100 опыта и знамя
  assert.equal(W.heroLevel(st), 2);
  assert.ok(st.items.includes('warbanner'));
  assert.equal(st.equip.banner, 'warbanner', 'a found item goes into an empty slot');
  W.giveItem(st, 'crossbow');
  assert.equal(st.equip.weapon, 'sword', 'a taken slot keeps its item');
  W.toggleEquip(st, 'crossbow');
  assert.equal(st.equip.weapon, 'crossbow');
  st.camp = { sight: 2 };
  assert.deepEqual(W.battlePerks(st), { sight: 3, slayer: 1, loot: 1, envoy: 1 });
  W.toggleEquip(st, 'crossbow');
  assert.equal(st.equip.weapon, undefined);
  const back = W.normalizeWorld(JSON.parse(JSON.stringify(st)))!;
  assert.deepEqual([back.xp, back.items, back.equip], [st.xp, st.items, st.equip]);
  // An old save without a hero gets the sword
  const { xp: _x, items: _i, equip: _e, ...old } = st;
  const fresh = W.normalizeWorld(JSON.parse(JSON.stringify(old)))!;
  assert.deepEqual([fresh.xp, fresh.items, fresh.equip], [0, ['sword'], { weapon: 'sword' }]);
});

test('world: a save survives a round trip and junk is rejected', () => {
  const st = W.newWorld();
  W.winBattle(st, W.FRONTIER, 'sq1');
  const back = W.normalizeWorld(JSON.parse(JSON.stringify(st)));
  assert.deepEqual(back, st);
  assert.equal(W.normalizeWorld({ v: 1 }), null);
  assert.equal(W.normalizeWorld({ v: 2, region: 'frontier', hero: { x: 99, y: 0 }, res: {} }), null);
  assert.equal(W.hexDistance({ x: 0, y: 0 }, { x: 0, y: 1 }), 1);
  assert.equal(W.hexDistance({ x: 0, y: 0 }, { x: 3, y: 0 }), 3);
  assert.ok(W.battleSeed(W.FRONTIER.objects[3])! > 0);
  assert.equal(W.battleSeed(W.FRONTIER.objects.find((o) => o.kind === 'fortress')!), null);
});

test('world: the tutorial trail — locks open in order and the whole chapter can be cleared', async () => {
  const D = await import('../campaign/dialogs');
  const r = W.FRONTIER;
  const st = W.newWorld(r);
  st.seen = r.terrain.flatMap((row, y) => [...row].map((_, x) => y * row.length + x));
  const at = (id: string) => r.objects.find((o) => o.id === id)!;
  assert.ok(!W.isLocked(st, at('sq1')), 'the first squad is open');
  assert.ok(W.isLocked(st, at('sq2')) && W.isLocked(st, at('fortress')), 'the rest waits');
  assert.match(W.lockText(st, r, at('sq2')), /Разведка орков/);
  assert.deepEqual(W.allowedTowers(st, r, at('sq1')), ['archer']);
  assert.deepEqual(W.allowedTowers(st, r, at('sq2')).sort(), ['archer', 'priest']);
  // Greedy walk: clear whatever the hero can reach (locked and hostile objects block the way)
  const order: string[] = [];
  for (let guard = 0; guard < 100 && !st.won; guard++) {
    const next = r.objects.find((o) => o.kind !== 'camp' && !W.isCleared(st, o.id) && !W.isLocked(st, o) && W.findPath(st, r, o));
    assert.ok(next, `stuck after ${order.join(', ')}`);
    order.push(next.id);
    if (W.isHostile(st, next)) W.winBattle(st, r, next.id);
    else W.stepHero(st, r, next) ?? (st.done.push(next.id), (st.hero = { x: next.x, y: next.y }));
    st.moves = W.MOVES_PER_DAY;
    if (!W.isCleared(st, next.id)) {
      st.hero = { x: next.x, y: next.y };
      if (next.kind === 'mine') st.owned.push(next.id);
      else st.done.push(next.id);
    }
  }
  assert.ok(st.won, 'the fortress falls');
  // Towers come before levels, levels before the binder
  const idx = (id: string) => order.indexOf(id);
  assert.ok(idx('sq3') < Math.min(idx('ford'), idx('bridge')) || idx('ford') === -1 || idx('bridge') === -1);
  assert.ok(Math.min(...['ford', 'bridge'].map(idx).filter((i) => i >= 0)) < idx('sq4'));
  assert.ok(Math.min(...['ford', 'bridge'].map(idx).filter((i) => i >= 0)) < idx('warcamp'), 'shop tier comes after levels');
  assert.deepEqual(W.allowedTowers(st, r, null).sort(), ['archer', 'ballista', 'mage', 'priest']);
  // Every scene trigger points at a real scene, every object id in triggers exists
  for (const [t, id] of Object.entries(D.SCENE_AT)) {
    assert.ok(D.SCENES.some((s) => s.id === id), `${t} → ${id}`);
    const obj = t.split(':')[1];
    if (obj) assert.ok(r.objects.some((o) => o.id === obj), `${t}: object exists`);
  }
  // The small node weakens the fortress camp (Г1-18б)
  const fort = r.objects.find((o) => o.id === 'fortress')!;
  assert.equal(W.armyLevel({ ...st, owned: [] }, fort), 'normal');
  assert.equal(W.armyLevel({ ...st, owned: ['node'] }, fort), 'easy');
  // Scenes come from the Lore Keeper's script: every scene has lines
  for (const sc of D.SCENES) assert.ok(sc.lines.length > 0, sc.id);
  // A scene plays once
  assert.ok(D.sceneFor('before:ford', []));
  assert.equal(D.sceneFor('before:bridge', ['levels']), null, 'the river fork shares one lesson');
  // Old saves: the prologue and scenes of cleared objects count as seen
  const old = W.normalizeWorld({ ...W.newWorld(r), done: ['sq1'], scenes: undefined });
  assert.ok(old && old.scenes.includes('start') && old.scenes.includes('sq1-after'));
});

test('world: chapters 2–5 — each region builds, is mostly wild and its trail leads to the fortress', () => {
  const ids = Object.keys(W.REGIONS);
  assert.deepEqual(ids, ['frontier', 'bog', 'ice', 'ash', 'dusk']);
  let prev: string | undefined = 'frontier';
  for (const id of ids.slice(1)) {
    assert.equal(W.REGIONS[prev!].next, id, `${prev} leads to ${id}`);
    prev = id;
    const r = W.REGIONS[id];
    let open = 0;
    for (const row of r.terrain) for (const c of row) if ('.=fh'.includes(c)) open++;
    assert.ok(open / (W.regionW(r) * W.regionH(r)) < 0.45, `${id}: walkable share ${open}`);
    for (const o of r.objects) assert.ok(W.terrainAt(r, o.x, o.y) && '.=fh'.includes(r.terrain[o.y][o.x]), `${o.id} stands on passable ground`);
    assert.equal(new Set(r.objects.map((o) => o.id)).size, r.objects.length);
    // The whole chapter can be cleared in trail order
    const st = W.newWorld(r);
    st.seen = r.terrain.flatMap((row, y) => [...row].map((_, x) => y * row.length + x));
    const order: string[] = [];
    for (let g = 0; g < 100 && order.length < r.objects.length - 1; g++) {
      const next = r.objects.find((o) => o.kind !== 'camp' && !W.isCleared(st, o.id) && !W.isHidden(st, o) && !W.isLocked(st, o) && W.findPath(st, r, o));
      assert.ok(next, `${id}: stuck after ${order.join(', ')}`);
      order.push(next.id);
      if (W.isHostile(st, next)) W.winBattle(st, r, next.id);
      else if (next.kind === 'event') {
        assert.ok(W.chooseEvent(st, r, next.id, next.id === 'ash_forkA' ? 1 : 0)); // Корх: обмен и сопровождение — открывает бой сопровождения
        st.hero = { x: next.x, y: next.y };
      } else {
        st.done.push(next.id);
        st.hero = { x: next.x, y: next.y };
      }
    }
    assert.ok(st.won, `${id}: the fortress falls`);
    assert.ok(order.length === r.objects.length - 1, `${id}: every object was reached (${order.length})`);
    assert.deepEqual(W.allowedTowers(st, r, null).length, 4, 'all towers after the tutorial');
  }
  // Moving on keeps the hero and the camp
  const st = W.newWorld(W.FRONTIER);
  st.camp = { sharp: 2 };
  st.xp = 99;
  st.done = ['sq1'];
  W.enterRegion(st, W.REGIONS.bog);
  assert.equal(st.region, 'bog');
  assert.deepEqual(st.done, []);
  assert.equal(st.camp.sharp, 2);
  assert.equal(st.xp, 99);
});

test('world: chapter 3 and 4 encounters follow the script — Korh, Bo-Rok, Kallen leads the enslaved', () => {
  const ash = W.REGIONS.ash;
  const korh = ash.objects.find((o) => o.id === 'ash_forkA')!;
  assert.deepEqual(korh.choices!.map((c) => c.label), ['Обменяться разведданными', 'Обменяться и сопроводить отряд', 'Отказаться от сделки']);
  assert.equal(ash.objects.find((o) => o.id === 'ash_forkB')!.choices!.length, 1, 'Bo-Rok: acquaintance only');
  const escort = ash.objects.find((o) => o.id === 'ash_escort')!;
  assert.equal(escort.waves, 6);
  assert.deepEqual(escort.reward, { gold: 120, crystal: 2 });
  const fort = ash.objects.find((o) => o.kind === 'fortress')!;
  for (const pick of [0, 1, 2]) {
    const st = W.newWorld(ash);
    assert.ok(W.isHidden(st, escort));
    assert.equal(W.objectAt(st, ash, escort.x, escort.y), null, 'no escort before the choice');
    assert.ok(!W.isSeen(st, ash, fort.x, fort.y));
    W.chooseEvent(st, ash, korh.id, pick);
    assert.equal(W.isHidden(st, escort), pick !== 1, `choice ${pick}: escort shows only after «сопроводить»`);
    assert.equal(W.isSeen(st, ash, fort.x, fort.y), pick !== 2, `choice ${pick}: the scouting report clears the fog over the Gates`);
    assert.ok(!st.flags.includes('korh-fight'));
  }
  const dusk = W.REGIONS.dusk.objects;
  const mirror = dusk.find((o) => o.id === 'dusk_forkB')!.choices!;
  assert.equal(mirror.length, 1, 'the Dark Mirror is a required trophy, no choice');
  assert.equal(mirror[0].item, 'mirror');
  assert.equal(dusk.find((o) => o.id === 'dusk_event3')!.name, 'Последняя стоянка');
  assert.equal(dusk.find((o) => o.id === 'dusk_sq3')!.name, 'Сумеречный дозор');
  const raid = W.REGIONS.ice.objects.find((o) => o.id === 'ice_event3')!;
  assert.equal(raid.kind, 'squad');
  assert.equal(raid.waves, 8);
  assert.equal(raid.faction, 6, 'enslaved expedition soldiers are humans');
  assert.ok(raid.bossLast, 'Kallen leads the last wave');
  assert.equal(raid.bossName, 'Каллен', 'the boss is named after Kallen, not the faction commander');
  // Замёрзший караван: после каждого выбора звучат свои реплики
  const caravan = W.REGIONS.ice.objects.find((o) => o.id === 'ice_event1')!;
  caravan.choices!.forEach((_, i) => assert.ok(D.sceneFor(`choice:ice_event1:${i + 1}`, [], [])?.lines.length, `caravan choice ${i + 1} has lines`));
});

test('dialogs: every chapter scene points at a real object, and conditional lines follow the choice flags', () => {
  const ids = new Set(Object.values(W.REGIONS).flatMap((r) => [r.id, ...r.objects.map((o) => o.id)]));
  const kinds = ['start', 'camp', 'before', 'after', 'loot', 'event', 'wave', 'choice'];
  for (const sc of D.SCENES) {
    if (!sc.id.includes(':')) continue; // глава 1: id через SCENE_AT
    const [kind, obj] = sc.id.split(':');
    assert.ok(kinds.includes(kind), `${sc.id}: known trigger`);
    assert.ok(ids.has(obj), `${sc.id}: object ${obj} exists`);
    assert.ok(sc.lines.length > 0, `${sc.id}: has lines`);
  }
  for (const id of Object.keys(W.REGIONS)) assert.ok(D.sceneFor(D.startTrigger(id), []), `${id}: opening scene`);
  // Реплики выбора есть только у вариантов, которые есть в событии
  for (const sc of D.SCENES.filter((s) => s.id.startsWith('choice:'))) {
    const [, obj, n] = sc.id.split(':');
    const o = Object.values(W.REGIONS).flatMap((r) => r.objects).find((ob) => ob.id === obj)!;
    assert.ok(o.choices && Number(n) >= 1 && Number(n) <= o.choices.length, `${sc.id}: choice exists`);
  }
  // Глава 2: у Феллы четыре исхода, все со своими репликами; переправа ждёт рощу, святилище — по желанию
  const bog = W.REGIONS.bog;
  const fella = bog.objects.find((o) => o.id === 'bog_forkB')!;
  assert.equal(fella.choices!.length, 4);
  for (let i = 1; i <= 4; i++) assert.ok(D.sceneFor(`choice:bog_forkB:${i}`, []), `Фелла, исход ${i}`);
  assert.deepEqual(bog.objects.find((o) => o.id === 'bog_cross')!.needs, ['bog_forkB']);
  assert.ok(!bog.objects.some((o) => o.needs?.includes('bog_forkA') || o.needsAny?.includes('bog_forkA')), 'святилище ничего не закрывает');
  // Корх в главе 5 говорит по выбору главы 4
  const korh = (flags: string[]) => D.sceneFor('event:dusk_forkA', [], flags)!.lines.map((l) => l.text);
  const trade = korh(['korh-trade']);
  const escort = korh(['korh-trade', 'korh-escort']);
  const refused = korh([]);
  assert.match(trade[0], /Ваши сведения сошлись/);
  assert.ok(trade.some((t) => /людьми ради моих не рискнули/.test(t)) && !trade.some((t) => /Раненые дома/.test(t)), 'обмен без сопровождения');
  assert.ok(escort.some((t) => /Раненые дома/.test(t)) && !escort.some((t) => /людьми ради моих не рискнули/.test(t)), 'сопровождение: Корх прикрывает тыл');
  assert.match(refused[0], /Соглашений между нами нет/);
  assert.ok(!refused.some((t) => /Ваши сведения сошлись/.test(t)));
  // Отклики на выборы прежних глав: семя Феллы (глава 2) и похороненный караван (глава 3 → Корх в главе 4)
  const after = (flags: string[]) => D.sceneFor('after:bog_fortress', [], flags)!.lines.map((l) => l.text);
  assert.ok(after(['fella-task']).some((t) => /нашли семя/.test(t)) && !after([]).some((t) => /нашли семя/.test(t)), 'семя Феллы');
  const korh4 = (flags: string[]) => D.sceneFor('event:ash_forkA', [], flags)!.lines.map((l) => l.text);
  assert.ok(korh4(['buried-caravan']).some((t) => /Имена с жетонов/.test(t)) && !korh4([]).some((t) => /Имена с жетонов/.test(t)), 'караван');
  for (const lines of [trade, escort, refused]) assert.match(lines[lines.length - 1], /не решил, кому достанется/);
});

test('world: the invader shows near the fortress, the continent near the camp', () => {
  for (const r of Object.values(W.REGIONS)) {
    const k = W.invasion(r);
    const camp = r.objects.find((o) => o.kind === 'camp')!;
    const fort = r.objects.find((o) => o.kind === 'fortress')!;
    if (r.level === 1) {
      assert.equal(k(camp.x, camp.y), 1, 'Пограничье — родной край орков');
      continue;
    }
    assert.ok(k(camp.x, camp.y) < 0.05, `${r.id}: nature at the camp`);
    assert.ok(k(fort.x, fort.y) > 0.95, `${r.id}: invader at the fortress`);
  }
});

import { cleanView } from '../fieldView';
test('cleanView: чужой снимок поля обрезается и проверяется', () => {
  assert.equal(cleanView(null), null);
  assert.equal(cleanView({ towers: 1, enemies: [] }), null);
  const v = cleanView({
    wave: 5, lives: 120, faction: 2,
    towers: [[3, 2, 'archer', 2, 0], [99, 99, 'nonsense', 1, 0], 'x'],
    enemies: [['a', 1.5, 2.5, 50, 'infantry'], ['b', 999, -999, 500, 'flyer'], ['c', 1, 1, 1, 'nonsense'], null],
  })!;
  assert.equal(v.towers.length, 1);
  assert.equal(v.enemies.length, 2);
  assert.ok(v.enemies[1][3] <= 100 && v.enemies[1][1] <= 16);
});

import { botFieldView } from '../fieldView';
test('botFieldView: поле бота растёт с волной и стоит вне дороги', () => {
  const info = (wave: number) => ({ id: 'bot1', race: 'humans' as const, difficulty: 'normal' as const, form: 1, lives: 150, wave, roundT: 10, roundLength: 40, faction: 1 });
  const road = new Set(MAPS[0].paths.flat().map((c) => `${c.x},${c.y}`));
  const a = botFieldView(info(2), MAPS[0]);
  const b = botFieldView(info(12), MAPS[0]);
  assert.ok(b.towers.length > a.towers.length);
  for (const t of b.towers) assert.ok(!road.has(`${t[0]},${t[1]}`) && !(t[0] === CASTLE.x && t[1] === CASTLE.y));
  assert.deepEqual(botFieldView(info(12), MAPS[0]).towers, b.towers);
  assert.ok(b.enemies.length > 0);
});

test('botFieldView: присланные боту враги видны — ждущие у входа, вошедшие идут', () => {
  const base = { id: 'bot1', race: 'humans' as const, difficulty: 'normal' as const, form: 1, lives: 150, wave: 3, roundT: 10, roundLength: 40, faction: 1 };
  const none = botFieldView(base, MAPS[0]);
  const waiting = botFieldView({ ...base, pending: { flyer: 3 } }, MAPS[0]);
  assert.equal(waiting.enemies.length, none.enemies.length + 3);
  assert.ok(waiting.enemies.filter((e) => e[4] === 'flyer').length >= 3);
  const joined = botFieldView({ ...base, joined: { flyer: 4 } }, MAPS[0]);
  assert.ok(joined.enemies.filter((e) => e[0].startsWith('s')).length > 0);
});

test('лог похода: разность состояний называет действие и хранит все числа', async () => {
  const { newWorld, FRONTIER, stepHero, endDay, upgradeCamp, winBattle, findPath, battleXp } = await import('../campaign/world');
  const { diffWorld, logWorldChange, logBattleStart, logBattleEnd, buildCampaignLog, resetCampaignLogForTest, campaignLogHead } = await import('../campaign/worldLog');
  const copy = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
  resetCampaignLogForTest();
  const a = newWorld();
  logWorldChange(null, a);
  assert.equal(campaignLogHead()?.events[0].kind, 'start');

  // Шаги к ближайшему отряду: подряд идущие шаги — одна запись с путём
  const squad = FRONTIER.objects.find((o) => o.kind === 'squad' && !o.needs?.length)!;
  const path = findPath(a, FRONTIER, squad)!;
  let st = a;
  for (const p of path.slice(0, 3)) {
    const next = copy(st);
    const res = stepHero(next, FRONTIER, p);
    if (!res || res.kind === 'battle') break;
    logWorldChange(st, next);
    st = next;
  }
  const ev = campaignLogHead()!.events;
  const move = ev[ev.length - 1];
  assert.equal(move.kind, 'move');
  assert.equal((move.d as { moves: number }).moves, st.moves - a.moves);
  assert.deepEqual(move.to, st.hero);

  // День: доход и остаток ходов
  const d1 = copy(st);
  endDay(d1, FRONTIER);
  assert.equal(diffWorld(st, d1)?.kind, 'day');

  // Победа: награда, опыт и объект
  const w = copy(d1);
  winBattle(w, FRONTIER, squad.id);
  const won = diffWorld(d1, w, { kind: 'battle-won' })!;
  assert.equal(won.kind, 'battle-won');
  assert.equal((won.d as { xp: number }).xp, battleXp(squad));
  assert.deepEqual((won.d as { done: string[] }).done, [squad.id]);

  // Лагерь: цена уходит в разность ресурсов
  const rich = copy(w);
  rich.res = { gold: 1000, wood: 100, crystal: 10 };
  const c = copy(rich);
  assert.equal(upgradeCamp(c, 'sharp'), 1);
  const camp = diffWorld(rich, c)!;
  assert.equal(camp.kind, 'camp');
  assert.deepEqual((camp.d as { res: unknown }).res, { gold: -100, wood: -15 });

  // Бой попадает в файл вместе с событиями начала и конца
  logBattleStart(d1, squad, { waves: squad.waves });
  logBattleEnd(d1, squad, 'defeat', null);
  logBattleStart(d1, squad, { waves: squad.waves });
  logBattleEnd(d1, squad, 'victory', null);
  const file = (await buildCampaignLog(w))!;
  assert.equal(file.battles.length, 2);
  assert.equal(file.battles[1].attempt, 2);
  assert.equal(file.events.filter((e) => e.kind === 'battle-end').length, 2);
  assert.ok(file.regions.frontier);
});

test('world: every region can be finished with the zone rules on — a squad never seals the way to what the chain needs', async () => {
  const W = await import('../campaign/world');
  const { blockerFor } = await import('../campaign/zone');
  for (const region of Object.values(W.REGIONS)) {
    const st = W.newWorld(region);
    // The whole map is known: walking is checked by terrain and zones, not by fog
    st.seen = Array.from({ length: region.terrain.length * region.terrain[0].length }, (_, i) => i);
    const reach = (goal: { x: number; y: number }) => {
      const key = (p: { x: number; y: number }) => `${p.x},${p.y}`;
      const seen = new Set([key(st.hero)]);
      const queue = [{ ...st.hero }];
      while (queue.length) {
        const cur = queue.shift()!;
        if (cur.x === goal.x && cur.y === goal.y) return true;
        for (const n of W.hexNeighbours(cur.x, cur.y)) {
          const t = W.terrainAt(region, n.x, n.y);
          if (!t || W.TERRAIN_COST[t] === null || seen.has(key(n))) continue;
          const o = W.objectAt(st, region, n.x, n.y);
          if (o && (o.x !== goal.x || o.y !== goal.y) && (W.isHostile(st, o) || W.isLocked(st, o))) continue;
          const g = blockerFor(st, region, cur, n);
          if (g && !(g.x === goal.x && g.y === goal.y)) continue;
          seen.add(key(n));
          queue.push(n);
        }
      }
      return false;
    };
    let guard = 0;
    while (!st.won && guard++ < 200) {
      const next = region.objects.find((o) => !W.isHidden(st, o) && W.isHostile(st, o) && !W.isLocked(st, o) && reach(o));
      if (!next) {
        // events and chests may open the chain: visit the free ones
        const free = region.objects.find((o) => !W.isHidden(st, o) && (o.kind === 'chest' || o.kind === 'shrine' || o.kind === 'event') && !st.done.includes(o.id) && !W.isLocked(st, o) && reach(o));
        if (!free) break;
        st.done.push(free.id);
        st.hero = { x: free.x, y: free.y };
        continue;
      }
      W.winBattle(st, region, next.id);
    }
    assert.ok(st.won, `${region.id}: stuck, left: ${region.objects.filter((o) => W.isHostile(st, o)).map((o) => o.id).join(', ')}`);
  }
});

import { checkRegion } from '../campaign/regionCheck';

test('world editor: built-in regions pass the check; a broken lock and a walled-in squad are caught; edits round-trip', () => {
  for (const r of Object.values(W.REGIONS)) {
    const res = checkRegion(r);
    assert.deepEqual(res.errors, [], `${r.id}: ${res.errors.join('; ')}`);
  }
  const r: W.RegionDef = JSON.parse(JSON.stringify(W.FRONTIER));
  const withLock = { ...r, objects: r.objects.map((o, i) => (i === 1 ? { ...o, needs: ['nope'] } : o)) };
  assert.ok(checkRegion(withLock).errors.some((e) => e.includes('nope')));
  const fort = r.objects.find((o) => o.kind === 'fortress')!;
  const walled = { ...r, terrain: r.terrain.map((row, y) => (y === fort.y ? row.slice(0, fort.x - 1) + 'ddd' + row.slice(fort.x + 2) : row)) };
  assert.ok(checkRegion(walled).errors.length > 0, 'a fortress behind a wall cannot be reached');
  assert.ok(W.normalizeRegion(JSON.parse(JSON.stringify(r))), 'a region file loads back');
  assert.equal(W.normalizeRegion({ ...r, terrain: r.terrain.slice(1) }), null, 'size must stay');
});
