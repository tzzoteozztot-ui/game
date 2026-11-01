/**
 * Level Briefing / Pre-Battle Screen for «Тёмный рубеж»
 * Shows map name, faction traits, boss ability, and Start CTA.
 */

import React from 'react';
import { RaceId, CONFIG, stanceText } from '../game/config';

interface LevelBriefingProps {
  level: number;
  faction: number; // whose enemies come: the map's own, or another one picked for endless mode
  race?: RaceId; // the player's faction
  difficulty: 'easy' | 'normal' | 'hard';
  endless: boolean;
  onStartBattle: () => void;
  onBack: () => void;
}

export function LevelBriefing({
  level,
  faction: factionId,
  race = 'humans',
  difficulty,
  endless,
  onStartBattle,
  onBack,
}: LevelBriefingProps) {
  const faction = CONFIG.factions[factionId - 1] ?? CONFIG.factions[level - 1];
  const palette = CONFIG.palettes[faction.id - 1];

  return (
    <div className="fixed inset-0 z-40 bg-[#121118] text-[#f4f2e6] flex flex-col items-center overflow-y-auto p-4 sm:p-6 short:p-2 select-none animate-fade-in">
      {/* my-auto centres the card and lets a low phone screen scroll to its top */}
      {/* On a phone on its side (short) the card has two columns: title and buttons left, faction and boss right */}
      <div className="my-auto max-w-md w-full bg-[#171520] border-2 border-[#3b354a] rounded-xl p-5 sm:p-6 shadow-2xl relative short:max-w-3xl short:p-4 short:grid short:grid-cols-[1fr_1.25fr] short:gap-x-4 short:items-center">
        {/* Level & Region Header */}
        <div className="text-center mb-5 pb-4 border-b border-[#2d2938] short:col-start-1 short:row-start-1 short:mb-3 short:pb-3">
          <div className="text-xs uppercase tracking-widest font-bold text-amber-500 mb-1">
            Рубеж {level} из 5{endless && ' · бесконечный режим'}
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-amber-300 tracking-wide">
            {CONFIG.factions[level - 1].location}
          </h2>
          <div className="text-xs text-stone-400 mt-1">
            Фракция врагов: <strong className="text-stone-200">{faction.name}</strong>
          </div>
          <div className="text-xs text-stone-400 mt-0.5">
            Ваши башни: <strong className="text-stone-200">{CONFIG.races[race].name}</strong>
          </div>
        </div>

        <div className="short:col-start-2 short:row-start-1 short:row-span-2">
        {/* Faction Trait */}
        <div className="bg-[#121118] p-3.5 rounded-lg border border-[#2d2938] mb-3 short:p-3 short:mb-2">
          <div className="text-xs font-bold text-amber-200 flex items-center gap-1.5 mb-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: palette.enemies }} />
            <span>Особенность фракции: {faction.traitName}</span>
          </div>
          <p className="text-xs text-stone-300 leading-relaxed">{faction.traitDesc}</p>
          <p className="text-xs text-stone-400 leading-relaxed mt-1">{stanceText(faction)}</p>
        </div>

        {/* Boss info */}
        <div className="bg-[#121118] p-3.5 rounded-lg border border-[#2d2938] mb-5 short:p-3 short:mb-0">
          <div className="text-xs font-bold text-red-400 flex items-center gap-1.5 mb-1">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span>
              {endless ? 'Босс каждой 12-й волны' : 'Босс 12-й волны'}: {faction.bossName}
            </span>
          </div>
          <p className="text-xs text-stone-300 leading-relaxed">{faction.bossDesc}</p>
          {endless && (
            <p className="text-xs text-stone-400 leading-relaxed mt-1.5">
              Волны идут без конца и с каждой становятся сильнее. Каждые 12 волн врагов становится
              больше, а босс крепче. Между волнами {CONFIG.endless.between} с. Бой идёт, пока стоит
              замок.
            </p>
          )}
        </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2.5 short:col-start-1 short:row-start-2 short:gap-2">
          <button
            type="button"
            data-start="true"
            onClick={onStartBattle}
            className="w-full min-h-[46px] py-2.5 px-4 rounded bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-sm tracking-wider uppercase transition-all shadow-lg shadow-amber-950/50 cursor-pointer active:translate-y-0.5"
          >
            В бой (Пробел / Enter)
          </button>
          <button
            type="button"
            onClick={onBack}
            className="w-full min-h-[40px] py-2 px-4 rounded bg-[#221f2d] hover:bg-[#2c283a] text-stone-300 border border-[#383347] font-semibold text-xs transition-colors cursor-pointer"
          >
            ← Назад в меню
          </button>
        </div>
      </div>
    </div>
  );
}
