// Опытное гексовое поле (просьба Артура 2026-11-06, «как бой в Героях 3»): земля с дорогой и контурами гексов
// и небо над полем по биомам. Пока задников от художников нет, небо рисуется кодом; рисуется один раз и кэшируется.
import { CONFIG } from './config';
import { Point } from './maps';
import { centerX, centerY, cellPath, hexView } from './grid';
import { Tileset } from './tiles';

/** Детерминированный случайный ряд, чтобы задник не менялся от кадра к кадру */
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

interface SkyLook {
  top: string;
  horizon: string;
  far: string; // дальний хребет
  peak?: string; // снег на вершинах
  near: string; // ближние холмы
  front: string; // кромка у поля: лес, сухие деревья, скалы, шпили
  fog: string; // дымка над полем у горизонта
  frontKind: 'pines' | 'deadTrees' | 'rocks' | 'spires';
  extra?: 'smoke' | 'aurora' | 'volcano' | 'moon' | 'mist';
}

const LOOKS: Record<number, SkyLook> = {
  1: { top: '#1c2442', horizon: '#d58a5c', far: '#4d4a6c', peak: '#c9c3d6', near: '#2f3b2d', front: '#1a2417', fog: 'rgba(213, 150, 110, 0.32)', frontKind: 'pines', extra: 'smoke' },
  2: { top: '#0f1714', horizon: '#56705a', far: '#2c3a31', near: '#1d2820', front: '#0d130f', fog: 'rgba(120, 150, 125, 0.34)', frontKind: 'deadTrees', extra: 'mist' },
  3: { top: '#0b1830', horizon: '#7fb1d6', far: '#8aa7c4', peak: '#eef6ff', near: '#4d6683', front: '#2c3e57', fog: 'rgba(190, 220, 240, 0.3)', frontKind: 'rocks', extra: 'aurora' },
  4: { top: '#1a0505', horizon: '#c9461c', far: '#3a1512', near: '#28100d', front: '#160807', fog: 'rgba(200, 80, 40, 0.3)', frontKind: 'rocks', extra: 'volcano' },
  5: { top: '#090a1c', horizon: '#4d3c73', far: '#262447', near: '#18172f', front: '#0e0d20', fog: 'rgba(110, 90, 160, 0.3)', frontKind: 'spires', extra: 'moon' },
};

/** Ломаная хребта поперёк всего задника */
function ridge(g: CanvasRenderingContext2D, w: number, base: number, amp: number, step: number, rand: () => number, color: string, peak?: string) {
  const pts: Point[] = [];
  for (let x = -step; x <= w + step; x += step * (0.6 + rand() * 0.8)) pts.push({ x, y: base - amp * (0.25 + rand() * 0.75) });
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(-step, base + 200);
  for (const p of pts) g.lineTo(p.x, p.y);
  g.lineTo(w + step, base + 200);
  g.closePath();
  g.fill();
  if (!peak) return;
  // снежные шапки: верхняя треть каждой вершины
  g.fillStyle = peak;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    if (p.y > pts[i - 1].y || p.y > pts[i + 1].y) continue;
    const l = pts[i - 1];
    const r = pts[i + 1];
    const t = 0.28;
    g.beginPath();
    g.moveTo(p.x + (l.x - p.x) * t, p.y + (l.y - p.y) * t);
    g.lineTo(p.x, p.y);
    g.lineTo(p.x + (r.x - p.x) * t, p.y + (r.y - p.y) * t);
    g.lineTo(p.x + (r.x - p.x) * t * 0.5, p.y + (r.y - p.y) * t * 0.8);
    g.lineTo(p.x + (l.x - p.x) * t * 0.4, p.y + (l.y - p.y) * t * 0.9);
    g.closePath();
    g.fill();
  }
}

/** Кромка у самого поля: ряд силуэтов */
function front(g: CanvasRenderingContext2D, w: number, base: number, look: SkyLook, rand: () => number) {
  g.fillStyle = look.front;
  g.fillRect(0, base - 6, w, 40);
  for (let x = -10; x < w + 10; ) {
    const s = 0.7 + rand() * 0.6;
    if (look.frontKind === 'pines') {
      const h = 34 * s;
      g.beginPath();
      g.moveTo(x - 9 * s, base);
      g.lineTo(x, base - h);
      g.lineTo(x + 9 * s, base);
      g.closePath();
      g.fill();
      x += 9 + rand() * 10;
    } else if (look.frontKind === 'deadTrees') {
      const h = 30 * s;
      g.strokeStyle = look.front;
      g.lineWidth = 3 * s;
      g.beginPath();
      g.moveTo(x, base);
      g.lineTo(x + 2, base - h);
      g.moveTo(x + 1, base - h * 0.6);
      g.lineTo(x - 9 * s, base - h * 0.85);
      g.moveTo(x + 2, base - h * 0.75);
      g.lineTo(x + 10 * s, base - h);
      g.stroke();
      // кочки и могильные камни
      g.fillRect(x + 12, base - 9 * s, 6 * s, 9 * s);
      x += 24 + rand() * 30;
    } else if (look.frontKind === 'rocks') {
      const h = 18 * s;
      g.beginPath();
      g.moveTo(x - 14 * s, base);
      g.lineTo(x - 6 * s, base - h);
      g.lineTo(x + 3 * s, base - h * 1.2);
      g.lineTo(x + 14 * s, base);
      g.closePath();
      g.fill();
      x += 18 + rand() * 26;
    } else {
      const h = 46 * s * (rand() < 0.25 ? 1.6 : 1);
      g.fillRect(x - 4 * s, base - h * 0.75, 8 * s, h * 0.75);
      g.beginPath();
      g.moveTo(x - 6 * s, base - h * 0.75);
      g.lineTo(x, base - h);
      g.lineTo(x + 6 * s, base - h * 0.75);
      g.closePath();
      g.fill();
      x += 22 + rand() * 36;
    }
  }
}

/** Задники из конвейера графики (art-pipeline/gpt-backdrops.md): полоса у горизонта, вырезанная из картинки GPT
 *  (исходник — art/concepts/backdrops/), `horizon` — где в файле горизонт, доля высоты. Без задника небо рисуется кодом */
const BACKDROPS: Record<number, { file: string; horizon: number }> = {
  1: { file: 'backdrops/frontier.jpg', horizon: 260 / 265 },
  2: { file: 'backdrops/swamp.jpg', horizon: 260 / 265 },
  3: { file: 'backdrops/ice.jpg', horizon: 260 / 265 },
  4: { file: 'backdrops/scorched.jpg', horizon: 260 / 265 },
  5: { file: 'backdrops/citadel.jpg', horizon: 260 / 265 },
};
const backdropImgs = new Map<number, HTMLImageElement | null>();

/** Картинка задника биома, если она есть и уже загружена (загрузка начинается с первого вызова) */
export function backdropImage(level: number): HTMLImageElement | null {
  const def = BACKDROPS[level];
  if (!def) return null;
  if (!backdropImgs.has(level)) {
    backdropImgs.set(level, null);
    const img = new Image();
    img.onload = () => backdropImgs.set(level, img);
    img.onerror = () => setTimeout(() => backdropImgs.delete(level), 15000); // сбой — попробовать позже
    img.src = def.file;
  }
  return backdropImgs.get(level) ?? null;
}

/** Небо и даль над полем для биома карты; высота — полоса неба плюс запас, ширина — экран */
export function bakeHexSky(level: number, scale: number, img: HTMLImageElement | null = null): HTMLCanvasElement {
  const look = LOOKS[level] ?? LOOKS[1];
  const w = CONFIG.grid.totalWidth;
  const h = Math.ceil(hexView.sky()) + 2;
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(w * scale);
  cv.height = Math.ceil(h * scale);
  const g = cv.getContext('2d')!;
  g.scale(scale, scale);
  const rand = rng(level * 7919 + 13);
  const def = BACKDROPS[level];
  if (img && def) {
    // картинка во всю ширину, горизонт — по нижнему краю полосы
    const ih = (img.height * w) / img.width;
    g.drawImage(img, 0, h - 2 - def.horizon * ih, w, ih);
    return cv;
  }

  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, look.top);
  sky.addColorStop(1, look.horizon);
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);

  if (look.extra === 'moon') {
    const glow = g.createRadialGradient(w * 0.72, h * 0.32, 4, w * 0.72, h * 0.32, 70);
    glow.addColorStop(0, 'rgba(230, 220, 255, 0.55)');
    glow.addColorStop(1, 'rgba(230, 220, 255, 0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#e9e2ff';
    g.beginPath();
    g.arc(w * 0.72, h * 0.32, 18, 0, Math.PI * 2);
    g.fill();
  }
  // звёзды на тёмном верху
  g.fillStyle = 'rgba(255, 255, 255, 0.55)';
  for (let i = 0; i < 40; i++) g.fillRect(rand() * w, rand() * h * 0.45, 1.2, 1.2);
  if (look.extra === 'aurora') {
    for (let i = 0; i < 3; i++) {
      const y0 = h * (0.18 + i * 0.1);
      const a = g.createLinearGradient(0, y0 - 18, 0, y0 + 18);
      a.addColorStop(0, 'rgba(90, 255, 200, 0)');
      a.addColorStop(0.5, `rgba(${i === 1 ? '140, 120, 255' : '90, 255, 200'}, 0.22)`);
      a.addColorStop(1, 'rgba(90, 255, 200, 0)');
      g.fillStyle = a;
      g.beginPath();
      g.moveTo(0, y0);
      for (let x = 0; x <= w; x += 32) g.lineTo(x, y0 + Math.sin(x / 90 + i * 2) * 10 - 16);
      for (let x = w; x >= 0; x -= 32) g.lineTo(x, y0 + Math.sin(x / 90 + i * 2) * 10 + 16);
      g.closePath();
      g.fill();
    }
  }

  ridge(g, w, h - 14, h * 0.55, 70, rand, look.far, look.peak);
  if (look.extra === 'volcano') {
    const vx = w * 0.3;
    const base = h - 10;
    g.fillStyle = '#2a0d0a';
    g.beginPath();
    g.moveTo(vx - 130, base);
    g.lineTo(vx - 22, base - h * 0.72);
    g.lineTo(vx + 22, base - h * 0.72);
    g.lineTo(vx + 130, base);
    g.closePath();
    g.fill();
    const lava = g.createRadialGradient(vx, base - h * 0.72, 2, vx, base - h * 0.72, 60);
    lava.addColorStop(0, 'rgba(255, 170, 60, 0.9)');
    lava.addColorStop(1, 'rgba(255, 90, 30, 0)');
    g.fillStyle = lava;
    g.fillRect(vx - 60, base - h * 0.72 - 60, 120, 120);
    g.strokeStyle = 'rgba(255, 120, 40, 0.75)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(vx - 6, base - h * 0.72);
    g.quadraticCurveTo(vx - 20, base - h * 0.4, vx - 50, base - 6);
    g.stroke();
  }
  ridge(g, w, h - 6, h * 0.25, 46, rand, look.near);
  if (look.extra === 'smoke') {
    // дым лагеря людей за лесом
    for (const sx of [w * 0.62, w * 0.66]) {
      for (let i = 0; i < 7; i++) {
        g.fillStyle = `rgba(190, 180, 175, ${0.16 - i * 0.018})`;
        g.beginPath();
        g.arc(sx + i * 7 + Math.sin(i) * 4, h - 26 - i * 11, 6 + i * 2.2, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  front(g, w, h - 2, look, rand);
  if (look.extra === 'mist') {
    const m = g.createLinearGradient(0, h * 0.5, 0, h);
    m.addColorStop(0, 'rgba(150, 180, 155, 0)');
    m.addColorStop(1, 'rgba(150, 180, 155, 0.35)');
    g.fillStyle = m;
    g.fillRect(0, 0, w, h);
  }
  return cv;
}

/** Земля гексового поля в наземных px (× scale): трава, дорога полосой, дымка у горизонта (контуры гексов рисует движок, пока башня в руке) */
export function bakeHexGround(
  level: number,
  paths: Point[][],
  castle: Point,
  inward: (e: Point) => Point,
  tiles: Tileset | null,
  scale: number
): HTMLCanvasElement {
  const look = LOOKS[level] ?? LOOKS[1];
  const palette = CONFIG.palettes[level - 1] ?? CONFIG.palettes[0];
  const cs = CONFIG.grid.cellSize;
  const w = hexView.groundW();
  const h = hexView.groundH();
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(w * scale);
  cv.height = Math.ceil(h * scale);
  const g = cv.getContext('2d')!;
  g.scale(scale, scale);

  const pattern = (img: HTMLImageElement | undefined, size: number): CanvasPattern | string | null => {
    if (!img) return null;
    const p = g.createPattern(img, 'repeat');
    if (!p) return null;
    p.setTransform(new DOMMatrix().scale(size / img.width));
    return p;
  };
  g.fillStyle = pattern(tiles?.get('grass'), cs * 1.6) ?? palette.ground;
  g.fillRect(0, 0, w, h);

  // Дорога полосой по центрам клеток: от края поля до артефакта
  const lines: Point[][] = paths.map((path) => {
    const pts = path.map((c) => ({ x: centerX(c), y: centerY(c) }));
    const d = inward(path[0]);
    pts.unshift({ x: pts[0].x - d.x * cs, y: pts[0].y - d.y * cs });
    pts.push({ x: centerX(castle), y: centerY(castle) });
    return pts;
  });
  const stroke = (style: string | CanvasPattern, width: number, filter = 'none') => {
    g.save();
    g.filter = filter;
    g.strokeStyle = style;
    g.lineWidth = width;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    for (const pts of lines) {
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        const m = { x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 };
        g.quadraticCurveTo(pts[i].x, pts[i].y, m.x, m.y);
      }
      const last = pts[pts.length - 1];
      g.lineTo(last.x, last.y);
      g.stroke();
    }
    g.restore();
  };
  stroke('rgba(0, 0, 0, 0.4)', cs * 0.98, 'blur(5px)');
  stroke(pattern(tiles?.get('dirt'), cs * 1.6) ?? palette.road, cs * 0.76, 'blur(1.2px)');
  stroke('rgba(0, 0, 0, 0.12)', cs * 0.3, 'blur(6px)'); // колея посередине

  // Дымка у горизонта и тень по краям
  const fog = g.createLinearGradient(0, 0, 0, h * 0.35);
  fog.addColorStop(0, look.fog);
  fog.addColorStop(1, 'rgba(0, 0, 0, 0)');
  g.fillStyle = fog;
  g.fillRect(0, 0, w, h);
  const vig = g.createRadialGradient(w / 2, h * 0.55, h * 0.45, w / 2, h * 0.55, w * 0.62);
  vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vig.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
  g.fillStyle = vig;
  g.fillRect(0, 0, w, h);
  return cv;
}
