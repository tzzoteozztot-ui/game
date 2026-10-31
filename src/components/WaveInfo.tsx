/**
 * Middle of the top row over the field for «Тёмный рубеж»: what the coming wave brings (while the timer runs)
 * and, after a cleared wave, a button that opens its totals. The 4 middle cells of the top row have no HUD buttons.
 * Same cell unit as FieldHud: one cell is 100cqw / CONFIG.grid.cols.
 */

import React from 'react';
import { CONFIG, EnemyType } from '../game/config';
import { enemyName } from '../bestiary';
import { HUD_LEFT_COLS } from '../game/maps';
import type { WaveSummary } from '../game/engine';

interface WaveInfoProps {
  nextWave: { type: EnemyType; count: number }[] | null;
  summary: WaveSummary | null;
  faction: number;
  isWaveActive: boolean;
}

const CELL = `calc(100cqw / ${CONFIG.grid.cols})`;
const MID_COLS = CONFIG.grid.cols - HUD_LEFT_COLS * 2;

const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');

const TOWER_SHORT: Record<string, string> = { archer: 'Стрелок', priest: 'Жрец', mage: 'Маг', ballista: 'Баллиста' };

function enemyIcon(type: EnemyType, faction: number): string {
  return type === 'boss' ? `sprites/boss_${faction}.png` : `sprites/enemy_${type}.png`;
}

export function WaveInfo({ nextWave, summary, faction, isWaveActive }: WaveInfoProps) {
  const [open, setOpen] = React.useState(false);
  // A new wave closes the totals of the previous one
  React.useEffect(() => {
    if (isWaveActive) setOpen(false);
  }, [isWaveActive]);
  React.useEffect(() => {
    setOpen(false);
  }, [summary?.id]);

  const showPreview = nextWave !== null && nextWave.length > 0;
  if (!showPreview && !summary) return null;

  return (
    <div className="absolute inset-0 pointer-events-none [container-type:inline-size]">
      <div
        className="absolute top-0 flex items-center justify-center gap-[calc(var(--cell)*0.08)]"
        style={
          {
            '--cell': CELL,
            left: `calc(${CELL} * ${HUD_LEFT_COLS})`,
            width: `calc(${CELL} * ${MID_COLS})`,
            height: CELL,
          } as React.CSSProperties
        }
      >
        {showPreview && (
          <div
            className="pointer-events-auto grid grid-cols-3 grid-rows-2 rounded-[calc(var(--cell)*0.14)] bg-black/35 border border-white/15 backdrop-blur-[2px] px-[calc(var(--cell)*0.06)] py-[calc(var(--cell)*0.03)]"
            style={{ width: `calc(var(--cell) * ${MID_COLS - 1} - var(--cell) * 0.1)`, height: 'calc(var(--cell) * 0.84)' }}
            title="Состав следующей волны"
          >
            {nextWave!.map((g) => (
              <div key={g.type} className="flex items-center justify-center gap-[1px] min-w-0">
                <img
                  src={enemyIcon(g.type, faction)}
                  alt={enemyName(g.type, faction, CONFIG.enemies[g.type].name)}
                  title={enemyName(g.type, faction, CONFIG.enemies[g.type].name)}
                  className="h-[calc(var(--cell)*0.36)] w-[calc(var(--cell)*0.36)] object-contain shrink-0"
                  draggable={false}
                />
                <span className="text-white/90 font-bold tabular-nums leading-none text-[max(9px,calc(var(--cell)*0.27))]">×{g.count}</span>
              </div>
            ))}
          </div>
        )}
        {summary && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            title={`Итоги волны ${summary.wave}`}
            className={`pointer-events-auto rounded-[calc(var(--cell)*0.14)] border backdrop-blur-[2px] leading-none cursor-pointer select-none flex flex-col items-center justify-center text-[max(8px,calc(var(--cell)*0.24))] font-bold w-[calc(var(--cell)*0.9)] h-[calc(var(--cell)*0.84)] ${
              open ? 'bg-amber-600/55 border-amber-300/50 text-white' : 'bg-black/35 hover:bg-black/55 border-white/15 text-white/90'
            }`}
          >
            <span>Итоги</span>
            <span className="opacity-80">{summary.wave}</span>
          </button>
        )}
      </div>

      {summary && open && (
        <div
          className="pointer-events-auto absolute rounded-[calc(var(--cell)*0.18)] bg-black/80 border border-white/20 backdrop-blur-sm text-white/90 leading-tight text-[max(10px,calc(var(--cell)*0.3))] px-[calc(var(--cell)*0.2)] py-[calc(var(--cell)*0.12)]"
          style={
            {
              '--cell': CELL,
              left: `calc(${CELL} * ${HUD_LEFT_COLS - 0.5})`,
              top: CELL,
              width: `calc(${CELL} * ${MID_COLS + 1})`,
            } as React.CSSProperties
          }
        >
          <div className="font-bold text-amber-200 mb-[2px]">Волна {summary.wave}</div>
          <div className="grid grid-cols-2 gap-x-[calc(var(--cell)*0.2)] tabular-nums">
            <span>Убито: {fmt(summary.killed)}</span>
            <span className={summary.leaked > 0 ? 'text-red-300' : ''}>Дошло: {fmt(summary.leaked)}</span>
            <span>Золото: +{fmt(summary.gold)}</span>
            <span className={summary.lives > 0 ? 'text-red-300' : ''}>Артефакт: −{fmt(summary.lives)}</span>
          </div>
          {(summary.towers.length > 0 || summary.other > 0) && (
            <div className="mt-[3px] pt-[3px] border-t border-white/15">
              <div className="text-stone-400">Урон башен</div>
              {summary.towers.slice(0, 6).map((t, i) => (
                <div key={i} className="flex justify-between gap-1 tabular-nums">
                  <span className="truncate">
                    {TOWER_SHORT[t.type]}
                    {t.second ? `+${TOWER_SHORT[t.second]}` : ''} {t.level}
                  </span>
                  <span>{fmt(t.damage)}</span>
                </div>
              ))}
              {summary.towers.length > 6 && (
                <div className="flex justify-between text-stone-400 tabular-nums">
                  <span>ещё {summary.towers.length - 6}</span>
                  <span>{fmt(summary.towers.slice(6).reduce((s, t) => s + t.damage, 0))}</span>
                </div>
              )}
              {summary.other > 0 && (
                <div className="flex justify-between text-stone-400 tabular-nums">
                  <span>прочее</span>
                  <span>{fmt(summary.other)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
