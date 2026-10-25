/**
 * Shop Panel for «Тёмный рубеж»
 * 5 large tower cards in a 3-column grid with the reroll button as the 6th cell, tier upgrade below.
 * The wave button is over the field (FieldHud).
 */

import React from 'react';
import { CONFIG, TowerType } from '../game/config';
import { TowerSpriteIcon, GoldIcon, BinderIcon } from './Icons';

export interface ShopCard {
  id: string;
  type: TowerType | 'binder'; // 'binder' is the rare «Связка» card
  isTriplet: boolean;
}

interface ShopPanelProps {
  cards: (ShopCard | null)[];
  tier: number;
  gold: number;
  rerollCost: number; // grows with each reroll during a wave
  placingTowerType: TowerType | null;
  placingBinder: boolean;
  placingIndex: number | null; // card being placed
  isBinding: boolean;
  isMoving: boolean; // a tower is selected in the pause between waves
  placingIsTriplet: boolean;
  onSelectCard: (index: number) => void;
  onReroll: () => void;
  onUpgradeTier: () => void;
}

export function ShopPanel({
  cards,
  tier,
  gold,
  rerollCost,
  placingTowerType,
  placingBinder,
  placingIndex,
  isBinding,
  isMoving,
  placingIsTriplet,
  onSelectCard,
  onReroll,
  onUpgradeTier,
}: ShopPanelProps) {
  const tierCost = tier < 5 ? CONFIG.shop.tierUpgradeCosts[tier - 1] : null;
  const inHandDef = placingTowerType ? CONFIG.towers[placingTowerType] : null;

  return (
    <div className="w-full p-1.5 bg-[#171520] text-[#f4f2e6] text-[length:var(--fs-md)] flex flex-col gap-1 shrink-0 select-none">
      {/* Hand Status / Shop Header Line */}
      <div className="h-[var(--h-line)] flex items-center justify-between gap-1 text-[length:var(--fs-md)] px-0.5 leading-none shrink-0">
        {isBinding ? (
          <>
            <span className="font-bold truncate" style={{ color: CONFIG.binder.color }}>Связка</span>
            <span className="text-[length:var(--fs-sm)] text-stone-400 shrink-0">тапните вторую башню</span>
          </>
        ) : placingBinder ? (
          <>
            <span className="font-bold flex items-center gap-1 truncate" style={{ color: CONFIG.binder.color }}>
              <span className="text-stone-400 font-normal">В руке:</span>
              <span>{CONFIG.binder.name}</span>
            </span>
            <span className="text-[length:var(--fs-sm)] text-stone-400 shrink-0">тапните клетку</span>
          </>
        ) : isMoving && !inHandDef && !placingBinder ? (
          <>
            <span className="text-amber-300 font-bold shrink-0">Перестановка</span>
            <span className="text-[length:var(--fs-sm)] text-stone-400 truncate">тапните свободную клетку</span>
          </>
        ) : inHandDef ? (
          <>
            <span className="text-amber-300 font-bold flex items-center gap-1 truncate">
              <span className="text-stone-400 font-normal">В руке:</span>
              <span>{inHandDef.name}</span>
              {placingIsTriplet && <span className="text-amber-400 font-black">★</span>}
            </span>
            <span className="text-[length:var(--fs-sm)] text-stone-400 shrink-0">тапните клетку</span>
          </>
        ) : (
          <>
            <span className="text-[length:var(--fs-sm)] uppercase font-semibold tracking-wider text-stone-400">Лавка башен</span>
            <span className="text-amber-400 font-bold text-[length:var(--fs-sm)]">Ярус {tier}</span>
          </>
        )}
      </div>

      {/* 5 cards and the reroll button in a 3×2 grid (big icon + price, triplet marked with ★) */}
      <div className="grid grid-cols-3 gap-1 shrink-0">
        {cards.map((card, idx) => {
          if (!card) {
            return (
              <div
                key={`empty-${idx}`}
                className="h-[var(--h-card)] rounded border border-dashed border-[#2d2938] bg-[#121118]/50 flex items-center justify-center text-stone-700 text-[length:var(--fs-md)] shrink-0 select-none"
              >
                —
              </div>
            );
          }

          if (card.type === 'binder') {
            const canAffordBinder = gold >= CONFIG.binder.cost;
            const isPicked = placingBinder && placingIndex === idx;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => onSelectCard(idx)}
                title={`${CONFIG.binder.name}: связывает две башни разных видов в одну — ${CONFIG.binder.cost} золота (${idx + 1})`}
                className={`h-[var(--h-card)] rounded border flex flex-col items-center justify-center relative transition-all cursor-pointer select-none shrink-0 ${
                  isPicked
                    ? 'border-[#3ed6c4] bg-teal-950/40 ring-1 ring-[#3ed6c4] shadow-sm'
                    : canAffordBinder
                    ? 'border-[#3ed6c4]/60 bg-[#1d2a2c] hover:bg-[#233436]'
                    : 'border-[#262330] bg-[#181622] opacity-50'
                }`}
              >
                <div className="w-full h-[calc(var(--h-card)-var(--fs-md)-10px)] flex items-center justify-center shrink-0">
                  <BinderIcon size="100%" />
                </div>
                <div
                  className={`flex items-center gap-0.5 font-bold text-[length:var(--fs-md)] tabular-nums leading-none mt-1 ${
                    canAffordBinder ? 'text-amber-300' : 'text-stone-500'
                  }`}
                >
                  <GoldIcon size="0.95em" />
                  <span>{CONFIG.binder.cost}</span>
                </div>
              </button>
            );
          }

          const baseDef = CONFIG.towers[card.type];
          const cost = card.isTriplet ? baseDef.cost * 3 : baseDef.cost;
          const canAfford = gold >= cost;
          const isSelected = placingTowerType === card.type && placingIndex === idx;

          return (
            <button
              key={card.id}
              type="button"
              onClick={() => onSelectCard(idx)}
              title={`${baseDef.name}${card.isTriplet ? ' ★ (Триплет)' : ''} — ${cost} золота (${idx + 1})`}
              className={`h-[var(--h-card)] rounded border flex flex-col items-center justify-center relative transition-all cursor-pointer select-none shrink-0 ${
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
                  className="absolute top-0.5 right-1 text-amber-400 text-[length:var(--fs-lg)] font-black leading-none drop-shadow"
                  title="Триплет (Ур.2)"
                >
                  ★
                </span>
              )}

              {/* Tower Shape & Color Icon */}
              <div className="w-full h-[calc(var(--h-card)-var(--fs-md)-10px)] flex items-center justify-center shrink-0">
                <TowerSpriteIcon type={card.type} size="100%" color={baseDef.color} />
              </div>

              {/* Price below icon */}
              <div
                className={`flex items-center gap-0.5 font-bold text-[length:var(--fs-md)] tabular-nums leading-none mt-1 ${
                  canAfford ? 'text-amber-300' : 'text-stone-500'
                }`}
              >
                <GoldIcon size="0.95em" />
                <span>{cost}</span>
              </div>
            </button>
          );
        })}
        <button
          type="button"
          onClick={onReroll}
          disabled={gold < rerollCost}
          className={`h-[var(--h-card)] px-1 rounded border text-[length:var(--fs-md)] font-semibold flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
            gold >= rerollCost
              ? 'bg-[#221f2d] hover:bg-[#2c283a] text-stone-200 border-[#383347]'
              : 'bg-[#181622] text-stone-600 border-[#262330] cursor-not-allowed'
          }`}
          title="Обновить лавку (R)"
        >
          <span className="text-[length:var(--fs-lg)] leading-none">↻</span>
          <span>Обновить</span>
          <span className="flex items-center gap-0.5 text-amber-300 tabular-nums font-bold leading-none">
            <GoldIcon size="0.95em" />
            {rerollCost}
          </span>
        </button>
      </div>

      {/* Tier Upgrade Button */}
      <button
        type="button"
        onClick={onUpgradeTier}
        disabled={tier >= 5 || (tierCost !== null && gold < tierCost)}
        className={`h-[var(--h-tier,clamp(36px,9cqh,56px))] w-full px-1 rounded border text-[length:var(--fs-md)] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer shrink-0 ${
          tier < 5 && tierCost !== null && gold >= tierCost
            ? 'bg-[#221f2d] hover:bg-[#2c283a] text-stone-200 border-[#383347]'
            : 'bg-[#181622] text-stone-600 border-[#262330] cursor-not-allowed'
        }`}
        title="Поднять ярус лавки (U)"
      >
        {tier >= 5 ? (
          <span>Ярус лавки 5 (макс)</span>
        ) : (
          <>
            <span>Ярус лавки {tier}→{tier + 1}</span>
            <span className="flex items-center gap-0.5 text-amber-300 tabular-nums font-bold">
              <GoldIcon size="0.95em" />
              {tierCost}
            </span>
          </>
        )}
      </button>
    </div>
  );
}
