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
  supply?: { power: number; mult: number; next: number } | null; // endless mode: the table's value and the price multiplier
  opponent?: { lives: number; wave: number; income: number } | null; // duel: the opponent's last known state
  opponentArmy?: string; // duel: the faction the opponent sends
}

export function TopBar({
  gold,
  lives,
  wave,
  maxWaves,
  endless,
  supply,
  opponent,
  opponentArmy,
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
      {supply && (
        <div
          className="h-[var(--h-line)] flex items-center justify-between gap-1 text-[length:var(--fs-sm)] tabular-nums text-stone-400"
          title="Сила стола: башня Ур.1 весит 1, Ур.2 — 3, Ур.3 — 9, связка 1 (тройная 3). Выше порога покупка башен в лавке дорожает, продажа нет."
        >
          <span>
            Стол <span className="text-amber-200 font-bold">{supply.power}</span>
            <span className="text-stone-500"> / {supply.next}</span>
          </span>
          <span className={supply.mult > 1 ? 'font-bold text-orange-300' : ''}>
            цены ×{supply.mult.toFixed(2).replace('.', ',')}
          </span>
        </div>
      )}
      {opponent !== undefined && (
        <div className="h-[var(--h-line)] flex items-center justify-between gap-1 text-[length:var(--fs-sm)] tabular-nums text-stone-400" title="Соперник">
          <span className="truncate min-w-0">Соперник{opponentArmy && ` · ${opponentArmy}`}</span>
          {opponent ? (
            <span className="flex items-center gap-1.5 shrink-0">
              <span className="flex items-center gap-0.5 font-bold text-red-300" title="Жизни соперника">
                <HeartCastleIcon size="1em" />
                {opponent.lives}
              </span>
              <span title="Волна соперника">
                в. <span className="text-amber-200">{opponent.wave}</span>
              </span>
              <span className="text-amber-300" title="Доход соперника за раунд">
                +{opponent.income}
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
