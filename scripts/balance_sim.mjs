// Автоигрок для проверки баланса: прогоняет настоящий движок игры (через дев-сервер) без рендера,
// с игровым временем вместо реального, и пишет итоги прогонов в JSON.
//
// Запуск: сначала `npm run dev`, затем
//   node scripts/balance_sim.mjs [out.json] [--runs=N] [--only=endless|campaign|mono|brawl] [--faction=6] [--levels=1,3] [--random-map]
// --only=brawl: «Потасовка» — бот только защищается против семерых ботов (--difficulty — сила ботов), итог — место
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
  return a ? a.slice(a.indexOf('=') + 1) : def;
};
const RUNS = Number(opt('runs', 8));
const ONLY = opt('only', '');
const URL_ = opt('url', 'http://localhost:3000/');
const PAGES = Number(opt('pages', 4));
const DIFF = opt('difficulty', 'normal'); // сложность бесконечных прогонов
const MAXWAVE = Number(opt('maxwave', 150));
// Враги в бесконечном режиме отдельно от карты: --faction=6 (люди на всех картах); 0 — хозяева карты
const FACTION = Number(opt('faction', 0));
const LEVELS = opt('levels', '1,2,3,4,5').split(',').map(Number);
// Бесконечный режим на случайных дорогах (src/game/mapgen.ts): --random-map — у каждого прогона своя карта
const RANDOM_MAP = args.includes('--random-map');
// Культисты: --no-fuse — бот не собирает фигуры в мегабашни (для сравнения)
const NO_FUSE = args.includes('--no-fuse');
// Раса игрока (чьи башни в лавке): humans, orcs, undead, cultists, demons, elves или all — все по очереди
const RACE_OPT = opt('race', 'humans');
// --boons=0: потасовка без усилений артефакта (по умолчанию бот берёт случайное из трёх)
const BOONS = opt('boons', '1') !== '0';
// Закрытые зоны (проба, только Потасовка): --zones=auto (доля по расе) или число 0..1; --unlock=none|gold|kills|round|mix
// --zprice=25 (золото за клетку, ×1,25 за каждую открытую зону), --zkills=40, --zround=2
const ZONES = opt('zones', '');
const UNLOCK = opt('unlock', 'none');
const ZPRICE = Number(opt('zprice', 25));
const ZKILLS = Number(opt('zkills', 40));
const ZROUND = Number(opt('zround', 2));
const ZPLACE = opt('zplace', 'even'); // even — поровну у дороги и вдали; near — все зоны у дороги
const RACES = RACE_OPT === 'all' ? ['humans', 'orcs', 'undead', 'cultists', 'demons', 'elves'] : RACE_OPT.split(',');
// Пробные числа без правки config.ts: --set=siege.attack.shaman.range=2,lives.start=300
const SET = opt('set', '')
  .split(',')
  .filter(Boolean)
  .map((kv) => kv.split('='))
  .map(([k, v]) => [k, Number(v)]);

// Задания. style: pro — расчётливый игрок (лучшие клетки, обновления лавки, ярус);
// casual — обычный игрок (клетка «получше» наугад, без обновлений лавки, ярус только при лишнем золоте)
const jobs = [];
const add = (n, job) => {
  for (let r = 0; r < n; r++)
    jobs.push({ ...job, noFuse: NO_FUSE, seed: jobs.length * 7919 + 17, mapSeed: RANDOM_MAP && job.kind === 'endless' ? jobs.length + 1 : null });
};
for (const race of RACES)
for (const level of LEVELS) {
  if (!ONLY || ONLY === 'endless') {
    add(RUNS, { kind: 'endless', level, policy: 'mixed', style: 'pro', difficulty: DIFF, faction: FACTION, race });
    add(RUNS, { kind: 'endless', level, policy: 'mixed', style: 'casual', difficulty: DIFF, faction: FACTION, race });
  }
  if (ONLY === 'brawl')
    for (const style of ['pro', 'casual']) add(RUNS, { kind: 'brawl', level, policy: 'mixed', style, difficulty: DIFF, race, boons: BOONS, zones: ZONES, unlock: UNLOCK, zprice: ZPRICE, zkills: ZKILLS, zround: ZROUND, zplace: ZPLACE });
  if ((!ONLY || ONLY === 'mono') && race === 'humans')
    for (const t of ['archer', 'priest', 'mage', 'ballista'])
      add(Math.max(2, Math.ceil(RUNS / 2)), { kind: 'endless', level, policy: t, style: 'pro', difficulty: 'normal', race });
  if (!ONLY || ONLY === 'campaign')
    for (const difficulty of ['normal', 'hard'])
      for (const style of ['pro', 'casual']) add(RUNS, { kind: 'campaign', level, policy: 'mixed', style, difficulty, race });
}

async function runInPage(job) {
  /* global window, document */
  const { GameEngine } = await import('/src/game/engine.ts');
  const { CONFIG } = await import('/src/game/config.ts');
  const { calculateKillGold } = await import('/src/game/rules.ts');
  const { rollShop } = await import('/src/game/shop.ts');
  for (const [path, value] of job.set ?? []) {
    const keys = path.split('.');
    let o = CONFIG;
    for (const k of keys.slice(0, -1)) o = o[k];
    o[keys[keys.length - 1]] = value;
  }

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
  const brawlJob = job.kind === 'brawl';
  let room = null;
  let brawlWon = false;
  if (brawlJob) {
    // «Потасовка»: часы дуэли от 0, комната тикает вручную, её сообщения — сразу
    const { BrawlRoom, brawlBots } = await import('/src/brawl.ts');
    engine.startDuel(job.level, 0, job.level, job.race || 'humans', CONFIG.brawl.roundLength);
    room = new BrawlRoom(job.level, engine.race, brawlBots(job.difficulty), 0, () => engine.lives);
    room.emit = (msg) => {
      if (msg.t === 'send') engine.receiveSend(msg.enemies, msg.army);
      else if (msg.t === 'lost') brawlWon = true;
    };
    engine.onDuelSend = (enemies) => room.send({ t: 'send', enemies });
    engine.waveFactionFor = (w) => room.factionForWave(w);
    engine.boonsOn = job.boons !== false;
  } else engine.startLevel(job.level, job.difficulty, endless, job.faction || undefined, job.race || 'humans', job.mapSeed ?? null);
  const raceDef = CONFIG.races[engine.race];
  const NEED = raceDef.merge;
  if (engine.race === 'demons') engine.setAutoAbilities(true);
  const casual = job.style === 'casual';
  engine.stopLoop();

  const types = raceDef.towers;
  const stats = {
    income: { start: engine.gold, kills: 0, waveClear: 0, early: 0 },
    spend: { ...Object.fromEntries(raceDef.towers.map((t) => [t, 0])), binder: 0, reroll: 0, tier: 0 },
    damage: {}, // "type" and "type:spec" → hp removed
    leaks: {}, // enemy type → enemies that reached the artifact
    castleDmg: {}, // enemy type → artifact HP taken
    guardAt: {}, // guard level → wave reached
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
  // Осада артефакта: каждый удар врага (кто дошёл — leaks, урон по видам — castleDmg, по волнам — leakWaves)
  const seen = new Set();
  const origCastle = engine.hitCastle.bind(engine);
  engine.hitCastle = (e, dmg) => {
    const l = engine.lives;
    origCastle(e, dmg);
    if (!seen.has(e.id)) {
      seen.add(e.id);
      stats.leaks[e.type] = (stats.leaks[e.type] ?? 0) + 1;
    }
    stats.castleDmg[e.type] = (stats.castleDmg[e.type] ?? 0) + (l - engine.lives);
    stats.leakWaves[engine.wave] = (stats.leakWaves[engine.wave] ?? 0) + (l - engine.lives);
  };
  const origStart = engine.startNextWave.bind(engine);
  engine.startNextWave = (...args) => {
    const g = engine.gold;
    const ok = origStart(...args);
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
  // Осада: дошедшие враги стоят у артефакта и бьют его, пока их не добьют — его окрестность важнее любой клетки дороги
  roadCells.push({ x: castle.x, y: castle.y, w: 4 });
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
  // Культисты: клетка рядом с другими башнями культистов ценнее (так складываются фигуры мегабашен)
  const adjBonus = (x, y) =>
    engine.race !== 'cultists' ? 1 : 1 + 0.15 * engine.towers.filter((t) => Math.abs(t.x - x) + Math.abs(t.y - y) === 1).length;
  const freeCells = () => {
    const cells = [];
    for (let y = 0; y < CONFIG.grid.rows; y++)
      for (let x = 0; x < CONFIG.grid.cols; x++) if (engine.isCellFree(x, y)) cells.push({ x, y });
    return cells;
  };
  const bestCell = (type, worst = false) => {
    if (casual && !worst) {
      // Any cell from the better half by road coverage
      const cells = freeCells().map((c) => ({ ...c, s: coverage(c.x, c.y, rangeOf(type)) * adjBonus(c.x, c.y) }));
      if (!cells.length) return null;
      const sorted = [...cells].sort((a, b) => b.s - a.s);
      const top = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 2)));
      return top[Math.floor(Math.random() * top.length)];
    }
    let best = null;
    let bestScore = worst ? Infinity : -1;
    for (const c of freeCells()) {
      const s = coverage(c.x, c.y, rangeOf(type)) * (worst ? 1 : adjBonus(c.x, c.y)) + Math.random() * 0.01;
      if (worst ? s < bestScore : s > bestScore) {
        bestScore = s;
        best = c;
      }
    }
    return best;
  };

  // --- shop, as in App.tsx
  let cards = [];
  const pity = { since: 0 };
  const genCards = () => {
    const shopTypes = types.filter((t) => (CONFIG.towers[t].minTier ?? 1) <= engine.tier);
    cards = rollShop(engine.tier, shopTypes, { triplets: !!raceDef.triplets, binders: !!raceDef.binders }, pity);
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
  const plain = (t) => !t.second && !t.fused;
  const group = (type, level) =>
    engine.towers.filter((t) => plain(t) && t.type === type && t.level === level && !engine.specPending(t));

  // Культисты: фигура собирается в одну мегабашню, мегабашни — в гипербашню
  const doFuse = () => {
    if (engine.race !== 'cultists' || job.noFuse) return;
    for (let guard = 0; guard < 12; guard++) {
      const t = engine.towers.find((x) => engine.fuseKind(x));
      if (!t) break;
      engine.selectedTowerId = t.id;
      const kind = engine.fuseKind(t);
      const cells = kind === 'hyper' ? engine.suggestHyperCells(t) : undefined;
      if (kind === 'hyper' && !cells) {
        engine.cancelHyper();
        break;
      }
      if (!engine.fuseSelected(undefined, cells)) break;
    }
  };
  const doMerges = () => {
    let merged = true;
    while (merged) {
      merged = false;
      for (const type of types)
        for (let level = 1; level < (raceDef.maxLevel ?? 3); level++) {
          const g = group(type, level);
          if (g.length >= NEED) {
            g.sort((a, b) => coverage(b.x, b.y, rangeOf(type)) - coverage(a.x, a.y, rangeOf(type)));
            engine.selectTower(g[0].id);
            if (engine.mergeSelectedTower()) {
              merged = true;
              stats.merges[`l${level + 1}`] = (stats.merges[`l${level + 1}`] ?? 0) + 1;
              resolveSpecs();
            }
          }
        }
    }
    engine.selectTower(null);
  };

  const power = (t) => Math.pow(NEED, t.level - 1) + (t.second ? Math.pow(NEED, t.second.level - 1) : 0);

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
    // Особые башни (клетка, алтарь, склеп, врата) сами не стреляют: сначала три стреляющие
    if (CONFIG.towers[c.type].special && engine.towers.filter((t) => !CONFIG.towers[t.type].special).length < 3) return -1;
    if (c.level3) return 6;
    if (c.isTriplet) return 3 + group(c.type, 2).length;
    const n = group(c.type, 1).length;
    return 1 + (n === NEED - 1 ? 3 : n >= 1 ? 1 : 0) - (job.policy === 'mixed' ? 0.15 * engine.towers.filter((t) => t.type === c.type).length : 0);
  };
  const cost = (c) => (c.type === 'binder' ? engine.binderPrice() : engine.towerPrice(c.type, c.level3 ? 3 : c.isTriplet ? 2 : 1));

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
      engine.placingIsTriplet = c.isTriplet || c.level3;
      engine.placingStartLevel = c.level3 ? 3 : c.isTriplet ? 2 : 1;
      engine.pendingTripletSpec = (c.isTriplet || c.level3) && CONFIG.towers[c.type].specs.length ? pickSpec(c.type) : null;
      if (!engine.placeTower(cell.x, cell.y)) return false;
      resolveSpecs();
      if (c.isTriplet || c.level3) stats.triplets++;
      stats.spend[c.type] += g0 - engine.gold;
    }
    cards[i] = null;
    return true;
  };

  // --- Закрытые зоны: группы по 2–3 клетки, поровну среди клеток у дороги и вдали от неё, не у артефакта
  const ZONE_SHARE = { humans: 0.3, demons: 0.22, cultists: 0.2, orcs: 0.15, undead: 0.15, elves: 0.1 };
  const zoneShare = !brawlJob || !job.zones ? 0 : job.zones === 'auto' ? ZONE_SHARE[engine.race] : Number(job.zones);
  const zones = []; // [{ cells: [{x,y}], open: false }]
  const zoneLog = { cells: 0, opened: [], goldSpent: 0 };
  if (zoneShare > 0) {
    const castleC = CONFIG.grid.castleCells[0];
    const roadSet = new Set(roadCells.filter((r) => r.w === 1).map((r) => `${r.x},${r.y}`));
    const nearRoad = (x, y) => [-1, 0, 1].some((dx) => [-1, 0, 1].some((dy) => roadSet.has(`${x + dx},${y + dy}`)));
    const cand = freeCells().filter((c) => Math.max(Math.abs(c.x - castleC.x), Math.abs(c.y - castleC.y)) > 1);
    const taken = new Set();
    for (const near of job.zplace === 'near' ? [true] : [true, false]) {
      const group = cand.filter((c) => job.zplace === 'near' || nearRoad(c.x, c.y) === near);
      const pool = job.zplace === 'near' ? cand.filter((c) => nearRoad(c.x, c.y)) : group;
      let left = Math.round(group.length * zoneShare);
      group.length = 0;
      group.push(...pool);
      const inGroup = new Set(group.map((c) => `${c.x},${c.y}`));
      for (let guard = 0; left > 0 && guard < 500; guard++) {
        const free = group.filter((c) => !taken.has(`${c.x},${c.y}`));
        if (!free.length) break;
        const seedC = free[Math.floor(Math.random() * free.length)];
        // не прижимать зону к другой зоне: у новой группы нет соседей из старых
        const touches = (c) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => taken.has(`${c.x + dx},${c.y + dy}`));
        if (touches(seedC) && guard < 400) continue;
        const cells = [seedC];
        taken.add(`${seedC.x},${seedC.y}`);
        const size = Math.min(left, 2 + (Math.random() < 0.5 ? 1 : 0));
        while (cells.length < size) {
          const nb = cells.flatMap((c) => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: c.x + dx, y: c.y + dy })))
            .filter((c) => inGroup.has(`${c.x},${c.y}`) && !taken.has(`${c.x},${c.y}`) && !touches({ x: -9, y: -9 }));
          if (!nb.length) break;
          const n = nb[Math.floor(Math.random() * nb.length)];
          cells.push(n);
          taken.add(`${n.x},${n.y}`);
        }
        left -= cells.length;
        zones.push({ cells, open: false });
      }
    }
    zoneLog.cells = taken.size;
  }
  const applyZones = () => {
    if (!zones.length) return;
    engine.currentMap = { ...engine.currentMap, blocked: zones.filter((z) => !z.open).flatMap((z) => z.cells) };
  };
  applyZones();
  const zoneValue = (z) => z.cells.reduce((s, c) => s + coverage(c.x, c.y, 2.7), 0);
  const openBestZone = (why) => {
    const closed = zones.filter((z) => !z.open).sort((a, b) => zoneValue(b) - zoneValue(a));
    if (!closed.length) return false;
    closed[0].open = true;
    zoneLog.opened.push({ wave: engine.wavesLaunched, why });
    applyZones();
    return true;
  };
  let zoneRoundsDone = 0;
  const zonePrice = () => Math.round((job.zprice ?? 25) * 2.5 * 1.25 ** zoneLog.opened.length);
  const zoneTick = () => {
    if (!zones.length || zones.every((z) => z.open)) return;
    const u = job.unlock;
    if (u === 'kills' || u === 'mix2') {
      while (engine.runStats.killed >= (zoneLog.opened.length + 1) * job.zkills && openBestZone('kills'));
    }
    if (u === 'round' || u === 'mix') {
      while (Math.floor(engine.wavesLaunched / job.zround) > zoneRoundsDone) {
        zoneRoundsDone++;
        openBestZone('round');
      }
    }
    if (u === 'gold' || u === 'mix' || u === 'mix2') {
      // бот покупает зону, когда хороших клеток мало или золота вдвое больше цены
      const goodFree = freeCells().filter((c) => coverage(c.x, c.y, 2.7) > 3).length;
      const price = zonePrice();
      if (engine.gold >= price && (goodFree < 4 || engine.gold >= 2 * price)) {
        engine.gold -= price;
        zoneLog.goldSpent += price;
        openBestZone('gold');
      }
    }
  };

  const think = () => {
    zoneTick();
    resolveSpecs();
    doMerges();
    doFuse();
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
        doFuse();
        doBinders();
        continue;
      }
      // Защита артефакта: следующий уровень, когда на поле уже есть башни и золото с запасом
      const guardCost = engine.guardUpgradeCost();
      if (guardCost !== null && engine.towers.length >= 2 + 2 * engine.guardLevel && engine.gold >= guardCost + (casual ? 120 : 40)) {
        if (engine.upgradeGuard()) {
          stats.spend.guard = (stats.spend.guard ?? 0) + guardCost;
          stats.guardAt[engine.guardLevel] = engine.wave;
          continue;
        }
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

  // --- «Потасовка»: волны идут по часам, бот только защищается
  const DT = 0.05;
  if (brawlJob) {
    let lastTick = 0;
    let steps = 0;
    think();
    while (!engine.isGameOver && !brawlWon && clock < 3 * 3600) {
      engine.update(DT);
      engine.tickWaveCountdown(DT);
      clock += DT;
      steps++;
      if (clock - lastTick >= 0.5) {
        lastTick = clock;
        if (engine.wavesLaunched !== stats.waves.length) stats.waves.push({ wave: engine.wavesLaunched, lives: engine.lives, gold: engine.gold, towers: engine.towers.length, enemies: engine.enemies.length + engine.spawnQueue.length });
        room.tick();
        const offer = engine.boonOffers[0];
        if (offer) engine.chooseBoon(offer[Math.floor(Math.random() * offer.length)]);
        think();
      }
      if (steps % 200 === 0) {
        engine.floatingTexts.length = 0;
        engine.corpses.length = 0;
      }
      if (steps % 2000 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    if (engine.isGameOver) room.send({ t: 'lost', wave: engine.wavesLaunched });
    const snap = room.snapshot();
    return {
      ...job,
      place: snap.yourPlace,
      wavesLaunched: engine.wavesLaunched,
      lives: engine.lives,
      gameTime: Math.round(clock),
      table: snap.seats.map((x) => ({ name: x.name, kind: x.kind, place: x.place })),
      zones: { share: zoneShare, groups: zones.length, ...zoneLog, killed: engine.runStats.killed, towers: engine.towers.length, freeLeft: freeCells().length },
      waves: stats.waves,
    };
  }

  // --- main loop in game time
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
    mapSeed: job.mapSeed ?? null,
    killGoldCheck: calculateKillGold(5, job.level),
    towersFinal,
    tier: engine.tier,
    guardLevel: engine.guardLevel,
    megas: engine.megas.map((m) => m.shape),
    otherDmg: Math.round(engine.runStats.other), // урон не от башен: в основном защита артефакта
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
    const r = await page.evaluate(runInPage, { ...job, maxWave: MAXWAVE, set: SET });
    results.push(r);
    console.log(
      `${results.length}/${jobs.length} ${job.race} ${job.kind} ур.${job.level}${job.faction ? ` фр.${job.faction}` : ''} ${job.policy} ${job.style} ${job.difficulty}: ` +
        (job.kind === 'brawl' ? `место ${r.place}, волна ${r.wavesLaunched}, зон ${r.zones.groups}/${r.zones.opened.length}, убито ${r.zones.killed}, башен ${r.zones.towers}, свободно ${r.zones.freeLeft}, ${Math.round(r.gameTime / 60)} мин` : job.kind === 'campaign' ? (r.victory ? `победа, жизней ${r.lives}` : `поражение на волне ${r.reached}`) : `дошёл до волны ${r.reached}`) +
        ` (${Math.round((Date.now() - t0) / 1000)} с)`
    );
    writeFileSync(out, JSON.stringify(results, null, 1));
    // Дев-сервер иногда сам перезагружает страницу (правка файла) — тогда пробуем ещё раз
    for (let tryN = 0; ; tryN++) {
      try {
        await page.goto(URL_);
        await page.waitForFunction(() => window.gameEngine);
        break;
      } catch (e) {
        if (tryN >= 4) throw e;
        await new Promise((ok) => setTimeout(ok, 1000));
      }
    }
  }
  await page.close();
}
await Promise.all(Array.from({ length: PAGES }, worker));
await browser.close();
writeFileSync(out, JSON.stringify(results, null, 1));
console.log('Готово:', out);
