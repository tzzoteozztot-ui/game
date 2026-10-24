/**
 * Sprites for «Тёмный рубеж»: loading public/sprites/ and preparing canvas variants.
 * Each variant (faction tint, hit flash) is baked once into its own canvas.
 * Until loading finishes (or if it fails)
 * get() returns null and the engine draws its fallback shapes.
 */

export interface SpriteMeta {
  file: string;
  w: number;
  h: number;
  drawH: number; // height on the field, px (cell = 64)
  anchorX: number; // 0..1 across the sprite
  anchorY: number; // 0..1 down the sprite (1 = feet)
  facing: number; // 1 = looks right, -1 = looks left
}

export interface PreparedSprite {
  canvas: HTMLCanvasElement;
  meta: SpriteMeta;
  scale: number; // sprite px per field px
}

export type SpriteVariant = 'normal' | 'flash' | 'shield';

const TINT_STRENGTH = 0.26;

class SpriteStore {
  private images = new Map<string, { img: HTMLImageElement; meta: SpriteMeta }>();
  private cache = new Map<string, PreparedSprite>();
  private loading: Promise<void> | null = null;

  load(): Promise<void> {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      try {
        const base = new URL('sprites/', document.baseURI);
        const res = await fetch(new URL('sprites.json', base));
        if (!res.ok) return;
        const metas = (await res.json()) as Record<string, SpriteMeta>;
        await Promise.all(
          Object.entries(metas).map(
            ([name, meta]) =>
              new Promise<void>((resolve) => {
                const img = new Image();
                img.onload = () => {
                  this.images.set(name, { img, meta });
                  resolve();
                };
                // A missing file keeps the fallback shape for that figure only
                img.onerror = () => resolve();
                img.src = new URL(meta.file, base).href;
              })
          )
        );
      } catch {
        // offline without the folder: fallback shapes stay
      }
    })();
    return this.loading;
  }

  get(name: string, tint: string | null = null, variant: SpriteVariant = 'normal'): PreparedSprite | null {
    const key = `${name}|${tint ?? ''}|${variant}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const src = this.images.get(name);
    if (!src) return null;

    const { img, meta } = src;
    const scale = meta.h / meta.drawH;

    // Figure with tint / flash applied
    const canvas = document.createElement('canvas');
    canvas.width = meta.w;
    canvas.height = meta.h;
    const bctx = canvas.getContext('2d')!;
    bctx.drawImage(img, 0, 0, meta.w, meta.h);
    bctx.globalCompositeOperation = 'source-atop';
    if (tint) {
      bctx.globalAlpha = TINT_STRENGTH;
      bctx.fillStyle = tint;
      bctx.fillRect(0, 0, meta.w, meta.h);
    }
    if (variant !== 'normal') {
      bctx.globalAlpha = variant === 'flash' ? 0.75 : 0.5;
      bctx.fillStyle = variant === 'flash' ? '#ffffff' : '#3ed6c4';
      bctx.fillRect(0, 0, meta.w, meta.h);
    }

    const prepared = { canvas, meta, scale };
    this.cache.set(key, prepared);
    return prepared;
  }
}

export const sprites = new SpriteStore();

/**
 * Draws a prepared sprite with its feet at (footX, footY), facing `dir` (1 right, -1 left).
 * `height` overrides the field height from sprites.json.
 */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  s: PreparedSprite,
  footX: number,
  footY: number,
  dir: number,
  height?: number
) {
  const k = height ? height / s.meta.drawH : 1;
  const w = (s.canvas.width / s.scale) * k;
  const h = (s.canvas.height / s.scale) * k;
  const ax = ((s.meta.anchorX * s.meta.w) / s.scale) * k;
  const ay = ((s.meta.anchorY * s.meta.h) / s.scale) * k;
  const flip = dir * s.meta.facing < 0;
  ctx.save();
  ctx.translate(footX, footY);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(s.canvas, -ax, -ay, w, h);
  ctx.restore();
}

