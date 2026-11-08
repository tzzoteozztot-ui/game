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
