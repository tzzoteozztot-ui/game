/**
 * 5 Fixed Maps for «Тёмный рубеж»
 * Field: 14x8 (x 0..13, y 0..7), castle is a single cell next to the centre (7,4)
 * Rules:
 * - Entrances on the field edge, every path ends next to the castle
 * - Every path >= 26 cells
 * - Total road cells <= 56
 * - Free cells >= 55
 * - Turns only 90 deg
 * - Road cells touch by a side only where a path steps between them
 *   (separate stretches never run side by side; branches only meet at merges)
 */

export interface Point {
  x: number;
  y: number;
}

export const GRID_COLS = 14;
export const GRID_ROWS = 8;
export const CASTLE: Point = { x: 7, y: 4 };
export const MIN_PATH_LENGTH = 26;
export const MAX_ROAD_CELLS = 56;
export const MIN_FREE_CELLS = GRID_COLS * GRID_ROWS - 1 - MAX_ROAD_CELLS;
// Top-row corners hold the buttons drawn over the field (wave on the left, speed / sound /
// full screen / pause on the right): no road and no towers there
export const HUD_LEFT_COLS = 4;
export const HUD_RIGHT_COLS = 4;
export function isHudCell(x: number, y: number): boolean {
  return y === 0 && (x < HUD_LEFT_COLS || x >= GRID_COLS - HUD_RIGHT_COLS);
}

export interface MapDef {
  level: number;
  name: string;
  entrances: Point[];
  paths: Point[][];
}

export function makePath(points: Point[]): Point[] {
  const result: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const cur = points[i];
    if (i === 0) {
      result.push({ x: cur.x, y: cur.y });
    } else {
      const prev = points[i - 1];
      const dx = Math.sign(cur.x - prev.x);
      const dy = Math.sign(cur.y - prev.y);
      if (dx !== 0 && dy !== 0) {
        throw new Error(`Diagonal move between (${prev.x},${prev.y}) and (${cur.x},${cur.y})`);
      }
      let cx = prev.x + dx;
      let cy = prev.y + dy;
      while (true) {
        result.push({ x: cx, y: cy });
        if (cx === cur.x && cy === cur.y) break;
        cx += dx;
        cy += dy;
      }
    }
  }
  return result;
}

// -------------------------------------------------------------
// Maps 1–5 for the 14×8 field (Артур chose it 2026-10-30): long snaking roads that obey
// every rule above; each path runs from its entrance to a cell next to the castle.
// -------------------------------------------------------------
// MAP 1 (Level 1: 2 entrances)
const map1Paths: Point[][] = [
  makePath([{ x: 13, y: 4 }, { x: 13, y: 7 }, { x: 0, y: 7 }, { x: 0, y: 4 }, { x: 6, y: 4 }]),
  makePath([{ x: 0, y: 2 }, { x: 13, y: 2 }, { x: 13, y: 7 }, { x: 0, y: 7 }, { x: 0, y: 4 }, { x: 6, y: 4 }]),
];

// MAP 2 (Level 2: 3 entrances)
const map2Paths: Point[][] = [
  makePath([{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 7 }, { x: 12, y: 7 }, { x: 12, y: 5 }, { x: 7, y: 5 }]),
  makePath([{ x: 13, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 7 }, { x: 12, y: 7 }, { x: 12, y: 5 }, { x: 7, y: 5 }]),
  makePath([{ x: 4, y: 0 }, { x: 4, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 7 }, { x: 12, y: 7 }, { x: 12, y: 5 }, { x: 7, y: 5 }]),
];

// MAP 3 (Level 3: 4 entrances)
const map3Paths: Point[][] = [
  makePath([{ x: 0, y: 7 }, { x: 1, y: 7 }, { x: 1, y: 1 }, { x: 12, y: 1 }, { x: 12, y: 6 }, { x: 9, y: 6 }, { x: 9, y: 4 }, { x: 8, y: 4 }]),
  makePath([{ x: 0, y: 3 }, { x: 1, y: 3 }, { x: 1, y: 1 }, { x: 12, y: 1 }, { x: 12, y: 6 }, { x: 9, y: 6 }, { x: 9, y: 4 }, { x: 8, y: 4 }]),
  makePath([{ x: 6, y: 7 }, { x: 1, y: 7 }, { x: 1, y: 1 }, { x: 12, y: 1 }, { x: 12, y: 6 }, { x: 9, y: 6 }, { x: 9, y: 4 }, { x: 8, y: 4 }]),
  makePath([{ x: 8, y: 7 }, { x: 1, y: 7 }, { x: 1, y: 1 }, { x: 12, y: 1 }, { x: 12, y: 6 }, { x: 9, y: 6 }, { x: 9, y: 4 }, { x: 8, y: 4 }]),
];

// MAP 4 (Level 4: 5 entrances)
const map4Paths: Point[][] = [
  makePath([{ x: 1, y: 7 }, { x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 7 }, { x: 13, y: 7 }, { x: 13, y: 5 }, { x: 8, y: 5 }, { x: 8, y: 4 }]),
  makePath([{ x: 0, y: 2 }, { x: 1, y: 2 }, { x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 7 }, { x: 13, y: 7 }, { x: 13, y: 5 }, { x: 8, y: 5 }, { x: 8, y: 4 }]),
  makePath([{ x: 13, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 7 }, { x: 13, y: 7 }, { x: 13, y: 5 }, { x: 8, y: 5 }, { x: 8, y: 4 }]),
  makePath([{ x: 6, y: 0 }, { x: 6, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 7 }, { x: 13, y: 7 }, { x: 13, y: 5 }, { x: 8, y: 5 }, { x: 8, y: 4 }]),
  makePath([{ x: 8, y: 0 }, { x: 8, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 7 }, { x: 13, y: 7 }, { x: 13, y: 5 }, { x: 8, y: 5 }, { x: 8, y: 4 }]),
];

// MAP 5 (Level 5: 6 entrances)
const map5Paths: Point[][] = [
  makePath([{ x: 0, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 4 }, { x: 5, y: 4 }, { x: 5, y: 7 }, { x: 13, y: 7 }, { x: 13, y: 3 }, { x: 7, y: 3 }]),
  makePath([{ x: 0, y: 4 }, { x: 5, y: 4 }, { x: 5, y: 7 }, { x: 13, y: 7 }, { x: 13, y: 3 }, { x: 7, y: 3 }]),
  makePath([{ x: 2, y: 7 }, { x: 2, y: 4 }, { x: 5, y: 4 }, { x: 5, y: 7 }, { x: 13, y: 7 }, { x: 13, y: 3 }, { x: 7, y: 3 }]),
  makePath([{ x: 5, y: 0 }, { x: 5, y: 7 }, { x: 13, y: 7 }, { x: 13, y: 3 }, { x: 7, y: 3 }]),
  makePath([{ x: 7, y: 0 }, { x: 7, y: 1 }, { x: 5, y: 1 }, { x: 5, y: 7 }, { x: 13, y: 7 }, { x: 13, y: 3 }, { x: 7, y: 3 }]),
  makePath([{ x: 13, y: 1 }, { x: 5, y: 1 }, { x: 5, y: 7 }, { x: 13, y: 7 }, { x: 13, y: 3 }, { x: 7, y: 3 }]),
];

export const MAPS: MapDef[] = [
  {
    level: 1,
    name: 'Пограничье',
    entrances: map1Paths.map((p) => p[0]),
    paths: map1Paths,
  },
  {
    level: 2,
    name: 'Болотный склеп',
    entrances: map2Paths.map((p) => p[0]),
    paths: map2Paths,
  },
  {
    level: 3,
    name: 'Ледяные пустоши',
    entrances: map3Paths.map((p) => p[0]),
    paths: map3Paths,
  },
  {
    level: 4,
    name: 'Выжженные земли',
    entrances: map4Paths.map((p) => p[0]),
    paths: map4Paths,
  },
  {
    level: 5,
    name: 'Цитадель сумерек',
    entrances: map5Paths.map((p) => p[0]),
    paths: map5Paths,
  },
];

export interface MapValidationResult {
  valid: boolean;
  errors: string[];
  stats: {
    level: number;
    entrancesCount: number;
    roadCellsCount: number;
    freeCellsCount: number;
    roadsBeforeCastleCount: number;
    pathLengths: number[];
  };
}

function edgeKey(a: Point, b: Point): string {
  const [p, q] = a.x < b.x || (a.x === b.x && a.y < b.y) ? [a, b] : [b, a];
  return `${p.x},${p.y}-${q.x},${q.y}`;
}

export function validateMap(mapDef: MapDef): MapValidationResult {
  const errors: string[] = [];
  const expectedEntrances = mapDef.level + 1; // 1->2, 2->3, 3->4, 4->5, 5->6

  if (mapDef.entrances.length !== expectedEntrances) {
    errors.push(
      `Уровень ${mapDef.level}: ожидалось ${expectedEntrances} входов, получено ${mapDef.entrances.length}`
    );
  }

  const allRoadCells = new Set<string>();
  const roadSteps = new Set<string>();
  const roadsBeforeCastle = new Set<string>();
  const pathLengths: number[] = [];

  for (let i = 0; i < mapDef.paths.length; i++) {
    const path = mapDef.paths[i];
    pathLengths.push(path.length);

    // Rule 1: path length
    if (path.length < MIN_PATH_LENGTH) {
      errors.push(
        `Уровень ${mapDef.level}, путь ${i + 1}: длина ${path.length} < ${MIN_PATH_LENGTH} клеток (вход [${path[0].x}, ${path[0].y}])`
      );
    }

    // Check entrance is on border
    const entrance = path[0];
    const isBorder =
      entrance.x === 0 || entrance.y === 0 || entrance.x === GRID_COLS - 1 || entrance.y === GRID_ROWS - 1;
    if (!isBorder) {
      errors.push(`Уровень ${mapDef.level}, вход ${i + 1} (${entrance.x}, ${entrance.y}) не на границе`);
    }

    // Check path ends next to the castle
    const end = path[path.length - 1];
    if (Math.abs(end.x - CASTLE.x) + Math.abs(end.y - CASTLE.y) !== 1) {
      errors.push(
        `Уровень ${mapDef.level}, путь ${i + 1} заканчивается в (${end.x}, ${end.y}), а должен у замка (${CASTLE.x}, ${CASTLE.y})`
      );
    } else {
      roadsBeforeCastle.add(`${end.x},${end.y}`);
    }

    // Check step by step adjacency (only 90 deg turns, step 1)
    for (let j = 1; j < path.length; j++) {
      const p1 = path[j - 1];
      const p2 = path[j];
      const dist = Math.abs(p2.x - p1.x) + Math.abs(p2.y - p1.y);
      if (dist !== 1) {
        errors.push(
          `Уровень ${mapDef.level}, путь ${i + 1}, шаг ${j}: не ортогональный переход между (${p1.x},${p1.y}) и (${p2.x},${p2.y})`
        );
      }
    }

    // A path never visits the same cell twice
    const visited = new Set<string>();
    for (const cell of path) {
      const key = `${cell.x},${cell.y}`;
      if (visited.has(key)) {
        errors.push(`Уровень ${mapDef.level}, путь ${i + 1} дважды проходит клетку (${cell.x}, ${cell.y})`);
      }
      visited.add(key);
    }

    if (path.some((c) => c.x === CASTLE.x && c.y === CASTLE.y)) {
      errors.push(`Уровень ${mapDef.level}, путь ${i + 1} проходит через замок`);
    }
    if (path.some((c) => c.x < 0 || c.y < 0 || c.x >= GRID_COLS || c.y >= GRID_ROWS)) {
      errors.push(`Уровень ${mapDef.level}, путь ${i + 1} выходит за поле`);
    }

    // Add to allRoadCells and remember every step as an allowed contact
    for (let j = 0; j < path.length; j++) {
      const cell = path[j];
      allRoadCells.add(`${cell.x},${cell.y}`);
      if (j > 0) roadSteps.add(edgeKey(path[j - 1], cell));
    }
  }

  // Rule 5: road stretches don't touch by a side except where a path steps between them
  for (const key of allRoadCells) {
    const [x, y] = key.split(',').map(Number);
    for (const n of [{ x: x + 1, y }, { x, y: y + 1 }]) {
      if (allRoadCells.has(`${n.x},${n.y}`) && !roadSteps.has(edgeKey({ x, y }, n))) {
        errors.push(
          `Уровень ${mapDef.level}: участки дороги соприкасаются в (${x}, ${y}) и (${n.x}, ${n.y})`
        );
      }
    }
  }

  // Rule 2: total road cells
  const roadCellsCount = allRoadCells.size;
  if (roadCellsCount > MAX_ROAD_CELLS) {
    errors.push(`Уровень ${mapDef.level}: клеток дороги ${roadCellsCount} > ${MAX_ROAD_CELLS}`);
  }

  // Rule 3: free cells (the castle takes one cell)
  const freeCellsCount = GRID_COLS * GRID_ROWS - 1 - roadCellsCount;
  if (freeCellsCount < MIN_FREE_CELLS) {
    errors.push(`Уровень ${mapDef.level}: свободных клеток ${freeCellsCount} < ${MIN_FREE_CELLS}`);
  }

  for (const key of allRoadCells) {
    const [x, y] = key.split(',').map(Number);
    if (isHudCell(x, y)) errors.push(`Уровень ${mapDef.level}: дорога под кнопками поля в (${x}, ${y})`);
  }

  // A cell next to the castle is road only where a path ends
  for (const d of [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]) {
    const key = `${CASTLE.x + d.x},${CASTLE.y + d.y}`;
    if (allRoadCells.has(key) && !roadsBeforeCastle.has(key)) {
      errors.push(`Уровень ${mapDef.level}: дорога касается замка в (${key}), но не входит в него`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    stats: {
      level: mapDef.level,
      entrancesCount: mapDef.entrances.length,
      roadCellsCount,
      freeCellsCount,
      roadsBeforeCastleCount: roadsBeforeCastle.size,
      pathLengths,
    },
  };
}

export function validateAllMaps(): boolean {
  let allValid = true;
  for (const m of MAPS) {
    const res = validateMap(m);
    if (!res.valid) {
      allValid = false;
      console.error(`[MAP VALIDATION ERROR] Уровень ${m.level}:`, res.errors);
    } else {
      console.log(
        `[MAP VALIDATION OK] Уровень ${m.level}: входов ${res.stats.entrancesCount}, дорога ${res.stats.roadCellsCount} кл., свободно ${res.stats.freeCellsCount} кл., длины путей: [${res.stats.pathLengths.join(', ')}]`
      );
    }
  }
  return allValid;
}
