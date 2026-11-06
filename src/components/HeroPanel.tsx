/**
 * Окно героя похода (просьба Артура 2026-11-06): Рен Корвин — уровень и опыт, умения (открываются с уровнем,
 * в бою — кнопки HeroBar), четыре слота и найденные предметы: касание предмета — надеть или снять.
 */
import { BOONS, HERO_ABILITIES } from '../game/config';
import { HERO_ITEMS, HERO_LEVELS, ItemSlot, SLOT_NAMES, WorldState, heroLevel } from '../campaign/world';

interface HeroPanelProps {
  world: WorldState;
  onToggle: (itemId: string) => void;
  onClose: () => void;
}

const perkText = (perks: Record<string, number>) =>
  Object.entries(perks)
    .map(([id, n]) => {
      const b = BOONS.find((d) => d.id === id);
      return b ? `${b.name}${n > 1 ? ` ×${n}` : ''}` : '';
    })
    .filter(Boolean)
    .join(', ');

export function HeroPanel({ world, onToggle, onClose }: HeroPanelProps) {
  const lvl = heroLevel(world);
  const next = HERO_LEVELS[lvl];
  const prev = HERO_LEVELS[lvl - 1] ?? 0;
  const slots = Object.keys(SLOT_NAMES) as ItemSlot[];
  return (
    <div className="absolute inset-0 bg-black/70 flex items-center justify-center p-2 sm:p-4 z-20" onClick={onClose}>
      <div className="bg-[#171520] border border-[#3b354a] rounded-xl p-3 sm:p-4 w-full max-w-3xl max-h-full overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-2">
          <div>
            <h3 className="text-lg font-black text-amber-300 leading-tight">Рен Корвин</h3>
            <div className="text-xs text-stone-400">Капитан экспедиции · уровень {lvl}</div>
          </div>
          <div className="flex-1 max-w-56">
            <div className="h-2 rounded bg-[#2a2635] overflow-hidden">
              <div className="h-full bg-[#3ed6c4]" style={{ width: `${next ? Math.min(100, ((world.xp - prev) / (next - prev)) * 100) : 100}%` }} />
            </div>
            <div className="text-[11px] text-stone-400 mt-0.5">{next ? `Опыт ${world.xp} / ${next}` : `Опыт ${world.xp} · высший уровень`}</div>
          </div>
          <span className="flex-1" />
          <button className="px-3 py-1 rounded bg-[#2a2635] hover:bg-[#3a3448] font-bold" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="text-xs text-stone-400 mb-3">Рен не стоит на поле: он командует. Умения — кнопки справа на поле боя (клавиши Z, X, C), предметы усиливают все бои похода. Опыт — за победы.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="bg-black/30 border border-[#2d2938] rounded-lg p-2">
            <div className="font-black text-amber-200 mb-1.5">Умения</div>
            <div className="flex flex-col gap-1.5">
              {HERO_ABILITIES.map((a) => {
                const open = a.unlock <= lvl;
                return (
                  <div key={a.id} className={`flex items-center gap-2 bg-[#1f1c29] rounded px-2 py-1.5 ${open ? '' : 'opacity-50'}`}>
                    <span className="text-2xl w-8 text-center">{a.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold">{a.name}</div>
                      <div className="text-xs text-stone-400 leading-tight">
                        {a.desc}. Перезарядка {a.cooldown} с
                      </div>
                    </div>
                    {!open && <span className="text-[11px] text-stone-400 shrink-0">с ур. {a.unlock}</span>}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-black/30 border border-[#2d2938] rounded-lg p-2">
            <div className="font-black text-amber-200 mb-1.5">Снаряжение</div>
            <div className="grid grid-cols-2 gap-1.5 mb-2">
              {slots.map((slot) => {
                const def = HERO_ITEMS.find((d) => d.id === world.equip[slot]);
                return (
                  <div key={slot} className="bg-[#1f1c29] rounded px-2 py-1.5 min-h-[52px]">
                    <div className="text-[11px] text-stone-500">{SLOT_NAMES[slot]}</div>
                    {def ? (
                      <div className="text-sm font-bold leading-tight">
                        {def.icon} {def.name}
                      </div>
                    ) : (
                      <div className="text-sm text-stone-600">пусто</div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="text-xs text-stone-400 mb-1">Найдено (касание — надеть или снять):</div>
            <div className="flex flex-col gap-1">
              {world.items.map((id) => {
                const def = HERO_ITEMS.find((d) => d.id === id);
                if (!def) return null;
                const on = world.equip[def.slot] === id;
                return (
                  <button
                    key={id}
                    onClick={() => onToggle(id)}
                    className={`text-left rounded px-2 py-1 border ${on ? 'border-[#3ed6c4]/70 bg-[#3ed6c4]/10' : 'border-[#2d2938] bg-[#1f1c29] hover:bg-[#2a2635]'}`}
                  >
                    <div className="text-sm font-bold">
                      {def.icon} {def.name} <span className="text-[11px] font-normal text-stone-500">· {SLOT_NAMES[def.slot]}</span>
                      {on && <span className="text-[11px] text-[#3ed6c4]"> · надето</span>}
                    </div>
                    <div className="text-xs text-stone-400 leading-tight">{perkText(def.perks)}. {def.text}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
