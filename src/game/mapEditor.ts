/**
 * Редактор карты свободного режима (просьба Артура 2026-11-05): дорогу, выходы и клетки без башен рисует игрок.
 * Черновик — набор клеток; пути от каждого выхода до артефакта считаются здесь поиском в ширину по клеткам дороги
 * (кратчайший путь). Строгие правила готовых карт (длина пути, число входов, касания участков) здесь не действуют:
 * поле для проверок. Требуется только, чтобы каждый выход вёл к клетке у артефакта и на дороге не было лишних клеток.
 */

import { CASTLE, GRID_COLS, GRID_ROWS, MapDef, Point } from './maps';

export type MapEditTool = 'road' | 'exit' | 'block' | 'erase';

export interface MapDraft {
  level: number; // местность: палитра, тайлы и числа уровня
  name: string;
  road: Point[];
  exits: Point[]; // по порядку: босс выходит из первого
  blocked: Point[];
}

export const MAX_EXITS = 8;

const key = (p: Point) => `${p.x},${p.y}`;
export const inField = (p: Point) => p.x >= 0 && p.y >= 0 && p.x < GRID_COLS && p.y < GRID_ROWS;
export const isCastle = (p: Point) => p.x === CASTLE.x && p.y === CASTLE.y;
const nextToCastle = (p: Point) => Math.abs(p.x - CASTLE.x) + Math.abs(p.y - CASTLE.y) === 1;
const STEPS: Point[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/** Кратчайший путь по клеткам дороги от выхода до клетки у артефакта; null — не доходит */
export function findPath(road: Set<string>, from: Point): Point[] | null {
  if (!road.has(key(from))) return null;
  const prev = new Map<string, string | null>([[key(from), null]]);
  const queue: Point[] = [from];
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i];
    if (nextToCastle(c)) {
      const path: Point[] = [];
      for (let k: string | null = key(c); k; k = prev.get(k) ?? null) {
        const [x, y] = k.split(',').map(Number);
        path.push({ x, y });
      }
      return path.reverse();
    }
    for (const d of STEPS) {
      const n = { x: c.x + d.x, y: c.y + d.y };
      const nk = key(n);
      if (!road.has(nk) || prev.has(nk)) continue;
      prev.set(nk, key(c));
      queue.push(n);
    }
  }
  return null;
}

export interface DraftCheck {
  map: MapDef | null; // готовая карта, если ошибок нет
  errors: string[];
  unused: Point[]; // клетки дороги, по которым никто не пойдёт
  broken: Point[]; // выходы без пути к артефакту
}

/** Черновик → карта для движка, с ошибками по-русски */
export function draftToMap(d: MapDraft): DraftCheck {
  const errors: string[] = [];
  const road = new Set(d.road.filter((p) => inField(p) && !isCastle(p)).map(key));
  const exits = d.exits.filter((p) => road.has(key(p)));
  const paths: Point[][] = [];
  const broken: Point[] = [];
  for (const e of exits) {
    const path = findPath(road, e);
    if (path) paths.push(path);
    else broken.push(e);
  }
  const used = new Set(paths.flat().map(key));
  const unused = [...road].filter((k) => !used.has(k)).map((k) => {
    const [x, y] = k.split(',').map(Number);
    return { x, y };
  });
  if (exits.length === 0) errors.push('Поставьте хотя бы один выход на дороге');
  if (broken.length) errors.push(`Выходов без дороги к артефакту: ${broken.length} (отмечены красным)`);
  if (exits.length > 0 && unused.length) errors.push(`Лишних клеток дороги: ${unused.length} — по ним никто не пойдёт (отмечены красным)`);
  const blocked = d.blocked.filter((p) => inField(p) && !isCastle(p) && !road.has(key(p)));
  const map: MapDef | null = errors.length
    ? null
    : { level: d.level, name: d.name || 'Своя карта', entrances: paths.map((p) => p[0]), paths, blocked };
  return { map, errors, unused, broken };
}

/** Готовая карта → черновик (дорога — все клетки путей) */
export function mapToDraft(m: MapDef): MapDraft {
  const seen = new Set<string>();
  const road: Point[] = [];
  for (const p of m.paths) {
    for (const c of p) {
      if (seen.has(key(c))) continue;
      seen.add(key(c));
      road.push({ x: c.x, y: c.y });
    }
  }
  return { level: m.level, name: m.name, road, exits: m.entrances.map((e) => ({ x: e.x, y: e.y })), blocked: (m.blocked ?? []).map((c) => ({ x: c.x, y: c.y })) };
}
