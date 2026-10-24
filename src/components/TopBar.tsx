/**
 * HUD block at the top of the side column for «Тёмный рубеж»
 * Gold, lives, wave N/12 in one line; speed, sound and pause buttons below.
 */

import React from 'react';
import { GoldIcon, HeartCastleIcon } from './Icons';

interface TopBarProps {
  gold: number;
  lives: number;
  wave: number;
  maxWaves: number;
  speed: number;
  isPaused: boolean;
  isMuted: boolean;
  onTogglePause: () => void;
  onToggleSpeed: () => void;
  onToggleMute: () => void;
}

export function TopBar({
  gold,
  lives,
  wave,
  maxWaves,
  speed,
  isPaused,
  isMuted,
  onTogglePause,
  onToggleSpeed,
  onToggleMute,
}: TopBarProps) {
  const btn =
    'h-[var(--h-btn)] min-w-[40px] flex-1 flex items-center justify-center text-[length:var(--fs-lg)] font-bold rounded border transition-colors cursor-pointer';
  return (
    <header className="w-full px-1.5 pt-1.5 flex flex-col gap-1 select-none shrink-0">
      {/* Stats: gold, lives, wave */}
      <div className="h-[var(--h-stat)] flex items-center justify-between text-[length:var(--fs-lg)] tabular-nums">
        <span className="flex items-center gap-1 font-bold text-amber-300" title="Золото">
          <GoldIcon size="1.15em" />
          {gold}
        </span>
        <span className="flex items-center gap-1 font-bold text-red-400" title="Жизни замка">
          <HeartCastleIcon size="1.15em" />
          {lives}
        </span>
        <span className="font-semibold text-stone-400" title="Волна">
          Волна <span className="text-amber-200">{Math.min(wave, maxWaves)}/{maxWaves}</span>
        </span>
      </div>

      {/* Controls: speed, sound, pause */}
      <div className="flex gap-1">
        <button
          type="button"
          onClick={onToggleSpeed}
          title="Скорость игры (×0,5 / ×1 / ×1,5 / ×3)"
          className={`${btn} ${
            speed !== 1
              ? 'bg-amber-600/30 text-amber-300 border-amber-500/50'
              : 'bg-[#221f2d] text-stone-300 border-[#373347] hover:bg-[#2c283a]'
          }`}
        >
          ×{String(speed).replace('.', ',')}
        </button>
        <button
          type="button"
          onClick={onToggleMute}
          title={isMuted ? 'Включить звук' : 'Выключить звук'}
          className={`${btn} bg-[#221f2d] text-stone-300 border-[#373347] hover:bg-[#2c283a]`}
        >
          {isMuted ? '🔇' : '🔊'}
        </button>
        <button
          type="button"
          onClick={onTogglePause}
          title="Пауза (P)"
          className={`${btn} ${
            isPaused
              ? 'bg-red-950/60 text-red-300 border-red-700/60'
              : 'bg-[#221f2d] text-stone-200 border-[#373347] hover:bg-[#2c283a]'
          }`}
        >
          {isPaused ? '▶' : '❚❚'}
        </button>
      </div>
    </header>
  );
}
