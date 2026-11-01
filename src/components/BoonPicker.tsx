/**
 * «Потасовка»: after every 3rd wave the artifact takes one boon of three (просьба Артура 2026-11-01).
 * The battle goes on meanwhile, so the card is small and sits under the wave line; only its buttons take taps.
 */

import type { BoonDef } from '../game/config';

export function BoonPicker({ offer, onChoose }: { offer: BoonDef[]; onChoose: (id: string) => void }) {
  return (
    <div className="absolute left-[37%] top-[16%] -translate-x-1/2 z-20 pointer-events-none w-[min(66%,520px)]">
      <div className="pointer-events-auto rounded-lg border border-[#c9a2ff]/50 bg-[#15111f]/90 backdrop-blur-[2px] p-2 shadow-lg shadow-black/50">
        <div className="text-center text-[#d9c2ff] font-bold text-sm mb-1.5">Усиление артефакта — выберите одно</div>
        <div className="grid grid-cols-3 gap-1.5">
          {offer.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => onChoose(b.id)}
              className="min-h-[56px] rounded border border-[#c9a2ff]/40 bg-[#241a36]/80 hover:bg-[#33244d] active:translate-y-0.5 px-1.5 py-1 text-left cursor-pointer transition-colors"
            >
              <div className="text-[#e8d6ff] font-bold text-xs leading-tight">{b.name}</div>
              <div className="text-stone-300 text-[11px] leading-tight mt-0.5">{b.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
