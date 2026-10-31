// Лист-каталог персонажей: docs/characters.png (и та же страница в HTML, если указан путь).
// Фигуры рисует сам движок игры (те же спрайты, оттенки, кольца уровня, значки специализаций),
// подписи берутся из src/game/config.ts.
//
// Запуск: сначала `npm run dev`, затем `node scripts/character_sheet.mjs [адрес] [путь.html]`
// (адрес по умолчанию http://localhost:3000/). Нужен Playwright: `npm i -D playwright && npx playwright install chromium`.

import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = process.argv[2] ?? 'http://localhost:3000/';
const htmlPath = process.argv[3];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
await page.goto(url);
await page.waitForFunction(() => (window).gameEngine);

await page.evaluate(async () => {
  const { sprites, drawSprite } = await import('/src/game/sprites.ts');
  const { CONFIG } = await import('/src/game/config.ts');
  await sprites.load();
  const engine = window.gameEngine;

  const K = 3; // разрешение рисунка относительно поля (клетка 64 px)
  const D = 2.4; // размер на листе относительно поля
  const fmt = (n) => String(n).replace('.', ',');
  const pct = (f) => `${Math.round(f * 100)}%`;

  // Холст w×h клеток с фигурой, нарисованной функцией draw(ctx) в координатах поля
  const figure = (draw, w = 1.4, h = 1.4) => {
    const c = document.createElement('canvas');
    c.width = Math.round(64 * w * K);
    c.height = Math.round(64 * h * K);
    const ctx = c.getContext('2d');
    ctx.scale(K, K);
    draw(ctx);
    const img = document.createElement('img');
    img.src = c.toDataURL('image/png');
    img.width = Math.round(64 * w * D);
    img.height = Math.round(64 * h * D);
    return img.outerHTML;
  };

  const tower = (type, level, specs = [], second = null) =>
    figure((ctx) => {
      ctx.translate(0.2 * 64, 0.3 * 64);
      const t = { id: 'x', type, level, specs, second, x: 0, y: 0, facing: 1, frozenTimer: 0 };
      engine.renderTowerSprite(ctx, t, 64, sprites.get(`tower_${type}_${level}`), 0);
    });

  const binder = (triple) =>
    figure((ctx) => {
      ctx.translate(0.2 * 64, 0.25 * 64);
      engine.renderBinder(ctx, { id: 'b', x: 0, y: 0, triple }, 64, 0.4);
    });

  // Как в engine.enemySprite: свой рисунок фракции или общий с оттенком цвета фракции
  const enemy = (type, level) => {
    const own = `enemy_${type}_${level}`;
    const isBoss = type === 'boss';
    const isImp = type === 'imp';
    const hasOwn = !isBoss && !isImp && sprites.has(own);
    const ownImp = isImp && sprites.has('enemy_imp');
    const name = isBoss ? `boss_${level}` : ownImp ? 'enemy_imp' : isImp ? 'enemy_scout' : hasOwn ? own : `enemy_${type}`;
    const tint = isBoss || hasOwn || ownImp ? null : isImp ? '#e0452f' : CONFIG.palettes[level - 1].enemies;
    const spr = sprites.get(name, tint);
    const h = isImp ? 24 : spr.meta.drawH;
    const size = isBoss ? 1.3 : 0.9;
    const img = figure(
      (ctx) => {
        const x = size * 32;
        const foot = size * 64 - 4;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath();
        ctx.ellipse(x, foot - 1, h * 0.3, h * 0.09, 0, 0, Math.PI * 2);
        ctx.fill();
        drawSprite(ctx, spr, x, foot, 1, h);
      },
      size,
      size
    );
    return { img, own: isBoss || hasOwn };
  };

  const towerTypes = ['archer', 'priest', 'mage', 'ballista'];
  const enemyTypes = ['infantry', 'scout', 'heavy', 'flyer', 'shaman', 'swarm'];
  const enemyNotes = {
    infantry: 'основа каждой волны',
    scout: 'быстрый',
    heavy: 'броня против физического урона',
    flyer: 'летит над дорогой, стойкость к магии',
    shaman: 'аура вокруг себя, стойкость к магии',
    swarm: 'стайка мелких, много за раз',
  };
  const factions = CONFIG.factions;
  const missing = [];

  let html = `
  <style>
    body { margin: 0; background: #121118; color: #f4f2e6; font: 15px/1.35 'DejaVu Sans', system-ui, sans-serif; }
    .sheet { width: 1560px; padding: 20px; }
    h1 { margin: 0 0 4px; font: bold 34px 'DejaVu Serif', Georgia, serif; color: #f4c06a; }
    h2 { margin: 28px 0 10px; font: bold 24px 'DejaVu Serif', Georgia, serif; color: #f4c06a; border-bottom: 1px solid #3b3f66; padding-bottom: 4px; }
    .lead { color: #b9b4c8; margin: 0 0 6px; }
    .grid { display: grid; gap: 10px; }
    .card { background: #1d1b27; border: 1px solid #2e2b3d; border-radius: 10px; padding: 8px 10px; }
    .card img { display: block; margin: 0 auto; }
    .name { font-weight: bold; font-size: 17px; }
    .sub { color: #b9b4c8; font-size: 13px; }
    .tag { display: inline-block; font-size: 12px; padding: 1px 6px; border-radius: 6px; background: #2b2838; color: #f4c06a; margin-top: 2px; }
    .tag.gen { color: #8fd0ff; }
    .row { display: grid; grid-template-columns: 300px repeat(3, 1fr); gap: 10px; align-items: stretch; margin-bottom: 10px; }
    .erow { display: grid; grid-template-columns: 210px repeat(5, 1fr); gap: 8px; margin-bottom: 8px; }
    .head { font-weight: bold; color: #f4c06a; }
    .center { text-align: center; }
    ul { margin: 4px 0 0 18px; padding: 0; }
  </style>
  <div class="sheet">
    <h1>Тёмный рубеж — персонажи</h1>
    <p class="lead">Все фигуры нарисованы самой игрой, как на поле. Числа — базовые, до роста по волнам и сложности.</p>
    <h2>Башни</h2>
    <p class="lead">Три башни одного вида и уровня сливаются в следующий уровень. «Тройка» из лавки сразу ставит Ур.2.
      Уровень показан золотыми кольцами и свечением, значок — специализации. Отдельного рисунка для Ур.2 и Ур.3 пока нет.</p>`;

  for (const type of towerTypes) {
    const d = CONFIG.towers[type];
    const [a, b, c] = d.specs;
    html += `<div class="row">
      <div class="card"><div class="name">${d.name}</div>
        <div class="sub">${d.cost} золота · урон ${d.damage} (${d.damageType === 'phys' ? 'физ.' : 'маг.'}) · период ${fmt(d.cooldown)} с · радиус ${fmt(d.range)} кл.</div>
        <ul class="sub">${d.specs.map((s) => `<li><b>${s.name}</b>: ${s.desc}</li>`).join('')}</ul></div>
      <div class="card center">${tower(type, 1)}<div class="name">Ур.1</div><div class="sub">из лавки</div></div>
      <div class="card center">${tower(type, 2, [a.id])}<div class="name">Ур.2 · ${a.name}</div><div class="sub">три Ур.1 или «тройка» из лавки</div></div>
      <div class="card center">${tower(type, 3, [a.id, b.id, c.id])}<div class="name">Ур.3 · ${a.name} + ${b.name} + ${c.name}</div><div class="sub">три Ур.2, их специализации складываются</div></div>
    </div>`;
  }

  html += `<h2>Связки</h2>
    <div class="grid" style="grid-template-columns: repeat(3, 1fr)">
      <div class="card center">${binder(false)}<div class="name">${CONFIG.binder.name}</div>
        <div class="sub">${CONFIG.binder.cost} золота, с 3-го яруса лавки. Соединяет две башни разного вида в одной клетке.</div></div>
      <div class="card center">${binder(true)}<div class="name">Тройная связка</div>
        <div class="sub">Три связки в одну. Поднимает любую башню или пару на уровень (кроме Ур.3).</div></div>
      <div class="card center">${tower('archer', 2, ['sniper'], { type: 'mage', level: 2, specs: ['fire'] })}<div class="name">Связанная пара</div>
        <div class="sub">Пример: Стрелок Ур.2 + Маг Ур.2. Каждая стреляет своими параметрами.</div></div>
    </div>`;

  html += `<h2>Враги по фракциям</h2>
    <p class="lead"><span class="tag">свой рисунок</span> нарисован для фракции.
      <span class="tag gen">общий рисунок</span> один на все фракции, окрашен в цвет фракции.</p>
    <div class="erow"><div></div>${factions
      .map((f) => `<div class="card"><div class="name">${f.name}</div><div class="sub">ур. ${f.id}, ${f.location}</div>
        <div class="sub"><b>${f.traitName}</b>: ${f.traitDesc}</div></div>`)
      .join('')}</div>`;

  for (const type of enemyTypes) {
    const d = CONFIG.enemies[type];
    html += `<div class="erow"><div class="card"><div class="name">${d.name}</div>
      <div class="sub">HP ${d.hp} · скорость ${fmt(d.speed)} кл./с${d.armor ? ` · броня ${pct(d.armor)}` : ''}${d.magicResist ? ` · защита от магии ${pct(d.magicResist)}` : ''} · ${d.gold} зол.</div>
      <div class="sub">${enemyNotes[type]}</div></div>`;
    for (const f of factions) {
      const e = enemy(type, f.id);
      if (!e.own) missing.push(`${d.name} (${f.name})`);
      html += `<div class="card center">${e.img}<span class="tag ${e.own ? '' : 'gen'}">${e.own ? 'свой рисунок' : 'общий рисунок'}</span></div>`;
    }
    html += `</div>`;
  }
  const imp = CONFIG.enemies.imp;
  html += `<div class="erow"><div class="card"><div class="name">${imp.name}</div>
      <div class="sub">HP ${imp.hp} · скорость ${fmt(imp.speed)} кл./с · без золота</div><div class="sub">призывает Владыка бездны</div></div>
      <div></div><div></div><div></div>
      <div class="card center">${enemy('imp', 4).img}<span class="tag gen">рисунок разведчика, красный</span></div><div></div></div>`;

  const boss = CONFIG.enemies.boss;
  html += `<h2>Боссы</h2>
    <p class="lead">Выходят в 12-й волне. Базово HP ${boss.hp}, скорость ${fmt(boss.speed)} кл./с, броня ${pct(boss.armor)}, защита от магии ${pct(boss.magicResist)}, ${boss.gold} золота.</p>
    <div class="grid" style="grid-template-columns: repeat(5, 1fr)">${factions
      .map((f) => `<div class="card center">${enemy('boss', f.id).img}<div class="name">${f.bossName}</div>
        <div class="sub">${f.name}, ур. ${f.id}</div><div class="sub" style="text-align:left">${f.bossDesc}</div></div>`)
      .join('')}</div>
  </div>`;

  document.head.querySelectorAll('style, link[rel=stylesheet]').forEach((n) => n.remove());
  document.body.innerHTML = html;
  document.body.style.cssText = '';
  window.__missing = missing;
});

const missing = await page.evaluate(() => window.__missing);
const out = join(root, 'docs');
mkdirSync(out, { recursive: true });
await page.locator('.sheet').screenshot({ path: join(out, 'characters.png') });
if (htmlPath) {
  const body = await page.evaluate(() => document.body.innerHTML);
  writeFileSync(
    htmlPath,
  `<!doctype html>\n<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>Персонажи игры</title></head><body style="margin:0;background:#121118">${body}</body></html>\n`
  );
}
console.log('Без своего рисунка:', missing.join(', '));
await browser.close();
