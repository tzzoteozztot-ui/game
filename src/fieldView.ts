/**
 * Чужое поле в «Потасовке» (просьба Артура 2026-11-08): схема поля другого игрока, только чтение.
 * Каждое поле считает его хозяин, поэтому по сети идёт снимок: башни и враги в клетках. Снимок уходит
 * только тем, кто смотрит (`watch`), раз в 0,5 с. У ботов поля нет — смотреть можно только игроков.
 */

import { CONFIG, TowerType } from './game/config';
import { GRID_COLS, GRID_ROWS, CASTLE, MapDef } from './game/maps';
import { SEND_TYPES, waveDefinition, type SendType } from './game/rules';

export interface FieldView {
  wave: number; // волн запущено
  lives: number; // прочность артефакта
  towers: [number, number, string, number, number][]; // клетка x, y, вид, уровень, уровень второй башни связки (0 — нет)
  enemies: [string, number, number, number, string][]; // id, x, y (дробные клетки), HP в процентах, вид (EnemyType)
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
    if (!Array.isArray(e) || typeof e[0] !== 'string' || typeof e[4] !== 'string' || !(e[4] in CONFIG.enemies)) continue;
    enemies.push([e[0].slice(0, 12), num(e[1], -2, GRID_COLS + 2), num(e[2], -2, GRID_ROWS + 2), Math.round(num(e[3], 0, 100)), e[4]]);
  }
  return { wave: Math.floor(num(o.wave, 0, 9999)), lives: Math.round(num(o.lives, 0, 9999)), towers, enemies, faction: Math.floor(num(o.faction, 1, CONFIG.palettes.length)) };
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
  pending?: Partial<Record<SendType, number>>; // присланные ему враги: ждут у входа до его следующей волны
  joined?: Partial<Record<SendType, number>>; // присланные, что вошли в его последнюю волну
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
  // Враги идут по дорогам своей волны, пока не дойдут (волна — первые две трети раунда); виды — по составу волны
  const w = Math.max(1, info.wave);
  const def = waveDefinition(w);
  const kinds: string[] = [];
  for (const [type, count] of Object.entries(def)) {
    if (type === 'boss') continue;
    for (let i = 0; i < Math.max(1, Math.round(Number(count) / 3)); i++) kinds.push(type);
  }
  if (!kinds.length) kinds.push('infantry');
  const n = Math.min(40, Math.round(3 + w * 1.2));
  const enemies: FieldView['enemies'] = [];
  const at = (path: MapDef['paths'][number], pos: number): [number, number] => {
    const k = Math.floor(pos);
    const f = pos - k;
    return [path[k].x + (path[k + 1].x - path[k].x) * f, path[k].y + (path[k + 1].y - path[k].y) * f];
  };
  for (let i = 0; i < n; i++) {
    const path = map.paths[i % map.paths.length];
    const start = (i / n) * 0.5 * info.roundLength;
    const pos = (info.roundT - start) * ENEMY_CELLS_PER_S;
    const jitter = rand();
    const boss = w % 12 === 0 && i === 0 && 'boss' in def;
    const type = boss ? 'boss' : kinds[i % kinds.length];
    const hp = Math.max(8, Math.round(100 - (pos / path.length) * 85 * Math.min(1, 0.4 + strong * 0.4) - jitter * 12));
    if (pos < 0) continue;
    if (type === 'flyer') {
      const f = pos / path.length;
      if (f >= 1) continue;
      enemies.push([`w${w}-${i}`, path[0].x + (CASTLE.x - path[0].x) * f, path[0].y + (CASTLE.y - path[0].y) * f, hp, type]);
    } else if (pos < path.length - 1) {
      const [x, y] = at(path, pos);
      enemies.push([`w${w}-${i}`, x, y, hp, type]);
    }
  }
  // Присланные соперниками: вошедшие в волну идут вместе с ней (летуны напрямую к артефакту), ждущие стоят у входа
  let j = 0;
  for (const type of SEND_TYPES) {
    for (let i = 0; i < Math.min(30, info.joined?.[type] ?? 0); i++, j++) {
      const path = map.paths[j % map.paths.length];
      const pos = (info.roundT - (0.05 * info.roundLength + (j % 12) * 0.9)) * ENEMY_CELLS_PER_S;
      if (pos < 0) continue;
      if (type === 'flyer') {
        const f = pos / path.length;
        if (f >= 1) continue;
        enemies.push([`s${w}-${j}`, path[0].x + (CASTLE.x - path[0].x) * f, path[0].y + (CASTLE.y - path[0].y) * f, 100, type]);
      } else if (pos < path.length - 1) {
        const [x, y] = at(path, pos);
        enemies.push([`s${w}-${j}`, x, y, 100, type]);
      }
    }
  }
  let q = 0;
  for (const type of SEND_TYPES) {
    for (let i = 0; i < Math.min(30, info.pending?.[type] ?? 0); i++, q++) {
      const e = map.paths[q % map.paths.length][0];
      enemies.push([`p${q}`, e.x + ((q % 5) - 2) * 0.12, e.y + (Math.floor(q / map.paths.length) % 3) * 0.12, 100, type]);
    }
  }
  return { wave: info.wave, lives: Math.round(info.lives), towers, enemies, faction: info.faction };
}
