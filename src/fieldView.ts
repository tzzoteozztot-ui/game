/**
 * Чужое поле в «Потасовке» (просьба Артура 2026-11-08): схема поля другого игрока, только чтение.
 * Каждое поле считает его хозяин, поэтому по сети идёт снимок: башни и враги в клетках. Снимок уходит
 * только тем, кто смотрит (`watch`), раз в 0,5 с. У ботов поля нет — оно собирается из их чисел (`botFieldView`).
 */

import { CONFIG } from './game/config';
import { GRID_COLS, GRID_ROWS, CASTLE, MapDef } from './game/maps';
import { SEND_TYPES, waveDefinition, type SendType } from './game/rules';
import { centerX, centerY, groundToCellF } from './game/grid';

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
  pending?: Partial<Record<SendType, number>>; // присланные ему враги с началом текущей волны: идут по полю
  joined?: Partial<Record<SendType, number>>; // присланные с прошлой волной: доходят
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
  // Враги идут по дорогам своей волны со своей скоростью и гибнут по пути (у сильного бота раньше); недобитые
  // прошлой волны идут дальше, а не пропадают с началом раунда. Точки считаются на земле (между центрами гексов),
  // иначе на гексах врага дёргает вбок при переходе из ряда в ряд.
  const enemies: FieldView['enemies'] = [];
  const ground = (c: { x: number; y: number }) => ({ x: centerX(c), y: centerY(c) });
  const cell = (gx: number, gy: number): [number, number] => {
    const c = groundToCellF(gx, gy);
    return [c.x, c.y];
  };
  const walk = (id: string, type: string, path: MapDef['paths'][number], t: number, sent: boolean) => {
    if (t < 0) return;
    const speed = CONFIG.enemies[type as keyof typeof CONFIG.enemies]?.speed ?? 1;
    const pos = t * speed;
    const luck = rng(hashSeed(info.id + id))();
    const len = path.length - 1;
    // где враг падёт: присланные и босс идут дальше обычных
    const dieAt = len * Math.min(1, (sent || type === 'boss' ? 0.6 : 0.3) + luck * 0.6) / Math.min(1.3, Math.max(0.8, strong));
    if (pos >= Math.min(len, dieAt)) return;
    const hp = Math.max(6, Math.round(100 * (1 - pos / dieAt)));
    if (type === 'flyer') {
      const a = ground(path[0]);
      const b = ground(CASTLE);
      const f = pos / len;
      enemies.push([id, ...cell(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f), hp, type]);
      return;
    }
    const k = Math.floor(pos);
    const f = pos - k;
    const a = ground(path[k]);
    const b = ground(path[k + 1]);
    enemies.push([id, ...cell(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f), hp, type]);
  };
  for (let back = 0; back < 2; back++) {
    const w = info.wave - back;
    if (w < 1) break;
    const t0 = info.roundT + back * info.roundLength;
    const def = waveDefinition(w);
    const kinds: string[] = [];
    for (const [type, count] of Object.entries(def)) {
      if (type === 'boss') continue;
      for (let i = 0; i < Math.max(1, Math.round(Number(count) / 3)); i++) kinds.push(type);
    }
    if (!kinds.length) kinds.push('infantry');
    const n = Math.min(40, Math.round(3 + w * 1.2));
    for (let i = 0; i < n; i++) {
      const boss = w % 12 === 0 && i === 0 && 'boss' in def;
      walk(`w${w}-${i}`, boss ? 'boss' : kinds[i % kinds.length], map.paths[i % map.paths.length], t0 - (i / n) * 0.5 * info.roundLength, false);
    }
    // Присланные соперниками выходят с началом волны, как у игрока (`pending` — пришли с этой волной, `joined` — с прошлой)
    const sends = back === 0 ? info.pending : info.joined;
    let j = 0;
    for (const type of SEND_TYPES) {
      for (let i = 0; i < Math.min(30, sends?.[type] ?? 0); i++, j++) {
        walk(`s${w}-${j}`, type, map.paths[j % map.paths.length], t0 - 1 - j * 0.7, true);
      }
    }
  }
  return { wave: info.wave, lives: Math.round(info.lives), towers, enemies, faction: info.faction };
}
