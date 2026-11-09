// Геометрия клеток поля. Обычно — квадраты 64 px (как было всегда). В опытном гексовом виде
// (свободный режим, просьба Артура 2026-11-06: поле как в бою «Героев 3») клетка (x, y) — шестиугольник
// «остриём вверх», нечётные ряды сдвинуты на полклетки вправо; соседи — на расстоянии одной клетки (64 px).
// Логика игры (скорости, радиусы, попадания) считается на плоском поле в этих «наземных» px; наклон —
// только отрисовка: экран = (k·x, неба + k·s·y), см. `hexView`.
import { CONFIG } from './config';

type P = { x: number; y: number };

let hex = false;

export function isHex(): boolean {
  return hex;
}

export function setHex(on: boolean) {
  hex = on;
}

const CS = () => CONFIG.grid.cellSize;
/** Расстояние между рядами гексов и высота гекса (от острия до острия) */
const ROW = () => (CS() * Math.sqrt(3)) / 2;
const HEX_H = () => (CS() * 2) / Math.sqrt(3);

/** Центр клетки по x, наземные px */
export function centerX(p: P): number {
  return hex ? (p.x + 0.5 + 0.5 * (p.y & 1)) * CS() : (p.x + 0.5) * CS();
}

/** Центр клетки по y, наземные px */
export function centerY(p: P): number {
  return hex ? HEX_H() / 2 + p.y * ROW() : (p.y + 0.5) * CS();
}

/** Центр артефакта (точка, к которой идут враги и летят летуны) */
export function castleX(): number {
  return hex ? centerX(CONFIG.grid.castleCells[0]) : CONFIG.grid.castleTarget.x * CS();
}
export function castleY(): number {
  return hex ? centerY(CONFIG.grid.castleCells[0]) : CONFIG.grid.castleTarget.y * CS();
}

/** Клетка под наземной точкой */
export function cellAt(gx: number, gy: number): P {
  if (!hex) return { x: Math.floor(gx / CS()), y: Math.floor(gy / CS()) };
  // В осевые координаты гекса «остриём вверх» и округление по кубу
  const size = HEX_H() / 2;
  const px = gx - CS() / 2;
  const py = gy - HEX_H() / 2;
  const q = ((Math.sqrt(3) / 3) * px - py / 3) / size;
  const r = ((2 / 3) * py) / size;
  let rx = Math.round(q);
  let rz = Math.round(r);
  const ry = Math.round(-q - r);
  const dx = Math.abs(rx - q);
  const dy = Math.abs(ry - (-q - r));
  const dz = Math.abs(rz - r);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (!(dy > dz)) rz = -rx - ry;
  return { x: rx + (rz - (rz & 1)) / 2, y: rz };
}

/** Наземная точка в дробных клетках (центр клетки (x, y) — ровно x, y): для схемы чужого поля */
export function groundToCellF(gx: number, gy: number): P {
  if (!hex) return { x: gx / CS() - 0.5, y: gy / CS() - 0.5 };
  const row = (gy - HEX_H() / 2) / ROW();
  const r = Math.round(row);
  return { x: gx / CS() - 0.5 - 0.5 * (r & 1), y: row };
}

/** Обратное к `groundToCellF`: дробные клетки → наземная точка */
export function cellFToGround(cx: number, cy: number): P {
  if (!hex) return { x: (cx + 0.5) * CS(), y: (cy + 0.5) * CS() };
  return { x: (cx + 0.5 + 0.5 * (Math.round(cy) & 1)) * CS(), y: HEX_H() / 2 + cy * ROW() };
}

/** Соседи клетки: 4 у квадрата, 6 у гекса */
export function neighbours(p: P): P[] {
  if (!hex)
    return [
      { x: p.x + 1, y: p.y },
      { x: p.x - 1, y: p.y },
      { x: p.x, y: p.y + 1 },
      { x: p.x, y: p.y - 1 },
    ];
  const odd = p.y & 1;
  return [
    { x: p.x + 1, y: p.y },
    { x: p.x - 1, y: p.y },
    { x: p.x - 1 + odd, y: p.y - 1 },
    { x: p.x + odd, y: p.y - 1 },
    { x: p.x - 1 + odd, y: p.y + 1 },
    { x: p.x + odd, y: p.y + 1 },
  ];
}

/** Соседи гекса по кругу (по часовой от правого); у квадрата — 4 соседа по кругу */
export function ring(p: P): P[] {
  const n = neighbours(p);
  return hex ? [n[0], n[5], n[4], n[1], n[2], n[3]] : [n[0], n[2], n[1], n[3]];
}

/** Соседние ли клетки (по стороне) */
export function adjacent(a: P, b: P): boolean {
  return neighbours(a).some((n) => n.x === b.x && n.y === b.y);
}

/** Клетка p, сдвинутая так же, как from → to (на гексах — по осевым координатам, чтобы фигура не ломалась на чётных/нечётных рядах) */
export function translate(p: P, from: P, to: P): P {
  if (!hex) return { x: p.x + to.x - from.x, y: p.y + to.y - from.y };
  const q = (c: P) => c.x - (c.y - (c.y & 1)) / 2;
  const nq = q(p) + q(to) - q(from);
  const ny = p.y + to.y - from.y;
  return { x: nq + (ny - (ny & 1)) / 2, y: ny };
}

/** Контур клетки (с отступом внутрь inset px) на ctx — путь без stroke/fill */
export function cellPath(ctx: CanvasRenderingContext2D, p: P, inset = 0) {
  const cs = CS();
  ctx.beginPath();
  if (!hex) {
    ctx.rect(p.x * cs + inset, p.y * cs + inset, cs - inset * 2, cs - inset * 2);
    return;
  }
  const cx = centerX(p);
  const cy = centerY(p);
  const r = HEX_H() / 2 - inset * 1.15;
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

/** Наклонный вид гексового поля: наземные px → экранные (логические 896×512) */
export const hexView = {
  /** Сжатие по высоте — «наклон» поля */
  squash: 0.86,
  /** Ширина наземного поля: 14,5 клетки (нечётные ряды сдвинуты) */
  groundW: () => (CONFIG.grid.cols + 0.5) * CS(),
  groundH: () => HEX_H() + (CONFIG.grid.rows - 1) * ROW(),
  /** Общий масштаб, чтобы поле вошло по ширине */
  k: () => CONFIG.grid.totalWidth / hexView.groundW(),
  /** Высота полосы неба над полем, экранные px */
  sky: () => CONFIG.grid.totalHeight - hexView.groundH() * hexView.k() * hexView.squash,
};

/** Экранная точка (без приближения) → наземная */
export function screenToGround(sx: number, sy: number): P {
  if (!hex) return { x: sx, y: sy };
  const k = hexView.k();
  return { x: sx / k, y: (sy - hexView.sky()) / (k * hexView.squash) };
}
