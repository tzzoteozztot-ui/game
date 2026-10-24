/**
 * Top HUD Bar for «Тёмный рубеж»
 * Displays Gold, Lives, Wave N/12, Speed toggle and Pause.
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
  return (
    <header className="h-10 px-2 sm:px-3 bg-[#15131c]/95 border-b border-[#2d2938] flex items-center justify-between select-none z-20 shrink-0">
      {/* Left: Stats */}
      <div className="flex items-center gap-4 sm:gap-6">
        {/* Gold */}
        <div className="flex items-center gap-1.5" title="Золото">
          <GoldIcon size={18} />
          <span className="font-bold text-amber-300 text-sm sm:text-base tabular-nums">
            {gold}
          </span>
        </div>

        {/* Lives */}
        <div className="flex items-center gap-1.5" title="Жизни замка">
          <HeartCastleIcon size={18} />
          <span className="font-bold text-red-400 text-sm sm:text-base tabular-nums">
            {lives} / 20
          </span>
        </div>

        {/* Wave */}
        <div className="flex items-center gap-1 bg-[#221f2d] px-2.5 py-0.5 rounded text-xs sm:text-sm font-semibold border border-[#373347]">
          <span className="text-stone-400">Волна</span>
          <span className="text-amber-200 tabular-nums">
            {Math.min(wave, maxWaves)} / {maxWaves}
          </span>
        </div>
      </div>

      {/* Right: Controls */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Speed button */}
        <button
          type="button"
          onClick={onToggleSpeed}
          title="Скорость игры (×1 / ×2)"
          className={`px-2.5 py-1 min-h-[36px] min-w-[40px] text-xs font-bold rounded border transition-colors cursor-pointer ${
            speed === 2
              ? 'bg-amber-600/30 text-amber-300 border-amber-500/50'
              : 'bg-[#221f2d] text-stone-300 border-[#373347] hover:bg-[#2c283a]'
          }`}
        >
          ×{speed}
        </button>

        {/* Audio Mute toggle */}
        <button
          type="button"
          onClick={onToggleMute}
          title={isMuted ? 'Включить звук' : 'Выключить звук'}
          className="p-1.5 min-h-[36px] min-w-[40px] flex items-center justify-center text-xs font-semibold rounded bg-[#221f2d] text-stone-300 border border-[#373347] hover:bg-[#2c283a] cursor-pointer"
        >
          {isMuted ? '🔇' : '🔊'}
        </button>

        {/* Pause button */}
        <button
          type="button"
          onClick={onTogglePause}
          title="Пауза (P)"
          className={`px-3 py-1 min-h-[36px] min-w-[40px] text-xs font-bold rounded border transition-colors cursor-pointer ${
            isPaused
              ? 'bg-red-950/60 text-red-300 border-red-700/60 animate-pulse'
              : 'bg-[#221f2d] text-stone-200 border-[#373347] hover:bg-[#2c283a]'
          }`}
        >
          {isPaused ? 'Пауза ||' : 'Пауза'}
        </button>
      </div>
    </header>
  );
}
