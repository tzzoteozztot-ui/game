/**
 * 5 Fixed Maps for «Тёмный рубеж»
 * Field: 12x8 (x 0..11, y 0..7)
 * Castle: x=11, y in 2..5
 * Road ends: x=10, y in 2..5
 * Rules:
 * - Every path >= 18 cells
 * - Total road cells <= 56
 * - Free cells >= 36
 * - Roads before castle <= 3
 * - Turns only 90 deg
 * - Road cells touch by a side only where a path steps between them
 *   (separate stretches never run side by side; branches only meet at merges)
 */

export interface Point {
  x: number;
  y: number;
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
// MAP 1 (Level 1: 2 entrances)
// Trunk snakes through columns x=3, 6, 9; E2 joins at (3,5).
// -------------------------------------------------------------
const map1Trunk: Point[] = [
  { x: 3, y: 5 },
  { x: 6, y: 5 },
  { x: 6, y: 2 },
  { x: 9, y: 2 },
  { x: 9, y: 4 },
  { x: 10, y: 4 },
];

const map1Paths: Point[][] = [
  // E1: (0,1) -> (3,1) -> (3,5) -> trunk
  makePath([
    { x: 0, y: 1 },
    { x: 3, y: 1 },
    ...map1Trunk,
  ]),
  // E2: (0,7) -> (3,7) -> (3,5) -> trunk
  makePath([
    { x: 0, y: 7 },
    { x: 3, y: 7 },
    ...map1Trunk,
  ]),
];

// -------------------------------------------------------------
// MAP 2 (Level 2: 3 entrances)
// Branches meet at (3,4); trunk snakes through columns x=5, 7, 9.
// -------------------------------------------------------------
const map2Trunk: Point[] = [
  { x: 3, y: 4 },
  { x: 5, y: 4 },
  { x: 5, y: 1 },
  { x: 7, y: 1 },
  { x: 7, y: 6 },
  { x: 9, y: 6 },
  { x: 9, y: 3 },
  { x: 10, y: 3 },
];

const map2Paths: Point[][] = [
  // E1: (0,0) -> (3,0) -> (3,4) -> trunk
  makePath([
    { x: 0, y: 0 },
    { x: 3, y: 0 },
    ...map2Trunk,
  ]),
  // E2: (0,2) -> (1,2) -> (1,4) -> (3,4) -> trunk
  makePath([
    { x: 0, y: 2 },
    { x: 1, y: 2 },
    { x: 1, y: 4 },
    ...map2Trunk,
  ]),
  // E3: (0,7) -> (3,7) -> (3,4) -> trunk
  makePath([
    { x: 0, y: 7 },
    { x: 3, y: 7 },
    ...map2Trunk,
  ]),
];

// -------------------------------------------------------------
// MAP 3 (Level 3: 4 entrances)
// Branches meet at (2,1); trunk snakes through rows y=1, 3, 5, 7.
// -------------------------------------------------------------
const map3Trunk: Point[] = [
  { x: 2, y: 1 },
  { x: 9, y: 1 },
  { x: 9, y: 3 },
  { x: 4, y: 3 },
  { x: 4, y: 5 },
  { x: 8, y: 5 },
  { x: 8, y: 7 },
  { x: 10, y: 7 },
  { x: 10, y: 5 },
];

const map3Paths: Point[][] = [
  // E1: (0,1) -> (2,1) -> trunk
  makePath([{ x: 0, y: 1 }, ...map3Trunk]),
  // E2: (2,0) -> (2,1) -> trunk
  makePath([{ x: 2, y: 0 }, ...map3Trunk]),
  // E3: (2,7) -> (2,1) -> trunk
  makePath([{ x: 2, y: 7 }, ...map3Trunk]),
  // E4: (0,4) -> (2,4) -> (2,1) -> trunk
  makePath([{ x: 0, y: 4 }, { x: 2, y: 4 }, ...map3Trunk]),
];

// -------------------------------------------------------------
// MAP 4 (Level 4: 5 entrances)
// Branches gather in column x=1 and meet at (3,6);
// trunk snakes through columns x=3, 5, 7, 9.
// -------------------------------------------------------------
const map4Trunk: Point[] = [
  { x: 3, y: 6 },
  { x: 3, y: 1 },
  { x: 5, y: 1 },
  { x: 5, y: 6 },
  { x: 7, y: 6 },
  { x: 7, y: 1 },
  { x: 9, y: 1 },
  { x: 9, y: 4 },
  { x: 10, y: 4 },
];

const map4Paths: Point[][] = [
  // E1: (0,1) -> (1,1) -> (1,6) -> (3,6) -> trunk
  makePath([{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 6 }, ...map4Trunk]),
  // E2: (0,3) -> (1,3) -> (1,6) -> (3,6) -> trunk
  makePath([{ x: 0, y: 3 }, { x: 1, y: 3 }, { x: 1, y: 6 }, ...map4Trunk]),
  // E3: (0,5) -> (1,5) -> (1,6) -> (3,6) -> trunk
  makePath([{ x: 0, y: 5 }, { x: 1, y: 5 }, { x: 1, y: 6 }, ...map4Trunk]),
  // E4: (1,7) -> (1,6) -> (3,6) -> trunk
  makePath([{ x: 1, y: 7 }, { x: 1, y: 6 }, ...map4Trunk]),
  // E5: (3,7) -> (3,6) -> trunk
  makePath([{ x: 3, y: 7 }, ...map4Trunk]),
];

// -------------------------------------------------------------
// MAP 5 (Level 5: 6 entrances)
// Northern branches come down column x=4, southern ones up column x=3;
// they meet at (4,3), trunk snakes through columns x=5, 7, 9.
// -------------------------------------------------------------
const map5Trunk: Point[] = [
  { x: 4, y: 3 },
  { x: 5, y: 3 },
  { x: 5, y: 7 },
  { x: 7, y: 7 },
  { x: 7, y: 0 },
  { x: 9, y: 0 },
  { x: 9, y: 4 },
  { x: 10, y: 4 },
];

const map5North: Point[] = [{ x: 4, y: 1 }, ...map5Trunk];
const map5South: Point[] = [{ x: 3, y: 3 }, ...map5Trunk];

const map5Paths: Point[][] = [
  // E1: (0,1) -> (4,1) -> (4,3) -> trunk
  makePath([{ x: 0, y: 1 }, ...map5North]),
  // E2: (4,0) -> (4,3) -> trunk
  makePath([{ x: 4, y: 0 }, ...map5North]),
  // E3: (2,0) -> (2,1) -> (4,1) -> (4,3) -> trunk
  makePath([{ x: 2, y: 0 }, { x: 2, y: 1 }, ...map5North]),
  // E4: (3,7) -> (3,3) -> (4,3) -> trunk
  makePath([{ x: 3, y: 7 }, ...map5South]),
  // E5: (0,5) -> (3,5) -> (3,3) -> (4,3) -> trunk
  makePath([{ x: 0, y: 5 }, { x: 3, y: 5 }, ...map5South]),
  // E6: (0,3) -> (3,3) -> (4,3) -> trunk
  makePath([{ x: 0, y: 3 }, ...map5South]),
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
  const roadsBeforeCastle = new Set<number>();
  const pathLengths: number[] = [];

  for (let i = 0; i < mapDef.paths.length; i++) {
    const path = mapDef.paths[i];
    pathLengths.push(path.length);

    // Rule 1: path length >= 18
    if (path.length < 18) {
      errors.push(
        `Уровень ${mapDef.level}, путь ${i + 1}: длина ${path.length} < 18 клеток (вход [${path[0].x}, ${path[0].y}])`
      );
    }

    // Check entrance is on border
    const entrance = path[0];
    const isBorder =
      entrance.x === 0 || entrance.y === 0 || entrance.y === 7 || entrance.x === 11;
    if (!isBorder) {
      errors.push(`Уровень ${mapDef.level}, вход ${i + 1} (${entrance.x}, ${entrance.y}) не на границе`);
    }

    // Check path ends at x=10, y in 2..5
    const end = path[path.length - 1];
    if (end.x !== 10 || end.y < 2 || end.y > 5) {
      errors.push(
        `Уровень ${mapDef.level}, путь ${i + 1} заканчивается в (${end.x}, ${end.y}), а должен в x=10, y in 2..5`
      );
    } else {
      roadsBeforeCastle.add(end.y);
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

  // Rule 2: total road cells <= 56
  const roadCellsCount = allRoadCells.size;
  if (roadCellsCount > 56) {
    errors.push(`Уровень ${mapDef.level}: клеток дороги ${roadCellsCount} > 56`);
  }

  // Rule 3: free cells >= 36
  // Total cells = 12 * 8 = 96. Castle cells = 4.
  const freeCellsCount = 96 - 4 - roadCellsCount;
  if (freeCellsCount < 36) {
    errors.push(`Уровень ${mapDef.level}: свободных клеток ${freeCellsCount} < 36`);
  }

  // Rule 4: roads before castle <= 3
  if (roadsBeforeCastle.size > 3) {
    errors.push(
      `Уровень ${mapDef.level}: дорог перед замком ${roadsBeforeCastle.size} > 3`
    );
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
