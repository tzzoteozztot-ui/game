/**
 * Backpack for «Тёмный рубеж»: bought towers and binders wait here until they are placed.
 * Tap a slot to take the item in hand (tap again to put it back); while it is in hand the label turns into «Продать».
 */

import { CONFIG, TowerType } from '../game/config';
import { TowerSpriteIcon, BinderIcon } from './Icons';

interface BackpackProps {
  items: { kind: 'tower' | 'binder'; type: TowerType | null; triplet: boolean; sell: number }[];
  slots: number;
  placingSlot: number | null;
  onSelect: (slot: number) => void;
  onSell: (slot: number) => void;
}

export function Backpack({ items, slots, placingSlot, onSelect, onSell }: BackpackProps) {
  const inHand = placingSlot !== null ? items[placingSlot] : null;
  return (
    <div className="w-full px-1.5 pb-1.5 bg-[#171520] text-[#f4f2e6] flex gap-1 shrink-0 select-none">
      {inHand && placingSlot !== null ? (
        <button
          type="button"
          onClick={() => onSell(placingSlot)}
          title="Продать из рюкзака за столько же, сколько заплатили"
          className="w-[22%] h-[var(--h-pack,clamp(34px,8cqh,52px))] rounded border border-[#383347] bg-[#221f2d] hover:bg-[#2c283a] text-[length:var(--fs-xs)] font-semibold text-stone-200 leading-tight cursor-pointer"
        >
          Продать
          <br />
          <span className="text-amber-300 tabular-nums">+{inHand.sell}</span>
        </button>
      ) : (
        <div className="w-[22%] h-[var(--h-pack,clamp(34px,8cqh,52px))] flex items-center justify-center text-[length:var(--fs-xs)] uppercase font-semibold tracking-wider text-stone-400">
          Рюкзак
        </div>
      )}
      {Array.from({ length: slots }, (_, i) => {
        const item = items[i];
        if (!item) {
          return (
            <div
              key={i}
              className="flex-1 h-[var(--h-pack,clamp(34px,8cqh,52px))] rounded border border-dashed border-[#2d2938] bg-[#121118]/50"
            />
          );
        }
        const picked = placingSlot === i;
        const color = item.kind === 'binder' ? CONFIG.binder.color : item.type ? CONFIG.towers[item.type].color : '#fff';
        return (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(i)}
            title={item.kind === 'binder' ? CONFIG.binder.name : `${CONFIG.towers[item.type!].name}${item.triplet ? ' ★' : ''}`}
            className={`flex-1 h-[var(--h-pack,clamp(34px,8cqh,52px))] rounded border relative flex items-center justify-center cursor-pointer ${
              picked ? 'border-amber-400 bg-amber-950/40 ring-1 ring-amber-400' : 'border-[#383347] bg-[#221f2d] hover:bg-[#2c283a]'
            }`}
          >
            {item.triplet && <span className="absolute top-0 right-1 text-amber-400 font-black text-[length:var(--fs-md)] leading-none">★</span>}
            <div className="h-[85%] aspect-square">
              {item.kind === 'binder' ? <BinderIcon size="100%" /> : <TowerSpriteIcon type={item.type!} size="100%" color={color} />}
            </div>
          </button>
        );
      })}
    </div>
  );
}
