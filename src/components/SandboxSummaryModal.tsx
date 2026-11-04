/**
 * Свободный режим: итоги зачищенной волны окном по кнопке в колонке (на поле кнопок нет, чтобы не закрывать клетки).
 */

import React from 'react';
import { CONFIG } from '../game/config';
import type { WaveSummary } from '../game/engine';

const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');
const towerName = (type: string) => CONFIG.towers[type as keyof typeof CONFIG.towers]?.name ?? '';

export function SandboxSummaryModal({ summary, onClose }: { summary: WaveSummary; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-2" onClick={onClose}>
      <div
        className="w-full max-w-sm max-h-full overflow-y-auto bg-[#171520] border border-[#383347] rounded-lg p-3 text-xs text-[#f4f2e6] flex flex-col gap-1.5 select-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-black text-amber-300 uppercase tracking-wider">Итоги волны {summary.wave}</h2>
          <button type="button" onClick={onClose} className="min-h-[34px] px-3 rounded border bg-[#221f2d] border-[#383347] font-bold cursor-pointer hover:bg-[#2c283a]">
            Закрыть
          </button>
        </div>
        <div className="grid grid-cols-2 gap-x-3 tabular-nums">
          <span>Убито: {fmt(summary.killed)}</span>
          <span className={summary.leaked > 0 ? 'text-red-300' : ''}>Дошло: {fmt(summary.leaked)}</span>
          <span>Золото: +{fmt(summary.gold)}</span>
          <span className={summary.lives > 0 ? 'text-red-300' : ''}>Артефакт: −{fmt(summary.lives)}</span>
        </div>
        {(summary.towers.length > 0 || summary.other > 0) && (
          <div className="pt-1.5 border-t border-white/15">
            <div className="text-stone-400">Урон башен</div>
            {summary.towers.map((t, i) => (
              <div key={i} className="flex justify-between gap-2 tabular-nums">
                <span className="truncate">
                  {t.title ?? towerName(t.type)}
                  {t.second ? `+${towerName(t.second)}` : ''} {t.level}
                </span>
                <span>{fmt(t.damage)}</span>
              </div>
            ))}
            {summary.other > 0 && (
              <div className="flex justify-between text-stone-400 tabular-nums">
                <span>прочее</span>
                <span>{fmt(summary.other)}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
