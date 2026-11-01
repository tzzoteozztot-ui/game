/**
 * «Потасовка»: the eight players' artifact HP, live, in the top right corner of the field.
 * The current opponent is marked ⚔, the ghost (the fallen field that plays the odd one out) 👻.
 * Only the header takes taps (it folds the list); the cells under it stay playable.
 * Same cell unit as FieldHud: one cell is 100cqw / CONFIG.grid.cols.
 */

import React from 'react';
import { CONFIG } from '../game/config';
import type { BrawlSnapshot } from '../brawl';

const CELL = `calc(100cqw / ${CONFIG.grid.cols})`;

export function BrawlBoard({ snap }: { snap: BrawlSnapshot }) {
  const [open, setOpen] = React.useState(true);
  const max = CONFIG.lives.start;
  return (
    <div className="absolute inset-0 pointer-events-none [container-type:inline-size]">
      <div
        className="absolute right-[calc(var(--cell)*0.06)] top-[calc(var(--cell)*0.06)] rounded-md bg-black/45 border border-white/10 backdrop-blur-[2px] text-white/90 tabular-nums leading-none select-none [text-shadow:0_1px_2px_rgba(0,0,0,0.8)] overflow-hidden"
        style={{ '--cell': CELL, width: `calc(${CELL} * 3)`, fontSize: `clamp(9px, calc(${CELL} * 0.22), 14px)` } as React.CSSProperties}
      >
        <button
          type="button"
          onClick={() => setOpen(!open)}
          title={open ? 'Свернуть' : 'Показать игроков'}
          className="pointer-events-auto w-full flex items-center justify-between gap-1 px-[0.5em] py-[0.35em] font-bold text-amber-300 cursor-pointer hover:bg-white/5"
        >
          <span>Игроки {snap.alive}/{snap.seats.length}</span>
          <span className="text-stone-400">{open ? '▴' : '▾'}</span>
        </button>
        {open && (
          <ul className="flex flex-col gap-[0.25em] px-[0.5em] pb-[0.4em]">
            {snap.seats.map((s) => {
              const isOpp = s.id === snap.opponentId;
              const isGhost = s.id === snap.ghostId;
              const color = CONFIG.palettes[CONFIG.races[s.race].faction - 1].enemies;
              return (
                <li
                  key={s.id}
                  className={`flex flex-col gap-[0.15em] ${s.out ? 'opacity-45' : ''} ${isOpp ? 'text-red-300' : s.kind === 'you' ? 'text-amber-200' : ''}`}
                  title={`${s.name} — ${CONFIG.races[s.race].name}`}
                >
                  <div className="flex items-center gap-[0.3em]">
                    <span className="inline-block w-[0.6em] h-[0.6em] rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className={`flex-1 min-w-0 truncate ${s.kind === 'you' ? 'font-black' : 'font-semibold'}`}>
                      {isOpp && '⚔ '}
                      {isGhost && '👻 '}
                      {s.name}
                    </span>
                    <span className="font-bold">{s.out ? `${s.place}-е` : s.lives}</span>
                  </div>
                  {!s.out && (
                    <div className="h-[0.25em] rounded-full bg-white/10 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-[width] duration-500 ${s.lives > max * 0.5 ? 'bg-emerald-400' : s.lives > max * 0.25 ? 'bg-amber-400' : 'bg-red-500'}`}
                        style={{ width: `${Math.max(0, Math.min(100, (s.lives / max) * 100))}%` }}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
