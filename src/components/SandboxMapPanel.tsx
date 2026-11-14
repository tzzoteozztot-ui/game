/**
 * Свободный режим: редактор карты (просьба Артура 2026-11-05) в боковой колонке. Кисть рисует на поле:
 * дорога, выход (точка появления врагов, номер — порядок, босс идёт из первого), клетки без башен, ластик.
 * Заготовка — готовая карта, случайная дорога или своя сохранённая; «Применить» ставит карту на поле.
 */

import { useState } from 'react';
import { CONFIG } from '../game/config';
import { MapEditTool } from '../game/mapEditor';
import { GameStateSnapshot } from '../game/engine';
import { SavedMap } from '../customMaps';

interface Props {
  edit: NonNullable<GameStateSnapshot['mapEdit']>;
  saved: SavedMap[];
  onTool: (t: MapEditTool) => void;
  onLevel: (level: number) => void;
  onLoadFixed: (level: number) => void;
  onLoadRandom: () => void;
  onLoadSaved: (m: SavedMap) => void;
  onClear: () => void;
  onApply: () => void;
  onClose: () => void;
  onSave: () => void;
  onDelete: (id: string) => void;
  compact?: boolean;
}

const BTN =
  'min-h-[var(--h-line,24px)] px-1 rounded border text-[length:var(--fs-sm)] font-bold cursor-pointer transition-colors bg-[#221f2d] border-[#383347] text-stone-200 hover:bg-[#2c283a] disabled:opacity-40 disabled:cursor-not-allowed';
const SELECT =
  'min-h-[var(--h-line,24px)] w-full rounded bg-[#221f2d] border border-[#383347] px-1 text-[length:var(--fs-sm)] font-bold text-stone-200 cursor-pointer';

const TOOLS: { id: MapEditTool; label: string; hint: string }[] = [
  { id: 'road', label: 'Дорога', hint: 'Касание или проведение по клеткам: ставит дорогу, по дороге — стирает' },
  { id: 'exit', label: 'Выход', hint: 'Касание клетки: выход врагов (ставит и дорогу); по выходу — убирает. Босс идёт из выхода 1' },
  { id: 'block', label: 'Без башен', hint: 'Клетки, где нельзя ставить башни; по такой клетке — снова можно' },
  { id: 'erase', label: 'Ластик', hint: 'Стирает дорогу, выход и запрет' },
];

export function SandboxMapPanel({ edit, saved, onTool, onLevel, onLoadFixed, onLoadRandom, onLoadSaved, onClear, onApply, onClose, onSave, onDelete, compact }: Props) {
  const [pick, setPick] = useState('');
  const savedPick = pick.startsWith('s:') ? saved.find((m) => m.id === pick.slice(2)) : undefined;
  const choose = (v: string) => {
    setPick(v);
    if (v.startsWith('f:')) onLoadFixed(Number(v.slice(2)));
    else if (v === 'random') onLoadRandom();
    else if (v.startsWith('s:')) {
      const m = saved.find((x) => x.id === v.slice(2));
      if (m) onLoadSaved(m);
    }
  };
  const ok = edit.errors.length === 0;

  return (
    <div
      className={`w-full p-1.5 bg-[#171520] text-[#f4f2e6] text-[length:var(--fs-md)] shrink-0 select-none ${
        compact ? 'grid grid-cols-2 gap-x-2 items-start' : 'flex flex-col gap-1'
      }`}
    >
      <div className={compact ? 'flex flex-col gap-1 min-w-0' : 'contents'}>
        <div className="flex items-center justify-between gap-1 leading-none">
          <span className="text-[length:var(--fs-sm)] uppercase font-semibold tracking-wider text-amber-300">Редактор карты</span>
          <span className="text-[length:var(--fs-xs,10px)] text-stone-500 tabular-nums">
            дорога {edit.roads} · выходов {edit.exits}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-1">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onTool(t.id)}
              aria-pressed={edit.tool === t.id}
              title={t.hint}
              className={`${BTN} ${edit.tool === t.id ? '!bg-amber-600 !border-amber-300/60 !text-stone-950' : ''}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="text-[length:var(--fs-xs,10px)] text-stone-400 leading-tight">{TOOLS.find((t) => t.id === edit.tool)?.hint}</div>

        <label className="flex flex-col gap-0.5 text-[length:var(--fs-xs,10px)] text-stone-400 font-semibold">
          Местность (вид поля и сила врагов)
          <select value={edit.level} onChange={(e) => onLevel(Number(e.target.value))} className={SELECT}>
            {CONFIG.factions.slice(0, CONFIG.levelCount).map((f, i) => (
              <option key={f.id} value={i + 1}>
                {f.location}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className={compact ? 'flex flex-col gap-1 min-w-0' : 'contents'}>
        <label className="flex flex-col gap-0.5 text-[length:var(--fs-xs,10px)] text-stone-400 font-semibold">
          Взять за основу
          <select value={pick} onChange={(e) => choose(e.target.value)} className={SELECT}>
            <option value="" disabled>
              Выбрать карту…
            </option>
            <optgroup label="Готовые">
              {CONFIG.factions.slice(0, CONFIG.levelCount).map((f, i) => (
                <option key={f.id} value={`f:${i + 1}`}>
                  {f.location}
                </option>
              ))}
              <option value="random">Случайная дорога</option>
            </optgroup>
            {saved.length > 0 && (
              <optgroup label="Мои карты">
                {saved.map((m) => (
                  <option key={m.id} value={`s:${m.id}`}>
                    {m.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-1">
          <button type="button" className={BTN} onClick={onSave} title="Сохранить карту на этом устройстве">
            Сохранить
          </button>
          {savedPick ? (
            <button type="button" className={`${BTN} text-red-300`} onClick={() => { onDelete(savedPick.id); setPick(''); }} title={`Удалить «${savedPick.name}»`}>
              Удалить
            </button>
          ) : (
            <button type="button" className={BTN} onClick={onClear}>
              Очистить
            </button>
          )}
        </div>

        {!ok && (
          <div className="text-[length:var(--fs-xs,10px)] text-red-300 leading-tight">
            {edit.errors.map((e) => (
              <div key={e}>• {e}</div>
            ))}
          </div>
        )}
        <button
          type="button"
          disabled={!ok}
          onClick={onApply}
          title="Поставить карту на поле: враги убираются, башни на новой дороге и на клетках без башен — тоже"
          className="min-h-[var(--h-line,24px)] px-1 rounded border text-[length:var(--fs-sm)] font-black cursor-pointer bg-amber-600 hover:bg-amber-500 border-amber-300/60 text-stone-950 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Применить
        </button>
        <button type="button" className={BTN} onClick={onClose} title="Выйти без изменений (Esc)">
          Отмена
        </button>
      </div>
    </div>
  );
}
