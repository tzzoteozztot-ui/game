/**
 * Backpack for «Тёмный рубеж»: bought towers and binders wait here until they are placed.
 * Tap a slot to take the item in hand (tap again to put it back); while it is in hand the header line offers «Продать».
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
  const overflow = items.length > slots; // a purchase that found no free slot
  const inHand = placingSlot !== null && placingSlot < slots ? items[placingSlot] : null;
  return (
    <div className="w-full px-1.5 pb-1.5 bg-[#171520] text-[#f4f2e6] flex flex-col gap-1 shrink-0 select-none">
      {/* Header line: the label, or «Продать» for the item in hand */}
      <div className="h-[var(--h-line)] flex items-center justify-between gap-1 px-0.5 leading-none">
        {/* In a narrow column the label gives way to «Продать» */}
        <span
          className={`text-[length:var(--fs-sm)] uppercase font-semibold tracking-wider text-stone-400 ${
            inHand && placingSlot !== null ? 'hidden @min-[170px]:inline' : ''
          }`}
        >
          Рюкзак
        </span>
        {inHand && placingSlot !== null ? (
          <button
            type="button"
            onClick={() => onSell(placingSlot)}
            title="Продать из рюкзака за столько же, сколько заплатили"
            className="h-full px-1.5 rounded border border-[#383347] bg-[#221f2d] hover:bg-[#2c283a] text-[length:var(--fs-xs)] font-semibold text-stone-200 cursor-pointer whitespace-nowrap ml-auto"
          >
            Продать <span className="text-amber-300 tabular-nums">+{inHand.sell}</span>
          </button>
        ) : overflow ? (
          <span className="text-[length:var(--fs-xs)] font-semibold text-amber-300 truncate">поставьте или замените</span>
        ) : null}
      </div>
      <div className="grid grid-cols-3 gap-1">
      {Array.from({ length: slots }, (_, i) => {
        const item = items[i];
        if (!item) {
          return (
            <div
              key={i}
              className="h-[var(--h-pack,clamp(20px,5.2cqh,44px))] rounded border border-dashed border-[#2d2938] bg-[#121118]/50"
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
            className={`h-[var(--h-pack,clamp(20px,5.2cqh,44px))] rounded border relative flex items-center justify-center cursor-pointer ${
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
    </div>
  );
}
