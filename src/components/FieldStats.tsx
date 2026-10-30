/**
 * Gold, lives and wave N/12 for «Тёмный рубеж»: a semi-transparent plate in the bottom left corner of the field.
 * Endless mode and duel add the table's value and the opponent's line. It takes no taps: the cells under it stay playable.
 * App puts it inside an inline-size container as wide as the field: one cell is 100cqw / CONFIG.grid.cols.
 */

import React from 'react';
import { CONFIG } from '../game/config';
import { GoldIcon, HeartCastleIcon } from './Icons';

interface FieldStatsProps {
  gold: number;
  lives: number;
  wave: number;
  maxWaves: number;
  endless: boolean;
  supply?: { power: number; mult: number; next: number } | null; // endless mode: the table's value and the price multiplier
  opponent?: { lives: number; wave: number; income: number } | null; // duel: the opponent's last known state
  opponentArmy?: string; // duel: the faction the opponent sends
}

const CELL = `calc(100cqw / ${CONFIG.grid.cols})`;

export function FieldStats({ gold, lives, wave, maxWaves, endless, supply, opponent, opponentArmy }: FieldStatsProps) {
  return (
    <div
      className="pointer-events-none flex flex-col gap-[2px] rounded-md bg-black/45 border border-white/10 backdrop-blur-[2px] px-[calc(var(--cell)*0.14)] py-[calc(var(--cell)*0.06)] text-white/90 tabular-nums leading-none select-none [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]"
      style={{ '--cell': CELL, fontSize: `clamp(11px, calc(${CELL} * 0.3), 19px)` } as React.CSSProperties}
    >
      <div className="flex items-center gap-[0.7em]">
        <span className="flex items-center gap-1 font-bold text-amber-300" title="Золото">
          <GoldIcon size="1.15em" />
          {gold}
        </span>
        <span className="flex items-center gap-1 font-bold text-red-400" title="Жизни замка">
          <HeartCastleIcon size="1.15em" />
          {lives}
        </span>
        <span className="font-semibold text-stone-300" title="Волна">
          Волна <span className="text-amber-200">{endless ? wave : `${Math.min(wave, maxWaves)}/${maxWaves}`}</span>
        </span>
      </div>
      {supply && (
        <div className="flex items-center gap-[0.7em] text-[0.85em] text-stone-300">
          <span>
            Стол <span className="text-amber-200 font-bold">{supply.power}</span>
            <span className="text-stone-400"> / {supply.next}</span>
          </span>
          <span className={supply.mult > 1 ? 'font-bold text-orange-300' : ''}>цены ×{supply.mult.toFixed(2).replace('.', ',')}</span>
        </div>
      )}
      {opponent !== undefined && (
        <div className="flex items-center gap-[0.6em] text-[0.85em] text-stone-300">
          <span className="truncate max-w-[12em]">Соперник{opponentArmy && ` · ${opponentArmy}`}</span>
          {opponent ? (
            <>
              <span className="flex items-center gap-0.5 font-bold text-red-300">
                <HeartCastleIcon size="1em" />
                {opponent.lives}
              </span>
              <span>
                в. <span className="text-amber-200">{opponent.wave}</span>
              </span>
              <span className="text-amber-300">+{opponent.income}</span>
            </>
          ) : (
            <span>ждём связи…</span>
          )}
        </div>
      )}
    </div>
  );
}
