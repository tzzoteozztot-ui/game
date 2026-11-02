/**
 * Свободный режим (просьба Артура 2026-11-02): боковая колонка вместо лавки.
 * Башня любого уровня и со свойством берётся в руку бесплатно; выбранной башне можно сменить уровень и свойство;
 * отсюда же открывается окно состава волны и скачивается лог партии.
 */

import React, { useState } from 'react';
import { CONFIG, RaceId, TowerType } from '../game/config';
import { TowerSpriteIcon } from './Icons';

interface SandboxPanelProps {
  race: RaceId;
  maxLevel: number;
  selectedTower: { type: TowerType; level: number } | null;
  inHand: TowerType | 'binder' | null;
  onTake: (type: TowerType, level: number, spec: string | null) => void;
  onTakeBinder: () => void;
  onApplySelected: (level: number, spec: string | null) => void;
  onOpenWave: () => void;
  onDownloadLog: () => void;
}

const BTN =
  'min-h-[var(--h-line,24px)] px-1 rounded border text-[length:var(--fs-sm)] font-bold cursor-pointer transition-colors bg-[#221f2d] border-[#383347] text-stone-200 hover:bg-[#2c283a]';

export function SandboxPanel({ race, maxLevel, selectedTower, inHand, onTake, onTakeBinder, onApplySelected, onOpenWave, onDownloadLog }: SandboxPanelProps) {
  const raceDef = CONFIG.races[race];
  const types = raceDef.towers;
  const [type, setType] = useState<TowerType>(types[0]);
  const [level, setLevel] = useState(1);
  const [spec, setSpec] = useState('');
  const cur = types.includes(type) ? type : types[0];
  const specs = CONFIG.towers[cur].specs;
  const lvl = Math.min(level, maxLevel);
  const specId = lvl >= 2 && spec && specs.some((s) => s.id === spec) ? spec : null;

  return (
    <div className="w-full p-1.5 bg-[#171520] text-[#f4f2e6] text-[length:var(--fs-md)] flex flex-col gap-1 shrink-0 select-none">
      <div className="flex items-center justify-between gap-1 leading-none">
        <span className="text-[length:var(--fs-sm)] uppercase font-semibold tracking-wider text-stone-400">Свободный режим</span>
        <span className="text-amber-400 font-bold text-[length:var(--fs-sm)]">Золото ∞</span>
      </div>

      <div className="grid grid-cols-4 gap-1">
        {types.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            aria-pressed={cur === t}
            title={CONFIG.towers[t].name}
            className={`h-[var(--h-card,44px)] rounded border flex items-center justify-center cursor-pointer ${
              cur === t ? 'bg-[#2a2236] border-amber-400 ring-1 ring-amber-500/60' : 'bg-[#221f2d] border-[#383347] hover:bg-[#2c283a]'
            }`}
          >
            <TowerSpriteIcon type={t} size="70%" />
          </button>
        ))}
      </div>
      <div className="text-[length:var(--fs-sm)] text-stone-300 truncate leading-tight">{CONFIG.towers[cur].name}</div>

      <div className="flex items-center gap-1">
        <button type="button" className={`${BTN} w-7`} onClick={() => setLevel(Math.max(1, lvl - 1))} aria-label="Уровень меньше">
          −
        </button>
        <span className="flex-1 text-center font-bold text-amber-300 tabular-nums">Ур. {lvl}</span>
        <button type="button" className={`${BTN} w-7`} onClick={() => setLevel(Math.min(maxLevel, lvl + 1))} aria-label="Уровень больше">
          +
        </button>
      </div>
      {specs.length > 0 && (
        <select
          value={specId ?? ''}
          disabled={lvl < 2}
          onChange={(e) => setSpec(e.target.value)}
          title={lvl < 2 ? 'Свойство даётся с Ур.2' : 'Свойство башни'}
          className="min-h-[var(--h-line,24px)] w-full rounded bg-[#221f2d] border border-[#383347] px-1 text-[length:var(--fs-sm)] font-bold text-stone-200 cursor-pointer disabled:opacity-50"
        >
          <option value="">{lvl < 2 ? 'Свойство с Ур.2' : 'Без свойства'}</option>
          {specs.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}

      <button
        type="button"
        onClick={() => onTake(cur, lvl, specId)}
        className="min-h-[var(--h-line,24px)] px-1 rounded border text-[length:var(--fs-sm)] font-black cursor-pointer bg-amber-600 hover:bg-amber-500 border-amber-300/60 text-stone-950"
      >
        {inHand === cur ? 'Ещё одну в руку' : 'Взять в руку'}
      </button>
      {raceDef.binders && (
        <button type="button" className={BTN} onClick={onTakeBinder}>
          Связка в руку{inHand === 'binder' ? ' ещё' : ''}
        </button>
      )}
      {selectedTower && (
        <button
          type="button"
          className={`${BTN} border-amber-500/60 text-amber-200`}
          onClick={() => onApplySelected(lvl, specId)}
          title="Выбранной на поле башне задать этот уровень и это свойство"
        >
          Выбранной: Ур. {lvl}{specId ? ' + свойство' : ''}
        </button>
      )}

      <div className="grid grid-cols-2 gap-1 pt-0.5">
        <button type="button" className={`${BTN} border-amber-500/60 text-amber-200`} onClick={onOpenWave}>
          Состав волны
        </button>
        <button type="button" className={BTN} onClick={onDownloadLog} title="Скачать лог партии (JSON)">
          Скачать лог
        </button>
      </div>
    </div>
  );
}
