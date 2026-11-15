// Картинки Draw Things для боя и карты (2026-11-15): public/gfx/<имя>.webp — снаряды, эффекты, статусы, объекты карты, Рен, врата.
// Ленивая загрузка: пока картинки нет (или она не загрузилась), вызывающий рисует прежнее кодом.
const cache = new Map<string, HTMLImageElement | null>();

export function gfx(name: string): HTMLImageElement | null {
  const hit = cache.get(name);
  if (hit !== undefined) return hit && hit.complete && hit.naturalWidth > 0 ? hit : null;
  if (typeof Image === 'undefined' || typeof document === 'undefined') return null;
  cache.set(name, null);
  const img = new Image();
  img.onload = () => cache.set(name, img);
  img.src = new URL(`gfx/${name}.webp`, document.baseURI).href;
  return null;
}

/** Картинка, нарисованная «остриём вверх-вправо» (снаряды), поворачивается по направлению полёта. */
export function drawAimed(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, dx: number, dy: number, size: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.atan2(dy, dx) + Math.PI / 4);
  ctx.drawImage(img, -size / 2, -size / 2, size, size);
  ctx.restore();
}
