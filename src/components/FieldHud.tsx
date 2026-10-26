/**
 * Semi-transparent buttons over the field for «Тёмный рубеж»
 * Wave button over the 4 top-left cells; speed (opens a list to pick from), sound, full screen and
 * pause over the 4 top-right cells. Those cells are kept free of road and towers (isHudCell in maps.ts), so nothing is covered.
 * The overlay is an inline-size container: one cell is 100cqw / CONFIG.grid.cols.
 */

import React from 'react';
import { CONFIG } from '../game/config';
import { HUD_LEFT_COLS, HUD_RIGHT_COLS } from '../game/maps';
import { useFullscreen } from '../fullscreen';
import { SoundIcon, FullscreenIcon, PauseIcon } from './Icons';

interface FieldHudProps {
  speed: number;
  isPaused: boolean;
  isMuted: boolean;
  isSpawning: boolean;
  isWaveActive: boolean;
  allWavesLaunched: boolean;
  duel: boolean; // waves follow the shared clock, the speed is fixed
  waveCountdown: number | null;
  earlyStartBonus: number;
  onTogglePause: () => void;
  onSetSpeed: (speed: number) => void;
  onToggleMute: () => void;
  onStartWave: () => void;
  autoStart: boolean;
  onToggleAutoStart: () => void;
}

const CELL = `calc(100cqw / ${CONFIG.grid.cols})`;

const fmtSpeed = (v: number) => String(v).replace('.', ',');

const glass =
  'pointer-events-auto rounded-[calc(var(--cell)*0.18)] border backdrop-blur-[2px] flex items-center justify-center leading-none transition-colors cursor-pointer select-none';
const plain = 'bg-black/35 hover:bg-black/55 border-white/15 text-white/90';

export function FieldHud({
  speed,
  isPaused,
  isMuted,
  isSpawning,
  isWaveActive,
  allWavesLaunched,
  duel,
  waveCountdown,
  earlyStartBonus,
  onTogglePause,
  onSetSpeed,
  onToggleMute,
  onStartWave,
  autoStart,
  onToggleAutoStart,
}: FieldHudProps) {
  const fullscreen = useFullscreen();
  const [speedOpen, setSpeedOpen] = React.useState(false);
  const waveOff = isSpawning || allWavesLaunched || duel;
  const iconBtn = `${glass} w-[calc(var(--cell)-var(--gap))] h-[calc(var(--cell)-var(--gap))] font-bold`;
  const iconSize = 'text-[max(11px,calc(var(--cell)*0.42))]';

  return (
    <div className="absolute inset-0 pointer-events-none [container-type:inline-size]">
      <div
        className="absolute inset-x-0 top-0 flex justify-between"
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

        {/* Speed, sound, full screen, pause: 4 cells at the top right */}
        <div className="h-full flex items-center justify-end" style={{ width: `calc(var(--cell) * ${HUD_RIGHT_COLS})` }}>
          <div className="relative w-[var(--cell)] h-full flex items-center justify-center">
            {!duel && (
            <button
              type="button"
              onClick={() => setSpeedOpen((o) => !o)}
              title="Скорость игры (+ / −)"
              aria-expanded={speedOpen}
              className={`${iconBtn} text-[max(10px,calc(var(--cell)*0.34))] tabular-nums ${
                speedOpen || speed !== 1 ? 'bg-amber-600/45 hover:bg-amber-500/60 border-amber-300/50 text-white' : plain
              }`}
            >
              ×{fmtSpeed(speed)}
            </button>
            )}
            {speedOpen && !duel && (
              <>
                {/* A tap anywhere else closes the list */}
                <div className="fixed inset-0 pointer-events-auto" onPointerDown={() => setSpeedOpen(false)} />
                <div className="absolute top-full right-0 mt-[calc(var(--gap)*0.5)] pointer-events-auto flex flex-col gap-[calc(var(--gap)*0.5)] p-[calc(var(--gap)*0.5)] rounded-[calc(var(--cell)*0.18)] bg-black/60 border border-white/15 backdrop-blur-sm">
                  {CONFIG.speeds.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => {
                        onSetSpeed(v);
                        setSpeedOpen(false);
                      }}
                      className={`h-[max(28px,calc(var(--cell)*0.8))] min-w-[max(52px,calc(var(--cell)*1.5))] px-2 rounded-[calc(var(--cell)*0.14)] text-[max(12px,calc(var(--cell)*0.34))] font-bold tabular-nums leading-none cursor-pointer transition-colors ${
                        v === speed ? 'bg-amber-500/80 text-stone-950' : 'bg-white/5 hover:bg-white/15 text-white/90'
                      }`}
                    >
                      ×{fmtSpeed(v)}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="w-[var(--cell)] h-full flex items-center justify-center">
            <button
              type="button"
              onClick={onToggleMute}
              title={isMuted ? 'Включить звук' : 'Выключить звук'}
              className={`${iconBtn} ${iconSize} ${plain}`}
            >
              <SoundIcon muted={isMuted} />
            </button>
          </div>
          {fullscreen.supported && (
            <div className="w-[var(--cell)] h-full flex items-center justify-center">
              <button
                type="button"
                onClick={fullscreen.toggle}
                title={fullscreen.active ? 'Выйти из полноэкранного режима (F)' : 'Во весь экран (F)'}
                className={`${iconBtn} ${iconSize} ${plain}`}
              >
                <FullscreenIcon active={fullscreen.active} />
              </button>
            </div>
          )}
          <div className="w-[var(--cell)] h-full flex items-center justify-center">
            <button
              type="button"
              onClick={onTogglePause}
              title="Пауза (P)"
              className={`${iconBtn} ${iconSize} ${isPaused ? 'bg-red-900/60 border-red-400/50 text-white' : plain}`}
            >
              <PauseIcon paused={isPaused} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
