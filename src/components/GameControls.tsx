/**
 * Speed, sound, full screen and pause for «Тёмный рубеж»: a row at the top of the side column
 * (they used to sit over the top-right cells of the field; Артур moved them, 2026-10-31).
 * Sizes follow the column's SIDE_VARS or the strip's BOTTOM_VARS (--h-tier, --fs-*).
 */

import React from 'react';
import { CONFIG } from '../game/config';
import { useFullscreen } from '../fullscreen';
import { SoundIcon, FullscreenIcon, PauseIcon } from './Icons';

interface GameControlsProps {
  speed: number;
  isPaused: boolean;
  isMuted: boolean;
  duel: boolean; // the speed is fixed in a duel
  onTogglePause: () => void;
  onSetSpeed: (speed: number) => void;
  onToggleMute: () => void;
  dropUp?: boolean; // the speed list opens upwards (the strip below the field)
}

const fmtSpeed = (v: number) => String(v).replace('.', ',');

const btn =
  'h-[var(--h-tier,36px)] min-h-[30px] rounded border flex items-center justify-center leading-none font-bold transition-colors cursor-pointer select-none';
const plain = 'bg-[#221f2d] hover:bg-[#2c283a] border-[#383347] text-stone-200';
const icon = 'text-[length:var(--fs-lg)]';

export function GameControls({ speed, isPaused, isMuted, duel, onTogglePause, onSetSpeed, onToggleMute, dropUp = false }: GameControlsProps) {
  const fullscreen = useFullscreen();
  const [speedOpen, setSpeedOpen] = React.useState(false);
  const count = 2 + (duel ? 0 : 1) + (fullscreen.supported ? 1 : 0);

  return (
    // One row in the side column; the bottom strip sets --ctl-cols and --ctl-w for a compact block
    <div
      className="px-1.5 pt-1.5 grid gap-1 shrink-0"
      style={{ gridTemplateColumns: `repeat(var(--ctl-cols, ${count}), minmax(0, 1fr))`, width: 'var(--ctl-w, auto)' }}
    >
      {!duel && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setSpeedOpen((o) => !o)}
            title="Скорость игры (+ / −)"
            aria-expanded={speedOpen}
            className={`${btn} w-full text-[length:var(--fs-md)] tabular-nums ${
              speedOpen || speed !== 1 ? 'bg-amber-600/70 hover:bg-amber-500/80 border-amber-300/50 text-white' : plain
            }`}
          >
            ×{fmtSpeed(speed)}
          </button>
          {speedOpen && (
            <>
              {/* A tap anywhere else closes the list */}
              <div className="fixed inset-0 z-20" onPointerDown={() => setSpeedOpen(false)} />
              <div className={`absolute left-0 z-30 ${dropUp ? 'bottom-full mb-1' : 'top-full mt-1'} flex flex-col gap-1 p-1 rounded bg-black/80 border border-white/15 backdrop-blur-sm`}>
                {CONFIG.speeds.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => {
                      onSetSpeed(v);
                      setSpeedOpen(false);
                    }}
                    className={`h-[max(28px,var(--h-tier,36px))] min-w-[52px] px-2 rounded text-[length:var(--fs-md)] font-bold tabular-nums leading-none cursor-pointer transition-colors ${
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
      )}
      <button type="button" onClick={onToggleMute} title={isMuted ? 'Включить звук' : 'Выключить звук'} className={`${btn} ${icon} ${plain}`}>
        <SoundIcon muted={isMuted} />
      </button>
      {fullscreen.supported && (
        <button
          type="button"
          onClick={fullscreen.toggle}
          title={fullscreen.active ? 'Выйти из полноэкранного режима (F)' : 'Во весь экран (F)'}
          className={`${btn} ${icon} ${plain}`}
        >
          <FullscreenIcon active={fullscreen.active} />
        </button>
      )}
      <button
        type="button"
        onClick={onTogglePause}
        title="Пауза (P)"
        className={`${btn} ${icon} ${isPaused ? 'bg-red-900/70 border-red-400/50 text-white' : plain}`}
      >
        <PauseIcon paused={isPaused} />
      </button>
    </div>
  );
}
