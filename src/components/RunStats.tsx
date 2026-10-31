/**
 * Totals of the whole run for the end screens (victory, defeat, duel result) of «Тёмный рубеж»:
 * waves, kills, leaks, gold, lives lost, game time and the damage of every tower.
 */

import type { RunSummary } from '../game/engine';

const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');
const TOWER_SHORT: Record<string, string> = { archer: 'Стрелок', priest: 'Жрец', mage: 'Маг', ballista: 'Баллиста' };

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function RunStats({ stats }: { stats: RunSummary | null }) {
  if (!stats) return null;
  const top = stats.towers.slice(0, 6);
  const restTowers = stats.towers.slice(6);
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
      {(top.length > 0 || rest > 0) && (
        <div className="pt-1.5 border-t border-[#2d2938]">
          <div className="text-[10px] text-stone-400 mb-0.5">Урон башен</div>
          <div className="grid grid-cols-2 gap-x-3 tabular-nums">
            {top.map((t, i) => (
              <div key={i} className="flex justify-between gap-1">
                <span className="truncate">
                  {TOWER_SHORT[t.type]}
                  {t.second ? `+${TOWER_SHORT[t.second]}` : ''} {t.level}
                </span>
                <span>{fmt(t.damage)}</span>
              </div>
            ))}
            {rest > 0 && (
              <div className="flex justify-between gap-1 text-stone-400">
                <span>остальные</span>
                <span>{fmt(rest)}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
