/**
 * Свободный режим: окно состава волны. Чьи враги, сколько каждого вида, номер волны (от него здоровье и награды),
 * заготовка «как в бесконечном режиме» и запуск. Настройки хранит App — при повторном открытии они на месте.
 */

import React from 'react';
import { CONFIG, EnemyType } from '../game/config';
import { EnemyIcon } from './EnemyIcon';

export interface SandboxWave {
  faction: number;
  wave: number;
  counts: Partial<Record<EnemyType, number>>;
}

const KINDS: { type: EnemyType; step: number }[] = [
  { type: 'infantry', step: 1 },
  { type: 'scout', step: 1 },
  { type: 'heavy', step: 1 },
  { type: 'flyer', step: 1 },
  { type: 'shaman', step: 1 },
  { type: 'swarm', step: CONFIG.swarmGroupCount },
  { type: 'boss', step: 1 },
];

interface Props {
  value: SandboxWave;
  isSpawning: boolean;
  onChange: (v: SandboxWave) => void;
  onPreset: (wave: number) => void;
  onLaunch: () => void;
  onClose: () => void;
  onDownloadLog: () => void;
}

const BTN = 'min-h-[36px] px-3 rounded border text-xs font-bold cursor-pointer transition-colors bg-[#221f2d] border-[#383347] text-stone-200 hover:bg-[#2c283a]';

export function SandboxWaveModal({ value, isSpawning, onChange, onPreset, onLaunch, onClose, onDownloadLog }: Props) {
  const set = (type: EnemyType, n: number) => {
    const max = type === 'boss' ? 1 : 999;
    onChange({ ...value, counts: { ...value.counts, [type]: Math.max(0, Math.min(max, n)) } });
  };
  const total = KINDS.reduce((a, k) => a + (value.counts[k.type] ?? 0), 0);

  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-2" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-full overflow-y-auto bg-[#171520] border border-[#383347] rounded-lg p-3 flex flex-col gap-2 text-[#f4f2e6] select-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-black text-amber-300 uppercase tracking-wider">Состав волны</h2>
          <button type="button" className={BTN} onClick={onClose}>
            Закрыть
          </button>
        </div>

        <label className="flex items-center justify-between gap-2 text-xs text-stone-400 font-semibold">
          Чьи враги
          <select
            value={value.faction}
            onChange={(e) => onChange({ ...value, faction: Number(e.target.value) })}
            className="min-h-[36px] flex-1 max-w-[240px] rounded bg-[#221f2d] border border-[#383347] px-2 text-xs font-bold text-stone-200 cursor-pointer"
          >
            {CONFIG.factions.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center justify-between gap-2 text-xs text-stone-400 font-semibold">
          <span title="Здоровье, броня и награда врагов растут с номером волны, как в бесконечном режиме">Номер волны (сила врагов)</span>
          <input
            type="number"
            min={1}
            max={999}
            value={value.wave}
            onChange={(e) => onChange({ ...value, wave: Math.max(1, Math.min(999, Math.floor(Number(e.target.value)) || 1)) })}
            className="w-20 min-h-[36px] rounded bg-[#221f2d] border border-[#383347] px-2 text-sm font-bold text-amber-300 text-center"
          />
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          {KINDS.map(({ type, step }) => {
            const n = value.counts[type] ?? 0;
            return (
              <div key={type} className="flex items-center gap-1.5 rounded bg-[#1d1a28] border border-[#2d2938] p-1">
                <EnemyIcon type={type} faction={value.faction} alt="" className="w-9 h-9 object-contain shrink-0" />
                <div className="flex-1 min-w-0 leading-tight">
                  <div className="text-[11px] font-bold text-stone-200 truncate">{CONFIG.enemies[type].name}</div>
                  {type === 'swarm' && <div className="text-[9px] text-stone-500">штук (группа — {step})</div>}
                </div>
                <button type="button" className={`${BTN} !px-2`} onClick={() => set(type, n - step)} aria-label="Меньше">
                  −
                </button>
                <input
                  type="number"
                  min={0}
                  value={n}
                  onChange={(e) => set(type, Math.floor(Number(e.target.value)) || 0)}
                  className="w-12 min-h-[36px] rounded bg-[#221f2d] border border-[#383347] text-sm font-bold text-center text-amber-300"
                />
                <button type="button" className={`${BTN} !px-2`} onClick={() => set(type, n + step)} aria-label="Больше">
                  +
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={BTN} onClick={() => onPreset(value.wave)} title="Подставить состав, который даёт бесконечный режим на этой волне">
            Как в бесконечном
          </button>
          <button type="button" className={BTN} onClick={() => onChange({ ...value, counts: {} })}>
            Очистить
          </button>
          <button type="button" className={`${BTN} ml-auto`} onClick={onDownloadLog}>
            Скачать лог
          </button>
        </div>

        <button
          type="button"
          disabled={total === 0}
          onClick={onLaunch}
          className="min-h-[46px] rounded bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-stone-950 font-black text-sm tracking-wider uppercase cursor-pointer"
        >
          Запустить волну{isSpawning ? ' (внахлёст)' : ''}
        </button>
      </div>
    </div>
  );
}
