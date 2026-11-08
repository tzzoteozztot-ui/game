/**
 * Чужое поле в «Потасовке» (просьба Артура 2026-11-08): схема поля другого игрока, только чтение.
 * Каждое поле считает его хозяин, поэтому по сети идёт снимок: башни и враги в клетках. Снимок уходит
 * только тем, кто смотрит (`watch`), раз в 0,5 с. У ботов поля нет — смотреть можно только игроков.
 */

import { CONFIG, TowerType } from './game/config';
import { GRID_COLS, GRID_ROWS, CASTLE, MapDef } from './game/maps';
import { sprites } from './game/sprites';

export interface FieldView {
  wave: number; // волн запущено
  lives: number; // прочность артефакта
  towers: [number, number, string, number, number][]; // клетка x, y, вид, уровень, уровень второй башни связки (0 — нет)
  enemies: [number, number, number, number][]; // x, y (дробные клетки), HP в процентах, 0 обычный / 1 босс / 2 летун
  faction: number; // чьи враги на поле сейчас (для цвета)
}

const MAX_TOWERS = 112;
const MAX_ENEMIES = 160;

const num = (v: unknown, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number(v) || 0));

/** Снимок из сети: проверяем всё, что пришло, и обрезаем по размеру поля */
export function cleanView(v: unknown): FieldView | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.towers) || !Array.isArray(o.enemies)) return null;
  const towers: FieldView['towers'] = [];
  for (const t of o.towers.slice(0, MAX_TOWERS)) {
    if (!Array.isArray(t) || typeof t[2] !== 'string' || !(t[2] in CONFIG.towers)) continue;
    towers.push([Math.floor(num(t[0], 0, GRID_COLS - 1)), Math.floor(num(t[1], 0, GRID_ROWS - 1)), t[2], Math.floor(num(t[3], 1, 9)), Math.floor(num(t[4], 0, 9))]);
  }
  const enemies: FieldView['enemies'] = [];
  for (const e of o.enemies.slice(0, MAX_ENEMIES)) {
    if (!Array.isArray(e)) continue;
    enemies.push([num(e[0], -2, GRID_COLS + 2), num(e[1], -2, GRID_ROWS + 2), Math.round(num(e[2], 0, 100)), Math.floor(num(e[3], 0, 2))]);
  }
  return { wave: Math.floor(num(o.wave, 0, 9999)), lives: Math.round(num(o.lives, 0, 9999)), towers, enemies, faction: Math.floor(num(o.faction, 1, CONFIG.palettes.length)) };
}

function towerImage(type: string, level: number) {
  const def = CONFIG.towers[type as TowerType];
  const lv = Math.min(3, level);
  if (sprites.get(`tower_${type}_${lv}`)) return sprites.get(`tower_${type}_${lv}`);
  if (def?.sprite) {
    const own = sprites.get(def.sprite);
    if (own) return own;
  }
  return sprites.get(`tower_${type}_1`);
}

/**
 * Рисует схему на холсте w×h: местность и дорога карты, артефакт, башни (спрайтами), враги точками.
 * Поле условно квадратное (14×8): гексы у хозяина здесь не нужны, важно, где что стоит.
 */
export function drawFieldView(ctx: CanvasRenderingContext2D, w: number, h: number, view: FieldView | null, map: MapDef, level: number) {
  const pal = CONFIG.palettes[Math.min(CONFIG.palettes.length, Math.max(1, level)) - 1];
  const cs = Math.min(w / GRID_COLS, h / GRID_ROWS);
  const ox = (w - cs * GRID_COLS) / 2;
  const oy = (h - cs * GRID_ROWS) / 2;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = pal.ground;
  ctx.fillRect(ox, oy, cs * GRID_COLS, cs * GRID_ROWS);
  ctx.fillStyle = pal.road;
  for (const path of map.paths) for (const c of path) ctx.fillRect(ox + c.x * cs, oy + c.y * cs, cs + 0.5, cs + 0.5);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= GRID_COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(ox + x * cs, oy);
    ctx.lineTo(ox + x * cs, oy + GRID_ROWS * cs);
    ctx.stroke();
  }
  for (let y = 0; y <= GRID_ROWS; y++) {
    ctx.beginPath();
    ctx.moveTo(ox, oy + y * cs);
    ctx.lineTo(ox + GRID_COLS * cs, oy + y * cs);
    ctx.stroke();
  }
  // Артефакт
  const cx = ox + (CASTLE.x + 0.5) * cs;
  const cy = oy + (CASTLE.y + 0.5) * cs;
  ctx.fillStyle = pal.light;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.arc(cx, cy, cs * 0.34, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  if (!view) return;
  // Башни (по строкам, чтобы нижние закрывали верхние)
  const towers = [...view.towers].sort((a, b) => a[1] - b[1]);
  for (const [tx, ty, type, lv, lv2] of towers) {
    const px = ox + (tx + 0.5) * cs;
    const py = oy + (ty + 0.5) * cs;
    const spr = towerImage(type, lv);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(px, py + cs * 0.3, cs * 0.34, cs * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    if (spr) {
      const k = (cs * 1.1) / spr.meta.drawH;
      const sw = (spr.canvas.width / spr.scale) * k;
      const sh = (spr.canvas.height / spr.scale) * k;
      ctx.drawImage(spr.canvas, px - sw * spr.meta.anchorX, py + cs * 0.32 - sh * spr.meta.anchorY, sw, sh);
    } else {
      ctx.fillStyle = pal.light;
      ctx.beginPath();
      ctx.arc(px, py, cs * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.max(8, cs * 0.24)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = 2.5;
    const label = lv2 ? `${lv}+${lv2}` : `${lv}`;
    ctx.strokeText(label, px, py + cs * 0.4);
    ctx.fillText(label, px, py + cs * 0.4);
  }
  // Враги
  const color = CONFIG.palettes[view.faction - 1]?.enemies ?? '#c33';
  for (const [ex, ey, hp, kind] of view.enemies) {
    const px = ox + (ex + 0.5) * cs;
    const py = oy + (ey + 0.5) * cs;
    const r = cs * (kind === 1 ? 0.3 : 0.15);
    ctx.fillStyle = color;
    ctx.strokeStyle = kind === 2 ? '#fff' : 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(px - r, py - r - 4, r * 2, 3);
    ctx.fillStyle = hp > 50 ? '#6fdc7a' : hp > 25 ? '#e8b84a' : '#e0452f';
    ctx.fillRect(px - r, py - r - 4, (r * 2 * hp) / 100, 3);
  }
}

// -------------------------------------------------------------
// Поле бота (просьба Артура 2026-11-08): настоящего поля у бота нет, его защита — число. Поэтому поле
// собирается из его данных: расы, силы, формы, волны и времени раунда. Башни растут с волной и стоят
// у дороги (одно и то же место каждый раз: расстановка зависит только от id), враги идут по дороге
// своей волны. Это картинка, а не игра: башни не стреляют, а бот на самом деле не выбирает клетки.
// -------------------------------------------------------------

export interface BotWatchInfo {
  id: string;
  race: import('./game/config').RaceId;
  difficulty: 'easy' | 'normal' | 'hard';
  form: number; // 0,8–1,2: форма бота
  lives: number;
  wave: number; // волн вышло
  roundT: number; // секунд от начала текущего раунда
  roundLength: number;
  faction: number; // чьи враги идут к нему
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIFF_MULT = { easy: 0.75, normal: 1, hard: 1.3 };
const ENEMY_CELLS_PER_S = 1;

export function botFieldView(info: BotWatchInfo, map: MapDef): FieldView {
  const rand = rng(hashSeed(info.id));
  const race = CONFIG.races[info.race];
  const maxLevel = race.maxLevel ?? 3;
  // Свободные клетки у дороги в постоянном для бота порядке
  const road = new Set(map.paths.flat().map((c) => c.y * GRID_COLS + c.x));
  const blocked = new Set((map.blocked ?? []).map((c) => c.y * GRID_COLS + c.x));
  const near = (x: number, y: number) => {
    let d = 9;
    for (const k of road) d = Math.min(d, Math.abs((k % GRID_COLS) - x) + Math.abs(Math.floor(k / GRID_COLS) - y));
    return d;
  };
  const cells: { x: number; y: number; score: number }[] = [];
  for (let y = 1; y < GRID_ROWS; y++) {
    for (let x = 0; x < GRID_COLS; x++) {
      if ((x === CASTLE.x && y === CASTLE.y) || road.has(y * GRID_COLS + x) || blocked.has(y * GRID_COLS + x)) continue;
      const d = near(x, y);
      if (d > 3) continue;
      cells.push({ x, y, score: d + rand() * 2.2 });
    }
  }
  cells.sort((a, b) => a.score - b.score);
  const strong = DIFF_MULT[info.difficulty] * info.form;
  const count = Math.min(cells.length, 34, Math.round(2 + info.wave * 0.9 * strong));
  const towers: FieldView['towers'] = [];
  for (let i = 0; i < count; i++) {
    const type = race.towers[Math.floor(rand() * race.towers.length)];
    const level = Math.min(maxLevel, 1 + (info.wave >= 4 + i * 0.6 ? 1 : 0) + (info.wave >= 10 + i * 1.2 ? 1 : 0));
    towers.push([cells[i].x, cells[i].y, type, level, 0]);
  }
  // Враги идут по дорогам своей волны, пока не дойдут (волна — первые две трети раунда)
  const w = Math.max(1, info.wave);
  const n = Math.min(40, Math.round(3 + w * 1.2));
  const enemies: FieldView['enemies'] = [];
  for (let i = 0; i < n; i++) {
    const path = map.paths[i % map.paths.length];
    const start = (i / n) * 0.5 * info.roundLength;
    const pos = (info.roundT - start) * ENEMY_CELLS_PER_S;
    const jitter = rand();
    if (pos < 0 || pos >= path.length - 1) continue;
    const k = Math.floor(pos);
    const f = pos - k;
    const a = path[k];
    const b = path[k + 1];
    const hp = Math.max(8, Math.round(100 - (pos / path.length) * 85 * Math.min(1, 0.4 + strong * 0.4) - jitter * 12));
    enemies.push([a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, hp, w % 12 === 0 && i === 0 ? 1 : i % 7 === 6 ? 2 : 0]);
  }
  return { wave: info.wave, lives: Math.round(info.lives), towers, enemies, faction: info.faction };
}
