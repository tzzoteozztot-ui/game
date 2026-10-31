/**
 * Бестиарий: карточка на каждого врага и босса пяти фракций, картинка — спрайт из игры,
 * описание — по лору (данные в src/bestiary.ts).
 */

import React, { useEffect, useState } from 'react';
import { CONFIG } from '../game/config';
import { BESTIARY, BestiaryCreature, KIND_LABELS } from '../bestiary';

/** Картинка существа: спрайт своей фракции, иначе общий; если нет и его — пустое место */
function BeastImage({ creature, factionId }: { creature: BestiaryCreature; factionId: number }) {
  const sources =
    creature.kind === 'boss'
      ? [`boss_${factionId}`]
      : creature.kind === 'imp'
        ? ['enemy_imp', 'enemy_scout']
        : [`enemy_${creature.kind}_${factionId}`, `enemy_${creature.kind}`];
  const [step, setStep] = useState(0);
  useEffect(() => setStep(0), [factionId, creature.kind]);
  if (step >= sources.length) return <div className="w-full h-full" aria-hidden />;
  return (
    <img
      src={`sprites/${sources[step]}.png`}
      alt={creature.name}
      draggable={false}
      onError={() => setStep((n) => n + 1)}
      className="max-h-full max-w-full object-contain drop-shadow-[0_4px_6px_rgba(0,0,0,0.7)]"
    />
  );
}

export function Bestiary({ onClose, initialFaction = 1 }: { onClose: () => void; initialFaction?: number }) {
  const [factionId, setFactionId] = useState(initialFaction);
  const faction = BESTIARY.find((f) => f.id === factionId) ?? BESTIARY[0];
  const conf = CONFIG.factions.find((f) => f.id === faction.id);
  const palette = CONFIG.palettes[faction.id - 1];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 bg-[#121118] text-[#f4f2e6] flex flex-col select-none">
      <div className="shrink-0 flex flex-col short:flex-row short:items-center short:border-b short:border-[#2d2938]">
      <div className="flex items-center gap-2 px-2 sm:px-4 py-2 border-b border-[#2d2938] short:border-b-0 short:pr-0 shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="min-h-[40px] px-3 rounded bg-[#221f2d] hover:bg-[#2c283a] border border-[#383347] text-xs font-bold text-stone-200 cursor-pointer"
        >
          ← Назад
        </button>
        <h2 className="text-base sm:text-xl font-black text-amber-300 tracking-widest uppercase">Бестиарий</h2>
      </div>

      <div className="flex gap-1 overflow-x-auto px-2 sm:px-4 py-2 short:py-1 min-w-0" role="tablist">
        {BESTIARY.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={f.id === faction.id}
            onClick={() => setFactionId(f.id)}
            className={`shrink-0 min-h-[38px] px-3 rounded text-xs font-bold cursor-pointer flex items-center gap-1.5 ${
              f.id === faction.id
                ? 'bg-amber-600 text-stone-950'
                : 'bg-[#221f2d] text-stone-300 hover:bg-[#2c283a] border border-[#383347]'
            }`}
          >
            <span
              className="w-2 h-2 rounded-full border border-black/40"
              style={{ backgroundColor: CONFIG.palettes[f.id - 1].enemies }}
            />
            {f.name}
          </button>
        ))}
      </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-2 sm:px-4 pb-4">
        <div className="max-w-5xl mx-auto flex flex-col gap-3">
          <section className="rounded-lg border border-[#3d384d] bg-[#1a1724] p-3 sm:p-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <h3 className="text-lg font-black text-amber-300">{faction.name}</h3>
              <span className="text-xs text-stone-400">{faction.tagline}</span>
              {conf && (
                <span className="text-[11px] text-stone-500 ml-auto">
                  {conf.id > CONFIG.levelCount ? 'Бесконечный режим и дуэль' : `Карта: ${conf.location}`}
                </span>
              )}
            </div>
            <div className="mt-2 space-y-2 text-[13px] leading-relaxed text-stone-300">
              {faction.lore.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            {conf && (
              <div className="mt-2 pt-2 border-t border-[#262233] text-xs text-stone-400">
                <b className="text-amber-400">{conf.traitName}.</b> {conf.traitDesc}
              </div>
            )}
          </section>

          <div className="grid grid-cols-1 min-[520px]:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
            {faction.creatures.map((c) => {
              const boss = c.kind === 'boss';
              return (
                <article
                  key={c.name}
                  className={`rounded-lg border bg-[#1a1724] overflow-hidden flex flex-col ${
                    boss ? 'border-amber-500/70 min-[520px]:col-span-2 lg:col-span-3 sm:flex-row' : 'border-[#3d384d]'
                  }`}
                >
                  <div
                    className={`shrink-0 flex items-end justify-center p-2 ${boss ? 'h-44 sm:h-56 sm:w-64' : 'h-32 sm:h-36'}`}
                    style={{ background: `radial-gradient(circle at 50% 70%, ${palette.enemies}33, transparent 70%)` }}
                  >
                    <BeastImage creature={c} factionId={faction.id} />
                  </div>
                  <div className="p-3 flex-1 min-w-0">
                    <div className="text-[10px] uppercase font-bold tracking-wider text-amber-500">{KIND_LABELS[c.kind]}</div>
                    <h4 className="font-black text-stone-100 text-sm sm:text-base leading-tight">{c.name}</h4>
                    <div className="mt-1.5 space-y-1.5 text-[13px] leading-relaxed text-stone-300">
                      {c.lore.map((p, i) => (
                        <p key={i}>{p}</p>
                      ))}
                    </div>
                    {boss && conf && (
                      <div className="mt-2 pt-2 border-t border-[#262233] text-xs text-stone-400">
                        <b className="text-amber-400">Способность.</b> {conf.bossDesc}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
