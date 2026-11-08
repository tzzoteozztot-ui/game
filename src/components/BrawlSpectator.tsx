/**
 * «Потасовка»: схема чужого поля, только чтение (просьба Артура 2026-11-08). Окно над полем: свой бой
 * идёт под ним, касания берёт только окно. Снимок приходит раз в 0,5 с (src/fieldView.ts).
 */

import React from 'react';
import { CONFIG } from '../game/config';
import { MAPS } from '../game/maps';
import { generateMap } from '../game/mapgen';
import { sprites } from '../game/sprites';
import { FieldView, drawFieldView } from '../fieldView';
import type { BrawlSeatView } from '../brawl';

export function BrawlSpectator({ seat, view, level, seed, onClose }: { seat: BrawlSeatView; view: FieldView | null; level: number; seed?: number; onClose: () => void }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  const map = React.useMemo(() => (seed ? generateMap(level, seed) : MAPS[level - 1]), [level, seed]);
  const [spritesReady, setSpritesReady] = React.useState(0);
  React.useEffect(() => {
    sprites.load().then(() => setSpritesReady(1));
  }, []);
  React.useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawFieldView(ctx, w, h, view, map, level);
  }, [view, map, level, spritesReady]);

  return (
    <div className="absolute inset-0 flex items-center justify-center p-[2%] pointer-events-none">
      <div className="pointer-events-auto flex flex-col rounded-lg bg-black/80 border border-white/15 backdrop-blur-sm text-white/90 shadow-xl" style={{ width: 'min(100%, 62vh * 1.75, 640px)' }}>
        <div className="flex items-center gap-2 px-3 py-1.5 text-[clamp(11px,1.6vh,15px)] border-b border-white/10">
          <span className="font-bold text-sky-200 truncate">👁 {seat.name}</span>
          <span className="text-stone-400 truncate">{CONFIG.races[seat.race].name}</span>
          <span className="ml-auto tabular-nums text-stone-300">{seat.out ? `${seat.place}-е место` : `артефакт ${seat.lives}`}</span>
          {view && <span className="tabular-nums text-stone-400">волна {view.wave}</span>}
          <button type="button" onClick={onClose} className="px-2 -mr-1 text-stone-300 hover:text-white cursor-pointer" title="Закрыть (Esc)">
            ✕
          </button>
        </div>
        <canvas ref={ref} className="w-full block" style={{ aspectRatio: '14 / 8' }} />
        {!view && <div className="px-3 py-1 text-center text-stone-400 text-[clamp(10px,1.4vh,13px)]">Ждём поле игрока…</div>}
      </div>
    </div>
  );
}
