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
// -------------------------------------------------------------
const map1Paths: Point[][] = [
  // E1: (0,1) -> (4,1) -> (4,3) -> (2,3) -> (2,4) -> (7,4) -> (7,2) -> (10,2)
  makePath([
    { x: 0, y: 1 },
    { x: 4, y: 1 },
    { x: 4, y: 3 },
    { x: 2, y: 3 },
    { x: 2, y: 4 },
    { x: 7, y: 4 },
    { x: 7, y: 2 },
    { x: 10, y: 2 },
  ]),
  // E2: (0,6) -> (3,6) -> (3,5) -> (1,5) -> (1,4) -> (2,4) -> (7,4) -> (7,2) -> (10,2)
  makePath([
    { x: 0, y: 6 },
    { x: 3, y: 6 },
    { x: 3, y: 5 },
    { x: 1, y: 5 },
    { x: 1, y: 4 },
    { x: 2, y: 4 },
    { x: 7, y: 4 },
    { x: 7, y: 2 },
    { x: 10, y: 2 },
  ]),
];

// -------------------------------------------------------------
// MAP 2 (Level 2: 3 entrances)
// Common trunk from (3,3) to (10,3) is 20 cells.
// -------------------------------------------------------------
const map2CommonTrunk: Point[] = [
  { x: 3, y: 3 },
  { x: 5, y: 3 },
  { x: 5, y: 1 },
  { x: 8, y: 1 },
  { x: 8, y: 4 },
  { x: 6, y: 4 },
  { x: 6, y: 5 },
  { x: 9, y: 5 },
  { x: 9, y: 3 },
  { x: 10, y: 3 },
];

const map2Paths: Point[][] = [
  // E1: (0,0) -> (3,0) -> (3,3) -> trunk
  makePath([
    { x: 0, y: 0 },
    { x: 3, y: 0 },
    ...map2CommonTrunk,
  ]),
  // E2: (0,3) -> (0,2) -> (1,2) -> (1,3) -> (3,3) -> trunk
  makePath([
    { x: 0, y: 3 },
    { x: 0, y: 2 },
    { x: 1, y: 2 },
    { x: 1, y: 3 },
    ...map2CommonTrunk,
  ]),
  // E3: (0,7) -> (3,7) -> (3,3) -> trunk
  makePath([
    { x: 0, y: 7 },
    { x: 3, y: 7 },
    ...map2CommonTrunk,
  ]),
];

// -------------------------------------------------------------
// MAP 3 (Level 3: 4 entrances)
// Common trunk from (4,3) to (10,3)
// -------------------------------------------------------------
const map3CommonTrunk: Point[] = [
  { x: 4, y: 3 },
  { x: 4, y: 1 },
  { x: 7, y: 1 },
  { x: 7, y: 2 },
  { x: 5, y: 2 },
  { x: 5, y: 4 },
  { x: 8, y: 4 },
  { x: 8, y: 5 },
  { x: 6, y: 5 },
  { x: 6, y: 6 },
  { x: 9, y: 6 },
  { x: 9, y: 3 },
  { x: 10, y: 3 },
]; // trunk is 23 cells!

const map3Paths: Point[][] = [
  // E1: (0,0) -> (2,0) -> (2,3) -> (4,3) -> trunk
  makePath([
    { x: 0, y: 0 },
    { x: 2, y: 0 },
    { x: 2, y: 3 },
    ...map3CommonTrunk,
  ]),
  // E2: (0,2) -> (1,2) -> (1,3) -> (4,3) -> trunk
  makePath([
    { x: 0, y: 2 },
    { x: 1, y: 2 },
    { x: 1, y: 3 },
    ...map3CommonTrunk,
  ]),
  // E3: (0,5) -> (1,5) -> (1,4) -> (3,4) -> (3,3) -> (4,3) -> trunk
  makePath([
    { x: 0, y: 5 },
    { x: 1, y: 5 },
    { x: 1, y: 4 },
    { x: 3, y: 4 },
    { x: 3, y: 3 },
    ...map3CommonTrunk,
  ]),
  // E4: (0,7) -> (2,7) -> (2,4) -> (3,4) -> (3,3) -> (4,3) -> trunk
  makePath([
    { x: 0, y: 7 },
    { x: 2, y: 7 },
    { x: 2, y: 4 },
    { x: 3, y: 4 },
    { x: 3, y: 3 },
    ...map3CommonTrunk,
  ]),
];

// -------------------------------------------------------------
// MAP 4 (Level 4: 5 entrances)
// Entrances: E1 (0,0), E2 (0,2), E3 (0,4), E4 (0,6), E5 (0,7)
// -------------------------------------------------------------
const map4CommonTrunk: Point[] = [
  { x: 3, y: 3 },
  { x: 3, y: 1 },
  { x: 6, y: 1 },
  { x: 6, y: 2 },
  { x: 5, y: 2 },
  { x: 5, y: 4 },
  { x: 8, y: 4 },
  { x: 8, y: 2 },
  { x: 7, y: 2 },
  { x: 7, y: 5 },
  { x: 9, y: 5 },
  { x: 9, y: 3 },
  { x: 10, y: 3 },
]; // trunk is 23 cells!

const map4Paths: Point[][] = [
  // E1: (0,0) -> (1,0) -> (1,2) -> (2,2) -> (2,3) -> (3,3) -> trunk
  makePath([
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 2 },
    { x: 2, y: 2 },
    { x: 2, y: 3 },
    ...map4CommonTrunk,
  ]),
  // E2: (0,1) -> (0,2) -> (2,2) -> (2,3) -> (3,3) -> trunk
  makePath([
    { x: 0, y: 1 },
    { x: 0, y: 2 },
    { x: 2, y: 2 },
    { x: 2, y: 3 },
    ...map4CommonTrunk,
  ]),
  // E3: (0,4) -> (1,4) -> (1,3) -> (3,3) -> trunk
  makePath([
    { x: 0, y: 4 },
    { x: 1, y: 4 },
    { x: 1, y: 3 },
    ...map4CommonTrunk,
  ]),
  // E4: (0,6) -> (1,6) -> (1,5) -> (2,5) -> (2,4) -> (3,4) -> (3,3) -> trunk
  makePath([
    { x: 0, y: 6 },
    { x: 1, y: 6 },
    { x: 1, y: 5 },
    { x: 2, y: 5 },
    { x: 2, y: 4 },
    { x: 3, y: 4 },
    ...map4CommonTrunk,
  ]),
  // E5: (0,7) -> (2,7) -> (2,5) -> (2,4) -> (3,4) -> (3,3) -> trunk
  makePath([
    { x: 0, y: 7 },
    { x: 2, y: 7 },
    { x: 2, y: 5 },
    { x: 2, y: 4 },
    { x: 3, y: 4 },
    ...map4CommonTrunk,
  ]),
];

// -------------------------------------------------------------
// MAP 5 (Level 5: 6 entrances)
// Entrances on borders:
// E1 (0,0), E2 (0,1), E3 (0,4), E4 (0,6), E5 (0,7), E6 (2,0)
// -------------------------------------------------------------
const map5CommonTrunk: Point[] = [
  { x: 3, y: 3 },
  { x: 3, y: 1 },
  { x: 6, y: 1 },
  { x: 6, y: 2 },
  { x: 5, y: 2 },
  { x: 5, y: 5 },
  { x: 7, y: 5 },
  { x: 7, y: 4 },
  { x: 8, y: 4 },
  { x: 8, y: 2 },
  { x: 9, y: 2 },
  { x: 9, y: 4 },
  { x: 10, y: 4 },
]; // trunk is 23 cells!

const map5Paths: Point[][] = [
  // E1: (0,0) -> (1,0) -> (1,2) -> (2,2) -> (2,3) -> (3,3) -> trunk
  makePath([
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 2 },
    { x: 2, y: 2 },
    { x: 2, y: 3 },
    ...map5CommonTrunk,
  ]),
  // E2: (0,1) -> (0,2) -> (2,2) -> (2,3) -> (3,3) -> trunk
  makePath([
    { x: 0, y: 1 },
    { x: 0, y: 2 },
    { x: 2, y: 2 },
    { x: 2, y: 3 },
    ...map5CommonTrunk,
  ]),
  // E3: (0,4) -> (1,4) -> (1,3) -> (3,3) -> trunk
  makePath([
    { x: 0, y: 4 },
    { x: 1, y: 4 },
    { x: 1, y: 3 },
    ...map5CommonTrunk,
  ]),
  // E4: (0,6) -> (1,6) -> (1,5) -> (2,5) -> (2,4) -> (3,4) -> (3,3) -> trunk
  makePath([
    { x: 0, y: 6 },
    { x: 1, y: 6 },
    { x: 1, y: 5 },
    { x: 2, y: 5 },
    { x: 2, y: 4 },
    { x: 3, y: 4 },
    ...map5CommonTrunk,
  ]),
  // E5: (0,7) -> (2,7) -> (2,5) -> (2,4) -> (3,4) -> (3,3) -> trunk
  makePath([
    { x: 0, y: 7 },
    { x: 2, y: 7 },
    { x: 2, y: 5 },
    { x: 2, y: 4 },
    { x: 3, y: 4 },
    ...map5CommonTrunk,
  ]),
  // E6: (2,0) -> (2,2) -> (2,3) -> (3,3) -> trunk
  makePath([
    { x: 2, y: 0 },
    { x: 2, y: 2 },
    { x: 2, y: 3 },
    ...map5CommonTrunk,
  ]),
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

export function validateMap(mapDef: MapDef): MapValidationResult {
  const errors: string[] = [];
  const expectedEntrances = mapDef.level + 1; // 1->2, 2->3, 3->4, 4->5, 5->6

  if (mapDef.entrances.length !== expectedEntrances) {
    errors.push(
      `Уровень ${mapDef.level}: ожидалось ${expectedEntrances} входов, получено ${mapDef.entrances.length}`
    );
  }

  const allRoadCells = new Set<string>();
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

    // Add to allRoadCells
    for (const cell of path) {
      allRoadCells.add(`${cell.x},${cell.y}`);
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
