/**
 * HUD line at the top of the side column for «Тёмный рубеж»: gold, lives, wave N/12.
 * Speed, sound, full screen and pause are over the field (FieldHud).
 */

import React from 'react';
import { GoldIcon, HeartCastleIcon } from './Icons';

interface TopBarProps {
  gold: number;
  lives: number;
  wave: number;
  maxWaves: number;
  endless: boolean;
  opponent?: { lives: number; wave: number } | null; // duel: the opponent's last known state
}

export function TopBar({
  gold,
  lives,
  wave,
  maxWaves,
  endless,
  opponent,
}: TopBarProps) {
  return (
    <header className="w-full px-1.5 pt-1.5 select-none shrink-0">
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
          Волна <span className="text-amber-200">{endless ? wave : `${Math.min(wave, maxWaves)}/${maxWaves}`}</span>
        </span>
      </div>
      {opponent !== undefined && (
        <div className="h-[var(--h-line)] flex items-center justify-between text-[length:var(--fs-sm)] tabular-nums text-stone-400" title="Соперник">
          <span>Соперник</span>
          {opponent ? (
            <span className="flex items-center gap-2">
              <span className="flex items-center gap-0.5 font-bold text-red-300">
                <HeartCastleIcon size="1em" />
                {opponent.lives}
              </span>
              <span>
                волна <span className="text-amber-200">{opponent.wave}</span>
              </span>
            </span>
          ) : (
            <span>ждём связи…</span>
          )}
        </div>
      )}
    </header>
  );
}
