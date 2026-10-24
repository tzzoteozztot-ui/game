/**
 * Compact Shop Panel for «Тёмный рубеж»
 * 5 tower cards in a single row, reroll and tier upgrade in one row, start wave button.
 */

import React from 'react';
import { CONFIG, TowerType } from '../game/config';
import { TowerSpriteIcon, GoldIcon } from './Icons';

export interface ShopCard {
  id: string;
  type: TowerType;
  isTriplet: boolean;
}

interface ShopPanelProps {
  cards: (ShopCard | null)[];
  tier: number;
  gold: number;
  placingTowerType: TowerType | null;
  placingIsTriplet: boolean;
  isSpawning: boolean;
  isWaveActive: boolean;
  allWavesLaunched: boolean;
  waveCountdown: number | null;
  earlyStartBonus: number;
  onSelectCard: (index: number) => void;
  onReroll: () => void;
  onUpgradeTier: () => void;
  onStartWave: () => void;
}

export function ShopPanel({
  cards,
  tier,
  gold,
  placingTowerType,
  placingIsTriplet,
  isSpawning,
  isWaveActive,
  allWavesLaunched,
  waveCountdown,
  earlyStartBonus,
  onSelectCard,
  onReroll,
  onUpgradeTier,
  onStartWave,
}: ShopPanelProps) {
  const rerollCost = CONFIG.shop.rerollCost;
  const tierCost = tier < 5 ? CONFIG.shop.tierUpgradeCosts[tier - 1] : null;
  const inHandDef = placingTowerType ? CONFIG.towers[placingTowerType] : null;

  return (
    <div className="w-full p-1.5 bg-[#171520] text-[#f4f2e6] text-xs flex flex-col gap-1 shrink-0 select-none">
      {/* Hand Status / Shop Header Line */}
      <div className="h-4 flex items-center justify-between text-[11px] px-0.5 leading-none shrink-0">
        {inHandDef ? (
          <>
            <span className="text-amber-300 font-bold flex items-center gap-1 truncate">
              <span className="text-stone-400 font-normal">В руке:</span>
              <span>{inHandDef.name}</span>
              {placingIsTriplet && <span className="text-amber-400 font-black">★</span>}
            </span>
            <span className="text-[10px] text-stone-400 shrink-0">тапните клетку</span>
          </>
        ) : (
          <>
            <span className="text-[10px] uppercase font-semibold tracking-wider text-stone-400">Лавка башен</span>
            <span className="text-amber-400 font-bold text-[10px]">Ярус {tier}</span>
          </>
        )}
      </div>

      {/* 5 Cards in One Row (~44px wide each, icon + price, triplet marked with ★, no name) */}
      <div className="grid grid-cols-5 gap-1 shrink-0">
        {cards.map((card, idx) => {
          if (!card) {
            return (
              <div
                key={`empty-${idx}`}
                className="h-11 rounded border border-dashed border-[#2d2938] bg-[#121118]/50 flex items-center justify-center text-stone-700 text-xs shrink-0 select-none"
              >
                —
              </div>
            );
          }

          const baseDef = CONFIG.towers[card.type];
          const cost = card.isTriplet ? baseDef.cost * 3 : baseDef.cost;
          const canAfford = gold >= cost;
          const isSelected = placingTowerType === card.type && placingIsTriplet === card.isTriplet;

          return (
            <button
              key={card.id}
              type="button"
              onClick={() => onSelectCard(idx)}
              title={`${baseDef.name}${card.isTriplet ? ' ★ (Триплет)' : ''} — ${cost} золота (${idx + 1})`}
              className={`h-11 rounded border flex flex-col items-center justify-center relative transition-all cursor-pointer select-none shrink-0 ${
                isSelected
                  ? 'border-amber-400 bg-amber-950/40 ring-1 ring-amber-400 shadow-sm'
                  : canAfford
                  ? 'border-[#383347] bg-[#221f2d] hover:bg-[#2c283a]'
                  : 'border-[#262330] bg-[#181622] opacity-50'
              }`}
            >
              {/* Triplet Star Badge */}
              {card.isTriplet && (
                <span
                  className="absolute -top-1 -right-0.5 text-amber-400 text-xs font-black leading-none drop-shadow"
                  title="Триплет (Ур.2)"
                >
                  ★
                </span>
              )}

              {/* Tower Shape & Color Icon */}
              <div className="w-8 h-[26px] flex items-center justify-center shrink-0">
                <TowerSpriteIcon type={card.type} size={26} color={baseDef.color} />
              </div>

              {/* Price below icon */}
              <div
                className={`flex items-center gap-0.5 font-bold text-[10px] tabular-nums leading-none mt-0.5 ${
                  canAfford ? 'text-amber-300' : 'text-stone-500'
                }`}
              >
                <GoldIcon size={9} />
                <span>{cost}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Reroll & Tier Upgrade in One Line */}
      <div className="grid grid-cols-2 gap-1 h-10 shrink-0">
        {/* Reroll Button */}
        <button
          type="button"
          onClick={onReroll}
          disabled={gold < rerollCost}
          className={`h-10 px-1 rounded border text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer ${
            gold >= rerollCost
              ? 'bg-[#221f2d] hover:bg-[#2c283a] text-stone-200 border-[#383347]'
              : 'bg-[#181622] text-stone-600 border-[#262330] cursor-not-allowed'
          }`}
          title="Обновить лавку (R)"
        >
          <span>Обновить</span>
          <span className="text-amber-300 tabular-nums font-bold">({rerollCost})</span>
        </button>

        {/* Tier Upgrade Button */}
        <button
          type="button"
          onClick={onUpgradeTier}
          disabled={tier >= 5 || (tierCost !== null && gold < tierCost)}
          className={`h-10 px-1 rounded border text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer ${
            tier < 5 && tierCost !== null && gold >= tierCost
              ? 'bg-[#221f2d] hover:bg-[#2c283a] text-stone-200 border-[#383347]'
              : 'bg-[#181622] text-stone-600 border-[#262330] cursor-not-allowed'
          }`}
          title="Поднять ярус лавки (U)"
        >
          {tier >= 5 ? (
            <span>Ярус 5 (макс)</span>
          ) : (
            <>
              <span>Ярус {tier}→{tier + 1}</span>
              <span className="text-amber-300 tabular-nums font-bold">({tierCost})</span>
            </>
          )}
        </button>
      </div>

      {/* Full-width Wave Button */}
      <button
        type="button"
        onClick={onStartWave}
        disabled={isSpawning || allWavesLaunched}
        className={`h-10 w-full px-2 rounded font-bold text-xs tracking-wide transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer shrink-0 ${
          isSpawning || allWavesLaunched
            ? 'bg-[#221f2d] text-stone-500 border border-[#2d2938] cursor-not-allowed'
            : 'bg-amber-600 hover:bg-amber-500 text-stone-950 font-black border border-amber-400/50 shadow-amber-950/40 active:translate-y-0.5'
        }`}
        title="Начать волну (Пробел)"
      >
        {allWavesLaunched ? (
          <span>Последняя волна</span>
        ) : isSpawning ? (
          <span>Враги выходят...</span>
        ) : waveCountdown !== null ? (
          <>
            <span>Волна через {waveCountdown} с</span>
            {earlyStartBonus > 0 && <span className="tabular-nums">· сейчас +{earlyStartBonus}</span>}
          </>
        ) : isWaveActive ? (
          <span>Следующая (+{earlyStartBonus})</span>
        ) : (
          <span>Начать волну</span>
        )}
      </button>
    </div>
  );
}
