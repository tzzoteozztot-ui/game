/**
 * Редактор свойств башен (просьба Артура 2026-11-15, первый шаг к редактору режимов).
 * Свои наборы правок: цена, урон, период, радиус, площадь и общие числа уровней. Набор действует только
 * в «Тестовом запуске» (свободный режим), стандартный баланс не меняется. Страница меню «Редактор».
 */

import { useState } from 'react';
import { CONFIG, RACE_IDS, RaceId, TowerType } from '../game/config';
import {
  TOWER_FIELDS,
  TOWER_FIELD_LABELS,
  TowerField,
  TuningPreset,
  TuningStore,
  UPGRADE_FIELDS,
  UPGRADE_FIELD_LABELS,
  UpgradeField,
  loadTuning,
  newPreset,
  presetChangeCount,
  saveTuning,
  towerDefault,
  upgradeDefault,
} from '../tuning';
import { askConfirm, askText } from './AskDialog';
import { TowerSpriteIcon } from './Icons';

const PANEL = 'bg-[#171520] rounded-lg border border-[#2d2938]';
const BTN =
  'min-h-[36px] px-3 py-1.5 rounded bg-[#221f2d] hover:bg-[#2c283a] border border-[#383347] text-xs font-bold text-stone-200 transition-colors cursor-pointer';

function NumCell({ value, def, onChange }: { value: number | undefined; def: number; onChange: (v: number | null) => void }) {
  const [text, setText] = useState<string | null>(null);
  const changed = value !== undefined && value !== def;
  return (
    <div className="flex items-center gap-1">
      <input
        type="text"
        inputMode="decimal"
        value={text ?? String(value ?? def)}
        onChange={(e) => {
          const t = e.target.value.replace(',', '.');
          setText(t);
          const v = Number(t);
          if (t.trim() !== '' && Number.isFinite(v) && v > 0) onChange(v === def ? null : v);
        }}
        onBlur={() => setText(null)}
        className={`w-16 min-h-[32px] rounded border px-1.5 text-xs font-bold text-right ${
          changed ? 'bg-amber-950/60 border-amber-500 text-amber-200' : 'bg-[#221f2d] border-[#383347] text-stone-300'
        }`}
        title={`Стандарт: ${def}`}
      />
      <button
        type="button"
        onClick={() => {
          setText(null);
          onChange(null);
        }}
        disabled={!changed}
        title={`Вернуть стандарт (${def})`}
        className="w-6 h-6 rounded text-[11px] text-stone-400 enabled:hover:text-amber-300 disabled:opacity-20 cursor-pointer"
      >
        ↺
      </button>
    </div>
  );
}

export function TowerEditor({
  onTestRun,
  level,
  onSelectLevel,
}: {
  onTestRun: (preset: TuningPreset | null) => void;
  level: number;
  onSelectLevel: (l: number) => void;
}) {
  const [store, setStore] = useState<TuningStore>(() => loadTuning());
  const [race, setRace] = useState<RaceId>('humans');
  const active = store.presets.find((p) => p.id === store.activeId) ?? null;

  const commit = (next: TuningStore) => {
    saveTuning(next);
    setStore(next);
  };
  const edit = (fn: (p: TuningPreset) => TuningPreset) => {
    if (!active) return;
    commit({ ...store, presets: store.presets.map((p) => (p.id === active.id ? fn(p) : p)) });
  };
  const setTower = (type: TowerType, f: TowerField, v: number | null) =>
    edit((p) => {
      const patch = { ...(p.towers[type] ?? {}) };
      if (v === null) delete patch[f];
      else patch[f] = v;
      const towers = { ...p.towers };
      if (Object.keys(patch).length) towers[type] = patch;
      else delete towers[type];
      return { ...p, towers };
    });
  const setUpgrade = (f: UpgradeField, v: number | null) =>
    edit((p) => {
      const upgrade = { ...p.upgrade };
      if (v === null) delete upgrade[f];
      else upgrade[f] = v;
      return { ...p, upgrade };
    });

  const create = async (copy: boolean) => {
    const name = await askText('Название набора:', copy && active ? `${active.name} (копия)` : `Набор ${store.presets.length + 1}`);
    if (!name?.trim()) return;
    const p = newPreset(name.trim().slice(0, 40), copy ? active ?? undefined : undefined);
    commit({ ...store, presets: [...store.presets, p], activeId: p.id });
  };
  const rename = async () => {
    if (!active) return;
    const name = await askText('Название набора:', active.name);
    if (name?.trim()) edit((p) => ({ ...p, name: name.trim().slice(0, 40) }));
  };
  const remove = async () => {
    if (!active) return;
    if (!(await askConfirm(`Удалить набор «${active.name}»?`, 'Удалить'))) return;
    const presets = store.presets.filter((p) => p.id !== active.id);
    commit({ ...store, presets, activeId: presets[0]?.id ?? null });
  };
  const resetAll = async () => {
    if (!active || presetChangeCount(active) === 0) return;
    if (await askConfirm(`Сбросить все правки набора «${active.name}» к стандарту?`, 'Сбросить')) edit((p) => ({ ...p, towers: {}, upgrade: {} }));
  };

  const raceDef = CONFIG.races[race];
  const changes = active ? presetChangeCount(active) : 0;

  return (
    <div className="w-full max-w-3xl flex flex-col items-center">
      <div className={`${PANEL} w-full p-2.5 text-xs text-stone-300 leading-relaxed mb-2`}>
        <b className="text-amber-300">Свойства башен.</b> Правки хранятся в наборе и действуют только в «Тестовом запуске» (свободная игра).
        Стандартный баланс игры не меняется: выход в меню возвращает обычные числа. Золотым подсвечено то, что отличается от стандарта.
      </div>

      <div className={`${PANEL} w-full p-2 mb-2 flex flex-wrap items-center gap-1.5`}>
        <select
          value={store.activeId ?? ''}
          onChange={(e) => commit({ ...store, activeId: e.target.value || null })}
          className="min-h-[36px] flex-1 min-w-[140px] rounded bg-[#221f2d] border border-[#383347] px-2 text-xs font-bold text-stone-200 cursor-pointer"
          disabled={store.presets.length === 0}
        >
          {store.presets.length === 0 && <option value="">Наборов пока нет</option>}
          {store.presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({presetChangeCount(p)})
            </option>
          ))}
        </select>
        <button type="button" className={BTN} onClick={() => create(false)}>
          Новый
        </button>
        {active && (
          <>
            <button type="button" className={BTN} onClick={() => create(true)}>
              Копия
            </button>
            <button type="button" className={BTN} onClick={rename}>
              Имя
            </button>
            <button type="button" className={BTN} onClick={resetAll} disabled={changes === 0}>
              К стандарту
            </button>
            <button type="button" className={`${BTN} text-red-300`} onClick={remove}>
              Удалить
            </button>
          </>
        )}
      </div>

      {!active ? (
        <div className={`${PANEL} w-full p-4 text-center text-xs text-stone-400`}>Создайте набор — в нём будут ваши правки башен.</div>
      ) : (
        <>
          <div className="w-full grid grid-cols-3 sm:grid-cols-6 gap-1 mb-2" role="tablist">
            {RACE_IDS.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={race === id}
                onClick={() => setRace(id)}
                className={`min-h-[34px] rounded border text-[11px] font-bold cursor-pointer ${
                  race === id ? 'border-amber-400 bg-[#2a2236] text-amber-200' : 'border-[#383347] bg-[#221f2d] hover:bg-[#2c283a] text-stone-300'
                }`}
              >
                {CONFIG.races[id].name}
              </button>
            ))}
          </div>

          <div className="w-full flex flex-col gap-1.5">
            {raceDef.towers.map((type) => {
              const def = CONFIG.towers[type];
              const fields = TOWER_FIELDS.filter((f) => towerDefault(type, f) !== undefined);
              return (
                <div key={type} className={`${PANEL} p-2`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <TowerSpriteIcon type={type} size={32} color={def.color} />
                    <div className="min-w-0">
                      <div className="text-sm font-black text-stone-100 leading-tight">{def.name}</div>
                      <div className="text-[11px] text-stone-400 leading-snug">{def.desc ?? def.specs.map((s) => s.name).join(' · ')}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {fields.map((f) => (
                      <label key={f} className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-stone-400">{TOWER_FIELD_LABELS[f]}</span>
                        <NumCell value={active.towers[type]?.[f]} def={towerDefault(type, f)!} onChange={(v) => setTower(type, f, v)} />
                      </label>
                    ))}
                  </div>
                  {def.specs.length > 0 && type in CONFIG.towers && raceDef.id === 'humans' && (
                    <p className="text-[10px] text-stone-500 mt-1.5 leading-snug">
                      Свойства ({def.specs.map((s) => s.name).join(', ')}) пока заданы в коде — их числа правятся следующим шагом.
                    </p>
                  )}
                </div>
              );
            })}

            <div className={`${PANEL} p-2`}>
              <div className="text-sm font-black text-stone-100 mb-1.5">Уровни и продажа (общие)</div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {UPGRADE_FIELDS.map((f) => (
                  <label key={f} className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-stone-400">{UPGRADE_FIELD_LABELS[f]}</span>
                    <NumCell value={active.upgrade[f]} def={upgradeDefault(f)} onChange={(v) => setUpgrade(f, v)} />
                  </label>
                ))}
              </div>
              <p className="text-[10px] text-stone-500 mt-1.5 leading-snug">Уровни и возврат при продаже действуют у людей; у других рас — свои числа в правилах расы.</p>
            </div>
          </div>
        </>
      )}

      <div className={`${PANEL} w-full p-2 mt-2 flex flex-wrap items-center gap-1.5`}>
        <label className="flex items-center gap-1.5 flex-1 min-w-[180px]">
          <span className="text-xs font-semibold text-stone-400">Карта:</span>
          <select
            value={level}
            onChange={(e) => onSelectLevel(Number(e.target.value))}
            className="min-h-[36px] flex-1 rounded bg-[#221f2d] border border-[#383347] px-2 text-xs font-bold text-stone-200 cursor-pointer"
          >
            {CONFIG.factions.slice(0, CONFIG.levelCount).map((f, i) => (
              <option key={f.id} value={i + 1}>
                {f.location}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => onTestRun(active)}
          className="min-h-[42px] px-4 rounded bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs tracking-wider uppercase cursor-pointer active:translate-y-0.5"
        >
          Тестовый запуск{active && changes > 0 ? ` (${changes})` : ''}
        </button>
      </div>
    </div>
  );
}
