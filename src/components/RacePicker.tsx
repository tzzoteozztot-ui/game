/**
 * The player's faction: whose towers the shop sells (выбор Артура 2026-11-01).
 * Six buttons in a grid and one line on what makes the picked faction different.
 */

import { CONFIG, RACE_IDS, RaceId } from '../game/config';

export function RacePicker({ race, onChange, compact = false }: { race: RaceId; onChange: (r: RaceId) => void; compact?: boolean }) {
  const def = CONFIG.races[race];
  return (
    <div className="w-full">
      <div className="text-xs font-semibold text-stone-400 mb-1 px-1">Ваша раса (башни):</div>
      <div className={`grid gap-1 ${compact ? 'grid-cols-3' : 'grid-cols-3 sm:grid-cols-6 short:grid-cols-6'}`} role="radiogroup">
        {RACE_IDS.map((id) => {
          const r = CONFIG.races[id];
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={race === id}
              onClick={() => onChange(id)}
              title={r.features.join(' ')}
              className={`min-h-[36px] px-0.5 rounded border text-[11px] font-bold leading-tight cursor-pointer transition-colors ${
                race === id ? 'border-amber-400 bg-[#2a2236] text-amber-200' : 'border-[#383347] bg-[#221f2d] hover:bg-[#2c283a] text-stone-300'
              }`}
            >
              <span className="inline-block w-2 h-2 rounded-full mr-0.5 align-middle" style={{ backgroundColor: CONFIG.palettes[r.faction - 1].enemies }} />
              {r.name}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-stone-400 mt-1 px-1 leading-snug">{def.features[0]}</p>
    </div>
  );
}
