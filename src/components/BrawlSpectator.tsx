/**
 * Чужое поле в «Потасовке» и дуэли (просьба Артура 2026-11-09: «как в автошахматах»): доска соперника на весь
 * экран поля, тем же отрисовщиком, что и ваше поле — гексы, задник, фигуры башен и врагов. Второй движок
 * только рисует (`startSpectate`), башни и враги берутся из снимков (src/fieldView.ts) и плавно едут.
 * Ваш бой идёт под ним; сверху полоса соперника и кнопка «К моему полю», список игроков остаётся над доской.
 */

import React from 'react';
import { GameEngine } from '../game/engine';
import { MAPS } from '../game/maps';
import { BotWatchInfo, FieldView, botFieldView } from '../fieldView';
import type { BrawlSeatView } from '../brawl';

export function BrawlSpectator({ seat, view: netView, botInfo, level, seed, onClose }: { seat: BrawlSeatView; view: FieldView | null; botInfo?: () => BotWatchInfo | null; level: number; seed?: number; onClose: () => void }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  const engineRef = React.useRef<GameEngine | null>(null);
  const [view, setView] = React.useState<FieldView | null>(null);
  const isBot = seat.kind === 'bot';

  // Свой движок только на показ: на той же карте и расе соперника
  React.useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const eng = new GameEngine();
    eng.setCanvas(cv);
    eng.startSpectate(level, seed ?? null, seat.race);
    engineRef.current = eng;
    return () => {
      eng.stopLoop();
      engineRef.current = null;
    };
  }, [level, seed, seat.race, seat.id]);

  // Бот: поле собирается из его данных, четыре раза в секунду
  React.useEffect(() => {
    if (!isBot || !botInfo) return;
    const map = MAPS[level - 1];
    const tick = () => {
      const info = botInfo();
      setView(info ? botFieldView(info, seed && engineRef.current ? engineRef.current.mapForView() : map) : null);
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [isBot, botInfo, level, seed]);

  const shown = isBot ? view : netView;
  React.useEffect(() => {
    if (shown) engineRef.current?.spectateApply(shown);
  }, [shown]);

  return (
    <div className="absolute inset-0 z-40 bg-black [container-type:inline-size]">
      <canvas ref={ref} className="w-full h-full block touch-none select-none" style={{ imageRendering: 'pixelated' }} />
      <div className="absolute left-1/2 -translate-x-1/2 top-[calc(100cqw/14*0.06)] flex items-center gap-2 rounded-md bg-black/55 border border-white/15 backdrop-blur-[2px] px-3 py-1.5 text-white/90 text-[clamp(11px,2.1cqw,16px)] leading-none select-none">
        <span className="font-black text-sky-200 whitespace-nowrap">👁 {seat.name}</span>
        <span className="tabular-nums text-red-300 whitespace-nowrap">{seat.out ? `${seat.place}-е место` : `артефакт ${shown?.lives ?? seat.lives}`}</span>
        {shown && <span className="tabular-nums text-stone-400 whitespace-nowrap">волна {shown.wave}</span>}
        <button type="button" onClick={onClose} className="ml-1 px-2 py-1 rounded bg-amber-500/90 hover:bg-amber-400 text-stone-950 font-bold cursor-pointer whitespace-nowrap">
          ← К моему полю
        </button>
      </div>
      {!shown && <div className="absolute inset-x-0 bottom-3 text-center text-stone-300 text-[clamp(10px,1.8cqw,14px)]">Ждём поле игрока…</div>}
      {isBot && <div className="absolute inset-x-0 bottom-1 text-center text-stone-500 text-[clamp(9px,1.5cqw,12px)] pointer-events-none">Бот играет числами: поле нарисовано по его силе и волне</div>}
    </div>
  );
}
