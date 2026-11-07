/**
 * Отрисовка глобальной карты похода: запечённый слой местности (трава, дороги, вода, лес, горы, декор,
 * украшения) и живой слой (объекты, герой, путь, сетка, туман). Пробный вид «как карта в Героях»:
 * всё из того, что уже есть — тайлы и декор биомов, спрайты; деревья, горы и постройки — кодом.
 */
import { RegionDef, WorldState, WorldObj, WorldProp, bigPropHexes, terrainAt, regionW, regionH, hexNeighbours, isSeen, objectAt, isLocked, stepCost, RES_ICONS, ResKey, TERRAIN_COST } from './world';
import { sprites, drawSprite } from '../game/sprites';
import type { Tileset } from '../game/tiles';

export type P = { x: number; y: number };

/** Ширина гекса на карте, мировые px; высота — по правильному шестиугольнику */
export const HW = 64;
export const HH = (HW * 2) / Math.sqrt(3);
export const BAKE_MAX = 1.5; // запас резкости запечённого слоя при приближении
const BAKE_AREA = 9_000_000; // не больше стольких px у запечённого холста (память телефона)
/** Масштаб запечённого слоя: на большой карте меньше, чтобы холст влез в память телефона */
export function bakeScale(r: RegionDef): number {
  return Math.min(BAKE_MAX, Math.sqrt(BAKE_AREA / (worldW(r) * worldH(r))));
}

export const wx = (p: P) => (p.x + 0.5 + 0.5 * (p.y & 1)) * HW;
export const wy = (p: P) => HH / 2 + p.y * 0.75 * HH;
export const worldW = (r: RegionDef) => (regionW(r) + 0.5) * HW;
export const worldH = (r: RegionDef) => ((regionH(r) - 1) * 0.75 + 1) * HH;

export function hexPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - h / 2);
  ctx.lineTo(x + w / 2, y - h / 4);
  ctx.lineTo(x + w / 2, y + h / 4);
  ctx.lineTo(x, y + h / 2);
  ctx.lineTo(x - w / 2, y + h / 4);
  ctx.lineTo(x - w / 2, y - h / 4);
  ctx.closePath();
}

/** Гекс под мировой точкой (ближайший центр) */
export function hexAt(r: RegionDef, gx: number, gy: number): P | null {
  const y0 = Math.round((gy - HH / 2) / (0.75 * HH));
  let best: P | null = null;
  let bd = Infinity;
  for (let y = y0 - 1; y <= y0 + 1; y++) {
    if (y < 0 || y >= regionH(r)) continue;
    const x0 = Math.round(gx / HW - 0.5 - 0.5 * (y & 1));
    for (let x = x0 - 1; x <= x0 + 1; x++) {
      if (x < 0 || x >= regionW(r)) continue;
      const d = (wx({ x, y }) - gx) ** 2 + (wy({ x, y }) - gy) ** 2;
      if (d < bd) {
        bd = d;
        best = { x, y };
      }
    }
  }
  return best && bd <= (HW * 0.62) ** 2 ? best : null;
}

function rnd(x: number, y: number, k: number) {
  const s = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

// -------------------------------------------------------------
// Дополнительные картинки из других биомов (тростник, могилы, костёр, колонны…)
// -------------------------------------------------------------
const EXTRA: Record<string, string> = {
  reeds: 'tiles/swamp/decor/reeds.png',
  lily: 'tiles/swamp/decor/lily.png',
  grave1: 'tiles/swamp/decor/grave1.png',
  grave2: 'tiles/swamp/decor/grave2.png',
  bones: 'tiles/swamp/decor/bones.png',
  log: 'tiles/swamp/decor/log.png',
  snag: 'tiles/swamp/decor/snag.png',
  firepit: 'tiles/scorched/decor/firepit.png',
  column: 'tiles/citadel/decor/column.png',
  slab1: 'tiles/citadel/decor/slab1.png',
  slab2: 'tiles/citadel/decor/slab2.png',
  crystal: 'tiles/ice/decor/crystal1.png',
};
let extraPromise: Promise<Map<string, HTMLImageElement>> | null = null;
export function loadExtras(): Promise<Map<string, HTMLImageElement>> {
  if (!extraPromise) {
    const m = new Map<string, HTMLImageElement>();
    extraPromise = Promise.all(
      Object.entries(EXTRA).map(
        ([k, url]) =>
          new Promise<void>((res) => {
            const img = new Image();
            img.onload = () => {
              m.set(k, img);
              res();
            };
            img.onerror = () => res();
            img.src = new URL(url, document.baseURI).href;
          })
      )
    ).then(() => m);
  }
  return extraPromise;
}

// -------------------------------------------------------------
// Деревья, горы и постройки кодом
// -------------------------------------------------------------
function pine(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, tone: number) {
  ctx.fillStyle = '#3a2a1c';
  ctx.fillRect(x - s * 0.06, y - s * 0.18, s * 0.12, s * 0.2);
  const dark = `hsl(${128 + tone * 14}, ${28 + tone * 10}%, ${13 + tone * 5}%)`;
  const mid = `hsl(${118 + tone * 14}, ${30 + tone * 8}%, ${20 + tone * 6}%)`;
  for (let i = 0; i < 3; i++) {
    const by = y - s * (0.12 + i * 0.26);
    const w = s * (0.42 - i * 0.1);
    const h = s * 0.42;
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(x - w, by);
    ctx.lineTo(x, by - h);
    ctx.lineTo(x + w, by);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = mid;
    ctx.beginPath();
    ctx.moveTo(x - w, by);
    ctx.lineTo(x, by - h);
    ctx.lineTo(x - w * 0.1, by);
    ctx.closePath();
    ctx.fill();
  }
}

function oak(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, tone: number) {
  ctx.fillStyle = '#3d2c1d';
  ctx.fillRect(x - s * 0.05, y - s * 0.3, s * 0.1, s * 0.32);
  const blobs = [
    [0, -0.55, 0.28],
    [-0.2, -0.42, 0.22],
    [0.2, -0.42, 0.22],
    [0, -0.75, 0.2],
  ];
  for (const [bx, by, br] of blobs) {
    ctx.fillStyle = `hsl(${95 + tone * 20}, 32%, ${16 + tone * 4}%)`;
    ctx.beginPath();
    ctx.arc(x + bx * s, y + by * s, br * s, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const [bx, by, br] of blobs) {
    ctx.fillStyle = `hsla(${90 + tone * 20}, 36%, ${26 + tone * 6}%, 0.9)`;
    ctx.beginPath();
    ctx.arc(x + bx * s - br * s * 0.25, y + by * s - br * s * 0.25, br * s * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function peak(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, snow: boolean, k: number) {
  const top = y - s * (0.85 + k * 0.3);
  const lx = x - s * 0.55;
  const rx = x + s * 0.55;
  const tx = x + (k - 0.5) * s * 0.2;
  ctx.fillStyle = '#4a4550';
  ctx.beginPath();
  ctx.moveTo(lx, y);
  ctx.lineTo(tx, top);
  ctx.lineTo(rx, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#6f6874';
  ctx.beginPath();
  ctx.moveTo(lx, y);
  ctx.lineTo(tx, top);
  ctx.lineTo(tx - s * 0.06, y);
  ctx.closePath();
  ctx.fill();
  // Расщелины
  ctx.strokeStyle = 'rgba(25,22,30,0.55)';
  ctx.lineWidth = Math.max(1, s * 0.03);
  ctx.beginPath();
  ctx.moveTo(tx + s * 0.05, top + s * 0.2);
  ctx.lineTo(tx + s * 0.18, y - s * 0.2);
  ctx.moveTo(tx - s * 0.12, top + s * 0.35);
  ctx.lineTo(tx - s * 0.22, y - s * 0.1);
  ctx.stroke();
  if (snow) {
    ctx.fillStyle = '#d9dde6';
    ctx.beginPath();
    ctx.moveTo(tx, top);
    ctx.lineTo(tx - s * 0.17, top + s * 0.28);
    ctx.lineTo(tx - s * 0.05, top + s * 0.22);
    ctx.lineTo(tx + s * 0.04, top + s * 0.3);
    ctx.lineTo(tx + s * 0.16, top + s * 0.26);
    ctx.closePath();
    ctx.fill();
  }
}

function hut(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, roof: string) {
  ctx.fillStyle = '#5a4630';
  ctx.fillRect(x - s * 0.3, y - s * 0.32, s * 0.6, s * 0.32);
  ctx.fillStyle = roof;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.4, y - s * 0.3);
  ctx.lineTo(x, y - s * 0.65);
  ctx.lineTo(x + s * 0.4, y - s * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#20180f';
  ctx.fillRect(x - s * 0.07, y - s * 0.18, s * 0.14, s * 0.18);
}

function tent(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, c1: string, c2: string) {
  ctx.fillStyle = c1;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.35, y);
  ctx.lineTo(x, y - s * 0.5);
  ctx.lineTo(x + s * 0.35, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = c2;
  ctx.beginPath();
  ctx.moveTo(x, y - s * 0.5);
  ctx.lineTo(x + s * 0.35, y);
  ctx.lineTo(x + s * 0.05, y);
  ctx.closePath();
  ctx.fill();
}

// -------------------------------------------------------------
// Крупные украшения глуши: руины замка, скала, сторожевая башня, кристалл, мёртвые деревья, статуя
// -------------------------------------------------------------
function stoneBlock(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, light: string, dark: string) {
  ctx.fillStyle = dark;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = light;
  ctx.fillRect(x, y, w * 0.45, h);
  ctx.strokeStyle = 'rgba(15,12,18,0.45)';
  ctx.lineWidth = 1;
  const rows = Math.max(2, Math.round(h / 9));
  for (let i = 1; i < rows; i++) {
    const yy = y + (h * i) / rows;
    ctx.beginPath();
    ctx.moveTo(x, yy);
    ctx.lineTo(x + w, yy);
    ctx.stroke();
  }
}

function battlements(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, tooth: number, color: string, broken: number) {
  ctx.fillStyle = color;
  const n = Math.max(2, Math.floor(w / (tooth * 2)));
  for (let i = 0; i < n; i++) {
    if ((i * 7 + broken) % 5 === 0) continue; // выбитый зубец
    ctx.fillRect(x + i * tooth * 2, y - tooth, tooth, tooth);
  }
}

/** Руины замка: стена с воротами, две башни (одна обрушена), тёмные окна, плющ */
function ruinedCastle(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, k: number) {
  const L = '#6d6873';
  const D = '#48434f';
  const wallH = w * 0.26;
  // тень у подножия
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(x, y, w * 0.55, w * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  // задняя высокая башня (донжон)
  const kx = x + (k - 1) * w * 0.08;
  stoneBlock(ctx, kx - w * 0.12, y - wallH - w * 0.42, w * 0.24, w * 0.44, L, D);
  battlements(ctx, kx - w * 0.12, y - wallH - w * 0.42, w * 0.24, w * 0.035, D, k);
  ctx.fillStyle = '#16131a';
  ctx.fillRect(kx - w * 0.02, y - wallH - w * 0.32, w * 0.04, w * 0.07);
  // стена
  stoneBlock(ctx, x - w * 0.42, y - wallH, w * 0.84, wallH, L, D);
  battlements(ctx, x - w * 0.42, y - wallH, w * 0.84, w * 0.035, D, k + 2);
  // ворота
  ctx.fillStyle = '#17141b';
  ctx.beginPath();
  ctx.moveTo(x - w * 0.07, y);
  ctx.lineTo(x - w * 0.07, y - wallH * 0.55);
  ctx.arc(x, y - wallH * 0.55, w * 0.07, Math.PI, 0);
  ctx.lineTo(x + w * 0.07, y);
  ctx.closePath();
  ctx.fill();
  // боковые башни: левая целая, правая обрушена
  stoneBlock(ctx, x - w * 0.5, y - wallH - w * 0.16, w * 0.16, wallH + w * 0.16, L, D);
  battlements(ctx, x - w * 0.5, y - wallH - w * 0.16, w * 0.16, w * 0.03, D, k + 1);
  ctx.fillStyle = '#5a2a2a';
  ctx.beginPath();
  ctx.moveTo(x - w * 0.52, y - wallH - w * 0.19);
  ctx.lineTo(x - w * 0.42, y - wallH - w * 0.36);
  ctx.lineTo(x - w * 0.32, y - wallH - w * 0.19);
  ctx.closePath();
  ctx.fill();
  stoneBlock(ctx, x + w * 0.34, y - wallH - w * 0.05, w * 0.16, wallH + w * 0.05, L, D);
  ctx.fillStyle = D;
  ctx.beginPath();
  ctx.moveTo(x + w * 0.34, y - wallH - w * 0.05);
  ctx.lineTo(x + w * 0.38, y - wallH - w * 0.13);
  ctx.lineTo(x + w * 0.43, y - wallH - w * 0.07);
  ctx.lineTo(x + w * 0.47, y - wallH - w * 0.15);
  ctx.lineTo(x + w * 0.5, y - wallH - w * 0.05);
  ctx.closePath();
  ctx.fill();
  // обломки у стены
  ctx.fillStyle = '#5a5560';
  for (let i = 0; i < 5; i++) {
    const bx = x + w * (0.25 + i * 0.06);
    ctx.beginPath();
    ctx.ellipse(bx, y - 2, w * 0.03, w * 0.018, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // окна и плющ
  ctx.fillStyle = '#16131a';
  for (const ox of [-0.3, -0.18, 0.15, 0.27]) ctx.fillRect(x + w * ox, y - wallH * 0.75, w * 0.025, w * 0.045);
  ctx.fillStyle = 'rgba(40,70,35,0.8)';
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(x - w * 0.42 + w * 0.05 * i, y - wallH * (0.2 + (i % 3) * 0.2), w * 0.03, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Скала: слоистый утёс с уступами */
function cliff(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, k: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(x, y, w * 0.5, w * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  const shapes = [
    [-0.45, 0, -0.38, -0.32, -0.2, -0.45, -0.05, -0.38, 0.05, 0],
    [-0.12, 0, -0.05, -0.55, 0.1, -0.68 - k * 0.04, 0.22, -0.5, 0.3, 0],
    [0.15, 0, 0.25, -0.35, 0.38, -0.4, 0.48, -0.2, 0.5, 0],
  ];
  const tones = [
    ['#55505c', '#6f6a76'],
    ['#4b4652', '#77717f'],
    ['#5a5561', '#6a6570'],
  ];
  shapes.forEach((sh, i) => {
    ctx.fillStyle = tones[i][0];
    ctx.beginPath();
    ctx.moveTo(x + sh[0] * w, y + sh[1] * w);
    for (let j = 2; j < sh.length; j += 2) ctx.lineTo(x + sh[j] * w, y + sh[j + 1] * w);
    ctx.closePath();
    ctx.fill();
    // светлая грань
    ctx.fillStyle = tones[i][1];
    ctx.beginPath();
    ctx.moveTo(x + sh[0] * w, y + sh[1] * w);
    ctx.lineTo(x + sh[2] * w, y + sh[3] * w);
    ctx.lineTo(x + sh[4] * w, y + sh[5] * w);
    ctx.lineTo(x + (sh[4] - 0.04) * w, y);
    ctx.closePath();
    ctx.fill();
  });
  // слои и трещины
  ctx.strokeStyle = 'rgba(20,18,24,0.5)';
  ctx.lineWidth = Math.max(1, w * 0.012);
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(x - w * 0.3, y - w * 0.09 * i);
    ctx.lineTo(x + w * 0.35, y - w * 0.09 * i + w * 0.02);
    ctx.stroke();
  }
  // мох у подножия
  ctx.fillStyle = 'rgba(45,75,38,0.75)';
  for (let i = 0; i < 7; i++) {
    ctx.beginPath();
    ctx.arc(x - w * 0.4 + i * w * 0.13, y - w * 0.015, w * 0.035, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Сторожевая башня: круглая, каменная, с остроконечной крышей или обрушенным верхом */
function watchtower(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, whole: boolean) {
  const w = s * 0.32;
  const h = s * 0.95;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(x, y, w * 0.9, w * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  g.addColorStop(0, '#7a7480');
  g.addColorStop(1, '#45404b');
  ctx.fillStyle = g;
  ctx.fillRect(x - w / 2, y - h, w, h);
  ctx.strokeStyle = 'rgba(20,18,24,0.45)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 7; i++) {
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y - (h * i) / 7);
    ctx.lineTo(x + w / 2, y - (h * i) / 7);
    ctx.stroke();
  }
  ctx.fillStyle = '#16131a';
  ctx.fillRect(x - w * 0.1, y - h * 0.7, w * 0.2, h * 0.12);
  ctx.fillRect(x - w * 0.15, y - h * 0.22, w * 0.3, h * 0.22);
  if (whole) {
    ctx.fillStyle = '#4b2a2a';
    ctx.beginPath();
    ctx.moveTo(x - w * 0.7, y - h);
    ctx.lineTo(x, y - h - s * 0.45);
    ctx.lineTo(x + w * 0.7, y - h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#6b3a32';
    ctx.beginPath();
    ctx.moveTo(x - w * 0.7, y - h);
    ctx.lineTo(x, y - h - s * 0.45);
    ctx.lineTo(x - w * 0.1, y - h);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillStyle = '#45404b';
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y - h);
    ctx.lineTo(x - w * 0.3, y - h - s * 0.1);
    ctx.lineTo(x - w * 0.05, y - h - s * 0.03);
    ctx.lineTo(x + w * 0.2, y - h - s * 0.14);
    ctx.lineTo(x + w / 2, y - h);
    ctx.closePath();
    ctx.fill();
  }
}

/** Кристалл: бирюзовые грани, как у осколков сети узлов */
function crystalSpire(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  const glow = ctx.createRadialGradient(x, y - s * 0.4, 2, x, y - s * 0.4, s * 0.7);
  glow.addColorStop(0, 'rgba(62,214,196,0.35)');
  glow.addColorStop(1, 'rgba(62,214,196,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - s, y - s * 1.2, s * 2, s * 1.4);
  const shards = [
    [0, 0.95, 0.16],
    [-0.2, 0.6, 0.11],
    [0.22, 0.7, 0.12],
    [-0.33, 0.35, 0.08],
    [0.34, 0.4, 0.08],
  ];
  for (const [dx, hh, ww] of shards) {
    const bx = x + dx * s;
    ctx.fillStyle = '#1f6f6a';
    ctx.beginPath();
    ctx.moveTo(bx - ww * s, y);
    ctx.lineTo(bx - ww * s * 0.7, y - hh * s * 0.75);
    ctx.lineTo(bx, y - hh * s);
    ctx.lineTo(bx + ww * s * 0.7, y - hh * s * 0.75);
    ctx.lineTo(bx + ww * s, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#5fe0d2';
    ctx.beginPath();
    ctx.moveTo(bx - ww * s, y);
    ctx.lineTo(bx - ww * s * 0.7, y - hh * s * 0.75);
    ctx.lineTo(bx, y - hh * s);
    ctx.lineTo(bx, y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#4a4550';
  ctx.beginPath();
  ctx.ellipse(x, y, s * 0.42, s * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Мёртвое дерево: голый ствол с ветвями */
function deadTree(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, k: number) {
  ctx.strokeStyle = k % 2 ? '#2e2620' : '#3a3027';
  ctx.lineCap = 'round';
  const branch = (bx: number, by: number, len: number, a: number, wd: number, depth: number) => {
    const ex = bx + Math.cos(a) * len;
    const ey = by + Math.sin(a) * len;
    ctx.lineWidth = wd;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    if (depth > 0) {
      branch(ex, ey, len * 0.62, a - 0.5 - k * 0.05, wd * 0.6, depth - 1);
      branch(ex, ey, len * 0.55, a + 0.45, wd * 0.6, depth - 1);
    }
  };
  branch(x, y, s * 0.42, -Math.PI / 2 + (k - 1) * 0.08, s * 0.08, 3);
}

/** Статуя древнего короля на постаменте, с отбитой рукой */
function statue(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(x, y, s * 0.35, s * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  stoneBlock(ctx, x - s * 0.22, y - s * 0.22, s * 0.44, s * 0.22, '#706a76', '#4d4855');
  const L = '#87818d';
  const D = '#5d5864';
  ctx.fillStyle = D;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.13, y - s * 0.22);
  ctx.lineTo(x - s * 0.1, y - s * 0.7);
  ctx.lineTo(x + s * 0.1, y - s * 0.7);
  ctx.lineTo(x + s * 0.14, y - s * 0.22);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = L;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.13, y - s * 0.22);
  ctx.lineTo(x - s * 0.1, y - s * 0.7);
  ctx.lineTo(x - s * 0.01, y - s * 0.7);
  ctx.lineTo(x - s * 0.02, y - s * 0.22);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y - s * 0.78, s * 0.08, 0, Math.PI * 2);
  ctx.fill();
  // корона и меч
  ctx.fillStyle = D;
  ctx.fillRect(x - s * 0.07, y - s * 0.88, s * 0.14, s * 0.04);
  ctx.strokeStyle = L;
  ctx.lineWidth = s * 0.03;
  ctx.beginPath();
  ctx.moveTo(x + s * 0.16, y - s * 0.25);
  ctx.lineTo(x + s * 0.16, y - s * 0.66);
  ctx.stroke();
  ctx.fillStyle = 'rgba(45,75,38,0.75)';
  ctx.beginPath();
  ctx.arc(x - s * 0.18, y - s * 0.03, s * 0.05, 0, Math.PI * 2);
  ctx.arc(x + s * 0.2, y - s * 0.02, s * 0.04, 0, Math.PI * 2);
  ctx.fill();
}

type Drawable = { y: number; draw: () => void };

/** Украшения карты: то, что стоит на земле, — в общий список по глубине */
function propDrawables(ctx: CanvasRenderingContext2D, p: WorldProp, img: (n: string) => HTMLImageElement | null): Drawable[] {
  const x = wx(p);
  const y = wy(p);
  const put = (n: string, dx: number, dy: number, w: number, flip = false) => {
    const im = img(n);
    if (!im) return;
    const dh = (im.height / im.width) * w;
    ctx.save();
    ctx.translate(x + dx, y + dy);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(im, -w / 2, -dh, w, dh);
    ctx.restore();
  };
  const s = HW;
  switch (p.kind) {
    case 'windmill':
      return [
        {
          y: y + s * 0.2,
          draw: () => {
            ctx.fillStyle = '#6e5a42';
            ctx.beginPath();
            ctx.moveTo(x - s * 0.18, y + s * 0.2);
            ctx.lineTo(x - s * 0.1, y - s * 0.55);
            ctx.lineTo(x + s * 0.1, y - s * 0.55);
            ctx.lineTo(x + s * 0.18, y + s * 0.2);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#4a2f22';
            ctx.beginPath();
            ctx.moveTo(x - s * 0.15, y - s * 0.55);
            ctx.lineTo(x, y - s * 0.75);
            ctx.lineTo(x + s * 0.15, y - s * 0.55);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#c9b48a';
            ctx.lineWidth = s * 0.05;
            for (let i = 0; i < 4; i++) {
              const a = Math.PI / 4 + (i * Math.PI) / 2;
              ctx.beginPath();
              ctx.moveTo(x, y - s * 0.55);
              ctx.lineTo(x + Math.cos(a) * s * 0.5, y - s * 0.55 + Math.sin(a) * s * 0.5);
              ctx.stroke();
            }
          },
        },
      ];
    case 'farm':
      return [
        { y: y - s * 0.1, draw: () => put('hay', -s * 0.2, -s * 0.05, s * 0.4) },
        { y: y + s * 0.15, draw: () => hut(ctx, x + s * 0.15, y + s * 0.15, s * 0.8, '#7a5a2c') },
        { y: y + s * 0.25, draw: () => put('wheel', -s * 0.25, s * 0.25, s * 0.25) },
      ];
    case 'stones':
      return [0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2;
        const sx = x + Math.cos(a) * s * 0.3;
        const sy = y + Math.sin(a) * s * 0.18;
        return {
          y: sy,
          draw: () => {
            ctx.fillStyle = i % 2 ? '#7a7680' : '#5e5a66';
            ctx.beginPath();
            ctx.moveTo(sx - s * 0.06, sy);
            ctx.lineTo(sx - s * 0.05, sy - s * 0.28);
            ctx.lineTo(sx + s * 0.02, sy - s * 0.33);
            ctx.lineTo(sx + s * 0.06, sy);
            ctx.closePath();
            ctx.fill();
          },
        };
      });
    case 'wreck':
      return [{ y, draw: () => (put('wheel', -s * 0.15, 0, s * 0.3), put('log', s * 0.15, s * 0.1, s * 0.45), put('branch', 0, -s * 0.15, s * 0.3)) }];
    case 'graves':
      return [
        { y: y - s * 0.1, draw: () => put('grave1', -s * 0.2, -s * 0.1, s * 0.3) },
        { y: y, draw: () => put('grave2', s * 0.15, 0, s * 0.3) },
        { y: y + s * 0.2, draw: () => put('bones', -s * 0.05, s * 0.2, s * 0.35) },
      ];
    case 'ruins':
      return [
        { y: y - s * 0.1, draw: () => put('column', -s * 0.2, -s * 0.1, s * 0.25) },
        { y: y + s * 0.1, draw: () => put('slab1', s * 0.12, s * 0.1, s * 0.4) },
        { y: y + s * 0.25, draw: () => put('slab2', -s * 0.1, s * 0.25, s * 0.35, true) },
      ];
    case 'orcCamp':
      return [
        { y: y - s * 0.15, draw: () => tent(ctx, x - s * 0.2, y - s * 0.15, s * 0.8, '#5a3b26', '#3e281a') },
        { y: y - s * 0.05, draw: () => tent(ctx, x + s * 0.25, y - s * 0.05, s * 0.7, '#6b4a2c', '#46301d') },
        { y: y + s * 0.2, draw: () => (put('firepit', 0, s * 0.2, s * 0.35), put('spear', s * 0.3, s * 0.2, s * 0.2)) },
      ];
    case 'castle':
      return [{ y: y + HH * 0.6, draw: () => ruinedCastle(ctx, x, y + HH * 0.55, s * 2.3, (p.x * 7 + p.y) % 3) }];
    case 'cliff':
      return [{ y: y + HH * 0.6, draw: () => cliff(ctx, x, y + HH * 0.6, s * 2.2, (p.x * 3 + p.y * 5) % 4) }];
    case 'tower':
      return [{ y: y + HH * 0.3, draw: () => watchtower(ctx, x, y + HH * 0.3, s * 1.1, (p.x + p.y) % 2 === 0) }];
    case 'crystals':
      return [{ y: y + HH * 0.3, draw: () => crystalSpire(ctx, x, y + HH * 0.3, s * 1.0) }];
    case 'deadwood':
      return [-0.25, 0.2, 0].map((d, i) => ({ y: y + HH * (0.1 + i * 0.12), draw: () => deadTree(ctx, x + d * s, y + HH * (0.1 + i * 0.12), s * (0.8 - i * 0.12), i) }));
    case 'statue':
      return [{ y: y + HH * 0.3, draw: () => statue(ctx, x, y + HH * 0.3, s * 1.0) }];
  }
}

/**
 * Запекает местность в холст (BAKE × мировой размер). `img(name)` — декор набора («decor/имя») и дополнительные картинки.
 */
export function bakeTerrain(r: RegionDef, tiles: Tileset | null, extras: Map<string, HTMLImageElement> | null): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  const BAKE = bakeScale(r);
  cv.width = Math.ceil(worldW(r) * BAKE);
  cv.height = Math.ceil(worldH(r) * BAKE);
  const ctx = cv.getContext('2d')!;
  ctx.scale(BAKE, BAKE);
  const big = bigPropHexes(r);
  const img = (n: string) => tiles?.get(`decor/${n}`) ?? extras?.get(n) ?? null;
  const grass = tiles?.get('grass') ?? null;
  const dirt = tiles?.get('dirt') ?? null;
  const W = regionW(r);
  const H = regionH(r);
  const T = (x: number, y: number) => terrainAt(r, x, y);

  ctx.fillStyle = '#1a1716';
  ctx.fillRect(0, 0, worldW(r), worldH(r));

  // 1. Земля: трава у всех, кроме воды; холмы и горы темнее
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const t = T(x, y)!;
      const px = wx({ x, y });
      const py = wy({ x, y });
      ctx.save();
      hexPath(ctx, px, py, HW + 1.5, HH + 1.5);
      ctx.clip();
      const tile = t === 'hills' || t === 'rock' || big.has(`${x},${y}`) ? dirt ?? grass : grass;
      if (tile) {
        const sx = rnd(x, y, 1) * tile.width * 0.45;
        const sy = rnd(x, y, 2) * tile.height * 0.45;
        ctx.drawImage(tile, sx, sy, tile.width * 0.55, tile.height * 0.55, px - HW / 2 - 1, py - HH / 2 - 1, HW + 2, HH + 2);
      } else {
        ctx.fillStyle = '#3e5530';
        ctx.fillRect(px - HW, py - HH, HW * 2, HH * 2);
      }
      const tint = big.has(`${x},${y}`) ? 'rgba(30,24,20,0.35)' : t === 'rock' ? 'rgba(30,26,34,0.55)' : t === 'wood' ? 'rgba(6,20,8,0.55)' : t === 'forest' ? 'rgba(12,30,12,0.35)' : t === 'hills' ? 'rgba(70,80,40,0.25)' : `rgba(0,0,0,${rnd(x, y, 3) * 0.12})`;
      ctx.fillStyle = tint;
      ctx.fillRect(px - HW, py - HH, HW * 2, HH * 2);
      ctx.restore();
    }

  // 2. Вода: илистый берег, затем сама вода с бликами
  const isWater = (x: number, y: number) => T(x, y) === 'water';
  const bridgeHex = (x: number, y: number) => T(x, y) === 'road' && hexNeighbours(x, y).filter((n) => isWater(n.x, n.y)).length >= 2;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (isWater(x, y) || bridgeHex(x, y)) {
        ctx.fillStyle = '#5b4a33';
        hexPath(ctx, wx({ x, y }), wy({ x, y }), HW * 1.18, HH * 1.18);
        ctx.fill();
      }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (isWater(x, y) || bridgeHex(x, y)) {
        const px = wx({ x, y });
        const py = wy({ x, y });
        const g = ctx.createLinearGradient(px, py - HH / 2, px, py + HH / 2);
        g.addColorStop(0, '#24495a');
        g.addColorStop(1, '#183441');
        ctx.fillStyle = g;
        hexPath(ctx, px, py, HW + 2, HH + 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(170,215,225,0.22)';
        ctx.lineWidth = 1.2;
        for (let i = 0; i < 3; i++) {
          const ry = py - HH * 0.22 + i * HH * 0.2 + rnd(x, y, i) * 4;
          const rx = px + (rnd(x, y, i + 5) - 0.5) * HW * 0.3;
          ctx.beginPath();
          ctx.moveTo(rx - HW * 0.18, ry);
          ctx.quadraticCurveTo(rx, ry - 3, rx + HW * 0.18, ry);
          ctx.stroke();
        }
      }

  // 3. Дороги: тёмная обочина, затем полоса земли; переправа — мост из досок
  const roads: [P, P][] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (T(x, y) !== 'road') continue;
      for (const n of hexNeighbours(x, y)) if (T(n.x, n.y) === 'road' && (n.y > y || (n.y === y && n.x > x))) roads.push([{ x, y }, n]);
    }
  const stroke = (style: string | CanvasPattern, w: number) => {
    ctx.strokeStyle = style;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [a, b] of roads) {
      if (bridgeHex(a.x, a.y) && bridgeHex(b.x, b.y)) continue;
      ctx.beginPath();
      ctx.moveTo(wx(a), wy(a));
      ctx.lineTo(wx(b), wy(b));
      ctx.stroke();
    }
  };
  stroke('rgba(40,30,18,0.55)', HW * 0.46);
  const pat = dirt ? ctx.createPattern(dirt, 'repeat') : null;
  if (pat) pat.setTransform(new DOMMatrix().scale(0.35));
  stroke(pat ?? '#7a6243', HW * 0.36);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!bridgeHex(x, y)) continue;
      const px = wx({ x, y });
      const py = wy({ x, y });
      ctx.fillStyle = '#6b4a2a';
      ctx.fillRect(px - HW * 0.55, py - HH * 0.18, HW * 1.1, HH * 0.36);
      ctx.strokeStyle = '#3a2716';
      ctx.lineWidth = 1.5;
      for (let i = -5; i <= 5; i++) {
        ctx.beginPath();
        ctx.moveTo(px + i * HW * 0.1, py - HH * 0.18);
        ctx.lineTo(px + i * HW * 0.1, py + HH * 0.18);
        ctx.stroke();
      }
      ctx.strokeRect(px - HW * 0.55, py - HH * 0.18, HW * 1.1, HH * 0.36);
    }

  // 4. Всё, что стоит на земле, — по глубине: деревья, горы, декор, украшения
  const items: Drawable[] = [];
  const put = (n: string, x: number, y: number, w: number, flip = false) => {
    const im = img(n);
    if (!im) return;
    const dh = (im.height / im.width) * w;
    ctx.save();
    ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(im, -w / 2, -dh, w, dh);
    ctx.restore();
  };
  const occupied = new Set([...r.objects, ...(r.props ?? [])].map((o) => `${o.x},${o.y}`));
  const SMALL = ['tuft', 'clover', 'flowers', 'burdock', 'thistle', 'berries', 'strawberry', 'fern', 'molehill'];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const t = T(x, y)!;
      const px = wx({ x, y });
      const py = wy({ x, y });
      const busy = occupied.has(`${x},${y}`) || big.has(`${x},${y}`);
      if ((t === 'forest' || t === 'wood') && !busy) {
        const n = t === 'wood' ? 6 + Math.floor(rnd(x, y, 7) * 3) : 3 + Math.floor(rnd(x, y, 7) * 3);
        for (let i = 0; i < n; i++) {
          const tx = px + (rnd(x, y, 10 + i) - 0.5) * HW * 0.95;
          const ty = py + (rnd(x, y, 20 + i) - 0.5) * HH * 0.8 + HH * 0.15;
          const s = HW * (t === 'wood' ? 0.62 + rnd(x, y, 30 + i) * 0.35 : 0.55 + rnd(x, y, 30 + i) * 0.3);
          const tone = rnd(x, y, 40 + i);
          const isPine = rnd(x, y, 50 + i) > 0.35;
          items.push({ y: ty, draw: () => (isPine ? pine(ctx, tx, ty, s, tone) : oak(ctx, tx, ty, s * 0.9, tone)) });
        }
      } else if (t === 'rock' && !busy) {
        const n = 1 + Math.floor(rnd(x, y, 8) * 2);
        for (let i = 0; i < n; i++) {
          const tx = px + (rnd(x, y, 60 + i) - 0.5) * HW * 0.5;
          const ty = py + HH * 0.3 + (rnd(x, y, 70 + i) - 0.5) * HH * 0.2;
          const s = HW * (0.7 + rnd(x, y, 80 + i) * 0.4);
          const k = rnd(x, y, 90 + i);
          items.push({ y: ty, draw: () => peak(ctx, tx, ty, s, y < H * 0.45 && k > 0.4, k) });
        }
      } else if (t === 'hills') {
        items.push({
          y: py,
          draw: () => {
            for (let i = 0; i < 2; i++) {
              const mx = px + (i ? 0.18 : -0.15) * HW;
              const my = py + (i ? 0.15 : -0.05) * HH;
              const g = ctx.createRadialGradient(mx - HW * 0.08, my - HH * 0.12, 2, mx, my, HW * 0.32);
              g.addColorStop(0, 'rgba(120,130,70,0.85)');
              g.addColorStop(1, 'rgba(50,55,30,0.0)');
              ctx.fillStyle = g;
              ctx.beginPath();
              ctx.ellipse(mx, my, HW * 0.32, HH * 0.2, 0, 0, Math.PI * 2);
              ctx.fill();
            }
            if (rnd(x, y, 11) > 0.4) put(['rock2', 'rock3', 'rock1'][Math.floor(rnd(x, y, 12) * 3)], px + (rnd(x, y, 13) - 0.5) * HW * 0.4, py + HH * 0.25, HW * 0.32);
          },
        });
      } else if ((t === 'grass' || t === 'road') && !busy) {
        const n = t === 'road' ? (rnd(x, y, 14) > 0.6 ? 1 : 0) : Math.floor(rnd(x, y, 14) * 4);
        for (let i = 0; i < n; i++) {
          const a = rnd(x, y, 100 + i) * Math.PI * 2;
          const rr = HW * (t === 'road' ? 0.36 : 0.12 + rnd(x, y, 110 + i) * 0.25);
          const dx = px + Math.cos(a) * rr;
          const dy = py + Math.sin(a) * rr * 0.8 + HH * 0.1;
          const name = SMALL[Math.floor(rnd(x, y, 120 + i) * SMALL.length)];
          const w = HW * (0.18 + rnd(x, y, 130 + i) * 0.12);
          items.push({ y: dy, draw: () => put(name, dx, dy, w, rnd(x, y, 140 + i) > 0.5) });
        }
        // Лес по краю: редкие деревья на лугу у опушки
        if (t === 'grass' && hexNeighbours(x, y).some((nb) => T(nb.x, nb.y) === 'forest' || T(nb.x, nb.y) === 'wood') && rnd(x, y, 15) > 0.55) {
          const tx = px + (rnd(x, y, 16) - 0.5) * HW * 0.5;
          const ty = py + (rnd(x, y, 17) - 0.5) * HH * 0.4;
          items.push({ y: ty, draw: () => oak(ctx, tx, ty, HW * 0.55, rnd(x, y, 18)) });
        }
        if (t === 'grass' && rnd(x, y, 19) > 0.88) items.push({ y: py + HH * 0.2, draw: () => put(rnd(x, y, 20) > 0.5 ? 'bush1' : 'bush2', px, py + HH * 0.2, HW * 0.35) });
      }
      // Тростник у воды, кувшинки на воде
      if (t !== 'water' && t !== 'rock' && !busy && hexNeighbours(x, y).some((nb) => isWater(nb.x, nb.y)) && rnd(x, y, 21) > 0.45) {
        const w = hexNeighbours(x, y).find((nb) => isWater(nb.x, nb.y))!;
        const rx2 = (px + wx(w)) / 2;
        const ry2 = (py + wy(w)) / 2 + HH * 0.1;
        items.push({ y: ry2, draw: () => put('reeds', rx2, ry2, HW * 0.3) });
      }
      if (t === 'water' && rnd(x, y, 22) > 0.75) items.push({ y: py, draw: () => put('lily', px, py + HH * 0.1, HW * 0.28) });
    }
  for (const p of r.props ?? []) items.push(...propDrawables(ctx, p, img));
  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.draw();

  // 5. Лёгкая виньетка у края карты
  const vg = ctx.createRadialGradient(worldW(r) / 2, worldH(r) / 2, Math.min(worldW(r), worldH(r)) * 0.45, worldW(r) / 2, worldH(r) / 2, Math.max(worldW(r), worldH(r)) * 0.7);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, worldW(r), worldH(r));
  return cv;
}

function squadSprite(o: WorldObj, level: number): string {
  const n = o.waves ?? 3;
  return `enemy_${n <= 3 ? 'scout' : n <= 5 ? 'infantry' : n <= 7 ? 'heavy' : 'shaman'}_${level}`;
}

/** Живой слой: объекты, герой, сетка и путь (если герой выбран), туман. Контекст уже в мировых координатах */
export function drawLive(
  ctx: CanvasRenderingContext2D,
  r: RegionDef,
  st: WorldState,
  opts: { selected: boolean; path: P[] | null; target: P | null; extras: Map<string, HTMLImageElement> | null; time: number }
) {
  const W = regionW(r);
  const H = regionH(r);
  const lvl = r.level;
  const items: Drawable[] = [];
  const spr = (name: string, x: number, y: number, h: number, dir = -1) => {
    const s = sprites.get(name);
    if (s) drawSprite(ctx, s, x, y, dir, h);
    return !!s;
  };

  // Сетка — только когда герой выбран для хода
  if (opts.selected) {
    ctx.strokeStyle = 'rgba(255,240,200,0.22)';
    ctx.lineWidth = 1;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (!isSeen(st, r, x, y)) continue;
        const t = terrainAt(r, x, y);
        if (!t || TERRAIN_COST[t] === null) continue;
        hexPath(ctx, wx({ x, y }), wy({ x, y }), HW - 2, HH - 2);
        ctx.stroke();
      }
  }

  for (const o of r.objects) {
    if (!isSeen(st, r, o.x, o.y)) continue;
    if (!objectAt(st, r, o.x, o.y)) continue;
    const px = wx(o);
    const py = wy(o);
    const foot = py + HH * 0.28;
    items.push({
      y: foot,
      draw: () => {
        if (o.kind === 'camp') {
          tent(ctx, px - HW * 0.45, py + HH * 0.05, HW * 0.6, '#5d6f86', '#3e4c5e');
          tent(ctx, px + HW * 0.45, py + HH * 0.1, HW * 0.55, '#5d6f86', '#3e4c5e');
          if (!spr('castle', px, foot, HH * 1.2)) {
            ctx.fillStyle = '#3ed6c4';
            ctx.beginPath();
            ctx.arc(px, py, HW * 0.2, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (o.kind === 'fortress') {
          // Частокол кольцом, знамя и Вождь
          for (let i = 0; i < 18; i++) {
            const a = (i / 18) * Math.PI * 2;
            const sx = px + Math.cos(a) * HW * 0.62;
            const sy = py + Math.sin(a) * HH * 0.42 + HH * 0.1;
            if (Math.sin(a) > 0) continue;
            ctx.fillStyle = '#4a321f';
            ctx.fillRect(sx - 3, sy - HH * 0.32, 6, HH * 0.32);
            ctx.beginPath();
            ctx.moveTo(sx - 3, sy - HH * 0.32);
            ctx.lineTo(sx, sy - HH * 0.4);
            ctx.lineTo(sx + 3, sy - HH * 0.32);
            ctx.fill();
          }
          tent(ctx, px - HW * 0.35, py, HW * 0.7, '#6b3a26', '#4a2618');
          spr(`boss_${lvl}`, px + HW * 0.1, foot, HH * 1.3);
          for (let i = 0; i < 18; i++) {
            const a = (i / 18) * Math.PI * 2;
            if (Math.sin(a) <= 0) continue;
            const sx = px + Math.cos(a) * HW * 0.62;
            const sy = py + Math.sin(a) * HH * 0.42 + HH * 0.1;
            ctx.fillStyle = '#5a3d25';
            ctx.fillRect(sx - 3, sy - HH * 0.3, 6, HH * 0.3);
          }
          ctx.strokeStyle = '#ccc';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(px + HW * 0.5, py - HH * 0.1);
          ctx.lineTo(px + HW * 0.5, py - HH * 0.8);
          ctx.stroke();
          ctx.fillStyle = '#8b1a1a';
          ctx.fillRect(px + HW * 0.5, py - HH * 0.8, HW * 0.3, HH * 0.2);
        } else if (o.kind === 'squad') {
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.beginPath();
          ctx.ellipse(px, foot, HW * 0.28, HH * 0.08, 0, 0, Math.PI * 2);
          ctx.fill();
          spr(squadSprite(o, lvl), px - HW * 0.12, foot - 2, HH * 0.8);
          spr(`enemy_${(o.waves ?? 3) <= 4 ? 'infantry' : 'scout'}_${lvl}`, px + HW * 0.16, foot + 2, HH * 0.7);
        } else if (o.kind === 'chest') {
          const bw = HW * 0.34;
          const bh = HW * 0.22;
          const by = py + HH * 0.05;
          ctx.fillStyle = '#4b2f17';
          ctx.fillRect(px - bw / 2, by, bw, bh);
          ctx.fillStyle = '#6b4322';
          ctx.fillRect(px - bw / 2, by - bh * 0.35, bw, bh * 0.4);
          ctx.fillStyle = '#d9a441';
          ctx.fillRect(px - bw / 2, by - bh * 0.05, bw, 2.5);
          ctx.fillRect(px - 2.5, by - 2, 5, bh * 0.45);
          const glow = 0.35 + 0.25 * Math.sin(opts.time / 400 + o.x);
          ctx.fillStyle = `rgba(255,210,120,${glow * 0.3})`;
          ctx.beginPath();
          ctx.arc(px, by, HW * 0.3, 0, Math.PI * 2);
          ctx.fill();
        } else if (o.kind === 'shrine') {
          const done = st.done.includes(o.id);
          ctx.fillStyle = '#4a4752';
          ctx.beginPath();
          ctx.moveTo(px - HW * 0.16, foot);
          ctx.lineTo(px - HW * 0.09, foot - HH * 0.75);
          ctx.lineTo(px + HW * 0.11, foot - HH * 0.68);
          ctx.lineTo(px + HW * 0.17, foot);
          ctx.closePath();
          ctx.fill();
          if (!done) {
            const glow = 0.6 + 0.3 * Math.sin(opts.time / 300);
            ctx.fillStyle = `rgba(62,214,196,${glow})`;
            ctx.beginPath();
            ctx.arc(px, foot - HH * 0.42, HW * 0.07, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (o.kind === 'mine') {
          const ours = st.owned.includes(o.id);
          const res = o.income ? (Object.keys(o.income)[0] as ResKey) : 'gold';
          if (res === 'crystal') {
            const im = opts.extras?.get('crystal');
            if (im) {
              const w = HW * 0.55;
              ctx.drawImage(im, px - w / 2, foot - (im.height / im.width) * w, w, (im.height / im.width) * w);
            }
            const glow = 0.4 + 0.3 * Math.sin(opts.time / 350);
            ctx.fillStyle = `rgba(62,214,196,${glow * 0.35})`;
            ctx.beginPath();
            ctx.arc(px, foot - HH * 0.3, HW * 0.35, 0, Math.PI * 2);
            ctx.fill();
          } else hut(ctx, px, foot, HW * 0.9, res === 'gold' ? '#5a4632' : '#3d5a2c');
          ctx.strokeStyle = '#ccc';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(px + HW * 0.32, foot);
          ctx.lineTo(px + HW * 0.32, foot - HH * 0.75);
          ctx.stroke();
          ctx.fillStyle = ours ? '#3ed6c4' : '#9b1c1c';
          ctx.fillRect(px + HW * 0.32, foot - HH * 0.75, HW * 0.2, HH * 0.14);
          ctx.font = `${HW * 0.22}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(RES_ICONS[res], px - HW * 0.3, foot - HH * 0.05);
          if (!ours && o.waves) spr(`enemy_infantry_${lvl}`, px - HW * 0.05, foot + HH * 0.12, HH * 0.6);
        }
        // Сила врага — число волн на табличке
        if ((o.kind === 'squad' || o.kind === 'fortress' || (o.kind === 'mine' && !st.owned.includes(o.id))) && o.waves) {
          const label = o.army ? '⚑ Армия' : `⚔${o.waves}`;
          ctx.font = `bold ${HW * 0.2}px sans-serif`;
          ctx.textAlign = 'center';
          const bw = ctx.measureText(label).width + 8;
          const bx = px + HW * 0.12;
          const by = foot + 2;
          ctx.fillStyle = 'rgba(40,10,10,0.88)';
          ctx.fillRect(bx, by, bw, HW * 0.26);
          ctx.fillStyle = '#ffb4a0';
          ctx.fillText(label, bx + bw / 2, by + HW * 0.2);
        }
        // Тропа обучения: закрытый объект — замок над ним
        if (isLocked(st, o)) {
          ctx.fillStyle = 'rgba(10,10,16,0.8)';
          ctx.beginPath();
          ctx.arc(px - HW * 0.3, py - HH * 0.35, HW * 0.16, 0, Math.PI * 2);
          ctx.fill();
          ctx.font = `${HW * 0.18}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText('🔒', px - HW * 0.3, py - HH * 0.35 + HW * 0.065);
        }
      },
    });
  }

  // Герой
  const hx = wx(st.hero);
  const hy = wy(st.hero);
  items.push({
    y: hy + HH * 0.3,
    draw: () => {
      ctx.fillStyle = opts.selected ? 'rgba(62,214,196,0.5)' : 'rgba(62,214,196,0.25)';
      ctx.beginPath();
      ctx.ellipse(hx, hy + HH * 0.28, HW * 0.32, HH * 0.11, 0, 0, Math.PI * 2);
      ctx.fill();
      if (opts.selected) {
        ctx.strokeStyle = '#3ed6c4';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (!spr('enemy_heavy_6', hx, hy + HH * 0.3, HH * 0.95, 1)) {
        ctx.fillStyle = '#3ed6c4';
        ctx.beginPath();
        ctx.arc(hx, hy, HW * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      // Знамя экспедиции
      ctx.strokeStyle = '#ddd';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(hx - HW * 0.28, hy + HH * 0.25);
      ctx.lineTo(hx - HW * 0.28, hy - HH * 0.55);
      ctx.stroke();
      ctx.fillStyle = '#2f6f8f';
      ctx.fillRect(hx - HW * 0.28, hy - HH * 0.55, HW * 0.2, HH * 0.16);
    },
  });

  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.draw();

  // Путь
  if (opts.selected && opts.path) {
    let left = st.moves;
    for (let i = 0; i < opts.path.length; i++) {
      const p = opts.path[i];
      left -= stepCost(r, p);
      const ok = left >= 0;
      const last = i === opts.path.length - 1;
      ctx.fillStyle = ok ? 'rgba(130,235,150,0.95)' : 'rgba(220,120,110,0.85)';
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (last) {
        ctx.moveTo(wx(p) - 8, wy(p) - 8);
        ctx.lineTo(wx(p) + 8, wy(p) + 8);
        ctx.moveTo(wx(p) + 8, wy(p) - 8);
        ctx.lineTo(wx(p) - 8, wy(p) + 8);
        ctx.lineWidth = 5;
        ctx.strokeStyle = ok ? 'rgba(130,235,150,0.95)' : 'rgba(220,120,110,0.9)';
        ctx.stroke();
      } else {
        ctx.arc(wx(p), wy(p), 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }
  if (opts.target) {
    hexPath(ctx, wx(opts.target), wy(opts.target), HW - 3, HH - 3);
    ctx.strokeStyle = opts.selected && opts.path ? '#f4c06a' : 'rgba(244,192,106,0.7)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  // Туман: неразведанное — тьма с мягким краем
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (isSeen(st, r, x, y)) continue;
      const edge = hexNeighbours(x, y).some((n) => n.x >= 0 && n.y >= 0 && n.x < W && n.y < H && isSeen(st, r, n.x, n.y));
      hexPath(ctx, wx({ x, y }), wy({ x, y }), HW * (edge ? 1.0 : 1.08), HH * (edge ? 1.0 : 1.08));
      ctx.fillStyle = edge ? 'rgba(10,9,14,0.82)' : '#0b0a10';
      ctx.fill();
    }
}
