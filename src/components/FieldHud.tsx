/**
 * Semi-transparent buttons over the field for «Тёмный рубеж»
 * Wave button and the auto-start switch over the 4 top-left cells, kept free of road and towers (isHudCell in maps.ts),
 * so nothing is covered. Speed, sound, full screen and pause are in the side column (GameControls).
 * The overlay is an inline-size container: one cell is 100cqw / CONFIG.grid.cols.
 */

import React from 'react';
import { CONFIG } from '../game/config';
import { HUD_LEFT_COLS } from '../game/maps';

interface FieldHudProps {
  isSpawning: boolean;
  isWaveActive: boolean;
  allWavesLaunched: boolean;
  duel: boolean; // waves follow the shared clock, the speed is fixed
  waveCountdown: number | null;
  earlyStartBonus: number;
  onStartWave: () => void;
  autoStart: boolean;
  onToggleAutoStart: () => void;
}

const CELL = `calc(100cqw / ${CONFIG.grid.cols})`;

const glass =
  'pointer-events-auto rounded-[calc(var(--cell)*0.18)] border backdrop-blur-[2px] flex items-center justify-center leading-none transition-colors cursor-pointer select-none';
const plain = 'bg-black/35 hover:bg-black/55 border-white/15 text-white/90';

export function FieldHud({
  isSpawning,
  isWaveActive,
  allWavesLaunched,
  duel,
  waveCountdown,
  earlyStartBonus,
  onStartWave,
  autoStart,
  onToggleAutoStart,
}: FieldHudProps) {
  const waveOff = isSpawning || allWavesLaunched || duel;
  const iconBtn = `${glass} w-[calc(var(--cell)-var(--gap))] h-[calc(var(--cell)-var(--gap))] font-bold`;

  return (
    <div className="absolute inset-0 pointer-events-none [container-type:inline-size]">
      <div
        className="absolute inset-x-0 top-0 flex"
        style={{ '--cell': CELL, '--gap': `calc(${CELL} * 0.12)`, height: CELL } as React.CSSProperties}
      >
        {/* Wave: 3 cells and the auto-start switch (1 cell) at the top left */}
        <div className="h-full flex items-center justify-center" style={{ width: `calc(var(--cell) * ${HUD_LEFT_COLS - (duel ? 0 : 1)})` }}>
          <button
            type="button"
            onClick={onStartWave}
            disabled={waveOff}
            title={duel ? 'В дуэли волны выходят у обоих разом' : 'Начать волну (Пробел)'}
            className={`${glass} w-[calc(100%-var(--gap))] h-[calc(100%-var(--gap))] px-[calc(var(--cell)*0.12)] flex-col gap-[calc(var(--cell)*0.06)] text-[max(9px,calc(var(--cell)*0.3))] font-bold ${
              waveOff
                ? 'bg-black/30 border-white/10 text-white/45 cursor-not-allowed'
                : 'bg-amber-600/55 hover:bg-amber-500/70 border-amber-300/50 text-white'
            }`}
          >
            {allWavesLaunched ? (
              <span>Последняя волна</span>
            ) : duel && waveCountdown !== null ? (
              <>
                {isSpawning && <span className="whitespace-nowrap">Враги выходят…</span>}
                <span className="whitespace-nowrap tabular-nums">Волна через {waveCountdown} с</span>
              </>
            ) : isSpawning ? (
              <span>Враги выходят…</span>
            ) : waveCountdown !== null ? (
              <>
                <span className="whitespace-nowrap">Волна через {waveCountdown} с</span>
                {earlyStartBonus > 0 && (
                  <span className="whitespace-nowrap tabular-nums text-amber-100 text-[0.85em]">сейчас +{earlyStartBonus} золота</span>
                )}
              </>
            ) : isWaveActive ? (
              <>
                <span className="whitespace-nowrap">Следующая волна</span>
                <span className="whitespace-nowrap tabular-nums text-amber-100 text-[0.85em]">+{earlyStartBonus} золота</span>
              </>
            ) : (
              <span>Начать волну</span>
            )}
          </button>
        </div>
        {!duel && (
          <div className="h-full flex items-center justify-center mr-auto" style={{ width: 'var(--cell)' }}>
            <button
              type="button"
              onClick={onToggleAutoStart}
              title="Автостарт: следующая волна начинается сразу после зачистки"
              aria-pressed={autoStart}
              className={`${iconBtn} flex-col gap-[calc(var(--cell)*0.04)] text-[max(8px,calc(var(--cell)*0.26))] ${
                autoStart ? 'bg-amber-600/55 hover:bg-amber-500/70 border-amber-300/50 text-white' : plain
              }`}
            >
              <span>Авто</span>
              <span className="text-[0.85em] opacity-80">{autoStart ? 'вкл' : 'выкл'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
