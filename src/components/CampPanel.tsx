/**
 * Лагерь похода (просьба Артура 2026-11-06): постройки, в каждой — пассивки за ресурсы. Пассивка — усиление
 * из Потасовки (BOONS), каждый уровень добавляет ещё одну его долю во все бои похода. Логика — src/campaign/world.ts.
 */
import { BOONS } from '../game/config';
import { CAMP_BUILDINGS, RES_ICONS, ResKey, WorldState, campCost, campMax, canAfford } from '../campaign/world';

interface CampPanelProps {
  world: WorldState;
  onUpgrade: (perk: string) => void;
  onClose: () => void;
}

export function CampPanel({ world, onUpgrade, onClose }: CampPanelProps) {
  return (
    <div className="absolute inset-0 bg-black/70 flex items-center justify-center p-2 sm:p-4 z-20" onClick={onClose}>
      <div
        className="bg-[#171520] border border-[#3b354a] rounded-xl p-3 sm:p-4 w-full max-w-4xl max-h-full overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-1">
          <h3 className="text-lg font-black text-amber-300">Лагерь экспедиции</h3>
          <span className="text-xs sm:text-sm text-stone-300 flex gap-2">
            {(Object.keys(RES_ICONS) as ResKey[]).map((k) => (
              <span key={k}>
                {RES_ICONS[k]} {world.res[k]}
              </span>
            ))}
          </span>
          <span className="flex-1" />
          <button className="px-3 py-1 rounded bg-[#2a2635] hover:bg-[#3a3448] font-bold" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="text-xs text-stone-400 mb-3">Улучшения действуют во всех боях похода. Каждый уровень добавляет ещё одну долю усиления.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {CAMP_BUILDINGS.map((b) => (
            <div key={b.id} className="bg-black/30 border border-[#2d2938] rounded-lg p-2">
              <div className="flex items-baseline gap-2">
                <span className="font-black text-amber-200">{b.name}</span>
                <span className="text-xs text-stone-400">{b.keeper}</span>
              </div>
              <div className="text-xs text-stone-400 mb-1.5">{b.text}</div>
              <div className="flex flex-col gap-1.5">
                {b.perks.map((id) => {
                  const def = BOONS.find((d) => d.id === id);
                  if (!def) return null;
                  const lvl = world.camp[id] ?? 0;
                  const top = campMax(id);
                  const max = lvl >= top;
                  const cost = max ? null : campCost(lvl + 1);
                  const ok = !!cost && canAfford(world, cost);
                  return (
                    <div key={id} className="flex items-center gap-2 bg-[#1f1c29] rounded px-2 py-1.5">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold flex items-center gap-1.5">
                          {def.name}
                          <span className="text-[#3ed6c4] tracking-tighter">
                            {'●'.repeat(lvl)}
                            <span className="text-stone-600">{'●'.repeat(top - lvl)}</span>
                          </span>
                        </div>
                        <div className="text-xs text-stone-400 leading-tight">
                          {def.desc}
                          {top > 1 ? ' — за уровень' : ''}
                        </div>
                      </div>
                      <button
                        className="shrink-0 px-2 py-1 rounded text-xs font-bold bg-amber-700/80 hover:bg-amber-600 disabled:bg-[#2a2635] disabled:text-stone-500"
                        disabled={!ok}
                        onClick={() => onUpgrade(id)}
                      >
                        {max ? 'Максимум' : (Object.keys(cost!) as ResKey[]).filter((k) => cost![k]).map((k) => `${RES_ICONS[k]}${cost![k]}`).join(' ')}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
