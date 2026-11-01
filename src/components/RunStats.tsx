/**
 * Totals of the whole run for the end screens (victory, defeat, duel result) of «Тёмный рубеж»:
 * waves, kills, leaks, gold, lives lost, game time and the damage of every tower.
 */

import { useState } from 'react';
import type { RunSummary } from '../game/engine';
import { specSummary } from '../game/towerStats';
import { CONFIG, TowerType } from '../game/config';
import { downloadRunLog, hasSavedRunLog } from '../game/runLog';

const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');
const towerName = (type: string) => CONFIG.towers[type as TowerType]?.name ?? '';

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function RunStats({ stats }: { stats: RunSummary | null }) {
  const [open, setOpen] = useState(false);
  if (!stats) return null;
  const top = stats.towers.slice(0, 6);
  const restTowers = stats.towers.slice(6);
  const total = Math.max(1, stats.towers.reduce((n, t) => n + t.damage, 0) + stats.other);
  const maxDmg = Math.max(1, stats.towers[0]?.damage ?? 1);
  const rest = restTowers.reduce((s, t) => s + t.damage, 0) + stats.other;
  const cell = (label: string, value: string, bad = false) => (
    <div className="flex flex-col items-center leading-tight">
      <span className={`font-bold tabular-nums ${bad ? 'text-red-300' : 'text-stone-100'}`}>{value}</span>
      <span className="text-[10px] text-stone-400">{label}</span>
    </div>
  );
  return (
    <div className="text-xs text-stone-300 mb-4 bg-[#121118] py-2 px-3 rounded border border-[#2d2938] text-left">
      <div className="text-[10px] uppercase tracking-wider text-stone-400 text-center mb-1.5">Итоги забега</div>
      <div className="grid grid-cols-3 gap-y-1.5 mb-2">
        {cell('волн', fmt(stats.wave))}
        {cell('убито', fmt(stats.killed))}
        {cell('дошло до артефакта', fmt(stats.leaked), stats.leaked > 0)}
        {cell('золото', `+${fmt(stats.gold)}`)}
        {cell('урон артефакту', fmt(stats.lives), stats.lives > 0)}
        {cell('время', fmtTime(stats.seconds))}
      </div>
      {(stats.towers.length > 0 || rest > 0) && (
        <div className="pt-1.5 border-t border-[#2d2938]">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="w-full min-h-[36px] flex items-center justify-between text-[11px] text-stone-300 cursor-pointer"
          >
            <span>Урон башен · {stats.towers.length} шт.</span>
            <span className="text-stone-400">{open ? 'Свернуть ▲' : 'Развернуть ▼'}</span>
          </button>
          {open && <div className="flex flex-col gap-1.5 tabular-nums mt-1">
            {top.map((t, i) => {
              const name = (type: string, level: number, specs: string[], second = false) => (
                <div className="leading-snug">
                  <span className={second ? 'text-teal-200' : ''}>
                    {second ? '+ ' : ''}
                    <b className={second ? '' : 'text-stone-100'}>{towerName(type)}</b> Ур.{level}
                  </span>
                  {specs.length > 0 && <div className="text-[10px] text-amber-200/90 break-words">{specSummary(specs)}</div>}
                </div>
              );
              return (
                <div key={i}>
                  <div className="flex justify-between items-baseline gap-2">
                    <div className="min-w-0 flex flex-col gap-0.5">
                      {name(t.type, t.level, t.specs)}
                      {t.second && name(t.second, t.secondLevel, t.secondSpecs, true)}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold text-stone-100">{fmt(t.damage)}</div>
                      <div className="text-[10px] text-stone-400">{Math.round((t.damage / total) * 100)}%</div>
                    </div>
                  </div>
                  <div className="h-1 mt-0.5 rounded bg-[#2d2938] overflow-hidden">
                    <div className="h-full bg-red-400/70" style={{ width: `${Math.max(2, (t.damage / maxDmg) * 100)}%` }} />
                  </div>
                </div>
              );
            })}
            {rest > 0 && (
              <div className="flex justify-between gap-1 text-stone-400">
                <span>остальные башни и прочее</span>
                <span>{fmt(rest)}</span>
              </div>
            )}
          </div>}
        </div>
      )}
      {hasSavedRunLog() && (
        <button
          type="button"
          onClick={() => downloadRunLog()}
          className="w-full min-h-[36px] mt-1.5 pt-1.5 border-t border-[#2d2938] text-[11px] text-amber-200 cursor-pointer"
        >
          Скачать лог партии (JSON)
        </button>
      )}
    </div>
  );
}
