// Автоигрок для проверки баланса: прогоняет настоящий движок игры (через дев-сервер) без рендера,
// с игровым временем вместо реального, и пишет итоги прогонов в JSON.
//
// Запуск: сначала `npm run dev`, затем
//   node scripts/balance_sim.mjs [out.json] [--runs=N] [--only=endless|campaign|mono]
// Нужен Playwright (как для scripts/character_sheet.mjs).
//
// Стратегия бота: покупает карточки, которые доводят тройку до слияния, ставит башню в свободную клетку,
// откуда в радиус попадает больше всего дороги, сразу сливает тройки, свойство выбирает случайно,
// лишнее золото тратит на ярус лавки и обновления; «Связки» ставит и связывает две сильнейшие башни
// разных видов, три связки сливает в тройную и поднимает ею лучшую башню. Следующую волну запускает
// сразу после зачистки (берёт бонус за ранний старт).

import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const out = args.find((a) => !a.startsWith('--')) ?? 'balance_results.json';
const opt = (name, def) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split('=')[1] : def;
};
const RUNS = Number(opt('runs', 8));
const ONLY = opt('only', '');
const URL_ = opt('url', 'http://localhost:3000/');
const PAGES = Number(opt('pages', 4));
const MAXWAVE = Number(opt('maxwave', 150));

// Задания. style: pro — расчётливый игрок (лучшие клетки, обновления лавки, ярус);
// casual — обычный игрок (клетка «получше» наугад, без обновлений лавки, ярус только при лишнем золоте)
const jobs = [];
const add = (n, job) => {
  for (let r = 0; r < n; r++) jobs.push({ ...job, seed: jobs.length * 7919 + 17 });
};
for (let level = 1; level <= 5; level++) {
  if (!ONLY || ONLY === 'endless') {
    add(RUNS, { kind: 'endless', level, policy: 'mixed', style: 'pro', difficulty: 'normal' });
    add(RUNS, { kind: 'endless', level, policy: 'mixed', style: 'casual', difficulty: 'normal' });
  }
  if (!ONLY || ONLY === 'mono')
    for (const t of ['archer', 'priest', 'mage', 'ballista'])
      add(Math.max(2, Math.ceil(RUNS / 2)), { kind: 'endless', level, policy: t, style: 'pro', difficulty: 'normal' });
  if (!ONLY || ONLY === 'campaign')
    for (const difficulty of ['normal', 'hard'])
      for (const style of ['pro', 'casual']) add(RUNS, { kind: 'campaign', level, policy: 'mixed', style, difficulty });
}

async function runInPage(job) {
  /* global window, document */
  const { GameEngine } = await import('/src/game/engine.ts');
  const { CONFIG } = await import('/src/game/config.ts');
  const { calculateKillGold } = await import('/src/game/rules.ts');

  // Seeded randomness and game-time clock (boss abilities and the Lich's graveyard read performance.now)
  let seed = job.seed >>> 0;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let clock = 0;
  performance.now = () => clock * 1000;

  const engine = new GameEngine();
  engine.setCanvas(document.createElement('canvas'));
  const endless = job.kind === 'endless';
  engine.startLevel(job.level, job.difficulty, endless);
  const casual = job.style === 'casual';
  engine.stopLoop();

  const types = ['archer', 'priest', 'mage', 'ballista'];
  const stats = {
    income: { start: engine.gold, kills: 0, waveClear: 0, early: 0 },
    spend: { archer: 0, priest: 0, mage: 0, ballista: 0, binder: 0, reroll: 0, tier: 0 },
    damage: {}, // "type" and "type:spec" → hp removed
    leaks: {}, // enemy type → enemies that reached the castle
    leakWaves: {}, // wave → lives lost
    waves: [], // per wave: lives, gold, towers, levels
    merges: { l2: 0, l3: 0 },
    triplets: 0,
    binders: { bought: 0, bound: 0, triple: 0, raised: 0 },
    rerolls: 0,
    tierAt: {}, // tier → wave reached
    specsPicked: {},
  };
  const addDmg = (key, v) => (stats.damage[key] = (stats.damage[key] ?? 0) + v);

  // --- instrumentation
  const origApply = engine.applyDamageToEnemy.bind(engine);
  engine.applyDamageToEnemy = (e, raw, dmgType, towerType, specs) => {
    const before = Math.max(0, e.hp);
    origApply(e, raw, dmgType, towerType, specs);
    const dealt = before - Math.max(0, e.hp);
    if (dealt > 0) {
      addDmg(towerType, dealt);
      const uniq = [...new Set(specs)];
      addDmg(`${towerType}:${uniq.length ? uniq.sort().join('+') : 'base'}`, dealt);
    }
  };
  let killGold = 0;
  const origKill = engine.killEnemy.bind(engine);
  engine.killEnemy = (e, idx) => {
    const g = engine.gold;
    origKill(e, idx);
    killGold += engine.gold - g;
  };
  const origCastle = engine.damageCastle.bind(engine);
  engine.damageCastle = (e, idx) => {
    const l = engine.lives;
    origCastle(e, idx);
    stats.leaks[e.type] = (stats.leaks[e.type] ?? 0) + 1;
    stats.leakWaves[engine.wave] = (stats.leakWaves[engine.wave] ?? 0) + (l - engine.lives);
  };
  const origStart = engine.startNextWave.bind(engine);
  engine.startNextWave = () => {
    const g = engine.gold;
    const ok = origStart();
    stats.income.early += engine.gold - g;
    return ok;
  };

  // --- coverage: road cells within a tower's range from each cell
  const map = engine.currentMap;
  const road = new Map();
  for (const path of map.paths) path.forEach((p, i) => road.set(`${p.x},${p.y}`, { x: p.x, y: p.y, i }));
  const roadCells = [...road.values()].map((r) => ({ x: r.x, y: r.y, w: 1 }));
  // Flyers go straight from each entrance to the castle: their line counts too
  const castle = { x: CONFIG.grid.castleTarget.x - 0.5, y: CONFIG.grid.castleTarget.y - 0.5 }; // in cell indices
  for (const path of map.paths) {
    const a = path[0];
    const len = Math.hypot(castle.x - a.x, castle.y - a.y);
    for (let d = 0; d < len; d += 0.5) {
      roadCells.push({ x: a.x + ((castle.x - a.x) * d) / len, y: a.y + ((castle.y - a.y) * d) / len, w: 0.35 });
    }
  }
  const coverCache = {};
  const coverage = (x, y, range) => {
    const k = `${x},${y},${range}`;
    if (coverCache[k] === undefined) {
      let c = 0;
      for (const r of roadCells) if (Math.hypot(r.x - x, r.y - y) <= range) c += r.w;
      coverCache[k] = c;
    }
    return coverCache[k];
  };
  const rangeOf = (type) => CONFIG.towers[type].range * 1.1;
  const freeCells = () => {
    const cells = [];
    for (let y = 0; y < CONFIG.grid.rows; y++)
      for (let x = 0; x < CONFIG.grid.cols; x++) if (engine.isCellFree(x, y)) cells.push({ x, y });
    return cells;
  };
  const bestCell = (type, worst = false) => {
    if (casual && !worst) {
      // Any cell from the better half by road coverage
      const cells = freeCells().map((c) => ({ ...c, s: coverage(c.x, c.y, rangeOf(type)) }));
      if (!cells.length) return null;
      const sorted = [...cells].sort((a, b) => b.s - a.s);
      const top = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 2)));
      return top[Math.floor(Math.random() * top.length)];
    }
    let best = null;
    let bestScore = worst ? Infinity : -1;
    for (const c of freeCells()) {
      const s = coverage(c.x, c.y, rangeOf(type)) + Math.random() * 0.01;
      if (worst ? s < bestScore : s > bestScore) {
        bestScore = s;
        best = c;
      }
    }
    return best;
  };

  // --- shop, as in App.tsx
  let cards = [];
  const genCards = () => {
    const triplet = CONFIG.shop.tripletChances[engine.tier - 1] || 0;
    const binder = CONFIG.shop.binderChances[engine.tier - 1] || 0;
    cards = [];
    for (let i = 0; i < CONFIG.shop.slotsCount; i++) {
      if (Math.random() < binder) {
        cards.push({ type: 'binder', isTriplet: false });
        continue;
      }
      const type = types[Math.floor(Math.random() * types.length)];
      cards.push({ type, isTriplet: Math.random() < triplet });
    }
  };
  genCards();
  engine.onWaveStarted = genCards;

  // Specializations: random pick, as an average player would
  const pendingSpec = [];
  engine.onNeedSpecChoice = (tower, part) => pendingSpec.push({ tower, part });
  const pickSpec = (type) => {
    const specs = CONFIG.towers[type].specs;
    const s = specs[Math.floor(Math.random() * specs.length)].id;
    stats.specsPicked[s] = (stats.specsPicked[s] ?? 0) + 1;
    return s;
  };
  const resolveSpecs = () => {
    while (pendingSpec.length) {
      const { tower, part } = pendingSpec.shift();
      const type = part === 'second' && tower.second ? tower.second.type : tower.type;
      engine.setTowerSpecialization(tower.id, pickSpec(type), part);
    }
  };

  const allowed = (type) => job.policy === 'mixed' || job.policy === type;
  const plain = (t) => !t.second;
  const group = (type, level) =>
    engine.towers.filter((t) => plain(t) && t.type === type && t.level === level && (level === 1 || t.specs.length > 0));

  const doMerges = () => {
    let merged = true;
    while (merged) {
      merged = false;
      for (const type of types)
        for (const level of [1, 2]) {
          const g = group(type, level);
          if (g.length >= 3) {
            g.sort((a, b) => coverage(b.x, b.y, rangeOf(type)) - coverage(a.x, a.y, rangeOf(type)));
            engine.selectTower(g[0].id);
            if (engine.mergeSelectedTower()) {
              merged = true;
              stats.merges[level === 1 ? 'l2' : 'l3']++;
              resolveSpecs();
            }
          }
        }
    }
    engine.selectTower(null);
  };

  const power = (t) => (t.level === 3 ? 9 : t.level === 2 ? 3 : 1) + (t.second ? (t.second.level === 3 ? 9 : t.second.level === 2 ? 3 : 1) : 0);

  const doBinders = () => {
    // Bind: the strongest unbound tower with the strongest unbound one of another type
    for (;;) {
      if (!engine.binders.some((b) => !b.triple)) break;
      const free = engine.towers.filter((t) => plain(t) && t.level >= 2 && t.specs.length > 0);
      free.sort((a, b) => power(b) - power(a));
      const main = free[0];
      const partner = main && free.find((t) => t.type !== main.type);
      if (!main || !partner) break;
      engine.selectTower(main.id);
      if (!engine.toggleBinding() || !engine.bindWith(partner)) break;
      stats.binders.bound++;
    }
    // Three plain binders that found no pair: merge into a triple one
    const plains = engine.binders.filter((b) => !b.triple);
    if (plains.length >= 3) {
      engine.selectBinder(plains[0].id);
      if (engine.mergeBinders()) stats.binders.triple++;
    }
    // Triple: raise the best tower that still can grow (Ур.2 → Ур.3 first)
    for (const b of engine.binders.filter((b) => b.triple)) {
      const targets = engine.getUpgradeTargets();
      if (!targets.length) break;
      targets.sort((a, b2) => (b2.level === 2 ? 10 : 0) + power(b2) - ((a.level === 2 ? 10 : 0) + power(a)));
      engine.selectBinder(b.id);
      engine.toggleUpgrading();
      if (engine.upgradeWithBinder(targets[0])) {
        stats.binders.raised++;
        resolveSpecs();
      }
    }
    engine.selectTower(null);
    engine.selectBinder(null);
  };

  const cardScore = (c) => {
    if (c.type === 'binder') {
      if (job.policy !== 'mixed') return -1;
      const strong = engine.towers.filter((t) => plain(t) && t.level >= 2);
      return new Set(strong.map((t) => t.type)).size >= 2 || engine.binders.length > 0 ? 2.5 : -1;
    }
    if (!allowed(c.type)) return -1;
    if (c.isTriplet) return 3 + group(c.type, 2).length;
    const n = group(c.type, 1).length;
    return 1 + (n === 2 ? 3 : n === 1 ? 1 : 0) - (job.policy === 'mixed' ? 0.15 * engine.towers.filter((t) => t.type === c.type).length : 0);
  };
  const cost = (c) => (c.type === 'binder' ? CONFIG.binder.cost : CONFIG.towers[c.type].cost * (c.isTriplet ? 3 : 1));

  const buyCard = (i) => {
    const c = cards[i];
    const g0 = engine.gold;
    if (c.type === 'binder') {
      const cell = bestCell('archer', true);
      if (!cell) return false;
      engine.placingBinder = true;
      if (!engine.placeBinder(cell.x, cell.y)) return false;
      stats.binders.bought++;
      stats.spend.binder += g0 - engine.gold;
    } else {
      const cell = bestCell(c.type);
      if (!cell) return false;
      engine.placingTowerType = c.type;
      engine.placingIsTriplet = c.isTriplet;
      engine.pendingTripletSpec = c.isTriplet ? pickSpec(c.type) : null;
      if (!engine.placeTower(cell.x, cell.y)) return false;
      if (c.isTriplet) stats.triplets++;
      stats.spend[c.type] += g0 - engine.gold;
    }
    cards[i] = null;
    return true;
  };

  const think = () => {
    resolveSpecs();
    doMerges();
    doBinders();
    for (let guard = 0; guard < 30; guard++) {
      let best = -1;
      let bestScore = 0;
      cards.forEach((c, i) => {
        if (!c || engine.gold < cost(c)) return;
        const s = cardScore(c);
        if (s > bestScore) {
          bestScore = s;
          best = i;
        }
      });
      if (best >= 0) {
        if (!buyCard(best)) cards[best] = null;
        doMerges();
        doBinders();
        continue;
      }
      // Nothing worth buying: raise the tier when there is a board, else reroll while gold lasts
      const tierCost = CONFIG.shop.tierUpgradeCosts[engine.tier - 1];
      if (engine.tier < 5 && engine.towers.length >= 3 * engine.tier && engine.gold >= tierCost + (casual ? 120 : 40)) {
        const g0 = engine.gold;
        if (engine.upgradeTier()) {
          stats.spend.tier += g0 - engine.gold;
          stats.tierAt[engine.tier] = engine.wave;
          continue;
        }
      }
      // Keeps enough for the dearest tower it buys, so rerolls never starve a purchase
      const reserve = Math.max(...types.filter(allowed).map((t) => CONFIG.towers[t].cost));
      const rerollCost = engine.rerollCost();
      if (!casual && engine.gold >= rerollCost + reserve) {
        // reroll as App.tsx does
        engine.payReroll();
        stats.spend.reroll += rerollCost;
        stats.rerolls++;
        genCards();
        continue;
      }
      break;
    }
  };

  // --- main loop in game time
  const DT = 0.05;
  const maxWave = endless ? job.maxWave : 12;
  let lastThink = 0;
  let steps = 0;
  let lastWaveLogged = 0;
  think();
  engine.startNextWave();
  while (!engine.isGameOver && !engine.isVictory && engine.wavesLaunched <= maxWave) {
    // Burn damage from «Огонь» (applied inside update)
    for (const e of engine.enemies) if (e.burnTimer > 0 && e.hp > 0) addDmg('mage:fire(поджог)', Math.min(e.hp, e.burnDps * DT));
    const g = engine.gold;
    killGold = 0;
    engine.update(DT);
    const delta = engine.gold - g - killGold;
    stats.income.kills += killGold;
    if (delta > 0) stats.income.waveClear += delta;
    clock += DT;
    steps++;
    if (steps % 200 === 0) {
      engine.floatingTexts.length = 0;
      engine.corpses.length = 0;
    }
    const waveActive = engine.waveInProgress || engine.isSpawning || engine.enemies.length > 0;
    if (!waveActive) {
      if (engine.wave !== lastWaveLogged) {
        lastWaveLogged = engine.wave;
        stats.waves.push({
          wave: engine.wavesLaunched,
          lives: engine.lives,
          gold: engine.gold,
          towers: engine.towers.length,
          levels: engine.towers.reduce((s, t) => s + power(t), 0),
          time: Math.round(clock),
        });
      }
      think();
      if (!engine.isVictory) engine.startNextWave();
    } else if (clock - lastThink >= 1) {
      lastThink = clock;
      think();
    }
    if (steps % 2000 === 0) await new Promise((r) => setTimeout(r, 0));
  }

  const towersFinal = engine.towers.map((t) => ({
    type: t.type,
    level: t.level,
    specs: t.specs,
    second: t.second ? { type: t.second.type, level: t.second.level, specs: t.second.specs } : null,
  }));
  return {
    ...job,
    victory: engine.isVictory,
    wavesLaunched: engine.wavesLaunched,
    reached: engine.isGameOver ? engine.wavesLaunched : engine.wavesLaunched,
    survived: engine.isGameOver ? engine.wavesLaunched - 1 : engine.wavesLaunched,
    lives: engine.lives,
    goldLeft: engine.gold,
    gameTime: Math.round(clock),
    killGoldCheck: calculateKillGold(5, job.level),
    towersFinal,
    tier: engine.tier,
    stats,
  };
}

const browser = await chromium.launch();
const results = [];
let next = 0;
const t0 = Date.now();
async function worker() {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('PAGEERR', e.message));
  await page.goto(URL_);
  await page.waitForFunction(() => window.gameEngine);
  while (next < jobs.length) {
    const job = jobs[next++];
    const r = await page.evaluate(runInPage, { ...job, maxWave: MAXWAVE });
    results.push(r);
    console.log(
      `${results.length}/${jobs.length} ${job.kind} ур.${job.level} ${job.policy} ${job.style} ${job.difficulty}: ` +
        (job.kind === 'campaign' ? (r.victory ? `победа, жизней ${r.lives}` : `поражение на волне ${r.reached}`) : `дошёл до волны ${r.reached}`) +
        ` (${Math.round((Date.now() - t0) / 1000)} с)`
    );
    writeFileSync(out, JSON.stringify(results, null, 1));
    await page.reload();
    await page.waitForFunction(() => window.gameEngine);
  }
  await page.close();
}
await Promise.all(Array.from({ length: PAGES }, worker));
await browser.close();
writeFileSync(out, JSON.stringify(results, null, 1));
console.log('Готово:', out);
